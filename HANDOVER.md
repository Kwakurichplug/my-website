# LetBetAfrika – Project Handover (read this first)

> **The standard:** this is a paid, commercial-grade product. Every task must meet `docs/QUALITY-BAR.md`
> (Definition of Done) – official, professional, nothing fake, money always correct.
>
> **Live site:** https://api-production-2673beb3.up.railway.app (Railway project `letbetafrika` → service `api`, source branch `claude/bold-mccarthy-71siq8`).
> **Deploys are NOT automatic on push** – trigger them as described in §8.
>
> **New here?** Read this file, then `docs/LEARNING.md` (what to learn, where, and where it lives in the code),
> then `betting/UI-HANDOVER.md` (design system). QA scripts: `tools/qa/README.md`.

## 1. The vision

LetBetAfrika is a **top-tier mobile-first sportsbook and games site for Nigeria (₦) and Ghana (GH₵)**, modelled screen
by screen on SportyBet's mobile site, in our own brand (green `#0a7d3e`, gold `#ffc20e`, the **LB** monogram with the
football, the **LetBet|Afrika** wordmark in Kanit italic). The goal is a **full working full-stack product**: real odds,
real scores, real crests and flags, real money through a ledger, **every game playable for real money**, a trophy
celebration on wins, and an architecture that holds **10,000 simultaneous users**.

Rule of thumb for every decision: *does it look and behave like a top African sportsbook, and is the money correct?*
Never copy another operator's brand assets – we match their quality and layout, with our own identity.

## 2. Repository layout

| Path | What it is |
|---|---|
| `betting/` | Static front end (HTML/CSS/JS, no build step). Served by the API server. |
| `betting/index.html` | All page markup. Script order: `api → account → pages → motion → icons → game-logic → games → scenes → arcade → app`. |
| `betting/app.js` | Core: data model, router, betslip, home, match page, account sub-pages, live-API bridge, Virtual League client. Exposes `window.LBA_APP`. |
| `betting/account.js` | Sign up (SMS code), login, reset password, deposit, withdraw (per country). |
| `betting/pages.js` | Live, Sports filter, lists, league, **Jackpot** (server rounds, real results), Promotions, Results, Code Hub, bet detail, Instant Football, **YOU WON trophy** (`Pages.trophy()`), offline banner. |
| `betting/game-logic.js` | **Shared game rules + pay tables + exact RTP** (`GameLogic.rtp(game)`), used by the browser demo and the server. |
| `betting/games.js` | Games lobby (all 11 games live, thumbnails from `img/games/`) + **Rocket Crash** (canvas scene: parallax stars, rocket sprite, exhaust particles, explosion; live: shared server rounds; demo: browser rounds). |
| `betting/arcade.js` | **Instant games shell** `#/game/<id>` (header + balance, results strip, stage, casino-chip stake bar, My plays, rules sheet) and the play flow (live API / demo). |
| `betting/scenes.js` | **The game scenes** (`window.Scenes`): 3D CSS dice, SVG wheel with flapper physics, slot reels, keno ball globe (canvas physics), scratch foil (canvas), SVG playing cards with 3D flip, penalty stadium (canvas). Each scene: `html(ctx)`, `mount(el, ctx)`, `play(el, result, ctx)` → Promise. |
| `betting/icons.js` | Flags (real flag-icons SVGs), crests (real logos when known, drawn fallback), sport icons. |
| `betting/app.css` | Styles in versioned layers `v5…v22b` (v19 trophy, v21 market view/bonus/referral, v22 game shell + scenes, v22b Rocket Crash) – append new work at the end. |
| `betting/dark.css` | **Generated** dark theme – run `python3 betting/tools/gen-dark.py` after any CSS change. |
| `betting/img/trophy-lb.webp`, `trophy-lb-600.webp` | **Our 3D-rendered trophy** (gold cup with the LB monogram, green LetBet\|Afrika plinth, light burst). Source: `tools/trophy/`. |
| `betting/img/games/` | Lobby thumbnails `thumb-<id>.webp` (captured from the real game scenes by `tools/assets/thumbs.js`), `rocket.webp`, `ball.webp` (our three.js renders). |
| `betting/img/flags/` | flag-icons (MIT) – 270 country flags. |
| `betting/UI-HANDOVER.md` | Detailed front-end guide (design tokens, screens, conventions). |
| `server/` | Node 20+ Express API + Postgres. `npm start` in repo root runs it and serves `betting/`. |
| `server/src/feeds/oddsapi.js` | **Real odds + scores** from The Odds API (budget-aware). Only touches its own `oa:` events. |
| `server/src/feeds/demo.js` | Simulated feed for demos (`ODDS_PROVIDER=demo`). Only touches its own `demo:` events. |
| `server/src/games/` | **Game engines**: `crash.js` (Rocket Crash rounds), `virtual.js` (Virtual League rounds), `jackpot.js` (rounds, grading, payouts), `rng.js` (CSPRNG + shared rules), `index.js` (schedulers). |
| `server/src/lib/leader.js` | Picks ONE replica (Postgres advisory lock) to run the game schedulers. |
| `server/src/lib/logos.js` | Real club crests via TheSportsDB, cached in `team_logos`. |
| `server/src/lib/settle.js` | Grading + settlement + cashout. |
| `server/src/lib/bonus.js` | **Deposits + welcome bonus**: `creditDeposit()` (the ONLY way to credit a deposit – grants the bonus on the first one), `addTurnover()` (called by settlement), `expireBonuses()`. |
| `server/src/emails/` | Transactional emails (21 templates) + sending (`console`, `smtp`, `resend`, `sendgrid`) – see `server/EMAILS.md`. |
| `server/src/routes/*` | auth, wallet, bets, events, admin, jackpot, virtuals (Instant Football), **games** (instant games + Rocket Crash). |
| `server/test/` | `grade.test.js`, `games.test.js` (unit); `payout.test.js`, `games-api.test.js`, `account-api.test.js` (money-flow integration). |
| `docs/QUALITY-BAR.md` | **Definition of Done** – professional acceptance checklist for every area. |
| `docs/LEARNING.md` | **Learning guide** – topics, links, and code locations for every task. |
| `tools/qa/` | Playwright QA scripts (incl. `e2e_games.js`, `e2e_games_demo.js`, `e2e_instant.js`), SportyBet side-by-side tool, mock Odds API. |
| `tools/trophy/` | The trophy's three.js model + render + post-production scripts (re-render instructions inside). |
| `tools/assets/` | three.js renders of the rocket and football (`asset.mjs`, `render_asset.js`) and the lobby thumbnail capture (`thumbs.js`). |

