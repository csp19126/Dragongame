import { randomInt } from "crypto";
import type { Rng } from "./game";

/**
 * Blackjack (Xì Dách) engine. Pure functions over a plain state object, so a hand can be
 * stored as JSON between requests and tested with a scripted shoe.
 *
 * Rules: 6 decks shuffled fresh for every hand; dealer stands on all 17s (S17); blackjack
 * pays 3:2; double on any first two cards, also after a split; split once (two hands);
 * split aces get one card each and a two-card 21 after a split is 21, not blackjack;
 * the dealer peeks for blackjack with an ace or ten up, so a player never loses more than
 * the original stake to a dealer blackjack. No insurance, no surrender.
 */

export const BJ_DECKS = 6;
export type Card = string; // rank + suit, e.g. "AS", "10H", "QD"
export type Action = "hit" | "stand" | "double" | "split";
export type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";

export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  outcome?: Outcome;
  payout?: number;
}

export interface BlackjackState {
  shoe: Card[];
  dealer: Card[];
  hands: PlayerHand[];
  active: number;
  finished: boolean;
  /** Total staked so far, including doubles and splits */
  totalBet: number;
  /** Total paid back when finished (stake included) */
  payout: number;
}

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];

const cryptoRng: Rng = (max) => randomInt(max);

export function newShoe(rng: Rng = cryptoRng, decks = BJ_DECKS): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push(r + s);
  // Fisher-Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export const rank = (c: Card) => c.slice(0, -1);
const cardValue = (c: Card) => {
  const r = rank(c);
  return r === "A" ? 11 : r === "J" || r === "Q" || r === "K" ? 10 : Number(r);
};

/** Best total of a hand, and whether an ace is still counted as 11 */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardValue(c); if (rank(c) === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

function draw(s: BlackjackState): Card {
  const c = s.shoe.pop();
  if (!c) throw new Error("Shoe is empty");
  return c;
}

/** Deals a new hand. The shoe's last card is dealt first. */
export function deal(bet: number, shoe: Card[]): BlackjackState {
  const s: BlackjackState = { shoe: [...shoe], dealer: [], hands: [], active: 0, finished: false, totalBet: bet, payout: 0 };
  const p: Card[] = [];
  p.push(draw(s)); s.dealer.push(draw(s)); p.push(draw(s)); s.dealer.push(draw(s));
  s.hands.push({ cards: p, bet, doubled: false, fromSplit: false, done: false });

  const up = cardValue(s.dealer[0]);
  const dealerBj = (up === 11 || up === 10) && isBlackjack(s.dealer); // the peek
  if (dealerBj || isBlackjack(p)) {
    s.hands[0].done = true;
    return settle(s);
  }
  return s;
}

/** What the player may do with the active hand now */
export function allowedActions(s: BlackjackState): Action[] {
  if (s.finished) return [];
  const h = s.hands[s.active];
  const acts: Action[] = ["hit", "stand"];
  if (h.cards.length === 2) {
    acts.push("double");
    if (s.hands.length === 1 && rank(h.cards[0]) === rank(h.cards[1])) acts.push("split");
  }
  return acts;
}

/** Applies one player action. The caller must charge `extraStake(s, action)` first. */
export function act(state: BlackjackState, action: Action): BlackjackState {
  if (!allowedActions(state).includes(action)) throw new Error(`Can't ${action} now`);
  const s: BlackjackState = structuredClone(state);
  const h = s.hands[s.active];

  if (action === "hit") {
    h.cards.push(draw(s));
    if (handValue(h.cards).total >= 21) h.done = true;
  } else if (action === "stand") {
    h.done = true;
  } else if (action === "double") {
    s.totalBet += h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(s));
    h.done = true;
  } else if (action === "split") {
    const second: PlayerHand = { cards: [h.cards.pop()!], bet: h.bet, doubled: false, fromSplit: true, done: false };
    h.fromSplit = true;
    s.totalBet += h.bet;
    s.hands.push(second);
    const aces = rank(h.cards[0]) === "A";
    for (const hand of s.hands) {
      hand.cards.push(draw(s));
      // Split aces get one card each; any hand that reaches 21 stands
      if (aces || handValue(hand.cards).total === 21) hand.done = true;
    }
  }

  // Move on to the next unfinished hand, or let the dealer play
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active >= s.hands.length) {
    s.active = s.hands.length - 1;
    return dealerPlay(s);
  }
  return s;
}

/** Extra stake an action needs on top of what is already on the table */
export function extraStake(s: BlackjackState, action: Action): number {
  return action === "double" || action === "split" ? s.hands[s.active].bet : 0;
}

function dealerPlay(s: BlackjackState): BlackjackState {
  const anyLive = s.hands.some((h) => handValue(h.cards).total <= 21);
  if (anyLive) {
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s)); // stands on soft 17
  }
  return settle(s);
}

function settle(s: BlackjackState): BlackjackState {
  const d = handValue(s.dealer).total;
  const dealerBj = isBlackjack(s.dealer);
  s.payout = 0;
  for (const h of s.hands) {
    const v = handValue(h.cards).total;
    const natural = !h.fromSplit && isBlackjack(h.cards);
    let outcome: Outcome;
    let payout: number;
    if (v > 21) { outcome = "bust"; payout = 0; }
    else if (natural && !dealerBj) { outcome = "blackjack"; payout = h.bet + Math.floor((h.bet * 3) / 2); }
    else if (dealerBj) { outcome = natural ? "push" : "lose"; payout = natural ? h.bet : 0; }
    else if (d > 21 || v > d) { outcome = "win"; payout = h.bet * 2; }
    else if (v === d) { outcome = "push"; payout = h.bet; }
    else { outcome = "lose"; payout = 0; }
    h.outcome = outcome;
    h.payout = payout;
    h.done = true;
    s.payout += payout;
  }
  s.finished = true;
  return s;
}

/** What the player is allowed to see: the shoe and an unturned hole card stay on the server */
export function publicView(s: BlackjackState) {
  return {
    hands: s.hands.map(({ cards, bet, doubled, done, outcome, payout }) => ({ cards, bet, doubled, done, outcome, payout, total: handValue(cards).total, soft: handValue(cards).soft })),
    dealer: s.finished
      ? { cards: s.dealer, total: handValue(s.dealer).total }
      : { cards: [s.dealer[0], null], total: handValue([s.dealer[0]]).total },
    active: s.active,
    finished: s.finished,
    totalBet: s.totalBet,
    payout: s.payout,
    actions: allowedActions(s),
  };
}
export type BlackjackView = ReturnType<typeof publicView>;
