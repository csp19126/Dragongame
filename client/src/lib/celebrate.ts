import confetti from "canvas-confetti";

/**
 * Win celebrations: fireworks, coin bursts and red-envelope rain.
 * All of them respect the phone's "reduce motion" setting.
 */

const GOLD = ["#fde047", "#facc15", "#f59e0b", "#fb923c", "#ef4444", "#f472b6", "#ffffff"];
const base = { disableForReducedMotion: true, zIndex: 60 } as const;

let coinShape: confetti.Shape | null = null;
let envelopeShape: confetti.Shape | null = null;
function emojiShapes() {
  try {
    coinShape ??= confetti.shapeFromText({ text: "🪙", scalar: 2 });
    envelopeShape ??= confetti.shapeFromText({ text: "🧧", scalar: 2 });
  } catch {
    // Very old browsers without OffscreenCanvas: fall back to plain confetti
  }
  return { coin: coinShape, envelope: envelopeShape };
}

const timers = new Set<number>();
function every(ms: number, durationMs: number, fn: () => void) {
  const end = Date.now() + durationMs;
  const id = window.setInterval(() => {
    if (Date.now() > end) { window.clearInterval(id); timers.delete(id); return; }
    fn();
  }, ms);
  timers.add(id);
}

/** Stop any celebration still running (e.g. the player spins again) */
export function stopCelebrations() {
  timers.forEach((id) => window.clearInterval(id));
  timers.clear();
  confetti.reset();
}

/** A small golden pop from the machine, for any profitable win */
export function coinBurst(origin = { x: 0.5, y: 0.45 }) {
  const { coin } = emojiShapes();
  confetti({ ...base, particleCount: 26, spread: 70, startVelocity: 32, origin, colors: GOLD, scalar: 0.9 });
  if (coin) confetti({ ...base, particleCount: 8, spread: 60, startVelocity: 28, origin, shapes: [coin], scalar: 2, flat: true });
}

/** Fireworks shells bursting across the screen */
export function fireworks(durationMs: number, intensity = 1) {
  const shell = () => {
    const origin = { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.35 };
    const color = GOLD[Math.floor(Math.random() * GOLD.length)];
    confetti({
      ...base,
      particleCount: Math.round(55 * intensity),
      spread: 360,
      startVelocity: 26 + Math.random() * 10,
      ticks: 70,
      gravity: 0.9,
      decay: 0.92,
      origin,
      colors: [color, "#ffffff", "#fde047"],
      scalar: 0.9,
    });
  };
  shell();
  every(Math.max(140, 380 / intensity), durationMs, shell);
}

/** Coins and red envelopes raining down: the scatter / mega-win celebration */
export function luckyRain(durationMs: number) {
  const { coin, envelope } = emojiShapes();
  const shapes = [coin, envelope].filter(Boolean) as confetti.Shape[];
  every(220, durationMs, () => {
    confetti({
      ...base,
      particleCount: 4,
      angle: 270,
      spread: 50,
      startVelocity: 8,
      gravity: 0.7,
      ticks: 260,
      origin: { x: Math.random(), y: -0.05 },
      ...(shapes.length ? { shapes, scalar: 2.2, flat: true } : { colors: GOLD }),
    });
  });
}

/** Side cannons, used for the very top wins */
export function cannons(durationMs: number) {
  every(250, durationMs, () => {
    confetti({ ...base, particleCount: 18, angle: 60, spread: 55, startVelocity: 55, origin: { x: 0, y: 0.75 }, colors: GOLD });
    confetti({ ...base, particleCount: 18, angle: 120, spread: 55, startVelocity: 55, origin: { x: 1, y: 0.75 }, colors: GOLD });
  });
}

export type WinTier = "none" | "small" | "win" | "big" | "mega" | "epic";

/** How a win should be celebrated, by its size relative to the bet */
export function winTier(winAmount: number, bet: number): WinTier {
  const x = winAmount / bet;
  if (x >= 100) return "epic";
  if (x >= 30) return "mega";
  if (x >= 10) return "big";
  if (x > 1) return "win";
  if (x > 0) return "small";
  return "none";
}
