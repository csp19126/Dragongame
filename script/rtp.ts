/**
 * Return-to-player report for the slot engine.
 *   npx tsx script/rtp.ts           exact (analytic) RTP + a Monte Carlo cross-check of the real engine
 *   npx tsx script/rtp.ts --brute   also enumerates every one of the 7^9 grids (about a minute)
 */
import { SLOT_SYMBOLS, ORACLE_WIN_MULTIPLIER, MAX_WIN_MULTIPLE } from "../shared/schema";
import { evaluate, spin, exactRtp } from "../server/game";

const pct = (x: number) => (x * 100).toFixed(3) + "%";
const BET = 1000;

const e = exactRtp();
console.log(`Exact: base return ${pct(e.baseReturn)}, free spins per paid spin ${e.freeSpinsPerSpin.toFixed(4)}, ` +
  `free spins trigger 1 in ${(1 / e.triggerChance).toFixed(1)}, RTP ${pct(e.rtp)}, max win ${MAX_WIN_MULTIPLE}x bet`);
console.log(`Oracle-blessed spin returns ${pct(e.baseReturn * ORACLE_WIN_MULTIPLIER)} (once per hour)`);

// Monte Carlo of the real engine (crypto RNG), including free spins
let paid = 0, won = 0, pending = 0, hits = 0, profitable = 0;
const N = 2_000_000;
for (let i = 0; i < N; i++) {
  const free = pending > 0;
  if (free) pending--; else paid += BET;
  const r = spin(BET);
  won += r.winAmount;
  pending += r.freeSpinsAwarded;
  if (r.winAmount > 0) hits++;
  if (r.winAmount > BET) profitable++;
}
console.log(`Monte Carlo (${N.toLocaleString()} spins incl. free spins): RTP ${pct(won / paid)}, ` +
  `any win ${pct(hits / N)}, profitable spins ${pct(profitable / N)}`);

if (process.argv.includes("--brute")) {
  const ids = SLOT_SYMBOLS.map((s) => s.id);
  const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
  const p = SLOT_SYMBOLS.map((s) => s.weight / total);
  const n = ids.length;
  let ret = 0, fs = 0;
  const idx = new Array(9).fill(0);
  for (let combo = 0; combo < n ** 9; combo++) {
    let c = combo, prob = 1;
    for (let k = 0; k < 9; k++) { idx[k] = c % n; c = Math.floor(c / n); prob *= p[idx[k]]; }
    const r = evaluate([0, 1, 2].map((col) => [0, 1, 2].map((row) => ids[idx[col * 3 + row]])), BET);
    ret += (prob * r.winAmount) / BET;
    fs += prob * r.freeSpinsAwarded;
  }
  console.log(`Brute force over ${(n ** 9).toLocaleString()} grids: RTP ${pct(ret / (1 - fs))}`);
}
