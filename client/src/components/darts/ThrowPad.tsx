import { useEffect, useRef, useState } from "react";
import { STEADY_FROM_MS, STEADY_UNTIL_MS, wobbleRadius } from "@shared/darts";
import { useLang } from "@/lib/lang-context";

/** A flick at this speed (screen heights per second) is a perfect throw */
export const IDEAL_SPEED = 2.0;

export interface Flick { power: number; drift: number; holdMs: number }

/**
 * The hand: press and hold to steady the arm (the crosshair settles, then tires), then flick
 * upward to throw. Flick speed sets the height (soft drops low, hard flies high) and a
 * sideways flick pulls the dart left or right.
 */
export function ThrowPad({ enabled, holdStart, onThrow, onHoldChange, last, color = "#facc15" }: {
  enabled: boolean;
  /** Shared with the board so the crosshair sways with the hold */
  holdStart: React.MutableRefObject<number | null>;
  onThrow: (f: Flick) => void;
  onHoldChange?: (holdMs: number | null) => void;
  /** The last flick, for the speed meter */
  last: Flick | null;
  color?: string;
}) {
  const { tr } = useLang();
  const pad = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const g = useRef<{ id: number; t0: number; x0: number; y0: number; samples: { t: number; x: number; y: number }[]; flickAt: number | null } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [lift, setLift] = useState(0);

  // The steadiness ring fills while holding: green in the steady window, red once the arm tires
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const hs = holdStart.current;
      const ring = ringRef.current;
      if (ring) {
        const t = hs == null ? 0 : now - hs;
        const r = wobbleRadius(t);
        const steady = Math.max(0, Math.min(1, (22 - r) / 17));
        ring.setAttribute("stroke-dasharray", `${(steady * 100).toFixed(1)} 100`);
        ring.setAttribute("stroke", hs == null ? "#ffffff33" : t < STEADY_FROM_MS ? "#facc15" : t <= STEADY_UNTIL_MS ? "#4ade80" : "#f87171");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [holdStart]);

  const end = () => {
    g.current = null;
    holdStart.current = null;
    onHoldChange?.(null);
    setLift(0);
  };

  const down = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const now = performance.now();
    g.current = { id: e.pointerId, t0: now, x0: e.clientX, y0: e.clientY, samples: [{ t: now, x: e.clientX, y: e.clientY }], flickAt: null };
    holdStart.current = now;
    onHoldChange?.(0);
    setHint(null);
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const now = performance.now();
    s.samples.push({ t: now, x: e.clientX, y: e.clientY });
    if (s.samples.length > 40) s.samples.shift();
    const up = s.y0 - e.clientY;
    if (s.flickAt == null && up > 14) {
      s.flickAt = now;
      // The arm is committed: the sway freezes where it is
      onHoldChange?.(now - s.t0);
    }
    setLift(Math.max(0, Math.min(60, up)));
  };
  const release = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const now = performance.now();
    s.samples.push({ t: now, x: e.clientX, y: e.clientY });
    // Speed over the last ~90 ms of the movement
    const recent = s.samples.filter((p) => now - p.t <= 90);
    const first = recent[0] ?? s.samples[0];
    const dt = Math.max(16, now - first.t);
    const vy = (first.y - e.clientY) / dt; // px per ms, upward positive
    const vx = (e.clientX - first.x) / dt;
    const totalUp = s.y0 - e.clientY;
    const holdMs = (s.flickAt ?? now) - s.t0;
    end();
    const h = Math.min(window.innerHeight || 800, 1000);
    const speed = (vy * 1000) / h; // screen heights per second
    if (totalUp < 30 || speed < 0.45) {
      setHint(tr("Vuốt nhanh lên trên để ném!", "Flick upward to throw!", "向上快速滑動即可擲出！"));
      return;
    }
    onThrow({ power: Math.round((speed / IDEAL_SPEED) * 1000) / 1000, drift: Math.round((vx / Math.max(0.05, vy)) * 1000) / 1000, holdMs: Math.round(holdMs) });
  };

  const verdict = last ? (last.power < 0.85 ? "soft" : last.power > 1.15 ? "hard" : "good") : null;
  const marker = last ? Math.max(0, Math.min(1, (last.power - 0.4) / 1.2)) : null; // 0.4 → 1.6

  return (
    <div className="w-full flex items-stretch gap-2">
      <div
        ref={pad}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={end}
        className={`relative flex-1 h-[104px] rounded-2xl border overflow-hidden select-none ${enabled ? "bg-gradient-to-b from-purple-900/70 to-black/60 border-yellow-400/40 active:border-yellow-300" : "bg-black/30 border-white/10 opacity-50"}`}
        style={{ touchAction: "none" }}
        data-testid="darts-throwpad"
      >
        <div className="absolute inset-x-0 top-1.5 text-center text-[10px] font-black uppercase tracking-widest text-yellow-200/70 pointer-events-none">
          {hint ?? (enabled ? tr("Giữ để ngắm vững · vuốt lên để ném", "Hold to steady · flick up to throw", "按住穩定 · 向上滑動擲出") : tr("Chờ lượt", "Wait for your turn", "等待回合"))}
        </div>
        {/* The dart in hand */}
        <svg viewBox="-30 -50 60 100" className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[86px] pointer-events-none" style={{ transform: `translate(-50%, ${-lift}px)` }}>
          <circle cx={0} cy={-12} r={16} fill="none" stroke="#ffffff22" strokeWidth={3} />
          <circle ref={ringRef} cx={0} cy={-12} r={16} fill="none" stroke="#ffffff33" strokeWidth={3} pathLength={100} strokeDasharray="0 100" transform="rotate(-90 0 -12)" strokeLinecap="round" />
          <line x1={0} y1={-34} x2={0} y2={-26} stroke="#e5e7eb" strokeWidth={1.6} strokeLinecap="round" />
          <line x1={0} y1={-26} x2={0} y2={-4} stroke="url(#pad-barrel)" strokeWidth={6} strokeLinecap="round" />
          <line x1={0} y1={-4} x2={0} y2={10} stroke="#27272a" strokeWidth={2.4} />
          <path d={`M0 6 L13 24 L0 20 L-13 24 Z`} fill={color} stroke="#fff" strokeWidth={0.8} />
          <defs>
            <linearGradient id="pad-barrel" x1="0" x2="1">
              <stop offset="0%" stopColor="#71717a" /><stop offset="45%" stopColor="#f4f4f5" /><stop offset="100%" stopColor="#52525b" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {/* Speed meter: where the last flick landed */}
      <div className="w-[64px] rounded-2xl bg-black/40 border border-white/10 p-1.5 flex flex-col items-center gap-1" data-testid="darts-speed">
        <span className="text-[9px] font-black uppercase text-white/50 leading-none">{tr("Lực", "Speed", "力道")}</span>
        <div ref={meterRef} className="relative flex-1 w-3 rounded-full overflow-hidden bg-gradient-to-t from-sky-500 via-emerald-400 to-red-500">
          <div className="absolute inset-x-0 bg-white/25" style={{ top: `${(1 - (1.15 - 0.4) / 1.2) * 100}%`, bottom: `${((0.85 - 0.4) / 1.2) * 100}%` }} />
          {marker != null && <div className="absolute -inset-x-1 h-1.5 bg-white rounded shadow" style={{ bottom: `calc(${marker * 100}% - 3px)` }} />}
        </div>
        <span className={`text-[9px] font-black leading-none ${verdict === "good" ? "text-emerald-300" : verdict ? "text-orange-300" : "text-white/30"}`}>
          {verdict === "good" ? tr("Chuẩn", "Perfect", "完美") : verdict === "soft" ? tr("Nhẹ", "Soft", "太輕") : verdict === "hard" ? tr("Mạnh", "Hard", "太重") : "—"}
        </span>
      </div>
    </div>
  );
}
