import { describe, it, expect } from "vitest";
import { spin, lineWinsFor, scatterFor, pickSymbol, evalLine, pearlCount, holdEV, bestHold, randomGrid, type Rng, type Hold } from "../server/game";
import {
  SLOT_SYMBOLS, PAYLINES, SCATTER_PAYS, REPEATER_MULTIPLIERS, REPEATER_PEARLS, REPEATER_SMALL, REPEATER_BIG_PEARLS, repeaterLadder, BASE_RTP, JACKPOT_ROW, REELS, ROWS,
  FREE_SPIN_OPTIONS, payOf, HOLD_CHANCE, HOLD_MAX_REELS, RTP_WITHOUT_HOLD,
} from "../shared/schema";
import { GAMBLE_PICKS, GAMBLE_PAYS, gambleWins } from "../shared/gamble";
import { STICKS, GRADE_BLESSING, ADVICE, TOPICS } from "../shared/oracle";
import * as s7 from "../shared/slot777";
import { play777 } from "../server/slot777";

const BET = 1000;
const pay = (id: string, count: number, mult = 1) => Math.floor(payOf(id, count) * BET) * mult;

/** Builds grid[reel][row] from rows written top to bottom, the way you'd see them on screen */
function fromRows(rows: string[][]): string[][] {
  return Array.from({ length: REELS }, (_, c) => Array.from({ length: ROWS }, (_, r) => rows[r][c]));
}
const copy = (g: string[][]) => g.map((col) => [...col]);

/** An RNG that makes pickSymbol return the given symbols in order (then throws if over-used) */
function scripted(symbols: string[]): Rng & { used: () => number } {
  const starts = new Map<string, number>();
  let acc = 0;
  for (const s of SLOT_SYMBOLS) { starts.set(s.id, acc); acc += s.weight; }
  let i = 0;
  const rng = ((_max: number) => {
    if (i >= symbols.length) throw new Error(`RNG used ${i + 1} times, only ${symbols.length} scripted`);
    return starts.get(symbols[i++])!;
  }) as Rng & { used: () => number };
  rng.used = () => i;
  return rng;
}
/** Re-spins that can never form a line: envelopes break every line and only count on the first spin */
const envelopes = (n = 200) => scripted(Array(n).fill("envelope"));

// No line pays here: reels 1 and 2 only share "drum", in rows no payline joins
const NOTHING = fromRows([
  ["dragon", "drum", "lotus", "lantern", "koi"],
  ["lantern", "koi", "dragon", "drum", "lotus"],
  ["drum", "lotus", "koi", "dragon", "lantern"],
]);

describe("reels and paylines", () => {
  it("has 5 reels of 3 rows and 10 different paylines", () => {
    expect(PAYLINES).toHaveLength(10);
    expect(new Set(PAYLINES.map((l) => l.join(""))).size).toBe(10);
    for (const l of PAYLINES) {
      expect(l).toHaveLength(REELS);
      l.forEach((r) => expect([0, 1, 2]).toContain(r));
    }
  });

  it("pays nothing when nothing lines up", () => {
    expect(lineWinsFor(NOTHING, BET)).toEqual([]);
    expect(scatterFor(NOTHING, BET).count).toBe(0);
    expect(spin(BET, { startGrid: NOTHING, rng: envelopes() }).winAmount).toBe(0);
  });

  it.each(PAYLINES.map((line, idx) => [idx, line] as const))("detects payline %i from the left", (idx, line) => {
    const grid = copy(NOTHING);
    line.slice(0, 3).forEach((row, reel) => { grid[reel][row] = "lotus"; });
    expect(lineWinsFor(grid, BET).find((w) => w.line === idx)).toMatchObject({ symbol: "lotus", count: 3, amount: pay("lotus", 3) });
  });

  it("pays 3, 4 and 5 in a row at the published prices, and more for longer runs", () => {
    for (const s of SLOT_SYMBOLS.filter((x) => x.kind === "regular")) {
      for (const count of [3, 4, 5]) {
        const grid = copy(NOTHING);
        for (let reel = 0; reel < count; reel++) grid[reel][1] = s.id;
        if (count < 5) grid[count][1] = "envelope"; // end the run here
        expect(lineWinsFor(grid, BET).find((w) => w.line === 0)).toMatchObject({ symbol: s.id, count, amount: pay(s.id, count), withWild: false });
      }
      expect(s.pays[1]).toBeGreaterThan(s.pays[0]);
      expect(s.pays[2]).toBeGreaterThan(s.pays[1]);
    }
  });

  it("a run must start on the first reel", () => {
    const grid = copy(NOTHING);
    for (let reel = 1; reel < 5; reel++) grid[reel][1] = "dragon";
    expect(lineWinsFor(grid, BET).find((w) => w.line === 0)).toBeUndefined();
  });

  it("every win scales with the bet: 1000x the bet pays 1000x as much", () => {
    for (const s of SLOT_SYMBOLS.filter((x) => x.kind !== "scatter")) {
      const grid = copy(NOTHING);
      for (let reel = 0; reel < 5; reel++) grid[reel][1] = s.id;
      const small = lineWinsFor(grid, 1000).find((w) => w.line === 0)!.amount;
      const big = lineWinsFor(grid, 1_000_000).find((w) => w.line === 0)!.amount;
      expect(big).toBe(small * 1000);
    }
  });
});

describe("wild (Dragon Pearl)", () => {
  it("stands in for a symbol and pays that symbol", () => {
    expect(evalLine(["drum", "pearl", "drum", "koi", "koi"])).toEqual({ symbol: "drum", count: 3, value: payOf("drum", 3), withWild: true });
    expect(evalLine(["pearl", "dragon", "dragon", "pearl", "dragon"])).toEqual({ symbol: "dragon", count: 5, value: payOf("dragon", 5), withWild: true });
  });

  it("a run of wilds pays by itself, and the better of the two readings wins", () => {
    expect(evalLine(["pearl", "pearl", "pearl", "coin", "coin"])).toMatchObject({ symbol: "pearl", count: 3, value: payOf("pearl", 3) });
    expect(evalLine(["pearl", "pearl", "pearl", "pearl", "pearl"])).toMatchObject({ symbol: "pearl", count: 5 });
    expect(evalLine(["pearl", "pearl", "dragon", "dragon", "dragon"])).toMatchObject({ symbol: "dragon", count: 5 });
  });

  it("doesn't join two different symbols, and envelopes break lines", () => {
    expect(evalLine(["drum", "pearl", "lotus", "lotus", "lotus"])).toBeNull();
    expect(evalLine(["envelope", "pearl", "pearl", "pearl", "pearl"])).toBeNull();
    expect(evalLine(["pearl", "pearl", "envelope", "dragon", "dragon"])).toBeNull();
  });
});

describe("scatter (Lucky Red Envelope)", () => {
  const withEnvelopes = (n: number) => {
    const g = copy(NOTHING);
    [[0, 0], [4, 2], [2, 1], [1, 2], [3, 0], [0, 2]].slice(0, n).forEach(([c, r]) => { g[c][r] = "envelope"; });
    return g;
  };

  it("two envelopes pay nothing", () => {
    expect(scatterFor(withEnvelopes(2), BET)).toEqual({ count: 2, win: 0, units: 0 });
  });

  it.each(SCATTER_PAYS.map((t) => [t.count, t] as const))("%i envelopes anywhere pay the prize and free-spin units", (count, tier) => {
    expect(scatterFor(withEnvelopes(count), BET)).toEqual({ count, win: tier.pays * BET, units: tier.units });
  });

  it("every free-spin pick divides the award exactly, so every envelope is worth the same", () => {
    for (const t of SCATTER_PAYS) for (const o of FREE_SPIN_OPTIONS) {
      expect(t.units % o.mult).toBe(0);
      expect((t.units / o.mult) * o.mult).toBe(t.units);
    }
  });
});

