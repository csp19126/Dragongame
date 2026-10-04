/**
 * 8-ball pool: physics and rules, shared by the browser (animation, practice vs computer)
 * and the server (the referee for online games).
 *
 * The simulation is deterministic: it only uses + - * / and Math.sqrt on doubles, with a
 * fixed time step, so the same start state and shot give the same result on every device.
 * Online, the server simulates each shot and its result is the truth; phones replay the
 * same shot locally for the animation and then snap to the server's final positions.
 */

// ---------------- Table (centimetres; a 9-foot table) ----------------

export const TABLE_L = 254; // long side (x)
export const TABLE_W = 127; // short side (y)
export const BALL_R = 2.86;
/** Distance from a corner, along each rail, where the cushion starts (the corner pocket mouth) */
export const CORNER_GAP = 7;
/** Half-width of the side pocket mouth */
export const SIDE_GAP = 6.2;
export const HEAD_STRING_X = TABLE_L / 4;
export const FOOT_SPOT = { x: (TABLE_L * 3) / 4, y: TABLE_W / 2 };

/** Pocket centres, for drawing and for deciding which pocket a ball dropped into */
export const POCKETS = [
  { x: -1.5, y: -1.5 }, { x: TABLE_L / 2, y: -3 }, { x: TABLE_L + 1.5, y: -1.5 },
  { x: -1.5, y: TABLE_W + 1.5 }, { x: TABLE_L / 2, y: TABLE_W + 3 }, { x: TABLE_L + 1.5, y: TABLE_W + 1.5 },
];
const POCKET_CAPTURE_R = 5.2;

/** Cushion end points (the pocket "jaws"): balls bounce off these */
const JAWS = [
  { x: 0, y: CORNER_GAP }, { x: CORNER_GAP, y: 0 },
  { x: TABLE_L, y: CORNER_GAP }, { x: TABLE_L - CORNER_GAP, y: 0 },
  { x: 0, y: TABLE_W - CORNER_GAP }, { x: CORNER_GAP, y: TABLE_W },
  { x: TABLE_L, y: TABLE_W - CORNER_GAP }, { x: TABLE_L - CORNER_GAP, y: TABLE_W },
  { x: TABLE_L / 2 - SIDE_GAP, y: 0 }, { x: TABLE_L / 2 + SIDE_GAP, y: 0 },
  { x: TABLE_L / 2 - SIDE_GAP, y: TABLE_W }, { x: TABLE_L / 2 + SIDE_GAP, y: TABLE_W },
];

// ---------------- Physics constants ----------------

const DT = 1 / 600; // seconds per step: a ball moves at most ~1.3 cm per step
const FRAME_EVERY = 10; // record a frame every 10 steps (60 per second)
export const MAX_SPEED = 900; // cm/s, a full-power break
const ROLL_DECEL = 26; // cm/s² from rolling resistance
const DRAG = 0.15; // per second, extra slowing proportional to speed
const BALL_RESTITUTION = 0.95;
const CUSHION_RESTITUTION = 0.82;
const STOP_SPEED = 1.5;
const MAX_STEPS = 600 * 25;

// ---------------- State ----------------

export interface Ball {
  n: number; // 0 = cue, 1-7 solids, 8 black, 9-15 stripes
  x: number;
  y: number;
  potted: boolean;
}

export interface Shot {
  /** Aim direction (any length; normalised here) */
  dx: number;
  dy: number;
  /** 0..1 of MAX_SPEED */
  power: number;
  /** -1 (draw/back spin) .. 1 (follow/top spin) */
  spin: number;
}

export type PoolEvent =
  | { t: "hit"; a: number; b: number }
  | { t: "rail"; ball: number }
  | { t: "pot"; ball: number; pocket: number };

export interface SimResult {
  balls: Ball[];
  events: PoolEvent[];
  /** Positions every 1/60 s: frames[f][i] = [x, y] of balls[i], or null once potted */
  frames: ([number, number] | null)[][];
}

