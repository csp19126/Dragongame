import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CURVE_SHIFT, kitOf, zoneAt, zoneCentre, type KickResult, type Outcome, type ShotChoice, type Zone } from "@shared/football";
import { soundManager } from "@/lib/sound";

/**
 * The penalty scene, drawn on a canvas from behind the ball: stadium, crowd, floodlights,
 * striped pitch, goal and net, the keeper and the ball. It reads the player's flick (or
 * dive) and plays back kicks the server has already decided — it never decides anything.
 */

export interface PitchPlay { id: number; kick: KickResult; slow?: boolean; onDone?: () => void }

export interface PitchProps {
  /** shoot: flick the ball; keep: pick a dive zone; watch: no input */
  mode: "shoot" | "keep" | "watch";
  shooterKit: string;
  keeperKit: string;
  /** The player's choice is in: show it and take no more input */
  locked?: boolean;
  onShoot?: (s: ShotChoice) => void;
  onDive?: (z: Zone) => void;
  play?: PitchPlay | null;
  labels: Record<Outcome, string> & { replay: string; swipe: string; tapZone: string };
  /** Muted visual hint in the middle of the screen */
  hint?: string | null;
}

// ---- Scene geometry (all in CSS pixels, worked out from the canvas size) ----
const SCALE_G = 0.45; // ball size on the goal line, relative to on the spot
const K = 1 / SCALE_G - 1;
const s = (t: number) => 1 / (1 + K * t);
const S = (t: number) => s(t) / SCALE_G;
const u = (t: number) => (1 - s(t)) / (1 - SCALE_G);

interface Geo { W: number; H: number; cx: number; gw: number; gh: number; gy: number; spotY: number; rb: number }
function geo(W: number, H: number): Geo {
  const gw = 0.8 * W;
  return { W, H, cx: W / 2, gw, gh: gw / 3, gy: 0.55 * H, spotY: 0.88 * H, rb: 0.048 * W };
}
const groundY = (g: Geo, t: number) => g.spotY + (g.gy - g.spotY) * u(t);
/** A point at goal units (x, y) and depth t (0 = the spot, 1 = the goal line) on screen */
function proj(g: Geo, x: number, y: number, t: number) {
  return { x: g.cx + x * (g.gw / 2) * S(t), y: groundY(g, t) - y * g.gh * S(t), k: S(t) };
}

// ---- The flight of the ball, from what the server decided ----
interface Flight { dur: number; path: (p: number) => { x: number; y: number; t: number; spin: number }; after: (q: number) => { x: number; y: number; t: number } }
function flightOf(k: KickResult): Flight {
  const c = k.shot.curve * CURVE_SHIFT;
  const fx = k.fx, fy = k.fy;
  const dur = 1050 - 480 * k.shot.power;
  const path = (p: number) => {
    const t = p;
    // Starts towards the aim, bends to where it really ends up; a little loft in the middle
    const x = (fx - c) * t + c * t * t;
    const y = fy * t + Math.sin(Math.PI * t) * 0.12 * (1 - k.shot.power * 0.5);
    return { x, y, t, spin: p * 14 };
  };
  const sx = Math.sign(fx) || 1;
  const after = (q: number) => {
    switch (k.outcome) {
      case "goal": { const e = 1 - (1 - q) ** 3; return { x: fx * (1 + 0.04 * e), y: Math.max(0.03, fy - 0.15 * e * e) * (1 - 0.3 * q * q), t: 1 + 0.11 * e }; }
      case "save": { const e = 1 - (1 - q) ** 2; return { x: fx + sx * 0.7 * e, y: fy + 0.25 * Math.sin(Math.PI * q) - fy * 0.8 * q, t: 1 - 0.28 * e }; }
      case "post": { const e = 1 - (1 - q) ** 2; return { x: fx + sx * 0.45 * e, y: Math.max(0.03, fy * (1 - q) + 0.2 * Math.sin(Math.PI * q)), t: 1 - 0.2 * e }; }
      case "bar": { const e = 1 - (1 - q) ** 2; return { x: fx * (1 + 0.2 * e), y: fy + 0.9 * e, t: 1 + 0.35 * e }; }
      default: return { x: fx * (1 + 0.15 * q), y: fy + 0.25 * q, t: 1 + 0.4 * q };
    }
  };
  return { dur, path, after };
}

