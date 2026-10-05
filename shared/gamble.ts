/**
 * Xóc Đĩa double-up. After a winning spin the player may stake the win on four coins
 * shaken under a bowl, each red or white with equal chance. Every bet pays exactly fair
 * odds, so the double-up returns 100% on average and never changes the game's return:
 *   chẵn (an even number of reds: 0, 2 or 4)  8/16  pays x2
 *   lẻ   (an odd number of reds: 1 or 3)      8/16  pays x2
 *   tứ đỏ (all four red)                     1/16  pays x16
 *   tứ trắng (all four white)                1/16  pays x16
 * The player can stake the whole win or half of it (keeping the other half), up to
 * GAMBLE_MAX_ROUNDS times in a row, and collect whenever they like.
 */
export const GAMBLE_PICKS = ["chan", "le", "tu_do", "tu_trang"] as const;
export type GamblePick = (typeof GAMBLE_PICKS)[number];

export const GAMBLE_PAYS: Record<GamblePick, number> = { chan: 2, le: 2, tu_do: 16, tu_trang: 16 };
export const GAMBLE_MAX_ROUNDS = 5;
/** The largest amount that can be staked in one round */
export const GAMBLE_MAX_STAKE = 50_000_000;

/** Did this pick win, given how many of the four coins came up red */
export function gambleWins(pick: GamblePick, reds: number): boolean {
  if (pick === "chan") return reds % 2 === 0;
  if (pick === "le") return reds % 2 === 1;
  if (pick === "tu_do") return reds === 4;
  return reds === 0;
}