const sqrt = Math.sqrt;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Normalised shot, validated. Throws on nonsense input. */
export function cleanShot(s: Shot): Shot {
  const len = sqrt(s.dx * s.dx + s.dy * s.dy);
  if (!Number.isFinite(len) || len < 1e-9) throw new Error("Bad aim");
  if (!Number.isFinite(s.power) || !Number.isFinite(s.spin)) throw new Error("Bad shot");
  return { dx: s.dx / len, dy: s.dy / len, power: Math.min(1, Math.max(0.02, s.power)), spin: Math.min(1, Math.max(-1, s.spin)) };
}

/** Plays one shot from `start` until every ball stops. Never mutates `start`. */
export function simulate(start: Ball[], shotIn: Shot, recordFrames = true): SimResult {
  const shot = cleanShot(shotIn);
  const balls = start.map((b) => ({ ...b }));
  const n = balls.length;
  const vx = new Array<number>(n).fill(0);
  const vy = new Array<number>(n).fill(0);
  const cue = balls.findIndex((b) => b.n === 0);
  if (cue < 0 || balls[cue].potted) throw new Error("No cue ball");
  const speed0 = shot.power * MAX_SPEED;
  vx[cue] = shot.dx * speed0;
  vy[cue] = shot.dy * speed0;
  let spin = shot.spin; // follow/draw, applied when the cue ball first hits a ball
  let cueHasHit = false;
  let cueHit = -1;
  let cueSpinRel = 0;
  const contacts: number[] = [];
  const target: number[] = [];
  const acc: number[] = [];
  const MIN_D2 = 4 * BALL_R * BALL_R;

  const events: PoolEvent[] = [];
  const frames: ([number, number] | null)[][] = [];
  const snap = () => frames.push(balls.map((b) => (b.potted ? null : [round2(b.x), round2(b.y)])));
  if (recordFrames) snap();

  for (let step = 1; step <= MAX_STEPS; step++) {
    // 1. Move and slow down
    let moving = false;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.potted) continue;
      const sp = sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (sp === 0) continue;
      const slowed = sp - (ROLL_DECEL + DRAG * sp) * DT;
      if (slowed <= STOP_SPEED) { vx[i] = 0; vy[i] = 0; continue; }
      const k = slowed / sp;
      vx[i] *= k; vy[i] *= k;
      b.x += vx[i] * DT;
      b.y += vy[i] * DT;
      moving = true;
    }
    if (!cueHasHit && spin !== 0) spin *= 1 - 0.5 * DT; // spin wears off as the cue ball travels

    // 2. Pockets: a ball that drops in, or that slips past the cushion line through a mouth
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.potted) continue;
      let pocket = -1;
      for (let p = 0; p < POCKETS.length; p++) {
        const dx = b.x - POCKETS[p].x, dy = b.y - POCKETS[p].y;
        if (dx * dx + dy * dy < POCKET_CAPTURE_R * POCKET_CAPTURE_R) { pocket = p; break; }
      }
      if (pocket < 0 && (b.x < 0 || b.x > TABLE_L || b.y < 0 || b.y > TABLE_W)) pocket = nearestPocket(b.x, b.y);
      if (pocket >= 0) {
        b.potted = true;
        vx[i] = 0; vy[i] = 0;
        events.push({ t: "pot", ball: b.n, pocket });
      }
    }

    // 3. Cushions (straight rails, except across the pocket mouths) and pocket jaws
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.potted || (vx[i] === 0 && vy[i] === 0)) continue;
      let railed = false;
      const inCornerY = b.y < CORNER_GAP || b.y > TABLE_W - CORNER_GAP;
      const inMouthX = b.x < CORNER_GAP || b.x > TABLE_L - CORNER_GAP || (b.x > TABLE_L / 2 - SIDE_GAP && b.x < TABLE_L / 2 + SIDE_GAP);
      if (!inCornerY) {
        if (b.x < BALL_R && vx[i] < 0) { b.x = BALL_R; vx[i] = -vx[i] * CUSHION_RESTITUTION; vy[i] *= 0.95; railed = true; }
        else if (b.x > TABLE_L - BALL_R && vx[i] > 0) { b.x = TABLE_L - BALL_R; vx[i] = -vx[i] * CUSHION_RESTITUTION; vy[i] *= 0.95; railed = true; }
      }
      if (!inMouthX) {
        if (b.y < BALL_R && vy[i] < 0) { b.y = BALL_R; vy[i] = -vy[i] * CUSHION_RESTITUTION; vx[i] *= 0.95; railed = true; }
        else if (b.y > TABLE_W - BALL_R && vy[i] > 0) { b.y = TABLE_W - BALL_R; vy[i] = -vy[i] * CUSHION_RESTITUTION; vx[i] *= 0.95; railed = true; }
      }
      for (const j of JAWS) {
        const dx = b.x - j.x, dy = b.y - j.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < BALL_R * BALL_R && d2 > 1e-12) {
          const d = sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const vn = vx[i] * nx + vy[i] * ny;
          if (vn < 0) {
            vx[i] -= (1 + CUSHION_RESTITUTION) * vn * nx;
            vy[i] -= (1 + CUSHION_RESTITUTION) * vn * ny;
            railed = true;
          }
          b.x = j.x + nx * BALL_R;
          b.y = j.y + ny * BALL_R;
        }
      }
      if (railed) events.push({ t: "rail", ball: b.n });
    }

    // 4. Ball-ball collisions. All contacts in a step are solved together (a few rounds,
    //    each using the same velocities for every pair), so a hit spreads through a tight
    //    pack like a real break instead of shooting one ball out like a Newton's cradle.
    contacts.length = 0;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (a.potted) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (b.potted) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= MIN_D2 || d2 < 1e-12) continue;
        const d = sqrt(d2);
        contacts.push(i, j, dx / d, dy / d, d);
      }
    }
    if (contacts.length) {
      // Sequential impulses with accumulated clamping: each contact aims for its own bounce
      // (separating at e × its approach speed); repeated rounds converge on the solution
      // where every touching pair is resolved at once.
      const m = contacts.length / 5;
      for (let c = 0; c < m; c++) {
        const i = contacts[c * 5], j = contacts[c * 5 + 1], nx = contacts[c * 5 + 2], ny = contacts[c * 5 + 3];
        const rel0 = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
        target[c] = rel0 > 0 ? BALL_RESTITUTION * rel0 : 0;
        acc[c] = 0;
        if (rel0 > 0 && (balls[i].n === 0 || balls[j].n === 0)) {
          const bi = balls[i].n, bj = balls[j].n;
          events.push({ t: "hit", a: 0, b: bi === 0 ? bj : bi });
          if (cueHit < 0) { cueHit = bi === 0 ? i : j; cueSpinRel = rel0; }
        }
      }
      for (let iter = 0; iter < 24; iter++) {
        let change = 0;
        for (let c = 0; c < m; c++) {
          const i = contacts[c * 5], j = contacts[c * 5 + 1], nx = contacts[c * 5 + 2], ny = contacts[c * 5 + 3];
          const rel = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
          const next = acc[c] + (rel + target[c]) / 2;
          const clamped = next > 0 ? next : 0;
          const imp = clamped - acc[c];
          if (imp === 0) continue;
          acc[c] = clamped;
          vx[i] -= imp * nx; vy[i] -= imp * ny;
          vx[j] += imp * nx; vy[j] += imp * ny;
          change += imp > 0 ? imp : -imp;
        }
        if (change < 1e-6) break;
      }
      moving = true;
      // Follow keeps rolling forward, draw comes back, along the original line of the shot
      if (cueHit >= 0 && !cueHasHit) {
        if (spin !== 0) {
          const boost = spin * 0.55 * cueSpinRel;
          vx[cueHit] += shot.dx * boost;
          vy[cueHit] += shot.dy * boost;
        }
        cueHasHit = true;
      }
      cueHit = -1;
      // Separate overlapping balls
      for (let c = 0; c < contacts.length; c += 5) {
        const i = contacts[c], j = contacts[c + 1], nx = contacts[c + 2], ny = contacts[c + 3], d = contacts[c + 4];
        const push = (2 * BALL_R - d) / 2;
        balls[i].x -= nx * push; balls[i].y -= ny * push;
        balls[j].x += nx * push; balls[j].y += ny * push;
      }
    }

    if (recordFrames && step % FRAME_EVERY === 0) snap();
    if (!moving) break;
  }
  if (recordFrames) snap();
  return { balls: balls.map((b) => ({ ...b, x: round2(b.x), y: round2(b.y) })), events, frames };
}

