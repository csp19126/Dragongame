/**
 * Đua Ngựa (horse racing): a race every minute, the same race for everyone.
 *
 * Each round shuffles a fixed set of win chances between the 8 horses. The server draws the
 * finishing order (crypto randomness) by those chances the Plackett–Luce way: the winner by the
 * chances, second from the rest by their chances, and so on. Four kinds of bet are priced from the
 * exact chance of that bet coming in (worked out with exact fractions), so every bet pays back
 * HORSE_RTP_MIN–HORSE_RTP_MAX of what is bet on it on average:
 *   WIN (1st), TOP 2, TOP 3, and FORECAST (the exact 1st and 2nd).
 * The order and an animation seed stay on the server until the gates open; then every screen plays
 * the same race from the seed, and the horses cross the line in the drawn order.
 */

export const HORSE_BET_MS = 35_000;
export const HORSE_RACE_MS = 20_000;
export const HORSE_RESULT_MS = 5_000;
export const HORSE_ROUND_MS = HORSE_BET_MS + HORSE_RACE_MS + HORSE_RESULT_MS;
/** Betting closes this long before the gates open, so a slow request can't sneak in late */
export const HORSE_CLOSE_EARLY_MS = 1_000;
const HORSE_EPOCH = Date.UTC(2026, 0, 1);

export const HORSE_CHIPS = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];
/** Most one player can bet on one race, across all bets */
export const HORSE_MAX_PER_RACE = 5_000_000;
/** Most separate bets (lines on the slip) one placement can carry */
export const HORSE_MAX_LINES = 40;
/** Payouts this big are announced in the chat */
export const HORSE_BIG_WIN = 1_000_000;
/** The track is this long (only for the distance boards; the race is timed, not measured) */
export const HORSE_TRACK_M = 1600;

/**
 * Win chances in basis points (1/10000). Every round hands these out to the horses in a new order.
 * They add up to exactly 10000.
 */
export const HORSE_CHANCES = [2700, 2100, 1500, 1200, 900, 700, 500, 400];

// ---------------------------------------------------------------------------------------------
// Bet types and prices

export type HorseBetType = "win" | "top2" | "top3" | "forecast";
export const HORSE_BET_TYPES: HorseBetType[] = ["win", "top2", "top3", "forecast"];

/** A fraction of two big whole numbers, so the chances are exact */
interface Frac { n: bigint; d: bigint }
const gcd = (a: bigint, b: bigint): bigint => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
const frac = (n: bigint, d: bigint): Frac => { const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const toNum = (f: Frac) => Number(f.n) / Number(f.d);

export interface HorseExact {
  win: Frac[];
  top2: Frac[];
  top3: Frac[];
  /** forecast[i][j]: i first and j second (the diagonal is 0) */
  forecast: Frac[][];
}

/**
 * The exact chance of every bet, from the win chances (basis points, by horse):
 *   win i        = p_i
 *   top 2 i      = p_i + Σ_{j≠i} p_j · p_i / (1 − p_j)
 *   top 3 i      = top 2 i + Σ over ordered pairs (a, b) without i of p_a · p_b/(1 − p_a) · p_i/(1 − p_a − p_b)
 *   forecast i→j = p_i · p_j / (1 − p_i)
 */
export function horseExact(chances: readonly number[]): HorseExact {
  const B = 10000n;
  const n = chances.length;
  const c = chances.map(BigInt);
  const p = c.map((x) => frac(x, B));
  // p_j / (1 - p_i) = c_j / (B - c_i)
  const forecast = c.map((ci, i) => c.map((cj, j) => (i === j ? frac(0n, 1n) : mul(p[i], frac(cj, B - ci)))));
  const top2 = p.map((pi, i) => {
    let s = pi;
    for (let j = 0; j < n; j++) if (j !== i) s = add(s, forecast[j][i]);
    return s;
  });
  const top3 = top2.map((t2, i) => {
    let s = t2;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b || a === i || b === i) continue;
      s = add(s, mul(forecast[a][b], frac(c[i], B - c[a] - c[b])));
    }
    return s;
  });
  return { win: p, top2, top3, forecast };
}

