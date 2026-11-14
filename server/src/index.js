import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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
import { startGames } from './games/index.js';
import { startFeeds } from './feeds/index.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '64kb' }));
app.use(pinoHttp({ logger: log, autoLogging: { ignore: r => r.url.startsWith('/img') || r.url === '/health' } }));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }), auth);
app.use('/api/wallet', wallet);
app.use('/api/bets', bets);
app.use('/api/events', events);
app.use('/api/admin', admin);
app.use('/api/jackpot', jackpot);
app.use('/api/virtuals', virtuals);
app.use('/api/games', games);

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
migrate().then(() => {
  app.listen(port, () => log.info(`LetBetAfrika API on :${port}`));
  startFeeds();
  startGames();
}).catch(e => { log.error(e, 'migration failed'); process.exit(1); });
