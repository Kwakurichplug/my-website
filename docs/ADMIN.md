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

**Ghana – Mobile Money through Moolre (automatic, nothing to confirm).** With the Moolre keys set, the player enters
their MoMo number and network and approves the prompt on their phone with their MoMo PIN. The first time a number
pays, Moolre texts it a code that the player types in once. The deposit is credited by itself (welcome bonus included)
as soon as **Moolre's own status check** says the money arrived. The server asks Moolre when the webhook comes in,
while the player's screen waits, and again every minute for anything still open, so a missed webhook still gets
credited. A webhook alone never credits anything, and nothing is ever credited twice. These deposits cannot be
confirmed or rejected by hand: the portal refuses, so nobody can credit money Moolre has not received. Declined or
abandoned payments close by themselves, and the player sees the reason. If Moolre refuses the status check itself
(wrong public key, user or account number), the deposits stay pending and nobody is credited: **Overview** and
**Payments** then show a red "Moolre deposits are not being confirmed" banner with Moolre's message. Fix the Railway
variable it names; the waiting deposits are checked again every minute and settle by themselves. Paystack works the same way when only
`PAYSTACK_SECRET_KEY` is set. With no payment API, Ghana deposits are closed unless you enter a MoMo wallet under
*Payment settings*. In that case they work like Nigeria's bank transfers: the player sends to that wallet and you
confirm.

**Withdrawals.** The amount leaves the player's balance when they request it (Nigeria: to a bank account; Ghana: to
Mobile Money). **No withdrawal is ever paid automatically.** Each one waits for an admin to open **Review** in
**Payments → Pending → Withdrawals**, or from the player's drawer. Review shows the account checks:

- the **name registered on the MoMo number** (asked from Moolre) against the player's name: matches, partly
  matches, does not match, or no wallet on this number;
- the ID check, the account status and how old the account is;
- deposits, paid withdrawals, other withdrawals waiting, how much was staked since the last deposit (money in and
  straight out without playing is flagged), and whether the balance matches the ledger;
- whether the player deposited from this number, and whether **any other account uses it** (one wallet behind
  several accounts).

Red flags (✕) block paying until you tick *"I have checked the red flags…"*. Amber notes (!) are for your judgement.
The server refuses an API payout without a review, and refuses one with red flags unless you confirmed them. The
review, the flags and the MoMo name are saved with the payment. From Review:

- **Mark paid** – after you have sent the money yourself. Type the bank or MoMo transaction ID as the payout
  reference; the player gets a "paid" email.
