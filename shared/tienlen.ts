/**
 * Tiến Lên Miền Nam (Southern rules), you against three computer players.
 *
 * Cards are numbers 0-51: rank * 4 + suit. Ranks run 3 4 5 6 7 8 9 10 J Q K A 2 (2 is highest),
 * suits ♠ ♣ ♦ ♥ (hearts highest). The holder of 3♠ leads the first trick and must play it.
 * Combinations: a single, pair, triple, four of a kind (tứ quý), a straight (sảnh) of 3+
 * consecutive ranks without a 2, and consecutive pairs (đôi thông) of 3+ pairs without a 2.
 * You beat the table with the same kind and length and a higher top card, except bombs:
 * three consecutive pairs or a tứ quý chops a single 2; four consecutive pairs or a tứ quý
 * chops a pair of 2s; a tứ quý or four consecutive pairs beat three consecutive pairs; four
 * consecutive pairs beat a tứ quý. Once you pass you sit out until a new trick starts.
 */

export type Card = number;
export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
export const SUITS = ["♠", "♣", "♦", "♥"];
export const rankOf = (c: Card) => Math.floor(c / 4);
export const suitOf = (c: Card) => c % 4;
export const cardName = (c: Card) => `${RANKS[rankOf(c)]}${SUITS[suitOf(c)]}`;
export const TWO = 12;
export const THREE_SPADES = 0;

export type ComboType = "single" | "pair" | "triple" | "quad" | "straight" | "pairs";
export interface Combo { type: ComboType; len: number; top: Card }

export const TIENLEN_STAKES = [1000, 5000, 10000, 50000, 100000, 500000];
/** What each finishing place returns, as a multiple of the stake: 1st, 2nd, 3rd, 4th */
export const TIENLEN_PAYS = [2.4, 1, 0.4, 0];
/** Between equally good players everyone averages (2.4 + 1 + 0.4 + 0) / 4 = 95% back */
export const TIENLEN_EVEN_RTP = TIENLEN_PAYS.reduce((a, b) => a + b, 0) / 4;
export const BOT_NAMES = ["Bà Tư", "Chú Sáu", "Anh Ba"];

/** What a set of cards is as a play, or null if it isn't one */
export function classify(cards: Card[]): Combo | null {
  if (cards.length === 0) return null;
  const s = [...cards].sort((a, b) => a - b);
  if (new Set(s).size !== s.length) return null;
  const top = s[s.length - 1];
  const ranks = s.map(rankOf);
  const same = ranks.every((r) => r === ranks[0]);
  if (s.length === 1) return { type: "single", len: 1, top };
  if (same && s.length === 2) return { type: "pair", len: 2, top };
  if (same && s.length === 3) return { type: "triple", len: 3, top };
  if (same && s.length === 4) return { type: "quad", len: 4, top };
  if (s.length >= 3 && !ranks.includes(TWO) && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) {
    return { type: "straight", len: s.length, top };
  }
  if (s.length >= 6 && s.length % 2 === 0 && !ranks.includes(TWO)) {
    let ok = true;
    for (let i = 0; i < s.length; i += 2) {
      if (ranks[i] !== ranks[i + 1] || (i > 0 && ranks[i] !== ranks[i - 2] + 1)) { ok = false; break; }
    }
    if (ok) return { type: "pairs", len: s.length, top };
  }
  return null;
}

/** Can `a` be played on top of `b`? */
export function beats(a: Combo, b: Combo): boolean {
  if (a.type === b.type && a.len === b.len) return a.top > b.top;
  const pairsOf = (c: Combo) => (c.type === "pairs" ? c.len / 2 : 0);
  // Chopping 2s (chặt heo)
  if (b.type === "single" && rankOf(b.top) === TWO) return a.type === "quad" || pairsOf(a) >= 3;
  if (b.type === "pair" && rankOf(b.top) === TWO) return a.type === "quad" || pairsOf(a) >= 4;
  // Bombs on bombs
  if (pairsOf(b) === 3) return a.type === "quad" || pairsOf(a) >= 4;
  if (b.type === "quad") return pairsOf(a) >= 4;
  return false;
}

export function deal(rand: (n: number) => number): Card[][] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return [0, 1, 2, 3].map((p) => deck.slice(p * 13, p * 13 + 13).sort((a, b) => a - b));
}

export interface TienLenState {
  hands: Card[][];
  turn: number;
  /** The play on the table and who made it, or null when the next player leads */
  table: { cards: Card[]; combo: Combo; by: number } | null;
  passed: boolean[];
  /** Seats in the order they emptied their hands */
  finished: number[];
  /** True until the first card is played: that play must include 3♠ */
  opening: boolean;
  /** Simulations only: four computer players, played until three are out */
  allBots?: boolean;
}

