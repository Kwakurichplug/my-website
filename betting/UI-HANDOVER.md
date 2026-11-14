# LetBetAfrika – UI handover

This document is for the agent (or developer) continuing the **front-end**.
A second agent is building the **backend** at the same time on the same repo.
Read the "Working alongside the backend" section before changing anything.

---

## 1. What this is

A mobile-first sportsbook web app for Nigeria (₦) and Ghana (GH₵), modelled
screen-by-screen on SportyBet's mobile site (`sportybet.com/ng/m`), in the
LetBetAfrika brand (green `#0a7d3e`, gold `#ffc20e`).

It is a **static front end**: plain HTML/CSS/JS, no build step, no framework.
Open `betting/index.html` in a browser and it runs. All matches, odds, scores,
accounts and money are currently **simulated in the browser** (localStorage).
The backend agent is replacing that simulation with real APIs.

Live preview (private, owner can share): https://claude.ai/artifact/KUA1TG78SCHMFFrWNxhUpr
Repo branch: `claude/sports-betting-ui-design-rdaeo4`

---

## 2. Files

| File | Lines | Purpose |
|---|---|---|
| `index.html` | ~430 | All page markup. One `<section class="page" id="page-X">` per screen; the router shows one at a time. Modals, drawer, betslip and bottom nav live at the end. |
| `app.css` | ~1500 | All styles. Appended in dated layers (`v5` … `v10`), later layers override earlier ones. New work goes at the **end** of the file in a new `/* v11 – … */` block. |
| `app.js` | ~1380 | Everything: data model, odds model, rendering, router, betslip, wallet, settlement, virtuals, results, account pages, live simulation. One IIFE. |
| `icons.js` | 166 | `window.LBA`: `crest(name, sport, big)`, `flag(code)`, `sport(id)`, `code(name)`, `setLogos(map)`. SVG team badges, flags and sport icons. |
| `games.js` | 208 | `window.Games`: `renderLobby(country)`, `initCrash(api)`. SVG game artwork and the Rocket Crash engine. |
| `motion.js` | 176 | `window.Motion`: `splash()`, `fly(rect, label)`, `countUp(el, from, to, fmt)`, `skeleton(page, kind)`, `goal(html)`, `confetti()`, `pullToRefresh(scope, fn)`, `bump(el)`. Respects `prefers-reduced-motion`. |
| `manifest.webmanifest` | | PWA manifest (name, theme colour, icons). |
| `img/` | | `banner-1/2/3.jpg` (+ `-gh` Ghana variants), `ball.png`, favicon + app icons. |
| `README.txt` | | Short user-facing notes. |

Script load order in `index.html`: `motion.js` → `icons.js` → `games.js` → `app.js`.

---

## 3. Design system (do not drift from these)

All numbers were **measured from SportyBet's mobile page at 390px** and applied
as CSS variables in `app.css` (`v6` block). Keep using the variables.

| Token | Value | Used for |
|---|---|---|
| `--fs` | 13.06px | body text, team names, meta |
| `--fs-s` | 10.89px | league names, IDs, "+94 ›" |
| `--fs-t` | 15.24px | tabs, odds prices, buttons |
| `--fs-h` | 19.6px | section titles (Hot, Live, Sports) |
| `--side` | 12px | **the one gutter**. Every section starts and ends 12px from the screen edge. |
| `--ow` / `--og` | 67px / 1px | odds box width / gap (3 boxes = 203px) |
| `--ink` | `#1b1e25` | dark panels (live block, match page, Me header, games) |
| `--g` | `#0a7f32` | primary green (odds text, active tabs) – darkened from `#0d9737` in v15 to pass WCAG AA contrast |
| `--g-bg` | `#d6ebdc` | light-green odds boxes |
| `--live-g` | `#32ce62` | green on dark panels |
| `--brand` | `#0a7d3e` | header green |
| `--gold` | `#ffc20e` | Join Now, highlights |
| `--live` | `#e5163a` | HOT ribbon, badges, bottom-nav underline |

Fixed sizes: header 48px, buttons 30px, story tiles 70×70, shortcut row 64px
cells with 22px icons, category cards 113×52, featured card 343×137, odds box
67×37, market tabs 46px, column-header row 26px, bottom nav 52px, floating
betslip button 61px.

