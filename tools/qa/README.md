# QA tools (Playwright scripts used to build and verify LetBetAfrika)

All scripts are plain Node + Playwright (`npm i -D playwright` locally; cloud sessions have it pre-installed).
Most take a **working folder** as the first argument (screenshots/fixtures go there – use `tools/qa`), and some a
base URL. Paths inside assume the repo at `/home/user/my-website` – change `file:///home/user/my-website/...` if yours differs.

| Script | What it checks | Run |
|---|---|---|
| `smoke.js` | Every route in demo (`file://`) and live (`http://127.0.0.1:8080`) – JS errors, horizontal scroll, empty pages | `node smoke.js` |
| `e2e2.js` | Demo account flows: register + SMS code, deposit by bank transfer (account, reference, sender name, "I have sent ₦X", no card/USSD/wallet tiles), withdraw + ID check, transfer, login/reset, Ghana (MoMo only) | `node e2e2.js tools/qa` |
| `e2e_live.js` | Same flows against the real API + database (server with `PAYMENTS_MODE=demo`), checks server balances (the Verify ID form needs an email) | `node e2e_live.js tools/qa` (server on :8080) |
| `e2e_admin.js` | **Real-money flows in the browser, no demo shortcuts**: admin portal sign-in, bank account saved in Payment settings, a Nigerian player adds the transfer screenshot and sends "I have sent ₦5,000" → the admin views the screenshot, can't credit without the transfer reference, credits ₦4,500, ID check approved, withdrawal marked paid with its reference, Ghana MoMo approved on the phone (mock Paystack), Ghana payout through the API, every portal page, currency switch, audit log, player drawer, support **Add deposit** (credited, the same transfer reference refused), ID approved → Deposit 1 · 2 · 3 unlocked + pop-up, the Deposit 1 · 2 · 3 settings card, Deposit 1 marked ✓, the sticky "Deposit 2 of 3" bar (stays while browsing, opens the deposit page), the Deposit 1·2·3 tracker (Request deposit names the next step), **Request deposit** → the Nigerian and the Ghanaian player get the pop-up when they open the app and land on their deposit page with the amount filled in, phone size | `node mock_paystack.js 9098 http://127.0.0.1:8096`, a server on :8096 with `PAYMENTS_MODE=live PAYSTACK_BASE=http://127.0.0.1:9098 PAYSTACK_SECRET_KEY=sk_test_mock` on a **fresh** DB, then `node e2e_admin.js <outDir> http://127.0.0.1:8096/ <dbUrl>` |
| `e2e_agents.js` | **Sub-agents in the browser**: a sign-up link `?ref=LB…` fills in the code, the admin adds an agent in the portal (find, 20% of net revenue, live example), the player's losing bet shows ₦1,000 due, agent drawer, pay dialog, the agent's balance credited, the agent's dashboard and "Agent commission" in their records | server with `PAYMENTS_MODE=demo` on a test DB, then `node e2e_agents.js <outDir> [baseUrl] [dbUrl]` |
| `mock_paystack.js` | **Mock of the Paystack API** (charge, submit_otp, verify, transfer, balance) that sends signed webhooks to the server. Telecel numbers get the code step (`123456` is accepted); numbers ending in `0000` are declined. Test hooks: `POST /__approve/<ref>`, `/__approve_silent/<ref>` (no webhook – the server's own status check must find it), `/__decline/<ref>`, `POST /__replay {event, data}` (resend a webhook), `POST /__state {"failTransfers":true}`. | `node mock_paystack.js <port> <serverUrl>` |
| `e2e_pages.js` | Live, sports filter, lists, outrights (demo only – none on the live site), bet detail + rebet, jackpot purchase, promos, results, Code Hub | `node e2e_pages.js tools/qa <baseUrl>` |
| `e2e_email.js` | Sign up, log in, reset password and change email **with an email address** (live test mode, demo, or production mode reading codes from a local SMTP sink folder) | `node e2e_email.js tools/qa <baseUrl> [mailboxDir]` |
| `e2e_codes.js` | Booking codes in the browser: book picks from markets outside the main list, share sheet (WhatsApp link, copy link/code), a fresh visitor opens the link and gets every pick live (also after reload, via `?code=`), bad codes, Code Hub share | `node e2e_codes.js <outDir> [baseUrl]` |
| `e2e_vsports.js` | Virtual sports through the real API: a round on sale in all 7 sports, 14 bets settle exactly as their final scores, markets closed while a game plays, virtual results kept out of the main results | server with `VIRTUAL_ROUND_SEC=40 VIRTUAL_PLAY_SEC=15` on a fresh DB, then `node e2e_vsports.js <baseUrl>` |
| `e2e_sports.js` | Real-feed sports end to end on the mock: NBA arrives with Winner / Handicap / Total, no tennis, betting closes at tip-off, four bets settle from the 110-104 result | `node e2e_sports.js <baseUrl> <dbUrl>` (server on the mock, fresh DB) |
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
| `mock_oddsapi.js` + `fixtures/` | **Mock of The Odds API** from a real EPL sample (no credits). One match in play, one finished. Also an NBA slate (h2h, spreads, totals from 4 books; `POST /__state {"nbaDone":true}` finishes the first game 110-104) and the free `/v4/sports` list. | `node mock_oddsapi.js tools/qa 9099` then start the server with `ODDS_PROVIDER=oddsapi ODDS_API_KEY=mock ODDS_API_BASE=http://127.0.0.1:9099/v4` |

The reference site needs network access to `www.sportybet.com`, `s.sporty.net`, `cdn.sporty.net`.

Run the live suites **one after another** (not in parallel): each registers new players, and sign-up is rate-limited
per phone number and per IP. Selectors used by the game tests: `#gxGo` (play), `[data-gx=…]` (chips, choices, keno
quick pick, scratch-all, Hi-Lo), `#gxResult.on` (round finished), `#crBtn` / `#crMult` (Rocket Crash).