export type TienLenEvent = { seat: number; play: Card[] } | { seat: number; pass: true } | { seat: number; newTrick: true };

export function newGame(rand: (n: number) => number): TienLenState {
  const hands = deal(rand);
  const first = hands.findIndex((h) => h.includes(THREE_SPADES));
  return { hands, turn: first, table: null, passed: [false, false, false, false], finished: [], opening: true };
}

export const gameOver = (s: TienLenState) => (!s.allBots && s.finished.includes(0)) || s.finished.length >= 3;
/** Your finishing place, 1-4 (once the game is over) */
export const placeOf = (s: TienLenState, seat = 0) => (s.finished.includes(seat) ? s.finished.indexOf(seat) + 1 : 4);

/** Moves the turn on; when everyone else has passed, the last player to play leads a new trick */
function advance(s: TienLenState, events: TienLenEvent[]) {
  const active = (p: number) => !s.finished.includes(p);
  for (let k = 1; k <= 4; k++) {
    const p = (s.turn + k) % 4;
    if (s.table && p === s.table.by) break; // went all the way round
    if (active(p) && !s.passed[p]) { s.turn = p; return; }
  }
  // Nobody can or will beat the table: a new trick, led by whoever played last (or the next player on)
  const by = s.table ? s.table.by : s.turn;
  s.table = null;
  s.passed = [false, false, false, false];
  let lead = by;
  while (!active(lead)) lead = (lead + 1) % 4;
  s.turn = lead;
  events.push({ seat: lead, newTrick: true });
}

/** Why a play isn't allowed, or null if it is */
export function playError(s: TienLenState, seat: number, cards: Card[]): string | null {
  if (gameOver(s)) return "The game is over";
  if (s.turn !== seat) return "It isn't your turn";
  if (!cards.every((c) => s.hands[seat].includes(c))) return "You don't have those cards";
  const combo = classify(cards);
  if (!combo) return "That isn't a valid play";
  if (s.opening && !cards.includes(THREE_SPADES)) return "The first play must include 3♠";
  if (s.table && !beats(combo, s.table.combo)) return "That doesn't beat the table";
  return null;
}

export function applyPlay(s: TienLenState, seat: number, cards: Card[], events: TienLenEvent[]) {
  const combo = classify(cards)!;
  s.hands[seat] = s.hands[seat].filter((c) => !cards.includes(c));
  s.table = { cards: [...cards].sort((a, b) => a - b), combo, by: seat };
  s.opening = false;
  events.push({ seat, play: s.table.cards });
  if (s.hands[seat].length === 0) s.finished.push(seat);
  if (!gameOver(s)) advance(s, events);
}

export function applyPass(s: TienLenState, seat: number, events: TienLenEvent[]): string | null {
  if (s.turn !== seat) return "It isn't your turn";
  if (!s.table) return "You lead this trick, so you have to play";
  s.passed[seat] = true;
  events.push({ seat, pass: true });
  advance(s, events);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Finding plays (the computer players use this, and so does the "hint" button)

const byRank = (hand: Card[]) => {
  const m = new Map<number, Card[]>();
  for (const c of hand) m.set(rankOf(c), [...(m.get(rankOf(c)) ?? []), c]);
  return m;
};

/** Every distinct play in a hand worth considering (the cheapest version of each shape) */
export function allPlays(hand: Card[]): Card[][] {
  const out: Card[][] = [];
  const g = byRank(hand);
  for (const c of hand) out.push([c]);
  for (const [, cs] of g) {
    if (cs.length >= 2) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) out.push([cs[i], cs[j]]);
    if (cs.length === 3) out.push(cs);
    if (cs.length === 4) {
      for (let skip = 0; skip < 4; skip++) out.push(cs.filter((_, k) => k !== skip));
      out.push(cs);
    }
  }
  // Straights: lowest suits on the way, each possible top card
  for (let start = 0; start < TWO; start++) {
    for (let len = 3; start + len <= TWO; len++) {
      const ranks = Array.from({ length: len }, (_, i) => start + i);
      if (!ranks.every((r) => g.has(r))) break;
      const body = ranks.slice(0, -1).map((r) => g.get(r)![0]);
      for (const topCard of g.get(ranks[len - 1])!) out.push([...body, topCard]);
    }
  }
  // Consecutive pairs
  for (let start = 0; start < TWO; start++) {
    for (let n = 3; start + n <= TWO; n++) {
      const ranks = Array.from({ length: n }, (_, i) => start + i);
      if (!ranks.every((r) => (g.get(r)?.length ?? 0) >= 2)) break;
      const body = ranks.slice(0, -1).flatMap((r) => g.get(r)!.slice(0, 2));
      const last = g.get(ranks[n - 1])!;
      out.push([...body, last[0], last[last.length - 1]]);
    }
  }
  return out.filter((p) => classify(p));
}

