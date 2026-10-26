/**
 * Darts: the board, scoring, the throw model, 501 rules, checkouts and the computer players.
 * Pure maths only (no DB, no crypto) so the client, the server and the tests share it.
 *
 * Coordinates are millimetres on a regulation board, centre (0, 0), x to the right and
 * y DOWN (like SVG). The 20 is straight up.
 */

// ---------------- The board ----------------

/** Segment numbers clockwise from the top */
export const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

/** Regulation radii in mm (each ring is [inner, outer): a dart exactly on a wire goes outwards) */
export const RADII = {
  bull: 6.35,
  outerBull: 15.9,
  trebleIn: 99,
  trebleOut: 107,
  doubleIn: 162,
  doubleOut: 170,
  /** The black number ring: the dart sticks but scores nothing; beyond it the dart misses the board */
  board: 225,
} as const;

export type Ring = "bull" | "outer" | "single" | "treble" | "double" | "out" | "miss";

export interface Hit {
  x: number;
  y: number;
  ring: Ring;
  /** Segment number (25 for either bull, 0 when nothing scored) */
  n: number;
  /** 0 nothing, 1 single, 2 double (incl. the bull), 3 treble */
  mult: number;
  score: number;
}

const round9 = (v: number) => Math.round(v * 1e9) / 1e9;

/** Clockwise angle from straight up, in degrees [0, 360) */
export function angleOf(x: number, y: number): number {
  let a = (Math.atan2(x, -y) * 180) / Math.PI;
  a = round9(a);
  if (a < 0) a += 360;
  if (a >= 360) a -= 360;
  return a;
}

/** Which segment an angle falls in (a wire belongs to the segment clockwise of it) */
export function segmentAt(angle: number): number {
  const idx = Math.floor((((angle + 9) % 360) + 360) % 360 / 18) % 20;
  return SEGMENTS[idx];
}

/** What a dart at (x, y) scores. Deterministic, including exactly on a wire. */
export function scoreAt(x: number, y: number): Omit<Hit, "x" | "y"> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ring: "miss", n: 0, mult: 0, score: 0 };
  const r = round9(Math.hypot(x, y));
  if (r < RADII.bull) return { ring: "bull", n: 25, mult: 2, score: 50 };
  if (r < RADII.outerBull) return { ring: "outer", n: 25, mult: 1, score: 25 };
  if (r >= RADII.board) return { ring: "miss", n: 0, mult: 0, score: 0 };
  if (r >= RADII.doubleOut) return { ring: "out", n: 0, mult: 0, score: 0 };
  const n = segmentAt(angleOf(x, y));
  if (r >= RADII.doubleIn) return { ring: "double", n, mult: 2, score: n * 2 };
  if (r >= RADII.trebleIn && r < RADII.trebleOut) return { ring: "treble", n, mult: 3, score: n * 3 };
  return { ring: "single", n, mult: 1, score: n };
}

export function hitAt(x: number, y: number): Hit {
  return { x, y, ...scoreAt(x, y) };
}

/** Short name: T20, D16, 5, BULL, 25, MISS */
export function hitLabel(h: Pick<Hit, "ring" | "n">): string {
  switch (h.ring) {
    case "bull": return "BULL";
    case "outer": return "25";
    case "treble": return `T${h.n}`;
    case "double": return `D${h.n}`;
    case "single": return String(h.n);
    default: return "MISS";
  }
}

/** The centre of a target written like a checkout ("T20", "D16", "S5", "5", "BULL", "25") */
export function targetPoint(code: string): { x: number; y: number } {
  const c = code.toUpperCase();
  if (c === "BULL" || c === "DB" || c === "50") return { x: 0, y: 0 };
  if (c === "25" || c === "SB") return { x: 0, y: -11 };
  const m = /^([SDT]?)(\d{1,2})$/.exec(c);
  const n = m ? Number(m[2]) : 20;
  const idx = Math.max(0, SEGMENTS.indexOf(n as (typeof SEGMENTS)[number]));
  const r = m?.[1] === "T" ? 103 : m?.[1] === "D" ? 166 : m?.[1] === "S" || !m?.[1] ? 134 : 134;
  const a = (idx * 18 * Math.PI) / 180;
  return { x: round9(r * Math.sin(a)), y: round9(-r * Math.cos(a)) };
}

// ---------------- The throw ----------------

