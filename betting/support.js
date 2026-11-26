/* =========================================================
   LetBetAfrika – Live Support (the player's chat)
   The assistant answers at once from the player's own account (server/src/lib/support.js); "Talk to a person"
   hands the chat to the team, who reply from the admin portal (Support). New replies arrive every few seconds.
   ========================================================= */
(() => {
  'use strict';
  const A = () => window.LBA_APP, $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const S = { msgs: [], thread: null, online: false, timer: null, busy: false, lastId: 0, typing: false };
  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/></svg>',
    agent: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>',
  };
  const fmtTime = d => new Date(d || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const linkify = s => esc(s).replace(/\n/g, '<br>');

  function statusLine() {
    const t = S.thread;
    if (!t || t.status === 'bot') return ['bot', 'Assistant · answers instantly'];
    if (t.status === 'open') return ['on', `Chatting with ${esc(t.staff || 'Support')}`];
    if (t.status === 'waiting') return S.online ? ['wait', 'Connecting you to a support agent…'] : ['off', 'Team offline · we reply here'];
    return ['bot', 'Assistant · answers instantly'];
  }
  function bubble(m) {
    if (m.from === 'system') return `<div class="sp-sys">${linkify(m.text)}</div>`;
    const me = m.from === 'user';
    const who = m.from === 'staff' ? `${ICON.agent}<b>${esc(m.name || 'Support')}</b>` : m.from === 'bot' ? `${ICON.bot}<b>Assistant</b>` : '';
    return `<div class="sp-m ${me ? 'me' : m.from}${m.pending ? ' pending' : ''}">${who ? `<div class="sp-who">${who}</div>` : ''}<div class="sp-b">${linkify(m.text)}</div><time>${m.pending ? 'Sending…' : fmtTime(m.at)}</time></div>`;
  }
  const lastChips = () => { for (let i = S.msgs.length - 1; i >= 0; i--) { const m = S.msgs[i]; if (m.from === 'user' || m.from === 'staff') return null; if (m.chips) return m.chips; } return null; };

  function paint(scroll) {
    const root = $('#page-support .sp-root'); if (!root) return;
    const list = $('#spMsgs', root);
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.innerHTML = S.msgs.map(bubble).join('') + (S.typing ? '<div class="sp-m bot"><div class="sp-b sp-typing"><i></i><i></i><i></i></div></div>' : '');
    const [cls, txt] = statusLine();
    $('#spStatus', root).className = 'sp-status ' + cls; $('#spStatus', root).innerHTML = `<i></i>${txt}`;
    const human = S.thread && S.thread.status !== 'bot';
    const chips = human ? null : lastChips();
    $('#spChips', root).innerHTML = (chips || []).map(c => `<button type="button" data-spchip="${esc(c)}">${esc(c)}</button>`).join('');
    if (scroll || atBottom) list.scrollTop = list.scrollHeight;
  }

  function add(ms) {
    for (const m of ms || []) { if (!m || m.text === '') continue; if (m.id && S.msgs.some(x => x.id === m.id)) continue; S.msgs.push(m); if (m.id) S.lastId = Math.max(S.lastId, m.id); }
  }
  async function load(first) {
    if (!window.API || !API.token) return;
    try {
      const r = await API.support.get(first ? 0 : S.lastId);
      S.online = !!r.online; if (r.thread) S.thread = r.thread; else if (first) S.thread = null;
      if (first) { S.msgs = []; S.lastId = 0; if (!r.thread && r.greeting) S.msgs.push({ ...r.greeting, at: new Date() }); }
      const fresh = (r.messages || []).filter(m => !S.msgs.some(x => x.id === m.id));
      add(r.messages);
      if (first || fresh.length) paint(first || fresh.some(m => m.from !== 'user'));
      else paint(false);
      if (fresh.some(m => m.from === 'staff') || (r.thread && r.thread.unread)) { API.support.read().catch(() => {}); setBadge(0); }
    } catch (e) { if (first) { const l = $('#spMsgs'); if (l) l.innerHTML = '<div class="sp-sys">Could not load the chat – check your connection.</div>'; } }
  }
  async function send(text) {
    text = String(text || '').trim(); if (!text || S.busy) return;
    S.busy = true;
    const tmp = { from: 'user', text, pending: true, at: new Date() };
    S.msgs.push(tmp); paint(true);
    const botMode = !S.thread || S.thread.status === 'bot';
    if (botMode) { S.typing = true; setTimeout(() => paint(true), 120); }
    try {
      const r = await (text === 'Talk to a person' && botMode ? API.support.human() : API.support.send(text));
      S.msgs = S.msgs.filter(m => m !== tmp);
      if (text === 'Talk to a person' && botMode) S.msgs.push({ from: 'user', text, at: new Date() });
      if (botMode) await new Promise(res => setTimeout(res, 450));   // a beat, so the answer reads as an answer
      S.typing = false;
      // the first message opens the chat: the server stores its own greeting, so the on-screen one is replaced
      if (!S.thread && r.thread) S.msgs = S.msgs.filter(m => m.id || m.from === 'user');
      if (r.thread) S.thread = r.thread; if (r.online != null) S.online = !!r.online;
      add(r.messages);
      paint(true);
    } catch (e) {
      S.typing = false; tmp.pending = false; tmp.text += '\n(not sent – tap Send to try again)'; paint(true);
      A().toast(e.message === 'slow_down' ? 'Too many messages – wait a moment' : 'Message not sent – check your connection');
    } finally { S.busy = false; }
  }

  function render() {
    const a = A(), root = $('#page-support .sp-root'); if (!root) return;
    clearInterval(S.timer);
    if (!a.live) { root.innerHTML = head() + '<div class="sp-empty"><b>Live support</b><p>Chat with us on the live site.</p></div>'; return; }
    if (!a.state.user) {
      root.innerHTML = head() + `<div class="sp-empty">${ICON.bot}<b>Chat with LetBetAfrika</b><p>Log in to chat with our assistant and our support team – we can see your deposits, withdrawals and bets and help straight away.</p><a class="btn btn-accent block" href="#/login/support">Log in</a><a class="btn btn-ghost block mt" href="#/register">Create an account</a></div>`;
      return;
    }
    root.innerHTML = head() + `
      <div class="sp-status bot" id="spStatus"><i></i>Assistant · answers instantly</div>
      <div class="sp-msgs" id="spMsgs" aria-live="polite"><div class="sp-sys">Loading your chat…</div></div>
      <div class="sp-chips" id="spChips"></div>
      <form class="sp-form" id="spForm" autocomplete="off">
        <textarea id="spText" rows="1" maxlength="2000" placeholder="Type your message…" aria-label="Your message" enterkeyhint="send"></textarea>
        <button type="submit" class="sp-send" aria-label="Send">${ICON.send}</button>
      </form>`;
    const ta = $('#spText', root);
    $('#spForm', root).addEventListener('submit', e => { e.preventDefault(); const v = ta.value; ta.value = ''; ta.style.height = ''; send(v); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#spForm', root).requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    if (!root._spChips) { root._spChips = true; root.addEventListener('click', e => { const c = e.target.closest('[data-spchip]'); if (c) send(c.dataset.spchip); }); }   // once: the page re-renders
    load(true);
    S.timer = setInterval(() => { if (A().state.route !== 'support') return clearInterval(S.timer); if (!document.hidden) load(false); }, 3000);
  }
  const head = () => `<div class="wl-head"><button class="icon-btn" data-back aria-label="Back">${ICON.back}</button><h1>Live Support</h1><span></span></div>`;

  /* unread replies from the team: badge on Me + a toast, checked in the background */
  let lastUnread = 0;
  function setBadge(n) {
    ['#meSupportBadge', '#navSupportDot'].forEach(s => { const b = $(s); if (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); } });
  }
  async function checkUnread() {
    const a = A(); if (!a || !a.live || !a.state.user || !window.API || !API.token || document.hidden) return;
    if (a.state.route === 'support') return;
    try {
      const n = await API.support.unread();
      if (n > lastUnread) a.toast('Support replied to you – open Me → Live Support');
      lastUnread = n; setBadge(n);
    } catch {}
  }
  setInterval(checkUnread, 20000); setTimeout(checkUnread, 4000);

  window.Support = { handles: p => p === 'support', render };
})();
