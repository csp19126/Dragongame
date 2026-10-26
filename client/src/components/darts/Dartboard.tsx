import { memo, useEffect, useMemo, useRef } from "react";
import { SEGMENTS, RADII, wobbleRadius, type Hit } from "@shared/darts";

/**
 * The dartboard: regulation segments, wires and a cork-like texture, drawn in millimetres
 * (centre 0,0; the 20 at the top). The view glides in toward the aim point when zoomed.
 * Everything that moves every frame (sway, zoom, flight, wobble) is written straight to the
 * SVG through refs, so React only re-renders when darts land.
 */

export interface BoardDart extends Hit { id: string | number; color: string; landedAt?: number; faded?: boolean }
export interface Flying { id: string | number; hit: Hit; color: string }
export interface Ghost { x: number; y: number; hold: number }

const FULL = 250; // half-width of the full view (mm)
const ZOOM = 2.1;

/** The crosshair sway: a lazy figure-of-eight of radius R (the same R the server scatters with) */
export function swayAt(tMs: number, r: number) {
  const t = tMs / 1000;
  return {
    x: r * (0.72 * Math.sin(1.9 * t + 0.4) + 0.28 * Math.sin(4.3 * t)),
    y: r * (0.72 * Math.cos(1.37 * t) + 0.28 * Math.sin(3.7 * t + 1)),
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number) => [r * Math.sin(rad(deg)), -r * Math.cos(rad(deg))] as const;
function sector(r1: number, r2: number, a1: number, a2: number) {
  const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r2} ${r2} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${r1} ${r1} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}

/** The static board, drawn once */
const BoardFace = memo(function BoardFace() {
  const dots = useMemo(() => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 34 }, () => ({ x: r() * 24, y: r() * 24, r: 0.25 + r() * 0.55, o: 0.15 + r() * 0.35, light: r() > 0.55 }));
  }, []);
  return (
    <g>
      <defs>
        <pattern id="dart-cork" width="24" height="24" patternUnits="userSpaceOnUse">
          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.light ? "#fff3d6" : "#000"} opacity={d.o} />)}
        </pattern>
        <radialGradient id="dart-cabinet" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#3b1a63" />
          <stop offset="85%" stopColor="#1c0b33" />
          <stop offset="100%" stopColor="#0c0418" />
        </radialGradient>
        <radialGradient id="dart-light" cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff7d6" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#fff7d6" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id="dart-barrel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4f4f5" />
          <stop offset="50%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#52525b" />
        </linearGradient>
      </defs>
      {/* Cabinet and the gold rim */}
      <circle r={248} fill="url(#dart-cabinet)" />
      <circle r={236} fill="none" stroke="#facc15" strokeOpacity={0.55} strokeWidth={2.5} />
      <circle r={RADII.board} fill="#16110f" />
      {/* Segments */}
      {SEGMENTS.map((n, i) => {
        const a1 = i * 18 - 9, a2 = i * 18 + 9;
        const dark = i % 2 === 0;
        const single = dark ? "#1d1714" : "#eedcb3";
        const ring = dark ? "#c8202f" : "#13804a";
        return (
          <g key={n}>
            <path d={sector(RADII.outerBull, RADII.trebleIn, a1, a2)} fill={single} />
            <path d={sector(RADII.trebleIn, RADII.trebleOut, a1, a2)} fill={ring} />
            <path d={sector(RADII.trebleOut, RADII.doubleIn, a1, a2)} fill={single} />
            <path d={sector(RADII.doubleIn, RADII.doubleOut, a1, a2)} fill={ring} />
          </g>
        );
      })}
      <circle r={RADII.outerBull} fill="#13804a" />
      <circle r={RADII.bull} fill="#c8202f" />
      {/* Cork texture */}
      <circle r={RADII.doubleOut} fill="url(#dart-cork)" />
      {/* Wires */}
      <g stroke="#d4d4d8" strokeWidth={0.9} fill="none" opacity={0.9}>
        {[RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut].map((r) => <circle key={r} r={r} />)}
        {SEGMENTS.map((_, i) => {
          const [x1, y1] = pt(RADII.outerBull, i * 18 - 9), [x2, y2] = pt(RADII.doubleOut + 4, i * 18 - 9);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      {/* Numbers */}
      <g fontFamily="'Arial Black', Arial, sans-serif" fontWeight={900} fontSize={21} fill="#f5e6c8" textAnchor="middle" dominantBaseline="central">
        {SEGMENTS.map((n, i) => { const [x, y] = pt(197, i * 18); return <text key={n} x={x} y={y}>{n}</text>; })}
      </g>
      <circle r={RADII.board} fill="url(#dart-light)" pointerEvents="none" />
    </g>
  );
});