describe("Rồng Lặp (Repeater)", () => {
  it(`stays asleep with fewer than ${REPEATER_PEARLS} pearls, even after a win`, () => {
    const grid = copy(NOTHING);
    for (let reel = 0; reel < 5; reel++) grid[reel][1] = "lantern";
    grid[0][0] = "pearl";
    expect(pearlCount(grid)).toBe(REPEATER_PEARLS - 1);
    const r = spin(BET, { startGrid: grid, rng: scripted([]) });
    expect(r.steps).toHaveLength(1);
    expect(r.repeats).toBe(0);
  });

  it(`${REPEATER_PEARLS} pearls wake a short repeater, ${REPEATER_BIG_PEARLS} the full ladder`, () => {
    const two = copy(NOTHING);
    two[0][0] = "pearl"; two[4][2] = "pearl";
    const r2 = spin(BET, { startGrid: two, rng: envelopes() });
    expect(r2.steps[1].multiplier).toBe(REPEATER_SMALL[0]);
    expect(repeaterLadder(2)).toEqual(REPEATER_SMALL);
    expect(repeaterLadder(3)).toEqual(REPEATER_MULTIPLIERS);
    expect(repeaterLadder(5)).toEqual(REPEATER_MULTIPLIERS);
    expect(repeaterLadder(1)).toEqual([]);
  });

  it(`${REPEATER_BIG_PEARLS} pearls wake it even with no win, lock the pearls and re-spin everything else`, () => {
    const grid = copy(NOTHING);
    grid[0][0] = "pearl"; grid[2][2] = "pearl"; grid[4][0] = "pearl";
    const first = lineWinsFor(grid, BET);
    const rng = envelopes();
    const r = spin(BET, { startGrid: grid, rng });
    expect(r.steps.length).toBe(2); // the first repeat adds nothing (envelopes), so it ends
    const locked = new Set(["0-0", "2-2", "4-0", ...first.flatMap((w) => PAYLINES[w.line].slice(0, w.count).map((row, reel) => `${reel}-${row}`))]);
    expect(new Set(r.steps[1].held)).toEqual(locked);
    expect(rng.used()).toBe(15 - locked.size);
    for (let c = 0; c < 5; c++) for (let row = 0; row < 3; row++) {
      expect(r.steps[1].grid[c][row]).toBe(locked.has(`${c}-${row}`) ? grid[c][row] : "envelope");
    }
  });

  it("a line that grows during a repeat pays only the extra, times the multiplier", () => {
    const paid = new Map<number, number>();
    const g1 = copy(NOTHING);
    for (let reel = 0; reel < 3; reel++) g1[reel][1] = "lantern";
    expect(lineWinsFor(g1, BET, 1, paid).find((w) => w.line === 0)).toMatchObject({ count: 3, amount: pay("lantern", 3), upgrade: false });
    const g2 = copy(g1);
    g2[3][1] = "lantern"; g2[4][1] = "pearl";
    const grown = lineWinsFor(g2, BET, 3, paid).find((w) => w.line === 0);
    expect(grown).toMatchObject({ count: 5, upgrade: true, amount: (pay("lantern", 5) - pay("lantern", 3)) * 3 });
    // Nothing new: pays nothing more
    expect(lineWinsFor(g2, BET, 5, paid).find((w) => w.line === 0)).toBeUndefined();
  });

  it("climbs the multiplier ladder and never runs more repeats than it has", () => {
    let seed = 12345;
    const rng: Rng = (max) => { // mulberry32: a small seeded generator, so the test is repeatable
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
    };
    let woke = 0;
    for (let i = 0; i < 20000; i++) {
      const r = spin(BET, { rng });
      const ladder = repeaterLadder(pearlCount(r.steps[0].grid));
      expect(r.steps.length).toBeLessThanOrEqual(1 + ladder.length);
      r.steps.forEach((s, k) => expect(s.multiplier).toBe(k === 0 ? 1 : ladder[k - 1]));
      if (r.steps.length > 1) { woke++; expect(pearlCount(r.steps[0].grid)).toBeGreaterThanOrEqual(REPEATER_PEARLS); }
    }
    expect(woke).toBeGreaterThan(0);
  });

  it("counts envelopes on the first spin only", () => {
    const grid = copy(NOTHING);
    grid[0][0] = "pearl"; grid[2][2] = "pearl"; grid[4][0] = "pearl"; grid[1][0] = "envelope";
    const r = spin(BET, { startGrid: grid, rng: envelopes() });
    expect(r.scatterCount).toBe(1);
    expect(r.freeSpinUnits).toBe(0);
  });
});

describe("Hũ Rồng jackpot", () => {
  it("three pearls on the middle row, reels 1-3, hit the jackpot", () => {
    const grid = copy(NOTHING);
    for (let reel = 0; reel < 3; reel++) grid[reel][JACKPOT_ROW] = "pearl";
    expect(spin(BET, { startGrid: grid, rng: envelopes() }).jackpotHit).toBe(true);
  });

  it("three pearls on another row, or further along, pay but don't hit the jackpot", () => {
    const top = copy(NOTHING);
    for (let reel = 0; reel < 3; reel++) top[reel][0] = "pearl";
    const r = spin(BET, { startGrid: top, rng: envelopes() });
    expect(r.jackpotHit).toBe(false);
    expect(r.winAmount).toBeGreaterThanOrEqual(pay("pearl", 3));
    const later = copy(NOTHING);
    for (let reel = 2; reel < 5; reel++) later[reel][JACKPOT_ROW] = "pearl";
    expect(spin(BET, { startGrid: later, rng: envelopes() }).jackpotHit).toBe(false);
  });

  it("can be hit by a repeat", () => {
    const grid = copy(NOTHING);
    grid[0][1] = "pearl"; grid[1][1] = "pearl"; grid[4][0] = "pearl"; // 3 pearls wake the dragon
    grid[2][0] = "envelope"; grid[2][1] = "envelope"; grid[2][2] = "envelope"; // so the pearls make no line yet
    const cells = 15 - 3;
    // The first repeat re-spins reel 3 middle (among others) into a pearl
    const order: string[] = [];
    for (let c = 0; c < 5; c++) for (let row = 0; row < 3; row++) {
      if ((c === 0 && row === 1) || (c === 1 && row === 1) || (c === 4 && row === 0)) continue;
      order.push(c === 2 && row === 1 ? "pearl" : "envelope");
    }
    expect(order).toHaveLength(cells);
    const r = spin(BET, { startGrid: grid, rng: scripted([...order, ...Array(200).fill("envelope")]) });
    expect(r.steps[0].grid[2][1]).not.toBe("pearl");
    expect(r.jackpotHit).toBe(true);
  });
});

describe("multipliers", () => {
  const grid = copy(NOTHING);
  for (let reel = 0; reel < 4; reel++) grid[reel][1] = "drum";
  grid[0][0] = "envelope"; grid[2][0] = "envelope"; grid[4][2] = "envelope";
  grid[1][0] = "koi"; grid[0][2] = "lantern"; // so the drums make only the middle line

  it("the oracle blessing multiplies everything the spin pays", () => {
    const normal = spin(BET, { startGrid: grid, rng: scripted([]) });
    expect(normal.winAmount).toBe(pay("drum", 4) + SCATTER_PAYS[2].pays * BET);
    for (const b of Object.values(GRADE_BLESSING)) {
      expect(spin(BET, { startGrid: grid, rng: scripted([]), blessing: b }).winAmount).toBe(Math.floor(normal.winAmount * b));
    }
    expect(spin(BET, { startGrid: grid, rng: scripted([]), blessing: 3 }).freeSpinUnits).toBe(normal.freeSpinUnits);
  });

  it("the free-spin pick multiplies the free spin's win", () => {
    const normal = spin(BET, { startGrid: grid, rng: scripted([]) });
    for (const o of FREE_SPIN_OPTIONS) {
      expect(spin(BET, { startGrid: grid, rng: scripted([]), freeSpinMult: o.mult }).winAmount).toBe(normal.winAmount * o.mult);
    }
  });
});

describe("Xóc Đĩa double-up", () => {
  it("every bet pays exactly fair odds (returns 100%)", () => {
    for (const pick of GAMBLE_PICKS) {
      let ev = 0;
      for (let coins = 0; coins < 16; coins++) {
        const reds = [0, 1, 2, 3].filter((b) => coins & (1 << b)).length;
        if (gambleWins(pick, reds)) ev += GAMBLE_PAYS[pick] / 16;
      }
      expect(ev).toBe(1);
    }
  });
});

describe("Xin Xăm oracle", () => {
  it("has 24 numbered sticks, a blessing for every grade and advice for every topic", () => {
    expect(STICKS.map((s) => s.n)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (const s of STICKS) {
      expect(GRADE_BLESSING[s.grade]).toBeGreaterThan(1);
      expect(s.vi.every((l) => l.length > 5) && s.en.every((l) => l.length > 5)).toBe(true);
      for (const t of TOPICS) expect(ADVICE[t.id][s.grade].vi.length).toBeGreaterThan(5);
    }
  });
});

describe("GIỮ CUỘN (HOLD)", () => {
  /** Full enumeration of every symbol on the unheld cells of each line */
  function enumerate(grid: string[][], reels: boolean[]): number {
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
    return PAYLINES.reduce((sum, line) => {
      let ev = 0;
      const walk = (cells: string[], p: number) => {
        const i = cells.length;
        if (i === 5) { ev += p * (evalLine(cells)?.value ?? 0); return; }
        if (reels[i]) return walk([...cells, grid[i][line[i]]], p);
        for (const s of SLOT_SYMBOLS) walk([...cells, s.id], (p * s.weight) / total);
      };
      walk([], 1);
      return sum + ev;
    }, 0);
  }
  let seed = 4242;
  const rng: Rng = (max) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; };

  it("works out exactly what a hold is worth", () => {
    for (let t = 0; t < 12; t++) {
      const g = randomGrid(rng);
      const reels = [0, 1, 2, 3, 4].map((i) => [[0], [0, 1], [1, 3], [2], [], [0, 4]][t % 6].includes(i));
      expect(holdEV(g, reels)).toBeCloseTo(enumerate(g, reels), 10);
    }
  });

  it(`picks the best of all holds of up to ${HOLD_MAX_REELS} reels`, () => {
    for (let t = 0; t < 20; t++) {
      const g = randomGrid(rng);
      const best = bestHold(g);
      expect(best.reels.filter(Boolean).length).toBeLessThanOrEqual(HOLD_MAX_REELS);
      for (let mask = 0; mask < 32; mask++) {
        const reels = [0, 1, 2, 3, 4].map((b) => !!(mask & (1 << b)));
        if (reels.filter(Boolean).length <= HOLD_MAX_REELS) expect(holdEV(g, reels)).toBeLessThanOrEqual(best.ev + 1e-9);
      }
    }
  });

  it("held reels keep their symbols and the rest spin", () => {
    const from = copy(NOTHING);
    const hold: Hold = { grid: from, reels: [true, false, true, false, false] };
    const r = spin(BET, { hold, rng: envelopes() });
    expect(r.steps[0].grid[0]).toEqual(from[0]);
    expect(r.steps[0].grid[2]).toEqual(from[2]);
    for (const reel of [1, 3, 4]) expect(r.steps[0].grid[reel]).toEqual(["envelope", "envelope", "envelope"]);
  });

  it("holding two pearls is worth far more than not holding", () => {
    const g = copy(NOTHING);
    g[0][1] = "pearl"; g[1][1] = "pearl";
    const none = holdEV(g, [false, false, false, false, false]);
    const pearls = holdEV(g, [true, true, false, false, false]);
    expect(pearls).toBeGreaterThan(3 * none);
    expect(bestHold(g).reels).toEqual([true, true, false, false, false]);
  });
});

