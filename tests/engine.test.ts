import { describe, it, expect } from "vitest";
import { evaluate, spin, type Rng } from "../server/game";
import { SLOT_SYMBOLS, PAYLINES, FREE_SPINS_AWARD, ORACLE_WIN_MULTIPLIER } from "../shared/schema";

const BET = 1000;
const pays = (id: string) => SLOT_SYMBOLS.find((s) => s.id === id)!.pays;

/** Builds grid[col][row] from rows written top to bottom, the way you'd see them on screen */
function fromRows(rows: string[][]): string[][] {
  return [0, 1, 2].map((c) => [0, 1, 2].map((r) => rows[r][c]));
}

const NOTHING = fromRows([
  ["dragon", "drum", "lotus"],
  ["lantern", "coin", "dragon"],
  ["drum", "lotus", "lantern"],
]);

describe("paylines", () => {
  it("pays nothing when no line matches", () => {
    const r = evaluate(NOTHING, BET);
    expect(r.winAmount).toBe(0);
    expect(r.winLines).toEqual([]);
    expect(r.freeSpinsAwarded).toBe(0);
  });

  it.each(PAYLINES.map((line, idx) => [idx, line] as const))("detects payline %i", (idx, line) => {
    const grid = NOTHING.map((col) => [...col]);
    line.forEach((row, col) => { grid[col][row] = "lotus"; });
    const r = evaluate(grid, BET);
    expect(r.winLines).toContain(idx);
    expect(r.winAmount).toBeGreaterThanOrEqual(pays("lotus") * BET);
  });

  it("adds every winning line together", () => {
    const allCoins = fromRows([["coin", "coin", "coin"], ["coin", "coin", "coin"], ["coin", "coin", "coin"]]);
    const r = evaluate(allCoins, BET);
    expect(r.winLines).toEqual([0, 1, 2, 3, 4]);
    expect(r.winAmount).toBe(5 * pays("coin") * BET);
  });

  it("pays the published multiple for each symbol", () => {
    for (const s of SLOT_SYMBOLS) {
      const grid = fromRows([[s.id, s.id, s.id], ["drum", "coin", "lantern"], ["lantern", "drum", "lotus"]]);
      // Row 0 only; make sure nothing else lines up
      const r = evaluate(grid, BET);
      expect(r.winLines).toEqual([0]);
      expect(r.winAmount).toBe(Math.floor(s.pays * BET));
    }
  });

  it("flags a dragon line", () => {
    const grid = fromRows([["drum", "lotus", "dragon"], ["lantern", "dragon", "coin"], ["dragon", "drum", "lotus"]]);
    const r = evaluate(grid, BET);
    expect(r.winLines).toEqual([4]);
    expect(r.dragonLine).toBe(true);
  });
});

describe("free spins and blessing", () => {
  it("awards free spins when a spin pays 10x or more", () => {
    const drums = fromRows([["drum", "drum", "drum"], ["lantern", "coin", "lotus"], ["coin", "lotus", "lantern"]]);
    expect(evaluate(drums, BET).freeSpinsAwarded).toBe(FREE_SPINS_AWARD);
  });

  it("does not award free spins below 10x", () => {
    const lotus = fromRows([["lotus", "lotus", "lotus"], ["lantern", "coin", "drum"], ["coin", "drum", "lantern"]]);
    expect(evaluate(lotus, BET).freeSpinsAwarded).toBe(0);
  });

  it("blessing multiplies the win but not the free-spin trigger", () => {
    const lotus = fromRows([["lotus", "lotus", "lotus"], ["lantern", "coin", "drum"], ["coin", "drum", "lantern"]]);
    const r = evaluate(lotus, BET, ORACLE_WIN_MULTIPLIER);
    expect(r.winAmount).toBe(pays("lotus") * BET * ORACLE_WIN_MULTIPLIER);
    expect(r.freeSpinsAwarded).toBe(0);
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
  it("is exactly 95.98% including free spins (all 1,953,125 grids)", () => {
    const ids = SLOT_SYMBOLS.map((s) => s.id);
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
    const p = SLOT_SYMBOLS.map((s) => s.weight / total);
    let ret = 0, trigger = 0;
    const idx = new Array(9).fill(0);
    for (let combo = 0; combo < 5 ** 9; combo++) {
      let c = combo, prob = 1;
      for (let k = 0; k < 9; k++) { idx[k] = c % 5; c = Math.floor(c / 5); prob *= p[idx[k]]; }
      const r = evaluate([0, 1, 2].map((col) => [0, 1, 2].map((row) => ids[idx[col * 3 + row]])), BET);
      ret += (prob * r.winAmount) / BET;
      if (r.freeSpinsAwarded) trigger += prob;
    }
    const rtp = ret + (trigger * FREE_SPINS_AWARD * ret) / (1 - trigger * FREE_SPINS_AWARD);
    expect(rtp).toBeCloseTo(0.9598, 4);
  });
});
