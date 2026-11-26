// The agent's own screen (Me → Agent): their link, players, earnings and payout requests (lib/agents.js).
import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { dashboard, requestPayout } from '../lib/agents.js';
import { notifyAdmins } from '../emails/index.js';

const r = Router();
r.use(requireUser);
const send = (res, next) => [x => res.json(x), e => (e.body ? res.status(e.status).json(e.body) : next(e))];
r.get('/', (req, res, next) => { dashboard(req.user).then(...send(res, next)); });
r.post('/payout', (req, res, next) => {
  requestPayout(req.user, req.body).then(x => {
    res.json(x);
    notifyAdmins('agent', { id: String(x.id), amount: x.amount, method: 'Agent earnings' }, req.user, { account: `${x.to} · ${x.earnings} first deposit${x.earnings === 1 ? '' : 's'} · code ${req.user.agent_code}` });
  }, send(res, next)[1]);
});
export default r;