describe("random draw", () => {
  it("draws each symbol in proportion to its weight", () => {
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
    let n = 0;
    const rng: Rng = (max) => n++ % max;
    const counts: Record<string, number> = {};
    for (let i = 0; i < total; i++) { const s = pickSymbol(rng); counts[s] = (counts[s] ?? 0) + 1; }
    for (const s of SLOT_SYMBOLS) expect(counts[s.id]).toBe(s.weight);
  });
});

describe("return to player", () => {
  it("the first spin's line pays match the exact value worked out from the paytable", () => {
    // Exact: every payline crosses 5 independent cells, so one line's expected value can be
    // summed over all 8^5 symbol combinations; 20 lines are 20 times that.
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
    let exact = 0;
    const walk = (cells: string[], p: number) => {
      if (cells.length === 5) { exact += p * (evalLine(cells)?.value ?? 0); return; }
      for (const s of SLOT_SYMBOLS) walk([...cells, s.id], p * (s.weight / total));
    };
    walk([], 1);
    exact *= PAYLINES.length;
    let won = 0;
    const N = 300_000;
    for (let i = 0; i < N; i++) won += spin(BET).steps[0].win;
    // Line pays on a spin vary little: about 5 standard errors wide
    expect(Math.abs(won / N / BET - exact)).toBeLessThan(0.012);
  }, 120_000);

  /** Plays N spins the way script/rtp.ts does, with or without the best holds */
  function play(N: number, smart: boolean) {
    let paid = 0, won = 0, pending = 0;
    let offer: string[][] | null = null;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const free = pending > 0;
      let hold: Hold | undefined;
      if (free) pending--;
      else {
        paid += BET;
        if (offer && smart) { const b = bestHold(offer); if (b.reels.some(Boolean)) hold = { grid: offer, reels: b.reels }; }
      }
      const r = spin(BET, { hold });
      won += r.winAmount;
      pending += r.freeSpinUnits; // played at x1; every pick has the same spins x multiplier
      offer = !free && !hold && r.winAmount === 0 && r.freeSpinUnits === 0 && n++ % HOLD_CHANCE === 0 ? r.grid : null;
    }
    return won / paid;
  }

  // Rồng Lặp makes this a swingy game (1M spins have a standard error near 0.6%), so the
  // bands are wide; the 40M-spin figures behind the published numbers come from script/rtp.ts
  it("with the best holds the whole game matches the published RTP", () => {
    expect(Math.abs(play(1_000_000, true) - BASE_RTP)).toBeLessThan(0.035);
  }, 300_000);

  it("never holding returns the published lower figure", () => {
    expect(Math.abs(play(1_000_000, false) - RTP_WITHOUT_HOLD)).toBeLessThan(0.035);
  }, 300_000);
});

describe("Lô Tô", () => {
  it("deals real tickets and pays back the published share", async () => {
    const L = await import("../shared/loto");
    for (let i = 0; i < 500; i++) expect(L.isValidLotoGrid(L.makeLotoGrid())).toBe(true);
    expect(L.lotoRtp()).toBeCloseTo(0.9479, 4);
    expect(L.lotoRowBy(90)).toBeCloseTo(1, 10);
    expect(L.vnNumber(25)).toBe("hai mươi lăm");
    expect(L.vnNumber(21)).toBe("hai mươi mốt");
    expect(L.vnNumber(14)).toBe("mười bốn");
    // The winning call is the last number of the first row to fill
    const g = L.makeLotoGrid();
    const row = g[4].filter((v): v is number => v !== null);
    const rest = Array.from({ length: 90 }, (_, k) => k + 1).filter((n) => !row.includes(n));
    expect(L.lotoKinhAt(g, [...row, ...rest])).toBe(5);
    expect(L.lotoMultiplier(5)).toBe(50);
    expect(L.lotoMultiplier(51)).toBe(0);
  });
});