export interface ThrowInput {
  /** Where the player aimed (mm) */
  x: number;
  y: number;
  /** Flick speed: 1 is perfect, below is too soft (lands low), above too hard (lands high) */
  power: number;
  /** Sideways part of the flick (horizontal / vertical speed): pulls the dart left or right */
  drift: number;
  /** How long the player held steady before letting go (ms) */
  holdMs: number;
}

/** The day's pub conditions for the Daily Challenge (the same for everyone) */
export interface Conditions {
  /** A slight draught: a steady push in mm */
  driftX: number;
  driftY: number;
  /** Multiplies the scatter (a lively crowd shakes the oche a little) */
  spread: number;
}
export const CALM: Conditions = { driftX: 0, driftY: 0, spread: 1 };

const MAX_AIM = 260;
const num = (v: unknown, def: number) => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : def;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Anything the client sends, made safe: finite numbers in sane ranges */
export function cleanThrow(raw: unknown): ThrowInput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let x = num(o.x, 0), y = num(o.y, 0);
  const r = Math.hypot(x, y);
  if (r > MAX_AIM) { x = (x / r) * MAX_AIM; y = (y / r) * MAX_AIM; }
  return {
    x, y,
    power: clamp(num(o.power, 1), 0.2, 2.5),
    drift: clamp(num(o.drift, 0), -1.5, 1.5),
    holdMs: clamp(num(o.holdMs, 0), 0, 10_000),
  };
}

/**
 * How far the arm sways (mm) after holding steady for `holdMs`: it settles over the first
 * ~0.8 s, stays steady until 1.3 s, then the arm tires and it grows again.
 * The client draws the crosshair sway with exactly this.
 */
export const STEADY_FROM_MS = 800;
export const STEADY_UNTIL_MS = 1300;
export function wobbleRadius(holdMs: number): number {
  const t = Math.max(0, holdMs);
  if (t < STEADY_FROM_MS) {
    const k = t / STEADY_FROM_MS;
    const ease = 1 - (1 - k) * (1 - k);
    return 22 - 17 * ease;
  }
  if (t <= STEADY_UNTIL_MS) return 5;
  return Math.min(32, 5 + ((t - STEADY_UNTIL_MS) / 1700) * 27);
}

/** Inside this much either side of 1, the flick speed is perfect */
export const POWER_SWEET = 0.15;
/** Inside this much sideways, the flick is straight */
export const DRIFT_SWEET = 0.12;
/** The best a human can do: scatter (one standard deviation, mm) with a perfect throw */
export const BASE_SIGMA = 7.6;

/** Where a throw is centred after the flick's errors, and how widely it scatters */
export function throwPlan(t: ThrowInput, cond: Conditions = CALM) {
  const pe = t.power - 1;
  const pOver = Math.max(0, Math.abs(pe) - POWER_SWEET);
  const dOver = Math.max(0, Math.abs(t.drift) - DRIFT_SWEET);
  // Too soft drops low (+y), too hard flies high
  const dy = -Math.sign(pe) * pOver * 110;
  const dx = Math.sign(t.drift) * dOver * 60;
  const wob = wobbleRadius(t.holdMs) * 0.5;
  const extra = pOver * 25;
  const sigma = Math.sqrt(BASE_SIGMA ** 2 + wob ** 2 + extra ** 2) * cond.spread;
  return { cx: t.x + dx + cond.driftX, cy: t.y + dy + cond.driftY, sigma };
}

/** A pair of independent standard normal numbers */
export type Gauss = () => [number, number];

/** Box–Muller from a uniform source in (0, 1) */
export function gaussFrom(uniform: () => number): Gauss {
  return () => {
    const u1 = Math.min(1 - 1e-12, Math.max(1e-12, uniform()));
    const u2 = uniform();
    const m = Math.sqrt(-2 * Math.log(u1));
    return [m * Math.cos(2 * Math.PI * u2), m * Math.sin(2 * Math.PI * u2)];
  };
}

const LAND_LIMIT = 400;

/** Where a dart centred on (cx, cy) with scatter sigma actually lands, and what it scores */
export function landAt(cx: number, cy: number, sigma: number, gauss: Gauss): Hit {
  const [g1, g2] = gauss();
  const s = Number.isFinite(sigma) ? Math.max(0, sigma) : BASE_SIGMA;
  let x = (Number.isFinite(cx) ? cx : 0) + (Number.isFinite(g1) ? g1 : 0) * s;
  let y = (Number.isFinite(cy) ? cy : 0) + (Number.isFinite(g2) ? g2 : 0) * s;
  x = Math.round(clamp(x, -LAND_LIMIT, LAND_LIMIT) * 100) / 100;
  y = Math.round(clamp(y, -LAND_LIMIT, LAND_LIMIT) * 100) / 100;
  return hitAt(x, y);
}