/** Odds in hundredths (351 = ×3.51, stake included): floor(0.95 / chance, to two decimals), at least ×1.01 */
function oddsFor(f: Frac): number {
  if (f.n === 0n) return 0;
  return Math.max(101, Number((95n * f.d) / f.n));
}

export interface HorseMarket {
  /** Odds in hundredths, by horse */
  win: number[];
  top2: number[];
  top3: number[];
  /** forecast[i][j]: i first, j second; 0 on the diagonal */
  forecast: number[][];
}

const markets = new Map<string, { market: HorseMarket; probs: HorseProbs }>();
export interface HorseProbs { win: number[]; top2: number[]; top3: number[]; forecast: number[][] }

function build(chances: readonly number[]) {
  const key = chances.join(",");
  let m = markets.get(key);
  if (!m) {
    const x = horseExact(chances);
    m = {
      market: { win: x.win.map(oddsFor), top2: x.top2.map(oddsFor), top3: x.top3.map(oddsFor), forecast: x.forecast.map((r) => r.map(oddsFor)) },
      probs: { win: x.win.map(toNum), top2: x.top2.map(toNum), top3: x.top3.map(toNum), forecast: x.forecast.map((r) => r.map(toNum)) },
    };
    if (markets.size > 5000) markets.clear();
    markets.set(key, m);
  }
  return m;
}
/** Every price for a round (by its win chances) */
export function horseMarket(chances: readonly number[]): HorseMarket { return build(chances).market; }
/** The same chances as floating point numbers, for showing and testing */
export function horseProbs(chances: readonly number[]): HorseProbs { return build(chances).probs; }

/** The locked price of one bet, or 0 if it isn't a bet */
export function horseBetOdds(m: HorseMarket, type: HorseBetType, horse: number, horse2?: number | null): number {
  if (type === "forecast") return horse2 == null || horse2 === horse ? 0 : m.forecast[horse]?.[horse2] ?? 0;
  return m[type][horse] ?? 0;
}

/** Whether a bet came in, for a finishing order */
export function horseBetWins(type: HorseBetType, horse: number, horse2: number | null | undefined, order: readonly number[]): boolean {
  switch (type) {
    case "win": return order[0] === horse;
    case "top2": return order.slice(0, 2).includes(horse);
    case "top3": return order.slice(0, 3).includes(horse);
    case "forecast": return order[0] === horse && order[1] === horse2;
  }
}

/** What a winning bet pays back (stake included); odds in hundredths */
export function horsePayout(amount: number, odds100: number): number {
  return Math.floor((amount * odds100) / 100);
}

/**
 * The lowest and highest average return of any single bet in any round. The prices depend only
 * on which chances the horses get, and every round uses the same set, so going through every
 * horse (and every pair, for forecasts) of one round covers every round.
 */
export function horseRtpRange(chances: readonly number[] = HORSE_CHANCES) {
  const { market: m, probs: p } = build(chances);
  let min = Infinity, max = -Infinity;
  const see = (prob: number, odds: number) => { const r = (prob * odds) / 100; min = Math.min(min, r); max = Math.max(max, r); };
  for (let i = 0; i < chances.length; i++) {
    see(p.win[i], m.win[i]); see(p.top2[i], m.top2[i]); see(p.top3[i], m.top3[i]);
    for (let j = 0; j < chances.length; j++) if (i !== j) see(p.forecast[i][j], m.forecast[i][j]);
  }
  return { min, max };
}
const RANGE = horseRtpRange();
/** The figures in the rules: every bet returns at least this on average (rounded down to 0.01%)… */
export const HORSE_RTP_MIN = Math.floor(RANGE.min * 10000) / 10000;
/** …and never more than this */
export const HORSE_RTP_MAX = 0.95;

