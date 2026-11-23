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
2. **Deposit / withdraw flows** – DONE (full screens: Nigeria bank transfer confirmed by an admin, Ghana Mobile Money
   through the payment API; see *Deposit & withdraw* below and `docs/ADMIN.md`).
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
| `account.js` | `window.Account`: full-page **sign up** (`#/register[/next]`, password rules, referral code, SMS code step), **login** (`#/login[/next]`, remember me), **forgot password** (`#/forgot`), **deposit** (`#/deposit/<method>`: NG `transfer` · GH `momo` – live mode offers what `GET /api/wallet/options` says is open) and **withdraw** (`#/withdraw/<method>`: NG `bank` · GH `momo` · `friend`). Calls the API in live mode, simulates in demo mode. Server side: `server/src/lib/payments.js`, `routes/wallet.js`. |
| `pages.js` | `window.Pages`: screens rebuilt on the reference layout – **Live** (`#/live[/sport]`), **Sports filter** (`#/sports`), **event list** (`#/list/<sport>/<when>[/<lg,lg>\|out]`), **league** (`#/league/<idx>`), **Jackpot** (`#/jackpot[/results\|how\|tickets]`, live: server round + real results + ticket outcomes), **Promotions** (`#/promos[/tab]`, `#/promo/<id>`), **Results** (`#/results`), **Code Hub** (`#/codes`), **bet detail** (`#/bet/<id>`), **Instant Football** (`#/instant`). |
| `dark.css` | **Generated** dark theme. Never edit by hand – run `python3 betting/tools/gen-dark.py` after changing `app.css`. |
| `tools/gen-dark.py` | Maps every light surface / text / border colour in `app.css` to the dark palette. |

Script order: `api.js → account.js → pages.js → motion.js → icons.js → markets.js → game-logic.js → games.js → scenes.js → arcade.js → app.js`.
`app.js` exposes `window.LBA_APP` (state, data, render helpers, `live` flag) for the two modules;
the router hands a route to `Account.render` / `Pages.render` when they claim it.
The old login/register/deposit modals are gone – `openModal('loginModal' | 'registerModal' | 'depositModal')` now navigates to the pages.

### Design notes

- Inner pages use a 48px **brand-green header** (`.pg-head` / `.wl-head`) with back + actions, and hide the site top bar on phones, as the reference does. The reference's red is *their* brand – keep ours green.
- CSS layers added: `v11` account pages, `v12` reference pages, `v13` Me header/theme toggle, `v14` Instant Football, `v15` contrast, `v16` desktop O/U columns, `v17` real flags/crest sizes, `v18` trophy overlay, `v19` 3D trophy image + dimmed overlay, `v20` jackpot results, `v21` match *Market view*, bonus progress, Refer & Earn stats, `v22` game shell + every game scene (`.gx-*`), `v22b` Rocket Crash (`.cr-*`).
- Desktop (≥1024px) shows **Over/Under 2.5 beside 1X2** in every list (`exCols` / `exHead` in `app.js`).
- Dark mode: toggle on the Me page, saved in `localStorage.lba_theme`, applied in `<head>` before first paint.
- Offline banner appears when the connection drops.
- **Trophy** (`v18`/`v19`): `Pages.trophy({ amount, source, ref, href })` shows the YOU WON screen over the dimmed app,
  like the reference. The image is **our own 3D render** (`img/trophy-lb.webp` 900×1080, `trophy-lb-600.webp`; source and
  re-render steps in `tools/trophy/`): gold cup with the LB monogram + ball engraved in a laurel, green lacquer plinth with
  the LetBet|Afrika wordmark, light bursting out of the cup. Transparent WebP, pre-cached when the app is idle; the
  inline SVG trophy is only a fallback. Called for sports/virtual wins, Instant Football, and game wins of 2x or more.
- **Game screens** (`v22`, `arcade.js` + `scenes.js`): full-screen on phones (own header with back, *LetBet Originals*
  title and balance; site top bar and betslip button hidden), centre column on desktop. Layout `gx gx--<game>`:
  `gx-head` → `gx-hist` (your recent results) → `section.gx-stage` (`#gxScene` + `#gxResult` banner) → choices
  (`gx-pick`, penalty) → `gx-bet` (casino chips `gx-chipbtn c1…c4` that set the stake, `−`/`+`, stake box, one big play
  button `#gxGo`, or Higher/Lower for Hi-Lo) → *My plays* → `gx-sheet` *How to play* (rules in plain language, pay
  table, return to player). Clicks are delegated with `data-gx="minus|plus|chip|choice|play|hilo|info|close|kn|knquick|knclear|scall"`.
  The balance changes only after the animation so the result is never spoiled.
