# LetBetAfrika – Professional Quality Bar (Definition of Done)

This is a **paid, commercial-grade product**. It must look, feel and behave like an official, licensed African
sportsbook (benchmark: SportyBet, Bet9ja, BetKing) – not a prototype. **Nothing is "done" until every box in the
relevant section below is ticked, tested, and shown with screenshots in the pull request.**

Live site: https://api-production-2673beb3.up.railway.app (Railway project `letbetafrika`, service `api`).

---

## 1. Non-negotiables

- [ ] **No fake anything in production.** No simulated players, no invented winners, no placeholder bank names,
      no "DEMO/TEST" labels, no lorem ipsum, no hard-coded odds. Every number on screen comes from the server.
- [ ] **Money is always correct.** Every balance change goes through `wallet.js` in a DB transaction and has a test.
      Ledger total = balance for every user (`server/test/payout.test.js` pattern).
- [ ] **No console errors, no broken images, no dead links, no horizontal scroll** on any page (phone + desktop).
- [ ] **Secrets never in git.** Keys live in Railway variables only.
- [ ] Every PR: side-by-side screenshots vs SportyBet (`tools/qa/compare2.js`) + passing QA scripts.

## 2. Brand & visual polish

- [ ] Real logo set: SVG wordmark + icon, favicon, app icons (192/512/maskable), Open Graph image (1200×630) –
      commissioned from a designer, consistent everywhere.
- [ ] One type scale (tokens in `betting/UI-HANDOVER.md` §3). Audit every page – no stray font sizes or weights.
- [ ] One spacing system: 12px gutter, aligned columns (`tools/qa/align.js` must print `aligned` everywhere).
- [ ] Real flags (done) and **real crests for every club in every enabled league** – no drawn fallbacks visible
      for top leagues. Source from official club sites / licensed provider; document usage rights.
- [ ] Banners and promotions: professional artwork per campaign, per country (₦ / GH₵ variants), no stock-looking images.
- [ ] Skeleton loaders on every list, smooth transitions, no layout jumps (CLS < 0.1).
- [ ] Dark mode checked on every screen.
- [ ] Empty, error and offline states on every screen, written in friendly plain English.

## 3. Product completeness (feature parity with the benchmark)

- [ ] Sports: pre-match + live for football and at least basketball, tennis; outrights bettable; Bet Builder (stretch).
- [ ] Live: real live scores with match minute, live odds open when data is fresh (needs paid odds plan).
- [ ] Betslip: singles, multiples, system bets, booking codes, odds-change handling, accept-odds toggle.
- [ ] Cashout (full; partial as stretch), bet history with filters, bet detail, share ticket image.
- [ ] **All games playable for real money** (server-authoritative, see `HANDOVER.md` §6): Rocket Crash
      (provably fair, verification page), Instant Football, Virtual League, Lucky Dice, Spin & Win, Penalty Kick,
      Number Rush, Keno, Scratch Cards, Hi-Lo. Game history per player. RTP shown in each game's info.
- [ ] **Trophy & celebration on every win** (bets, games, jackpot): trophy modal, amount, confetti, sound toggle,
      "My Wins" list on Me.
- [ ] Jackpot: real rounds, results, prize tiers paid automatically.
- [ ] Promotions: real terms, opt-in, bonus wallet with wagering tracking.
- [ ] Notifications: in-app inbox + SMS/email for deposits, withdrawals, wins.

## 4. Payments & accounts (go-live)

- [ ] Real deposits: Paystack/Flutterwave (cards, bank transfer, USSD, OPay, PalmPay) in NG; MTN MoMo, Telecel,
      AirtelTigo in GH. Webhooks verified by signature, idempotent, reconciled daily.
- [ ] Real withdrawals with name enquiry, limits, fraud checks, admin approval queue.
- [ ] Real SMS OTP (Termii or similar), rate-limited; KYC (Smile ID) before withdrawal.
- [ ] Password rules, session management, logout everywhere, account deletion request.

## 5. Security

- [ ] OWASP Top 10 review; dependency audit (`npm audit`) clean.
- [ ] Rate limits on auth, bets, games, wallet; brute-force lockout; CAPTCHA on repeated failures.
- [ ] JWT secret rotation plan; HTTPS only; secure headers (helmet) with a real Content-Security-Policy.
- [ ] Admin panel behind role + 2FA; audit log of every admin action and manual balance change.
- [ ] Game outcomes only from CSPRNG / committed seeds; no client-trusted values anywhere.

## 6. Performance & scale (10,000 simultaneous users)

- [ ] Cached, pre-gzipped event feed with ETag; p95 API latency < 200 ms under load.
- [ ] Load test report committed (`docs/LOADTEST.md`): 10k virtual users, 2,000+ req/s on events, 50+ bets/s,
      error rate < 0.1%.
- [ ] Multiple Railway replicas; no in-memory state; DB pool sized; indexes verified with `EXPLAIN`.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90.
- [ ] Images optimised (crests ≤ 40 KB, banners WebP), fonts preloaded, JS < 300 KB.

## 7. Reliability & operations

- [ ] Custom domain (e.g. letbetafrika.com) with SSL; staging environment separate from production.
- [ ] Error tracking (Sentry or similar), uptime monitor, alerting on feed failures and low odds-API credits.
- [ ] Daily database backups with a tested restore.
- [ ] Admin dashboard: users, payments, bets, risk/liability per event, manual settlement, odds-feed health
      (`GET /api/admin/feed`).
- [ ] Runbooks for: feed down, payment provider down, wrong settlement (resettle), suspicious account.

## 8. Legal & compliance (operator's lawyer signs off)

- [ ] Licences: NLRC / Lagos LSLGA (Nigeria), Gaming Commission of Ghana – licence number in the footer.
- [ ] Terms & Conditions, Privacy Policy, Responsible Gambling, Cookie policy, Complaints – reviewed by a lawyer.
- [ ] 18+ age gate and checks; self-exclusion and deposit limits enforced server-side.
- [ ] AML: KYC thresholds, transaction monitoring, suspicious activity reporting.
- [ ] Rights to every crest, logo, image and font used.

## 9. QA sign-off before each release

- [ ] `node --test server/test/*.test.js` green.
- [ ] `tools/qa/smoke.js`, all `e2e_*.js`, `align.js`, `axe_run.js` green in demo and live mode.
- [ ] Manual pass on a real Android phone (low-end) and an iPhone, on 3G throttling.
- [ ] Side-by-side review vs SportyBet for every changed screen.
- [ ] Release notes in the PR; rollback plan (Railway "Redeploy previous").

---

**Standard to aim for:** a customer should not be able to tell this apart from the market leaders – except
that it is faster, cleaner and fairer.