export function nearestPocket(x: number, y: number) {
  let best = 0, bd = Infinity;
  for (let p = 0; p < POCKETS.length; p++) {
    const dx = x - POCKETS[p].x, dy = y - POCKETS[p].y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------- Racking ----------------

/** A legal 8-ball rack: apex on the foot spot, 8 in the middle, one solid and one stripe in the back corners. */
export function rack(rng: (max: number) => number = (m) => Math.floor(Math.random() * m)): Ball[] {
  const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
  const take = (arr: number[]) => arr.splice(rng(arr.length), 1)[0];
  const back1 = take(solids), back2 = take(stripes);
  const rest = [...solids, ...stripes];
  for (let i = rest.length - 1; i > 0; i--) { const j = rng(i + 1); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order: number[] = [];
  // rows of 1..5; positions index: row r, k in 0..r
  const spacing = 2 * BALL_R + 0.02;
  const rowDx = spacing * (sqrt(3) / 2);
  const balls: Ball[] = [{ n: 0, x: HEAD_STRING_X - 20, y: TABLE_W / 2, potted: false }];
  let ri = 0;
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k <= r; k++) {
      let num: number;
      if (r === 2 && k === 1) num = 8;
      else if (r === 4 && k === 0) num = back1;
      else if (r === 4 && k === 4) num = back2;
      else num = rest[ri++];
      order.push(num);
      balls.push({ n: num, x: FOOT_SPOT.x + r * rowDx, y: TABLE_W / 2 + (k - r / 2) * spacing, potted: false });
    }
  }
  return balls;
}

// ---------------- Rules (8-ball) ----------------

export type Group = "solids" | "stripes";
export type Side = 0 | 1;

export interface GameState {
  balls: Ball[];
  turn: Side;
  /** groups[side] once the table is no longer open */
  groups: [Group | null, Group | null];
  /** Next shot is the break */
  breakShot: boolean;
  /** The player to shoot may place the cue ball (anywhere; behind the head string on the break) */
  ballInHand: boolean;
  winner: Side | null;
  /** Why the last shot ended the way it did (for the message line) */
  last: { foul: string | null; potted: number[]; switched: boolean } | null;
  shots: number;
}

export const groupOf = (n: number): Group | null => (n >= 1 && n <= 7 ? "solids" : n >= 9 && n <= 15 ? "stripes" : null);
export const ballsLeft = (s: GameState, g: Group) => s.balls.filter((b) => !b.potted && groupOf(b.n) === g).length;

export function newGame(rng?: (max: number) => number, firstToBreak: Side = 0): GameState {
  return { balls: rack(rng), turn: firstToBreak, groups: [null, null], breakShot: true, ballInHand: true, winner: null, last: null, shots: 0 };
}

/** Balls the shooter may legally hit first */
export function legalTargets(s: GameState): number[] {
  const g = s.groups[s.turn];
  const on = s.balls.filter((b) => !b.potted && b.n !== 0);
  if (!g) return on.filter((b) => b.n !== 8).map((b) => b.n);
  const mine = on.filter((b) => groupOf(b.n) === g).map((b) => b.n);
  return mine.length ? mine : [8];
}

/** Is this a legal place to put the cue ball? */
export function canPlaceCue(s: GameState, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < BALL_R || x > TABLE_L - BALL_R || y < BALL_R || y > TABLE_W - BALL_R) return false;
  if (s.breakShot && x > HEAD_STRING_X) return false;
  return s.balls.every((b) => b.potted || b.n === 0 || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= 4 * BALL_R * BALL_R + 0.01);
}

