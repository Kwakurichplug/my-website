# Admin portal

The back office lives at **`/admin.html`** on the same server as the site (for example
`https://letbetafrika.online/admin.html`). It is a plain page (`betting/admin.html`, `admin.css`,
`admin.js`) that talks to `/api/admin/*` through the shared `api.js` client. Only accounts with
`role = 'admin'` can sign in; every other account is shown "This account is not an administrator".

## Granting access

A player becomes an administrator in one of two ways:

- from the portal: open the player (Players → Open) and press **Make admin**; **Remove admin** reverts it;
- from a shell on the server: `cd server && node scripts/make-admin.js <phone-or-email> [admin|user]`
  (needed for the very first administrator).

The portal signs in with the player's normal phone/email and password. Suspended accounts cannot sign in.

## What each page does

| Page | What you see | What you can do |
|---|---|---|
| **Overview** | Today's deposits, sports stakes, game turnover, gross gaming revenue, open liability, player balances; 14-day charts (deposits vs withdrawals, stakes vs payouts, sign-ups, game turnover); the pending-payment queue; matches in play | Approve / reject straight from the queue; open a live event |
| **Trading desk** | Every event with status, market count, suspended count, open legs and exposure | Open the event: suspend / reopen one market or all of them, change a price, enter a result (with half-time score), cancel an event (refunds every open bet) |
| **Bets** | Tickets with player, stake, odds, potential, status; search by ticket, phone or player ID | Open a ticket (legs, results), void an open ticket (refunds the stake) |
| **Players** | Accounts with status, KYC, role, balance; search by phone, ID, name or email | Player drawer: balance adjustment (ledger entry with reason), approve / revoke KYC, suspend / reactivate, make / remove admin; tabs for bets, payments, ledger, games |
| **Payments** | Deposits and withdrawals by status and kind, with the payout details the player entered | Approve (withdrawal = you have sent the money; deposit = money arrived, player credited) or reject with a reason (withdrawal refunded) |
| **Ledger** | Every money movement across all players with running balances | Filter by type, search by phone / ID / reference |
| **Games** | 24-hour turnover, payouts and hold per game; recent plays | Audit a Rocket Crash round (seed, hash, recomputed crash point) |
| **Jackpot** | Rounds with tickets, lines, sales, prizes and winners; current prize table | Settle closed rounds |
| **Settings** | Pricing margin, minimum stake, maximum payout, game stake limits, jackpot prizes, welcome bonus, accumulator boost tiers, referral reward, plus raw JSON for any key | Save per card; changes apply at once |
| **Email** | Provider, readiness, sender, server, last error; last 100 emails with status | Test the connection, send a test email |
| **Audit log** | Every change made from the portal: who, what, when, which endpoint | Read-only |

The top bar shows the odds-feed and email health at all times, has a global player search, a
link to the site and a refresh button. The Overview refreshes itself every 30 seconds.

## Server side

- `server/src/routes/admin.js` – every route needs `role=admin`. New in this version: `GET /log`,
  `GET /series`, `GET /users/:id`, `GET /bets/:id`, `GET /events`, `GET /events/:id`,
  `POST /events/:id/suspend`, `GET /jackpot`, `GET /games/plays`, `GET /transactions`; `/payments` and
  `/bets` take search and kind filters; `/overview` carries more KPIs.
- Every non-GET admin request is written to the `admin_log` table (`schema.sql`) by a middleware in the
  same file, with the administrator, the route, the target id and the request body (passwords stripped).
- `server/scripts/make-admin.js` promotes or demotes an account from the command line.

## Design

Light back-office theme on the brand palette (`admin.css`): ink sidebar, white cards on a soft grey
canvas, brand green for primary actions, gold for the admin tag and warnings, red reserved for
destructive actions and live indicators. Tables use 13px Roboto with uppercase 11px headers; status
is always a pill with a dot plus a word, never colour alone. Charts are inline SVG with one y-axis,
a hover crosshair and tooltip, a legend for two series, and a table view for every chart. The sidebar
collapses to a drawer below 900px; every page works on a phone.
