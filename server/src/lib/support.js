// Live support: a chat per player. A smart assistant answers at once from the player's own account (deposits,
// withdrawals, bets, bonus, ID, promo codes, agent link…); "Talk to a person" hands the chat to the team, who answer
// from the admin portal (Support) with the player's account next to the chat.
//
// Thread status: bot (the assistant answers) > waiting (asked for a person) > open (an admin replied) > closed.
// A message after "closed" starts a new chat with the assistant.
import { q } from '../db/pool.js';
import { getSetting, setSetting } from './settings.js';
import { bonusesOf } from './bonus.js';
import { notifyAdmins } from '../emails/index.js';

const CUR = { GH: 'GHS ', NG: 'NGN ' };   // plain letters: safe in any database encoding
const money = (v, cc) => `${CUR[cc] || ''}${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = d => { const s = Math.max(0, (Date.now() - new Date(d)) / 1000); return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const first = u => String(u.full_name || '').trim().split(/\s+/)[0] || '';
const CHIPS = ['My deposit', 'My withdrawal', 'My bets', 'Bonus', 'Talk to a person'];
const ONLINE_MS = 3 * 60000;

/* ---------------- presence: is someone from the team on the Support page? ---------------- */
export async function staffOnline() {
  const p = await getSetting('support_presence').catch(() => null);
  return !!(p && Date.now() - p.at < ONLINE_MS);
}
export async function touchPresence(admin) {
  const p = await getSetting('support_presence').catch(() => null);
  if (!p || Date.now() - p.at > 30000) await setSetting('support_presence', { at: Date.now(), by: admin.id, name: first(admin) || 'Support' });
}

/* ---------------- threads ---------------- */
async function openThread(userId) {
  const { rows } = await q(`SELECT * FROM support_threads WHERE user_id=$1 AND status <> 'closed' ORDER BY id DESC LIMIT 1`, [userId]);
  return rows[0] || null;
}
async function newThread(userId) {
  return (await q(`INSERT INTO support_threads (user_id) VALUES ($1) RETURNING *`, [userId])).rows[0];
}
async function add(threadId, sender, body, meta = null, staffId = null) {
  const { rows } = await q(`INSERT INTO support_messages (thread_id, sender, body, meta, staff_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, sender, body, meta, created_at`,
    [threadId, sender, String(body).slice(0, 4000), meta, staffId]);
  const unread = sender === 'user' ? 'staff_unread = staff_unread + 1' : sender === 'staff' ? 'user_unread = user_unread + 1' : null;
  await q(`UPDATE support_threads SET last_at=now()${unread ? ', ' + unread : ''} WHERE id=$1`, [threadId]);
  return shapeMsg(rows[0]);
}
const shapeMsg = m => ({ id: Number(m.id), from: m.sender, text: m.body, chips: m.meta && m.meta.chips || null, name: m.meta && m.meta.name || null, at: m.created_at });
async function messages(threadId, after = 0) {
  const { rows } = await q(`SELECT id, sender, body, meta, created_at FROM support_messages WHERE thread_id=$1 AND id > $2 AND NOT coalesce((meta->>'hidden')::boolean, false) ORDER BY id LIMIT 200`, [threadId, after]);
  return rows.map(shapeMsg);
}
const shapeThread = t => t && ({ id: Number(t.id), status: t.status, unread: t.user_unread, staff: t.staff_name || null });

/** The player's chat: the open thread (or none yet) and its messages. */
export async function view(user, after = 0) {
  const t = await openThread(user.id);
  const online = await staffOnline();
  if (!t) return { thread: null, messages: [], online, greeting: greeting(user, online) };
  const name = t.assigned_to ? (await q('SELECT full_name FROM users WHERE id=$1', [t.assigned_to])).rows[0] : null;
  return { thread: shapeThread({ ...t, staff_name: name ? first(name) || 'Support' : null }), messages: await messages(t.id, after), online };
}
export async function markRead(user) { await q(`UPDATE support_threads SET user_unread=0 WHERE user_id=$1 AND user_unread > 0`, [user.id]); }
export async function unread(user) {
  const { rows } = await q(`SELECT coalesce(sum(user_unread),0)::int AS n FROM support_threads WHERE user_id=$1`, [user.id]);
  return rows[0].n;
}

function greeting(user, online) {
  return { from: 'bot', text: `Hi${first(user) ? ' ' + first(user) : ''}! I'm the LetBetAfrika assistant. I can check your deposits, withdrawals, bets and bonus right now – just ask, or pick a topic. ${online ? 'Our team is online if you need a person.' : 'If you need a person, leave a message and our team replies here.'}`, chips: CHIPS };
}

