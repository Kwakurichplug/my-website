// Every email the platform sends. Each template returns { subject, preheader, html, text }.
// Data shapes are documented in EMAILS.md.
import { wrap, h1, p, small, amount, details, button, steps, note, code, legs, divider, money, fmtDate, text, BRAND as B } from './layout.js';

const site = B.site;
const first = u => (u.fullName || '').split(' ')[0] || 'there';
const ref = id => String(id).slice(0, 8).toUpperCase();

export const templates = {
  /* ---------------- Account ---------------- */
  welcome: ({ user }) => ({
    subject: 'Welcome to LetBetAfrika',
    preheader: 'Your account is ready. Make your first deposit to unlock your 200% welcome bonus.',
    html: wrap({ cc: user.country, title: 'Welcome', body:
      h1(`Welcome, ${first(user)}`) +
      p('Your LetBetAfrika account is ready. You can bet on live and upcoming matches, play virtuals and enter the weekly jackpot.') +
      details([['Account ID', String(user.uid), { bold: true }], user.phone ? ['Phone', `+${user.country === 'GH' ? '233' : '234'} ${user.phone}`] : ['Email', user.email], ['Currency', user.country === 'GH' ? 'Ghana cedi (GH₵)' : 'Nigerian naira (₦)']]) +
      note(`<b>200% welcome bonus.</b> Deposit now and we triple it, up to ${money(user.country === 'GH' ? 1000 : 100000, user.country)}.`, 'success') +
      button('Make your first deposit', `${site}/#/me`) +
      small('Please keep your password private. We will never ask for it by phone, SMS or email.') }),
    text: text([`Welcome, ${first(user)}.`, `Your account ID is ${user.uid}.`, `Deposit now to unlock your 200% welcome bonus: ${site}`]),
  }),

  otp: ({ user, code: c, purpose }) => ({
    subject: `${c} is your LetBetAfrika code`,
    preheader: 'This code expires in 10 minutes.',
    html: wrap({ cc: user.country, title: 'Your code', body:
      h1(purpose === 'reset' ? 'Reset your password' : 'Confirm your email') +
      p('Enter this code in the app. It expires in 10 minutes.') +
      code(c) +
      small('If you did not request this code, you can ignore this email. Never share it – LetBetAfrika staff will never ask for it.') }),
    text: text([`Your LetBetAfrika code is ${c}.`, 'It expires in 10 minutes.']),
  }),

  passwordChanged: ({ user, when, ip }) => ({
    subject: 'Your password was changed',
    preheader: 'If this was not you, secure your account now.',
    html: wrap({ cc: user.country, title: 'Password changed', body:
      h1('Your password was changed') +
      p(`Hi ${first(user)}, the password on your account was changed on ${fmtDate(when)}.`) +
      details([['Account ID', String(user.uid)], ['Time', fmtDate(when)], ['Location', ip || 'Unknown']]) +
      note('<b>Was this not you?</b> Reset your password straight away and contact support.', 'warn') +
      button('Secure my account', `${site}/#/acct/security`) }),
    text: text([`Your password was changed on ${fmtDate(when)}.`, `If this was not you, reset it now: ${site}/#/acct/security`]),
  }),

  newDevice: ({ user, when, device, ip }) => ({
    subject: 'New login to your account',
    preheader: `Signed in from ${device || 'a new device'}.`,
    html: wrap({ cc: user.country, title: 'New login', body:
      h1('New login to your account') +
      p(`We noticed a login from a device we have not seen before.`) +
      details([['Device', device || 'Unknown'], ['Time', fmtDate(when)], ['Location', ip || 'Unknown']]) +
      p('If this was you, there is nothing to do.') +
      note('<b>Not you?</b> Change your password now, then contact support so we can review recent activity.', 'warn') +
      button('Change password', `${site}/#/acct/security`) }),
    text: text([`New login from ${device || 'a new device'} on ${fmtDate(when)}.`, `Not you? ${site}/#/acct/security`]),
  }),

  kycSubmitted: ({ user }) => ({
    subject: 'We received your ID documents',
    preheader: 'Verification usually takes under 24 hours.',
    html: wrap({ cc: user.country, title: 'Verification received', body:
      h1('We received your documents') +
      p(`Thanks, ${first(user)}. Our team is checking your identity now. This usually takes under 24 hours.`) +
      steps(['Submitted', 'Under review', 'Verified'], 1) +
      p('You can keep betting while we check. Withdrawals open as soon as you are verified.', { muted: true }) +
      button('View my account', `${site}/#/me`) }),
    text: text(['We received your ID documents.', 'Verification usually takes under 24 hours.']),
  }),

  kycVerified: ({ user }) => ({
    subject: 'Your account is verified',
    preheader: 'Withdrawals are now open.',
    html: wrap({ cc: user.country, title: 'Verified', body:
      h1('You are verified') +
      p(`Great news, ${first(user)}. Your identity check is complete and withdrawals are now open on your account.`) +
      steps(['Submitted', 'Under review', 'Verified'], 2) +
      button('Go to my wallet', `${site}/#/me`) }),
    text: text(['Your account is verified. Withdrawals are now open.']),
  }),

  kycRejected: ({ user, reason }) => ({
    subject: 'We could not verify your documents',
    preheader: 'Please resubmit a clear photo of your ID.',
    html: wrap({ cc: user.country, title: 'Verification failed', body:
      h1('We could not verify your ID') +
      p(`Hi ${first(user)}, we were not able to confirm your identity from the documents you sent.`) +
      note(`<b>Reason:</b> ${reason || 'The photo was unclear or the details did not match your account.'}`, 'danger') +
      p('Please resubmit. Make sure the whole document is visible, in focus, and the name matches your account.') +
      button('Resubmit documents', `${site}/#/acct/verify`) }),
    text: text(['We could not verify your ID.', reason || '', `Resubmit: ${site}/#/acct/verify`]),
  }),

  /* ---------------- Money in ---------------- */
  depositSuccess: ({ user, amount: a, method, paymentId, balance, when }) => ({
    subject: `Deposit received: ${money(a, user.country)}`,
    preheader: `Your ${method} deposit is in your balance.`,
    html: wrap({ cc: user.country, title: 'Deposit received', body:
      h1('Your deposit is in') +
      p(`Hi ${first(user)}, we have added your deposit to your balance. You are ready to bet.`) +
      amount('Deposited', money(a, user.country), `New balance ${money(balance, user.country)}`, 'green') +
      details([['Method', method], ['Reference', ref(paymentId), { bold: true }], ['Date', fmtDate(when)], ['Status', 'Successful', { color: B.green, bold: true }]], 'Receipt') +
      button('Start betting', `${site}/#/home`) }),
    text: text([`Deposit received: ${money(a, user.country)} via ${method}.`, `Reference ${ref(paymentId)}.`, `New balance ${money(balance, user.country)}.`]),
  }),

  depositReceived: ({ user, amount: a, method, paymentId, reference, when }) => ({
    subject: `We are checking your deposit of ${money(a, user.country)}`,
    preheader: 'Your balance updates as soon as the money is confirmed.',
    html: wrap({ cc: user.country, title: 'Deposit being checked', body:
      h1('We are checking your deposit') +
      p(`Hi ${first(user)}, thanks – we have your ${method.toLowerCase()} deposit request. As soon as we see the money arrive, we add it to your balance and email you.`) +
      amount('Amount', money(a, user.country), 'Usually confirmed within 15 minutes', 'green') +
      details([['Method', method], ['Your reference', reference, { bold: true }], ['Request', ref(paymentId)], ['Date', fmtDate(when)], ['Status', 'Being checked', { bold: true }]], 'Request') +
      p('Please make sure the transfer narration shows your reference, so we can match it quickly.', { muted: true }) }),
    text: text([`We are checking your ${method} deposit of ${money(a, user.country)}.`, `Your reference: ${reference}.`, 'Your balance updates as soon as it is confirmed.']),
  }),

  // support set up a deposit for the player (admin portal → Request deposit); `way` = the deposit way open for them
  depositRequest: ({ user, amount: a, note: msg, way, reference }) => {
    const cc = user.country, acct = way && way.account, momo = way && way.method === 'mobile_money', amt = a ? money(a, cc) : 'the amount you want';
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const how = !way ? [] : way.mode === 'api'
      ? ['Open LetBetAfrika and tap Deposit now.', 'Enter your MoMo number and choose your network.', 'Approve the prompt on your phone – your balance updates at once.']
      : momo ? [`Send ${amt} by MoMo to ${acct.networkName || 'MoMo'} 0${acct.number} (${acct.name}).`, `Use ${reference} as the reference.`, 'Tap Deposit now on LetBetAfrika, then “I have sent it”.']
      : [`Transfer ${amt} from your bank app to the account below.`, `Put ${reference} in the narration (description).`, 'Tap Deposit now on LetBetAfrika, then “I have sent it”.'];
    return {
      subject: a ? `Complete your deposit of ${money(a, cc)}` : 'Complete your deposit at LetBetAfrika',
      preheader: 'Our support team set it up for you – it takes 2 minutes.',
      html: wrap({ cc, title: 'Complete your deposit', body:
        h1('Complete your deposit') +
        p(`Hi ${e(first(user))}, our support team set up your deposit${a ? ` of <b>${money(a, cc)}</b>` : ''}. Here is how to finish it.`) +
        (msg ? note(`<b>Message from support:</b> ${e(msg)}`, 'info') : '') +
        (how.length ? details(how.map((s, i) => [`Step ${i + 1}`, s]), 'How to pay') : p('Deposits for your country are being set up – reply to this email and we will help you.')) +
        (acct && !momo && way.mode !== 'api' ? details([['Bank', acct.bank], ['Account number', acct.number, { bold: true }], ['Account name', acct.name], ['Your reference', reference, { bold: true }]], 'Pay to') : '') +
        button(a ? `Deposit ${money(a, cc)} now` : 'Deposit now', `${site}/#/deposit`) }),
      text: text([`Complete your deposit${a ? ' of ' + money(a, cc) : ''}.`, msg ? 'Message from support: ' + msg : '', ...how.map((s, i) => `${i + 1}. ${s}`),
        acct && !momo && way.mode !== 'api' ? `Pay to: ${acct.bank} · ${acct.number} · ${acct.name} · reference ${reference}` : '', `Deposit now: ${site}/#/deposit`]),
    };
  },

  depositFailed: ({ user, amount: a, method, paymentId, reason, manual }) => ({
    subject: manual ? 'We could not confirm your deposit' : 'Your deposit did not go through',
    preheader: manual ? 'Here is what to do next.' : 'No money was taken. Here is what to do next.',
    html: wrap({ cc: user.country, title: 'Deposit failed', body:
      h1(manual ? 'We could not confirm your deposit' : 'Your deposit did not go through') +
      p(manual ? `We could not match your ${method.toLowerCase()} deposit of ${money(a, user.country)} to a payment we received. If you did send the money, reply to this email with your transfer receipt and we will sort it out.`
        : `We could not complete your ${method} deposit of ${money(a, user.country)}. No money has been taken from you.`) +
      note(`<b>Reason:</b> ${reason || 'The payment was declined by your bank or provider.'}`, 'danger') +
      details([['Reference', ref(paymentId)], ['Method', method], ['Status', 'Failed', { color: B.red, bold: true }]]) +
      p('You can try again, or use another method such as bank transfer or mobile money.', { muted: true }) +
      button('Try again', `${site}/#/me`) }),
    text: text([`Your ${method} deposit of ${money(a, user.country)} failed.`, reason || '', 'No money was taken.']),
  }),

  /* ---------------- Money out ---------------- */
  withdrawalRequested: ({ user, amount: a, method, paymentId, account, when }) => ({
    subject: `Withdrawal request received: ${money(a, user.country)}`,
    preheader: 'We are processing it now. Most payouts land within minutes.',
    html: wrap({ cc: user.country, title: 'Withdrawal requested', body:
      h1('We are processing your withdrawal') +
      p(`Hi ${first(user)}, we have received your request and reserved the funds from your balance.`) +
      amount('Withdrawing', money(a, user.country), `to ${account || method}`) +
      steps(['Requested', 'Processing', 'Paid'], 1) +
      details([['Reference', ref(paymentId), { bold: true }], ['Method', method], ['Requested', fmtDate(when)], ['Expected', 'Within minutes, up to 24 hours']]) +
      small('If anything needs checking, we will email you. You do not need to do anything now.') }),
    text: text([`Withdrawal of ${money(a, user.country)} requested.`, `Reference ${ref(paymentId)}.`, 'We will email you when it is paid.']),
  }),

  withdrawalPaid: ({ user, amount: a, method, paymentId, account, when }) => ({
    subject: `Paid: ${money(a, user.country)} sent to you`,
    preheader: `Your withdrawal has been sent to ${account || method}.`,
    html: wrap({ cc: user.country, title: 'Withdrawal paid', body:
      h1('Your money is on its way') +
      p(`We have sent ${money(a, user.country)} to ${account || method}. Banks usually show it within minutes.`) +
      amount('Paid out', money(a, user.country), fmtDate(when), 'green') +
      steps(['Requested', 'Processing', 'Paid'], 2) +
      details([['Reference', ref(paymentId), { bold: true }], ['Method', method], ['Sent to', account || method], ['Status', 'Paid', { color: B.green, bold: true }]], 'Receipt') +
      small('Keep this email as proof of payment.') }),
    text: text([`${money(a, user.country)} has been sent to ${account || method}.`, `Reference ${ref(paymentId)}.`]),
  }),

  withdrawalRejected: ({ user, amount: a, paymentId, reason, balance }) => ({
    subject: 'Withdrawal returned to your balance',
    preheader: 'We could not pay this one out. The money is back in your account.',
    html: wrap({ cc: user.country, title: 'Withdrawal returned', body:
      h1('We returned your withdrawal') +
      p(`We could not complete the payout of ${money(a, user.country)}. The full amount is back in your balance.`) +
      note(`<b>Reason:</b> ${reason || 'The account details could not be verified.'}`, 'warn') +
      details([['Reference', ref(paymentId)], ['Returned', money(a, user.country), { bold: true }], ['Balance now', money(balance, user.country)]]) +
      p('Check your payout details and try again, or contact support if you need a hand.', { muted: true }) +
      button('Update payout details', `${site}/#/me`) }),
    text: text([`Withdrawal of ${money(a, user.country)} was returned to your balance.`, reason || '']),
  }),

  /* ---------------- Betting ---------------- */
  betPlaced: ({ user, bet }) => ({
    subject: `Bet placed: ticket ${bet.id}`,
    preheader: `${bet.legs.length} selection${bet.legs.length > 1 ? 's' : ''} · stake ${money(bet.stake, user.country)} · to win ${money(bet.potential, user.country)}`,
    html: wrap({ cc: user.country, title: 'Bet placed', body:
      h1('Your bet is on') +
      p(`Good luck, ${first(user)}. Here is your ticket.`) +
      amount('Potential win', money(bet.potential, user.country), `Stake ${money(bet.stake, user.country)} · total odds ${Number(bet.odds).toFixed(2)}${bet.boost ? ` · +${bet.boost}% boost` : ''}`) +
      legs(bet.legs) +
      details([['Ticket', bet.id, { bold: true }], ['Type', bet.type === 'multiple' ? `Multiple (${bet.legs.length})` : 'Single'], ['Placed', fmtDate(bet.placedAt)]]) +
      button('Follow my bet', `${site}/#/acct/bets`) +
      small('You can cash out most bets before they finish from Open Bets.') }),
    text: text([`Bet placed. Ticket ${bet.id}.`, `Stake ${money(bet.stake, user.country)}, to win ${money(bet.potential, user.country)}.`, ...bet.legs.map(l => `• ${l.match} – ${l.market}: ${l.pick} @ ${Number(l.odd).toFixed(2)}`)]),
  }),

  betWon: ({ user, bet, balance }) => ({
    subject: `You won ${money(bet.paid, user.country)}!`,
    preheader: `Ticket ${bet.id} has been paid into your balance.`,
    html: wrap({ cc: user.country, title: 'You won', body:
      h1(`You won, ${first(user)}!`) +
      p('Your bet came in and the winnings are already in your balance.') +
      amount('Winnings paid', money(bet.paid, user.country), `New balance ${money(balance, user.country)}`, 'green') +
      legs(bet.legs) +
      details([['Ticket', bet.id, { bold: true }], ['Stake', money(bet.stake, user.country)], ['Odds', Number(bet.odds).toFixed(2)], ['Settled', fmtDate(bet.settledAt)]]) +
      button('Withdraw winnings', `${site}/#/me`) +
      button('Place another bet', `${site}/#/home`, 'gold') }),
    text: text([`You won ${money(bet.paid, user.country)} on ticket ${bet.id}.`, `New balance ${money(balance, user.country)}.`]),
  }),

  betSettled: ({ user, bet }) => ({
    subject: `Ticket ${bet.id} settled`,
    preheader: bet.status === 'void' ? 'Your stake was refunded.' : 'Better luck next time.',
    html: wrap({ cc: user.country, title: 'Bet settled', body:
      h1(bet.status === 'void' ? 'Your stake was refunded' : 'This one did not come in') +
      p(bet.status === 'void' ? `A selection was voided, so we returned ${money(bet.paid, user.country)} to your balance.` : `Ticket ${bet.id} has been settled as lost. Thanks for playing, and good luck on the next one.`) +
      legs(bet.legs) +
      details([['Ticket', bet.id, { bold: true }], ['Stake', money(bet.stake, user.country)], ['Result', bet.status === 'void' ? 'Void – refunded' : 'Lost', { color: bet.status === 'void' ? B.amber : B.red, bold: true }]]) +
      button('See today\'s matches', `${site}/#/home`) +
      small(`Set deposit limits or take a break any time under <a href="${site}/#/acct/limits" style="color:${B.green}">Responsible gambling</a>.`) }),
    text: text([`Ticket ${bet.id} settled: ${bet.status}.`]),
  }),

  cashout: ({ user, bet, paid, balance }) => ({
    subject: `Cashed out: ${money(paid, user.country)}`,
    preheader: `Ticket ${bet.id} was cashed out early.`,
    html: wrap({ cc: user.country, title: 'Cashout confirmed', body:
      h1('Cashout confirmed') +
      p('You took the money early. It is already in your balance.') +
      amount('Cashed out', money(paid, user.country), `New balance ${money(balance, user.country)}`, 'green') +
      details([['Ticket', bet.id, { bold: true }], ['Original stake', money(bet.stake, user.country)], ['Potential win', money(bet.potential, user.country)], ['Cashed out', fmtDate(new Date())]]) +
      button('View bet history', `${site}/#/acct/bets`) }),
    text: text([`Cashed out ${money(paid, user.country)} on ticket ${bet.id}.`]),
  }),

  jackpotTicket: ({ user, ticketId, picks, prize, draw }) => ({
    subject: `Jackpot ticket ${ticketId} confirmed`,
    preheader: `12 picks in. Draw ${fmtDate(draw)}.`,
    html: wrap({ cc: user.country, title: 'Jackpot ticket', body:
      h1('Your jackpot ticket is in') +
      p(`Predict all 12 correctly and the jackpot of ${money(prize, user.country)} is yours.`) +
      details(picks.map((pk, i) => [`${i + 1}. ${pk.match}`, pk.pick, { bold: true }]), 'Your picks') +
      details([['Ticket', ticketId, { bold: true }], ['Draw closes', fmtDate(draw)], ['Prize pool', money(prize, user.country)]]) +
      button('View jackpot', `${site}/#/jackpot`) }),
    text: text([`Jackpot ticket ${ticketId} confirmed.`, ...picks.map((pk, i) => `${i + 1}. ${pk.match}: ${pk.pick}`)]),
  }),

  /* ---------------- Bonuses & limits ---------------- */
  bonusCredited: ({ user, amount: a, name, balance, terms }) => ({
    subject: `Bonus added: ${money(a, user.country)}`,
    preheader: `${name} is in your balance.`,
    html: wrap({ cc: user.country, title: 'Bonus added', body:
      h1('A bonus landed in your account') +
      p(`We have added your <b>${name}</b>.`) +
      amount('Bonus', money(a, user.country), `New balance ${money(balance, user.country)}`, 'green') +
      (terms ? note(terms, 'info') : '') +
      button('Use my bonus', `${site}/#/home`, 'gold') }),
    text: text([`${name}: ${money(a, user.country)} added to your balance.`, terms || '']),
  }),

  limitsUpdated: ({ user, period, limit, reminder }) => ({
    subject: 'Your limits were updated',
    preheader: 'Confirmation of your responsible-gambling settings.',
    html: wrap({ cc: user.country, title: 'Limits updated', body:
      h1('Your limits were updated') +
      p('Here are your current responsible-gambling settings. Lower limits apply immediately; higher limits start after 24 hours.') +
      details([['Deposit limit', limit ? `${money(limit, user.country)} ${period || ''}`.trim() : 'No limit'], ['Session reminder', reminder || 'Off']]) +
      p('If you did not make this change, contact support straight away.', { muted: true }) +
      button('Review limits', `${site}/#/acct/limits`) }),
    text: text([`Deposit limit: ${limit ? money(limit, user.country) + ' ' + (period || '') : 'none'}.`, `Reminder: ${reminder || 'off'}.`]),
  }),

  selfExclusion: ({ user, until }) => ({
    subject: 'Your break has started',
    preheader: `Your account is paused until ${fmtDate(until)}.`,
    html: wrap({ cc: user.country, title: 'Break started', body:
      h1('Your break has started') +
      p(`As you asked, your account is paused. You will not be able to deposit or bet until <b>${fmtDate(until)}</b>. Any pending withdrawals will still be paid.`) +
      note('If you feel gambling is becoming a problem, free confidential help is available. In Nigeria call 0800 4321 1000; in Ghana call 0800 111 222.', 'info') +
      small('This cannot be reversed early. We will email you when the break ends.') }),
    text: text([`Your account is paused until ${fmtDate(until)}.`]),
  }),

  /* ---------------- Statements ---------------- */
  weeklySummary: ({ user, from, to, stats }) => ({
    subject: 'Your week at LetBetAfrika',
    preheader: `${stats.bets} bets · ${money(stats.staked, user.country)} staked · ${money(stats.won, user.country)} won`,
    html: wrap({ cc: user.country, title: 'Weekly summary', body:
      h1('Your week in numbers') +
      p(`${fmtDate(from).split(',')[0]} – ${fmtDate(to).split(',')[0]}`, { muted: true }) +
      details([['Bets placed', String(stats.bets)], ['Total staked', money(stats.staked, user.country)], ['Total won', money(stats.won, user.country), { color: B.green, bold: true }], ['Deposits', money(stats.deposits, user.country)], ['Withdrawals', money(stats.withdrawals, user.country)], ['Balance now', money(stats.balance, user.country), { bold: true }]]) +
      small(`Seeing these numbers helps you stay in control. You can set limits any time under <a href="${site}/#/acct/limits" style="color:${B.green}">Responsible gambling</a>.`) +
      button('Open LetBetAfrika', `${site}/#/home`) }),
    text: text([`Your week: ${stats.bets} bets, ${money(stats.staked, user.country)} staked, ${money(stats.won, user.country)} won.`]),
  }),
};

export const render = (name, data) => {
  const t = templates[name];
  if (!t) throw new Error(`unknown email template: ${name}`);
  return { name, ...t(data) };
};