describe("Đua Ngựa", () => {
  it("prices every bet from its exact chance, so each returns between the published figures", async () => {
    const H = await import("../shared/horse");
    expect(H.HORSE_CHANCES.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(H.HORSE_CHANCES.length).toBe(H.HORSES.length);
    // The exact formulas, by hand, against horseProbs (exact fractions turned into numbers)
    const p = H.HORSE_CHANCES.map((c) => c / 10000);
    const P = H.horseProbs(H.HORSE_CHANCES);
    const n = 8;
    for (let i = 0; i < n; i++) {
      expect(P.win[i]).toBeCloseTo(p[i], 14);
      let t2 = p[i];
      for (let j = 0; j < n; j++) if (j !== i) t2 += (p[j] * p[i]) / (1 - p[j]);
      expect(P.top2[i]).toBeCloseTo(t2, 12);
      let t3 = t2;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (a !== b && a !== i && b !== i) t3 += p[a] * (p[b] / (1 - p[a])) * (p[i] / (1 - p[a] - p[b]));
      }
      expect(P.top3[i]).toBeCloseTo(t3, 12);
      for (let j = 0; j < n; j++) expect(P.forecast[i][j]).toBeCloseTo(i === j ? 0 : (p[i] * p[j]) / (1 - p[i]), 14);
    }
    // They add up: 1 winner, 2 in the top 2, 3 in the top 3, one forecast
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(P.win)).toBeCloseTo(1, 12);
    expect(sum(P.top2)).toBeCloseTo(2, 12);
    expect(sum(P.top3)).toBeCloseTo(3, 12);
    expect(sum(P.forecast.flat())).toBeCloseTo(1, 12);

    // Prices: floor(0.95 / chance, two decimals), at least x1.01, checked with exact fractions
    const X = H.horseExact(H.HORSE_CHANCES);
    const M = H.horseMarket(H.HORSE_CHANCES);
    let min = Infinity, max = 0;
    const check = (f: { n: bigint; d: bigint }, odds: number) => {
      expect(odds).toBe(Math.max(101, Number((95n * f.d) / f.n)));
      // Never more than 95%: chance * odds/100 <= 0.95  <=>  n * odds <= 95 * d
      expect(f.n * BigInt(odds) <= 95n * f.d).toBe(true);
      const r = (Number(f.n) / Number(f.d)) * odds / 100;
      min = Math.min(min, r); max = Math.max(max, r);
    };
    for (let i = 0; i < n; i++) {
      check(X.win[i], M.win[i]); check(X.top2[i], M.top2[i]); check(X.top3[i], M.top3[i]);
      for (let j = 0; j < n; j++) if (i !== j) check(X.forecast[i][j], M.forecast[i][j]);
      expect(M.forecast[i][i]).toBe(0);
    }
    // Every round hands out the same chances in some order, and a price depends only on the chances
    // involved, so every possible round has exactly these prices (checked on a few hundred orders)
    const rand = (k: number) => Math.floor(Math.random() * k);
    for (let s = 0; s < 300; s++) {
      const ch = H.shuffled(H.HORSE_CHANCES, rand);
      const m = H.horseMarket(ch);
      const r = H.horseRtpRange(ch);
      expect(r.min).toBeCloseTo(min, 12);
      expect(r.max).toBeCloseTo(max, 12);
      for (let i = 0; i < n; i++) {
        const k = H.HORSE_CHANCES.indexOf(ch[i]);
        expect([m.win[i], m.top2[i], m.top3[i]]).toEqual([M.win[k], M.top2[k], M.top3[k]]);
        for (let j = 0; j < n; j++) expect(m.forecast[i][j]).toBe(M.forecast[k][H.HORSE_CHANCES.indexOf(ch[j])]);
      }
    }
    // The figures in the rules: 94.57% to 95%
    expect(min).toBeGreaterThanOrEqual(0.93);
    expect(H.HORSE_RTP_MIN).toBe(0.9457);
    expect(min).toBeGreaterThanOrEqual(H.HORSE_RTP_MIN);
    expect(min).toBeLessThan(H.HORSE_RTP_MIN + 0.0001);
    expect(max).toBeLessThanOrEqual(H.HORSE_RTP_MAX);
    expect(max).toBeGreaterThan(0.9499);
    // A few prices by hand
    expect(M.win[0]).toBe(351); // 0.95 / 0.27 = 3.5185…
    expect(M.win[6]).toBe(1900); // 0.95 / 0.05 exactly
    expect(M.forecast[0][1]).toBe(Math.floor(95 / (0.27 * 0.21 / 0.73))); // 12.23
    expect(H.horsePayout(10000, 351)).toBe(35100);
    expect(H.horseBetOdds(M, "forecast", 2, 2)).toBe(0);
    expect(H.horseBetOdds(M, "top3", 4)).toBe(M.top3[4]);
    // Which bets come in
    const order = [3, 1, 6, 0, 2, 4, 5, 7];
    expect(H.horseBetWins("win", 3, null, order)).toBe(true);
    expect(H.horseBetWins("win", 1, null, order)).toBe(false);
    expect(H.horseBetWins("top2", 1, null, order)).toBe(true);
    expect(H.horseBetWins("top2", 6, null, order)).toBe(false);
    expect(H.horseBetWins("top3", 6, null, order)).toBe(true);
    expect(H.horseBetWins("top3", 0, null, order)).toBe(false);
    expect(H.horseBetWins("forecast", 3, 1, order)).toBe(true);
    expect(H.horseBetWins("forecast", 1, 3, order)).toBe(false);
    // Rounds run back to back: 35s betting, 20s race, 5s results
    const r = H.horseRoundAt(Date.UTC(2026, 5, 1, 12, 0, 30));
    expect(r.raceStart - r.start).toBe(35_000);
    expect(r.raceEnd - r.raceStart).toBe(20_000);
    expect(r.end - r.start).toBe(60_000);
    expect(H.horseRoundAt(r.end).round).toBe(r.round + 1);
    expect(H.horseRoundTimes(r.round)).toEqual(r);
  });

  it("draws the finishing order the Plackett–Luce way, matching the exact chances of every bet", async () => {
    const H = await import("../shared/horse");
    const rand = (n: number) => Math.floor(Math.random() * n);
    const chances = H.shuffled(H.HORSE_CHANCES, rand);
    expect([...chances].sort((a, b) => b - a)).toEqual(H.HORSE_CHANCES);
    const P = H.horseProbs(chances);
    const N = 400_000;
    const win = Array(8).fill(0), top2 = Array(8).fill(0), top3 = Array(8).fill(0);
    const fc = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (let i = 0; i < N; i++) {
      const o = H.drawOrder(chances, rand);
      win[o[0]]++; top2[o[0]]++; top2[o[1]]++; top3[o[0]]++; top3[o[1]]++; top3[o[2]]++;
      fc[o[0]][o[1]]++;
      if (i < 1000) expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
    // Within 5 standard errors of the exact chance
    const near = (count: number, q: number) => expect(Math.abs(count / N - q)).toBeLessThan(5 * Math.sqrt((q * (1 - q)) / N) + 1e-9);
    for (let h = 0; h < 8; h++) {
      expect(P.win[h]).toBeCloseTo(chances[h] / 10000, 12);
      near(win[h], P.win[h]); near(top2[h], P.top2[h]); near(top3[h], P.top3[h]);
      for (let j = 0; j < 8; j++) near(fc[h][j], P.forecast[h][j]);
    }
    // Every value of rand is used: lowest picks the first horse, highest the last
    expect(H.drawOrder([5, 5], () => 0)).toEqual([0, 1]);
    expect(H.drawOrder([5, 5], (n) => n - 1)).toEqual([1, 0]);
  });

  it("plays the same race from the same seed, and the horses cross the line in the drawn order", async () => {
    const H = await import("../shared/horse");
    let necks = 0, photos = 0;
    for (let s = 0; s < 120; s++) {
      const seed = (s * 2654435761) >>> 1;
      const order = H.shuffled([0, 1, 2, 3, 4, 5, 6, 7], (n) => (seed + s * 7) % n);
      const sim = H.simulateRace(seed, order);
      const again = H.simulateRace(seed, order);
      // Finishing times follow the order, all inside the race window, before the replay
      for (let k = 1; k < 8; k++) expect(sim.finish[order[k]]).toBeGreaterThan(sim.finish[order[k - 1]]);
      expect(sim.finish[order[0]]).toBeGreaterThanOrEqual(H.HORSE_WIN_FROM);
      expect(sim.finish[order[0]]).toBeLessThanOrEqual(H.HORSE_WIN_TO);
      expect(sim.finish[order[7]]).toBeLessThan(H.HORSE_REPLAY_AT - 500);
      for (let h = 0; h < 8; h++) {
        expect(sim.progress(h, 0)).toBe(0);
        expect(sim.progress(h, sim.finish[h] - 1)).toBeLessThan(1);
        expect(sim.progress(h, sim.finish[h])).toBeGreaterThanOrEqual(1);
        let last = 0;
        for (let t = 0; t <= H.HORSE_RACE_MS; t += 100) {
          const p = sim.progress(h, t);
          expect(p).toBeGreaterThanOrEqual(last);
          expect(p).toBe(again.progress(h, t));
          last = p;
        }
      }
      expect(sim.standings(H.HORSE_RACE_MS)).toEqual(order);
      expect(H.raceCall(sim, sim.finish[order[0]])).toMatchObject({ kind: "won", horse: order[0] });
      // The race clock (slow motion and the photo freeze) never runs backwards, is the real clock
      // outside the finish, has caught up before the replay, and the replay shows the line
      const f = H.raceFinish(sim);
      if (f.neck) necks++;
      if (f.photo) photos++;
      let prev = -1;
      for (let t = 0; t <= H.HORSE_RACE_MS + H.HORSE_RESULT_MS; t += 25) {
        const d = H.raceClock(sim, t);
        expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(Math.abs(d - prev)).toBeLessThan(25 * 2.4 + 1); // continuous
        prev = d;
        if (t < f.at - 1200 || t >= H.raceClockEnd(sim)) expect(d).toBeCloseTo(t, 6);
      }
      expect(H.raceClockEnd(sim)).toBeLessThan(H.HORSE_REPLAY_AT);
      if (f.photo) expect(H.raceClock(sim, f.at - 1200 + 2400 + 300)).toBe(f.at); // frozen on the line
      if (!f.neck) expect(H.raceClock(sim, f.at)).toBe(f.at);
      expect(H.replayClock(sim, H.HORSE_REPLAY_AT - 1)).toBeNull();
      expect(H.replayClock(sim, H.HORSE_REPLAY_AT)).toBe(f.at - 1800);
      expect(H.replayClock(sim, H.HORSE_REPLAY_AT + H.HORSE_REPLAY_MS)).toBeNull();
      expect(H.HORSE_REPLAY_AT + H.HORSE_REPLAY_MS).toBeLessThan(H.HORSE_RACE_MS + H.HORSE_RESULT_MS - 1000);
      // The commentator only names real horses and calls the right winner
      for (let t = 0; t < f.at; t += 500) {
        const c = H.raceCall(sim, t, order[7]);
        if ("horse" in c) expect(c.horse).toBeGreaterThanOrEqual(0);
        if (c.kind === "lead") expect(sim.standings(Math.floor(t / H.RACE_CALL_MS) * H.RACE_CALL_MS)[0]).toBe(c.horse);
      }
    }
    // Close finishes happen often enough to be exciting, not every race
    expect(necks).toBeGreaterThan(30);
    expect(necks).toBeLessThan(100);
    expect(photos).toBeGreaterThan(15);
  });

  it("runs each horse to its style: front-runners lead early, closers come late", async () => {
    const H = await import("../shared/horse");
    let frontEarly = 0, closerEarly = 0, runs = 0;
    for (let s = 0; s < 300; s++) {
      const order = H.shuffled([0, 1, 2, 3, 4, 5, 6, 7], (n) => Math.floor(Math.random() * n));
      const sim = H.simulateRace(s * 7919 + 1, order);
      const early = sim.standings(5000);
      for (let h = 0; h < 8; h++) {
        const place = early.indexOf(h) - order.indexOf(h); // + is behind where it finishes
        if (H.HORSES[h].style === "front") frontEarly += place;
        if (H.HORSES[h].style === "closer") closerEarly += place;
      }
      runs++;
    }
    // Front-runners are ahead of their finishing place early on; closers behind it
    expect(frontEarly / runs).toBeLessThan(0);
    expect(closerEarly / runs).toBeGreaterThan(0);
    expect(new Set(H.HORSES.map((h) => h.style))).toEqual(new Set(["front", "stalker", "closer"]));
  });
});

