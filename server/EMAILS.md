# LetBetAfrika – transactional emails

Everything the platform emails to customers, and the design rules they all follow.
Code: `server/src/emails/` (`layout.js` = design system, `templates.js` = the emails,
`index.js` = sending). Preview all of them with `node scripts/preview-emails.js out/`.

---

## Design system

Modelled on clean fintech receipts (Remitly-style): a lot of white, one headline,
one big number, one button, and nothing that competes with them.

| Element | Spec |
|---|---|
| Canvas | `#f3f4f6` page, 600px white card, 16px radius, 1px `#e5e7eb` border, 6px green top bar |
| Header | Wordmark "LetBet**Afrika**" (Afrika in green) left, country right |
| Type | System stack (-apple-system, Segoe UI, Roboto, Helvetica, Arial). Headline 26/32 700, body 16/24, meta 13/20, hero number 38/46 700 |
| Colours | green `#0a7d3e`, dark green `#06612f`, gold `#ffc20e`, ink `#1b1e25`, text `#1c1f23`, muted `#6b7280`, line `#e5e7eb`, red `#e5163a`, amber `#b45309` |
| Hero amount | Centred number in a soft grey card; green for money in / wins, red for failures, ink otherwise; sub-line shows new balance |
| Details card | Two-column table, label muted / value dark, optional uppercase title row ("Receipt") |
| Button | 48px, 8px radius, white on green (primary) or ink on gold (secondary); only one primary per email |
| Progress | 3-step bar (Requested → Processing → Paid; Submitted → Under review → Verified) |
| Callout | Soft tinted box: info (indigo), success (green), warn (amber), danger (red); used for reasons and T&Cs |
| Footer | Help line with support email, links (How to play · Responsible gambling · Help), 18+ mark, legal line, licence note |
| Tone | Short, plain, first name. One idea per email. Money shown with symbol: ₦5,000.00 / GH₵350.00 |
| Tech | Table layout, inline styles, no images required (logo is text), works in Gmail, Outlook, Apple Mail, Yahoo; preheader text; plain-text alternative on every email; mobile collapses to full width with 20px padding |

Subject lines lead with the fact ("Deposit received: ₦5,000.00"). Preheaders add the next useful detail.

---

## The emails (21)

| # | Template | Trigger | Subject | Key content |
|---|---|---|---|---|
| 1 | `welcome` | Account created | Welcome to LetBetAfrika | Account ID, phone, currency; 200% bonus callout; **Make your first deposit** |
| 2 | `otp` | Code requested by email | *482913* is your LetBetAfrika code | Large dashed code box; expires in 10 min |
| 3 | `passwordChanged` | Password updated | Your password was changed | Time, location; warn callout; **Secure my account** |
| 4 | `newDevice` | Login from unseen device | New login to your account | Device, time, location; **Change password** |
| 5 | `kycSubmitted` | ID documents sent | We received your ID documents | Progress bar step 2; "under 24 hours" |
| 6 | `kycVerified` | Admin verifies | Your account is verified | Progress complete; withdrawals open; **Go to my wallet** |
| 7 | `kycRejected` | Admin rejects | We could not verify your documents | Reason in red callout; **Resubmit documents** |
| 8 | `depositSuccess` | Deposit credited | Deposit received: ₦5,000.00 | Green hero amount + new balance; receipt card (method, reference, date, status); **Start betting** |
| 9 | `depositFailed` | Provider declines | Your deposit did not go through | Reason; "no money was taken"; **Try again** |
| 10 | `withdrawalRequested` | Withdrawal placed | Withdrawal request received: GH₵350.00 | Hero amount "to MTN MoMo"; progress step 2; reference, expected time |
| 11 | `withdrawalPaid` | Admin approves | Paid: GH₵350.00 sent to you | Green hero; progress complete; receipt card; "keep as proof" |
| 12 | `withdrawalRejected` | Admin rejects | Withdrawal returned to your balance | Reason; returned amount, balance now; **Update payout details** |
| 13 | `betPlaced` | Bet accepted | Bet placed: ticket T7F3A9C2 | Potential win hero; selections list; ticket, type, time; **Follow my bet** |
| 14 | `betWon` | Settled as won | You won ₦6,914.50! | Green winnings hero + balance; selections with WON tags; **Withdraw winnings** + gold **Place another bet** |
| 15 | `betSettled` | Settled lost / void | Ticket T7F3A9C2 settled | Selections with WON/LOST tags; result row; responsible-gambling line |
| 16 | `cashout` | Cashout taken | Cashed out: ₦2,410.00 | Green hero; original stake vs potential; **View bet history** |
| 17 | `jackpotTicket` | Jackpot entry | Jackpot ticket J4K8M2 confirmed | 12 picks table; draw time; prize pool |
| 18 | `bonusCredited` | Bonus added | Bonus added: ₦10,000.00 | Green hero; T&Cs callout; gold **Use my bonus** |
| 19 | `limitsUpdated` | Limits saved | Your limits were updated | Deposit limit, reminder; "lower limits apply immediately" |
| 20 | `selfExclusion` | Break requested | Your break has started | Pause date; helpline callout; cannot be reversed early |
| 21 | `weeklySummary` | Monday 08:00 (scheduled) | Your week at LetBetAfrika | Bets, staked, won, deposits, withdrawals, balance |

