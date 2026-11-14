# QA tools (Playwright scripts used to build and verify LetBetAfrika)

All scripts are plain Node + Playwright (`npm i -D playwright` locally; cloud sessions have it pre-installed).
Most take a **working folder** as the first argument (screenshots/fixtures go there – use `tools/qa`), and some a
base URL. Paths inside assume the repo at `/home/user/my-website` – change `file:///home/user/my-website/...` if yours differs.

| Script | What it checks | Run |
|---|---|---|
| `smoke.js` | Every route in demo (`file://`) and live (`http://127.0.0.1:8080`) – JS errors, horizontal scroll, empty pages | `node smoke.js` |
| `e2e2.js` | Demo account flows: register + SMS code, deposit (card/USSD/OPay), withdraw + ID check, transfer, login/reset, Ghana | `node e2e2.js tools/qa` |
| `e2e_live.js` | Same flows against the real API + database, checks server balances (the Verify ID form needs an email) | `node e2e_live.js tools/qa` (server on :8080) |
| `e2e_pages.js` | Live, sports filter, lists, outrights, bet detail + rebet, jackpot purchase, promos, results, Code Hub | `node e2e_pages.js tools/qa <baseUrl>` |
| `e2e_email.js` | Sign up, log in, reset password and change email **with an email address** (live test mode, demo, or production mode reading codes from a local SMTP sink folder) | `node e2e_email.js tools/qa <baseUrl> [mailboxDir]` |
| `e2e_slip.js` | Betslip sheet gestures with real touch events: swipe up on the pill, drag back, drag/pull down to close, rows fold away, page locked | `node e2e_slip.js tools/qa [baseUrl]` |
| `e2e_instant.js` | Instant Football incl. server replay protection and tampered-round rejection | `node e2e_instant.js tools/qa <baseUrl>` |
| `e2e_games.js` | **Every game against the real API**: lobby, 7 instant games (server balance checked after each play), Hi-Lo replay, Rocket Crash auto + manual cash-out, a real Virtual League bet, a jackpot ticket | `node e2e_games.js tools/qa <baseUrl>` (server with `PAYMENTS_MODE=demo`) |
| `e2e_games_demo.js` | Every instant game in demo mode (`file://`), no invented jackpot winners | `node e2e_games_demo.js tools/qa` |
| `../assets/thumbs.js` | Re-captures the games lobby thumbnails from the real scenes (needs Pillow) | `node tools/assets/thumbs.js` |
| `compare2.js` + `pairs.json` | **Side-by-side screenshots vs SportyBet** at iPhone 13 size (left = reference, right = ours) | `ONLY=home,live node compare2.js tools/qa/cmp tools/qa/pairs.json` |
| `cmp_match.js` | Match page + betslip vs reference | `node cmp_match.js tools/qa` |
| `align.js` | Odds column labels vs buttons (must print `aligned`) on phone + desktop | `node align.js` |
| `axe_run.js` | WCAG 2 AA audit (needs `npm i axe-core@4.10.2` in `<folder>/axe`) | `node axe_run.js tools/qa` |
| `darkshots.js`, `theme_t.js` | Dark mode screenshots / toggle persistence | |
| `desk.js` | Desktop 1440px reference vs ours | |
| `offline_t.js` | Offline banner | |
| `mock_oddsapi.js` + `fixtures/` | **Mock of The Odds API** from a real EPL sample (no credits). One match in play, one finished. | `node mock_oddsapi.js tools/qa 9099` then start the server with `ODDS_PROVIDER=oddsapi ODDS_API_KEY=mock ODDS_API_BASE=http://127.0.0.1:9099/v4` |

The reference site needs network access to `www.sportybet.com`, `s.sporty.net`, `cdn.sporty.net`.

Run the live suites **one after another** (not in parallel): each registers new players, and sign-up is rate-limited
per phone number and per IP. Selectors used by the game tests: `#gxGo` (play), `[data-gx=…]` (chips, choices, keno
quick pick, scratch-all, Hi-Lo), `#gxResult.on` (round finished), `#crBtn` / `#crMult` (Rocket Crash).