## 3. Run it

```bash
# Postgres running somewhere; then
cp server/.env.example server/.env      # fill values (never commit .env)
npm install                             # root postinstall installs server deps
npm start                               # http://127.0.0.1:8080  (use 127.0.0.1, not localhost – see api.js)
```
Opening `betting/index.html` as a file runs a full **demo mode** (everything simulated in localStorage, same pay tables).

### Environment variables (Railway service `api`, project `letbetafrika`)
`DATABASE_URL, JWT_SECRET, PORT, NODE_ENV, SITE_URL, SUPPORT_EMAIL, SMS_PROVIDER, EMAIL_PROVIDER, PAYMENTS_MODE, REQUIRE_KYC, PGSSL, LOG_LEVEL`
plus for real data:
- `ODDS_PROVIDER=oddsapi`
- `ODDS_API_KEY=<The Odds API key>` – **set it in Railway variables only, never in git** (the owner has it)
- `ODDS_LEAGUES` (optional, comma list of sport keys, default top 5 leagues + UCL), `ODDS_REGION` (default `uk`), `ODDS_LIVE_FRESH_SEC` (default 90)
- `THESPORTSDB_KEY` (optional; free key `123` is the default)
- `GAMES=off` (optional) stops the game schedulers on a replica (e.g. a worker that must not run them).