/** A player's throw: aim plus the flick's errors plus random scatter */
export function throwDart(raw: unknown, gauss: Gauss, cond: Conditions = CALM): Hit {
  const p = throwPlan(cleanThrow(raw), cond);
  return landAt(p.cx, p.cy, p.sigma, gauss);
}

/** How the flick felt, for the little feedback under the board */
export function flickVerdict(power: number): "soft" | "good" | "hard" {
  return power < 1 - POWER_SWEET ? "soft" : power > 1 + POWER_SWEET ? "hard" : "good";
}

// ---------------- Checkouts ----------------

interface Bed { code: string; score: number; double: boolean }
const bedsOf = (): Bed[] => {
  const out: Bed[] = [];
  for (let n = 20; n >= 1; n--) out.push({ code: `T${n}`, score: n * 3, double: false });
  out.push({ code: "25", score: 25, double: false }, { code: "BULL", score: 50, double: true });
  for (let n = 20; n >= 1; n--) out.push({ code: `S${n}`, score: n, double: false });
  for (let n = 20; n >= 1; n--) out.push({ code: `D${n}`, score: n * 2, double: true });
  return out;
};
const SETUP = bedsOf();
/** How hard each set-up bed is to hit (singles are big, trebles small; high numbers are where the dart already is) */
const SETUP_RANK = SETUP.map((b) => {
  const n = Number(b.code.slice(1));
  if (b.code === "25") return 8;
  if (b.code === "BULL") return 16;
  if (b.code[0] === "T") return 10 + (20 - n) * 0.6;
  if (b.code[0] === "S") return (20 - n) * 0.2;
  return 18 + (20 - n) * 0.2; // a double used to set up
});
/** The easiest bed for each score 1–60 (index into SETUP), or -1 */
const EASIEST = Array.from({ length: 61 }, (_, sc) => {
  let best = -1;
  SETUP.forEach((b, i) => { if (b.score === sc && (best < 0 || SETUP_RANK[i] < SETUP_RANK[best])) best = i; });
  return best;
});
const easiest = (sc: number) => (sc >= 1 && sc <= 60 ? EASIEST[sc] : -1);
/** Doubles in the order players like to finish on */
const FINISH_ORDER = [20, 16, 8, 18, 12, 10, 4, 14, 6, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1].map((n) => ({ code: `D${n}`, score: n * 2 }));
FINISH_ORDER.push({ code: "BULL", score: 50 });

const coCache = new Map<string, string[] | null>();

/** The usual way out from `rem` with `darts` darts left, e.g. 170 → T20 T20 BULL; null if there isn't one */
export function checkout(rem: number, darts = 3): string[] | null {
  if (!Number.isInteger(rem) || rem < 2 || rem > 170 || darts < 1) return null;
  const key = `${rem}:${darts}`;
  if (coCache.has(key)) return coCache.get(key)!;
  let found: string[] | null = null;
  outer: for (let k = 1; k <= Math.min(3, darts); k++) {
    for (const d of FINISH_ORDER) {
      const left = rem - d.score;
      if (left < 0) continue;
      if (k === 1) { if (left === 0) { found = [d.code]; break outer; } continue; }
    }
    if (k === 2) {
      // Two darts: a big bed then a favourite double (61 → T15 D8)
      let best = Infinity;
      for (const [di, d] of FINISH_ORDER.entries()) {
        const si = easiest(rem - d.score);
        if (si >= 0 && SETUP_RANK[si] + 1.5 * di < best) { best = SETUP_RANK[si] + 1.5 * di; found = [SETUP[si].code, d.code]; }
      }
      if (found) break outer;
    }
    if (k === 3) {
      // Three darts: the route with the friendliest beds (big trebles first, a favourite double
      // last), e.g. 141 → T20 T19 D12 rather than T17 BULL D20
      let best = Infinity;
      for (const [di, d] of FINISH_ORDER.entries()) {
        for (const [ai, a] of SETUP.entries()) {
          const left = rem - d.score - a.score;
          if (left <= 0) continue;
          const bi = easiest(left);
          if (bi < 0) continue;
          const cost = SETUP_RANK[ai] + SETUP_RANK[bi] + 1.5 * di;
          const [x, y] = a.score >= SETUP[bi].score ? [a, SETUP[bi]] : [SETUP[bi], a];
          if (cost < best) { best = cost; found = [x.code, y.code, d.code]; }
        }
      }
    }
  }
  // "S20" reads better as plain "20"
  const pretty = found?.map((c) => c.replace(/^S/, "")) ?? null;
  coCache.set(key, pretty);
  return pretty;
}

