# LetBetAfrika – Learning guide for the next developer

What you need to know, **where to learn it**, and **where it lives in this code**. Work through §1 on day one,
then read the section for whichever task in `HANDOVER.md` §6 you pick up.

---

## 1. Day one (2–3 hours)

1. Read `HANDOVER.md` (vision, status, priorities) and `betting/UI-HANDOVER.md` (design tokens, screens).
2. Run it: Postgres + `npm install && npm start`, open http://127.0.0.1:8080. Also open `betting/index.html` as a file (demo mode).
3. Open the reference on your phone: https://www.sportybet.com/ng/m/ – compare with ours screen by screen.
4. Click through every page; place a bet; deposit; play Instant Football; switch to Ghana; toggle dark mode.
5. Run `cd server && node --test test/grade.test.js test/games.test.js` and `node tools/qa/smoke.js`.
6. Play every game in `#/games` (demo and live), and open *Provably fair* on Rocket Crash and press *Verify*.

### Code tour (follow a bet end to end)
- Odds button → `oddBtn()` in `betting/app.js` → betslip `renderSlip()` → `livePlaceBet()` → `API.bets.place()` (`betting/api.js`)
- → `server/src/routes/bets.js` `/place` (re-prices from DB, debits stake in a transaction)
- → feed finishes the match (`server/src/feeds/oddsapi.js` `syncScores`) → `settleEvent()` in `server/src/lib/settle.js`
- → `move()` in `server/src/lib/wallet.js` credits the win (ledger row + cached balance).
- → on the next poll `liveBets()` in `betting/app.js` sees the ticket go open → won and shows the YOU WON screen, `Pages.trophy()` in `betting/pages.js` (once per ticket, remembered in `localStorage.lba_trophies`).

### Code tour (follow a game play)
- *Roll* in `betting/arcade.js` `play()` → `API.games.play('dice', {stake, choice})` → `server/src/routes/games.js`
  `/:game/play` → one transaction: `debit()` stake → `GameLogic.play(game, rng)` with the CSPRNG → `move()` payout →
  `game_bets` row → response → the dice animation runs → balance updated → `Pages.trophy()` for wins of 2x or more.
- Rocket Crash: `server/src/games/crash.js` `tick()` (leader only) creates rounds and pays auto cash-outs; players call
  `crash/bet`, `crash/cashout`; `betting/games.js` polls `crash/state` and animates from the server clock.

---

## 2. Sportsbook domain (understand before touching money)

| Topic | Learn | Where in code |
|---|---|---|
| Decimal odds, implied probability, margin/vig, de-vigging | Pinnacle Betting Resources (pinnacle.com/betting-resources), Wizard of Odds (wizardofodds.com) | `consensus()` in `server/src/feeds/oddsapi.js` |
| Poisson football model; fitting goal rates to 1X2 + O/U | Maher (1982) "Modelling association football scores"; Dixon & Coles (1997) – search the paper titles; "penaltyblog" docs (pena.lt/y/blog) | `fit()`, `footballMarkets()` in `server/src/feeds/demo.js` |
| Markets and settlement rules (1X2, DC, DNB, GG, O/U, CS, handicaps, void rules) | Any bookmaker's "Sports rules" page; SportyBet Help Centre | `gradeLeg()` in `server/src/lib/settle.js`, tests in `server/test/grade.test.js` |
| Multiples, win boost, cashout pricing | SportyBet promotions pages ("Win Boost", "Cashout") | `bets.js`, `cashoutValue()` in `settle.js` |
| RTP / house edge for casino games | Wizard of Odds game math pages | `betting/game-logic.js` (`rtp()` computes every table exactly: 94.4–97%), tests in `server/test/games.test.js` |
| Provably fair crash games (commit–reveal, HMAC) | Search "bustabit provably fair"; Node crypto docs (createHash, createHmac); MDN "SubtleCrypto" for the in-browser check | `server/src/games/crash.js`, *Provably fair* panel in `betting/games.js`, `HANDOVER.md` §6 |
| Hypergeometric odds (Keno), polynomial line counting (jackpot) | Wizard of Odds "Keno"; any combinatorics primer | `rtp('keno')` in `betting/game-logic.js`, `tiers()` in `server/src/games/jackpot.js` |
| Leader election with Postgres advisory locks | PostgreSQL docs "Advisory Locks" (explicit locking chapter) | `server/src/lib/leader.js`, `server/src/games/index.js` |