Fonts: Roboto (body), Kanit 800 italic (logo, game titles only).
Icons: inline SVG line icons, 24×24 viewBox, `stroke-width` 1.6–1.8. **No emoji.**

Alignment rule: run the alignment check (section 8) after any layout change.
Everything should report `L=12` (or `R=12` for right-aligned items).

---

## 4. Screens and where they live

| Route | Section id | Render function | Notes |
|---|---|---|---|
| `#/home` | `page-home` | `renderHome()` | tiles → icon row → category cards → Hot (league pills + featured cards) → dark Live block → Sports list → league accordion |
| `#/live` | `page-live` | `renderLive()` | sport tabs + league-grouped rows |
| `#/sports` | `page-sports` | `renderAZ(q)` | A–Z accordion |
| `#/league/:idx` | `page-league` | `renderLeague(idx)` | |
| `#/match/:id` | `page-match` | `renderMatch(id)` | dark page; Markets / Statistics / Form & H2H tabs; market groups |
| `#/virtuals` | `page-virtuals` | `renderVirtuals()` | 2-minute rounds |
| `#/jackpot` | `page-jackpot` | `renderJackpot()` | |
| `#/results` | `page-results` | `renderResults()` | |
| `#/promos` | `page-promos` | static | |
| `#/games` | `page-games` | `renderGames()` → `Games.renderLobby` | dark lobby |
| `#/play` | `page-play` | `Games.initCrash` | Rocket Crash |
| `#/me` | `page-me` | `renderMe()` | dark wallet panel + settings list |
| `#/acct/:sec` | `page-acct` | `renderAcct(sec)` | `bets, tx, bonus, refer, messages, verify, security, limits, help, how` |

Overlays: `#betslip` (bottom sheet on mobile, right column on desktop),
`#drawer` (side menu), `#searchOv`, modals `#loginModal #registerModal
#depositModal #codeModal #countryModal`, `#toast`, `#splash`.

Router: `route()` in app.js reads `location.hash`, toggles `.page.active`,
closes overlays, runs the page's render function, and adds the enter animation.
Add a new page by: adding a `<section class="page" id="page-NAME">`, adding
`'NAME'` to `PAGES`, and a `if (page === 'NAME') renderNAME();` line in `route()`.

---

## 5. Data model (what the backend will replace)

All in `app.js`:

- `COUNTRIES` / `C` / `CC` – country config (currency, stakes, phone code, banners). Country is stored in `localStorage.lba_country`.
- `SPORTS`, `LEAGUES` – reference data. `LEAGUES[i].flag` is an SVG string.
- `MATCHES[]` – every event. Key fields:
  `id, sport, lg (league idx), home, away, live, finished, kick (ms), score[2], minute, mk[] (markets), map{mk→{outcome→{l,o}}}, ft, ht`.
- `computeMarkets(m)` – builds `m.mk` / `m.map` from a Poisson model. **The backend will supply `mk`/`map` directly from the odds feed**; keep reading odds through `m.map[marketKey][outcomeKey].o`.
- `state` – `slip[]`, `bets[]`, `user{phone,balance,uid,verified}`, `tx[]`, `favs[]`, tabs/filters. Persisted per country via `store.get/set` (`localStorage.lba_<CC>_<key>`).
- Betslip item: `{ mid, mk, ok, odd, label, mname, match, live, stake, susp, chg }`.
- Bet: `{ id, at, type, legs[], stake, odds, boost, win, status: open|won|lost|void|cashout, paid }`.
- `simTick()` every 4s: advances live matches, goals, odds drift; `settleBets()` settles finished matches. **This whole block goes away when live data arrives.**

Markets per football match: `1x2, dc, dnb, gg, next (live), ou, hou, aou, oe, 1h1x2, 1hou, htft, cs, eh-1, eh+1, cor`. Two-way sports: `win, hcp, tot`.
Outcome labels on the match page read Home/Draw/Away; list columns read 1/X/2 (`listMarkets()`).

---

## 6. Working alongside the backend (important)

The backend agent is working **on the same repo, on branch `backend`**, and
will add a `server/` folder plus a small `betting/api.js`. To avoid merge
conflicts:

**Do**
- Work on your own branch from `claude/sports-betting-ui-design-rdaeo4` (e.g. `ui-next`).
- Keep changes in `index.html`, `app.css`, `icons.js`, `games.js`, `motion.js`, `img/`.
- In `app.js`, change **render functions and event handlers** freely.
- Append CSS at the end of `app.css` in a new `/* v11 – … */` block instead of editing older blocks.
- Commit small and often with clear messages.

