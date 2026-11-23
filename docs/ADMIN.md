# Admin portal

The back office lives at **`/admin.html`** on the same server as the site
(**https://letbetafrika.online/admin.html**). It is a plain page (`betting/admin.html`, `admin.css`, `admin.js`) that
talks to `/api/admin/*` through the shared `api.js` client. Only accounts with `role = 'admin'` can sign in; any other
account is told "This account is not an administrator". It works on a phone too (the sidebar becomes a drawer).

## Granting access

- **`ADMIN_EMAILS`** (Railway variable, comma list): an account with one of these emails becomes an admin when the
  server starts and whenever that account signs up or logs in. The live site has `ADMIN_EMAILS=info@letbetafrika.online`
  – sign up on the site with that email (or add it to your account under Me → Email & Password), then open the portal.
- From the portal: Players → open a player → **Make admin** (**Remove admin** reverts it).
- From a shell on the server: `cd server && node scripts/make-admin.js <phone-or-email> [admin|user]`.

The portal signs in with the account's normal phone or email and password. Suspended accounts cannot sign in.

## Money in and out – the daily routine

**Nigeria – bank transfer deposits (confirmed by you).** The deposit page shows the bank account from *Payment
settings* and the player's own reference, **LB + their account ID** (for example `LB10000002`), which they put in the
transfer narration. They transfer from their bank app, type the sender's name and tap **I have sent ₦X**. The request
appears in **Payments → Pending** with the sender name and reference, and the player gets a "we are checking your
deposit" email.

1. Open your bank app and find the transfer (match the reference and the sender's name).
2. Press **Confirm**, check **Amount that arrived** (change it if they sent a different amount) and press
   **Credit ₦X**. The player is credited at once – the welcome bonus is added on their first deposit – and gets a
   receipt by email.
3. Nothing arrived? Press **Reject** and pick a reason (*No transfer received*, *The amount does not match*, *The
   sender name does not match*). The player is emailed the reason and asked to reply with their receipt if they did pay.

A player can have at most 3 deposits waiting at a time.

**Ghana – Mobile Money through Paystack (automatic).** With `PAYSTACK_SECRET_KEY` set, the player enters their MoMo
number, approves the prompt on their phone (or types the code Paystack sends), and the deposit is credited by itself
when Paystack confirms – through the webhook, or when the player's screen checks the status. These deposits cannot be
confirmed by hand (the portal refuses, so nobody can credit money Paystack has not received). Without the key, Ghana
deposits are closed – unless you enter a MoMo wallet under *Payment settings*, in which case they work like Nigeria's
bank transfers (the player sends to that wallet, you confirm).

**Withdrawals.** The amount leaves the player's balance when they request it (Nigeria: to a bank account; Ghana: to
Mobile Money). In **Payments → Pending → Withdrawals**:

- **Mark paid** – after you have sent the money yourself. Type the bank or MoMo transaction ID as the payout
  reference; the player gets a "paid" email.
- **Send via Paystack** (Ghana, when the API is connected) – pays from your Paystack balance; it is marked paid when
  Paystack confirms, and if the transfer fails the money goes back to the player automatically.
- **Reject** with a reason – the money goes back to the player's balance at once and they are emailed.

**ID checks.** Players send their name, date of birth, ID type and number (Nigeria: NIN, BVN, passport, driver's licence, voter's card; Ghana: Ghana Card, passport, driver's licence, voter's ID) from Me → Verify ID.
They can request withdrawals while the check is waiting; pay them once the ID is approved. **ID checks** lists the
waiting ones: **Approve**, or **Reject** with a reason the player sees (they can send their details again).

## Agents (sub-agents who bring in players)

Make any player an **agent** and decide their commission. Their players are the people who sign up with the agent's
code (**LB + their ID**, for example `LB10000123`) or their link `https://letbetafrika.online/?ref=LB10000123#/register`
– the link fills the code in for the new player. The agent finds both on Me → Refer & Earn.

1. **Agents → Add agent** (or open a player → **Make agent**), find the player, choose what the commission is paid on
   and the rate:
   - **Net revenue** (recommended): what their players lose – stakes minus winnings and bonuses released. If their
     players win more than they lose in a period, the commission is 0.
   - **Deposits**: a % of every deposit their players make.
   - **Stakes**: a % of everything their players stake (settled bets and games).
   The dialog shows an example ("if their players lose ₦100,000, the agent earns ₦20,000").
2. The **Agents** page shows each agent's players, what happened since the last payment, the commission due and
   what was paid so far. Open an agent to see each player's deposits, stakes, winnings and net revenue.
3. **Pay** when you decide (weekly, monthly…): the amount is proposed and you can change it; 0 closes the period
   without paying. The money goes into the agent's balance (they can bet or withdraw it, ledger type `commission`) and
   a new period starts.

Only settled play counts (an open bet counts when it settles), and only from the moment someone becomes an agent.
Agents earn commission **instead of** the Refer & Earn reward. **Edit** changes the rate or basis (it applies to the
commission not yet paid); **Remove agent** stops it (pay what is due first – unpaid commission is dropped);
**Restore** starts a fresh period. Every change and payment is in the audit log.

## Payment settings (you can edit everything)

*Payment settings* holds what players see and the limits:

- **Nigeria**: bank name, account number (10 digits), account name, an optional note for players (for example "Transfers
  after 10pm are confirmed in the morning"); min/max deposit and withdrawal; the payout time shown to players.
  The first account comes from the Railway variables `NG_BANK_NAME`, `NG_BANK_ACCOUNT`, `NG_BANK_HOLDER`; once you save
  this page, what you saved wins. Empty account = Nigerian deposits are closed (the overview warns you).
- **Ghana**: whether the payment API is connected (and in test or live mode, with your Paystack balance), the
  **webhook URL** to paste in Paystack → Settings → API Keys & Webhooks, the optional manual MoMo wallet, and limits.

Defaults: Nigeria ₦1,000–₦5,000,000 deposits, ₦1,000–₦2,000,000 withdrawals; Ghana GH₵10–GH₵50,000 deposits,
GH₵10–GH₵20,000 withdrawals; payouts "within 24 hours". Every save is written to the audit log.

## What each page does

| Page | What you see | What you can do |
|---|---|---|
| **Overview** | Nigeria (₦) or Ghana (GH₵) at the tap of a switch: today's deposits, sports stakes, game turnover, gross gaming revenue, open liability, player balances; 14-day charts; set-up warnings (deposits closed, payment API missing); the queue of payments and ID checks waiting; matches in play | Confirm / reject straight from the queue; open a live event |
| **Trading desk** | Every event with status, market count, suspended count, open legs and exposure | Suspend / reopen one market or all, change a price, enter a result (with half-time score), cancel an event (refunds every open bet) |
| **Bets** | Tickets with player, stake, odds, potential, status; search by ticket, phone or player ID | Open a ticket (legs, results), void an open ticket (refunds the stake) |
| **Players** | Accounts with status, ID check, role, balance; search by phone, ID, name or email | Player drawer: deposit reference, ID details, balance adjustment (ledger entry with a reason), suspend / reactivate, make / remove admin; tabs for bets, payments, ledger, games |
| **Payments** | Deposits and withdrawals by status (pending, done, rejected, failed, cancelled) and kind, with the sender name, reference and payout details | Confirm / Mark paid / Send via Paystack / Reject, as above |
| **Agents** | Agents with their commission (rate and basis), players, unpaid period, commission due, paid so far | Add / edit / remove / restore an agent, pay commission, open an agent's players |
| **ID checks** | Players waiting for an ID check, with the details they sent | Approve, or reject with a reason |
| **Payment settings** | The bank account, Ghana MoMo / payment API status, limits | Edit and save |
| **Ledger** | Every money movement across all players with running balances | Filter by type, search by phone / ID / reference |
| **Games** | 24-hour turnover, payouts and hold per game; recent plays | Audit a Rocket Crash round |
| **Jackpot** | Rounds with tickets, lines, sales, prizes and winners; the prize table | Settle closed rounds |
| **Settings** | Pricing margin, minimum stake, maximum payout, game stake limits, jackpot prizes, welcome bonus, accumulator boost, referral reward, plus raw JSON for any key | Save per card; changes apply at once |
| **Email** | Provider, readiness, sender, server, last error; the last 100 emails | Test the connection, send a test email |
| **Audit log** | Every change made from the portal in plain words ("Confirmed deposit", "Changed payment settings"): who, what, when | Read-only |

The top bar shows the odds feed, email and payment API health, the number of payments and ID checks waiting, a global
player search, a link to the site and a refresh button. The Overview refreshes itself every 30 seconds.

## Server side

- `server/src/routes/admin.js` – every route needs `role=admin`: `GET /overview?cc=`, `GET /series?days=&cc=`,
  `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/adjust`, `GET /payments?status=&kind=`,
  `POST /payments/:id/approve|reject` (body: `amount` = what arrived for a deposit, `reference` for a paid withdrawal,
  `reason` required to reject, `note`), `POST /payments/:id/payout` (Ghana, through Paystack), `GET /kyc`,
  `POST /users/:id/kyc {approve, reason}`, `GET|PUT /payment-settings`, `GET /bets`, `GET /bets/:id`,
  `POST /bets/:id/void`, `GET /events`, `GET /events/:id`, `POST /events/:id/suspend`, `POST /events/:id/result`,
  `POST /markets/:eventId/:key`, `GET /settings`, `PUT /settings/:key`, `GET /transactions`, `GET /feed`,
  `GET /games`, `GET /games/plays`, `GET /games/crash/verify/:id`, `GET /jackpot`, `POST /jackpot/settle`,
  `GET /email/status`, `GET /email/log`, `POST /email/test`, `GET /log`, `GET /agents`, `GET /agents/:id`,
  `PUT /agents/:id {rate, basis: revenue|deposits|stakes, active, note}`, `POST /agents/:id/pay {amount?, note?}`.
- Agents: `server/src/lib/agents.js` (commission maths and payouts), tables `agents` and `agent_payouts`;
  the player's view is in `GET /api/auth/referrals` (`agent`).
- Every non-GET admin request is written to the `admin_log` table (`schema.sql`) with the administrator, the action,
  the target and the request body (passwords stripped).
- Payments: `server/src/lib/payments.js` (ways to pay per country, limits, settings), `server/src/payments/paystack.js`
  (Paystack API), `server/src/payments/flows.js` (crediting / failing / payout results – idempotent, one row lock),
  `server/src/routes/payments.js` (`POST /api/payments/paystack/webhook`, signature checked).
- `server/src/lib/admins.js` – `ADMIN_EMAILS`; `server/scripts/make-admin.js` – promote or demote from the command line.

## Design

Light back-office theme on the brand palette (`admin.css`): ink sidebar, white cards on a soft grey canvas, brand
green for primary actions, gold for the admin tag and warnings, red reserved for destructive actions and live
indicators. Tables use 13px Roboto with uppercase 11px headers; status is always a pill with a dot plus a word, never
colour alone. Charts are inline SVG with one y-axis, a hover crosshair and tooltip, a legend for two series, and a
table view for every chart. The sidebar collapses to a drawer below 900px; every page works on a phone.
