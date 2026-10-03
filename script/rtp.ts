/**
 * Return-to-player report for the real slot engine (Repeater, free spins and jackpot included).
 *   npx tsx script/rtp.ts            20 million spins
 *   npx tsx script/rtp.ts 100000000  any number of spins
 */
import { BASE_RTP, JACKPOT_CONTRIBUTION, ORACLE_WIN_MULTIPLIER } from "../shared/schema";
import { spin } from "../server/game";

const N = Number(process.argv[2] ?? 20_000_000);
const BET = 1000;
const pct = (x: number) => (x * 100).toFixed(3) + "%";

let paid = 0, won = 0, pending = 0, hits = 0, profitable = 0, big = 0, repeats = 0, jackpots = 0, maxWin = 0, sumSq = 0;
for (let i = 0; i < N; i++) {
  if (pending > 0) pending--; else paid += BET;
  const r = spin(BET);
  won += r.winAmount;
  sumSq += (r.winAmount / BET) ** 2;
  pending += r.freeSpinsAwarded;
  repeats += r.repeats;
  if (r.winAmount > 0) hits++;
  if (r.winAmount > BET) profitable++;
  if (r.winAmount >= 10 * BET) big++;
  if (r.jackpotHit) jackpots++;
  if (r.winAmount > maxWin) maxWin = r.winAmount;
}
const rtp = won / paid;
const sd = Math.sqrt(sumSq / N - (won / N / BET) ** 2);
console.log(`${N.toLocaleString()} spins: base RTP ${pct(rtp)} ± ${pct((2 * sd) / Math.sqrt(N))} (95% conf.), published ${pct(BASE_RTP)}`);
console.log(`  + ${pct(JACKPOT_CONTRIBUTION)} of bets paid back through the jackpot = ${pct(rtp + JACKPOT_CONTRIBUTION)} total`);
console.log(`  any win ${pct(hits / N)}, profitable ${pct(profitable / N)}, 10x+ 1 in ${(N / big).toFixed(0)}, ` +
  `repeats per spin ${(repeats / N).toFixed(3)}, jackpot 1 in ${jackpots ? (N / jackpots).toFixed(0) : "–"}, max ${maxWin / BET}x`);
console.log(`  oracle-blessed spin returns ${pct(rtp * ORACLE_WIN_MULTIPLIER)} (once per hour)`);
