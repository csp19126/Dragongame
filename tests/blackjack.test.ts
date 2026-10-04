import { describe, it, expect } from "vitest";
import { deal, act, handValue, allowedActions, extraStake, newShoe, publicView, rank, type Card, type BlackjackState, type Action } from "../server/blackjack";

/** A shoe that deals the given cards in order (the engine draws from the end) */
const shoe = (...cards: Card[]) => [...cards].reverse();
// Deal order: player, dealer, player, dealer, then hits
const hand = (p1: Card, d1: Card, p2: Card, d2: Card, ...rest: Card[]) => shoe(p1, d1, p2, d2, ...rest, ...Array(20).fill("2C"));

describe("blackjack rules", () => {
  it("counts aces as 1 or 11", () => {
    expect(handValue(["AS", "6H"])).toEqual({ total: 17, soft: true });
    expect(handValue(["AS", "6H", "10D"])).toEqual({ total: 17, soft: false });
    expect(handValue(["AS", "AH", "9D"])).toEqual({ total: 21, soft: true });
    expect(handValue(["KS", "QH", "2D"])).toEqual({ total: 22, soft: false });
  });

  it("a natural pays 3 to 2 at once", () => {
    const s = deal(2000, hand("AS", "9H", "KD", "7C"));
    expect(s.finished).toBe(true);
    expect(s.hands[0].outcome).toBe("blackjack");
    expect(s.payout).toBe(5000);
  });

  it("the dealer peeks: a dealer blackjack takes only the original stake, and two naturals push", () => {
    const lose = deal(1000, hand("10S", "AH", "9D", "KC"));
    expect(lose.finished).toBe(true);
    expect(lose.hands[0].outcome).toBe("lose");
    expect(allowedActions(lose)).toEqual([]);
    const push = deal(1000, hand("AS", "AH", "KD", "QC"));
    expect(push.hands[0].outcome).toBe("push");
    expect(push.payout).toBe(1000);
  });

  it("hit, bust, and the dealer stands on soft 17", () => {
    let s = deal(1000, hand("10S", "AH", "6D", "6C", "KD"));
    expect(s.finished).toBe(false);
    expect(publicView(s).dealer.cards).toEqual(["AH", null]); // hole card hidden
    expect(JSON.stringify(publicView(s))).not.toContain("6C");
    s = act(s, "hit");
    expect(s.hands[0].outcome).toBe("bust");
    expect(s.dealer).toHaveLength(2); // all hands bust: dealer doesn't draw

    let t = deal(1000, hand("10S", "6H", "8D", "AC", "5D"));
    t = act(t, "stand"); // 18 vs soft 17: dealer must stand
    expect(handValue(t.dealer).total).toBe(17);
    expect(t.hands[0].outcome).toBe("win");
    expect(t.payout).toBe(2000);
  });

  it("double takes one card and doubles the stake", () => {
    let s = deal(1000, hand("6S", "6H", "5D", "10C", "KD", "9S"));
    expect(extraStake(s, "double")).toBe(1000);
    s = act(s, "double");
    expect(s.hands[0].cards).toHaveLength(3);
    expect(s.totalBet).toBe(2000);
    expect(s.hands[0].outcome).toBe("win"); // 21 vs 6+10+9 = 25
    expect(s.payout).toBe(4000);
  });

  it("split aces get one card each, and 21 after a split pays 1 to 1", () => {
    let s = deal(1000, hand("AS", "9H", "AD", "8C", "KD", "5S"));
    expect(allowedActions(s)).toContain("split");
    s = act(s, "split");
    expect(s.finished).toBe(true);
    expect(s.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(s.hands[0].outcome).toBe("win"); // A+K = 21, not a blackjack
    expect(s.hands[0].payout).toBe(2000);
    expect(s.hands[1].outcome).toBe("lose"); // A+5 = 16 vs 17
    expect(s.totalBet).toBe(2000);
  });

  it("splits only once, and allows double after split", () => {
    let s = deal(1000, hand("8S", "6H", "8D", "10C", "8H", "3S", "10D"));
    s = act(s, "split");
    expect(allowedActions(s)).not.toContain("split"); // 8+8 again, but no resplit
    expect(allowedActions(s)).toContain("double");
    s = act(s, "stand");
    s = act(s, "double"); // second hand 8+3, doubles onto a 10
    expect(s.finished).toBe(true);
    expect(s.totalBet).toBe(3000);
  });

  it("refuses actions that aren't allowed", () => {
    const s = deal(1000, hand("10S", "6H", "7D", "10C"));
    expect(() => act(s, "split")).toThrow();
  });

  it("a fresh shoe has 6 full decks", () => {
    const sh = newShoe();
    expect(sh).toHaveLength(312);
    expect(sh.filter((c) => rank(c) === "A")).toHaveLength(24);
  });
});

/** Textbook basic strategy for 6 decks, dealer stands on soft 17, double after split */
function basic(s: BlackjackState): Action {
  const h = s.hands[s.active];
  const up = Math.min(10, rank(s.dealer[0]) === "A" ? 11 : ["J", "Q", "K"].includes(rank(s.dealer[0])) ? 10 : Number(rank(s.dealer[0])));
  const can = allowedActions(s);
  const { total, soft } = handValue(h.cards);
  const dbl = (cond: boolean, otherwise: Action = "hit"): Action => (cond && can.includes("double") ? "double" : otherwise);
  if (can.includes("split")) {
    const r = rank(h.cards[0]);
    const v = r === "A" ? 11 : ["10", "J", "Q", "K"].includes(r) ? 10 : Number(r);
    if (v === 11 || v === 8) return "split";
    if (v === 9 && ![7, 10, 11].includes(up)) return "split";
    if ((v === 7 || v === 2 || v === 3) && up <= 7) return "split";
    if (v === 6 && up <= 6) return "split";
    if (v === 4 && (up === 5 || up === 6)) return "split";
  }
  if (soft && total <= 21) {
    if (total >= 19) return "stand";
    if (total === 18) return up >= 3 && up <= 6 ? dbl(true, "stand") : up <= 8 ? "stand" : "hit";
    if (total === 17) return dbl(up >= 3 && up <= 6);
    if (total >= 15) return dbl(up >= 4 && up <= 6);
    return dbl(up === 5 || up === 6);
  }
  if (total >= 17) return "stand";
  if (total >= 13) return up <= 6 ? "stand" : "hit";
  if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
  if (total === 11) return dbl(up !== 11);
  if (total === 10) return dbl(up <= 9);
  if (total === 9) return dbl(up >= 3 && up <= 6);
  return "hit";
}

describe("blackjack return to player", () => {
  it("returns about 99.5% to a perfect basic-strategy player", () => {
    const N = 300_000;
    let staked = 0, back = 0;
    for (let i = 0; i < N; i++) {
      let s = deal(1000, newShoe((m) => Math.floor(Math.random() * m)));
      while (!s.finished) s = act(s, basic(s));
      staked += s.totalBet;
      back += s.payout;
    }
    const rtp = back / staked;
    // Per-hand spread is about 1.15 stakes, so 300k hands pins this down to about ±0.4%
    expect(rtp).toBeGreaterThan(0.985);
    expect(rtp).toBeLessThan(1.003);
  });
});
