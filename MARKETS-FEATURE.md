# Feature: SportyBet-grade market set + match page (for merging into the main branch)

Base: `origin/claude/bold-mccarthy-71siq8` (commit 289b7e2). Everything below is also pushed on
branch `claude/sports-betting-ui-design-rdaeo4` – `git diff 289b7e2..claude/sports-betting-ui-design-rdaeo4`
gives the exact patch (`feature.patch` in this zip is that diff; `git apply feature.patch` on 289b7e2 applies it).

## What it adds

1. **`betting/markets.js` (new, shared by browser and server)** – one football market engine:
   `football(m, price)` builds 85 markets / ~430 outcomes per match from a two-half Poisson model
   (Main 18, Goals 19, Corners 5, Half 30, Combo 10, Bookings 3), the same set SportyBet lists
   (1X2, O/U with whole + half lines, DC, 1st/Next Goal, 3-way Handicap table, Asian Handicap, GG/NG, DNB,
   Correct Score, HT/FT, Odd/Even, Home/Away No Bet, Winning Margin, Exact Goals, Goal Range,
   Which Team To Score, Multigoals, team O/U, team exact goals, clean sheets, both halves O/U,
   1st/2nd half 1X2 / O/U / DC / handicap / DNB / correct score / GG / exact goals / odd-even,
   win both/either half, highest scoring half, 1X2 & O/U, 1X2 & GG, O/U & GG, DC & O/U, DC & GG,
   win to nil, HT/FT & O/U, corners (total, 1X2, team, odd/even), cards (total, team)).
   `grade(mk, ok, R)` settles every one of them (won/lost/void, pushes on whole lines, void when the
   data a market needs – half-time score, corners, cards, goal list – is missing). `needs()`, `view()`,
   `guide()` (plain-language "how it settles" text), `order()` (canonical list order), `GROUPS`.
   Loaded by `index.html` before `game-logic.js`; the server uses it through `createRequire`.
2. **Server** – `feeds/demo.js` generates markets from the engine (and stores the model on the event,
   refreshes markets of existing events, upserts new keys on live ticks, tracks cards + half-time);
   `feeds/oddsapi.js` offers every market settleable from the full-time score (`needs === 'ft'`);
   `lib/settle.js` grades through `markets.grade`; `routes/events.js` returns markets in canonical
   order and the list payload includes `hou`/`aou`; `feeds/index.js` exports `upsertMarkets`;
   `games/virtual.js` skips corners/cards for virtual rounds; `schema.sql` removes the two legacy
   `eh-1`/`eh+1` rows from open events (grader still accepts the legacy keys for old bets);
   `test/grade.test.js` covers the new markets (14 tests pass).
3. **Front end** – `app.js`: demo markets + demo settlement use the engine; match page rebuilt on
   SportyBet's layout: pre-match is the light "Details" page (league link, 36px crests, date/time pill,
   Game ID line, pill tabs, group tabs ★ All Main Goals Corners Half Combo Bookings), live stays dark;
   market blocks with green triangle, name, grey "i" (opens a guide sheet `#mkInfoModal`), star
   (favourite markets, `state.favMk`, ★ tab); table views for O/U (line | Over | Under),
   3-way handicap (line | Home | Draw | Away) and Asian handicap (Home | Away with the line in the cell);
   list market tabs are now `1X2 | O/U | DC | Home O/U | Away O/U` with a line cell per row
   (defaults to the line priced closest to even, tap to cycle); live mode fetches the match detail
   the moment the page opens. `app.css`: v23 block at the end; `dark.css` regenerated.
   `pages.js`: header column count uses `cfg.n`.

## Verified
- `node --test server/test/grade.test.js` – 14/14.
- `tools/qa/smoke.js` – every route, demo + live: no JS errors, no overflow, no empty page.
- Playwright walk-through (demo and live API): 85 markets per pre-match, group tabs, info sheet,
  star tab, Asian handicap pick lands in the betslip with the right label, live match page in order.

## Merge notes
- Keep the script order: `api → account → pages → motion → icons → markets → game-logic → games → scenes → arcade → app`.
- Outcome keys changed for handicaps: `eh` (`0:1|1`, `1:0|X` …) and `ah` (`-1.5|1`, `0.5|2`); everything
  else that existed keeps its key. Server outcomes now carry `i` (display order).
- After deploying, the demo feed refreshes markets of existing events on its first sync; The Odds API
  events get the full set on their next sync.
