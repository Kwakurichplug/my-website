import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from './db/migrate.js';
import { attachUser } from './lib/auth.js';
import auth from './routes/auth.js';
import wallet from './routes/wallet.js';
import bets from './routes/bets.js';
import events from './routes/events.js';
import admin from './routes/admin.js';
import jackpot from './routes/jackpot.js';
import virtuals from './routes/virtuals.js';
import games from './routes/games.js';
import payments from './routes/payments.js';
import { active as gatewayActive } from './payments/gateway.js';
import { crestImage } from './lib/manual.js';
import agentRoutes from './routes/agent.js';
import supportRoutes from './routes/support.js';
import { ensureAdmins, bootstrapAdmin, adminEmails } from './lib/admins.js';
import { startGames, gamesStatus } from './games/index.js';
import { startEmailChecks } from './emails/index.js';
import { startFeeds } from './feeds/index.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
// ID verification carries two photos (resized in the app to ~1600 px): a bigger body for that one route only
app.use('/api/auth/verify', express.json({ limit: '4mb' }));
// keep the raw body of provider callbacks: their signatures are computed over the exact bytes
app.use(express.json({ limit: '64kb', verify: (req, _res, buf) => { if (req.url.startsWith('/api/payments/')) req.rawBody = buf; } }));
app.use(pinoHttp({ logger: log, autoLogging: { ignore: r => r.url.startsWith('/img') || r.url === '/health' } }));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString(), schedulers: gamesStatus(), payments: gatewayActive()?.name || 'none' }));
app.use('/api/auth', auth);   // sign-in / sign-up / code / reset are rate-limited inside (per phone + per IP)
app.use('/api/wallet', wallet);
// monitoring: why bets are refused (min stake, in-play cap, odds changed…) – logged with the reason, never the body
app.use('/api/bets/place', (req, res, next) => {
  const json = res.json.bind(res);
  res.json = b => { if (res.statusCode >= 400 && b && b.error) req.log?.info({ betRefused: b.error, detail: b.detail || null }, 'bet refused'); return json(b); };
  next();
});
app.use('/api/bets', bets);
app.use('/api/events', events);
app.use('/api/admin', admin);
app.use('/api/jackpot', jackpot);
app.use('/api/virtuals', virtuals);
app.use('/api/games', games);
app.use('/api/payments', payments);
app.use('/api/agent', agentRoutes);
app.use('/api/support', supportRoutes);
// crests uploaded in the admin portal (team_crests): public, cached for a year (a new upload gets a new id)
app.get('/api/crests/:id', async (req, res, next) => {
  try {
    const img = await crestImage(+req.params.id || 0);
    if (!img) return res.status(404).end();
    res.set('cache-control', 'public, max-age=31536000, immutable').type(img.mime).send(img.data);
  } catch (e) { next(e); }
});

// Serve the front end from the same origin (betting/ folder one level up)
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'betting');
app.use(express.static(site, { extensions: ['html'], maxAge: '1h' }));
app.get('/', (_req, res) => res.sendFile(join(site, 'index.html')));

app.use((err, req, res, _next) => {
  const status = err.status || (err.name === 'ZodError' ? 400 : 500);
  if (status >= 500) req.log?.error(err);
  res.status(status).json({ error: err.message || 'server_error', ...(err.detail ? { detail: err.detail } : {}) });
});

const port = process.env.PORT || 8080;
let server = null;
migrate().then(() => {
  server = app.listen(port, () => log.info(`LetBetAfrika API on :${port}`));
  startFeeds();
  startGames();
  startEmailChecks();
  ensureAdmins().then(() => bootstrapAdmin()).then(r => { if (r !== 'off') log.info(`[admin] ${adminEmails()[0]}: ${r}`); }).catch(e => log.error(e, 'admin bootstrap'));
}).catch(e => { log.error(e, 'migration failed'); process.exit(1); });

// A deploy stops the old replica with SIGTERM: stop taking requests, hand the schedulers over, close the database.
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  if (stopping) return; stopping = true;
  console.log(`[shutdown] ${sig}`);   // plain stdout: shows in the deploy log even as the process ends
  const force = setTimeout(() => process.exit(0), 8000); force.unref();
  try { if (server) await new Promise(r => { server.close(() => r()); server.closeIdleConnections?.(); }); } catch {}
  try { const { resign } = await import('./lib/leader.js'); await resign(); } catch {}
  try { const { pool } = await import('./db/pool.js'); await pool.end(); } catch {}
  process.exit(0);
});
