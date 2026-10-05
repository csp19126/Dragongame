/**
 * Return-to-player report for the real slot engine (HOLD, Rồng Lặp, free spins and jackpot included).
 *   npx tsx script/rtp.ts            10 million spins each way
 *   npx tsx script/rtp.ts 40000000   any number of spins
 * "Best holds" uses bestHold(): the hold with the highest exact expected line pays.
 * Free spins are played at x1; every Chọn Lì Xì pick has the same spins x multiplier.
 */
import { BASE_RTP, RTP_WITHOUT_HOLD, JACKPOT_CONTRIBUTION, HOLD_CHANCE } from "../shared/schema";
import { GRADE_BLESSING, STICKS } from "../shared/oracle";
import { spin, bestHold, type Hold } from "../server/game";
import { randomInt } from "crypto";

const N = Number(process.argv[2] ?? 10_000_000);
const BET = 1000;
const pct = (x: number) => (x * 100).toFixed(3) + "%";

function run(smart: boolean) {
  let paid = 0, won = 0, pending = 0, base = 0, hits = 0, back = 0, profitable = 0, big = 0, jackpots = 0, maxWin = 0, sumSq = 0, holds = 0;
  let offer: string[][] | null = null;
  for (let i = 0; i < N; i++) {
    const free = pending > 0;
    let hold: Hold | undefined;
    if (free) pending--;
    else {
      paid += BET; base++;
      if (offer && smart) { const b = bestHold(offer); if (b.reels.some(Boolean)) { hold = { grid: offer, reels: b.reels }; holds++; } }
    }
    const r = spin(BET, { hold });
    won += r.winAmount;
    sumSq += (r.winAmount / BET) ** 2;
    pending += r.freeSpinUnits;
    if (!free) {
      if (r.winAmount > 0) hits++;
      if (r.winAmount >= BET) back++;
      if (r.winAmount > BET) profitable++;
      if (r.winAmount >= 10 * BET) big++;
    }
    if (r.jackpotHit) jackpots++;
    if (r.winAmount > maxWin) maxWin = r.winAmount;
    offer = !free && !hold && r.winAmount === 0 && r.freeSpinUnits === 0 && randomInt(HOLD_CHANCE) === 0 ? r.grid : null;
  }
  const rtp = won / paid;
  const sd = Math.sqrt(sumSq / N - (won / N / BET) ** 2);
  console.log(`${smart ? "Best holds" : "Never holds"}: ${N.toLocaleString()} spins: RTP ${pct(rtp)} ± ${pct((2 * sd) / Math.sqrt(N))} (95% conf.), published ${pct(smart ? BASE_RTP : RTP_WITHOUT_HOLD)}`);
  console.log(`  any win ${pct(hits / base)}, money back ${pct(back / base)}, profit ${pct(profitable / base)}, 10x+ 1 in ${(base / big).toFixed(0)}, ` +
    `holds used ${holds.toLocaleString()}, jackpot 1 in ${jackpots ? (N / jackpots).toFixed(0) : "–"}, max ${maxWin / BET}x`);
  return rtp;
}

const best = run(true);
run(false);
console.log(`  + ${pct(JACKPOT_CONTRIBUTION)} of bets paid back through the jackpot = ${pct(best + JACKPOT_CONTRIBUTION)} total with best holds`);
const avgBlessing = STICKS.reduce((a, s) => a + GRADE_BLESSING[s.grade], 0) / STICKS.length;
console.log(`  oracle-blessed spin returns about ${pct(best * avgBlessing)} on average (once per hour)`);
