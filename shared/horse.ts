/**
 * Đua Ngựa (horse racing): a race every minute, the same race for everyone.
 *
 * Each round shuffles a fixed set of win chances between the 8 horses and prices every horse
 * from its chance, so each one returns 94.5%–95% of what is bet on it. The server draws the
 * finishing order (with crypto randomness, weighted by those chances) when the round is made,
 * plus a seed for the animation. Neither leaves the server until the race starts; then every
 * screen plays the same race from the seed, and the horses cross the line in the drawn order.
 */

export const HORSE_BET_MS = 40_000;
export const HORSE_RACE_MS = 15_000;
export const HORSE_RESULT_MS = 5_000;
export const HORSE_ROUND_MS = HORSE_BET_MS + HORSE_RACE_MS + HORSE_RESULT_MS;
/** Betting closes this long before the gates open, so a slow request can't sneak in late */
export const HORSE_CLOSE_EARLY_MS = 1_000;
const HORSE_EPOCH = Date.UTC(2026, 0, 1);

export const HORSE_CHIPS = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];
/** Most one player can bet on one race, across all horses */
export const HORSE_MAX_PER_RACE = 5_000_000;
/** Payouts this big are announced in the chat */
export const HORSE_BIG_WIN = 1_000_000;

/**
 * Win chances in basis points (1/10000). Every round hands these out to the horses in a new order.
 * They add up to exactly 10000.
 */
export const HORSE_CHANCES = [2700, 2100, 1500, 1200, 900, 700, 500, 400];

/** The price for a chance, in tenths: floor(0.95 / p, to one decimal). ×3.5 is 35. The stake is included. */
export function horseOdds10(bp: number): number {
  return Math.floor(95_000 / bp);
}
/** What a winning bet pays back (stake included) */
export function horsePayout(amount: number, odds10: number): number {
  return Math.floor((amount * odds10) / 10);
}
/** The exact share a bet on a horse with this chance pays back on average */
export function horseRtp(bp: number): number {
  return (bp * horseOdds10(bp)) / 100_000;
}
export const HORSE_RTP_MIN = Math.min(...HORSE_CHANCES.map(horseRtp));
export const HORSE_RTP_MAX = Math.max(...HORSE_CHANCES.map(horseRtp));

export interface HorseInfo {
  name: { vi: string; en: string; zh: string };
  /** Saddle cloth colour and the number's colour on it */
  color: string;
  ink: string;
}

/** The stable. Horse i wears number i + 1. */
export const HORSES: HorseInfo[] = [
  { name: { vi: "Xích Thố", en: "Red Hare", zh: "赤兔" }, color: "#ef4444", ink: "#fff" },
  { name: { vi: "Ô Vân", en: "Black Cloud", zh: "烏雲" }, color: "#1f2937", ink: "#fff" },
  { name: { vi: "Bạch Long", en: "White Dragon", zh: "白龍" }, color: "#f8fafc", ink: "#111827" },
  { name: { vi: "Hỏa Mã", en: "Fire Horse", zh: "火馬" }, color: "#f97316", ink: "#fff" },
  { name: { vi: "Kim Phong", en: "Golden Wind", zh: "金風" }, color: "#facc15", ink: "#111827" },
  { name: { vi: "Thanh Long", en: "Azure Dragon", zh: "青龍" }, color: "#3b82f6", ink: "#fff" },
  { name: { vi: "Lục Bảo", en: "Emerald", zh: "翡翠" }, color: "#22c55e", ink: "#052e16" },
  { name: { vi: "Tử Điện", en: "Purple Bolt", zh: "紫電" }, color: "#a855f7", ink: "#fff" },
];
export const HORSE_COUNT = HORSES.length;

