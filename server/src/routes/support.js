// Live support – the player's side (lib/support.js). The admin side is under /api/admin/support.
import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import * as S from '../lib/support.js';

const r = Router();
r.use(requireUser);
const fail = (res, e, next) => (e.status ? res.status(e.status).json({ error: e.message }) : next(e));

// GET /api/support?after=<message id>  → { thread, messages, online }
r.get('/', async (req, res, next) => {
  try { res.json(await S.view(req.user, Number(req.query.after) || 0)); } catch (e) { fail(res, e, next); }
});
// unread replies from the team (badge on Me)
r.get('/unread', async (req, res, next) => {
  try { res.json({ unread: await S.unread(req.user) }); } catch (e) { fail(res, e, next); }
});
r.post('/read', async (req, res, next) => {
  try { await S.markRead(req.user); res.json({ ok: true }); } catch (e) { fail(res, e, next); }
});
// POST { text } → the player's message (+ the assistant's answer while it has the chat)
r.post('/message', async (req, res, next) => {
  try { res.json(await S.say(req.user, req.body && req.body.text)); } catch (e) { fail(res, e, next); }
});
// "Talk to a person"
r.post('/human', async (req, res, next) => {
  try { const messages = await S.handoff(req.user, null); res.json({ ...(await S.view(req.user, 1e15)), messages }); } catch (e) { fail(res, e, next); }
});

export default r;