// ---------------- 501 ----------------

export type Seat = 0 | 1;

export interface Visit { by: Seat; darts: Hit[]; total: number; bust: boolean; checkout: boolean }

export interface X01State {
  start: number;
  /** Legs needed to win the match (best of 3 → 2) */
  legsToWin: number;
  scores: [number, number];
  legs: [number, number];
  turn: Seat;
  legStarter: Seat;
  /** Darts thrown so far in the current visit */
  visit: Hit[];
  /** The score at the start of this visit (a bust goes back to it) */
  visitStart: number;
  /** Darts still stuck in the board (taken out when the next visit starts) */
  board: Hit[];
  lastVisit: Visit | null;
  winner: Seat | null;
  /** For averages: darts thrown and points scored by each player over the match */
  darts: [number, number];
  points: [number, number];
  /** 180s hit this match */
  max: [number, number];
}

export const START_SCORE = 501;

export function newX01(legsToWin = 2, starter: Seat = 0): X01State {
  return {
    start: START_SCORE, legsToWin, scores: [START_SCORE, START_SCORE], legs: [0, 0], turn: starter, legStarter: starter,
    visit: [], visitStart: START_SCORE, board: [], lastVisit: null, winner: null, darts: [0, 0], points: [0, 0], max: [0, 0],
  };
}

export type DartEvent = "scored" | "visit" | "bust" | "leg" | "match";

/** Applies one dart for the player whose turn it is. Returns a new state and what happened. */
export function applyDart(s0: X01State, hit: Hit): { state: X01State; event: DartEvent; visit?: Visit } {
  if (s0.winner !== null) return { state: s0, event: "match" };
  const s: X01State = {
    ...s0, scores: [...s0.scores], legs: [...s0.legs], darts: [...s0.darts], points: [...s0.points], max: [...s0.max],
    visit: [...s0.visit, hit], board: s0.visit.length === 0 ? [hit] : [...s0.board, hit],
  };
  const p = s.turn;
  s.darts[p]++;
  const rem = s.scores[p] - hit.score;
  const endVisit = (bust: boolean, checkoutHit: boolean): Visit => {
    const total = bust ? 0 : s.visit.reduce((a, h) => a + h.score, 0);
    const v: Visit = { by: p, darts: s.visit, total, bust, checkout: checkoutHit };
    if (!bust) s.points[p] += total;
    if (total === 180) s.max[p]++;
    s.lastVisit = v;
    s.visit = [];
    return v;
  };
  if (rem < 0 || rem === 1 || (rem === 0 && hit.mult !== 2)) {
    s.scores[p] = s.visitStart;
    const v = endVisit(true, false);
    s.turn = (1 - p) as Seat;
    s.visitStart = s.scores[s.turn];
    return { state: s, event: "bust", visit: v };
  }
  s.scores[p] = rem;
  if (rem === 0) {
    const v = endVisit(false, true);
    s.legs[p]++;
    if (s.legs[p] >= s.legsToWin) {
      s.winner = p;
      return { state: s, event: "match", visit: v };
    }
    s.legStarter = (1 - s.legStarter) as Seat;
    s.turn = s.legStarter;
    s.scores = [s.start, s.start];
    s.visitStart = s.start;
    return { state: s, event: "leg", visit: v };
  }
  if (s.visit.length >= 3) {
    const v = endVisit(false, false);
    s.turn = (1 - p) as Seat;
    s.visitStart = s.scores[s.turn];
    return { state: s, event: "visit", visit: v };
  }
  return { state: s, event: "scored" };
}

/** Three-dart average so far */
export function average(s: X01State, p: Seat): number {
  return s.darts[p] ? Math.round((s.points[p] / s.darts[p]) * 300) / 100 : 0;
}

// ---------------- The computer ----------------

export type BotLevel = "easy" | "medium" | "hard";

