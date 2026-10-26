/**
 * Sút Phạt Đền / Penalty Kings — the pure rules and maths (no DB, no network), shared by the
 * server (which decides every kick) and the client (which only draws what the server decided).
 *
 * The goal mouth is measured in "goal units": x runs from -1 (left post) to +1 (right post),
 * y from 0 (the grass) to 1 (the crossbar), as seen from behind the ball.
 * It is split into 6 zones the keeper can dive to:  3 4 5  (high)
 *                                                    0 1 2  (low)
 */

export type Side = 0 | 1;
export type Zone = 0 | 1 | 2 | 3 | 4 | 5;
export const ZONES: Zone[] = [0, 1, 2, 3, 4, 5];

/** What the shooter commits: where they aim, how hard (0..1) and how much bend (-1..1) */
export interface ShotChoice { x: number; y: number; power: number; curve: number }

export type Outcome = "goal" | "save" | "post" | "bar" | "wide" | "over";

export interface KickResult {
  shot: ShotChoice;
  dive: Zone;
  /** Where the ball really went after the shooter's execution error and the bend */
  fx: number;
  fy: number;
  /** The zone the ball crossed the line in (null when it missed the frame) */
  zone: Zone | null;
  outcome: Outcome;
  scored: boolean;
  /** The keeper got a hand to it (a save, or a touch that still went in) */
  touched: boolean;
  seed: number;
}

// ---------------- Tunables ----------------

/** Post / crossbar thickness in goal units (12 cm posts on a 7.32 m goal → ≈0.03 each side) */
export const POST_R = 0.045;
export const BAR_R = 0.05;
/** How far a full bend moves the ball sideways by the time it reaches the line */
export const CURVE_SHIFT = 0.32;
/** Keeper reach when diving to the right zone, before speed and corner adjustments */
export const ZONE_REACH: Record<Zone, number> = { 0: 0.8, 1: 0.92, 2: 0.8, 3: 0.5, 4: 0.86, 5: 0.5 };

/** Online: time to make each choice, and the pause while everyone watches the kick */
export const CHOOSE_MS = 12_000;
export const REVEAL_MS = 4_500;
/** Stakes a table can be played for (0 = friendly), exactly like pool */
export const FOOTBALL_STAKES = [0, 1000, 10000, 50000, 100000, 500000, 1000000];
export const FOOTBALL_EMOTES = ["👍", "🔥", "😂", "😮", "😡", "😭", "👏", "⚽"];

/** Regulation kicks per side before sudden death */
export const REGULATION = 5;

// ---------------- Teams ----------------