Admin-side notifications (large withdrawal pending, KYC queue, settlement failures)
go to Slack/email for staff and are not part of this customer set.

---

## Where each one is sent from

| Template | File |
|---|---|
| welcome, passwordChanged, kycSubmitted, limitsUpdated, selfExclusion | `routes/auth.js` |
| depositSuccess (demo mode), withdrawalRequested | `routes/wallet.js` |
| betPlaced, cashout | `routes/bets.js` |
| betWon, betSettled | `lib/settle.js` |
| depositSuccess/Failed, withdrawalPaid/Rejected, kycVerified/Rejected | `routes/admin.js` (approve / reject / verify) |
| otp (sign-up, password reset and email-change codes) | `lib/otp.js` (`issueEmailOtp`) |
| jackpotTicket | `routes/jackpot.js` (after the purchase commits) |
| bonusCredited | `lib/settle.js` (when the welcome bonus is released as cash) |
| passwordChanged (also after a reset) | `routes/auth.js` |
| newDevice, weeklySummary | ready; hooked up when those features land on the backend |

Sends are fire-and-forget: a failed email never fails the bet or payment. Every send
is recorded in `email_log` with `status` sent / logged (console) / failed and the `error`;
codes are never stored (the subject is redacted). Players without an email address
receive nothing; they can add one under Me → Email & Password (verified by a code).
Sign-up and reset codes by email are the one exception to fire-and-forget: the request
waits for the SMTP server and answers `email_failed` if it refuses.

---

## Configuration

```
EMAIL_PROVIDER=console | smtp | resend | sendgrid
EMAIL_FROM="LetBetAfrika <no-reply@letbetafrika.com>"
# smtp (nodemailer): port 587 = STARTTLS, 465 = TLS (or SMTP_SECURE=true)
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
# or an HTTP API instead of SMTP
RESEND_API_KEY= / SENDGRID_API_KEY=
SITE_URL=https://letbetafrika.com
SUPPORT_EMAIL=support@letbetafrika.com
```

**Live site:** Spacemail mailbox `info@letbetafrika.online` – `EMAIL_PROVIDER=smtp`, `SMTP_HOST=mail.spacemail.com`,
`SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=info@letbetafrika.online`, `EMAIL_FROM=LetBetAfrika <info@letbetafrika.online>`,
`SUPPORT_EMAIL=info@letbetafrika.online`, `SITE_URL=https://letbetafrika.online` and `SMTP_PASS` are set in Railway (live:
the boot log says `– ready`). Railway allows outbound SMTP
on the Pro plan only (Free/Trial/Hobby block it – use Resend there).

At boot the server checks the connection and logs one line, e.g.
`[email] smtp mail.spacemail.com:465 as LetBetAfrika <info@letbetafrika.online> – ready`
(or `SMTP_PASS is not set yet`, `EAUTH: … 535` = wrong password, `NOT reachable` = blocked port). It re-checks every
10 minutes until it works. `GET /api/admin/email/status?check=1` shows the same, `GET /api/admin/email/log` the last
100 sends.

Set these as Railway variables (never in git), redeploy, then send a test from the admin API:
`POST /api/admin/email/test {"to": "you@example.com"}` with an admin token → `{ok: true, provider: "smtp"}`, or
`{ok: false, error}` with the SMTP server's message (wrong password, blocked port, unverified sender…).

Who receives email: players add an address under **Me → Email & Password** or on **Verify ID**
(`POST /api/auth/email`). Sign-up is phone-only, so players without an address get SMS/in-app only.

For deliverability set up SPF, DKIM and DMARC on the sending domain, use a
sub-domain such as `mail.letbetafrika.com`, and keep marketing mail on a
separate stream from these transactional emails.

---

## Adding a new email

1. Add a function to `templates.js` using the blocks in `layout.js`
   (`h1, p, amount, details, button, steps, note, code, legs, small`).
2. Add sample data in `scripts/preview-emails.js` and run it.
3. Call `sendEmail('name', user, data)` from the route that triggers it.
4. Add a row to the table above.