**Golden rules:** money only moves through `wallet.js` inside a DB transaction; prices are always re-checked on the
server; never trust the client for odds, results or game outcomes; every game result is decided after the stake is taken.

---

## 3. Data providers

| Provider | Docs | Notes |
|---|---|---|
| The Odds API (odds + scores) | https://the-odds-api.com/liveapi/guides/v4/ | Cost = markets × regions per call; `/sports` is free; scores 1–2 credits. Header `x-requests-remaining`. Owner is on FREE (500/month). Adapter: `server/src/feeds/oddsapi.js` |
| TheSportsDB (crests, league badges) | https://www.thesportsdb.com/documentation | Free key `123`, ~30 req/min, search returns 1 result → filter `strSport`. Badge `…/tiny`. Code: `server/src/lib/logos.js` (`PIN` map for wrong matches) |
| API-Football (optional upgrade) | https://www.api-football.com/documentation-v3 | Has logos, flags, live minute, NPFL + Ghana PL. Free 100 req/day. Would replace minute estimation and add African leagues |
| flag-icons (flags) | https://github.com/lipis/flag-icons | MIT, vendored in `betting/img/flags`; codes like `gb-eng`, `ng`, `gh`. Used by `flag()` in `betting/icons.js` |
| Club crests from official club websites (owner request) | Each club's site (e.g. premierleague.com/clubs links) | Crests are trademarks – get the operator's legal OK; store URLs in `team_logos` or `PIN` |

---

## 4. Backend stack

| Topic | Learn | Where |
|---|---|---|
| Node.js 20+, ES modules, `fetch` | https://nodejs.org/docs/latest-v20.x/api/ | `server/src` |
| Express 5 routing, middleware, errors | https://expressjs.com/ | `server/src/index.js`, `routes/` |
| PostgreSQL: transactions, `SELECT … FOR UPDATE`, `jsonb`, indexes | https://www.postgresql.org/docs/current/ (chapters "Concurrency Control", "JSON Types") | `server/src/db/schema.sql`, `lib/wallet.js`, `lib/settle.js` |
| node-postgres (pool, transactions) | https://node-postgres.com/ | `server/src/db/pool.js` |
| zod validation | https://zod.dev/ | every route |
| JWT auth, bcrypt | https://jwt.io/introduction, bcryptjs README | `server/src/lib/auth.js` |
| Rate limiting, helmet | express-rate-limit, helmetjs.github.io | `server/src/index.js` |
| HMAC / CSPRNG (`crypto.randomInt`, `createHmac`) | https://nodejs.org/api/crypto.html | `server/src/games/rng.js`, `routes/games.js` (Hi-Lo signed deals), `games/crash.js` |

Gotcha: jsonb re-sorts object keys – outcome order is restored on the client by `okRank()` in `app.js`.

---

## 5. Front end

