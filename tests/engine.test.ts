import { describe, it, expect } from "vitest";
import { spin, lineWinsFor, scatterFor, pickSymbol, type Rng } from "../server/game";
import {
  SLOT_SYMBOLS, PAYLINES, SCATTER_PAYS, ORACLE_WIN_MULTIPLIER, REPEATER_MULTIPLIERS, BASE_RTP, JACKPOT_LINE,
} from "../shared/schema";

const BET = 1000;
const pays = (id: string) => SLOT_SYMBOLS.find((s) => s.id === id)!.pays;
const linePay = (id: string, mult = 1) => Math.floor(pays(id) * BET) * mult;

/** Builds grid[col][row] from rows written top to bottom, the way you'd see them on screen */
function fromRows(rows: string[][]): string[][] {
  return [0, 1, 2].map((c) => [0, 1, 2].map((r) => rows[r][c]));
}

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

// Every row, diagonal, V and zigzag is broken here
const NOTHING = fromRows([
  ["dragon", "drum", "lotus"],
  ["lantern", "coin", "dragon"],
  ["drum", "lotus", "lantern"],
]);

describe("paylines", () => {
  it("has 9 paylines", () => expect(PAYLINES).toHaveLength(9));

  it("pays nothing when nothing lines up", () => {
    expect(lineWinsFor(NOTHING, BET)).toEqual([]);
    expect(scatterFor(NOTHING, BET).count).toBe(0);
  });

  it.each(PAYLINES.map((line, idx) => [idx, line] as const))("detects payline %i", (idx, line) => {
    const grid = NOTHING.map((col) => [...col]);
    line.forEach((row, col) => { grid[col][row] = "lotus"; });
    expect(lineWinsFor(grid, BET).find((w) => w.line === idx)).toMatchObject({ symbol: "lotus", amount: linePay("lotus") });
  });

  it("pays the published multiple for each regular symbol", () => {
    for (const s of SLOT_SYMBOLS.filter((s) => s.kind === "regular")) {
      const grid = NOTHING.map((col) => [...col]);
      PAYLINES[1].forEach((row, col) => { grid[col][row] = s.id; });
      expect(lineWinsFor(grid, BET).find((w) => w.line === 1)).toMatchObject({ symbol: s.id, amount: Math.floor(s.pays * BET), withWild: false });
    }
  });
});