/** Free spot for the cue ball when it has to come back after a scratch */
function respotCue(s: GameState): { x: number; y: number } {
  for (let dx = 0; dx < 200; dx += 3) {
    for (const x of [HEAD_STRING_X - dx, HEAD_STRING_X + dx]) {
      for (const y of [TABLE_W / 2, TABLE_W / 2 - 10, TABLE_W / 2 + 10]) if (canPlaceCue({ ...s, breakShot: false }, x, y)) return { x, y };
    }
  }
  return { x: HEAD_STRING_X, y: TABLE_W / 2 };
}

/**
 * Plays a shot under the rules. `cue` places the cue ball first when the shooter has ball in hand.
 * Returns the new state and the physics result (for the animation).
 */
export function playShot(s: GameState, shot: Shot, cue?: { x: number; y: number }, recordFrames = true): { state: GameState; sim: SimResult } {
  if (s.winner !== null) throw new Error("Game over");
  let balls = s.balls.map((b) => ({ ...b }));
  if (s.ballInHand && cue) {
    if (!canPlaceCue(s, cue.x, cue.y)) throw new Error("Can't place the cue ball there");
    balls = balls.map((b) => (b.n === 0 ? { ...b, x: cue.x, y: cue.y, potted: false } : b));
  }
  const sim = simulate(balls, shot, recordFrames);
  const me = s.turn, them = (1 - s.turn) as Side;
  const potted = sim.events.filter((e): e is Extract<PoolEvent, { t: "pot" }> => e.t === "pot").map((e) => e.ball);
  const firstHit = sim.events.find((e): e is Extract<PoolEvent, { t: "hit" }> => e.t === "hit")?.b ?? null;
  const firstHitIdx = sim.events.findIndex((e) => e.t === "hit");
  const railAfterHit = firstHitIdx >= 0 && sim.events.slice(firstHitIdx).some((e) => e.t === "rail");
  const targets = legalTargets(s);
  const groups: [Group | null, Group | null] = [s.groups[0], s.groups[1]];
  const myGroup = groups[me];
  const clearedBefore = myGroup !== null && ballsLeft(s, myGroup) === 0;

  let foul: string | null = null;
  if (potted.includes(0)) foul = "scratch";
  else if (firstHit === null) foul = "no_hit";
  else if (!targets.includes(firstHit)) foul = "wrong_ball";
  else if (potted.length === 0 && !railAfterHit) foul = "no_rail";

  const next: GameState = { ...s, balls: sim.balls, groups, breakShot: false, ballInHand: false, last: { foul, potted, switched: false }, shots: s.shots + 1 };

  // The black ball
  if (potted.includes(8)) {
    if (s.breakShot) next.winner = foul === "scratch" ? them : me; // 8 on the break wins, unless the cue ball went in too
    else next.winner = !foul && clearedBefore ? me : them;
    return { state: next, sim };
  }

  // Groups are decided by the first legally potted ball after the break
  if (!foul && !s.breakShot && myGroup === null) {
    const first = potted.map(groupOf).find((g) => g !== null) ?? null;
    if (first) {
      groups[me] = first;
      groups[them] = first === "solids" ? "stripes" : "solids";
    }
  }

  const g = groups[me];
  const pottedMine = g ? potted.some((n) => groupOf(n) === g) : potted.some((n) => groupOf(n) !== null);
  const keepTurn = !foul && pottedMine;
  if (!keepTurn) {
    next.turn = them;
    next.last!.switched = true;
  }
  if (foul) {
    next.ballInHand = true;
    if (potted.includes(0)) {
      const spot = respotCue(next);
      next.balls = next.balls.map((b) => (b.n === 0 ? { ...b, potted: false, x: spot.x, y: spot.y } : b));
    }
  }
  return { state: next, sim };
}