/** Round number and its timings for a moment in time. Races run back to back, all day. */
export function horseRoundAt(now: number) {
  const round = Math.floor((now - HORSE_EPOCH) / HORSE_ROUND_MS);
  const start = HORSE_EPOCH + round * HORSE_ROUND_MS;
  const raceStart = start + HORSE_BET_MS;
  return { round, start, raceStart, raceEnd: raceStart + HORSE_RACE_MS, end: start + HORSE_ROUND_MS };
}
export function horseRoundTimes(round: number) {
  return horseRoundAt(HORSE_EPOCH + round * HORSE_ROUND_MS);
}

/** `rand(n)` returns a whole number from 0 to n-1 */
type Rand = (n: number) => number;

/** A fair shuffle */
export function shuffled<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The finishing order: the winner is drawn by the horses' chances, then second from the rest by
 * their chances, and so on. `chances` are whole numbers (basis points), indexed by horse.
 */
export function drawOrder(chances: readonly number[], rand: Rand): number[] {
  const left = chances.map((_, i) => i);
  const order: number[] = [];
  while (left.length) {
    const total = left.reduce((a, h) => a + chances[h], 0);
    let r = rand(total);
    let k = 0;
    while (r >= chances[left[k]]) { r -= chances[left[k]]; k++; }
    order.push(left.splice(k, 1)[0]);
  }
  return order;
}

// ---------------------------------------------------------------------------------------------
// The race itself: the same seed and order make the same race on every screen.

/** A small fast seeded random generator (mulberry32), numbers in [0, 1) */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEP = 50; // ms between the points the race is worked out at
/** How far past the line a horse runs on while pulling up (as a share of the track) */
export const HORSE_RUN_ON = 0.06;

export interface RaceSim {
  /** When each horse (by index) crosses the line, in ms from the start */
  finish: number[];
  /** Horses in finishing order */
  order: number[];
  /** Share of the track a horse has covered at ms t (1 = the finish line, a bit more after) */
  progress(horse: number, t: number): number;
  /** Horses from first to last at ms t */
  standings(t: number): number[];
}

/**
 * Plays out a race. Every horse gets its own rhythm (gentle waves in its speed, a front-runner or a
 * closer, sometimes a late surge), scaled so it crosses the line exactly at its finishing time.
 * The winner crosses at 11.3–11.9 s and the others follow a fraction of a second apart, the second
 * often by a whisker.
 */
export function simulateRace(seed: number, order: readonly number[]): RaceSim {
  const rnd = seededRandom(seed);
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const finish: number[] = Array(order.length).fill(0);
  let t = between(11_300, 11_900);
  order.forEach((h, place) => {
    if (place === 1) t += rnd() < 0.4 ? between(20, 90) : between(110, 300);
    else if (place > 1) t += between(90, 330);
    finish[h] = Math.round(t);
  });

  const steps = Math.ceil(HORSE_RACE_MS / STEP);
  const cum: Float64Array[] = [];
  const total: number[] = [];
  for (let h = 0; h < order.length; h++) {
    const T = finish[h];
    const bias = between(-0.22, 0.22); // + runs early, - finishes strongly
    const a1 = between(0.08, 0.24), f1 = between(0.6, 1.6), p1 = between(0, Math.PI * 2);
    const a2 = between(0.03, 0.1), f2 = between(1.8, 3.6), p2 = between(0, Math.PI * 2);
    const surge = rnd() < 0.6 ? between(0.2, 0.5) : 0;
    const sc = between(0.55, 0.9) * T, sw = between(500, 1100);
    const speed = (ms: number) => {
      const u = ms / T;
      const v = 1 + bias * (1 - 2 * u) + a1 * Math.sin(2 * Math.PI * f1 * u + p1) + a2 * Math.sin(2 * Math.PI * f2 * u + p2)
        + surge * Math.exp(-(((ms - sc) / sw) ** 2));
      return (1 - Math.exp(-ms / 450)) * Math.max(0.25, v);
    };
    const c = new Float64Array(steps + 1);
    let prev = speed(0);
    for (let k = 1; k <= steps; k++) {
      const cur = speed(k * STEP);
      c[k] = c[k - 1] + ((prev + cur) / 2) * STEP;
      prev = cur;
    }
    cum.push(c);
    total.push(at(c, T));
  }

  function at(c: Float64Array, ms: number) {
    const x = Math.min(steps, Math.max(0, ms / STEP));
    const k = Math.min(steps - 1, Math.floor(x));
    return c[k] + (c[k + 1] - c[k]) * (x - k);
  }

  const progress = (h: number, ms: number) => {
    if (ms <= 0) return 0;
    const T = finish[h];
    if (ms < T) return Math.min(at(cum[h], ms) / total[h], 1 - 1e-9);
    return 1 + HORSE_RUN_ON * (1 - Math.exp(-(ms - T) / 600));
  };
  const standings = (ms: number) => {
    const done = order.filter((h) => finish[h] <= ms);
    const running = order.filter((h) => finish[h] > ms).sort((a, b) => progress(b, ms) - progress(a, ms) || a - b);
    return [...done, ...running];
  };
  return { finish, order: [...order], progress, standings };
}