Email (see §7 step 1 and `server/EMAILS.md`): `EMAIL_PROVIDER` = `console` (default: logs only) | `smtp` | `resend` | `sendgrid`,
`EMAIL_FROM`, and for SMTP `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 TLS), `SMTP_USER`, `SMTP_PASS`, optional `SMTP_SECURE=true`;
or `RESEND_API_KEY` / `SENDGRID_API_KEY`. Secrets go in Railway variables only.

Game limits and prizes live in the `settings` table (editable with `PUT /api/admin/settings/:key`):
`games` = min/max stake per country (NG ₦100–₦500,000, GH GH₵1–GH₵5,000), `max_payout`, `jackpot` = jackpot,
11-correct and 10-correct prize and line price per country, `welcome_bonus` = 200% of the first deposit (max ₦100,000 /
GH₵1,000), released after 5× turnover on multiples with every selection at 1.50+ within 14 days, `referral` = Refer &
Earn reward per country (₦1,000 / GH₵10).

## 4. Status – what works (tested)

- **All UI screens** rebuilt side by side against SportyBet at iPhone size: home, live, sports filter, lists, league,
  match, betslip, jackpot, promotions + detail, results, Code Hub, bet detail, Me, account pages, deposit/withdraw,
  games lobby, every game. Dark mode. Desktop 3-column with Over/Under 2.5 column. WCAG AA contrast pass.
- **Real odds feed** (`oddsapi.js`): h2h + totals per league (2 credits); goal model fitted to de-vigged bookmaker
  consensus; every other market derived (DC, GG/NG, O/U lines, team totals, odd/even, correct score, handicaps).
  Credits spread evenly over the month. Live markets **suspended unless score is fresh** (anti-exploitation).
  Finished → settled automatically; postponed → cancelled/refunded. Admin: `GET /api/admin/feed`.
  **No past-posting:** a pre-match price is refused once the game has kicked off.
- **Real crests** for clubs (TheSportsDB thumbnails, cached, pinned IDs for ambiguous names) and **real flags** everywhere.
- **Money**: register/login with SMS OTP, deposit (demo provider), withdraw (admin approval), transfer to friend,
  bets single/multiple with win boost, cashout, booking codes. Payout tests pass (exact to the cent, void legs,
  refunds, cashout, no double pay, ledger = balance).
- **All 11 games are live for real money** – see §6. Nothing simulated in live mode: Rocket Crash shows only real
  players' bets, the jackpot shows only real settled rounds.
- **Game screens look and move like real casino games** (`scenes.js`): rolling 3D dice, a wheel that decelerates with a
  ticking flapper, blurred slot reels that bounce to a stop, a keno globe that blows balls out, scratch foil you rub off
  with a finger, flipping playing cards, a penalty taker in a floodlit stadium, and a Rocket Crash rocket that climbs
  through a star field and explodes. Casino chips set the stake. **Players never see technical internals** (no seeds,
  hashes, formulas or server names) – each game has a plain-language *How to play* sheet with its pay table and RTP.
- **Only real data in live mode**: the match *Market view* shows the fair chances implied by the live prices (margin
  removed), not invented statistics; Code Hub lists real booking codes with real load counts; the **welcome bonus**
  (200% of the first deposit, released after wagering) and **Refer & Earn** (paid once the friend has staked the reward
  amount) are fully automatic; Acca Win Boost counts only selections at odds 1.20+. Pre-match odds lock at kick-off.
- **YOU WON trophy** (`Pages.trophy({ amount, source, ref, href })`): full-screen celebration over the dimmed app with
  **our own 3D-rendered trophy** (gold cup engraved with the LB monogram + ball in a laurel, green lacquer plinth with
  the LetBet|Afrika wordmark, light bursting out of the cup), counting amount, confetti, *Details* and *Show Off*.
  Fires on: sports and Virtual League bets settling as won (live polling every 30 s anywhere in the app, once per
  ticket), Instant Football wins, and every game win of **2x or more** (smaller game wins get an in-game banner +
  confetti, so the screen is not shown for a 1.2x spin). The image is pre-cached when the app is idle.

## 5. The Odds API – important facts

- Owner's key is on the **FREE plan: 500 credits/month**. Odds refresh roughly daily for 6 leagues; live scores
  ~every 10–30 min, so live betting stays suspended. **Upgrading the plan speeds everything up automatically**
  ($30 = 20K credits, $59 = 100K credits per month – confirm on the-odds-api.com).
- It has **no crests, no flags, no match minute, no NPFL / Ghana Premier League**. Minute is estimated from kick-off.
- Test without spending credits: run the mock (`ODDS_API_BASE=http://127.0.0.1:9099/v4`) – see §9.

## 6. How the games work (all server-authoritative)