// ---- Keeper pose for a dive ----
function divePose(z: Zone | null, p: number) {
  if (z === null) return { x: 0, y: 0, rot: 0, crouch: 0, arms: 0 };
  const c = zoneCentre(z);
  const e = p < 1 ? 1 - (1 - p) ** 2 : 1;
  const col = z % 3;
  const high = z >= 3;
  if (col === 1) return { x: 0, y: high ? 0.22 * Math.sin(Math.PI * Math.min(1, p * 1.2)) : 0, rot: 0, crouch: high ? 0 : 0.25 * e, arms: high ? e : -0.4 * e };
  const side = col === 0 ? -1 : 1;
  return { x: c.x * 0.95 * e, y: (high ? 0.38 : 0.05) * Math.sin(Math.PI * Math.min(1, p * 0.9)) + (high ? 0.05 : 0) * e, rot: side * (high ? 62 : 82) * e, crouch: 0, arms: e };
}

// ---- Stable background: crowd positions and colours ----
function crowdOf(n: number) {
  let a = 12345;
  const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const colours = ["#f43f5e", "#facc15", "#ffffff", "#60a5fa", "#ef4444", "#fbbf24", "#a3e635", "#f97316", "#e879f9", "#22d3ee", "#da251d", "#ffde00"];
  return Array.from({ length: n }, () => ({ x: r(), y: r(), c: colours[Math.floor(r() * colours.length)], ph: r() * 6.28, sz: 0.6 + r() * 0.6 }));
}
const CROWD = crowdOf(420);