// ---------------------------------------------------------------------------------------------
// The stable

export type RunStyle = "front" | "stalker" | "closer";
export interface HorseInfo {
  name: { vi: string; en: string; zh: string };
  /** Silks and saddle cloth colour, and the number's colour on it */
  color: string;
  ink: string;
  /** Coat and mane */
  coat: string;
  mane: string;
  style: RunStyle;
  bio: { vi: string; en: string; zh: string };
}

/** The stable. Horse i wears number i + 1. */
export const HORSES: HorseInfo[] = [
  {
    name: { vi: "Xích Thố", en: "Red Hare", zh: "赤兔" }, color: "#ef4444", ink: "#fff", coat: "#9a3412", mane: "#431407", style: "front",
    bio: { vi: "Lao ra khỏi cổng như tia lửa và thích dẫn từ đầu đến cuối.", en: "Bursts from the gate like a spark and loves to lead all the way.", zh: "出閘如火花，最愛一路領跑到底。" },
  },
  {
    name: { vi: "Ô Vân", en: "Black Cloud", zh: "烏雲" }, color: "#1f2937", ink: "#fff", coat: "#1c1917", mane: "#000000", style: "closer",
    bio: { vi: "Thong thả ở cuối đoàn rồi ập tới như cơn giông ở đoạn cuối.", en: "Sits quietly at the back, then storms home like a thundercloud.", zh: "先在後方按兵不動，最後如烏雲壓境般殺到。" },
  },
  {
    name: { vi: "Bạch Long", en: "White Dragon", zh: "白龍" }, color: "#f8fafc", ink: "#111827", coat: "#d6d3d1", mane: "#f5f5f4", style: "stalker",
    bio: { vi: "Bám sát nhóm dẫn đầu, chờ đúng thời điểm để vượt lên.", en: "Tracks the leaders and pounces at just the right moment.", zh: "緊跟領先群，看準時機一舉超前。" },
  },
  {
    name: { vi: "Hỏa Mã", en: "Fire Horse", zh: "火馬" }, color: "#f97316", ink: "#fff", coat: "#b45309", mane: "#7c2d12", style: "front",
    bio: { vi: "Nóng tính, lúc nào cũng muốn phi nước đại ngay từ đầu.", en: "Hot-headed and always wants to go flat out from the start.", zh: "脾氣火爆，一開跑就想全速衝刺。" },
  },
  {
    name: { vi: "Kim Phong", en: "Golden Wind", zh: "金風" }, color: "#facc15", ink: "#111827", coat: "#ca8a04", mane: "#fef3c7", style: "stalker",
    bio: { vi: "Sải chân đều như gió, hiếm khi bị bỏ lại phía sau.", en: "Smooth as the wind and rarely left behind.", zh: "步伐如風般平穩，很少被甩在後頭。" },
  },
  {
    name: { vi: "Thanh Long", en: "Azure Dragon", zh: "青龍" }, color: "#3b82f6", ink: "#fff", coat: "#57534e", mane: "#1c1917", style: "closer",
    bio: { vi: "Càng về cuối càng khỏe, khán giả gọi là “rồng lướt sóng”.", en: "Gets stronger the further it goes: the crowd calls it the wave-rider.", zh: "越跑越強，觀眾稱牠為「破浪青龍」。" },
  },
  {
    name: { vi: "Lục Bảo", en: "Emerald", zh: "翡翠" }, color: "#22c55e", ink: "#052e16", coat: "#78350f", mane: "#292524", style: "stalker",
    bio: { vi: "Bền bỉ và khôn ngoan, luôn tìm được khe hở trong đoàn ngựa.", en: "Tough and clever, always finds a gap in the pack.", zh: "耐力十足又聰明，總能在馬群中找到空隙。" },
  },
  {
    name: { vi: "Tử Điện", en: "Purple Bolt", zh: "紫電" }, color: "#a855f7", ink: "#fff", coat: "#44302a", mane: "#0c0a09", style: "closer",
    bio: { vi: "Một tia chớp tím ở 200 mét cuối cùng.", en: "A purple flash over the final 200 metres.", zh: "最後 200 公尺的一道紫色閃電。" },
  },
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
 * The finishing order (Plackett–Luce): the winner is drawn by the horses' chances, then second
 * from the rest by their chances, and so on. `chances` are whole numbers (basis points), by horse.
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
export const HORSE_RUN_ON = 0.05;
/** The winner crosses the line between these times (ms after the off) */
export const HORSE_WIN_FROM = 14_600;
export const HORSE_WIN_TO = 15_200;
/** The replay of the finish starts this long after the off and lasts HORSE_REPLAY_MS */
export const HORSE_REPLAY_AT = 18_600;
export const HORSE_REPLAY_MS = 3_000;
/** First and second this close (ms at the line) is "a neck": the cameras slow down and zoom in */
export const NECK_MS = 180;
/** …and this close calls for the photo-finish camera */
export const PHOTO_FINISH_MS = 100;

export interface RaceSim {
  /** When each horse (by index) crosses the line, in ms of race time */
  finish: number[];
  /** Horses in finishing order */
  order: number[];
  /** Share of the track a horse has covered at race time t (1 = the finish line, a bit more after) */
  progress(horse: number, t: number): number;
  /** Horses from first to last at race time t */
  standings(t: number): number[];
}

/**
 * Plays out a race. Every horse runs to its style (front-runners go early and tire, closers save
 * it for the end, stalkers sit just behind and kick late), with gentle waves in its speed, scaled
 * so it crosses the line exactly at its finishing time. The winner crosses at 14.6–15.2 s and the
 * others follow a fraction of a second apart, the second often by a whisker.
 */
export function simulateRace(seed: number, order: readonly number[]): RaceSim {
  const rnd = seededRandom(seed);
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const finish: number[] = Array(order.length).fill(0);
  let t = between(HORSE_WIN_FROM, HORSE_WIN_TO);
  order.forEach((h, place) => {
    if (place === 1) t += rnd() < 0.3 ? between(20, 90) : between(110, 300);
    else if (place > 1) t += between(90, 330);
    finish[h] = Math.round(t);
  });

  const steps = Math.ceil(HORSE_RACE_MS / STEP);
  const cum: Float64Array[] = [];
  const total: number[] = [];
  for (let h = 0; h < order.length; h++) {
    const T = finish[h];
    const style = HORSES[h]?.style ?? "stalker";
    // + runs early and tires, - saves it for a late run
    const bias = style === "front" ? between(0.12, 0.22) : style === "closer" ? between(-0.24, -0.14) : between(-0.05, 0.06);
    const a1 = between(0.05, 0.16), f1 = between(0.6, 1.6), p1 = between(0, Math.PI * 2);
    const a2 = between(0.02, 0.07), f2 = between(1.8, 3.6), p2 = between(0, Math.PI * 2);
    const surge = style === "front" ? (rnd() < 0.3 ? between(0.1, 0.25) : 0)
      : style === "closer" ? (rnd() < 0.9 ? between(0.3, 0.55) : 0) : (rnd() < 0.75 ? between(0.2, 0.45) : 0);
    const sc = (style === "front" ? between(0.2, 0.5) : style === "closer" ? between(0.74, 0.92) : between(0.58, 0.8)) * T;
    const sw = between(600, 1200);
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

/** How close first and second were at the line */
export function raceFinish(sim: RaceSim) {
  const [first, second] = sim.order;
  const gap = sim.finish[second] - sim.finish[first];
  return { at: sim.finish[first], gap, neck: gap < NECK_MS, photo: gap < PHOTO_FINISH_MS };
}

/**
 * The race clock everyone watches. Normally race time = time since the off. When first and second
 * are within a neck, the last 1.2 s before the line play at half speed, a photo finish freezes on
 * the line for 0.7 s, and then the clock runs fast (×2.4) until it has caught up again, well before
 * the replay. It's the same function of the clock for everyone, and it never runs backwards.
 */
export function raceClock(sim: RaceSim, t: number): number {
  const f = raceFinish(sim);
  if (!f.neck) return t;
  const a = f.at - 1200;
  if (t <= a) return t;
  const slowEnd = a + 1200 / 0.5;
  if (t <= slowEnd) return a + (t - a) * 0.5;
  const freezeEnd = slowEnd + (f.photo ? 700 : 0);
  if (t <= freezeEnd) return f.at;
  const catchUp = (2.4 * freezeEnd - f.at) / 1.4;
  if (t <= catchUp) return f.at + (t - freezeEnd) * 2.4;
  return t;
}
/** Real time (since the off) when the race clock has caught up again */
export function raceClockEnd(sim: RaceSim): number {
  const f = raceFinish(sim);
  if (!f.neck) return f.at;
  const freezeEnd = f.at - 1200 + 2400 + (f.photo ? 700 : 0);
  return (2.4 * freezeEnd - f.at) / 1.4;
}
/** During the replay: the race time shown (the last 1.8 s before the line to 0.6 s after, at 0.8× speed) */
export function replayClock(sim: RaceSim, t: number): number | null {
  if (t < HORSE_REPLAY_AT || t >= HORSE_REPLAY_AT + HORSE_REPLAY_MS) return null;
  return sim.finish[sim.order[0]] - 1800 + (t - HORSE_REPLAY_AT) * (2400 / HORSE_REPLAY_MS);
}

export type RaceMode = "gate" | "live" | "replay" | "after";
export interface RaceShot {
  mode: RaceMode;
  /** Race time to show */
  d: number;
  /** 0..1: how far the camera has zoomed in on a close finish (1 in the replay) */
  zoom: number;
  /** The photo-finish freeze frame */
  freeze: boolean;
  /** 0..1: the camera flash as the freeze starts */
  flash: number;
}

/** What everyone's screen shows `t` ms after the off (negative: still at the gate) */
export function raceShot(sim: RaceSim | null, t: number): RaceShot {
  if (!sim || t <= 0) return { mode: "gate", d: 0, zoom: 0, freeze: false, flash: 0 };
  const r = replayClock(sim, t);
  if (r !== null) return { mode: "replay", d: r, zoom: 1, freeze: false, flash: 0 };
  if (t >= HORSE_REPLAY_AT + HORSE_REPLAY_MS) return { mode: "after", d: HORSE_REPLAY_AT, zoom: 0, freeze: false, flash: 0 };
  const f = raceFinish(sim);
  const d = raceClock(sim, t);
  if (!f.neck) return { mode: "live", d, zoom: 0, freeze: false, flash: 0 };
  const a = f.at - 1200;
  const zoom = Math.max(0, Math.min(1, (t - a) / 400, (raceClockEnd(sim) - t) / 600));
  const freezeAt = a + 2400;
  const freeze = f.photo && t >= freezeAt && t < freezeAt + 700;
  return { mode: "live", d, zoom, freeze, flash: freeze ? Math.max(0, 1 - (t - freezeAt) / 300) : 0 };
}

/** What the commentator talks about at a moment: a new line every 1.5 s of race time, the same for everyone */
export type RaceCall =
  | { kind: "off" }
  | { kind: "lead"; horse: number }
  | { kind: "neck"; horse: number; other: number }
  | { kind: "closer"; horse: number }
  | { kind: "fade"; horse: number }
  | { kind: "surge"; horse: number }
  | { kind: "holds"; horse: number }
  | { kind: "chase"; horse: number }
  | { kind: "sprint"; close: boolean; horse: number }
  | { kind: "won"; horse: number; photo: boolean };

export const RACE_CALL_MS = 1_500;

/** `favourite` is the horse with the shortest win price, if you want the commentator to watch it */
export function raceCall(sim: RaceSim, ms: number, favourite?: number): RaceCall {
  const f = raceFinish(sim);
  const first = sim.order[0];
  if (ms >= f.at) return { kind: "won", horse: first, photo: f.photo };
  const k = Math.floor(ms / RACE_CALL_MS);
  if (k === 0) return { kind: "off" };
  const T = k * RACE_CALL_MS;
  const now = sim.standings(T);
  const before = sim.standings(T - RACE_CALL_MS);
  const gapTop = sim.progress(now[0], T) - sim.progress(now[1], T);
  if (f.at - T < 2_200) return { kind: "sprint", close: gapTop < 0.015, horse: now[0] };
  if (now[0] !== before[0] && k > 1) return { kind: "lead", horse: now[0] };
  if (favourite != null && k >= 3) {
    const was = before.indexOf(favourite), is = now.indexOf(favourite);
    if (is >= 4 && is > was) return { kind: "fade", horse: favourite };
  }
  let best = -1, gain = 1;
  now.forEach((h, place) => {
    const g = before.indexOf(h) - place;
    if (g > gain || (g === gain && best >= 0 && HORSES[h]?.style === "closer" && HORSES[best]?.style !== "closer")) { gain = g; best = h; }
  });
  if (best >= 0) return HORSES[best]?.style === "closer" && T > f.at * 0.45 ? { kind: "closer", horse: best } : { kind: "surge", horse: best };
  if (gapTop < 0.006 && k > 1) return { kind: "neck", horse: now[0], other: now[1] };
  return k % 2 ? { kind: "holds", horse: now[0] } : { kind: "chase", horse: now[1] };
}

// ---------------------------------------------------------------------------------------------
// Cheers: emoji everyone watching can send during the race (no coins involved)

export const HORSE_CHEERS = ["📣", "🔥", "🐎", "💰"] as const;
export type HorseCheerEmoji = (typeof HORSE_CHEERS)[number];
/** At most one cheer per player this often, and this many per race */
export const HORSE_CHEER_GAP_MS = 700;
export const HORSE_CHEERS_PER_RACE = 30;

// ---------------------------------------------------------------------------------------------
// What the server sends

export interface HorseBetView {
  id: number;
  round: number;
  type: HorseBetType;
  horse: number;
  /** Second place, for a forecast */
  horse2: number | null;
  amount: number;
  /** Locked price in hundredths */
  odds100: number;
  status: "pending" | "won" | "lost";
  payout: number | null;
}

export interface HorseForm {
  /** Finishing places (1 = won) in the last races, newest first, by horse */
  last: number[][];
  /** Wins today (Vietnam time), by horse */
  winsToday: number[];
}

export interface HorseView {
  serverNow: number;
  round: number;
  start: number;
  raceStart: number;
  raceEnd: number;
  end: number;
  /** This round's prices (hundredths) */
  odds: HorseMarket;
  /** Only once the gates open: the animation seed and the finishing order */
  race: { seed: number; order: number[] } | null;
  /** Everyone's bets this round, by the horse picked (first pick for a forecast) */
  pool: { amount: number; players: number }[];
  /** A few of the players who backed each horse */
  backers: { username: string; avatarUrl: string | null }[][];
  players: number;
  mine: HorseBetView[];
  /** Your bets on the last few races */
  history: HorseBetView[];
  /** Winners of the last races, newest first, with the win price */
  winners: { round: number; horse: number; odds100: number }[];
  form: HorseForm;
  /** Today's biggest payouts */
  bigWins: { username: string; avatarUrl: string | null; payout: number; type: HorseBetType; horse: number; horse2: number | null; odds100: number }[];
  /** Cheers this race (time is server time) */
  cheers: { id: number; username: string; emoji: string; horse: number | null; at: number }[];
  balance: number;
}