**Don't**
- Don't touch the "Country / currency", "Match generation", "Market model",
  "Match lifecycle & settlement", "Live simulation" or "Init" blocks in `app.js`,
  or the `store`/`state` definitions. The backend agent is replacing these.
- Don't rename element ids, `data-*` attributes or CSS class names that `app.js`
  reads (search before renaming).
- Don't add a build tool, bundler or framework.
- Don't add real club logos, league logos or copyrighted images (licensing).
  Use `LBA.crest()`; the backend will call `LBA.setLogos()` with licensed URLs.
- Don't add new hosts/CDNs. Fonts come from Google Fonts only.

When the backend lands, `app.js` will call `API.*` functions instead of
`MATCHES` generation; the render code you write keeps working as long as it
reads from `MATCHES`, `state` and `m.map` as today.

---

## 7. Suggested next UI work (in priority order)

1. **Desktop pass** – measure SportyBet desktop (`sportybet.com/ng/`, 1440px)
   and match it: 3-column layout exists already (`@media (min-width:1024px)`).
   Their desktop has a red top nav with a sports sub-nav, a left league list,
   a centre event table with goals dropdown, and a right betslip + promos column.
2. **Deposit / withdraw flows** – full screens (not just a modal): amount →
   method (card, bank transfer, USSD, OPay/PalmPay in NG; MTN MoMo, Telecel
   Cash in GH) → confirmation → receipt. The backend will provide the
   `POST /wallet/deposit` call; build the screens against the modal's current fields.
3. **Register / login as full pages** with OTP step (phone → 6-digit code →
   password). Backend will provide `POST /auth/otp` and `POST /auth/verify`.
4. **Bet detail page** (`#/bet/:id`) from Bet History: legs, status per leg,
   cashout button, share ticket image.
5. **Jackpot** – measure SportyBet's "Sporty 12" page and match it.
6. **Promotions** – real promo detail pages with T&Cs.
7. **More games** – Penalty Kick, Spin & Win, Lucky Dice are "Soon"; build
   one at a time in `games.js` following the Rocket Crash pattern
   (`api.debit/credit/user/login/toast`).
8. **Empty / error / offline states** for every list.
9. **Accessibility** – labels on icon-only buttons, focus order in modals,
   colour contrast on the dark panels.
10. **Dark mode toggle** (SportyBet has one on the Me page).

---

## 8. How to test (do this before every commit)

Playwright is pre-installed in the cloud session. Scripts live in the scratchpad;
copy them into the repo under `betting/tests/` if useful. Minimum checks:

```js
// errors + no horizontal scroll at 390px
const { chromium, devices } = require('playwright');
const b = await chromium.launch(); const p = await b.newPage({ ...devices['iPhone 13'] });
await p.addInitScript(() => sessionStorage.setItem('lba_splash', '1'));  // skip splash
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file:///…/betting/index.html'); await p.waitForTimeout(800);
console.log(errs, await p.evaluate(() => document.documentElement.scrollWidth)); // [] 390
```

Flows that must keep working: pick 3 odds → betslip → Singles and Multiple →
Place Bet (login with any 10-digit number) → bet appears under Open Bets →
settles after matches finish; Rocket Crash bet + cash-out; country switch to
Ghana shows GH₵ everywhere.

Alignment check: for each page, log `getBoundingClientRect().left` of the
first element in every section; expect 12 (or 0 for full-bleed bars).

Compare against the reference by screenshotting `sportybet.com/ng/m/` at
iPhone 13 size and placing it side-by-side (the environment allows
`www.sportybet.com`, `s.sporty.net`, `cdn.sporty.net`).

---

## 9. Conventions

- Commit messages: imperative, first line < 70 chars, body explains *why*.
- No model names in commits or code.
- `esc()` every string that comes from data before putting it in HTML.
- Money: `money(n)` → "₦1,234.00", `whole(n)` → "₦1,234", `fmtN(n)` → "1,234.00".
- Toasts: `toast(msg)` / `toast(msg, 'err')`.
- Navigation: set `location.hash`, never call render functions from links.
- Country-specific text goes through `data-t="…"` spans and `applyCountry()`.

---

## 10. Update – November 2026 (account pages, reference rebuild, new games)

### New files