describe("Tiến Lên rules", () => {
  it("knows the combinations, the chops, and pays back 95% between equal players", async () => {
    const T = await import("../shared/tienlen");
    const c = (...x: string[]) => x.map((n) => T.RANKS.indexOf(n.slice(0, -1)) * 4 + T.SUITS.indexOf(n.slice(-1)));
    const cl = (...x: string[]) => T.classify(c(...x))!;
    expect(cl("3♠", "4♣", "5♥").type).toBe("straight");
    expect(T.classify(c("K♠", "A♠", "2♠"))).toBeNull(); // no 2 in a straight
    expect(cl("3♠", "3♣", "4♠", "4♦", "5♣", "5♥").type).toBe("pairs");
    expect(T.beats(cl("3♥"), cl("3♦"))).toBe(true); // hearts beat diamonds
    expect(T.beats(cl("5♠", "5♣", "5♦", "5♥"), cl("2♠"))).toBe(true);
    expect(T.beats(cl("3♠", "3♣", "4♠", "4♦", "5♣", "5♥"), cl("2♥"))).toBe(true);
    expect(T.beats(cl("3♠", "3♣", "4♠", "4♦", "5♣", "5♥"), cl("2♠", "2♥"))).toBe(false);
    expect(T.beats(cl("3♠", "3♣", "4♠", "4♦", "5♣", "5♥", "6♣", "6♥"), cl("2♠", "2♥"))).toBe(true);
    expect(T.beats(cl("4♠", "5♠", "6♠"), cl("3♠", "4♣", "5♥", "6♦"))).toBe(false); // lengths must match
    expect(T.TIENLEN_EVEN_RTP).toBeCloseTo(0.95, 10);
    // Computer players finish games, play only legal moves, and every seat wins about as often
    const rand = (n: number) => Math.floor(Math.random() * n);
    const first = [0, 0, 0, 0];
    for (let g = 0; g < 400; g++) {
      const s = T.newGame(rand); s.allBots = true;
      const ev: any[] = [];
      let guard = 0;
      while (!T.gameOver(s) && guard++ < 500) {
        const seat = s.turn, m = T.botMove(s, seat, rand);
        if (m) { expect(T.playError(s, seat, m)).toBeNull(); T.applyPlay(s, seat, m, ev); }
        else if (s.table) T.applyPass(s, seat, ev);
        else T.applyPlay(s, seat, T.legalPlays(s, seat)[0], ev);
      }
      expect(T.gameOver(s)).toBe(true);
      first[s.finished[0]]++;
    }
    for (const n of first) expect(n).toBeGreaterThan(60);
  });
});

describe("Bắn Cá odds", () => {
  it("every fish returns exactly 96% per hit", async () => {
    const { FISH, BANCA_RTP, catchThreshold } = await import("../shared/banca");
    for (const f of FISH) {
      // The winning rolls out of the million possible, times the prize: an exact figure, not a sample
      const threshold = catchThreshold(f.mult);
      expect(Number.isInteger((BANCA_RTP * 1_000_000) / f.mult)).toBe(true);
      expect((threshold * f.mult) / 1_000_000).toBeCloseTo(BANCA_RTP, 12);
    }
  });
});

describe("Slot 777 Cổ Điển", () => {
  const { evalLine777: line, PAY3_777, MIX_PAY_777, CHERRY_PAYS_777 } = s7;

  it("pays three of a kind, the BAR/7 mix and left-hand cherries", () => {
    expect(line(["seven", "seven", "seven"]).mult).toBe(PAY3_777.seven);
    expect(line(["lemon", "lemon", "lemon"]).mult).toBe(PAY3_777.lemon);
    expect(line(["bar", "seven", "bar"])).toMatchObject({ mult: MIX_PAY_777, kind: "mix" });
    expect(line(["cherry", "lemon", "lemon"])).toMatchObject({ mult: CHERRY_PAYS_777[1], kind: "cherry", count: 1 });
    expect(line(["cherry", "cherry", "bell"])).toMatchObject({ mult: CHERRY_PAYS_777[2], count: 2 });
    expect(line(["cherry", "cherry", "cherry"]).mult).toBe(PAY3_777.cherry);
    // Cherries only count from the left reel
    expect(line(["lemon", "cherry", "cherry"]).mult).toBe(0);
    expect(line(["bell", "bell", "melon"]).mult).toBe(0);
    expect(line(["bar", "seven", "bell"]).mult).toBe(0);
  });

  it("⭐ stands in for anything and doubles the line for each star used", () => {
    expect(line(["seven", "star", "seven"]).mult).toBe(PAY3_777.seven * 2);
    expect(line(["star", "seven", "star"]).mult).toBe(PAY3_777.seven * 4);
    expect(line(["star", "star", "star"])).toMatchObject({ mult: PAY3_777.star, kind: "stars" });
    expect(line(["bar", "star", "seven"])).toMatchObject({ mult: MIX_PAY_777 * 2, kind: "mix" });
    expect(line(["cherry", "star", "lemon"])).toMatchObject({ mult: CHERRY_PAYS_777[2] * 2, kind: "cherry" });
    expect(line(["star", "cherry", "bell"])).toMatchObject({ mult: CHERRY_PAYS_777[2] * 2, kind: "cherry" });
    expect(line(["star", "star", "lemon"]).mult).toBe(PAY3_777.lemon * 4);
    // A star alone isn't a cherry
    expect(line(["star", "lemon", "bell"]).mult).toBe(0);
    // The top prize beats everything a seven line can make
    expect(PAY3_777.star).toBeGreaterThan(PAY3_777.seven * 4);
  });

  it("every payline returns exactly the published RTP, by enumerating every stop combination", () => {
    const first = s7.exactRtp777(0);
    expect(first.combos).toBe(s7.STRIPS_777.reduce((a, r) => a * r.length, 1));
    const rtp = (first.paid / first.combos) * 100;
    expect(Math.round(rtp * 100) / 100).toBe(s7.SLOT777_RTP);
    expect(rtp).toBeGreaterThan(95.5);
    expect(rtp).toBeLessThan(96.5);
    // Same distribution on every line (each cell is uniform over its strip, reels independent)
    for (let l = 1; l < s7.PAYLINES_777.length; l++) expect(s7.exactRtp777(l)).toEqual(first);
  });

  it("the server's spin pays exactly what the enumeration counts, over every combination and line count", () => {
    const [a, b, c] = s7.STRIPS_777;
    const ref = s7.exactRtp777(0);
    for (const lines of s7.LINE_OPTIONS_777) {
      let paid = 0;
      for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) for (let k = 0; k < c.length; k++) {
        const stops = [i, j, k];
        let n = 0;
        const o = play777(lines, 100, (max) => { if (max !== s7.STRIPS_777[n].length) throw new Error("wrong range"); return stops[n++]; });
        if (o.stops.join() !== stops.join() || o.totalBet !== lines * 100) throw new Error(`bad spin ${stops}`);
        if (o.winAmount !== o.lineWins.reduce((x, w) => x + w.payout, 0)) throw new Error(`bad total ${stops}`);
        for (const w of o.lineWins) {
          const symbols = s7.PAYLINES_777[w.line - 1].map((row, reel) => o.reels[reel][row]);
          if (w.line > lines || w.symbols.join() !== symbols.join() || w.payout !== line(symbols).mult * 100) throw new Error(`bad line ${stops} ${w.line}`);
        }
        paid += o.winAmount;
      }
      // Every line returns the same, so any number of lines returns the published figure
      expect(paid).toBe(lines * 100 * ref.paid);
    }
  });

  it("only takes the listed lines and line bets, up to 1,000,000 a spin", () => {
    expect(s7.isValidBet777(5, 200_000)).toBe(true);
    expect(s7.isValidBet777(1, 100)).toBe(true);
    expect(s7.isValidBet777(2, 100)).toBe(false);
    expect(s7.isValidBet777(5, 150)).toBe(false);
    expect(s7.isValidBet777(5.5 as number, 100)).toBe(false);
    expect(Math.max(...s7.LINE_BETS_777) * 5).toBeLessThanOrEqual(s7.MAX_TOTAL_BET_777);
  });
});

