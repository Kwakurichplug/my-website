// All balance changes go through here, inside the caller's transaction client,
// so a bet or payout can never leave the ledger and the cached balance out of step.
// Play-through (withdrawals): a deposit must be staked once before it can be withdrawn. users.playthrough_left goes
// up with each deposit, down with each stake (sports, virtuals, games, jackpot), and is never above the balance –
// so winnings are never locked, only the part of the deposits not yet played.
const STAKES = new Set(['bet', 'game_bet', 'virtual_bet', 'jackpot']);
export async function move(client, userId, type, amount, ref = null, meta = {}) {
  const amt = Math.round(Number(amount) * 100) / 100;
  const play = type === 'deposit' ? amt : STAKES.has(type) ? amt : 0;   // stakes come in negative
  const { rows } = await client.query(
    'UPDATE users SET balance = balance + $2, playthrough_left = least(balance + $2, greatest(0, playthrough_left + $3)) WHERE id = $1 RETURNING balance',
    [userId, amt, play],
  );
  if (!rows[0]) throw Object.assign(new Error('no_user'), { status: 404 });
  await client.query(
    'INSERT INTO transactions (user_id, type, amount, balance_after, ref, meta) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, type, amt, rows[0].balance, ref, meta],
  );
  return Number(rows[0].balance);
}

/** Debit that fails cleanly when funds are short (the CHECK on users.balance is the backstop). */
export async function debit(client, userId, type, amount, ref, meta) {
  const { rows } = await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [userId]);
  if (!rows[0] || Number(rows[0].balance) < Number(amount)) throw Object.assign(new Error('insufficient_funds'), { status: 402 });
  return move(client, userId, type, -Math.abs(amount), ref, meta);
}