| File | Purpose |
|---|---|
| `account.js` | `window.Account`: full-page **sign up** (`#/register[/next]`, password rules, referral code, SMS code step), **login** (`#/login[/next]`, remember me), **forgot password** (`#/forgot`), **deposit** (`#/deposit/<tab>`) and **withdraw** (`#/withdraw/<tab>`). Calls the API in live mode, simulates in demo mode. `PROVIDER:` comments mark where a payment provider plugs in. |
| `pages.js` | `window.Pages`: screens rebuilt on the reference layout – **Live** (`#/live[/sport]`), **Sports filter** (`#/sports`), **event list** (`#/list/<sport>/<when>[/<lg,lg>\|out]`), **league** (`#/league/<idx>`), **Jackpot** (`#/jackpot[/results\|how\|tickets]`), **Promotions** (`#/promos[/tab]`, `#/promo/<id>`), **Results** (`#/results`), **Code Hub** (`#/codes`), **bet detail** (`#/bet/<id>`), **Instant Football** (`#/instant`). |
| `dark.css` | **Generated** dark theme. Never edit by hand – run `python3 betting/tools/gen-dark.py` after changing `app.css`. |
| `tools/gen-dark.py` | Maps every light surface / text / border colour in `app.css` to the dark palette. |

Script order: `api.js → account.js → pages.js → motion.js → icons.js → games.js → app.js`.
`app.js` exposes `window.LBA_APP` (state, data, render helpers, `live` flag) for the two modules;
the router hands a route to `Account.render` / `Pages.render` when they claim it.
The old login/register/deposit modals are gone – `openModal('loginModal' | 'registerModal' | 'depositModal')` now navigates to the pages.

### Design notes

- Inner pages use a 48px **brand-green header** (`.pg-head` / `.wl-head`) with back + actions, and hide the site top bar on phones, as the reference does. The reference's red is *their* brand – keep ours green.
- CSS layers added: `v11` account pages, `v12` reference pages, `v13` Me header/theme toggle, `v14` Instant Football, `v15` contrast, `v16` desktop O/U columns.
- Desktop (≥1024px) shows **Over/Under 2.5 beside 1X2** in every list (`exCols` / `exHead` in `app.js`).
- Dark mode: toggle on the Me page, saved in `localStorage.lba_theme`, applied in `<head>` before first paint.
- Offline banner appears when the connection drops.

### Server endpoints added

| Endpoint | What it does |
|---|---|
| `POST /api/wallet/transfer` | Transfer to Friend: moves money between two players in the same country through the ledger (`transfer_out` / `transfer_in`). |
| `POST /api/jackpot/tickets`, `GET /api/jackpot/tickets` | Buys a 12-game jackpot ticket (multi-pick lines × line price, ledger type `jackpot`) and lists the player's tickets. |
| `GET /api/virtuals/instant/round`, `POST /api/virtuals/instant/play` | Instant Football. The server prices the round, takes the stake, plays the round with a CSPRNG **after** the stake is taken, settles and pays. A round can be played once. |

Also fixed: live markets read from Postgres `jsonb` came back with re-sorted keys (Home/Away/Draw, Over/Under rows paired wrongly). `mapMarkets` now restores betting order.

### Testing used for this round

All in the cloud session with the pre-installed Playwright, against both `file://…/betting/index.html` (demo) and the API server on `http://127.0.0.1:8080/` (live) with a local Postgres:

- account flows (register with SMS code, login, reset, deposit per method, withdraw with ID check, transfer) – demo and live
- every rebuilt page (filters, collapse, outrights, jackpot purchase, promos, results day nav, Code Hub add-to-slip, bet detail rebet/cashout, Instant Football incl. replay protection)
- smoke test of 29 routes in both modes: no JS errors, no horizontal scroll
- axe-core WCAG 2 AA audit on 19 pages
- column-alignment check on phone and desktop
- side-by-side screenshots against the reference at iPhone 13 size

Note: `localhost:<port>` is treated as "no server" by `api.js` – use `127.0.0.1` when testing live mode locally.

### Still open

- Payment provider (Paystack/Flutterwave, MoMo collections), SMS provider, KYC provider – the UI flows are ready; see `PROVIDER:` comments.
- Outright **betting** (prices are shown; placing needs server markets).
- More games (Penalty Kick, Spin & Win, Lucky Dice) and an Aviator-style lobby entry.