describe("Social 2.0 (pure rules)", async () => {
  const f = await import("../shared/friends");

  it("levels: gentle square curve from coins staked, monotonic, capped", () => {
    expect(f.xpOf(999)).toBe(0);
    expect(f.xpOf(50_000)).toBe(50);
    expect(f.levelOf(0)).toBe(1);
    expect(f.levelOf(49)).toBe(1);
    expect(f.levelOf(50)).toBe(2);
    expect(f.levelOf(f.xpForLevel(10))).toBe(10);
    expect(f.levelOf(f.xpForLevel(10) - 1)).toBe(9);
    expect(f.xpForLevel(10)).toBe(4050); // 4.05M coins staked
    let last = 1;
    for (let xp = 0; xp < 600_000; xp += 37) {
      const l = f.levelOf(xp);
      expect(l).toBeGreaterThanOrEqual(last);
      last = l;
    }
    expect(f.levelOf(1e12)).toBe(f.MAX_LEVEL);
    const p = f.levelProgress(75);
    expect(p).toMatchObject({ level: 2, from: 50, to: 200 });
    expect(p.progress).toBeCloseTo(25 / 150);
  });

  it("mentions: @words and picked names that really appear, lower-cased, at most five", () => {
    expect(f.findMentions("hi @Bob and @alice_99!")).toEqual(["bob", "alice_99"]);
    expect(f.findMentions("email me@x.com")).toEqual([]); // not after a letter
    expect(f.findMentions("@ab too short")).toEqual([]);
    expect(f.findMentions("chào @Anh Ba nhé", ["Anh Ba"])).toEqual(["anh ba", "anh"]); // a name with a space, picked from the list
    expect(f.findMentions("no tag here", ["Anh Ba"])).toEqual([]);
    expect(f.findMentions("@Anh Bao", ["Anh Ba"])).not.toContain("anh ba"); // must end at a word boundary
    expect(f.findMentions("@aaa @bbb @ccc @ddd @eee @fff @ggg").length).toBe(5);
  });

  it("feed: big wins are ×50 or a million profit; horses ×10 and 100,000", () => {
    expect(f.feedKindOfPlay("slot", 1000, 50_000)).toBe("big_win");
    expect(f.feedKindOfPlay("slot", 1000, 49_999)).toBeNull();
    expect(f.feedKindOfPlay("roulette", 1_000_000, 2_000_000)).toBe("big_win");
    expect(f.feedKindOfPlay("roulette", 1_000_000, 1_999_999)).toBeNull();
    expect(f.feedKindOfPlay("slot", 0, 900_000)).toBeNull(); // a free spin: only a million counts
    expect(f.feedKindOfPlay("slot", 0, 1_000_000)).toBe("big_win");
    expect(f.feedKindOfPlay("horse", 10_000, 120_000)).toBe("horse");
    expect(f.feedKindOfPlay("horse", 10_000, 90_000)).toBeNull();
    expect(f.feedKindOfPlay("pool", 50_000, 100_000)).toBeNull();
  });

  it("friend Lì Xì rules", () => {
    const now = Date.now();
    const ok = { friends: true, friendsSince: now - 25 * 3600_000, myGames: 10, theirGames: 10, sentToday: false, now };
    expect(f.giftBlock(ok)).toBeNull();
    expect(f.giftBlock({ ...ok, friends: false })).toBe("not_friends");
    expect(f.giftBlock({ ...ok, sentToday: true })).toBe("sent_today");
    expect(f.giftBlock({ ...ok, myGames: 9 })).toBe("games_you");
    expect(f.giftBlock({ ...ok, theirGames: 9 })).toBe("games_them");
    expect(f.giftBlock({ ...ok, friendsSince: now - 23 * 3600_000 })).toBe("too_new");
    expect(f.FRIEND_GIFT_AMOUNT).toBe(5000);
    expect(f.FRIEND_GIFT_MAX_RECEIVED).toBe(10);
  });

  it("pages map to games; weeks start on Monday, Vietnam time", () => {
    expect(f.gameOfRoute("/slot-777")).toBe("slot777");
    expect(f.gameOfRoute("/slot")).toBe("slot");
    expect(f.gameOfRoute("/ban-bai?table=ABCDE")).toBe("cards");
    expect(f.gameOfRoute("/pool")).toBe("pool");
    expect(f.gameOfRoute("/tournament")).toBe("pool");
    expect(f.gameOfRoute("/community")).toBeNull();
    expect(f.gameOfRoute("/")).toBeNull();
    expect(f.gameOfRoute(42)).toBeNull();
    // Sunday 23:00 in Vietnam is still the week that started on the Monday before
    expect(f.vnWeekStart(new Date("2026-10-25T16:00:00Z")).toISOString()).toBe("2026-10-18T17:00:00.000Z");
    // Monday 00:30 in Vietnam starts a new week
    expect(f.vnWeekStart(new Date("2026-10-25T17:30:00Z")).toISOString()).toBe("2026-10-25T17:00:00.000Z");
  });
});

describe("darts", async () => {
  const d = await import("../shared/darts");
  type X01 = import("../shared/darts").X01State;
  const polar = (r: number, deg: number) => ({ x: r * Math.sin((deg * Math.PI) / 180), y: -r * Math.cos((deg * Math.PI) / 180) });
  const at = (r: number, deg: number) => { const p = polar(r, deg); return d.scoreAt(p.x, p.y); };
  const hit = (code: string) => { const p = d.targetPoint(code); return d.hitAt(p.x, p.y); };
  const lcg = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed + 0.5) / 2147483648; };

  it("scores every region of the board", () => {
    expect(d.scoreAt(0, 0)).toMatchObject({ ring: "bull", score: 50, mult: 2 });
    expect(at(10, 45)).toMatchObject({ ring: "outer", score: 25, mult: 1 });
    d.SEGMENTS.forEach((n, i) => {
      const a = i * 18;
      expect(at(50, a)).toMatchObject({ ring: "single", n, score: n, mult: 1 });
      expect(at(103, a)).toMatchObject({ ring: "treble", n, score: n * 3, mult: 3 });
      expect(at(130, a)).toMatchObject({ ring: "single", n, score: n });
      expect(at(166, a)).toMatchObject({ ring: "double", n, score: n * 2, mult: 2 });
      expect(at(200, a)).toMatchObject({ ring: "out", score: 0 });
      // targetPoint lands in the bed it names
      expect(hit(`T${n}`)).toMatchObject({ ring: "treble", n });
      expect(hit(`D${n}`)).toMatchObject({ ring: "double", n });
      expect(hit(`S${n}`)).toMatchObject({ ring: "single", n });
    });
    expect(at(300, 0)).toMatchObject({ ring: "miss", score: 0 });
    expect(d.scoreAt(NaN, 0)).toMatchObject({ ring: "miss", score: 0 });
    expect(hit("25")).toMatchObject({ ring: "outer", score: 25 });
    expect(hit("BULL")).toMatchObject({ ring: "bull", score: 50 });
    expect(d.hitLabel(hit("T20"))).toBe("T20");
    expect(d.hitLabel(hit("BULL"))).toBe("BULL");
  });

  it("puts darts on wires and edges in a fixed place", () => {
    // Ring wires belong to the ring outside them
    expect(d.scoreAt(0, -6.35)).toMatchObject({ ring: "outer" });
    expect(d.scoreAt(0, -15.9)).toMatchObject({ ring: "single", n: 20 });
    expect(d.scoreAt(0, -99)).toMatchObject({ ring: "treble", n: 20 });
    expect(d.scoreAt(0, -107)).toMatchObject({ ring: "single", n: 20 });
    expect(d.scoreAt(0, -162)).toMatchObject({ ring: "double", n: 20 });
    expect(d.scoreAt(0, -170)).toMatchObject({ ring: "out", score: 0 });
    expect(d.scoreAt(0, -225)).toMatchObject({ ring: "miss" });
    expect(d.scoreAt(0, -169.999)).toMatchObject({ ring: "double", n: 20 });
    // Segment wires belong to the segment clockwise of them: 20|1 at 9°, 5|20 at 351°
    expect(at(50, 9).n).toBe(1);
    expect(at(50, 8.999).n).toBe(20);
    expect(at(50, 351).n).toBe(20);
    expect(at(50, 350.999).n).toBe(5);
    for (let k = 0; k < 20; k++) expect(at(120, 9 + 18 * k).n).toBe(d.SEGMENTS[(k + 1) % 20]);
    for (let i = 0; i < 5; i++) expect(at(103, 9)).toEqual(at(103, 9));
  });

  it("never lands a dart on NaN, whatever the client sends", () => {
    const g = d.gaussFrom(lcg(99));
    const junk: unknown[] = [null, undefined, "x", 5, {}, { x: NaN, y: Infinity, power: "a", drift: {}, holdMs: -5 },
      { x: 1e308, y: -1e308, power: 1e9, drift: -1e9, holdMs: 1e12 }, { x: "12", y: "-80", power: "1", drift: "0", holdMs: "900" }];
    for (const raw of junk) {
      for (let i = 0; i < 200; i++) {
        const h = d.throwDart(raw, g);
        expect(Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.score)).toBe(true);
        expect(Math.abs(h.x)).toBeLessThanOrEqual(400);
        expect(h).toMatchObject(d.scoreAt(h.x, h.y));
      }
    }
    // A broken random source still gives a finite dart
    expect(Number.isFinite(d.landAt(0, 0, NaN, () => [NaN, NaN]).x)).toBe(true);
    // Misses score nothing; a dart is only off the board when it really is
    expect(d.landAt(0, -300, 0, () => [0, 0])).toMatchObject({ ring: "miss", score: 0 });
    const t20 = d.targetPoint("T20");
    expect(d.throwDart({ ...t20, power: 1, drift: 0, holdMs: 1000 }, () => [0, 0])).toMatchObject({ ring: "treble", n: 20 });
  });

  it("the flick and the hold move and spread the dart the way the player sees", () => {
    const t20 = d.targetPoint("T20");
    const plan = (o: object) => d.throwPlan(d.cleanThrow({ ...t20, power: 1, drift: 0, holdMs: 1000, ...o }));
    expect(plan({}).cy).toBeCloseTo(t20.y);
    expect(plan({ power: 0.6 }).cy).toBeGreaterThan(t20.y + 20); // too soft: low
    expect(plan({ power: 1.5 }).cy).toBeLessThan(t20.y - 20); // too hard: high
    expect(plan({ drift: 0.5 }).cx).toBeGreaterThan(t20.x + 15);
    expect(plan({ holdMs: 0 }).sigma).toBeGreaterThan(plan({}).sigma * 1.4); // not steadied
    expect(plan({ holdMs: 3500 }).sigma).toBeGreaterThan(plan({}).sigma * 1.5); // held too long
    expect(d.wobbleRadius(1000)).toBe(5);
  });

  it("a careful player hits T20 about 30–40% of the time; a beginner still hits the board", () => {
    const g = d.gaussFrom(lcg(12345));
    const t20 = d.targetPoint("T20");
    const N = 40000;
    let careful = 0, beginnerOn = 0;
    for (let i = 0; i < N; i++) {
      const h = d.throwDart({ ...t20, power: 1.05, drift: 0.03, holdMs: 1000 }, g);
      if (h.ring === "treble" && h.n === 20) careful++;
      if (d.throwDart({ ...t20, power: 0.7, drift: 0.25, holdMs: 150 }, g).score > 0) beginnerOn++;
    }
    expect(careful / N).toBeGreaterThan(0.3);
    expect(careful / N).toBeLessThan(0.4);
    expect(beginnerOn / N).toBeGreaterThan(0.95);
  });

  it("501: scores, busts, double-out and legs", () => {
    let s = d.newX01(2, 0);
    for (const c of ["T20", "T20", "T20"]) s = d.applyDart(s, hit(c)).state;
    expect(s.scores).toEqual([321, 501]);
    expect(s.lastVisit).toMatchObject({ by: 0, total: 180 });
    expect(s.max[0]).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.board).toHaveLength(3); // darts stay in until the next visit starts
    s = d.applyDart(s, hit("20")).state;
    expect(s.board).toHaveLength(1);

    // Bust: going below zero, leaving 1, or reaching 0 without a double
    const play = (rem: number, codes: string[]) => {
      let x: X01 = { ...d.newX01(1, 0), scores: [rem, 501], visitStart: rem };
      let ev = "";
      for (const c of codes) { const r = d.applyDart(x, hit(c)); x = r.state; ev = r.event; if (ev !== "scored") break; }
      return { x, ev };
    };
    const r = play(40, ["20", "T20"]);
    expect(r.ev).toBe("bust");
    expect(r.x.scores[0]).toBe(40); // back to the start of the visit
    expect(r.x.turn).toBe(1);
    expect(r.x.lastVisit).toMatchObject({ bust: true, total: 0 });
    expect(play(21, ["20"]).ev).toBe("bust"); // leaves 1
    expect(play(20, ["20"]).ev).toBe("bust"); // 0 on a single
    expect(play(25, ["25"]).ev).toBe("bust"); // the outer bull isn't a double
    expect(play(75, ["25", "BULL"]).ev).toBe("match");
    expect(play(40, ["D20"]).ev).toBe("match");
    expect(play(50, ["BULL"]).ev).toBe("match");
    expect(play(32, ["16", "D8"]).ev).toBe("match");

    // Legs: best of 3, the starter alternates, scores reset
    let m: X01 = { ...d.newX01(2, 0), scores: [40, 100], visitStart: 40 };
    const leg = d.applyDart(m, hit("D20"));
    expect(leg.event).toBe("leg");
    m = leg.state;
    expect(m.legs).toEqual([1, 0]);
    expect(m.scores).toEqual([501, 501]);
    expect(m.turn).toBe(1);
    m = { ...m, scores: [100, 40], visitStart: 40 };
    m = d.applyDart(m, hit("D20")).state;
    expect(m.legs).toEqual([1, 1]);
    expect(m.turn).toBe(0);
    m = { ...m, scores: [40, 40], visitStart: 40 };
    const end = d.applyDart(m, hit("D20"));
    expect(end.event).toBe("match");
    expect(end.state.winner).toBe(0);
    expect(d.applyDart(end.state, hit("T20")).state).toBe(end.state); // nothing after the end
  });

  it("checkouts are real ways out that finish on a double", () => {
    const value = (c: string) => hit(/^\d+$/.test(c) && c !== "25" ? `S${c}` : c);
    expect(d.checkout(170)).toEqual(["T20", "T20", "BULL"]);
    expect(d.checkout(100)).toEqual(["T20", "D20"]);
    expect(d.checkout(141)).toEqual(["T20", "T19", "D12"]);
    expect(d.checkout(167)).toEqual(["T20", "T19", "BULL"]);
    expect(d.checkout(40)).toEqual(["D20"]);
    expect(d.checkout(50)).toEqual(["BULL"]);
    for (const bogey of [169, 168, 166, 165, 163, 162, 159]) expect(d.checkout(bogey)).toBeNull();
    expect(d.checkout(1)).toBeNull();
    expect(d.checkout(171)).toBeNull();
    expect(d.checkout(100, 1)).toBeNull();
    for (let rem = 2; rem <= 170; rem++) {
      for (let darts = 1; darts <= 3; darts++) {
        const co = d.checkout(rem, darts);
        if (!co) continue;
        expect(co.length).toBeLessThanOrEqual(darts);
        const hits = co.map(value);
        expect(hits.reduce((a, h) => a + h.score, 0)).toBe(rem);
        expect(hits[hits.length - 1].mult).toBe(2);
      }
    }
  });

  it("the computer players play to their level", () => {
    const g = d.gaussFrom(lcg(777));
    const avgs: number[] = [];
    for (const lvl of ["easy", "medium", "hard"] as const) {
      let s = d.newX01(50, 0);
      for (let i = 0; i < 6000; i++) s = d.applyDart(s, d.botDart(lvl, s.scores[s.turn], 3 - s.visit.length, g)).state;
      const avg = ((s.points[0] + s.points[1]) / (s.darts[0] + s.darts[1])) * 3;
      expect(Math.abs(avg - d.BOTS[lvl].avg)).toBeLessThan(7);
      avgs.push(avg);
    }
    expect(avgs[0]).toBeLessThan(avgs[1]);
    expect(avgs[1]).toBeLessThan(avgs[2]);
    expect(d.botTarget(501, 3)).toBe("T20");
    expect(d.botTarget(40, 3)).toBe("D20");
    expect(d.botTarget(170, 3)).toBe("T20");
    expect(d.botTarget(59, 1)).toBe("S19"); // sets up D20
  });

  it("the day's conditions are the same for everyone, and gentle", () => {
    const a = d.dailyConditions("2026-10-26");
    expect(d.dailyConditions("2026-10-26")).toEqual(a);
    expect(d.dailyConditions("2026-10-27")).not.toEqual(a);
    for (let i = 1; i <= 28; i++) {
      const c = d.dailyConditions(`2026-02-${String(i).padStart(2, "0")}`);
      expect(Math.hypot(c.driftX, c.driftY)).toBeLessThanOrEqual(8.1);
      expect(c.spread).toBeGreaterThanOrEqual(0.95);
      expect(c.spread).toBeLessThanOrEqual(1.15);
    }
  });
});

