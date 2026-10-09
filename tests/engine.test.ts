import { describe, it, expect } from "vitest";
import { spin, lineWinsFor, scatterFor, pickSymbol, evalLine, pearlCount, holdEV, bestHold, randomGrid, type Rng, type Hold } from "../server/game";
import {
  SLOT_SYMBOLS, PAYLINES, SCATTER_PAYS, REPEATER_MULTIPLIERS, REPEATER_PEARLS, REPEATER_SMALL, REPEATER_BIG_PEARLS, repeaterLadder, BASE_RTP, JACKPOT_ROW, REELS, ROWS,
  FREE_SPIN_OPTIONS, payOf, HOLD_CHANCE, HOLD_MAX_REELS, RTP_WITHOUT_HOLD,
} from "../shared/schema";
import { GAMBLE_PICKS, GAMBLE_PAYS, gambleWins } from "../shared/gamble";
import { STICKS, GRADE_BLESSING, ADVICE, TOPICS } from "../shared/oracle";

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