/** A message from the player: stored; while the assistant has the chat it answers straight away. */
export async function say(user, text) {
  text = String(text || '').trim().slice(0, 2000);
  if (!text) throw Object.assign(new Error('empty'), { status: 400 });
  const { rows: rl } = await q(`SELECT count(*)::int AS n FROM support_messages m JOIN support_threads t ON t.id=m.thread_id WHERE t.user_id=$1 AND m.sender='user' AND m.created_at > now() - interval '1 minute'`, [user.id]);
  if (rl[0].n >= 15) throw Object.assign(new Error('slow_down'), { status: 429 });
  let t = await openThread(user.id);
  const fresh = !t;
  if (!t) t = await newThread(user.id);
  const out = [];
  if (fresh) { const g = greeting(user, await staffOnline()); out.push(await add(t.id, 'bot', g.text, { chips: g.chips })); }
  out.push(await add(t.id, 'user', text));
  if (t.status === 'bot') {
    const intent = detect(text);
    if (intent === 'human') out.push(...await handoff(user, t));
    else {
      const a = await answer(user, intent, t);
      out.push(await add(t.id, 'bot', a.text, { chips: a.chips || CHIPS }));
      if (a.handoff) out.push(...await handoff(user, t, true));
    }
  }
  return { thread: shapeThread((await q('SELECT * FROM support_threads WHERE id=$1', [t.id])).rows[0]), messages: out };
}

/** Hand the chat to the team. */
export async function handoff(user, t, auto) {
  if (!t) t = await openThread(user.id) || await newThread(user.id);
  if (t.status !== 'bot') return [];
  await q(`UPDATE support_threads SET status='waiting', staff_unread = greatest(staff_unread, 1), last_at=now() WHERE id=$1`, [t.id]);
  const online = await staffOnline();
  const msg = await add(t.id, 'system', online
    ? `${auto ? 'Let me get you a person. ' : ''}A support agent will join this chat shortly – keep this page open or come back here any time.`
    : `${auto ? 'Let me get you a person. ' : ''}Our team is not online right now. Your message is saved – we reply here as soon as we are back, and you will see a badge on Me.`);
  notifyAdmins('support', { id: t.id, amount: 0, method: 'Live chat' }, user, { account: 'Live chat' }).catch(() => {});
  return [msg];
}

/* ---------------- the assistant ---------------- */
const INTENTS = [
  ['human', /\b(talk|speak|chat)\s+(to|with)\s+(a\s+|an\s+|the\s+)?(person|human|someone|agent|staff|team|support|customer)|\bhuman\b|real person|customer (care|service)|call me\b|\badmin\b/],
  ['withdraw', /withdr|cash ?out\b|payout|pay ?me\b|send (me )?my money|my money\b/],
  ['deposit', /deposit|top.?up|\bfund|\bload\b|not (been )?credited|didn.?t (reflect|credit|show)|momo|payment/],
  ['bonus', /bonus|free ?bet|welcome|turnover|wager/],
  ['promo', /promo|voucher|\bcode\b/],
  ['bet', /\bbets?\b|ticket|betslip|\bslip\b|\bwon\b|\bwin\b|\blost\b|settle|cashout|odds/],
  ['verify', /verif|\bid\b|kyc|ghana ?card|passport|identity|\bnin\b|\bbvn\b/],
  ['password', /password|forgot|reset|log ?in|sign ?in|locked|otp|code (not|never)/],
  ['agent', /\bagent\b|commission|referr|\brefer\b|my link/],
  ['virtual', /virtual|league|round/],
  ['limits', /limit|self.?exclu|take a break|addict|responsib/],
  ['greet', /^(hi|hello|hey|hy|good (morning|afternoon|evening)|morning|evening|yo|sup|bro)\b/],
  ['thanks', /thank|thx|\bok(ay)?\b|great|solved|sorted|cool/],
];
export function detect(text) {
  const s = ' ' + String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ?']+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  for (const [k, re] of INTENTS) if (re.test(s.trim())) return k;
  return 'unknown';
}

