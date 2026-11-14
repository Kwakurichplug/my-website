# LetBetAfrika – Project Handover (read this first)

> **The standard:** this is a paid, commercial-grade product. Every task must meet `docs/QUALITY-BAR.md`
> (Definition of Done) – official, professional, nothing fake, money always correct.
>
> **Live site:** https://api-production-2673beb3.up.railway.app (Railway project `letbetafrika` → service `api`, source branch `claude/bold-mccarthy-71siq8`).
> **Deploys are NOT automatic on push** – trigger them as described in §7.
>
> **New here?** Read this file, then `docs/LEARNING.md` (what to learn, where, and where it lives in the code),
> then `betting/UI-HANDOVER.md` (design system). QA scripts: `tools/qa/README.md`.

## 1. The vision

LetBetAfrika is a **top-tier mobile-first sportsbook for Nigeria (₦) and Ghana (GH₵)**, modelled screen by screen on
SportyBet's mobile site, in our own brand (green `#0a7d3e`, gold `#ffc20e`). The goal is a **full working full-stack
product**: real odds, real scores, real crests and flags, real money through a ledger, every game playable for real,
trophies and celebration on wins, and an architecture that holds **10,000 simultaneous users**.

Rule of thumb for every decision: *does it look and behave like a top African sportsbook, and is the money correct?*

## 2. Repository layout

| Path | What it is |
|---|---|
| `betting/` | Static front end (HTML/CSS/JS, no build step). Served by the API server. |
| `betting/index.html` | All page markup. |
| `betting/app.js` | Core: data model, router, betslip, home, match page, account sub-pages, live-API bridge. Exposes `window.LBA_APP`. |
| `betting/account.js` | Sign up (SMS code), login, reset password, deposit, withdraw (per country). |
| `betting/pages.js` | Live, Sports filter, lists, league, Jackpot, Promotions, Results, Code Hub, bet detail, Instant Football, **YOU WON trophy** (`Pages.trophy()`), offline banner. |
| `betting/game-logic.js` | **Shared game rules + pay tables** (browser and server). See §6. |
| `betting/games.js` | Games lobby art + Rocket Crash UI (currently client-side – see §6). |
| `betting/icons.js` | Flags (real flag-icons SVGs), crests (real logos when known, drawn fallback), sport icons. |
| `betting/app.css` | Styles in versioned layers `v5…v18` (v18 = trophy) – append new work at the end. |
| `betting/dark.css` | **Generated** dark theme – run `python3 betting/tools/gen-dark.py` after any CSS change. |
| `betting/img/flags/` | flag-icons (MIT) – 270 country flags. |
| `betting/img/trophy.webp` | Realistic gold trophy for the win screen (generated in Canva; the SVG trophy in `pages.js` is the fallback). |
| `betting/UI-HANDOVER.md` | Detailed front-end guide (design tokens, screens, conventions). |
| `server/` | Node 20+ Express API + Postgres. `npm start` in repo root runs it and serves `betting/`. |
| `server/src/feeds/oddsapi.js` | **Real odds + scores** from The Odds API (budget-aware). |
| `server/src/feeds/demo.js` | Simulated feed for demos (`ODDS_PROVIDER=demo`). |
| `server/src/lib/logos.js` | Real club crests via TheSportsDB, cached in `team_logos`. |
| `server/src/lib/settle.js` | Grading + settlement + cashout. |
| `server/src/routes/*` | auth, wallet, bets, events, admin, jackpot, virtuals (Instant Football). |
| `server/test/` | `grade.test.js` (unit), `payout.test.js` (money flow integration). |
| `docs/QUALITY-BAR.md` | **Definition of Done** – professional acceptance checklist for every area. |
| `docs/LEARNING.md` | **Learning guide** – topics, links, and code locations for every task. |
| `tools/qa/` | Playwright QA scripts, SportyBet side-by-side tool, mock Odds API + real EPL fixtures. |

## 3. Run it

```bash
# Postgres running somewhere; then
cp server/.env.example server/.env      # fill values (never commit .env)
npm install                             # root postinstall installs server deps
npm start                               # http://127.0.0.1:8080  (use 127.0.0.1, not localhost – see api.js)
```
Opening `betting/index.html` as a file runs a full **demo mode** (everything simulated in localStorage).

