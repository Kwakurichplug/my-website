// Pop-ups for players, shown when they open the app or log in (betting/account.js → Account.notices()):
//   deposit_request     – support set up a deposit for them (admin portal → Request deposit): how to pay + a button to
//                         the deposit page with the amount filled in; stays until they make a deposit (or 7 days)
//   deposit_credited    – an admin credited or confirmed a deposit          (shown once)
//   deposit_rejected    – an admin could not confirm a deposit, with reason (shown once)
//   withdrawal_paid     – a withdrawal was paid, with its reference         (shown once)
//   withdrawal_rejected – a withdrawal came back to the balance, with reason (shown once)
//   kyc_approved        – their ID was approved: the Deposit 1, 2, 3 bonuses are open – "Make deposit 1" (shown once)
//   kyc_rejected        – their ID was not approved, with reason and a button to send it again (shown once)
// `db` = anything with .query (the pool through q, or a transaction client).
export const KINDS = ['deposit_request', 'deposit_credited', 'deposit_rejected', 'withdrawal_paid', 'withdrawal_rejected', 'kyc_approved', 'kyc_rejected'];
export async function notify(db, userId, kind, data = {}, by = null, days = null) {
  const { rows } = await db.query(`INSERT INTO notices (user_id, kind, data, created_by, expires_at) VALUES ($1,$2,$3,$4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END) RETURNING *`,
    [userId, kind, data, by, days]);
  return rows[0];
}
/** The player acted on support's request (made a deposit, or one was credited for them): close it. */
export const closeDepositRequests = (db, userId) => db.query(`UPDATE notices SET done_at=now() WHERE user_id=$1 AND kind='deposit_request' AND done_at IS NULL`, [userId]);
export async function openFor(db, userId) {
  const { rows } = await db.query(`SELECT id, kind, data, created_at, expires_at FROM notices WHERE user_id=$1 AND done_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY (kind = 'deposit_request') DESC, created_at LIMIT 10`, [userId]);
  return rows;
}