export interface Kit { id: string; flag: string; vi: string; en: string; zh: string; shirt: string; shorts: string; trim: string; gk: string }
export const KITS: Kit[] = [
  { id: "vn", flag: "🇻🇳", vi: "Việt Nam", en: "Vietnam", zh: "越南", shirt: "#da251d", shorts: "#da251d", trim: "#ffde00", gk: "#16a34a" },
  { id: "th", flag: "🇹🇭", vi: "Thái Lan", en: "Thailand", zh: "泰國", shirt: "#1d4ed8", shorts: "#1d4ed8", trim: "#ffffff", gk: "#f59e0b" },
  { id: "kr", flag: "🇰🇷", vi: "Hàn Quốc", en: "Korea", zh: "韓國", shirt: "#e11d48", shorts: "#111827", trim: "#ffffff", gk: "#84cc16" },
  { id: "jp", flag: "🇯🇵", vi: "Nhật Bản", en: "Japan", zh: "日本", shirt: "#1e3a8a", shorts: "#ffffff", trim: "#ef4444", gk: "#eab308" },
  { id: "en", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", vi: "Anh", en: "England", zh: "英格蘭", shirt: "#f8fafc", shorts: "#1e293b", trim: "#dc2626", gk: "#a855f7" },
  { id: "sc", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", vi: "Scotland", en: "Scotland", zh: "蘇格蘭", shirt: "#1e2a5a", shorts: "#f8fafc", trim: "#60a5fa", gk: "#f97316" },
  { id: "br", flag: "🇧🇷", vi: "Brazil", en: "Brazil", zh: "巴西", shirt: "#facc15", shorts: "#1d4ed8", trim: "#16a34a", gk: "#0f172a" },
  { id: "ar", flag: "🇦🇷", vi: "Argentina", en: "Argentina", zh: "阿根廷", shirt: "#7dd3fc", shorts: "#111827", trim: "#ffffff", gk: "#22c55e" },
  { id: "fr", flag: "🇫🇷", vi: "Pháp", en: "France", zh: "法國", shirt: "#1e3a8a", shorts: "#ffffff", trim: "#ef4444", gk: "#f59e0b" },
  { id: "de", flag: "🇩🇪", vi: "Đức", en: "Germany", zh: "德國", shirt: "#ffffff", shorts: "#111827", trim: "#facc15", gk: "#16a34a" },
  { id: "es", flag: "🇪🇸", vi: "Tây Ban Nha", en: "Spain", zh: "西班牙", shirt: "#c81e1e", shorts: "#1e3a8a", trim: "#facc15", gk: "#14b8a6" },
  { id: "pt", flag: "🇵🇹", vi: "Bồ Đào Nha", en: "Portugal", zh: "葡萄牙", shirt: "#9f1239", shorts: "#14532d", trim: "#facc15", gk: "#0ea5e9" },
  { id: "it", flag: "🇮🇹", vi: "Ý", en: "Italy", zh: "義大利", shirt: "#2563eb", shorts: "#ffffff", trim: "#ffffff", gk: "#facc15" },
  { id: "nl", flag: "🇳🇱", vi: "Hà Lan", en: "Netherlands", zh: "荷蘭", shirt: "#f97316", shorts: "#ffffff", trim: "#111827", gk: "#22c55e" },
];
export const KIT_BY_ID = new Map(KITS.map((k) => [k.id, k]));
export const kitOf = (id: unknown): Kit => KIT_BY_ID.get(String(id)) ?? KITS[0];
export const validKit = (id: unknown): string => (KIT_BY_ID.has(String(id)) ? String(id) : "vn");

// ---------------- Randomness ----------------

/** Small, fast seeded generator (mulberry32): the same seed always plays the same kick */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal number from two uniforms (Box–Muller) */
function gauss(rng: () => number) {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Never trust what a client sends: force every field into range */
export function cleanShot(s: Partial<ShotChoice> | null | undefined): ShotChoice {
  return {
    x: clamp(num(s?.x), -1.6, 1.6),
    y: clamp(num(s?.y, 0.3), 0, 1.6),
    power: clamp(num(s?.power, 0.5), 0, 1),
    curve: clamp(num(s?.curve), -1, 1),
  };
}
export const isZone = (z: unknown): z is Zone => Number.isInteger(z) && (z as number) >= 0 && (z as number) <= 5;

// ---------------- Geometry ----------------

/** Which of the 6 zones a point inside the frame is in */
export function zoneAt(x: number, y: number): Zone {
  const col = x < -1 / 3 ? 0 : x > 1 / 3 ? 2 : 1;
  const row = y >= 0.5 ? 1 : 0;
  return (row * 3 + col) as Zone;
}
/** The middle of a zone (for drawing and for the computer's aim) */
export function zoneCentre(z: Zone): { x: number; y: number } {
  return { x: ((z % 3) - 1) * (2 / 3), y: z >= 3 ? 0.75 : 0.25 };
}
const adjacent = (a: Zone, b: Zone) => {
  const [ra, ca, rb, cb] = [Math.floor(a / 3), a % 3, Math.floor(b / 3), b % 3];
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
};

/** How wild the shot is: grows with power and with aiming close to the posts and the bar */
export function executionError(shot: ShotChoice): number {
  const corner = clamp((Math.abs(shot.x) - 0.5) / 0.5, 0, 1) * 0.5 + clamp((shot.y - 0.55) / 0.45, 0, 1) * 0.5;
  return 0.03 + 0.07 * shot.power * shot.power + 0.06 * corner + 0.02 * Math.abs(shot.curve);
}

/** Too much power lifts the ball: past 80% it climbs fast (full power adds about half the goal's height) */
export const liftOf = (power: number) => Math.max(0, power - 0.8) * 2.4;

/** The keeper's chance of stopping a ball at (fx, fy) after diving to `dive` */
export function saveChance(dive: Zone, fx: number, fy: number, power: number, reach = 1): number {
  const z = zoneAt(fx, fy);
  // Fast shots are harder to stop, a tame one is easy
  const speed = 1.25 - 0.55 * power;
  let p: number;
  if (z === dive) {
    const edge = 0.35 * clamp((Math.abs(fx) - 0.8) / 0.2, 0, 1) + 0.25 * clamp((fy - 0.8) / 0.2, 0, 1);
    p = ZONE_REACH[z] * speed - edge;
  } else if (adjacent(z, dive)) {
    p = power < 0.45 ? 0.3 : 0.14;
  } else {
    p = 0;
  }
  return clamp(p * reach, 0, 0.97);
}

/**
 * Plays one kick. Deterministic for a given seed: the server draws the seed with crypto
 * randomness, so neither player can know or influence it.
 * `reach` scales the keeper (the computer's levels); online games always use 1.
 */
export function resolveKick(rawShot: ShotChoice, dive: Zone, seed: number, reach = 1): KickResult {
  const shot = cleanShot(rawShot);
  const rng = seededRng(seed);
  const err = executionError(shot);
  const lift = liftOf(shot.power);
  let fx = shot.x + shot.curve * CURVE_SHIFT + gauss(rng) * err;
  let fy = shot.y + lift + gauss(rng) * err * 0.8;
  fx = Math.round(clamp(fx, -2, 2) * 1000) / 1000;
  fy = Math.round(clamp(fy, 0.03, 2) * 1000) / 1000;
  const ax = Math.abs(fx);
  const base = { shot, dive, fx, fy, seed };
  // The woodwork first, then off target
  if (ax >= 1 - POST_R && ax <= 1 + POST_R && fy <= 1 + BAR_R) return { ...base, zone: null, outcome: "post", scored: false, touched: false };
  if (fy >= 1 - BAR_R && fy <= 1 + BAR_R && ax < 1) return { ...base, zone: null, outcome: "bar", scored: false, touched: false };
  if (ax > 1) return { ...base, zone: null, outcome: "wide", scored: false, touched: false };
  if (fy > 1) return { ...base, zone: null, outcome: "over", scored: false, touched: false };
  const zone = zoneAt(fx, fy);
  const p = saveChance(dive, fx, fy, shot.power, reach);
  const roll = rng();
  if (roll < p) return { ...base, zone, outcome: "save", scored: false, touched: true };
  // A near thing: the keeper got fingertips to it but it still went in
  const touched = p > 0 && roll < p + 0.12;
  return { ...base, zone, outcome: "goal", scored: true, touched };
}

// ---------------- The shootout ----------------

export interface Shootout {
  /** Who takes the first kick */
  first: Side;
  /** Every kick so far, in order (the shooter alternates) */
  kicks: { side: Side; scored: boolean; outcome: Outcome }[];
}

export const newShootout = (first: Side): Shootout => ({ first, kicks: [] });
/** The side taking kick number `i` (0-based) */
export const shooterOf = (s: Shootout, i = s.kicks.length): Side => (i % 2 === 0 ? s.first : ((1 - s.first) as Side));
export const keeperOf = (s: Shootout, i = s.kicks.length): Side => (1 - shooterOf(s, i)) as Side;

export function tally(s: Shootout) {
  const goals: [number, number] = [0, 0];
  const taken: [number, number] = [0, 0];
  for (const k of s.kicks) { taken[k.side]++; if (k.scored) goals[k.side]++; }
  return { goals, taken };
}

/**
 * The winner, or null while it's still going. In the first five each, it ends as soon as one
 * side can't be caught; after that it's sudden death, decided after each completed pair.
 */
export function shootoutWinner(s: Shootout): Side | null {
  const { goals, taken } = tally(s);
  if (taken[0] <= REGULATION && taken[1] <= REGULATION && !(taken[0] === REGULATION && taken[1] === REGULATION)) {
    const left: [number, number] = [REGULATION - taken[0], REGULATION - taken[1]];
    if (goals[0] > goals[1] + left[1]) return 0;
    if (goals[1] > goals[0] + left[0]) return 1;
    return null;
  }
  if (taken[0] === taken[1] && goals[0] !== goals[1]) return goals[0] > goals[1] ? 0 : 1;
  return null;
}

export function addKick(s: Shootout, scored: boolean, outcome: Outcome): Shootout {
  return { ...s, kicks: [...s.kicks, { side: shooterOf(s), scored, outcome }] };
}

/** Sudden death once both sides have taken their five */
export const inSuddenDeath = (s: Shootout) => { const { taken } = tally(s); return taken[0] >= REGULATION && taken[1] >= REGULATION; };

// ---------------- Computer opponent ----------------

export type Level = "easy" | "medium" | "hard";
export const LEVELS: Level[] = ["easy", "medium", "hard"];
/** How far the computer keeper reaches, per level */
export const AI_REACH: Record<Level, number> = { easy: 0.7, medium: 1, hard: 1.15 };
/** The first practice win of the day at Medium or Hard (play coins, paid by the house) */
export const FOOTBALL_DAILY_WIN = 10_000;

/** The computer's shot. `rand` is a uniform 0..1 source; `theirDives` the player's earlier dives */
export function aiShot(level: Level, rand: () => number, theirDives: Zone[] = []): ShotChoice {
  let z = Math.floor(rand() * 6) as Zone;
  if (level === "hard" && theirDives.length) {
    // Go where the player dives least
    const count = ZONES.map((q) => theirDives.filter((d) => d === q).length);
    const min = Math.min(...count);
    const options = ZONES.filter((q) => count[q] === min);
    z = options[Math.floor(rand() * options.length)];
  }
  const c = zoneCentre(z);
  const spread = level === "easy" ? 0.15 : 0.3;
  const x = c.x * (level === "easy" ? 0.7 : 1.05) + (rand() - 0.5) * spread;
  const power = level === "easy" ? 0.3 + rand() * 0.35 : level === "medium" ? 0.45 + rand() * 0.4 : 0.6 + rand() * 0.3;
  // Aim a little low so the power's lift doesn't carry it over
  const y = clamp(c.y + (rand() - 0.5) * 0.2 - liftOf(power), 0.08, 0.9);
  const curve = level === "hard" ? (rand() - 0.5) * 0.6 : 0;
  return cleanShot({ x: x - curve * CURVE_SHIFT, y, power, curve });
}

/** The computer keeper's dive; the hard keeper reads the player's habits */
export function aiDive(level: Level, rand: () => number, theirShots: Zone[] = []): Zone {
  if (level === "easy") return (rand() < 0.5 ? 1 : Math.floor(rand() * 6)) as Zone;
  if (level === "hard" && theirShots.length >= 2 && rand() < 0.5) {
    const count = ZONES.map((q) => theirShots.filter((d) => d === q).length);
    const max = Math.max(...count);
    const options = ZONES.filter((q) => count[q] === max);
    return options[Math.floor(rand() * options.length)];
  }
  return Math.floor(rand() * 6) as Zone;
}

/** A random but sensible shot or dive, for a player who ran out of time */
export function randomShot(rand: () => number): ShotChoice {
  return aiShot("medium", rand);
}

// ---------------- Rating (weekly ladder) ----------------

export const ELO_START = 1000;
export const ELO_K = 32;
/** Counted online matches needed in a week to be paid a ladder prize */
export const LADDER_MIN_GAMES = 5;
/** A match counts for the ladder when at least this many kicks were taken */
export const LADDER_MIN_KICKS = 6;
/** At most this many counted matches a day between the same two players */
export const LADDER_MAX_PER_PAIR_PER_DAY = 3;
/** Weekly prizes for 1st, 2nd, 3rd (play coins, paid by the house) */
export const LADDER_PRIZES = [1_000_000, 500_000, 250_000];

/** Rating change for the winner (the loser loses the same) */
export function eloDelta(winner: number, loser: number, k = ELO_K): number {
  const expected = 1 / (1 + 10 ** ((loser - winner) / 400));
  return Math.max(1, Math.round(k * (1 - expected)));
}

const VN_OFFSET_MS = 7 * 3600_000;
/** The ladder week a moment belongs to: the Monday it started on (Vietnam time), e.g. "2026-10-26" */
export function weekOf(at: Date): string {
  const d = new Date(at.getTime() + VN_OFFSET_MS);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}
/** When a week ends: the next Monday 00:00 Vietnam time */
export function weekEnd(week: string): Date {
  const [y, m, d] = week.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7) - VN_OFFSET_MS);
}
export function previousWeek(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

// ---------------- Wire protocol ----------------

export interface FootballTable { code: string; stake: number; host: string; hostKit: string; guest?: string; guestKit?: string; status: "waiting" | "playing" }

export interface LadderRow { rank: number; username: string; avatarUrl: string | null; rating: number; played: number; won: number }
export interface LadderView {
  week: string;
  endsAt: string;
  prizes: number[];
  minGames: number;
  table: LadderRow[];
  me: LadderRow | null;
  last: { week: string; winners: { username: string; prize: number; rating: number }[] } | null;
  serverNow: string;
}

export type FootballServerMsg =
  | {
      t: "state";
      code: string;
      stake: number;
      seat: Side | null;
      names: [string, string | null];
      kits: [string, string];
      avatars: [string | null, string | null];
      status: "waiting" | "playing" | "finished";
      shootout: Shootout | null;
      /** "choose": both pick in secret; "reveal": the last kick is being shown */
      phase: "choose" | "reveal" | null;
      /** Who has locked in a choice for this kick: never what they chose */
      committed: [boolean, boolean];
      msLeft: number | null;
      online: [boolean, boolean];
      spectators: number;
      result: { winner: Side; reason: string; payout: number; ladder?: { counted: boolean; delta: number } } | null;
      /** Players asking for a rematch */
      rematch: [boolean, boolean];
    }
  | { t: "kick"; index: number; by: Side; kick: KickResult; shootout: Shootout; decisive: boolean }
  | { t: "emote"; from: Side | null; e: string }
  | { t: "rematch"; code: string }
  | { t: "error"; message: string }
  | { t: "closed"; reason: string };