- **Send via Moolre** (Ghana, when the API is connected) – pays from your Moolre wallet; it is marked paid when
  Moolre confirms, and if the transfer fails the money goes back to the player automatically. If Moolre refuses it
  before any money moves (e.g. not enough in the wallet, or this server's IP is not whitelisted for disbursements),
  it stays in the queue marked *Not sent* with the reason – top up / fix it and send again, or pay it by hand.
  Once sent, it can no longer be marked paid or rejected by hand (that could pay twice).
- **Reject** with a reason – the money goes back to the player's balance at once and they are emailed.

**ID checks.** Players send their name, date of birth, ID type and number (Nigeria: NIN, BVN, passport, driver's licence, voter's card; Ghana: Ghana Card, passport, driver's licence, voter's ID) from Me → Verify ID.
They can request withdrawals while the check is waiting; pay them once the ID is approved. **ID checks** lists the
waiting ones: **Approve**, or **Reject** with a reason the player sees (they can send their details again).
**Ask for ID again** (player drawer, any time – also after approving, e.g. a wrong or unclear ID found later): pick or
type the reason; the player's ID check opens again, they get an email and a one-time message in the app, and the
Withdraw and Verify pages show your reason until they send new photos.

**Play-through (withdrawals).** A deposit must be staked once – on sports, live, virtuals, games or the jackpot,
won or lost – before that money can be withdrawn. Only the part of the deposits not yet staked is held back;
winnings are never locked. Players see the rule on the Deposit page, a pop-up after each deposit ("Bet it before you
withdraw", with the amount still to stake), and on the Withdraw page what is locked and what they can withdraw now.
Money sent to a friend takes its lock with it. Agents are exempt. This is the standard anti-money-laundering rule
(a deposit cannot go straight back out).

## Payment settings (you can edit everything)

*Payment settings* holds what players see and the limits:

- **Nigeria**: bank name, account number (10 digits), account name, an optional note for players (for example "Transfers
  after 10pm are confirmed in the morning"); min/max deposit and withdrawal; the payout time shown to players.
  The first account comes from the Railway variables `NG_BANK_NAME`, `NG_BANK_ACCOUNT`, `NG_BANK_HOLDER`; once you save
  this page, what you saved wins. Empty account = Nigerian deposits are closed (the overview warns you).
- **Ghana**: which payment API is connected (Moolre or Paystack, test or live, with the wallet balance). For Moolre
  it also shows the wallet name, whether API access is on, whether our webhook is registered on the wallet, and
  whether webhook signatures are checked. You'll also find the webhook URL, the optional manual MoMo wallet, and the
  limits here.

Defaults: Nigeria ₦1,000–₦5,000,000 deposits, ₦1,000–₦2,000,000 withdrawals; Ghana GH₵10–GH₵50,000 deposits,
GH₵10–GH₵20,000 withdrawals; payouts "within 24 hours". Every save is written to the audit log.

## What each page does

| Page | What you see | What you can do |
|---|---|---|
| **Overview** | Nigeria (₦) or Ghana (GH₵) at the tap of a switch: today's deposits, sports stakes, game turnover, gross gaming revenue, open liability, player balances; 14-day charts; set-up warnings (deposits closed, payment API missing); the queue of payments and ID checks waiting; matches in play | Confirm / reject straight from the queue; open a live event |
| **Trading desk** | Every event with status, market count, suspended count, open legs and exposure | **Add match** (see below), suspend / reopen one market or all, change a price, enter a result (with half-time score; only after kick-off), cancel an event (refunds every open bet) |
| **Promo codes** | Every code with its country, bonus, wagering, players who used it (of the limit), end date, status, and how much was given / unlocked | **New promo code**, pause / resume |
| **Bets** | Tickets with player, stake, odds, potential, status; search by ticket, phone or player ID | Open a ticket (legs, results), void an open ticket (refunds the stake) |
| **Players** | Accounts with status, ID check, role, balance; search by phone, ID, name or email | Player drawer: deposit reference, ID details, balance adjustment (ledger entry with a reason), suspend / reactivate, make / remove admin; tabs for bets, payments, ledger, games |
| **Payments** | Deposits and withdrawals by status (pending, done, rejected, failed, cancelled) and kind, with the sender name, reference and payout details | Confirm / Mark paid / Send via Moolre / Reject, as above (Moolre / Paystack payments settle by themselves) |
| **Send money** | The Moolre wallet balance, your limits and what is left today, every transfer with who sent it, to which number and name, the reason and the status | Send money from the Moolre wallet to **any** MoMo number: check the registered name, then confirm with your admin password. No player balance changes. Default limits: GH₵20,000 per transfer and GH₵50,000 per 24 hours (Settings → `wallet_payouts`). For a player's withdrawal, use Review → Approve & send instead, which also settles the withdrawal. |
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

## Adding a match by hand (Trading desk → Add match)

Use it for real fixtures that the odds feed does not carry, such as local leagues, cup games and friendlies.

1. Pick the league. To create one, choose *New league…*, give its name and country, and pick its flag from the
   searchable list of all 270 country and region flags.
   **Teams and crests:** type a team. Teams you have used before are suggested, with their crest. Next to each team,
   set a crest with **Upload** (any image; it is shrunk automatically), **Flag** (any country flag, which suits national
   teams), **Link** (an https image) or **Find** (an automatic lookup of club crests). A crest is remembered for the
   team name, so every match of that team shows it, including matches already listed. You can change crests later from
   the match drawer. One-tap kick-off times (In 1 hour, Today 15:00 …) sit under the date field. After saving,
   **Add another in this league** opens the form again with the league and time kept.
2. Enter the teams, the kick-off time (in your local time) and your **1X2 odds**. The form shows the margin and a few
   of the derived prices. Odds with under 2% margin are refused, because they would pay out more than is staked, and
   so are odds with over 35% margin.
3. *Add match*. Every other full-time market (double chance, goals over/under, both teams to score, correct score,
   handicaps…) is priced from your 1X2 with the site margin. The 1X2 keeps your prices exactly. You can still change
   any single price in the event drawer.
4. Players can bet until **kick-off**. At kick-off the match shows as started and every market closes. Markets cannot
   be reopened after that, so nobody can bet on a match in progress.
5. **Live scoring (optional).** Once the match has kicked off, the match drawer shows *Live scoring*. Use **+ Goal**
   / **−** for each team and **1st half / Half-time / 2nd half**. Players then see the real score, a running clock,
   the goals on the timeline and a GOAL alert, but betting stays closed. A mistaken goal can be taken back.
6. After the final whistle, enter the **real final score** (*Enter result*, or *Full time – settle* in Live scoring,
   which fills in the score for you). Half-time is optional; the half markets
   are not offered on hand-added matches. Every bet is settled at once. A result cannot be entered before kick-off.
   If the match is postponed or abandoned, *Cancel event* refunds every bet.

## Sub-agents (Agents page)

- **Make an agent:** Players → open the player → **Make agent**. They get a unique code (e.g. `AG7K2QX`) and a link
  (`https://letbetafrika.online/?agent=AG7K2QX`). Anyone who opens the link lands on Register with the code filled in.
  The code can also be typed in the referral field. Players must be in the agent's country.
- **Earnings:** the agent earns **70% of each of their players' first deposit** (once per player; later deposits earn
  nothing). An earning becomes requestable once that player has **staked their deposit amount on settled bets**
  (sports or games). Until then it shows as "Waiting for players to play". This stops fake players who deposit only
  to withdraw again.
- **The agent's screen:** Me → **Agent Dashboard** shows total earnings, ready / waiting / requested / paid, their link
  (Copy, WhatsApp), every player (names masked, first deposit, what it earned, status) and their payout requests.
- **Payouts:** the agent taps **Request payout**. The request appears on **Agents** (with a badge and an email to
  ADMIN_EMAILS) and lists the players it comes from. **Approve** puts the amount in the agent's balance (ledger: agent
  commission); they withdraw it like any player, and that withdrawal goes through Review as usual. **Reject** (with a
  reason the agent sees) puts the earnings back as ready.
- **Stop** an agent from the Agents page or the drawer: their players stay linked, but new sign-ups and new first
  deposits earn nothing. **Restart** turns them back on with the same code.
- Rules live in Settings → `agents`: `pct` (70; was 60 until 22 Nov 2026 – earnings recorded before keep their amount), `turnover` (1 = the player must stake 1× their deposit; 0 = ready at
  once), `minPayout` per country (GH₵10 / ₦1,000).

## Promo codes (Promo codes → New promo code)

- **Code**: 4–20 letters or digits, stored in capitals; players can type it in any case.
- **Country**: a Ghana code works only for Ghana accounts (GH₵), a Nigeria code only for Nigeria (₦).
- **Bonus amount** (up to GH₵5,000 / ₦500,000 per code). **Wagering**: the player must stake this many times the
  bonus on multiples, with every selection at 1.50 or more, within the **days** you set. Then the bonus becomes cash
  in their balance and they get an email. Set wagering to **0** to pay the amount as cash at once.
- **Max players** (blank means no limit) and an optional **end date**. The limit holds even when many players apply
  the code at the same moment.
- **Only after a deposit** is on by default, so throw-away accounts cannot collect codes. **Only new players** limits
  the code to accounts created after it.
- Each player can use a code once. Players enter codes on **Me → Bonuses → Promo code** and see their progress there.
- You can **Pause / Resume** a code and change its limit or end date. The amount and wagering cannot change after
  players have been told them.

## Server side

- `server/src/routes/admin.js` – every route needs `role=admin`: `GET /overview?cc=`, `GET /series?days=&cc=`,
  `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/adjust`, `GET /payments?status=&kind=`,
  `POST /payments/:id/approve|reject` (body: `amount` = what arrived for a deposit, `reference` for a paid withdrawal,
  `reason` required to reject, `note`), `POST /payments/:id/payout` (Ghana, through Moolre / Paystack),
  `POST /payments/:id/check` (ask the payment API now), `GET /leagues`, `POST /events/preview {odds}`,
  `POST /events` (add a match), `GET|POST /promos`, `POST /promos/:code {active, maxUses, endsAt}`, `GET /kyc`,
  `POST /users/:id/kyc {approve, reason}`, `GET|PUT /payment-settings`, `GET /bets`, `GET /bets/:id`,
  `POST /bets/:id/void`, `GET /events`, `GET /events/:id`, `POST /events/:id/suspend`, `POST /events/:id/result`,
  `POST /markets/:eventId/:key`, `GET /settings`, `PUT /settings/:key`, `GET /transactions`, `GET /feed`,
  `GET /games`, `GET /games/plays`, `GET /games/crash/verify/:id`, `GET /jackpot`, `POST /jackpot/settle`,
  `GET /email/status`, `GET /email/log`, `POST /email/test`, `GET /log`.
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

## Live support (admin portal → Live support)

- Players open **Me → Live Support** (also the side menu and the help icon on Deposit / Withdraw). The **assistant**
  answers at once from the player's own account: their last deposit (credited / waiting for MoMo / not confirmed),
  last withdrawal (with the team / sent / paid / refused and why), open and settled bets, bonus progress, ID check,
  promo codes, agent link, password reset, Virtual League. Quick-reply buttons cover the common questions.
- **Talk to a person** (or two questions the assistant cannot answer) moves the chat to **Live support** with a badge
  and an email to ADMIN_EMAILS. While the page is open players see the team as **online**; otherwise they are told
  the team replies here (they get a badge on Me when you do).
- Next to the chat: balance, deposited / withdrawn, open bets, ID check, agent status, the last payments (**Check now**
  asks Moolre about a pending API payment, **Review** opens a pending withdrawal) and recent bets (open a ticket).
  **Full profile & tools** opens the player's drawer (adjust balance, suspend, ID, make agent…). Saved replies fill the
  box in one tap. **Close chat** when done; the player's next message starts a new chat with the assistant.

## Agents' withdrawals

- Agents withdraw **without ID verification**, and a Ghana Mobile Money withdrawal by an agent is **sent through the
  payment API at once** (no review). If Moolre refuses it, it waits in Payments with Moolre's message like any other
  withdrawal. Nigerian bank withdrawals still need you to pay them. Agents no longer see the commission percentage.

## Live odds (Virtual League)

- While a Virtual League match plays, its full-time markets (1X2, double chance, goals, both teams to score, correct
  score, handicaps, next goal…) stay open and are re-priced as the clock runs, from the score and the time left only.
  A goal pauses betting on that match for 3 s (`VLEAGUE_BET_STOP_MS`), then it reopens at the new prices.
- Real matches: in-play prices are open only while the feed's score is fresh (under 90 s) and re-price the moment a
  new score arrives. On the free Odds API plan scores come rarely, so live betting on real matches is mostly closed –
  a paid plan (score every minute) opens it.

## ID checks with photos

- Players verify in **Me → Verify ID**: name, date of birth, ID type and number, and a photo of the **front** and the
  **back** of the ID (camera or gallery; a passport needs only the front). The app shrinks each photo to a clear
  1600 px (~250 KB) before sending. A new submission replaces the previous photos.
- **ID checks** (badge + email to ADMIN_EMAILS) lists each submission with its photo thumbnails. **Open** shows both
  photos full size next to the details and the account; click a photo to open it at full resolution. **Approve** →
  the player is verified and emailed; **Reject** with a reason (quick reasons: photos not clear, name does not match,
  expired…) → the player sees the reason and can send new photos.
- The photos are stored in the database and only admins can open them (never cached, never public). Agents do not
  need ID verification.

## USSD deposits (Ghana, manual)

- Ghana players see **USSD** next to Mobile Money on Deposit: the code (now `*203*0778606#`, from the Railway variable
  `GH_DEPOSIT_USSD`; change it in **Payment settings → USSD deposits**, empty there keeps the variable) with a
  **Tap to dial** button, then they pay, type the **transaction ID** from the payment SMS and the number they paid
  from, and tap **I have paid**.
- The deposit waits in **Payments** (badge + email) showing "USSD · transaction …"; check it arrived in the wallet
  and **Confirm** (welcome bonus included) or **Reject** with a reason.

## Live betting on your own (hand-added) matches

- **On by default** for matches you add (untick "Live betting during the match" in Add match to leave it off). At
  kick-off the score is 0–0, so betting **opens by itself**; run the match from the **Live desk** (admin menu): every
  match of yours in play on one screen with **+ Goal**, **Score is still X–Y**, half-time / 2nd half, Full time, the
  open tickets and a countdown – a beep and a yellow frame 30 s before a match would pause. Before kick-off the desk
  shows matches starting within 30 min, where you can switch live betting off for one. You can also use the match's
  live panel (Trading desk → the match). Markets (1X2, double chance, goals, both teams to score, correct score, handicaps,
  next goal…) are priced from the match's own odds model, the score and the clock, and move as the clock runs.
- They stay open only while the score is fresh: enter every goal with **+ Goal**, or tap **Score is still X–Y** at
  least every 3 minutes (`MANUAL_LIVE_FRESH_SEC`, default 180). The panel counts down. If you stop, betting closes
  by itself (checked every few seconds and again on every bet). A goal pauses betting for 10 seconds.
- **Stop live betting** closes it at once. **Full time** settles the match as before.
- Real matches from the odds feed open in-play only while the feed's score is fresh (under 90 s); on the free odds
  plan that is rare, so they stay paused – a paid plan opens them.

## In-play betting rules (Settings → In-play betting)

- Every football match – real, your own, Virtual League – is open for betting from kick-off until **80'**
  (`closeMinute`), with odds that move with the score and the clock. A new score (from the live-score feed, the odds
  feed or your Live desk) pauses betting on that match for 10 s and it reopens at the new prices.
- Every in-play bet is confirmed after a short wait (`delaySec`, 5 s); a goal in between refuses it.
- Real matches **without a fresh live score** (`blind` = 1): still open, priced from the last known score and the
  clock, but each player can stake at most `blindMaxStake` in play on one such match (GH₵20 / ₦2,000 to start) and
  the wait is longer (`blindDelaySec`, 8 s). Set `blind` to 0 to pause them instead.

## Live scores for real matches (API-Football)

- Add a key from api-football.com (dashboard → API key) as the Railway variable **`APIFOOTBALL_KEY`**. One call returns
  every match in play; it runs about every 15 s (`APIFOOTBALL_POLL_SEC`) only while one of our real matches is live,
  and never faster than the plan's daily allowance can carry (the Pro plan, 7,500 calls a day, covers a full day of
  matches). Matches are paired by both team names and kick-off. With fresh scores, real matches are no longer
  "blind": the real minute, goals within seconds, no stake cap.