Golden rules: the stake is taken **before** the result is drawn; results come from the OS **CSPRNG**
(`crypto.randomInt`) or a committed seed; money only moves through `wallet.js` in one transaction with the
`game_bets` record; nothing is trusted from the client. Return to player (exact, `GameLogic.rtp()`):

| Game | Route | Server | RTP |
|---|---|---|---|
| Rocket Crash | `#/play` | shared rounds, `GET /api/games/crash/state`, `POST crash/bet` `{stake, auto}`, `crash/cancel`, `crash/cashout` | 97% at any target |
| Lucky Dice | `#/game/dice` | `POST /api/games/dice/play {stake, choice: under\|seven\|over}` | 95.0% |
| Spin & Win | `#/game/spin` | `POST /api/games/spin/play {stake}` | 95.5% |
| Penalty Kick | `#/game/penalty` | `{stake, choice: left\|centre\|right}` | 96.0% |
| Number Rush (slot) | `#/game/rush` | `{stake}` | 94.8% |
| Keno | `#/game/keno` | `{stake, choice: [1–5 numbers 1–40]}` | 94.4–95.0% |
| Scratch Cards | `#/game/scratch` | `{stake}` – the card is decided at purchase, the player scratches to reveal | 95.0% |
| Hi-Lo | `#/game/hilo` | `POST /api/games/hilo/deal` → signed single-use card; `POST hilo/play {stake, choice, deal}` | 94.9% |
| Instant Football | `#/instant` | `GET /api/virtuals/instant/round` (sealed round token), `POST /api/virtuals/instant/play` | ~92% margin pricing |
| Virtual League | `#/virtuals` | rounds of 6 matches every 2 min are **normal events** (sport `vfootball`), bet via `/api/bets/place`, settled by `settleEvent()` | ~94% margin pricing |
| Weekly Jackpot | `#/jackpot` | `GET /api/jackpot/round`, `POST /api/jackpot/tickets`, `GET /api/jackpot/results` | prize table |

- **Rocket Crash**: every round is fixed before betting opens – a random seed is drawn and stored with `hash = SHA-256(seed)`;
  `point = crashPoint(HMAC-SHA256(seed, "LetBetAfrika Rocket Crash")` first 13 hex digits `/ 2^52)`. **Players only see
  round ids, phases and crash points** – seeds, hashes and formulas are never sent to the browser. For disputes and
  regulator checks the admin audit `GET /api/admin/games/crash/verify/:id` recomputes the point from the stored seed.
  Bets close at take-off (checked in SQL), cash-out uses the server clock, auto cash-outs are paid by the scheduler as
  the multiplier passes them, one live bet per player per round, a cancelled bet can be replaced. Rounds: 6 s betting,
  flight `crashFlyMs(point)`, 2.2 s pause.
- **Instant Football** rounds are **sealed tokens** (AES-256-GCM, key derived from `JWT_SECRET`): opaque to the player,
  tamper-proof, valid 15 min, and held in no server memory – any replica can serve the play. The token's nonce is the
  `game_bets` id, so a round can be played once (tested across two servers).
- **Schedulers** (`server/src/games/index.js`) run only on the **leader** replica (Postgres advisory lock,
  `lib/leader.js`): crash every 200 ms, Virtual League every 1 s (opens the next round before playing the due one),
  jackpot settlement every 30 s, welcome-bonus expiry every 60 s. Every replica serves the API; crash state is cached
  for 150 ms. **`GET /health` reports them**: `schedulers.leader` (is this replica the leader), `ok.<name>` (last
  successful run) and `err.<name>` (last error, cleared on the next success).
- **Weekly Jackpot**: the server fixes each round's 12 games (next 12 football fixtures with prices, created on
  demand); a round closes at its first kick-off; tickets must cover exactly those games. When all 12 are over it is
  graded with the line polynomial (`tiers()`): 12 correct share the jackpot equally, 11 and 10 correct win a fixed
  prize per line (settings `jackpot`). A cancelled game, or one unfinished 48 h after kick-off, gets a random result
  weighted by its 1X2 prices. Tickets bought before rounds existed are graded on their own 12 games.
  Admin: `POST /api/admin/jackpot/settle {round}` settles now; `GET /api/admin/games` shows today's turnover/payouts.