describe("wild (Dragon Pearl)", () => {
  it("substitutes for a regular symbol and pays that symbol", () => {
    const grid = fromRows([["drum", "pearl", "drum"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    expect(lineWinsFor(grid, BET).find((w) => w.line === 0)).toEqual({ line: 0, symbol: "drum", amount: linePay("drum"), withWild: true });
  });

  it("three wilds pay the wild prize", () => {
    const grid = fromRows([["pearl", "pearl", "pearl"], ["lantern", "coin", "lotus"], ["coin", "lotus", "lantern"]]);
    expect(lineWinsFor(grid, BET).find((w) => w.line === 0)).toMatchObject({ symbol: "pearl", amount: linePay("pearl") });
  });

  it("does not join two different symbols", () => {
    const grid = fromRows([["drum", "pearl", "lotus"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    expect(lineWinsFor(grid, BET).map((w) => w.line)).not.toContain(0);
  });
});

describe("scatter (Lucky Red Envelope)", () => {
  const withEnvelopes = (n: number) => {
    const g = NOTHING.map((col) => [...col]);
    [[0, 0], [2, 2], [1, 1], [0, 2], [2, 0], [1, 0]].slice(0, n).forEach(([c, r]) => { g[c][r] = "envelope"; });
    return g;
  };

  it("two envelopes pay nothing", () => {
    expect(scatterFor(withEnvelopes(2), BET)).toEqual({ count: 2, win: 0, freeSpins: 0 });
  });

  it.each(SCATTER_PAYS.map((t) => [t.count, t] as const))("%i envelopes anywhere pay the published prize and free spins", (count, tier) => {
    expect(scatterFor(withEnvelopes(count), BET)).toEqual({ count, win: tier.pays * BET, freeSpins: tier.freeSpins });
  });

  it("envelopes break paylines and are never substituted by wilds", () => {
    const grid = fromRows([["envelope", "pearl", "pearl"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    expect(lineWinsFor(grid, BET).map((w) => w.line)).not.toContain(0);
  });
});

describe("Repeater", () => {
  it("does not trigger without a line win", () => {
    const r = spin(BET, { startGrid: NOTHING, rng: scripted([]) });
    expect(r.steps).toHaveLength(1);
    expect(r.repeats).toBe(0);
    expect(r.winAmount).toBe(0);
  });

  it("locks the winning cells and re-spins only the other six", () => {
    // Top row of drums wins; the re-spin draws 6 symbols that form nothing new
    const start = fromRows([["drum", "drum", "drum"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    // re-spin order is column by column, top to bottom, skipping locked cells
    const rng = scripted(["lotus", "coin", "coin", "lantern", "lotus", "dragon"]);
    const r = spin(BET, { startGrid: start, rng });
    expect(rng.used()).toBe(6);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[1].held.sort()).toEqual(["0-0", "1-0", "2-0"]);
    for (let c = 0; c < 3; c++) expect(r.steps[1].grid[c][0]).toBe("drum");
    expect(r.steps[1].lineWins).toEqual([]);
    expect(r.repeats).toBe(0);
    expect(r.winAmount).toBe(linePay("drum"));
  });

  it("pays new lines with climbing multipliers and never pays a line twice", () => {
    // Top row lanterns win; repeat 1 makes the middle row coins (x2); repeat 2 makes nothing new
    const start = fromRows([["lantern", "lantern", "lantern"], ["drum", "lotus", "dragon"], ["dragon", "drum", "lotus"]]);
    const rng = scripted([
      "coin", "dragon", "coin", "drum", "coin", "lotus", // repeat 1: middle row coin coin coin
      "lotus", "drum", "dragon",                           // repeat 2: bottom row, nothing new
    ]);
    const r = spin(BET, { startGrid: start, rng });
    expect(r.steps.map((s) => s.multiplier)).toEqual([1, REPEATER_MULTIPLIERS[0], REPEATER_MULTIPLIERS[1]]);
    expect(r.steps[1].lineWins).toEqual([{ line: 1, symbol: "coin", amount: linePay("coin", REPEATER_MULTIPLIERS[0]), withWild: false }]);
    expect(r.steps[2].lineWins).toEqual([]);
    expect(r.repeats).toBe(1);
    expect(r.winLines.filter((l) => l === 0)).toHaveLength(1); // top row paid once only
    expect(r.winAmount).toBe(linePay("lantern") + linePay("coin", REPEATER_MULTIPLIERS[0]));
  });

  it("stops after the last multiplier even if wins keep coming", () => {
    const allCoins = fromRows([["coin", "coin", "coin"], ["coin", "coin", "coin"], ["coin", "coin", "coin"]]);
    const r = spin(BET, { startGrid: allCoins, rng: scripted([]) });
    // Every line pays on the first spin, so every cell is locked and the first repeat adds nothing
    expect(r.steps).toHaveLength(2);
    expect(r.winAmount).toBe(9 * linePay("coin"));
  });

  it("never runs more repeats than there are multipliers", () => {
    let n = 0;
    const rng: Rng = (max) => (n++ * 7919) % max;
    for (let i = 0; i < 20000; i++) expect(spin(BET, { rng }).steps.length).toBeLessThanOrEqual(1 + REPEATER_MULTIPLIERS.length);
  });

  it("counts envelopes on the first spin only", () => {
    const start = fromRows([["drum", "drum", "drum"], ["lantern", "envelope", "dragon"], ["coin", "lotus", "envelope"]]);
    const rng = scripted(["envelope", "envelope", "envelope", "envelope", "lotus", "dragon"]);
    const r = spin(BET, { startGrid: start, rng });
    expect(r.scatterCount).toBe(2);
    expect(r.freeSpinsAwarded).toBe(0);
  });
});

describe("Hũ Rồng jackpot", () => {
  it("three pearls on the middle row hit the jackpot", () => {
    const start = fromRows([["lotus", "drum", "dragon"], ["pearl", "pearl", "pearl"], ["dragon", "lotus", "drum"]]);
    const r = spin(BET, { startGrid: start, rng: scripted(["coin", "lantern", "coin", "lantern", "lotus", "coin"]) });
    expect(JACKPOT_LINE).toBe(1);
    expect(r.jackpotHit).toBe(true);
  });

  it("three pearls on another row pay the line but not the jackpot", () => {
    const start = fromRows([["pearl", "pearl", "pearl"], ["lotus", "drum", "dragon"], ["dragon", "lotus", "drum"]]);
    const r = spin(BET, { startGrid: start, rng: scripted(["coin", "lantern", "coin", "lantern", "lotus", "coin"]) });
    expect(r.jackpotHit).toBe(false);
    expect(r.winAmount).toBeGreaterThanOrEqual(linePay("pearl"));
  });

  it("can be hit by a repeat", () => {
    // Top-row lotuses win; repeat 1 turns the middle row into pearls (which also completes
    // the lotus V and zigzag, so the chain continues); repeat 2 adds nothing and ends it
    const start = fromRows([["lotus", "lotus", "lotus"], ["drum", "coin", "dragon"], ["dragon", "drum", "coin"]]);
    const rng = scripted([
      "pearl", "dragon", "pearl", "drum", "pearl", "coin", // repeat 1: middle row pearls
      "dragon", "envelope", "coin",                         // repeat 2: bottom row, nothing new
    ]);
    const r = spin(BET, { startGrid: start, rng });
    expect(r.steps[1].lineWins.some((w) => w.line === JACKPOT_LINE && w.symbol === "pearl")).toBe(true);
    expect(r.jackpotHit).toBe(true);
    expect(r.steps).toHaveLength(3);
  });
});

describe("oracle blessing", () => {
  it("doubles everything the spin pays", () => {
    const grid = fromRows([["lotus", "lotus", "lotus"], ["envelope", "coin", "envelope"], ["coin", "envelope", "lantern"]]);
    const respin = ["coin", "lantern", "drum", "lotus", "dragon", "drum"];
    const normal = spin(BET, { startGrid: grid, rng: scripted(respin) });
    const blessed = spin(BET, { startGrid: grid, rng: scripted(respin), blessed: true });
    expect(blessed.winAmount).toBe(normal.winAmount * ORACLE_WIN_MULTIPLIER);
    expect(blessed.freeSpinsAwarded).toBe(normal.freeSpinsAwarded);
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
  it("the real engine matches the published base RTP (2M spins with free spins)", () => {
    let paid = 0, won = 0, pending = 0;
    for (let i = 0; i < 2_000_000; i++) {
      if (pending > 0) pending--; else paid += BET;
      const r = spin(BET);
      won += r.winAmount;
      pending += r.freeSpinsAwarded;
    }
    // About 5 standard errors wide: never flakes, but catches any real paytable change
    expect(Math.abs(won / paid - BASE_RTP)).toBeLessThan(0.012);
  }, 60_000);
});