- **Scenes** (`window.Scenes` in `scenes.js`, helpers in `window.SceneKit`): each game has `html(ctx)`, `mount(el, ctx)`
  and `play(el, result, ctx)` → Promise that animates **to the server's result**. Dice = CSS 3D cubes (face map `SHOW`);
  Spin & Win = SVG wheel with peg/flapper spring physics; Number Rush = reel strips (Web Animations + motion blur +
  bounce); Keno = canvas globe with ball physics (drawn at 150 px, shown at 108 px); Scratch = canvas foil scratched
  with `destination-out`; Hi-Lo = SVG cards with a 3D flip; Penalty = canvas stadium (360×240 logical, tap the goal to
  aim). Game pieces are in `gen-dark.py`'s `SKIP` list so dark mode never repaints them.
- **Rocket Crash** (`v22b`, `games.js`): canvas with parallax stars, the rocket sprite (`img/games/rocket.webp`) with
  flame and glow, exhaust particles, a growing curve with tidy axes, and an explosion + *FLEW AWAY!* when it crashes;
  history chips, casino-chip stakes, auto cash-out, and *All bets this round* (real players only, masked numbers).
- **Lobby thumbnails** (`img/games/thumb-<id>.webp`, 300×300) are captured from the real scenes by
  `tools/assets/thumbs.js` with a Kanit title band – re-run it after changing a scene.
- **No technical internals on player screens**: no seeds, hashes, formulas, server or provider names – plain language only.
- **Betslip sheet** (`v26`, `app.js`): on phones the sheet tracks the finger – touchstart on `.bs-head`/`.bs-tools`/`.bs-tabs`
  (drag down), `#bsBody` (pull down only when scrolled to the top) or `#slipPill` (swipe up); move/end listen on the
  touched element so a live-odds re-render cannot break the gesture, and `renderSlip()` waits while `.dragging`.
  Release: open/close by distance (30% down, 28% up from the pill) and velocity (±0.45 px/ms), with the spring
  transition. `.bs-grab` handle, `html.slip-open` locks the page, rows animate with `.bs-in` / `.bs-out`.
- **Match page & market set** (`v25`, `markets.js` + `app.js`): see `MARKETS-FEATURE.md` at the repo root.
- **Market feature on our design** (`v27`, `app.css` + `app.js`): pre-match header is our green bar (`var(--brand)`,
  white title/icons, gold star when on); *Markets | Statistics | Match Info* are equal tabs with the 3px `--g` underline;
  the market groups (`#mdGroups`) stick under the header (`top: calc(var(--top-h) + 48px)`, 138px on desktop) and the
  three tabs scroll away. Info (`INFO`) and favourite (`STAR`) are line icons – outline, filled gold when on. The list
  Over/Under line cell (`.odd.lsel`) is a neutral grey picker: tap opens `#lineModal` (rows `.ln-row`, `data-lpick=
  "<mid>|<mk>|<line>"`, current line `.on`) listing every open line with its Over/Under prices; picking sets
  `m.uiLine[mk]` and re-renders the row. Desktop never shows `#slipPill` (the betslip column is always there).
- **Match header, market search, Teams** (`v27`, `app.js`): `#mdLeague` shows *Home vs Away* (`.vs`, ellipsis) with the
  favourite star, `[data-search-open]` (site search) and a home link. The group row starts with `.gsearch`
  (`data-mksearch`) → `#mdSearch` holds `#mkQ`; typing re-renders only `#mdMarkets` (`mdMarketsHTML`, matches market
  name or group), *Cancel* closes it, and it resets when another match opens. *Teams* (after *Goals*) = every market
  whose name has a team in it (`isTeamMk`), football only.