- **Rate limits**: plays are limited **per player** (150/min) because many players share one mobile-carrier IP;
  the crash state feed is not limited (it is a shared cached response). Sign-in, sign-up, code and password-reset
  requests are limited **per phone number** (6 codes / 10 attempts per 15 min → `too_many_attempts`) with a generous
  per-IP cap (1,000 per 15 min); signed-in account calls such as `/auth/me` are never capped (the app polls them).

## 7. NEXT DEV – priority work list (owner's plan, in order)

The site is wired end to end. The owner's next steps are **SMTP → payments → admin portal**. Exact hook points:

1. **SMTP email** (code is ready – only configuration is needed):
   - Railway variables: `EMAIL_PROVIDER=smtp`, `EMAIL_FROM="LetBetAfrika <no-reply@your-domain>"`, `SMTP_HOST`, `SMTP_PORT`
     (587, or 465 with TLS), `SMTP_USER`, `SMTP_PASS`. Sending lives in `server/src/emails/index.js` (`deliver()`,
     nodemailer); every send is logged in `email_log` and a failed email never fails a bet or a payment.
   - Test it: `POST /api/admin/email/test {"to": "you@example.com"}` (admin token) – answers `{ok, provider}` or the
     SMTP error. Set SPF, DKIM and DMARC on the sending domain (see `server/EMAILS.md`).
   - Players add their email under **Me → Email & Password** or on **Verify ID** (`POST /api/auth/email`, stored
     lower-case in `users.email`); sign-up stays phone-only like SportyBet, and SMS covers sign-up codes.
