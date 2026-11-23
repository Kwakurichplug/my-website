// In-play betting rules (Settings -> "inplay"), the same for every kind of football match:
//   closeMinute   in-play markets close at this minute of the 2nd half (default 80)
//   blind         real matches with NO fresh live score (no live-score feed): 1 = still open, priced from the last known
//                 score and the clock, with the stake caps below and a longer bet delay; 0 = paused until a fresh score
//   blindMaxStake per country: the most one player can stake in play on one such match (all their bets together)
//   delaySec / blindDelaySec   an in-play bet is confirmed after this wait – a goal in the meantime refuses it
import { getSetting } from './settings.js';
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
export async function inplayRules() {
  const v = (await getSetting('inplay').catch(() => null)) || {};
  return { closeMinute: Math.min(90, Math.max(1, num(v.closeMinute, 80))), blind: !(v.blind === 0 || v.blind === false),
    blindMaxStake: { NG: 2000, GH: 20, ...(v.blindMaxStake || {}) }, delaySec: Math.min(20, Math.max(0, num(v.delaySec, 5))), blindDelaySec: Math.min(30, Math.max(0, num(v.blindDelaySec, 8))) };
}
/** past the in-play closing minute (2nd half) */
export const pastClose = (period, minute, R) => period === 'H2' && Number(minute) >= R.closeMinute;
