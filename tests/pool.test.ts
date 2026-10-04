import { describe, it, expect } from "vitest";
import {
  simulate, rack, newGame, playShot, legalTargets, canPlaceCue, TABLE_W, TABLE_L, BALL_R, HEAD_STRING_X,
  type Ball, type GameState,
} from "../shared/pool/engine";
import { chooseAiShot } from "../shared/pool/ai";

const ball = (n: number, x: number, y: number): Ball => ({ n, x, y, potted: false });
let seed = 1;
const rng = (m: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % m; };

/** A mid-game state with the given balls; shooter is player 0 */
function state(balls: Ball[], extra: Partial<GameState> = {}): GameState {
  return { balls, turn: 0, groups: [null, null], breakShot: false, ballInHand: false, winner: null, last: null, shots: 5, ...extra };
}

describe("pool physics", () => {
  it("is deterministic", () => {
    const b = rack(rng);
    const shot = { dx: 1, dy: 0.004, power: 1, spin: 0.2 };
    expect(JSON.stringify(simulate(b, shot))).toBe(JSON.stringify(simulate(b, shot)));
  });

  it("never mutates the start state and keeps balls on the table", () => {
    const b = rack(rng);
    const copy = JSON.stringify(b);
    const r = simulate(b, { dx: 1, dy: 0.01, power: 1, spin: 0 });
    expect(JSON.stringify(b)).toBe(copy);
    for (const x of r.balls) if (!x.potted) {
      expect(x.x).toBeGreaterThanOrEqual(BALL_R - 0.05);
      expect(x.x).toBeLessThanOrEqual(TABLE_L - BALL_R + 0.05);
      expect(x.y).toBeGreaterThanOrEqual(BALL_R - 0.05);
      expect(x.y).toBeLessThanOrEqual(TABLE_W - BALL_R + 0.05);
    }
    // no two balls left overlapping
    const on = r.balls.filter((x) => !x.potted);
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      expect(Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y)).toBeGreaterThan(2 * BALL_R - 0.1);
    }
  });

  it("pots a straight shot into the corner", () => {
    const r = simulate([ball(0, 100, 50), ball(3, 60, 30)], { dx: -40, dy: -20, power: 0.5, spin: 0 });
    expect(r.events.filter((e) => e.t !== "rail")).toEqual([{ t: "hit", a: 0, b: 3 }, { t: "pot", ball: 3, pocket: 0 }]);
  });

  it("follow and draw change where the cue ball ends up", () => {
    // Where the cue ball is 1.2 s in (before the object ball can come back off the far cushion)
    const setup = [ball(0, 60, TABLE_W / 2), ball(1, 100, TABLE_W / 2)];
    const at = (spin: number) => simulate(setup, { dx: 1, dy: 0, power: 0.3, spin }).frames[72][0]![0];
    const stun = at(0), follow = at(1), draw = at(-1);
    expect(follow).toBeGreaterThan(stun + 10);
    expect(draw).toBeLessThan(stun - 10);
  });

  it("rejects nonsense shots", () => {
    expect(() => simulate(rack(rng), { dx: 0, dy: 0, power: 1, spin: 0 })).toThrow();
    expect(() => simulate(rack(rng), { dx: NaN, dy: 1, power: 1, spin: 0 })).toThrow();
  });
});

describe("8-ball rules", () => {
  it("a scratch is a foul: turn passes with ball in hand", () => {
    // cue ball fired straight into the corner pocket after missing nothing
    const s = state([ball(0, 20, 20), ball(1, 200, 100), ball(9, 150, 30), ball(8, 180, 60)]);
    const r = playShot(s, { dx: -1, dy: -1, power: 0.4, spin: 0 }).state;
    expect(r.last?.foul).toBe("scratch");
    expect(r.turn).toBe(1);
    expect(r.ballInHand).toBe(true);
    expect(r.balls.find((b) => b.n === 0)!.potted).toBe(false);
  });

  it("hitting the wrong group first is a foul", () => {
    const s = state([ball(0, 60, 60), ball(9, 100, 60), ball(1, 200, 100), ball(8, 180, 30)], { groups: ["solids", "stripes"] });
    const r = playShot(s, { dx: 1, dy: 0, power: 0.4, spin: 0 }).state;
    expect(r.last?.foul).toBe("wrong_ball");
    expect(r.turn).toBe(1);
  });

  it("first legal pot assigns groups and keeps the turn", () => {
    const s = state([ball(0, 100, 50), ball(3, 60, 30), ball(12, 200, 100), ball(8, 180, 60)]);
    const r = playShot(s, { dx: -40, dy: -20, power: 0.5, spin: 0 }).state;
    expect(r.last?.foul).toBeNull();
    expect(r.groups).toEqual(["solids", "stripes"]);
    expect(r.turn).toBe(0);
  });

  it("potting the 8 early loses; potting it after clearing your group wins", () => {
    const early = state([ball(0, 100, 50), ball(8, 60, 30), ball(2, 200, 100)], { groups: ["solids", "stripes"] });
    // only the 8 is... not legal yet: hitting it first is a foul and potting it loses
    expect(playShot(early, { dx: -40, dy: -20, power: 0.5, spin: 0 }).state.winner).toBe(1);
    const late = state([ball(0, 100, 50), ball(8, 60, 30), ball(12, 200, 100)], { groups: ["solids", "stripes"] });
    expect(legalTargets(late)).toEqual([8]);
    expect(playShot(late, { dx: -40, dy: -20, power: 0.5, spin: 0 }).state.winner).toBe(0);
  });

  it("ball in hand: placement must be on the table, clear of balls, and behind the line on the break", () => {
    const g = newGame(rng);
    expect(canPlaceCue(g, HEAD_STRING_X - 10, 60)).toBe(true);
    expect(canPlaceCue(g, HEAD_STRING_X + 10, 60)).toBe(false); // the break: kitchen only
    const mid = { ...g, breakShot: false };
    const b1 = mid.balls[1];
    expect(canPlaceCue(mid, b1.x, b1.y)).toBe(false);
    expect(canPlaceCue(mid, -5, 60)).toBe(false);
    expect(() => playShot(g, { dx: 1, dy: 0, power: 1, spin: 0 }, { x: 200, y: 60 })).toThrow();
  });

  it("the computer finishes whole games under the rules", () => {
    for (let k = 0; k < 4; k++) {
      let s = newGame(rng, (k % 2) as 0 | 1);
      while (s.winner === null && s.shots < 300) {
        const { shot, cue } = chooseAiShot(s);
        s = playShot(s, shot, cue, false).state;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});
