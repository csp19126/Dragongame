import { describe, it, expect } from "vitest";
import { evaluate, spin, exactRtp, type Rng } from "../server/game";
import { SLOT_SYMBOLS, PAYLINES, SCATTER_PAYS, ORACLE_WIN_MULTIPLIER, MAX_WIN_MULTIPLE } from "../shared/schema";

const BET = 1000;
const pays = (id: string) => SLOT_SYMBOLS.find((s) => s.id === id)!.pays;

/** Builds grid[col][row] from rows written top to bottom, the way you'd see them on screen */
function fromRows(rows: string[][]): string[][] {
  return [0, 1, 2].map((c) => [0, 1, 2].map((r) => rows[r][c]));
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
    const r = evaluate(NOTHING, BET);
    expect(r.winAmount).toBe(0);
    expect(r.lineWins).toEqual([]);
    expect(r.scatterCount).toBe(0);
    expect(r.freeSpinsAwarded).toBe(0);
  });

  it.each(PAYLINES.map((line, idx) => [idx, line] as const))("detects payline %i", (idx, line) => {
    const grid = NOTHING.map((col) => [...col]);
    line.forEach((row, col) => { grid[col][row] = "lotus"; });
    const r = evaluate(grid, BET);
    expect(r.winLines).toContain(idx);
    expect(r.lineWins.find((w) => w.line === idx)).toMatchObject({ symbol: "lotus", amount: Math.floor(pays("lotus") * BET) });
  });

  it("adds every winning line together", () => {
    const allCoins = fromRows([["coin", "coin", "coin"], ["coin", "coin", "coin"], ["coin", "coin", "coin"]]);
    const r = evaluate(allCoins, BET);
    expect(r.winLines).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.winAmount).toBe(9 * Math.floor(pays("coin") * BET));
  });

  it("pays the published multiple for each regular symbol", () => {
    for (const s of SLOT_SYMBOLS.filter((s) => s.kind === "regular")) {
      const grid = NOTHING.map((col) => [...col]);
      PAYLINES[1].forEach((row, col) => { grid[col][row] = s.id; }); // middle row
      const r = evaluate(grid, BET);
      const mid = r.lineWins.find((w) => w.line === 1);
      expect(mid).toMatchObject({ symbol: s.id, amount: Math.floor(s.pays * BET), withWild: false });
    }
  });

  it("flags a dragon line", () => {
    const grid = NOTHING.map((col) => [...col]);
    PAYLINES[4].forEach((row, col) => { grid[col][row] = "dragon"; });
    expect(evaluate(grid, BET).dragonLine).toBe(true);
  });
});