/** The plays in a hand that are legal right now */
export function legalPlays(s: TienLenState, seat: number): Card[][] {
  return allPlays(s.hands[seat]).filter((p) => playError(s, seat, p) === null);
}

/** How "expensive" a play is to give up: high cards, 2s and bombs are worth keeping */
function cost(play: Card[], hand: Card[]): number {
  const combo = classify(play)!;
  const twos = play.filter((c) => rankOf(c) === TWO).length;
  const bomb = combo.type === "quad" || (combo.type === "pairs" && combo.len >= 6);
  // Breaking up a pair, triple or quad to play part of it is wasteful
  const g = byRank(hand);
  let breaks = 0;
  for (const r of new Set(play.map(rankOf))) {
    const have = g.get(r)!.length, using = play.filter((c) => rankOf(c) === r).length;
    if (have > using && have >= 2) breaks += 1;
  }
  return rankOf(combo.top) * 2 + suitOf(combo.top) * 0.1 + twos * 40 + (bomb ? 80 : 0) + breaks * 6 - play.length * 1.5;
}

/**
 * A computer player's move: a play, or null to pass. It dumps low cards first, keeps 2s and bombs
 * for when they matter, and goes all out to stop anyone close to going out.
 */
export function botMove(s: TienLenState, seat: number, rand: (n: number) => number): Card[] | null {
  const plays = legalPlays(s, seat);
  if (plays.length === 0) return null;
  const hand = s.hands[seat];
  const others = [0, 1, 2, 3].filter((p) => p !== seat && !s.finished.includes(p));
  const fewest = Math.min(...others.map((p) => s.hands[p].length));
  // Going out with everything left, if that's one play
  const all = plays.find((p) => p.length === hand.length);
  if (all) return all;
  const ranked = plays.map((p) => ({ p, c: cost(p, hand) })).sort((a, b) => a.c - b.c);
  if (!s.table) {
    // Someone is down to one card: lead something they can't follow with a single
    if (fewest === 1) {
      const multi = ranked.filter((x) => x.p.length > 1);
      if (multi.length) return multi[0].p;
      return ranked[ranked.length - 1].p; // the highest single
    }
    // Otherwise dump the most awkward low cards, longest plays first, keeping 2s back
    const low = ranked.filter((x) => !x.p.some((c) => rankOf(c) === TWO));
    return (low[0] ?? ranked[0]).p;
  }
  // Following: the cheapest play that beats the table
  const cheapest = ranked[0];
  const bomb = ["quad", "pairs"].includes(classify(cheapest.p)!.type) && classify(cheapest.p)!.len >= 4;
  // Save bombs for chopping 2s, unless the hand is nearly done
  if (bomb && rankOf(s.table.combo.top) !== TWO && hand.length > 5) return null;
  return cheapest.p;
}

/** Runs the computer players until it's your turn or the game ends */
export function runBots(s: TienLenState, rand: (n: number) => number, events: TienLenEvent[]) {
  let guard = 0;
  while (!gameOver(s) && s.turn !== 0 && guard++ < 500) {
    const seat = s.turn;
    const move = botMove(s, seat, rand);
    if (move) applyPlay(s, seat, move, events);
    else if (s.table) applyPass(s, seat, events);
    else applyPlay(s, seat, legalPlays(s, seat)[0], events); // leading: must play something
  }
}

/** The cheapest legal play, for the hint button */
export function hint(s: TienLenState, seat = 0): Card[] | null {
  const plays = legalPlays(s, seat);
  if (!plays.length) return null;
  return plays.map((p) => ({ p, c: cost(p, s.hands[seat]) })).sort((a, b) => a.c - b.c)[0].p;
}

export interface TienLenView {
  id: number;
  stake: number;
  hand: Card[];
  counts: number[];
  turn: number;
  table: { cards: Card[]; by: number; type: ComboType } | null;
  passed: boolean[];
  finished: number[];
  opening: boolean;
  over: boolean;
  place: number | null;
  payout: number | null;
  /** What happened since your last move, for the screen to play through */
  events: TienLenEvent[];
  balance: number;
}