async function answer(user, intent, t) {
  const cc = user.country, m = v => money(v, cc);
  switch (intent) {
    case 'greet': return { text: `Hi${first(user) ? ' ' + first(user) : ''}! What can I help you with? I can see your deposits, withdrawals, bets and bonus.` };
    case 'thanks': return { text: 'You are welcome! Anything else? Pick a topic below or just type it.' };
    case 'deposit': {
      const { rows } = await q(`SELECT amount, status, method, created_at, details->>'reason' AS reason FROM payments WHERE user_id=$1 AND kind='deposit' ORDER BY created_at DESC LIMIT 1`, [user.id]);
      const d = rows[0];
      const how = cc === 'GH' ? 'Me > Deposit > Mobile Money: enter the amount, approve the prompt on your phone with your MoMo PIN, and it is credited automatically once MoMo confirms.' : 'Me > Deposit > Bank transfer: pay into the account shown with your reference; it is credited once the money arrives.';
      if (!d) return { text: `You have not made a deposit yet. ${how}` };
      if (d.status === 'success') return { text: `Your last deposit of ${m(d.amount)} was credited (${ago(d.created_at)}). ${how}` };
      if (d.status === 'failed' || d.status === 'rejected') return { text: `Your last deposit of ${m(d.amount)} (${ago(d.created_at)}) did not go through${d.reason ? ': ' + d.reason : ''}. No money was taken for it on our side. You can try again – ${how}` };
      const age = (Date.now() - new Date(d.created_at)) / 60000;
      if (age < 15) return { text: `Your deposit of ${m(d.amount)} (${ago(d.created_at)}) is waiting for confirmation. ${cc === 'GH' ? 'Approve the MoMo prompt on your phone if you have not yet – it is credited automatically the moment MoMo confirms, usually within a minute.' : 'It is credited as soon as the transfer arrives.'}` };
      return { text: `Your deposit of ${m(d.amount)} (${ago(d.created_at)}) has not been confirmed yet. If the money left your wallet, I will pass this to our team now – please send the transaction ID from your ${cc === 'GH' ? 'MoMo SMS' : 'bank'} here.`, handoff: true };
    }
    case 'withdraw': {
      const { rows } = await q(`SELECT amount, status, provider, created_at, details->>'reason' AS reason FROM payments WHERE user_id=$1 AND kind='withdrawal' ORDER BY created_at DESC LIMIT 1`, [user.id]);
      const w = rows[0];
      const how = `Me > Withdraw: choose ${cc === 'GH' ? 'Mobile Money' : 'your bank'}, enter the amount and confirm.`;
      if (!w) return { text: `You have not made a withdrawal yet. ${how}${user.is_agent ? ' As an agent you do not need ID verification and your withdrawals are sent automatically.' : ''}` };
      if (w.status === 'success') return { text: `Your last withdrawal of ${m(w.amount)} was paid (${ago(w.created_at)}). ${how}` };
      if (w.status === 'rejected' || w.status === 'failed') return { text: `Your withdrawal of ${m(w.amount)} (${ago(w.created_at)}) was not paid${w.reason ? ': ' + w.reason : ''}. The money went back to your balance, so you can withdraw again.` };
      if (w.provider && w.provider !== 'manual') return { text: `Your withdrawal of ${m(w.amount)} has been sent to your wallet (${ago(w.created_at)}). It normally arrives within a few minutes.` };
      return { text: `Your withdrawal of ${m(w.amount)} (${ago(w.created_at)}) is with our team for the usual account check and is paid as soon as it is approved – normally within a few hours. If it is urgent, tap Talk to a person.` };
    }
    case 'bonus': {
      const bs = await bonusesOf(user.id).catch(() => []);
      const act = (bs || []).filter(b => b.status === 'active');
      if (!act.length) return { text: `You have no active bonus. New players get a 200% welcome bonus on their first deposit; promo codes go in Me > Promo code.` };
      return { text: act.map(b => `${b.kind === 'welcome' ? 'Welcome bonus' : 'Bonus ' + String(b.kind).replace(/^promo:/, '')}: ${m(b.amount)} – staked ${m(b.wagered)} of ${m(b.required)}${b.expiresAt ? `, until ${new Date(b.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`).join(' ') + ' It moves to your balance once the staking is done.' };
    }
    case 'bet': {
      const { rows: open } = await q(`SELECT count(*)::int AS n, coalesce(sum(potential),0) AS pot FROM bets WHERE user_id=$1 AND status='open'`, [user.id]);
      const { rows: last } = await q(`SELECT id, status, stake, paid, settled_at FROM bets WHERE user_id=$1 AND status <> 'open' ORDER BY settled_at DESC NULLS LAST LIMIT 1`, [user.id]);
      const o = open[0], l = last[0];
      const parts = [o.n ? `You have ${o.n} open ticket${o.n > 1 ? 's' : ''} (possible win ${m(o.pot)}).` : 'You have no open tickets.'];
      if (l) parts.push(`Your last settled ticket ${l.id} ${l.status === 'won' ? `won – ${m(l.paid)} was paid to your balance` : l.status === 'lost' ? 'lost' : l.status === 'cashout' ? `was cashed out for ${m(l.paid)}` : `was ${l.status}${l.paid ? ` (${m(l.paid)} returned)` : ''}`} (${ago(l.settled_at)}).`);
      parts.push('Winnings are paid automatically when the match ends; see Open Bets for every ticket.');
      return { text: parts.join(' ') };
    }
    case 'promo': return { text: 'Promo codes: Me > Promo code, type the code and tap Redeem. Each code works once per player, and some need a deposit first.' };
    case 'verify': {
      if (user.is_agent) return { text: 'Agent accounts do not need ID verification – you can withdraw straight away.' };
      if (user.verified) return { text: 'Your account is verified – nothing else is needed.' };
      const k = user.limits && user.limits.kyc;
      if (k && k.status === 'pending') return { text: 'We are checking your ID – usually within 24 hours. You will see it on Me > Verify ID.' };
      if (k && k.status === 'rejected') return { text: `Your last ID check was not approved${k.reason ? ': ' + k.reason : ''}. Send it again in Me > Verify ID with clear photos of the front and back.` };
      return { text: `Verify your ID in Me > Verify ID: your details as on your ${cc === 'GH' ? 'Ghana Card' : 'ID'} and a photo of the front and the back (all four corners, no glare). It takes about 2 minutes and our team checks it, usually within 24 hours.` };
    }
    case 'password': return { text: 'Forgot your password? On the login screen tap "Forgot password", enter your number or email, and set a new password with the 6-digit code we send you. If the code does not arrive, wait a minute and tap Resend.' };
    case 'agent': {
      if (user.is_agent) return { text: 'Your agent link and earnings are in Me > Agent Dashboard. Players who sign up with your link are yours; request a payout there when an earning is ready.' };
      return { text: 'Agents are appointed by our team. If you want to bring players and earn commission, tap Talk to a person and tell us.' };
    }
    case 'virtual': return { text: 'Virtual League: a new round every 2 minutes. Bet before kick-off, or bet live while the matches play – the odds move with every minute, and betting pauses for a moment after each goal. Winnings are paid at full time.' };
    case 'limits': return { text: 'You can set deposit limits, reminders or take a break any time in Me > Responsible Gambling. If you need help, tap Talk to a person.' };
    default: {
      const { rows } = await q(`SELECT count(*)::int AS n FROM support_messages WHERE thread_id=$1 AND sender='bot' AND meta->>'unknown' = 'true'`, [t.id]);
      if (rows[0].n >= 1) return { text: 'I could not answer that one – let me get you a person.', handoff: true };
      await q(`INSERT INTO support_messages (thread_id, sender, body, meta) VALUES ($1, 'bot', '', '{"unknown": true, "hidden": true}')`, [t.id]).catch(() => {});
      return { text: 'I am not sure I understood. Pick a topic below, or tap Talk to a person and our team will help.' };
    }
  }
}

/* ---------------- the team (admin portal) ---------------- */
export async function inbox(status) {
  const where = status === 'all' ? '' : status === 'closed' ? `WHERE t.status='closed'` : `WHERE t.status <> 'closed'`;
  const { rows } = await q(`SELECT t.id, t.status, t.staff_unread, t.last_at, t.created_at, u.id AS user_id, u.uid, u.full_name, u.phone, u.email, u.country, u.is_agent,
      (SELECT body FROM support_messages m WHERE m.thread_id=t.id AND m.body <> '' ORDER BY m.id DESC LIMIT 1) AS last
    FROM support_threads t JOIN users u ON u.id=t.user_id ${where}
    ORDER BY (t.status='waiting') DESC, t.staff_unread > 0 DESC, t.last_at DESC LIMIT 200`);
  return rows;
}
export async function waitingCount() {
  const { rows } = await q(`SELECT count(*)::int AS n FROM support_threads WHERE status='waiting' OR (status='open' AND staff_unread > 0)`);
  return rows[0].n;
}
export async function thread(id, after = 0) {
  const { rows } = await q(`SELECT t.*, u.uid, u.full_name, u.phone, u.email, u.country, u.balance, u.verified, u.is_agent, u.status AS ustatus, u.created_at AS joined, u.limits->'kyc'->>'status' AS kyc,
      (SELECT coalesce(sum(amount),0) FROM payments WHERE user_id=u.id AND kind='deposit' AND status='success') AS deposited,
      (SELECT coalesce(sum(amount),0) FROM payments WHERE user_id=u.id AND kind='withdrawal' AND status='success') AS withdrawn
    FROM support_threads t JOIN users u ON u.id=t.user_id WHERE t.id=$1`, [id]);
  const t = rows[0]; if (!t) return null;
  const [pays, bets, open] = await Promise.all([
    q(`SELECT id, kind, amount, status, method, provider, created_at, details->>'reason' AS reason, details->>'account' AS account FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`, [t.user_id]),
    q(`SELECT id, status, stake, potential, paid, placed_at FROM bets WHERE user_id=$1 ORDER BY placed_at DESC LIMIT 5`, [t.user_id]),
    q(`SELECT count(*)::int AS n FROM bets WHERE user_id=$1 AND status='open'`, [t.user_id]),
  ]);
  const { rows: msgs } = await q(`SELECT id, sender, body, meta, created_at FROM support_messages WHERE thread_id=$1 AND id > $2 AND NOT coalesce((meta->>'hidden')::boolean, false) ORDER BY id`, [id, after]);
  return {
    thread: { id: Number(t.id), status: t.status, unread: t.staff_unread, created: t.created_at },
    player: { id: t.user_id, uid: t.uid, name: t.full_name, phone: t.phone, email: t.email, country: t.country, balance: Number(t.balance), verified: t.verified, kyc: t.kyc, isAgent: t.is_agent, status: t.ustatus, joined: t.joined, openBets: open.rows[0].n, deposited: Number(t.deposited), withdrawn: Number(t.withdrawn) },
    payments: pays.rows, bets: bets.rows, messages: msgs.map(shapeMsg),
  };
}
export async function staffRead(id) { await q(`UPDATE support_threads SET staff_unread=0 WHERE id=$1`, [id]); }
export async function reply(id, admin, text) {
  text = String(text || '').trim().slice(0, 4000);
  if (!text) throw Object.assign(new Error('empty'), { status: 400 });
  const { rows } = await q(`UPDATE support_threads SET status='open', assigned_to=$2, staff_unread=0 WHERE id=$1 AND status <> 'closed' RETURNING id`, [id, admin.id]);
  if (!rows[0]) throw Object.assign(new Error('closed'), { status: 409 });
  return add(id, 'staff', text, { name: first(admin) || 'Support' }, admin.id);
}
export async function close(id, admin) {
  const { rows } = await q(`UPDATE support_threads SET status='closed', staff_unread=0 WHERE id=$1 AND status <> 'closed' RETURNING id`, [id]);
  if (!rows[0]) throw Object.assign(new Error('closed'), { status: 409 });
  return add(id, 'system', `${first(admin) || 'Support'} closed this chat. Need anything else? Just type here.`);
}