2. **Payments** (Paystack / Flutterwave cards + bank, MTN MoMo / Vodafone Cash for Ghana, OPay):
   - `POST /api/wallet/deposit` already creates a `payments` row; with `PAYMENTS_MODE` ≠ `demo` it stays `pending`.
     Return the provider's checkout URL / USSD / MoMo prompt from there; the deposit screens in `betting/account.js`
     show it (each method's spot is marked with a `PROVIDER:` comment).
   - Add `POST /api/payments/webhook/<provider>`: verify the signature, find the pending payment by reference, then in
     **one transaction** (`SELECT … FOR UPDATE`, only if still `pending`) mark it `success` and call
     **`creditDeposit(c, user, amount, paymentId, {method})`** from `server/src/lib/bonus.js` – the only function that may
     credit a deposit (it also grants the welcome bonus on the first one). Webhooks repeat: make it idempotent.
     `POST /api/admin/payments/:id/approve` already does exactly this for a manual approval – copy it.
   - Withdrawals: the balance is debited at request time (`payments` kind `withdrawal`, `pending`); the admin approves
     (send the payout through the provider's transfer API there) or rejects (refunds automatically).
   - Once a provider is live set `PAYMENTS_MODE` to it on production; keep `PAYMENTS_MODE=demo` only on a staging
     environment (demo credits deposits instantly).
3. **Admin portal** – the API exists (`server/src/routes/admin.js`, every route needs `role=admin`):
   `GET /overview` (KPIs), `GET /users`, `PATCH /users/:id` (status, KYC, role), `POST /users/:id/adjust` (manual
   balance correction through the ledger), `GET /payments?status=pending`, `POST /payments/:id/approve|reject`,
   `GET /bets`, `POST /bets/:id/void`, `POST /markets/:eventId/:key` (suspend/reopen), `POST /events/:id/result`
   (manual result → settles), `GET/PUT /settings/:key` (stake limits, jackpot prizes, welcome bonus, referral),
   `GET /feed` (odds credits), `GET /games` (turnover/payouts per game), `GET /games/crash/verify/:id` (round audit),
   `POST /jackpot/settle`, `POST /email/test`. Build it as a separate page (e.g. `betting/admin.html`) on the same API,
   behind admin login + 2FA; log every admin action.
4. **10,000 concurrent users**:
   - Every route is already replica-safe (no server memory; Instant Football and Hi-Lo use signed/sealed tokens; the
     schedulers run on one elected leader).
   - Cache `/api/events` in memory per replica, rebuilt every 2–5 s, pre-gzipped, with ETag/304 (clients poll every 5 s).
   - Rocket Crash: replace polling with Server-Sent Events from the leader (state changes ~5 times per round).
   - Postgres pool size per replica (pool × replicas < max_connections); Railway: raise `numReplicas`.
   - Load test with autocannon/k6 (e.g. 2,000 req/s on events, 50 bets/s, 500 crash players) → `docs/LOADTEST.md`.
5. **Trophy extras**: a "My Wins" list and badge on the Me page; optional win sound with a mute toggle; a "Show Off"
   share image (canvas → PNG with amount, trophy and booking code) instead of plain text.
6. **Crests from team websites (owner request)**: research each club's official site for its crest, store the URL
   (or a licensed copy) in `team_logos` / the `PIN` map in `server/src/lib/logos.js`. Club crests are trademarks –
   the operator must confirm usage rights. Cover all clubs in enabled leagues; keep thumbnails ~40 KB.
7. **Games polish**: game history page on Me (data: `GET /api/games/history`), jackpot roll-over policy if the
   operator wants one (today the jackpot is guaranteed every round and shared, no roll-over is promised anywhere),
   responsible-gambling limits per game (loss limits).
8. Other providers: SMS (Termii), KYC (Smile ID) – search for `PROVIDER:`.

## 8. Deploy

Railway project `letbetafrika` (workspace "My Projects"), environment `production`, service `api`
(source: GitHub `kwakurichplug/my-website`, branch **`claude/bold-mccarthy-71siq8`**, root `/`, builder Railpack,
start `npm start`, healthcheck `/health`). Postgres is the `Postgres` service in the same project.
The schema (`server/src/db/schema.sql`) is applied on every boot, so it must stay **idempotent** – when you change an
index or constraint, edit the original statement too (a later `DROP` is not enough: the original line runs first).

**Pushing does NOT deploy automatically** (the GitHub trigger did not fire for this branch). To deploy:
- Railway dashboard → `api` → *Deployments* → *Deploy latest commit*; or
- reconnect the source to the branch (dashboard *Settings → Source*, or the Railway MCP `connect-service-source`),
  which builds the branch head; or the CLI `railway up` from the repo root.
Then check *Deployments* shows the new commit hash, open `/health` (`schedulers.ok` shows crash, virtual, jackpot and
bonuses with recent times), and `GET /api/games/crash/state` (a round id that keeps increasing).

`ODDS_PROVIDER=oddsapi` and `ODDS_API_KEY` are set in Railway variables. Recommended: fix the GitHub trigger
(Railway *Settings → Source → Branch / Wait for CI*), create a `staging` environment, and only promote to
production after QA.

## 9. Testing

- `cd server && node --test test/grade.test.js test/games.test.js` – market grading; game maths (exact RTP of every
  table, Monte Carlo check of the real `play()` code with the CSPRNG, crash fairness, jackpot line counting).
- `API_URL=… DATABASE_URL=<test db> node --test --test-concurrency=1 test/payout.test.js test/games-api.test.js test/account-api.test.js`
  – money flow through the API (needs a running server on a **test** database with `PAYMENTS_MODE=demo`; each run uses
  ~20 open football fixtures – the jackpot and past-posting tests skip with a message when the test database has run out).
  Covers every game, the crash audit (admin only), welcome bonus, referral, Code Hub, boost, payouts and the ledger.
- Browser (Playwright, pre-installed in cloud sessions): `tools/qa/smoke.js` (every route, demo + live: no JS errors,
  no horizontal scroll, no empty page), `e2e_games.js` (every game against the real API, server balance checked
  after each play), `e2e_games_demo.js`, `e2e_instant.js`, plus account/pages e2e, axe-core, alignment.
- Two-replica check: start a second server on another port against the same database – only one reports
  `schedulers.leader: true`, and an Instant Football round opened on one can be played on the other (once).
- Mock Odds API: serve a recorded `/v4/sports/<key>/odds` sample and `/scores`, point `ODDS_API_BASE` at it.
- In sandboxed cloud sessions Node `fetch` needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## 10. Conventions

No build tools or frameworks. Escape all data with `esc()`. Money only moves through `server/src/lib/wallet.js`
(`move`/`debit`) inside a transaction. Results are drawn only after the stake is taken. Never put secrets in git.
No model names in commits. Our brand only – never another operator's logo, mascot or artwork.