/** What the commentator talks about at a moment: a new line every 1.5 s, the same for everyone */
export type RaceCall =
  | { kind: "off" }
  | { kind: "lead"; horse: number }
  | { kind: "surge"; horse: number }
  | { kind: "holds"; horse: number }
  | { kind: "chase"; horse: number }
  | { kind: "sprint"; close: boolean }
  | { kind: "won"; horse: number; photo: boolean };

export const RACE_CALL_MS = 1_500;
/** The gap between first and second (ms) that calls for the photo-finish camera */
export const PHOTO_FINISH_MS = 100;

export function raceCall(sim: RaceSim, ms: number): RaceCall {
  const [first, second] = sim.order;
  const photo = sim.finish[second] - sim.finish[first] < PHOTO_FINISH_MS;
  if (ms >= sim.finish[first]) return { kind: "won", horse: first, photo };
  const k = Math.floor(ms / RACE_CALL_MS);
  if (k === 0) return { kind: "off" };
  const now = sim.standings(k * RACE_CALL_MS);
  const before = sim.standings((k - 1) * RACE_CALL_MS);
  if (sim.finish[first] - k * RACE_CALL_MS < 2_200) {
    return { kind: "sprint", close: Math.abs(sim.progress(now[0], k * RACE_CALL_MS) - sim.progress(now[1], k * RACE_CALL_MS)) < 0.02 };
  }
  if (now[0] !== before[0] && k > 1) return { kind: "lead", horse: now[0] };
  let best = -1, gain = 1;
  now.forEach((h, place) => {
    const g = before.indexOf(h) - place;
    if (g > gain) { gain = g; best = h; }
  });
  if (best >= 0) return { kind: "surge", horse: best };
  return k % 2 ? { kind: "holds", horse: now[0] } : { kind: "chase", horse: now[1] };
}

// ---------------------------------------------------------------------------------------------
// What the server sends

export interface HorseBetView {
  id: number;
  round: number;
  horse: number;
  amount: number;
  odds10: number;
  status: "pending" | "won" | "lost";
  payout: number | null;
}

export interface HorseView {
  serverNow: number;
  round: number;
  start: number;
  raceStart: number;
  raceEnd: number;
  end: number;
  /** This round's price for each horse (tenths: 35 is ×3.5), by horse index */
  odds10: number[];
  /** Only once the gates open: the animation seed and the finishing order */
  race: { seed: number; order: number[] } | null;
  /** Everyone's bets this round, by horse index */
  pool: { amount: number; players: number }[];
  players: number;
  mine: HorseBetView[];
  /** Your bets on the last few races */
  history: HorseBetView[];
  /** Winners of the last races, newest first */
  winners: { round: number; horse: number; odds10: number }[];
  balance: number;
}