| Topic | Learn | Where |
|---|---|---|
| Vanilla JS modules on `window`, hash router | MDN (developer.mozilla.org) – "Window: hashchange event" | `route()` in `app.js`; `Account` / `Pages` / `Arcade` / `Games` modules |
| CSS: flex/grid, sticky, custom properties, `prefers-color-scheme` | MDN CSS guides; web.dev/learn/css | `betting/app.css` layers v5–v20 (v19 trophy, v20 games); dark via `tools/gen-dark.py` |
| 3D product rendering (three.js PBR, lathe geometry, environment lighting) | threejs.org/manual ("Physically based rendering", "LatheGeometry") | `tools/trophy/` – how the trophy image is made |
| Canvas / SVG animation for games | MDN "Canvas tutorial", "SVG transforms" | Rocket Crash in `games.js`, boards in `arcade.js` |
| Mobile UX of sportsbooks | Study SportyBet, Bet9ja, BetKing mobile sites side by side | `tools/qa/compare2.js` |
| Accessibility (WCAG 2.2 AA) | https://www.w3.org/WAI/WCAG22/quickref/, axe-core | `tools/qa/axe_run.js` |
| PWA basics | web.dev/learn/pwa | `betting/manifest.webmanifest` |

Design tokens and sizes: `betting/UI-HANDOVER.md` §3. Keep 12px side gutter, flags 4:3, Roboto, no emoji.

---

## 6. Scaling to 10,000 concurrent users

| Topic | Learn | Apply to |
|---|---|---|
| HTTP caching, ETag/304, gzip | MDN "HTTP caching" | cache `/api/events` per replica, rebuild every 2–5 s |
| Stateless servers / horizontal scaling | Railway docs "Replicas", "Scaling" (docs.railway.com) | move in-memory Maps (Instant Football rounds) to Postgres or signed tokens |
| Postgres connection pooling | PgBouncer docs; Railway Postgres docs | pool size × replicas < max_connections |
| Load testing | autocannon (github.com/mcollina/autocannon), k6 (grafana.com/docs/k6) | e.g. 2,000 req/s events, 50 bets/s; record p95 latency |
| Server-Sent Events (optional instead of polling) | MDN "Using server-sent events" | live odds push |

---

## 7. Testing

- Node test runner: https://nodejs.org/api/test.html – `server/test/*.test.js`
- Playwright: https://playwright.dev/docs/intro – all `tools/qa/*.js` scripts (see `tools/qa/README.md`)
- Always test **both** demo (`file://…/betting/index.html`) and live (server) modes, phone (iPhone 13) and desktop (1440px).

---

## 8. Payments, SMS, KYC (go-live)

| Need | Learn | Hook in code (search `PROVIDER:`) |
|---|---|---|
| Card/bank/USSD (NG) | Paystack docs (paystack.com/docs), Flutterwave docs (developer.flutterwave.com) | `routes/wallet.js` deposit; `account.js` deposit tabs |
| Mobile money (GH) | MTN MoMo API (momodeveloper.mtn.com), Hubtel / Paystack Ghana | `account.js` `depMomo` |
| Payouts / name enquiry | Paystack Transfers + Resolve Account | `account.js` `bankSheet` |
| SMS OTP | Termii docs (developers.termii.com) | `server/src/lib/otp.js` (`SMS_PROVIDER`) |
| KYC | Smile ID docs (docs.usesmileid.com) | `/auth/verify` |
| Webhooks + idempotency | Stripe/Paystack webhook guides | new `routes/webhooks.js` |

## 9. Regulation and responsible gambling

- Nigeria: National Lottery Regulatory Commission (nlrc.gov.ng), Lagos State Lotteries and Gaming Authority (lslga.lg.gov.ng).
- Ghana: Gaming Commission of Ghana (gamingcommission.gov.gh).
- Responsible gambling features already in the UI: deposit limits, session reminders, take-a-break (`#/acct/limits`).
- KYC before withdrawal, 18+ checks, AML monitoring are licence requirements – confirm with the operator's lawyer.

---

## 10. How to work on this repo

1. Branch from the latest branch in `HANDOVER.md` §7; small commits, imperative messages.
2. Before each commit: `smoke.js`, the relevant e2e script, `align.js`; regenerate `dark.css` after CSS changes.
3. For any UI change, take a side-by-side with `compare2.js` and look at it.
4. For any money change, add a case to `server/test/payout.test.js`.
5. Never commit secrets (API keys go in Railway variables).
