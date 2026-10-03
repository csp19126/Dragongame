/**
 * Exact return-to-player calculation for the slot engine.
 * Enumerates all 5^9 grids with their probabilities, then cross-checks the
 * real engine with a Monte Carlo run.  Usage: npx tsx script/rtp.ts
 */
import { SLOT_SYMBOLS, ORACLE_WIN_MULTIPLIER, FREE_SPINS_AWARD } from "../shared/schema";
import { evaluate, spin } from "../server/game";

function exact() {
  const ids = SLOT_SYMBOLS.map((s) => s.id);
  const w = SLOT_SYMBOLS.map((s) => s.weight);
  const total = w.reduce((a, b) => a + b, 0);
  const p = w.map((x) => x / total);
  const n = ids.length;
  const cells = 9;
  let ret = 0, hit = 0, trigger = 0, maxMult = 0;
  const idx = new Array(cells).fill(0);
  for (let combo = 0; combo < n ** cells; combo++) {
    let c = combo, prob = 1;
    for (let k = 0; k < cells; k++) { idx[k] = c % n; c = Math.floor(c / n); prob *= p[idx[k]]; }
    const grid = [0, 1, 2].map((col) => [0, 1, 2].map((row) => ids[idx[col * 3 + row]]));
    const r = evaluate(grid, 1000);
    const mult = r.winAmount / 1000;
    ret += prob * mult;
    if (mult > 0) hit += prob;
    if (r.freeSpinsAwarded) trigger += prob;
    if (mult > maxMult) maxMult = mult;
  }
  // A free spin returns `ret` and can itself retrigger: F = ret + q*N*F
  const freeSpinValue = ret / (1 - trigger * FREE_SPINS_AWARD);
  const rtp = ret + trigger * FREE_SPINS_AWARD * freeSpinValue;
  return { baseReturn: ret, hitRate: hit, freeSpinTrigger: trigger, rtp, maxMult };
}

const pct = (x: number) => (x * 100).toFixed(3) + "%";
const r = exact();
console.log(`Base return ${pct(r.baseReturn)}, hit rate ${pct(r.hitRate)}, free-spin trigger ${pct(r.freeSpinTrigger)}, ` +
  `RTP incl. free spins ${pct(r.rtp)}, max ${r.maxMult}x bet`);
console.log(`Oracle-blessed spin returns ${pct(r.baseReturn * ORACLE_WIN_MULTIPLIER)} (once per hour)`);

let paid = 0, won = 0;
const N = 2_000_000;
for (let i = 0; i < N; i++) { paid += 1000; won += spin(1000).winAmount; }
console.log(`Monte Carlo (${N.toLocaleString()} real-engine spins, no free spins): base return ${pct(won / paid)}`);