/** A dart stuck in the board, seen from the oche: tip at (0,0), flights drooping down-right */
function DartShape({ color, scale = 1 }: { color: string; scale?: number }) {
  return (
    <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
      <ellipse cx={7} cy={5} rx={8} ry={2.6} fill="#000" opacity={0.35} />
      <line x1={0} y1={0} x2={1.6} y2={4.6} stroke="#e5e7eb" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={1.6} y1={4.6} x2={5.2} y2={15} stroke="url(#dart-barrel)" strokeWidth={3.6} strokeLinecap="round" />
      <line x1={5.2} y1={15} x2={7.4} y2={21.5} stroke="#27272a" strokeWidth={1.7} strokeLinecap="round" />
      <path d="M7 20 L14.5 23 L9.5 33 L2.6 26.5 Z" fill={color} stroke="#fff" strokeWidth={0.6} strokeOpacity={0.8} />
      <path d="M7.2 21 L10 31" stroke="#000" strokeOpacity={0.25} strokeWidth={0.8} />
    </g>
  );
}

const tilt = (id: string | number) => {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 21) + 21) % 21 - 10;
};

/** A stuck dart; wobbles for a moment after it lands */
function StuckDart({ d }: { d: BoardDart }) {
  const ref = useRef<SVGGElement>(null);
  const base = tilt(d.id);
  useEffect(() => {
    if (!d.landedAt || Date.now() - d.landedAt > 900) return;
    let raf = 0;
    const loop = () => {
      const t = Date.now() - d.landedAt!;
      const a = t > 800 ? 0 : 11 * Math.exp(-t / 160) * Math.sin(t / 26);
      ref.current?.setAttribute("transform", `rotate(${(base + a).toFixed(2)})`);
      if (t <= 800) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [d.landedAt, base]);
  if (d.ring === "miss") return null;
  return (
    <g transform={`translate(${d.x} ${d.y})`} opacity={d.faded ? 0.45 : 1} data-testid="dart-stuck">
      <g ref={ref} transform={`rotate(${base})`}><DartShape color={d.color} /></g>
    </g>
  );
}

/** The dart in flight: from below the view, growing smaller as it flies to the board */
function FlyingDart({ f, onLanded, from }: { f: Flying; onLanded: (id: Flying["id"]) => void; from: { x: number; y: number } }) {
  const ref = useRef<SVGGElement>(null);
  const done = useRef(onLanded);
  done.current = onLanded;
  useEffect(() => {
    const start = performance.now();
    const DUR = 300;
    let raf = 0;
    const loop = (now: number) => {
      const k = Math.min(1, (now - start) / DUR);
      const e = k * k * (3 - 2 * k);
      const x = from.x + (f.hit.x - from.x) * e;
      const y = from.y + (f.hit.y - from.y) * e - Math.sin(Math.PI * k) * 40; // a little arc
      const s = 3.2 - 2.2 * e;
      ref.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-25 * (1 - e)).toFixed(1)}) scale(${s.toFixed(3)})`);
      if (k < 1) raf = requestAnimationFrame(loop);
      else done.current(f.id);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);
  return <g ref={ref} transform={`translate(${from.x} ${from.y}) scale(3.2)`}><DartShape color={f.color} /></g>;
}

function Crosshair({ color, innerRef }: { color: string; innerRef: React.RefObject<SVGGElement> }) {
  return (
    <g ref={innerRef} pointerEvents="none" style={{ display: "none" }}>
      <circle r={10} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={3.2} />
      <circle r={10} fill="none" stroke={color} strokeWidth={1.6} />
      {[[0, -16, 0, -6], [0, 6, 0, 16], [-16, 0, -6, 0], [6, 0, 16, 0]].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      ))}
      <circle r={1.8} fill="#ef4444" stroke="#fff" strokeWidth={0.5} />
    </g>
  );
}

export function Dartboard({
  darts, flying, onLanded, aim, holdStart, zoomed, interactive, onAim, ghost, showAim = true,
}: {
  darts: BoardDart[];
  flying: Flying | null;
  onLanded: (id: Flying["id"]) => void;
  /** Where the player is aiming (their crosshair), or null */
  aim: { x: number; y: number } | null;
  /** performance.now() when the player started holding steady (null when not holding) */
  holdStart: React.MutableRefObject<number | null>;
  zoomed: boolean;
  interactive: boolean;
  onAim?: (p: { x: number; y: number }, done: boolean) => void;
  /** The opponent's live aim */
  ghost?: Ghost | null;
  showAim?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const crossRef = useRef<SVGGElement>(null);
  const ghostRef = useRef<SVGGElement>(null);
  const vb = useRef({ x: -FULL, y: -FULL, w: FULL * 2 });
  const props = useRef({ aim, zoomed, ghost, showAim, flying });
  props.current = { aim, zoomed, ghost, showAim, flying };
  const ghostAt = useRef<{ g: Ghost; at: number } | null>(null);
  if (ghost && ghostAt.current?.g !== ghost) ghostAt.current = { g: ghost, at: performance.now() };
  const drag = useRef<{ id: number; sx: number; sy: number; ax: number; ay: number; moved: boolean } | null>(null);

  // One animation loop: the view eases toward its target, the crosshairs sway
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const p = props.current;
      const svg = svgRef.current;
      if (svg) {
        let tw = FULL * 2, tx = -FULL, ty = -FULL;
        if (p.zoomed && p.aim && !drag.current) {
          tw = (FULL * 2) / ZOOM;
          tx = Math.max(-FULL, Math.min(FULL - tw, p.aim.x - tw / 2));
          ty = Math.max(-FULL, Math.min(FULL - tw, p.aim.y - tw / 2));
        } else if (drag.current) {
          tw = vb.current.w; tx = vb.current.x; ty = vb.current.y;
        }
        const v = vb.current;
        const k = 0.14;
        v.x += (tx - v.x) * k; v.y += (ty - v.y) * k; v.w += (tw - v.w) * k;
        svg.setAttribute("viewBox", `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.w.toFixed(2)}`);
        const px = svg.clientWidth || 1;
        const unit = v.w / px; // mm per screen pixel
        const sc = Math.max(0.5, unit * 1.25);
        const c = crossRef.current;
        if (c) {
          if (p.aim && p.showAim && !p.flying) {
            const hs = holdStart.current;
            const r = wobbleRadius(hs == null ? 0 : now - hs);
            const s = swayAt(now, r);
            c.style.display = "";
            c.setAttribute("transform", `translate(${(p.aim.x + s.x).toFixed(2)} ${(p.aim.y + s.y).toFixed(2)}) scale(${sc.toFixed(3)})`);
          } else c.style.display = "none";
        }
        const g = ghostRef.current;
        if (g) {
          const gh = ghostAt.current;
          if (p.ghost && gh && !p.flying) {
            const s = swayAt(now + 3000, wobbleRadius(gh.g.hold + (gh.g.hold > 0 ? now - gh.at : 0)));
            g.style.display = "";
            g.setAttribute("transform", `translate(${(p.ghost.x + s.x).toFixed(2)} ${(p.ghost.y + s.y).toFixed(2)}) scale(${sc.toFixed(3)})`);
          } else g.style.display = "none";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [holdStart]);

  const toBoard = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const v = vb.current;
    return { x: v.x + ((clientX - rect.left) / rect.width) * v.w, y: v.y + ((clientY - rect.top) / rect.height) * v.w };
  };
  const clampAim = (p: { x: number; y: number }) => {
    const r = Math.hypot(p.x, p.y);
    return r > 240 ? { x: (p.x / r) * 240, y: (p.y / r) * 240 } : { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!interactive || !onAim) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const start = aim ?? { x: 0, y: -103 };
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ax: start.x, ay: start.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !onAim) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const svg = svgRef.current!;
    const unit = vb.current.w / (svg.clientWidth || 1);
    // Relative and a little finer than the finger, so the target isn't hidden under it
    onAim(clampAim({ x: d.ax + dx * unit * 0.65, y: d.ay + dy * unit * 0.65 }), false);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !onAim) return;
    drag.current = null;
    if (!d.moved) onAim(clampAim(toBoard(e.clientX, e.clientY)), true);
    else onAim(clampAim({ x: d.ax + (e.clientX - d.sx) * (vb.current.w / (svgRef.current!.clientWidth || 1)) * 0.65, y: d.ay + (e.clientY - d.sy) * (vb.current.w / (svgRef.current!.clientWidth || 1)) * 0.65 }), true);
  };

  const flyFrom = useMemo(() => ({ x: (flying?.hit.x ?? 0) * 0.4 + 40, y: 330 }), [flying?.id]);

  return (
    <svg
      ref={svgRef}
      viewBox={`${-FULL} ${-FULL} ${FULL * 2} ${FULL * 2}`}
      className={`w-full h-full select-none ${interactive ? "cursor-crosshair" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { drag.current = null; }}
      data-testid="dartboard"
    >
      <BoardFace />
      {darts.map((d) => <StuckDart key={d.id} d={d} />)}
      <Crosshair color="#7dd3fc" innerRef={ghostRef} />
      <Crosshair color="#fde047" innerRef={crossRef} />
      {flying && <FlyingDart key={flying.id} f={flying} onLanded={onLanded} from={flyFrom} />}
    </svg>
  );
}
