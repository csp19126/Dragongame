import { randomInt } from "crypto";
import { z } from "zod";
import {
  BAU_CUA_SYMBOLS, BAU_CUA_DICE, ROULETTE_PAYS, TABLE_MAX_SPOT, TABLE_MAX_TOTAL, TABLE_STEP,
  rouletteBetWins, rouletteSpot, type BauCuaSymbol, type RouletteBet,
} from "@shared/tablegames";
import type { Rng } from "./game";

const cryptoRng: Rng = (max) => randomInt(max);

const stake = z.number().int().min(TABLE_STEP).max(TABLE_MAX_SPOT)
  .refine((n) => n % TABLE_STEP === 0, `Stakes must be in steps of ${TABLE_STEP}`);

export const bauCuaBetsSchema = z.object({
  bets: z.record(z.enum(BAU_CUA_SYMBOLS), stake)
    .refine((b) => Object.keys(b).length > 0, "Place a bet first")
    .refine((b) => Object.values(b).reduce((a, n) => a + n, 0) <= TABLE_MAX_TOTAL, "Too much on the table"),
});

const rouletteBet = z.discriminatedUnion("type", [
  z.object({ type: z.literal("straight"), value: z.number().int().min(0).max(36), amount: stake }),
  z.object({ type: z.enum(["dozen", "column"]), value: z.number().int().min(1).max(3), amount: stake }),
  z.object({ type: z.enum(["red", "black", "odd", "even", "low", "high"]), amount: stake }),
]);

export const rouletteBetsSchema = z.object({
  bets: z.array(rouletteBet).min(1, "Place a bet first").max(60, "Too many bets")
    .refine((b) => b.reduce((a, x) => a + x.amount, 0) <= TABLE_MAX_TOTAL, "Too much on the table")
    .refine((b) => new Set(b.map(rouletteSpot)).size === b.length, "One stake per spot"),
});

export interface BauCuaOutcome {
  dice: BauCuaSymbol[];
  /** What each symbol bet returned (stake included), 0 for a loss */
  returns: Partial<Record<BauCuaSymbol, number>>;
  totalBet: number;
  winAmount: number;
}

/** Three independent dice; each symbol showing on k dice pays k to 1 */
export function playBauCua(bets: Partial<Record<BauCuaSymbol, number>>, rng: Rng = cryptoRng): BauCuaOutcome {
  const dice = Array.from({ length: BAU_CUA_DICE }, () => BAU_CUA_SYMBOLS[rng(BAU_CUA_SYMBOLS.length)]);
  const returns: Partial<Record<BauCuaSymbol, number>> = {};
  let totalBet = 0;
  let winAmount = 0;
  for (const [sym, amount] of Object.entries(bets) as [BauCuaSymbol, number][]) {
    totalBet += amount;
    const hits = dice.filter((d) => d === sym).length;
    returns[sym] = hits > 0 ? amount * (1 + hits) : 0;
    winAmount += returns[sym]!;
  }
  return { dice, returns, totalBet, winAmount };
}

export interface RouletteOutcome {
  number: number;
  /** Each bet with what it returned (stake included), 0 for a loss */
  bets: (RouletteBet & { returned: number })[];
  totalBet: number;
  winAmount: number;
}

/** One ball on a 37-pocket European wheel */
export function playRoulette(bets: RouletteBet[], rng: Rng = cryptoRng): RouletteOutcome {
  const number = rng(37);
  let totalBet = 0;
  let winAmount = 0;
  const settled = bets.map((b) => {
    totalBet += b.amount;
    const returned = rouletteBetWins(b, number) ? b.amount * (1 + ROULETTE_PAYS[b.type]) : 0;
    winAmount += returned;
    return { ...b, returned };
  });
  return { number, bets: settled, totalBet, winAmount };
}