export function Pitch({ mode, shooterKit, keeperKit, locked, onShoot, onDive, play, labels, hint }: PitchProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ W: 380, H: 450 });
  const [banner, setBanner] = useState<{ id: number; outcome: Outcome; slow: boolean } | null>(null);
  const [chosen, setChosen] = useState<Zone | null>(null);
  // Everything the draw loop reads lives in refs, so it never restarts
  const live = useRef({
    mode, shooterKit, keeperKit, locked: !!locked, chosen: null as Zone | null,
    trail: [] as { x: number; y: number; at: number }[], swiping: false, released: 0,
    anim: null as null | { start: number; kick: KickResult; flight: Flight; slow: boolean; hit: boolean; impact: boolean; done?: () => void; id: number },
    lastKick: null as null | { kick: KickResult },
    ripple: null as null | { at: number; x: number; y: number },
    shake: 0, crowdJump: 0,
  });
  live.current.mode = mode;
  live.current.shooterKit = shooterKit;
  live.current.keeperKit = keeperKit;
  live.current.locked = !!locked;
  live.current.chosen = chosen;

  // A new kick (or no choice yet) resets the chosen zone
  useEffect(() => { if (!locked) setChosen(null); }, [locked, mode]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const W = Math.round(el.clientWidth);
      const H = Math.round(Math.min(W * 1.08, Math.max(340, window.innerHeight - 300)));
      setSize({ W, H });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start playing a kick when a new one arrives
  useEffect(() => {
    if (!play) return;
    const L = live.current;
    L.trail = [];
    L.ripple = null;
    L.anim = { start: performance.now(), kick: play.kick, flight: flightOf(play.kick), slow: !!play.slow, hit: false, impact: false, done: play.onDone, id: play.id };
    L.lastKick = { kick: play.kick };
    setBanner(null);
  }, [play?.id]);

  // The draw loop
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size.W * dpr);
    cv.height = Math.round(size.H * dpr);
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const g = geo(size.W, size.H);
    const frame = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, g, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size.W, size.H]);

  function draw(ctx: CanvasRenderingContext2D, g: Geo, now: number) {
    const L = live.current;
    const sk = kitOf(L.shooterKit), kk = kitOf(L.keeperKit);
    const { W, H, cx, gw, gh, gy } = g;

    // ---- Timeline of the kick being shown ----
    let ball = { x: 0, y: 0, t: 0, spin: 0 };
    let keeperP = 0;
    let dive: Zone | null = null;
    const A = L.anim;
    if (A) {
      const speed = A.slow ? 0.33 : 1;
      const el = (now - A.start) * speed;
      const RUN = 380;
      const f = A.flight;
      dive = A.kick.dive;
      if (el >= RUN && !A.hit) { A.hit = true; soundManager.kick(); }
      const fl = el - RUN;
      keeperP = Math.max(0, (fl - 40) / 420);
      if (fl < 0) ball = { x: 0, y: 0, t: 0, spin: 0 };
      else if (fl < f.dur) ball = f.path(fl / f.dur);
      else {
        const q = Math.min(1, (fl - f.dur) / 700);
        const a = f.after(q);
        ball = { ...a, spin: 14 + q * 6 };
        if (!A.impact) {
          A.impact = true;
          const o = A.kick.outcome;
          if (o === "goal") { L.ripple = { at: now, x: A.kick.fx, y: A.kick.fy }; L.crowdJump = now; soundManager.cheer(); }
          else if (o === "post" || o === "bar") { soundManager.clang(); L.shake = now; }
          else if (o === "save") soundManager.thud();
          else soundManager.groan();
          setBanner({ id: A.id, outcome: o, slow: A.slow });
        }
      }
      if (fl > f.dur + 1700) {
        const done = A.done;
        L.anim = null;
        setBanner(null);
        done?.();
      }
    } else if (L.lastKick && L.mode === "watch") {
      // Between kicks while watching, the ball rests where it ended
      ball = { x: 0, y: 0, t: 0, spin: 0 };
    }

    // ---- Shake on the woodwork ----
    ctx.save();
    if (L.shake && now - L.shake < 300) {
      const k = (1 - (now - L.shake) / 300) * 3;
      ctx.translate(Math.sin(now / 15) * k, Math.cos(now / 19) * k);
    }

    // ---- Night sky, stands, crowd, floodlights ----
    const boardT = 1.42;
    const boardY = groundY(g, boardT);
    const boardH = gh * 0.2 * S(boardT);
    const sky = ctx.createLinearGradient(0, 0, 0, boardY);
    sky.addColorStop(0, "#05031a");
    sky.addColorStop(0.55, "#1b0f3d");
    sky.addColorStop(1, "#2a1152");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, boardY);
    // Stand tiers
    const standTop = boardY * 0.18;
    for (let i = 0; i < 4; i++) {
      const y0 = standTop + (boardY - boardH - standTop) * (i / 4);
      ctx.fillStyle = i % 2 ? "#1d1238" : "#241645";
      ctx.fillRect(0, y0, W, (boardY - boardH - standTop) / 4 + 1);
    }
    // Crowd: little heads that bounce when a goal goes in
    const jump = L.crowdJump && now - L.crowdJump < 2200 ? 1 - (now - L.crowdJump) / 2200 : 0;
    for (const p of CROWD) {
      const y = standTop + 4 + p.y * (boardY - boardH - standTop - 8);
      const x = p.x * W;
      const bob = Math.sin(now / 420 + p.ph) * 0.8 + (jump ? Math.abs(Math.sin(now / 90 + p.ph)) * -5 * jump : 0);
      const r = (1.6 + (y / boardY) * 1.6) * p.sz;
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.55 + (y / boardY) * 0.35;
      ctx.beginPath();
      ctx.arc(x, y + bob, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Flashes from phone cameras
    if ((now / 140) % 7 < 1) {
      const p = CROWD[Math.floor(now / 140) % CROWD.length];
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(p.x * W, standTop + p.y * (boardY - boardH - standTop), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Floodlights
    for (const lx of [0.07 * W, 0.93 * W]) {
      const glow = ctx.createRadialGradient(lx, standTop * 0.6, 2, lx, standTop * 0.6, W * 0.32);
      glow.addColorStop(0, "rgba(255,250,220,0.95)");
      glow.addColorStop(0.08, "rgba(255,245,200,0.45)");
      glow.addColorStop(1, "rgba(255,245,200,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(lx - W * 0.32, 0, W * 0.64, standTop * 0.6 + W * 0.32);
      ctx.fillStyle = "#fffbe6";
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(lx - 9 + i * 7, standTop * 0.6 - 6 + j * 6, 5, 4);
    }

    // ---- Pitch with mowing stripes ----
    ctx.fillStyle = "#14532d";
    ctx.fillRect(0, boardY, W, H - boardY);
    const bands = 13;
    for (let i = 0; i < bands; i++) {
      const t0 = boardT - (i * (boardT + 0.35)) / bands;
      const t1 = boardT - ((i + 1) * (boardT + 0.35)) / bands;
      const y0 = groundY(g, t0), y1 = Math.min(H, groundY(g, t1));
      ctx.fillStyle = i % 2 ? "#166534" : "#15803d";
      ctx.fillRect(0, y0, W, y1 - y0 + 1);
    }
    // Light pooling from the floodlights
    const pool = ctx.createRadialGradient(cx, gy, 10, cx, gy, W * 0.9);
    pool.addColorStop(0, "rgba(255,255,255,0.10)");
    pool.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, boardY, W, H - boardY);

    // Advertising boards
    const bgB = ctx.createLinearGradient(0, boardY - boardH, 0, boardY);
    bgB.addColorStop(0, "#7c1d6f");
    bgB.addColorStop(1, "#4c0d45");
    ctx.fillStyle = bgB;
    ctx.fillRect(0, boardY - boardH, W, boardH);
    ctx.fillStyle = "#fde047";
    ctx.font = `900 ${Math.round(boardH * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shift = (now / 40) % (W / 2);
    for (let i = -1; i < 3; i++) ctx.fillText("VnSlot 888  ⚽", i * (W / 2) + shift, boardY - boardH / 2 + 1);

    // Pitch lines: goal line, six-yard box, penalty spot
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    const line = (pts: [number, number, number][]) => {
      ctx.beginPath();
      pts.forEach(([x, y, t], i) => { const q = proj(g, x, y, t); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    };
    line([[-6, 0, 1], [6, 0, 1]]);
    line([[-1.5, 0, 1], [-1.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1]]);
    line([[-3.3, 0, 1], [-3.3, 0, -0.45]]);
    line([[3.3, 0, 1], [3.3, 0, -0.45]]);
    const spot = proj(g, 0, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.ellipse(spot.x, spot.y + g.rb * 0.55, g.rb * 0.35, g.rb * 0.14, 0, 0, Math.PI * 2); ctx.fill();

    // ---- Net (with a ripple where the ball hits it) ----
    const backT = 1.13;
    const rip = L.ripple && now - L.ripple.at < 1400 ? L.ripple : null;
    const ripA = rip ? (1 - (now - rip.at) / 1400) : 0;
    const netPt = (x: number, y: number, t: number) => {
      const q = proj(g, x, y, t);
      if (rip) {
        const d2 = (x - rip.x) ** 2 + (y - rip.y) ** 2;
        const push = Math.exp(-d2 / 0.09) * ripA * Math.sin((now - rip.at) / 45) * gh * 0.09;
        // Bulges away from us (up the screen) around the ball
        q.y -= push * 0.6;
        q.x += (x - rip.x) * push * 0.6;
      }
      return q;
    };
    // The shade inside the goal, so the net reads clearly against the crowd
    {
      const a = proj(g, -1, 0, 1), b = proj(g, -1, 1, 1), c = proj(g, 1, 1, 1), d = proj(g, 1, 0, 1);
      const shade = ctx.createLinearGradient(0, b.y, 0, a.y);
      shade.addColorStop(0, "rgba(6,10,24,0.78)");
      shade.addColorStop(1, "rgba(6,24,14,0.6)");
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1;
    const backTop = 0.82;
    // Back panel
    for (let i = 0; i <= 20; i++) {
      const x = -1 + i / 10;
      ctx.beginPath();
      for (let j = 0; j <= 10; j++) { const q = netPt(x, (backTop * j) / 10, backT); if (j) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.stroke();
    }
    for (let j = 0; j <= 8; j++) {
      const y = (backTop * j) / 8;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const q = netPt(-1 + i / 10, y, backT); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.stroke();
    }
    // Roof and sides
    for (let i = 0; i <= 6; i++) {
      const tt = 1 + ((backT - 1) * i) / 6;
      const yy = 1 - ((1 - backTop) * i) / 6;
      const a = proj(g, -1, yy, tt), b = proj(g, 1, yy, tt);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      for (const side of [-1, 1]) {
        const top = proj(g, side, yy, tt), bot = proj(g, side, 0, tt);
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
      }
    }
    for (let j = 0; j <= 6; j++) {
      for (const side of [-1, 1]) {
        const a = proj(g, side, j / 6, 1), b = proj(g, side, (backTop * j) / 6, backT);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // Ball behind the goal line is drawn before the frame and the keeper
    const ballBehind = ball.t > 1.001;
    if (ballBehind) drawBall(ctx, g, ball);

    // ---- Keeper ----
    const pose = divePose(dive, Math.min(1.3, keeperP));
    const idle = A ? 0 : Math.sin(now / 260) * 0.04;
    drawKeeper(ctx, g, pose, idle, kk);

    // ---- Goal frame ----
    const lt = proj(g, -1, 1, 1), rt = proj(g, 1, 1, 1), lb = proj(g, -1, 0, 1), rbm = proj(g, 1, 0, 1);
    const postW = Math.max(4, W * 0.014);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = postW + 2;
    ctx.beginPath(); ctx.moveTo(lb.x, lb.y); ctx.lineTo(lt.x, lt.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(rbm.x, rbm.y); ctx.stroke();
    ctx.strokeStyle = L.shake && now - L.shake < 400 ? "#fff7cc" : "#f8fafc";
    ctx.lineWidth = postW;
    ctx.beginPath(); ctx.moveTo(lb.x, lb.y); ctx.lineTo(lt.x, lt.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(rbm.x, rbm.y); ctx.stroke();
    ctx.lineCap = "butt";

    // ---- Dive zones when keeping ----
    if (L.mode === "keep" && !A) {
      for (const z of [0, 1, 2, 3, 4, 5] as Zone[]) {
        const c = zoneCentre(z);
        const x0 = proj(g, c.x - 1 / 3 + 0.02, 0, 1).x, x1 = proj(g, c.x + 1 / 3 - 0.02, 0, 1).x;
        const yTop = proj(g, 0, z >= 3 ? 0.98 : 0.48, 1).y, yBot = proj(g, 0, z >= 3 ? 0.52 : 0.02, 1).y;
        const sel = L.chosen === z;
        ctx.fillStyle = sel ? "rgba(250,204,21,0.45)" : L.locked ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.16)";
        ctx.strokeStyle = sel ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.6)";
        ctx.lineWidth = sel ? 2.5 : 1;
        ctx.setLineDash(sel ? [] : [5, 4]);
        roundRect(ctx, x0, yTop, x1 - x0, yBot - yTop, 6);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        if (sel) {
          ctx.fillStyle = "#111";
          ctx.font = `900 ${Math.round(gh * 0.2)}px system-ui`;
          ctx.fillText("🧤", (x0 + x1) / 2, (yTop + yBot) / 2);
        }
      }
    }

    // ---- Ball in front of the line ----
    if (!ballBehind) drawBall(ctx, g, ball);

    // ---- The player's flick: a soft glowing trail ----
    const trail = L.trail.filter((p) => now - p.at < (L.swiping ? 5000 : 600));
    if (trail.length > 1) {
      ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const fade = L.swiping ? 1 : Math.max(0, 1 - (now - L.released) / 600);
        ctx.strokeStyle = `rgba(253,224,71,${(0.15 + 0.6 * (i / trail.length)) * fade})`;
        ctx.lineWidth = 3 + 7 * (i / trail.length);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    // Aim hint: a pulsing ring under the ball when it's your kick
    if (L.mode === "shoot" && !L.locked && !A && !L.swiping) {
      const p = proj(g, 0, 0, 0);
      const k = 1 + 0.15 * Math.sin(now / 200);
      ctx.strokeStyle = "rgba(250,204,21,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - g.rb, g.rb * 1.6 * k, 0, Math.PI * 2); ctx.stroke();
      // A finger hint arrow
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - g.rb * 3); ctx.lineTo(p.x, groundY(g, 0.55)); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ---- Input ----
  const pt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, at: performance.now() };
  };
  const down = (e: React.PointerEvent) => {
    const L = live.current;
    if (L.anim || L.locked || L.mode === "watch") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    L.swiping = true;
    L.trail = [pt(e)];
  };
  const move = (e: React.PointerEvent) => {
    const L = live.current;
    if (!L.swiping) return;
    L.trail.push(pt(e));
    if (L.trail.length > 80) L.trail.shift();
  };
  const up = (e: React.PointerEvent) => {
    const L = live.current;
    if (!L.swiping) return;
    L.swiping = false;
    L.released = performance.now();
    const g = geo(size.W, size.H);
    const pts = [...L.trail, pt(e)];
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = a.y - b.y;
    const len = Math.hypot(dx, dy);
    if (L.mode === "keep") {
      let z: Zone | null = null;
      if (len < 18) {
        // A tap: the zone under the finger (a little forgiving around the frame)
        const gx = (b.x - g.cx) / (g.gw / 2);
        const gyy = (g.gy - b.y) / g.gh;
        if (Math.abs(gx) <= 1.25 && gyy >= -0.35 && gyy <= 1.35) z = zoneAt(Math.max(-0.99, Math.min(0.99, gx)), Math.max(0, Math.min(0.99, gyy)));
      } else {
        // A swipe: its direction picks the zone
        const col = dx < -len * 0.35 ? 0 : dx > len * 0.35 ? 2 : 1;
        const row = dy > len * 0.55 && len > 90 ? 1 : 0;
        z = (row * 3 + col) as Zone;
      }
      if (z !== null) { setChosen(z); live.current.chosen = z; soundManager.buttonClick(); onDive?.(z); }
      return;
    }
    if (L.mode !== "shoot") return;
    if (dy < 30) return; // not a flick towards the goal
    const shot = shotFromSwipe(g, pts);
    onShoot?.(shot);
  };

  const outcomeText = banner ? labels[banner.outcome] : null;
  const good = banner?.outcome === "goal";
  return (
    <div ref={wrap} className="relative w-full select-none touch-none rounded-2xl overflow-hidden border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]" data-testid="football-pitch">
      <canvas ref={canvas} style={{ width: size.W, height: size.H, display: "block" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { live.current.swiping = false; }} data-testid="football-canvas" />
      {hint && !banner && (
        <div className="absolute inset-x-0 bottom-[30%] flex justify-center pointer-events-none">
          <span className="px-3 py-1.5 rounded-full bg-black/55 text-white/90 text-xs font-bold backdrop-blur">{hint}</span>
        </div>
      )}
      <AnimatePresence>
        {banner && outcomeText && (
          <motion.div key={banner.id + (banner.slow ? "s" : "")} className="absolute inset-x-0 top-[34%] flex flex-col items-center pointer-events-none"
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ opacity: 0, scale: 1.3 }}
            transition={{ type: "spring", stiffness: 380, damping: 16 }} data-testid="football-banner">
            {banner.slow && <span className="mb-1 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black tracking-widest">● {labels.replay}</span>}
            <span className={`font-sans font-black italic text-[2.6rem] sm:text-6xl leading-none tracking-tight px-4 py-1.5 rounded-2xl whitespace-nowrap ${good ? "text-yellow-300 bg-gradient-to-r from-red-700/80 via-red-600/90 to-red-700/80" : banner.outcome === "save" ? "text-white bg-gradient-to-r from-sky-800/80 via-sky-600/90 to-sky-800/80" : "text-white bg-gradient-to-r from-zinc-800/80 via-zinc-600/90 to-zinc-800/80"}`}
              style={{ textShadow: "0 3px 0 rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.35)" }}>{outcomeText}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Turns a flick into a shot: direction = aim, speed = power, length = height, a hook at the end = bend */
export function shotFromSwipe(g: Geo, pts: { x: number; y: number; at: number }[]): ShotChoice {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  // Aim: where the swipe's straight line would cross the goal line
  const toGoal = g.spotY - g.gy;
  const x = (dx / Math.max(1, dy)) * toGoal / (g.gw / 2) * 0.9;
  // Height grows with the length of the swipe
  const y = Math.max(0.05, Math.min(1.3, (len / (0.5 * g.H)) * 0.95 - 0.05));
  // Power: how fast the finger moved (over the last part of the gesture, where the flick is)
  const dur = Math.max(40, b.at - a.at);
  const speed = len / dur / (g.W / 400); // px per ms at a 400px-wide screen
  const power = Math.max(0.05, Math.min(1, (speed - 0.2) / 2.1));
  // Bend: how far the middle of the swipe bows away from the straight line
  let curve = 0;
  if (pts.length > 4 && len > 40) {
    const mid = pts[Math.floor(pts.length / 2)];
    const cross = ((mid.x - a.x) * (b.y - a.y) - (mid.y - a.y) * (b.x - a.x)) / len; // + when the bow is to the left
    curve = Math.abs(cross) < 5 ? 0 : Math.max(-1, Math.min(1, cross / (0.07 * g.W)));
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(Math.max(-1.6, Math.min(1.6, x))), y: r(y), power: r(power), curve: r(curve) };
}
export { geo as pitchGeo };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBall(ctx: CanvasRenderingContext2D, g: Geo, b: { x: number; y: number; t: number; spin: number }) {
  const p = proj(g, b.x, b.y, b.t);
  const r = g.rb * s(b.t);
  // Shadow on the grass
  const sh = proj(g, b.x, 0, b.t);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * Math.max(0.2, 1 - b.y * 0.6)})`;
  ctx.beginPath(); ctx.ellipse(sh.x, sh.y, r * 1.05, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  const cy = p.y - r;
  const grad = ctx.createRadialGradient(p.x - r * 0.35, cy - r * 0.35, r * 0.1, p.x, cy, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.7, "#e5e7eb");
  grad.addColorStop(1, "#9ca3af");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill();
  // Spinning panels
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#111827";
  for (let i = 0; i < 5; i++) {
    const ang = b.spin + (i * Math.PI * 2) / 5;
    const px = p.x + Math.cos(ang) * r * 0.62, py = cy + Math.sin(ang) * r * 0.62 * 0.9;
    pent(ctx, px, py, r * 0.26, ang);
  }
  pent(ctx, p.x + Math.cos(b.spin * 0.7) * r * 0.1, cy + Math.sin(b.spin * 0.7) * r * 0.1, r * 0.3, b.spin);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.stroke();
}
function pent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * Math.PI * 2) / 5;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawKeeper(ctx: CanvasRenderingContext2D, g: Geo, pose: ReturnType<typeof divePose>, idle: number, kit: ReturnType<typeof kitOf>) {
  const t = 0.985;
  const unit = g.gh * S(t); // one goal height in pixels at the keeper
  const hip = proj(g, pose.x, 0.36 - pose.crouch * 0.12 + pose.y + idle * 0.2, t);
  const foot = proj(g, pose.x, 0, t);
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(foot.x, foot.y, unit * 0.18, unit * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate((pose.rot * Math.PI) / 180);
  const U = unit;
  const limb = (x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0 * U, y0 * U); ctx.lineTo(x1 * U, y1 * U); ctx.stroke();
  };
  const legSpread = 0.08 + pose.crouch * 0.12 + Math.abs(pose.rot) / 900;
  // Legs (socks + shorts)
  limb(-0.05, 0, -legSpread, 0.34 - pose.crouch * 0.1, U * 0.075, "#111827");
  limb(0.05, 0, legSpread, 0.34 - pose.crouch * 0.1, U * 0.075, "#111827");
  limb(-0.05, 0, -legSpread * 0.8, 0.17, U * 0.085, kit.shorts === "#ffffff" ? "#e5e7eb" : "#1f2937");
  limb(0.05, 0, legSpread * 0.8, 0.17, U * 0.085, kit.shorts === "#ffffff" ? "#e5e7eb" : "#1f2937");
  // Arms: ready (out and up a little) → stretched above the head when diving
  const ar = pose.arms;
  const armY = -0.24 - Math.max(0, ar) * 0.18;
  const reachX = 0.2 * (1 - Math.max(0, ar)) + 0.05;
  const handY = -0.2 - Math.max(0, ar) * 0.38 + Math.min(0, ar) * -0.3;
  limb(-0.09, armY, -reachX - 0.06, handY, U * 0.06, kit.gk);
  limb(0.09, armY, reachX + 0.06, handY, U * 0.06, kit.gk);
  // Gloves
  ctx.fillStyle = "#f8fafc";
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * (reachX + 0.06) * U, handY * U, U * 0.045, 0, Math.PI * 2); ctx.fill(); }
  // Torso
  ctx.fillStyle = kit.gk;
  roundRect(ctx, -0.12 * U, -0.36 * U, 0.24 * U, 0.38 * U, 0.06 * U);
  ctx.fill();
  ctx.fillStyle = kit.trim;
  ctx.fillRect(-0.12 * U, -0.2 * U, 0.24 * U, 0.03 * U);
  // Head
  ctx.fillStyle = "#f2c9a0";
  ctx.beginPath(); ctx.arc(0, -0.44 * U, 0.07 * U, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1c1917";
  ctx.beginPath(); ctx.arc(0, -0.465 * U, 0.068 * U, Math.PI, 0); ctx.fill();
  ctx.restore();
}