describe("penalty shootout (football)", async () => {
  const f = await import("../shared/football");
  const play = (first: 0 | 1, results: boolean[]) => results.reduce((s, r) => f.addKick(s, r, r ? "goal" : "save"), f.newShootout(first));

  it("alternates the kicker starting with whoever goes first", () => {
    let s = f.newShootout(1);
    const order: number[] = [];
    for (let i = 0; i < 6; i++) { order.push(f.shooterOf(s)); expect(f.keeperOf(s)).toBe(1 - f.shooterOf(s)); s = f.addKick(s, true, "goal"); }
    expect(order).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it("finishes early once a side can't be caught", () => {
    // first=0: A scores 3 of 3, B misses 3 of 3 → B can reach 2 at most: A has won
    const s = play(0, [true, false, true, false, true, false]);
    expect(f.shootoutWinner(s)).toBe(0);
    // Still alive one kick earlier: A 3/3, B 0/2 → B could still reach 3
    expect(f.shootoutWinner(play(0, [true, false, true, false, true]))).toBeNull();
    // A misses everything, B scores the first 3: decided after B's 3rd (A can reach 2 at most)
    expect(f.shootoutWinner(play(0, [false, true, false, true, false, true]))).toBe(1);
  });

  it("goes to sudden death after 5 each when level, decided only after a completed pair", () => {
    let s = play(0, Array(10).fill(true));
    expect(f.shootoutWinner(s)).toBeNull();
    expect(f.inSuddenDeath(s)).toBe(true);
    s = f.addKick(s, false, "save"); // A misses the 6th
    expect(f.shootoutWinner(s)).toBeNull(); // B still has to kick
    expect(f.shootoutWinner(f.addKick(s, true, "goal"))).toBe(1);
    // Both score the 6th: carry on; both miss the 7th: carry on
    let t = f.addKick(f.addKick(play(0, Array(10).fill(true)), true, "goal"), true, "goal");
    t = f.addKick(f.addKick(t, false, "save"), false, "wide");
    expect(f.shootoutWinner(t)).toBeNull();
    expect(f.shootoutWinner(f.addKick(f.addKick(t, true, "goal"), false, "post"))).toBe(0);
  });

  it("4-5 after regulation: the last kick decides it, not earlier", () => {
    // A: ✓✓✓✓✕, B: ✓✓✓✓✓ — B wins only when the 10th kick goes in
    const kicks = [true, true, true, true, true, true, true, true, false];
    expect(f.shootoutWinner(play(0, kicks))).toBeNull();
    expect(f.shootoutWinner(play(0, [...kicks, true]))).toBe(1);
    expect(f.shootoutWinner(play(0, [...kicks, false]))).toBeNull();
  });

  it("resolves a kick deterministically for a given seed", () => {
    const shot = { x: 0.7, y: 0.6, power: 0.75, curve: 0.3 };
    const a = f.resolveKick(shot, 2, 123456789);
    const b = f.resolveKick(shot, 2, 123456789);
    expect(a).toEqual(b);
    expect(a.seed).toBe(123456789);
    // Different seeds give different execution errors
    const spots = new Set(Array.from({ length: 50 }, (_, i) => `${f.resolveKick(shot, 2, i).fx}`));
    expect(spots.size).toBeGreaterThan(40);
    // A snapshot of the maths: changing it changes every recorded replay
    expect(f.resolveKick({ x: 0, y: 0.25, power: 0.5, curve: 0 }, 1, 42)).toMatchObject({ dive: 1, zone: 1, seed: 42 });
  });

  it("never trusts the client's numbers", () => {
    expect(f.cleanShot({ x: 99, y: -5, power: 7, curve: NaN } as any)).toEqual({ x: 1.6, y: 0, power: 1, curve: 0 });
    expect(f.cleanShot(null)).toEqual({ x: 0, y: 0.3, power: 0.5, curve: 0 });
    expect(f.isZone(3)).toBe(true);
    expect(f.isZone(6)).toBe(false);
    expect(f.isZone("2")).toBe(false);
    expect(f.isZone(1.5)).toBe(false);
  });

  it("execution error grows with power and with corner aim; too hard goes over", () => {
    const e = (x: number, y: number, power: number) => f.executionError({ x, y, power, curve: 0 });
    expect(e(0, 0.3, 0.9)).toBeGreaterThan(e(0, 0.3, 0.4));
    expect(e(0.95, 0.9, 0.5)).toBeGreaterThan(e(0, 0.3, 0.5));
    let over = 0;
    for (let i = 0; i < 2000; i++) if (["over", "bar"].includes(f.resolveKick({ x: 0, y: 0.6, power: 1, curve: 0 }, 0, i).outcome)) over++;
    expect(over / 2000).toBeGreaterThan(0.8);
  });

  it("the keeper saves only in or next to his zone; soft shots are easier; top corners are hard", () => {
    expect(f.saveChance(0, 0.9, 0.9, 0.5)).toBe(0); // dived bottom-left, ball top-right
    expect(f.saveChance(1, 0, 0.2, 0.2)).toBeGreaterThan(f.saveChance(1, 0, 0.2, 0.9));
    expect(f.saveChance(5, 0.95, 0.95, 0.6)).toBeLessThan(f.saveChance(2, 0.7, 0.2, 0.6));
    expect(f.saveChance(1, 0, 0.2, 0.5)).toBeGreaterThan(0.5);
    // Measured: a medium-power shot to a random zone vs a random dive scores most of the time
    let goals = 0;
    const N = 20000;
    const rng = f.seededRng(7);
    for (let i = 0; i < N; i++) {
      const z = Math.floor(rng() * 6) as 0 | 1 | 2 | 3 | 4 | 5;
      const c = f.zoneCentre(z);
      const k = f.resolveKick({ x: c.x * 1.05, y: c.y, power: 0.6, curve: 0 }, Math.floor(rng() * 6) as 0, i);
      if (k.scored) goals++;
    }
    expect(goals / N).toBeGreaterThan(0.6);
    expect(goals / N).toBeLessThan(0.9);
  });

  it("the computer at every level plays legal choices", () => {
    const rng = f.seededRng(99);
    for (const level of f.LEVELS) {
      for (let i = 0; i < 200; i++) {
        const s = f.aiShot(level, rng, [0, 0, 1]);
        expect(f.cleanShot(s)).toEqual(s);
        expect(f.isZone(f.aiDive(level, rng, [2, 2, 2]))).toBe(true);
      }
    }
  });

  it("Elo moves the same both ways and favours upsets; weeks run Monday 00:00 Vietnam time", () => {
    expect(f.eloDelta(1000, 1000)).toBe(16);
    expect(f.eloDelta(1200, 1000)).toBeLessThan(16);
    expect(f.eloDelta(1000, 1200)).toBeGreaterThan(16);
    expect(f.eloDelta(3000, 0)).toBe(1);
    // Sunday 23:30 in Vietnam is still the week that began Monday the 19th
    expect(f.weekOf(new Date("2026-10-25T16:30:00Z"))).toBe("2026-10-19");
    expect(f.weekOf(new Date("2026-10-25T17:00:00Z"))).toBe("2026-10-26");
    expect(f.weekEnd("2026-10-19").toISOString()).toBe("2026-10-25T17:00:00.000Z");
    expect(f.previousWeek("2026-11-02")).toBe("2026-10-26");
  });
});

describe("Social 3 rules", async () => {
  const s3 = await import("../shared/social3");
  it("invite links stay on the site and on the game's own page", () => {
    expect(s3.validInvitePath("pool", "/pool?table=AB12")).toBe(true);
    expect(s3.validInvitePath("pool", "/pool")).toBe(true);
    expect(s3.validInvitePath("darts", "/phi-tieu?table=X")).toBe(true);
    expect(s3.validInvitePath("cards", "/ban-bai?table=Q7")).toBe(true);
    for (const bad of ["//evil.com", "/\\evil", "http://x", "/poolside", "/pool/../x", "/pool?x=<script>", "/pool#x", "", 5]) {
      expect(s3.validInvitePath("pool", bad)).toBe(false);
    }
    expect(s3.validInvitePath("darts", "/pool")).toBe(false);
  });
  it("draws three different quests, always at least one social", () => {
    let seed = 1;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let i = 0; i < 2000; i++) {
      const q = s3.drawQuests(rand);
      expect(q.length).toBe(3);
      expect(new Set(q.map((x) => x.kind)).size).toBe(3);
      expect(q.some((x) => x.social)).toBe(true);
    }
    for (const q of s3.QUESTS) { expect(q.reward).toBeGreaterThanOrEqual(10_000); expect(q.reward).toBeLessThanOrEqual(50_000); }
  });
  it("club roles: owner does all, officers approve and remove members, members nothing", () => {
    expect(s3.clubAllowed("owner", "kick", "officer")).toBe(true);
    expect(s3.clubAllowed("officer", "kick", "member")).toBe(true);
    expect(s3.clubAllowed("officer", "kick", "officer")).toBe(false);
    expect(s3.clubAllowed("member", "kick", "member")).toBe(false);
    expect(s3.clubAllowed("officer", "promote", "member")).toBe(false);
    expect(s3.clubAllowed("officer", "approve")).toBe(true);
    expect(s3.clubAllowed("member", "approve")).toBe(false);
    expect(s3.clubAllowed("officer", "disband")).toBe(false);
    expect(s3.clubAllowed("owner", "transfer", "member")).toBe(true);
  });
  it("club names and tags are checked", () => {
    expect(s3.checkClubName("  Rồng   Vàng ")).toEqual({ ok: true, name: "Rồng Vàng" });
    expect(s3.checkClubName("ab").ok).toBe(false);
    expect(s3.checkClubName("x".repeat(21)).ok).toBe(false);
    expect(s3.checkClubName("bit.ly/abc").ok).toBe(false); // "/" isn't allowed in names
    expect(s3.checkClubTag("rong")).toEqual({ ok: true, tag: "RONG" });
    expect(s3.checkClubTag("r").ok).toBe(false);
  });
  it("streaks", () => {
    expect(s3.streakOf(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-20"], "2026-10-26")).toBe(3);
    expect(s3.streakOf(["2026-10-25"], "2026-10-26")).toBe(0);
  });
  it("lounge rooms fall back to the main lounge", () => {
    expect(s3.loungeRoom("zh")).toBe("zh");
    expect(s3.loungeRoom("../x")).toBe("main");
  });
  it("photo metadata is stripped from JPEG, PNG and WebP, the picture kept", async () => {
    const { stripImageMetadata } = await import("../shared/imagemeta");
    const has = (b: Uint8Array, t: string) => Buffer.from(b).includes(Buffer.from(t, "binary"));
    // PNG: IHDR, an eXIf and a tEXt chunk, IDAT, IEND (CRCs aren't checked here)
    const chunk = (type: string, data: string) => { const d = Buffer.from(data, "binary"); const h = Buffer.alloc(8); h.writeUInt32BE(d.length, 0); h.write(type, 4, "binary"); return Buffer.concat([h, d, Buffer.alloc(4)]); };
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", "x".repeat(13)), chunk("eXIf", "GPS-HOME"), chunk("tEXt", "Author\0me"), chunk("IDAT", "PIXELS"), chunk("IEND", "")]);
    const p = stripImageMetadata(png, "image/png")!;
    expect(has(p, "GPS-HOME")).toBe(false); expect(has(p, "Author")).toBe(false); expect(has(p, "PIXELS")).toBe(true); expect(has(p, "IEND")).toBe(true);
    // WebP: VP8X with the EXIF flag, VP8, EXIF, XMP
    const wchunk = (type: string, data: Buffer) => { const h = Buffer.alloc(8); h.write(type, 0, "binary"); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
    const body = Buffer.concat([wchunk("VP8X", Buffer.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])), wchunk("VP8 ", Buffer.from("PIXELS")), wchunk("EXIF", Buffer.from("GPS-HOME")), wchunk("XMP ", Buffer.from("<xmp/>"))]);
    const head = Buffer.alloc(12); head.write("RIFF", 0); head.writeUInt32LE(body.length + 4, 4); head.write("WEBP", 8);
    const w = Buffer.from(stripImageMetadata(Buffer.concat([head, body]), "image/webp")!);
    expect(has(w, "GPS-HOME")).toBe(false); expect(has(w, "<xmp")).toBe(false); expect(has(w, "PIXELS")).toBe(true);
    expect(w.readUInt32LE(4)).toBe(w.length - 8);
    expect(w[20] & 0x0c).toBe(0);
    // Broken files are refused
    expect(stripImageMetadata(Buffer.from([0xff, 0xd8, 0x00]), "image/jpeg")).toBeNull();
    expect(stripImageMetadata(png.subarray(0, 30), "image/png")).toBeNull();
  });
});