describe("wild (Dragon Pearl)", () => {
  it("substitutes for a regular symbol and pays that symbol", () => {
    const grid = fromRows([["drum", "pearl", "drum"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    const top = evaluate(grid, BET).lineWins.find((w) => w.line === 0);
    expect(top).toEqual({ line: 0, symbol: "drum", amount: Math.floor(pays("drum") * BET), withWild: true });
  });

  it("two wilds and one symbol still pay the symbol", () => {
    const grid = fromRows([["pearl", "dragon", "pearl"], ["lantern", "coin", "lotus"], ["coin", "lotus", "lantern"]]);
    expect(evaluate(grid, BET).lineWins.find((w) => w.line === 0)?.symbol).toBe("dragon");
  });

  it("three wilds pay the wild prize", () => {
    const grid = fromRows([["pearl", "pearl", "pearl"], ["lantern", "coin", "lotus"], ["coin", "lotus", "lantern"]]);
    expect(evaluate(grid, BET).lineWins.find((w) => w.line === 0)).toMatchObject({ symbol: "pearl", amount: pays("pearl") * BET });
  });

  it("does not join two different symbols", () => {
    const grid = fromRows([["drum", "pearl", "lotus"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    expect(evaluate(grid, BET).winLines).not.toContain(0);
  });

  it("an all-wild grid pays the published maximum", () => {
    const all = fromRows([["pearl", "pearl", "pearl"], ["pearl", "pearl", "pearl"], ["pearl", "pearl", "pearl"]]);
    expect(evaluate(all, BET).winAmount).toBe(MAX_WIN_MULTIPLE * BET);
  });
});

describe("scatter (Lucky Red Envelope)", () => {
  const withEnvelopes = (n: number) => {
    const g = NOTHING.map((col) => [...col]);
    const cells = [[0, 0], [2, 2], [1, 1], [0, 2], [2, 0], [1, 0]];
    cells.slice(0, n).forEach(([c, r]) => { g[c][r] = "envelope"; });
    return g;
  };

  it("two envelopes pay nothing", () => {
    const r = evaluate(withEnvelopes(2), BET);
    expect(r.scatterCount).toBe(2);
    expect(r.scatterWin).toBe(0);
    expect(r.freeSpinsAwarded).toBe(0);
  });

  it.each(SCATTER_PAYS.map((t) => [t.count, t] as const))("%i envelopes anywhere pay the published prize and free spins", (count, tier) => {
    const r = evaluate(withEnvelopes(count), BET);
    expect(r.scatterCount).toBe(count);
    expect(r.scatterWin).toBe(tier.pays * BET);
    expect(r.freeSpinsAwarded).toBe(tier.freeSpins);
  });

  it("six envelopes still pay the top tier", () => {
    expect(evaluate(withEnvelopes(6), BET).freeSpinsAwarded).toBe(SCATTER_PAYS[0].freeSpins);
  });

  it("envelopes break paylines and are never substituted by wilds", () => {
    const grid = fromRows([["envelope", "pearl", "pearl"], ["lantern", "coin", "dragon"], ["coin", "lotus", "lantern"]]);
    expect(evaluate(grid, BET).winLines).not.toContain(0);
  });
});

describe("oracle blessing", () => {
  it("doubles lines and scatter pay, but not free spins", () => {
    const grid = fromRows([["lotus", "lotus", "lotus"], ["envelope", "coin", "envelope"], ["coin", "envelope", "lantern"]]);
    const normal = evaluate(grid, BET);
    const blessed = evaluate(grid, BET, ORACLE_WIN_MULTIPLIER);
    expect(blessed.winAmount).toBe(normal.winAmount * ORACLE_WIN_MULTIPLIER);
    expect(blessed.freeSpinsAwarded).toBe(normal.freeSpinsAwarded);
  });
});

describe("random draw", () => {
  it("draws each symbol in proportion to its weight", () => {
    // A counting RNG walks every value evenly, so each symbol must appear exactly weight times per cycle
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
    let n = 0;
    const rng: Rng = (max) => n++ % max;
    const counts: Record<string, number> = {};
    for (let i = 0; i < total; i++) {
      for (const col of spin(BET, { rng }).grid) for (const id of col) counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const s of SLOT_SYMBOLS) expect(counts[s.id]).toBe(s.weight * 9);
  });

  it("returns a full 3x3 grid of known symbols", () => {
    const ids = new Set(SLOT_SYMBOLS.map((s) => s.id));
    for (let i = 0; i < 200; i++) {
      const { grid } = spin(BET);
      expect(grid).toHaveLength(3);
      grid.forEach((col) => { expect(col).toHaveLength(3); col.forEach((id) => expect(ids.has(id)).toBe(true)); });
    }
  });
});

describe("return to player", () => {
  it("is exactly 96.02% including free spins", () => {
    // Cross-checked against a brute-force enumeration of all 7^9 grids (npm run rtp -- --brute)
    expect(exactRtp().rtp).toBeCloseTo(0.96017, 5);
  });

  it("the real engine agrees with the exact figure (Monte Carlo, 1M spins with free spins)", () => {
    let paid = 0, won = 0, pending = 0;
    for (let i = 0; i < 1_000_000; i++) {
      if (pending > 0) pending--; else paid += BET;
      const r = spin(BET);
      won += r.winAmount;
      pending += r.freeSpinsAwarded;
    }
    // Wide enough to never flake (about 5 standard errors), tight enough to catch a broken paytable
    expect(Math.abs(won / paid - exactRtp().rtp)).toBeLessThan(0.03);
  });

  it("free spins trigger about once every 60 spins", () => {
    expect(1 / exactRtp().triggerChance).toBeCloseTo(60.3, 0);
  });
});
