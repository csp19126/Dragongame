import { describe, it, expect } from "vitest";
import {
  BAU_CUA_SYMBOLS, BAU_CUA_RTP, ROULETTE_WHEEL, ROULETTE_RTP, ROULETTE_PAYS, rouletteBetWins,
  type RouletteBet, type RouletteBetType,
} from "../shared/tablegames";
import { playBauCua, playRoulette, bauCuaBetsSchema, rouletteBetsSchema } from "../server/tablegames";
import type { Rng } from "../server/game";

/** An RNG that returns the given values in order */
const seq = (...vals: number[]): Rng => { let i = 0; return () => vals[i++]; };

describe("Bầu Cua Tôm Cá", () => {
  it("pays k to 1 for a symbol on k dice, and loses otherwise", () => {
    // dice: cua, cua, ga
    const r = playBauCua({ cua: 1000, ga: 5000, nai: 2000 }, seq(1, 1, 4));
    expect(r.dice).toEqual(["cua", "cua", "ga"]);
    expect(r.returns).toEqual({ cua: 3000, ga: 10000, nai: 0 });
    expect(r.totalBet).toBe(8000);
    expect(r.winAmount).toBe(13000);
  });

  it("three of a kind pays 3 to 1", () => {
    const r = playBauCua({ bau: 1000 }, seq(0, 0, 0));
    expect(r.winAmount).toBe(4000);
  });

  it("returns exactly 199/216 over every possible roll", () => {
    let paid = 0, back = 0;
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
      const bets = Object.fromEntries(BAU_CUA_SYMBOLS.map((s) => [s, 1000]));
      const r = playBauCua(bets, seq(a, b, c));
      paid += r.totalBet; back += r.winAmount;
    }
    expect(back / paid).toBeCloseTo(BAU_CUA_RTP, 12);
    expect(BAU_CUA_RTP).toBeCloseTo(0.9213, 4);
  });

  it("validates bets", () => {
    expect(bauCuaBetsSchema.safeParse({ bets: { cua: 1000 } }).success).toBe(true);
    expect(bauCuaBetsSchema.safeParse({ bets: {} }).success).toBe(false);
    expect(bauCuaBetsSchema.safeParse({ bets: { dragon: 1000 } }).success).toBe(false);
    expect(bauCuaBetsSchema.safeParse({ bets: { cua: 1500 } }).success).toBe(false);
    expect(bauCuaBetsSchema.safeParse({ bets: { cua: -1000 } }).success).toBe(false);
    expect(bauCuaBetsSchema.safeParse({ bets: { cua: 6_000_000, tom: 6_000_000 } }).success).toBe(false);
  });
});

describe("Roulette", () => {
  it("has a 37-pocket European wheel with every number once", () => {
    expect([...ROULETTE_WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });

  it("settles straight and outside bets", () => {
    const bets: RouletteBet[] = [
      { type: "straight", value: 17, amount: 1000 },
      { type: "black", amount: 2000 },
      { type: "odd", amount: 3000 },
      { type: "dozen", value: 2, amount: 1000 },
      { type: "column", value: 2, amount: 1000 },
      { type: "high", amount: 5000 },
    ];
    const r = playRoulette(bets, seq(17)); // 17 is black, odd, low, 2nd dozen, 2nd column
    expect(r.number).toBe(17);
    expect(r.bets.map((b) => b.returned)).toEqual([36000, 4000, 6000, 3000, 3000, 0]);
    expect(r.winAmount).toBe(52000);
    expect(r.totalBet).toBe(13000);
  });

  it("zero loses every outside bet", () => {
    const types: RouletteBetType[] = ["red", "black", "odd", "even", "low", "high"];
    for (const type of types) expect(rouletteBetWins({ type }, 0)).toBe(false);
    expect(rouletteBetWins({ type: "dozen", value: 1 }, 0)).toBe(false);
    expect(rouletteBetWins({ type: "column", value: 3 }, 0)).toBe(false);
    expect(rouletteBetWins({ type: "straight", value: 0 }, 0)).toBe(true);
  });

  it("every bet type returns exactly 36/37 over the whole wheel", () => {
    const spots: Omit<RouletteBet, "amount">[] = [
      { type: "straight", value: 0 }, { type: "straight", value: 23 },
      { type: "red" }, { type: "black" }, { type: "odd" }, { type: "even" }, { type: "low" }, { type: "high" },
      { type: "dozen", value: 1 }, { type: "dozen", value: 3 }, { type: "column", value: 1 }, { type: "column", value: 2 },
    ];
    for (const s of spots) {
      let back = 0;
      for (let n = 0; n <= 36; n++) back += playRoulette([{ ...s, amount: 1000 } as RouletteBet], seq(n)).winAmount;
      expect(back / (37 * 1000), `${s.type}:${s.value}`).toBeCloseTo(ROULETTE_RTP, 12);
    }
    expect(ROULETTE_PAYS.straight).toBe(35);
  });

  it("validates bets", () => {
    const ok = (bets: unknown) => rouletteBetsSchema.safeParse({ bets }).success;
    expect(ok([{ type: "straight", value: 36, amount: 1000 }])).toBe(true);
    expect(ok([{ type: "straight", value: 37, amount: 1000 }])).toBe(false);
    expect(ok([{ type: "dozen", value: 4, amount: 1000 }])).toBe(false);
    expect(ok([{ type: "red", amount: 999 }])).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok([{ type: "red", amount: 1000 }, { type: "red", amount: 1000 }])).toBe(false);
    expect(ok([{ type: "lucky", amount: 1000 }])).toBe(false);
  });
});