- **Line columns** (`linesOf`, `pairOf`, `lineTxt`): fixed `cfg.lines` (football O/U) or `lines: 'auto'` (two-way Handicap
  and Total – the lines come from each match's keys). Handicap pairs are `<line>|1` / `<line>|2`, shown signed (`+3.5`).
  The picker header (`#lineHead`) follows the market (Goals/Points/Runs | Over | Under, or Home line | Home | Away).
- **Booking codes** (`app.js`): `shareCode(code, n, odds)` fills `#shareModal` (`#shCode`, `#shSum`, `#shLinkTxt`,
  `#shWa` wa.me link, `[data-sh="share|link|code"]`; Share hides without `navigator.share`; `copyText` falls back to
  `execCommand`). `codeLink(code)` = `<origin>/#/code/<code>`; `route()` turns `#/code/X` and `?code=X` into `loadCode()`
  on the home page. `refreshSlipEvents(force)` fetches slip matches in full (`API.events.one`) when a pick's market is
  outside `LIST_KEYS` or missing – on boot, in `loadCode`, and at most every 15 s per match in `liveRefresh`.
- **Virtual sports** (`app.js`): `SPORTS` has `vbasketball … vdarts` after the real sports (names *vBasketball* etc.; icons
  fall back to the real sport's in `icons.js`). `VS` set → `m.vs`; `m.period` (server `period`: Q1–Q4, P1–P3, halves,
  *Set n*, *Game n*, *Leg n*) is the live label; `m.sets` (server `stats.sets`) shows under the score rows (`.mh-sets`).
  `realLive(m)` keeps virtual games out of the live badges, the home live strip and *All* on the live page. vHandball
  lists open on 1X2. Match meta reads *Game ID … · Virtual game*; the info sheet explains the random draw.
- **Sports lists** (`SPORTS_ON`, `openIn`): sport tabs, A–Z, desktop rail and the Sports page count open matches only and
  skip sports/leagues with none. New sports `americanfootball` and `baseball` (icons in `icons.js`). `m.noScore` (server
  `stats.noScore`) = a two-way game in play without a score yet: rows show `–` and *LIVE*; no *GOAL!* pop-up outside football.
- **Deposit & withdraw** (`v24`, `account.js`, classes `.wx-*`): `.wx-hero` balance card (gradient, Withdraw/Deposit +
  Transactions links), `.wx-bonus` first-deposit banner, `.wx-card` sections, `.wx-methods` tile grid (`data-method`, a
  check badge on the selected one; switching keeps the typed amount and uses `location.replace`), `.wx-sub` method
  details (MoMo number + `.wx-nets` network chips auto-picked from the prefix, USSD bank, saved bank accounts `.wx-acct`
  + `.wx-add`), `.wx-amount` (32px amount, `data-set` quick amounts / `data-frac` 25%·50%·Max, `#wlHint`), `.wx-cta`
  (names what is missing, else "Deposit ₦5,000.00"), `.wx-recent` (last 5 from `GET /api/wallet/payments`, status chips
  `.wx-st ok|pend|bad`, "Being checked" for a transfer waiting for the admin, `.wx-why` = the rejection reason).
  **Payments MVP** (styles at the end of `app.css`): the account to pay into is `.wx-payto` (`.wx-acct-dl` rows with a Copy button, the player's
  reference `LB` + account ID in the narration note); a manual transfer asks for the sender's name and the button reads
  "I have sent ₦5,000.00" → "Deposit being checked" sheet; Ghana's API MoMo shows "Approve on your phone" (polls
  `GET /api/wallet/payments/:id` every 3 s) or the OTP sheet; a country with nothing open shows `.wx-closed` (no fake
  method). The verify-ID page shows `.kyc-st` banners for an ID check waiting or rejected (with the reason).
  **When withdrawals are closed** (`withdrawBlock` from `GET /api/wallet/options`, `withdrawBlockHTML()`), the withdraw
  page shows a card instead of the form: `.wx-unlock` "Complete your 3 deposits to unlock withdrawals" (`.wx-steps`
  1 · 2 · 3 with ✓ Done / Being checked / % and cap, then *Make deposit N now* or *Verify my ID*), or `.wx-paused`
  "Withdrawals are paused for now" with the admin's message; on *To a Friend* it reads "sending money". Before a new
  member's first deposit the deposit page shows `.wl-note.wx-rule` – "Good to know before you deposit" – when the
  server says `withdrawRuleAhead`. Bottom sheets (`.wl-sheet`, `.wl-res`, `.wl-dl`) are shared. Dark mode is hand-tuned in app.css
  (`.wx` is in `gen-dark.py`'s SKIP). The old tab layout and its CSS were removed.
- **Deposit bonuses 1 · 2 · 3** (`account.js` `ladderHTML()`, `.wx-ladder` / `.wx-steps`): the deposit page lists the three
  steps from `opt.data.ladder` (done / bonus active with % played through / next / later / locked behind *Verify your ID*);
  the amount hint shows the bonus this deposit earns. Me → Bonuses shows one row per step with its progress bar.
- **Sticky next-deposit bar** (`#ladBar` in index.html, `account.js` `ladderBar()` / `renderLadderBar()`, `.lad-bar` / `.lb-*`):
  fixed above the bottom menu (a floating card on desktop) on browsing pages (`LB_ROUTES`) for players whose ID is
  approved while a step is left – dots ✓ ✓ 3, "Deposit 3 of 3 · 50% bonus", **Deposit**; "being checked" while one waits.
  `body.has-ladbar` lifts the betslip button and pads the page. Loaded with the app, after a deposit and with the "ID
  approved" pop-up; refreshed at most once a minute.
- **Transfer screenshot** (`proofHTML()` / `bindProof()` / `shrinkImage()`, `.wx-proof*`): required on real manual
  deposits (`way.mode === 'manual'`) – the button says "Add the screenshot of your transfer" until one is picked; sent after
  "I have sent it"; *Add screenshot* on a pending deposit in Recent deposits (`addProofLater`).
- **Payment pop-ups** (`account.js` `checkNotices()` / `Account.notices()`, styles `.nt-*` at the end of `app.css`): the
  wallet bottom sheet (`#wlSheet`) shows the oldest open notice from `GET /api/auth/notices` – a support deposit request
  first (`.nt`: icon, amount, support's message `.nt-msg`, numbered `.nt-steps`, the `.wx-payto` account block for manual
  ways, **Deposit ₦X now** → `wl.amt.dep` + `#/deposit/transfer|momo`, **Later** = `sessionStorage lba_nt_later`), then
  one-time outcome sheets (`resultSheet`). app.js calls it 1.5 s after the app opens and on every live refresh (throttled
  to a minute); never on register/login/deposit/withdraw/game routes.
- **Refer & Earn and agents** (`app.js` `refer`, styles `.ag-*` at the end of `app.css`): every player gets their code and
  a sign-up link `/?ref=LB<ID>#/register` (`account.js` `refFromLink()` fills the code in, kept in `sessionStorage`
  `lba_ref`), Copy buttons and WhatsApp share. An agent (`GET /api/auth/referrals` → `agent`) sees `.ag-card`: the
  rate and basis, this period's commission, players / active / base tiles, what was paid and the last payouts;
  the flat-reward stats are hidden for agents. Transaction records label `commission` as *Agent commission*.
- **Mobile number or email** (`v23`, `account.js`): register, login and forgot password have a *Mobile Number | Email*
  switch (`.au-via`, `data-via`); the email field (`.au-mail`) has a mail icon where the dial code sits. Only channels
  that can deliver a code are offered (`Account.prefetch()` asks `/api/auth/methods` when the app goes live). The code
  screen says SMS or email accordingly; email-only players see their email in the Me header, their account ID as payment
  reference and type their mobile-money number. Me → *Email & Password* shows the verified email (`.ac-cur`).

### Server endpoints added

| Endpoint | What it does |
|---|---|
| `POST /api/wallet/transfer` | Transfer to Friend: moves money between two players in the same country through the ledger (`transfer_out` / `transfer_in`). |
| `POST /api/jackpot/tickets`, `GET /api/jackpot/tickets` | Buys a 12-game jackpot ticket (multi-pick lines × line price, ledger type `jackpot`) and lists the player's tickets. |
| `POST /api/games/:game/play`, `POST /api/games/hilo/deal`, `GET /api/games/history` | Instant games (dice, spin, penalty, rush, keno, scratch, hilo): stake taken, CSPRNG draw, payout, `game_bets` record – one transaction. Hi-Lo deals are HMAC-signed, player-bound and single use. |
| `GET /api/games/crash/state`, `POST /api/games/crash/bet` / `cashout` / `cancel` | Rocket Crash shared rounds. The state shows round ids, phases and crash points only; the seed/hash audit is admin-only (`GET /api/admin/games/crash/verify/:id`). |
| `GET /api/jackpot/round`, `GET /api/jackpot/results` | The server's 12-game round and real settled results (tiers per country). |
| `GET /api/virtuals/instant/round`, `POST /api/virtuals/instant/play` | Instant Football. The server prices the round (a sealed, tamper-proof token), takes the stake, plays the round with a CSPRNG **after** the stake is taken, settles and pays. A round can be played once. |
| `GET /api/auth/methods` | Which sign-up / reset channels can deliver a code now (`{phone, email}`); the register and forgot pages offer only those. |
| `POST /api/auth/otp`, `/register`, `/login`, `/reset` with `email` instead of `phone` | Sign up, log in and reset the password with an email address (code by email). Login by email works from either country's site. |
| `POST /api/auth/email`, `POST /api/auth/email/confirm` | Add / change the account email (Me → *Email & Password*): a code goes to the new address first. |
| `GET /api/wallet/bonuses`, `GET /api/auth/referrals`, `GET /api/bets/codes` | Welcome bonus progress, Refer & Earn stats, real Code Hub feed. |

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

- Payments: Ghana goes live as soon as `PAYSTACK_SECRET_KEY` is set (the flow is built and tested on a mock); Nigeria
  runs on bank transfers confirmed by an admin until a virtual-account provider is added (`HANDOVER.md` §7). SMS and
  KYC providers: the UI flows are ready; see `PROVIDER:` comments.
- Outright **betting**: needs a feed with outright markets. Until then the live site shows no Outrights tab (the offline
  preview shows prices only), and the betslip offers Single and Multiple (no System bets).
- Done since: email delivery (Spacemail SMTP, `server/EMAILS.md`) and the admin portal (`docs/ADMIN.md`).
