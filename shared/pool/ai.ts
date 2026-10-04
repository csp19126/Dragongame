import {
  BALL_R, POCKETS, TABLE_L, TABLE_W, HEAD_STRING_X, canPlaceCue, legalTargets, playShot, groupOf,
  type GameState, type Shot,
} from "./engine";

/**
 * The computer opponent for practice games. For every legal target and pocket it works
 * out the "ghost ball" aim, skips blocked lines, test-plays the most promising shots in
 * the real physics, and picks the best result. A little aim wobble keeps it beatable.
 */

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

/** Is the straight path from a to b clear of other balls (with `clearance` to spare)? */
function clearPath(s: GameState, a: Pt, b: Pt, ignore: number[], clearance = 2 * BALL_R - 0.2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return true;
  for (const ball of s.balls) {
    if (ball.potted || ignore.includes(ball.n)) continue;
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / len2));
    const px = a.x + t * dx, py = a.y + t * dy;
    if ((ball.x - px) ** 2 + (ball.y - py) ** 2 < clearance * clearance) return false;
  }
  return true;
}

/** Where the pocket "aim point" is: a little inside the mouth from the pocket centre */
function aimPoint(p: number): Pt {
  const c = POCKETS[p];
  return { x: Math.min(TABLE_L - 1, Math.max(1, c.x)), y: Math.min(TABLE_W - 1, Math.max(1, c.y)) };
}

interface Candidate { shot: Shot; cue?: Pt; prior: number }

function candidates(s: GameState, cue: Pt, placing: boolean): Candidate[] {
  const out: Candidate[] = [];
  const targets = legalTargets(s);
  for (const tn of targets) {
    const t = s.balls.find((b) => b.n === tn && !b.potted);
    if (!t) continue;
    for (let p = 0; p < POCKETS.length; p++) {
      const pk = aimPoint(p);
      const toPocket = dist(t, pk);
      if (toPocket < 1e-6) continue;
      const ux = (pk.x - t.x) / toPocket, uy = (pk.y - t.y) / toPocket;
      const ghost = { x: t.x - ux * 2 * BALL_R, y: t.y - uy * 2 * BALL_R };
      if (ghost.x < BALL_R || ghost.x > TABLE_L - BALL_R || ghost.y < BALL_R || ghost.y > TABLE_W - BALL_R) continue;
      let from = cue;
      if (placing) {
        // Put the cue ball 25 cm behind the ghost ball, on the line to the pocket
        const spot = { x: ghost.x - ux * 25, y: ghost.y - uy * 25 };
        if (!canPlaceCue(s, spot.x, spot.y)) continue;
        from = spot;
      }
      const toGhost = dist(from, ghost);
      if (toGhost < 1e-6) continue;
      const ax = (ghost.x - from.x) / toGhost, ay = (ghost.y - from.y) / toGhost;
      const cut = ax * ux + ay * uy; // cos of the cut angle
      if (cut < 0.25) continue;
      if (!clearPath(s, from, ghost, [0, tn]) || !clearPath(s, t, pk, [tn], 2 * BALL_R - 0.6)) continue;
      const power = Math.min(0.95, Math.max(0.22, (toGhost + toPocket * 1.6) / 420 + 0.12 + (1 - cut) * 0.25));
      const prior = cut * 2 - (toGhost + toPocket) / 300 + (groupOf(tn) === null ? 0.3 : 0);
      for (const k of [1, 0.8, 1.25]) out.push({ shot: { dx: ax, dy: ay, power: Math.min(1, power * k), spin: k === 0.8 ? -0.3 : 0 }, cue: placing ? from : undefined, prior: prior - (k === 1 ? 0 : 0.05) });
    }
  }
  return out.sort((a, b) => b.prior - a.prior);
}

function score(before: GameState, after: GameState): number {
  const me = before.turn;
  if (after.winner !== null) return after.winner === me ? 100000 : -100000;
  let v = 0;
  if (after.last?.foul) v -= 400;
  if (after.turn === me) v += 300;
  const g = after.groups[me];
  if (g) v += 40 * after.last!.potted.filter((n) => groupOf(n) === g).length;
  // Leave the opponent less to shoot at when we miss
  if (after.turn !== me) v -= 5 * legalTargets(after).length;
  return v;
}

export function chooseAiShot(s: GameState, rng: () => number = Math.random, budget = 36): { shot: Shot; cue?: Pt } {
  const cueBall = s.balls.find((b) => b.n === 0)!;
  const placing = s.ballInHand;
  let cue: Pt = { x: cueBall.x, y: cueBall.y };
  if (placing && s.breakShot) cue = { x: HEAD_STRING_X - 20, y: TABLE_W / 2 + (rng() - 0.5) * 20 };

  // The break: hit the head ball hard, nearly straight
  if (s.breakShot) {
    const head = s.balls.filter((b) => b.n !== 0 && !b.potted).sort((a, b) => a.x - b.x)[0];
    return { shot: { dx: head.x - cue.x, dy: head.y - cue.y + (rng() - 0.5) * 1.2, power: 0.95 + rng() * 0.05, spin: 0 }, cue };
  }

  let list = candidates(s, cue, placing && !s.breakShot).slice(0, budget);
  if (list.length === 0) {
    // Nothing clean: hit the nearest legal ball at a few strengths and angles
    const targets = legalTargets(s).map((n) => s.balls.find((b) => b.n === n && !b.potted)!).filter(Boolean);
    const from = placing ? (canPlaceCue(s, cue.x, cue.y) ? cue : { x: HEAD_STRING_X, y: TABLE_W / 2 }) : cue;
    for (const t of targets.sort((a, b) => dist(a, from) - dist(b, from)).slice(0, 4)) {
      for (const off of [0, 1.5, -1.5]) for (const pw of [0.35, 0.6]) {
        list.push({ shot: { dx: t.x - from.x, dy: t.y + off - from.y, power: pw, spin: 0 }, cue: placing ? from : undefined, prior: 0 });
      }
    }
  }

  let best: Candidate | null = null, bestScore = -Infinity;
  for (const c of list) {
    try {
      const { state } = playShot(s, c.shot, c.cue, false);
      const v = score(s, state) + c.prior * 10;
      if (v > bestScore) { bestScore = v; best = c; }
    } catch { /* illegal placement etc. */ }
  }
  if (!best) best = { shot: { dx: 1, dy: 0, power: 0.5, spin: 0 }, prior: 0 };

  // Aim wobble: up to about ±0.8° and ±6% power
  const wobble = (rng() - 0.5) * 0.028;
  const cos = Math.cos(wobble), sin = Math.sin(wobble);
  const { dx, dy } = best.shot;
  return {
    shot: { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos, power: Math.min(1, best.shot.power * (0.94 + rng() * 0.12)), spin: best.shot.spin },
    cue: best.cue,
  };
}