### Environment variables (Railway service `api`, project `letbetafrika`)
`DATABASE_URL, JWT_SECRET, PORT, NODE_ENV, SITE_URL, SUPPORT_EMAIL, SMS_PROVIDER, EMAIL_PROVIDER, PAYMENTS_MODE, REQUIRE_KYC, PGSSL, LOG_LEVEL`
plus for real data:
- `ODDS_PROVIDER=oddsapi`
- `ODDS_API_KEY=<The Odds API key>` – **set it in Railway variables only, never in git** (the owner has it)
- `ODDS_LEAGUES` (optional, comma list of sport keys, default top 5 leagues + UCL), `ODDS_REGION` (default `uk`), `ODDS_LIVE_FRESH_SEC` (default 90)
- `THESPORTSDB_KEY` (optional; free key `123` is the default)

## 4. Status – what works (tested)

- **All UI screens** rebuilt side by side against SportyBet at iPhone size: home, live, sports filter, lists, league,
  match, betslip, jackpot, promotions + detail, results, Code Hub, bet detail, Me, account pages, deposit/withdraw,
  Instant Football, games lobby. Dark mode. Desktop 3-column with Over/Under 2.5 column. WCAG AA contrast pass.
- **Real odds feed** (`oddsapi.js`): h2h + totals per league (2 credits); goal model fitted to de-vigged bookmaker
  consensus; every other market derived (DC, GG/NG, O/U lines, team totals, odd/even, correct score, handicaps).
  Credits spread evenly over the month. Live markets **suspended unless score is fresh** (anti-exploitation).
  Finished → settled automatically; postponed → cancelled/refunded. Admin: `GET /api/admin/feed`.
- **Real crests** for clubs (TheSportsDB thumbnails, football only, cached, pinned IDs for ambiguous names) and
  **real flags** everywhere; national teams show their flag as crest.
- **Money**: register/login with SMS OTP, deposit (demo provider), withdraw (admin approval), transfer to friend,
  bets single/multiple with win boost, cashout, booking codes, jackpot tickets, Instant Football (server-authoritative).
  Payout tests pass (exact to the cent, void legs, refunds, cashout, no double pay, ledger = balance).
  Fixed: cashout over-paid on multiples with a void leg.
- **YOU WON trophy** (`Pages.trophy({ amount, source, ref, href })`): full-screen celebration with a realistic gold
  trophy, light rays, sparkles, counting amount, confetti, *Details* and *Show Off* (native share). Fires when a bet
  settles as won (demo settlement and live polling – once per ticket, stored in `localStorage.lba_trophies`) and on
  Instant Football wins.

## 5. The Odds API – important facts

- Owner's key is on the **FREE plan: 500 credits/month**. Odds refresh roughly daily for 6 leagues; live scores
  ~every 10–30 min, so live betting stays suspended. **Upgrading the plan speeds everything up automatically**
  ($30 = 20K credits, $59 = 100K credits per month – confirm on the-odds-api.com).
- It has **no crests, no flags, no match minute, no NPFL / Ghana Premier League**. Minute is estimated from kick-off.
  NPFL/Ghana leagues are hidden in live mode until a provider covers them (API-Football does – owner chose free sources for now).
- Test without spending credits: run the mock (`ODDS_API_BASE=http://127.0.0.1:9099/v4`) – see §8.

## 6. NEXT DEV – priority work list (owner's requests, in order)

1. **All games real-money and server-side** (in progress):
   - `betting/game-logic.js` is done: rules + pay tables for Lucky Dice, Spin & Win, Penalty Kick, Number Rush (slot),
     Keno, Scratch Cards, Hi-Lo, and Rocket Crash maths. Every table is tuned to **~95–96% RTP** (exact values were
     computed; Keno top prizes solved per pick count). Load it in the server with `createRequire`.
   - `game_bets` table already added to `server/src/db/schema.sql`.
   - TODO `server/src/routes/games.js`: `POST /api/games/:game/play {stake, choice}` → debit `game_bet`, run
     `GameLogic.play(game, csprng, choice)`, credit `game_win` = stake × mult, insert `game_bets`. Hi-Lo: `POST /deal`
     returns an HMAC-signed token (card + nonce + expiry); play verifies it and uses the nonce as the `game_bets.id` (replay-proof).
   - TODO **Rocket Crash, provably fair, multi-server safe**: round k crash point = `crashPoint(HMAC(GAME_SECRET, k))`;
     round start times are computed deterministically (wait 6s + fly `crashFlyMs(point)` + 2.2s) from a stored epoch,
     so every replica agrees. `POST /games/crash/bet`, `POST /games/crash/cashout` (server clock decides the
     multiplier), a resolver pays auto-cash-outs and marks losses with `UPDATE … WHERE status='open' RETURNING`.
     Show **real** round bets (masked), not simulated players. Wire `games.js` to these endpoints in live mode.
   - TODO UIs for the 7 "Soon" games in `games.js` (route e.g. `#/game/<id>`), each with stake chips, animation and result.
   - TODO **Virtual League server-side**: fixtures every 2 min (`ext_id vl:<round>:<i>`, sport `vfootball`), seeded
     results at kick-off, settled by the normal bet engine; remove the "Virtuals are not open for real bets" block in
     `livePlaceBet`; make `renderVirtuals` read server events in live mode; exclude `vfootball` from `/events/results` default.