/** The pub regulars you can play. Sigma is their scatter in mm (measured averages in the tests). */
export const BOTS: Record<BotLevel, { name: string; sigma: number; avg: number; icon: string }> = {
  easy: { name: "Bà Năm", sigma: 24, avg: 35, icon: "👵" },
  medium: { name: "Anh Tư", sigma: 15, avg: 54, icon: "🧔" },
  hard: { name: "Big Jock", sigma: 9.5, avg: 78, icon: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
};
export const isBotLevel = (v: unknown): v is BotLevel => v === "easy" || v === "medium" || v === "hard";

/** Doubles the computer likes to leave for itself */
const LEAVES = [40, 32, 16, 36, 24, 20, 8, 12, 28, 18, 10, 6, 4, 2];

/** What the computer (or a sensible player) aims at with `rem` left and `dartsLeft` in hand */
export function botTarget(rem: number, dartsLeft: number): string {
  const co = rem <= 170 ? checkout(rem, dartsLeft) : null;
  if (co) return co[0];
  if (rem > 100) return "T20";
  // Set up a nice double with a single
  for (const leave of LEAVES) {
    const need = rem - leave;
    if (need >= 1 && need <= 20) return `S${need}`;
  }
  if (rem > 60) return "T20";
  return rem > 40 ? `S${Math.min(20, rem - 40)}` : "S1";
}

/** One dart by the computer */
export function botDart(level: BotLevel, rem: number, dartsLeft: number, gauss: Gauss): Hit {
  const t = targetPoint(botTarget(rem, dartsLeft));
  return landAt(t.x, t.y, BOTS[level].sigma, gauss);
}

// ---------------- Online play ----------------

/** Stakes an online darts table can be played for (0 = friendly) */
export const DARTS_STAKES = [0, 1000, 10000, 50000, 100000, 500000, 1000000];
export const DARTS_EMOTES = ["👍", "🔥", "😂", "😮", "😡", "🍺", "👏", "🎯"];
/** Time to throw each dart online */
export const DARTS_DART_MS = 25_000;
/** Legs a table can be: best of 1 or best of 3 */
export const DARTS_LEGS = [1, 3] as const;

export interface DartsTable { code: string; stake: number; legs: number; host: string; guest?: string; status: "waiting" | "playing" }

export type DartsServerMsg =
  | {
      t: "state";
      code: string;
      stake: number;
      legs: number;
      seat: Seat | null;
      names: [string, string | null];
      status: "waiting" | "playing" | "finished";
      game: X01State | null;
      msLeft: number | null;
      online: [boolean, boolean];
      spectators: number;
      result: { winner: Seat; reason: string; payout: number } | null;
      /** A rematch table someone opened after this game */
      rematch: { code: string; by: Seat } | null;
    }
  | { t: "dart"; by: Seat; hit: Hit; event: DartEvent; visit?: Visit; game: X01State; timeout?: boolean }
  | { t: "aim"; x: number; y: number; hold: number }
  | { t: "emote"; from: Seat | null; e: string }
  | { t: "error"; message: string }
  | { t: "closed"; reason: string };

// ---------------- Practice reward & Daily Challenge ----------------

/** The first win of the day against Anh Tư or Big Jock (Vietnam time) earns this */
export const PRACTICE_WIN_BONUS = 10_000;
export const PRACTICE_BONUS_LEVELS: BotLevel[] = ["medium", "hard"];

export const DAILY_DARTS = 9;
/** Paid at Vietnam midnight to the top three ranked scores of the day */
export const DAILY_PRIZES = [500_000, 200_000, 100_000];

/** A small stable hash of a string → [0, 1) numbers */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** The day's conditions: the same draught and crowd for every player that day */
export function dailyConditions(day: string): Conditions {
  const r = seeded(`darts:${day}`);
  const strength = 2 + r() * 6; // 2–8 mm
  const dir = r() * Math.PI * 2;
  return {
    driftX: Math.round(Math.cos(dir) * strength * 10) / 10,
    driftY: Math.round(Math.sin(dir) * strength * 10) / 10,
    spread: Math.round((0.95 + r() * 0.2) * 100) / 100,
  };
}

export interface DailyEntry { rank: number; username: string; avatarUrl: string | null; score: number; darts: number }
export interface DailyAttempt { darts: Hit[]; score: number; done: boolean }
export interface DailyView {
  day: string;
  endsAt: string;
  conditions: Conditions;
  prizes: number[];
  top: DailyEntry[];
  me: { ranked: DailyAttempt | null; rank: number | null; practice: DailyAttempt | null };
  yesterday: { day: string; winners: { username: string; score: number; prize: number }[] } | null;
}
