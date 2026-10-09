/**
 * Live card tables: up to 5 players at one table, playing one of two ways.
 *
 *  - "house" (Bàn Chung): everyone plays blackjack against the computer dealer at the same
 *    table and sees each other's cards. Dealer stands on 17, blackjack pays 3:2, double on
 *    any first two cards, no split. The dealer checks for blackjack first.
 *  - "banker" (Xì Dách nhà cái): one player is the banker and the rest play against them.
 *    The banker's seat moves round the table every round. Coins only change hands between
 *    players; the game takes nothing.
 *
 * Xì Dách rules here: aces count 1 or 11. Xì Bàn (two aces) beats everything and pays ×3;
 * Xì Dách (an ace and a ten-card) pays ×2; Ngũ Linh (five cards, 21 or under) pays ×2.
 * Players need 16 or more to stand (the banker 15). Going over 21 (quắc) always loses, even
 * if the banker goes over too. Otherwise the higher total wins; two Ngũ Linh: the lower total wins.
 */

export type TableMode = "house" | "banker";
export type Card = string; // rank + suit, e.g. "AS", "10H"

export const TABLE_STAKES = [1000, 5000, 10000, 50000, 100000];
export const TABLE_SEATS = 5;
export const TURN_MS = 20_000;
export const BETWEEN_ROUNDS_MS = 7_000;
export const PLAYER_STAND_MIN = 16;
export const BANKER_STAND_MIN = 15;
export const XI_BAN_PAYS = 3;
export const XI_DACH_PAYS = 2;
export const NGU_LINH_PAYS = 2;
/** Most a player can lose in one round, as a multiple of the stake (held aside when the round starts) */
export const HOUSE_HOLD = 2; // a doubled hand
export const BANKER_HOLD = XI_BAN_PAYS;

export const rankOf = (c: Card) => c.slice(0, -1);
const cardValue = (c: Card) => {
  const r = rankOf(c);
  return r === "A" ? 11 : r === "J" || r === "Q" || r === "K" ? 10 : Number(r);
};
export function handTotal(cards: Card[]): number {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardValue(c); if (rankOf(c) === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
export const isBlackjack = (cards: Card[]) => cards.length === 2 && handTotal(cards) === 21;

/** What a Xì Dách hand is, strongest first */
export type XiKind = "xiban" | "xidach" | "nguLinh" | "normal" | "non" | "quac";
export function xiKind(cards: Card[], isBanker: boolean): XiKind {
  if (cards.length === 2 && cards.every((c) => rankOf(c) === "A")) return "xiban";
  if (cards.length === 2 && handTotal(cards) === 21) return "xidach";
  const t = handTotal(cards);
  if (t > 21) return "quac";
  if (cards.length >= 5) return "nguLinh";
  if (t < (isBanker ? BANKER_STAND_MIN : PLAYER_STAND_MIN)) return "non";
  return "normal";
}
const SPECIAL_PAYS: Partial<Record<XiKind, number>> = { xiban: XI_BAN_PAYS, xidach: XI_DACH_PAYS, nguLinh: NGU_LINH_PAYS };
const STRENGTH: Record<XiKind, number> = { xiban: 5, xidach: 4, nguLinh: 3, normal: 2, non: 1, quac: 0 };

/**
 * What the player wins from the banker, in stakes: positive the player wins, negative the
 * banker wins, 0 a push. The banker's result is the opposite.
 */
export function xiDachResult(player: Card[], banker: Card[]): number {
  const p = xiKind(player, false), b = xiKind(banker, true);
  if (p === "quac") return b === "xiban" || b === "xidach" ? -(SPECIAL_PAYS[b] ?? 1) : -1;
  if (p === "non") return b === "quac" || b === "non" ? 0 : -(SPECIAL_PAYS[b] ?? 1);
  if (b === "quac" || b === "non") return SPECIAL_PAYS[p] ?? 1;
  if (STRENGTH[p] !== STRENGTH[b]) return STRENGTH[p] > STRENGTH[b] ? SPECIAL_PAYS[p] ?? 1 : -(SPECIAL_PAYS[b] ?? 1);
  // Same kind
  if (p === "xiban" || p === "xidach") return 0;
  const pt = handTotal(player), bt = handTotal(banker);
  if (p === "nguLinh") return pt === bt ? 0 : pt < bt ? NGU_LINH_PAYS : -NGU_LINH_PAYS;
  return pt === bt ? 0 : pt > bt ? 1 : -1;
}

/** Blackjack against the dealer: what a hand returns, as a multiple of its stake (stake included) */
export function houseReturn(hand: Card[], dealer: Card[]): number {
  const p = handTotal(hand), d = handTotal(dealer);
  const pbj = isBlackjack(hand), dbj = isBlackjack(dealer);
  if (pbj && dbj) return 1;
  if (pbj) return 2.5;
  if (dbj) return 0;
  if (p > 21) return 0;
  if (d > 21) return 2;
  return p > d ? 2 : p === d ? 1 : 0;
}

export type SeatStatus = "waiting" | "playing" | "done" | "out";
export interface SeatView {
  seat: number;
  username: string;
  you: boolean;
  online: boolean;
  /** A computer player, sitting in so one person can still play Xì Dách */
  bot: boolean;
  /** In this round */
  playing: boolean;
  banker: boolean;
  /** Your own cards; others' only once shown (always in house mode, at the end in banker mode) */
  cards: Card[] | null;
  count: number;
  total: number | null;
  status: SeatStatus;
  doubled: boolean;
  /** Coins won or lost this round, once settled */
  net: number | null;
  label: string | null;
}

export interface TableView {
  code: string;
  mode: TableMode;
  stake: number;
  phase: "waiting" | "playing" | "dealer" | "settled";
  seats: (SeatView | null)[];
  /** House mode: the dealer's cards (the second hidden until the dealer plays) */
  dealer: { cards: (Card | null)[]; total: number | null } | null;
  turn: number | null;
  deadline: number | null;
  nextRoundAt: number | null;
  you: number | null;
  serverNow: number;
  /** Why a round isn't starting: "need_players" | "banker_coins" | "no_coins" */
  message: string | null;
  round: number;
}

export interface TableSummary { code: string; mode: TableMode; stake: number; players: number; host: string }
