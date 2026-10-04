import { BALL_R, POCKETS, TABLE_L, TABLE_W, HEAD_STRING_X, type Ball } from "@shared/pool/engine";

/**
 * Draws the pool table on a canvas. The table is shown upright (long side vertical) so it
 * fills a phone screen: table x runs down the screen, table y runs across.
 */

export const RAIL = 11; // cm of wooden rail drawn around the cloth
export const VIEW_W = TABLE_W + 2 * RAIL;
export const VIEW_H = TABLE_L + 2 * RAIL;

export const BALL_COLORS: Record<number, string> = {
  0: "#f8fafc", 1: "#facc15", 2: "#1d4ed8", 3: "#dc2626", 4: "#7c3aed", 5: "#f97316", 6: "#15803d", 7: "#7f1d1d", 8: "#0a0a0a",
};
export const colorOf = (n: number) => BALL_COLORS[n > 8 ? n - 8 : n];

export interface View {
  scale: number; // CSS pixels per cm
  dpr: number;
}

/** Table cm -> canvas CSS pixels */
export const toScreen = (v: View, x: number, y: number) => ({ sx: (RAIL + y) * v.scale, sy: (RAIL + x) * v.scale });
/** Canvas CSS pixels -> table cm */
export const toTable = (v: View, sx: number, sy: number) => ({ x: sy / v.scale - RAIL, y: sx / v.scale - RAIL });

export interface Aim {
  /** unit aim direction in table coordinates */
  dx: number;
  dy: number;
  power: number; // 0..1, pulls the cue back
}

