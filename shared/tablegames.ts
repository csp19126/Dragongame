/**
 * Rules for the table games (Bầu Cua Tôm Cá and roulette). Shared so the client
 * shows exactly the rules the server plays by. Results are always drawn on the server.
 */

/** Chip values, same steps as the slot's bets */
export const TABLE_CHIPS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
/** Most you can have on one spot, and on the whole table, in one round */
export const TABLE_MAX_SPOT = 10_000_000;
export const TABLE_MAX_TOTAL = 10_000_000;
/** Every stake must be a whole number of the smallest chip */
export const TABLE_STEP = 1000;

// ---------------- Bầu Cua Tôm Cá ----------------

/** The six faces of each die, in the traditional board order */
export const BAU_CUA_SYMBOLS = ["bau", "cua", "tom", "ca", "ga", "nai"] as const;
export type BauCuaSymbol = (typeof BAU_CUA_SYMBOLS)[number];
export const BAU_CUA_DICE = 3;

/**
 * The traditional payout: a symbol that shows on k dice pays k to 1 (your stake back
 * plus k times it); a symbol that doesn't show loses. Exact return to player is
 * 92.13% (199/216), the same as the street game.
 */
export const BAU_CUA_RTP = 199 / 216;

// ---------------- Roulette (European, single zero) ----------------

/** Wheel order of a European wheel, clockwise from zero */
export const ROULETTE_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBetType =
  | "straight" | "red" | "black" | "odd" | "even" | "low" | "high" | "dozen" | "column";

/** Payout "to one" for each bet type */
export const ROULETTE_PAYS: Record<RouletteBetType, number> = {
  straight: 35, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
};

/** Every bet returns 36/37 on average: 97.30% return to player */
export const ROULETTE_RTP = 36 / 37;

export interface RouletteBet {
  type: RouletteBetType;
  /** straight: 0-36; dozen: 1-3 (1-12, 13-24, 25-36); column: 1-3 (1, 2 or 3 mod 3); otherwise unused */
  value?: number;
  amount: number;
}

export function rouletteColor(n: number): "green" | "red" | "black" {
  return n === 0 ? "green" : ROULETTE_RED.has(n) ? "red" : "black";
}

/** Does this bet win on this number? Zero loses every outside bet. */
export function rouletteBetWins(bet: Pick<RouletteBet, "type" | "value">, n: number): boolean {
  switch (bet.type) {
    case "straight": return bet.value === n;
    case "red": return n !== 0 && ROULETTE_RED.has(n);
    case "black": return n !== 0 && !ROULETTE_RED.has(n);
    case "odd": return n !== 0 && n % 2 === 1;
    case "even": return n !== 0 && n % 2 === 0;
    case "low": return n >= 1 && n <= 18;
    case "high": return n >= 19 && n <= 36;
    case "dozen": return n !== 0 && Math.ceil(n / 12) === bet.value;
    case "column": return n !== 0 && ((n - 1) % 3) + 1 === bet.value;
  }
}

/** A stable key for a bet spot, used to merge chips on the same spot */
export function rouletteSpot(bet: Pick<RouletteBet, "type" | "value">) {
  return bet.value === undefined ? bet.type : `${bet.type}:${bet.value}`;
}