2. **Trophy after wins** – DONE for sports bets and Instant Football (`Pages.trophy()`, see §4). Remaining:
   call `Pages.trophy()` for Rocket Crash cash-outs, jackpot prizes and every new game win; add a "My Wins" list and
   badge on the Me page; optional win sound with a mute toggle; generate a "Show Off" share image (canvas → PNG with
   amount, trophy and booking code) instead of plain text.
3. **Crests from team websites (owner request)**: research each club's official site for its crest, store the URL
   (or a licensed copy) in `team_logos` / the `PIN` map in `server/src/lib/logos.js`. Club crests are trademarks –
   the operator must confirm usage rights. Cover all clubs in enabled leagues; keep thumbnails ~40 KB.
   The owner said to spend credits generously to do a decent job.
4. **10,000 concurrent users**:
   - Cache `/api/events` in memory per replica, rebuilt every 2–5 s, pre-gzipped, with ETag/304 (clients poll every 5 s).
   - Keep all game/round state in Postgres or deterministic from secrets (no in-memory Maps – Instant Football's
     round Map in `routes/virtuals.js` must move to a table or signed token before running >1 replica).
   - Postgres pool size per replica, indexes already added; Railway: raise `numReplicas`; rate limits per user.
   - Load test with autocannon/k6 (e.g. 2,000 req/s on events, 50 bets/s) and record results.
5. **Typography / alignment audit**: measure computed font sizes on every page and normalise to the tokens in
   `betting/UI-HANDOVER.md` §3; flags 4:3, crests consistent; run the column-alignment check (§8).
6. Providers: payments (Paystack/Flutterwave, MoMo), SMS (Termii), KYC (Smile ID) – search for `PROVIDER:`.

## 7. Deploy

Railway project `letbetafrika` (workspace "My Projects"), environment `production`, service `api`
(source: GitHub `kwakurichplug/my-website`, branch **`claude/bold-mccarthy-71siq8`**, root `/`, builder Railpack,
start `npm start`, healthcheck `/health`). Postgres is the `Postgres` service in the same project.

**Pushing does NOT deploy automatically** (the GitHub trigger did not fire for this branch). To deploy:
- Railway dashboard → `api` → *Deployments* → *Deploy latest commit*; or
- reconnect the source to the branch (dashboard *Settings → Source*, or the Railway MCP `connect-service-source`),
  which builds the branch head; or the CLI `railway up` from the repo root.
Then check *Deployments* shows the new commit hash and open `/health`.

`ODDS_PROVIDER=oddsapi` and `ODDS_API_KEY` are set in Railway variables. Recommended: fix the GitHub trigger
(Railway *Settings → Source → Branch / Wait for CI*), create a `staging` environment, and only promote to
production after QA. To return to the `backend` branch, merge this branch into it first, then switch the source.

## 8. Testing

- `node --test server/test/grade.test.js` – market grading.
- `API_URL=… DATABASE_URL=<test db> node --test server/test/payout.test.js` – money flow (needs running server, test DB).
- Browser tests used Playwright (pre-installed in cloud sessions): smoke all routes in demo (`file://`) and live
  (`http://127.0.0.1:8080`) – no JS errors, no horizontal scroll; e2e for account, pages, Instant Football;
  axe-core accessibility; header/odds column alignment on phone + desktop.
- Mock Odds API: serve a recorded `/v4/sports/<key>/odds` sample and `/scores`, point `ODDS_API_BASE` at it.
- In sandboxed cloud sessions Node `fetch` needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## 9. Conventions

No build tools or frameworks. Escape all data with `esc()`. Money only moves through `server/src/lib/wallet.js`
(`move`/`debit`) inside a transaction. Never put secrets in git. No model names in commits.