export interface Overlay {
  aim: Aim | null;
  /** Draw the guide (ghost ball and paths) */
  guide: boolean;
  /** Cue ball being placed by hand, and whether the spot is allowed */
  placing: { x: number; y: number; ok: boolean } | null;
  /** Show the head string (for the break) */
  kitchen: boolean;
  /** Highlight these balls (legal targets) */
  highlight: number[];
  /** Fade (0..1) for balls dropping into pockets, by ball number */
  dropping: Map<number, { x: number; y: number; t: number }>;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBall(ctx: CanvasRenderingContext2D, n: number, cx: number, cy: number, r: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(cx + r * 0.25, cy + r * 0.3, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  ctx.save();
  ctx.clip();
  if (n > 8) {
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = colorOf(n); ctx.fillRect(cx - r, cy - r * 0.55, 2 * r, r * 1.1);
  } else {
    ctx.fillStyle = colorOf(n); ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  // shading
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.35, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
  if (n > 0) {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `800 ${Math.max(6, r * (n > 9 ? 0.62 : 0.72))}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(n), cx, cy + r * 0.04);
  }
  ctx.restore();
}

/** Where the aim line first touches a ball or a cushion */
export function traceAim(balls: Ball[], from: { x: number; y: number }, dx: number, dy: number) {
  let best = Infinity, hit: Ball | null = null;
  for (const b of balls) {
    if (b.potted || b.n === 0) continue;
    // ray-circle (radius 2R around the target centre)
    const fx = from.x - b.x, fy = from.y - b.y;
    const bq = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - 4 * BALL_R * BALL_R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0.01 && t < best) { best = t; hit = b; }
  }
  // cushions
  let tc = Infinity;
  if (dx > 0) tc = Math.min(tc, (TABLE_L - BALL_R - from.x) / dx);
  if (dx < 0) tc = Math.min(tc, (BALL_R - from.x) / dx);
  if (dy > 0) tc = Math.min(tc, (TABLE_W - BALL_R - from.y) / dy);
  if (dy < 0) tc = Math.min(tc, (BALL_R - from.y) / dy);
  if (hit && best < tc) {
    const gx = from.x + dx * best, gy = from.y + dy * best;
    const nx = (hit.x - gx) / (2 * BALL_R), ny = (hit.y - gy) / (2 * BALL_R);
    return { end: { x: gx, y: gy }, ghost: true, target: hit, nx, ny };
  }
  return { end: { x: from.x + dx * tc, y: from.y + dy * tc }, ghost: false, target: null as Ball | null, nx: 0, ny: 0 };
}

export function drawTable(ctx: CanvasRenderingContext2D, v: View, balls: Ball[], o: Overlay) {
  const s = v.scale;
  const W = VIEW_W * s, H = VIEW_H * s;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Wooden frame
  const wood = ctx.createLinearGradient(0, 0, W, 0);
  wood.addColorStop(0, "#5b2a12"); wood.addColorStop(0.5, "#8a4a22"); wood.addColorStop(1, "#5b2a12");
  ctx.fillStyle = wood;
  roundRect(ctx, 0, 0, W, H, RAIL * s * 0.9); ctx.fill();
  ctx.strokeStyle = "rgba(250,204,21,0.55)"; ctx.lineWidth = 1.5;
  roundRect(ctx, 1, 1, W - 2, H - 2, RAIL * s * 0.9); ctx.stroke();

  // Diamonds on the rails
  ctx.fillStyle = "#fde68a";
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const y = RAIL * s + (TABLE_L * s * i) / 8;
    for (const x of [RAIL * s * 0.5, W - RAIL * s * 0.5]) { ctx.beginPath(); ctx.arc(x, y, s * 0.9, 0, Math.PI * 2); ctx.fill(); }
  }
  for (let i = 1; i < 4; i++) {
    const x = RAIL * s + (TABLE_W * s * i) / 4;
    for (const y of [RAIL * s * 0.5, H - RAIL * s * 0.5]) { ctx.beginPath(); ctx.arc(x, y, s * 0.9, 0, Math.PI * 2); ctx.fill(); }
  }

  // Cloth
  const felt = ctx.createRadialGradient(W / 2, H / 2, s * 20, W / 2, H / 2, H * 0.62);
  felt.addColorStop(0, "#1a8f50"); felt.addColorStop(1, "#0b5a32");
  ctx.fillStyle = felt;
  ctx.fillRect(RAIL * s, RAIL * s, TABLE_W * s, TABLE_L * s);
  // Cushion lip
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = s * 1.6;
  ctx.strokeRect(RAIL * s + s * 0.8, RAIL * s + s * 0.8, TABLE_W * s - s * 1.6, TABLE_L * s - s * 1.6);

  // Head string and foot spot
  ctx.strokeStyle = o.kitchen ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.12)";
  ctx.setLineDash([s * 2, s * 2]); ctx.lineWidth = 1;
  const hs = toScreen(v, HEAD_STRING_X, 0), he = toScreen(v, HEAD_STRING_X, TABLE_W);
  ctx.beginPath(); ctx.moveTo(hs.sx, hs.sy); ctx.lineTo(he.sx, he.sy); ctx.stroke();
  ctx.setLineDash([]);
  const fs = toScreen(v, (TABLE_L * 3) / 4, TABLE_W / 2);
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(fs.sx, fs.sy, s * 0.7, 0, Math.PI * 2); ctx.fill();

  // Pockets
  for (const p of POCKETS) {
    const c = toScreen(v, p.x, p.y);
    ctx.fillStyle = "#050505";
    ctx.beginPath(); ctx.arc(c.sx, c.sy, s * 5.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(250,204,21,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.sx, c.sy, s * 5.6, 0, Math.PI * 2); ctx.stroke();
  }

  // Balls dropping into pockets
  for (const [n, d] of o.dropping) {
    const c = toScreen(v, d.x, d.y);
    drawBall(ctx, n, c.sx, c.sy, BALL_R * s * (1 - d.t * 0.5), 1 - d.t);
  }

  // Aim guide (under the balls)
  const cue = balls.find((b) => b.n === 0 && !b.potted);
  const from = o.placing ?? (cue ? { x: cue.x, y: cue.y } : null);
  if (o.aim && from && o.guide) {
    const tr = traceAim(balls.filter((b) => b.n !== 0), from, o.aim.dx, o.aim.dy);
    const a = toScreen(v, from.x, from.y), e = toScreen(v, tr.end.x, tr.end.y);
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(e.sx, e.sy); ctx.stroke();
    if (tr.ghost && tr.target) {
      ctx.beginPath(); ctx.arc(e.sx, e.sy, BALL_R * s, 0, Math.PI * 2); ctx.stroke();
      // where the object ball goes, and roughly where the cue ball goes
      const t = toScreen(v, tr.target.x, tr.target.y);
      const len = 22 * s;
      const tx = tr.ny, ty = tr.nx; // screen axes are swapped
      ctx.strokeStyle = "rgba(250,204,21,0.95)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.sx, t.sy); ctx.lineTo(t.sx + tx * len, t.sy + ty * len); ctx.stroke();
      const dot = o.aim.dx * tr.nx + o.aim.dy * tr.ny;
      const px = o.aim.dx - dot * tr.nx, py = o.aim.dy - dot * tr.ny;
      const pl = Math.sqrt(px * px + py * py);
      if (pl > 0.05) {
        ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(e.sx, e.sy); ctx.lineTo(e.sx + (py / pl) * len * 0.7, e.sy + (px / pl) * len * 0.7); ctx.stroke();
      }
    }
  }

  // Balls
  for (const b of balls) {
    if (b.potted) continue;
    if (b.n === 0 && o.placing) continue;
    const c = toScreen(v, b.x, b.y);
    if (o.highlight.includes(b.n)) {
      ctx.strokeStyle = "rgba(250,204,21,0.8)"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c.sx, c.sy, BALL_R * s + 2.2, 0, Math.PI * 2); ctx.stroke();
    }
    drawBall(ctx, b.n, c.sx, c.sy, BALL_R * s);
  }
  if (o.placing) {
    const c = toScreen(v, o.placing.x, o.placing.y);
    drawBall(ctx, 0, c.sx, c.sy, BALL_R * s, o.placing.ok ? 1 : 0.55);
    ctx.strokeStyle = o.placing.ok ? "rgba(74,222,128,0.9)" : "rgba(248,113,113,0.95)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.sx, c.sy, BALL_R * s + 4, 0, Math.PI * 2); ctx.stroke();
  }

  // Cue stick
  if (o.aim && from) {
    const c = toScreen(v, from.x, from.y);
    const sdx = o.aim.dy, sdy = o.aim.dx; // screen direction of the shot
    const gap = (BALL_R + 1.2 + o.aim.power * 22) * s;
    const len = 120 * s;
    const x1 = c.sx - sdx * gap, y1 = c.sy - sdy * gap;
    const x2 = c.sx - sdx * (gap + len), y2 = c.sy - sdy * (gap + len);
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, "#f5f5f4"); grad.addColorStop(0.03, "#1e3a8a"); grad.addColorStop(0.05, "#e7c27d");
    grad.addColorStop(0.65, "#b7793a"); grad.addColorStop(0.7, "#111"); grad.addColorStop(1, "#3b1d0e");
    ctx.strokeStyle = grad; ctx.lineCap = "round";
    ctx.lineWidth = s * 1.3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineCap = "butt";
  }
}
