import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { hitLabel, RADII, type Hit } from "@shared/darts";
import { Dartboard, type BoardDart, type Flying, type Ghost } from "./Dartboard";
import { ThrowPad, type Flick } from "./ThrowPad";
import type { Callout } from "./callouts";
import { soundManager } from "@/lib/sound";

export interface ThrowRequest { x: number; y: number; power: number; drift: number; holdMs: number }

export interface StageHandle {
  /** Flies a dart to where the server says it landed; resolves when it has stuck */
  land: (hit: Hit, color: string) => Promise<void>;
  /** Pulls the darts out of the board */
  clear: () => void;
  /** Puts darts straight in the board (after a reload) */
  set: (hits: { hit: Hit; color: string }[]) => void;
  callout: (c: Callout | null) => void;
}

/** Is this landing within a hair of a wire (for the little "ting")? */
function nearWire(h: Hit) {
  const r = Math.hypot(h.x, h.y);
  if ([RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut].some((w) => Math.abs(r - w) < 1)) return true;
  if (r < RADII.outerBull || r > RADII.doubleOut) return false;
  const a = ((Math.atan2(h.x, -h.y) * 180) / Math.PI + 369) % 18;
  return (a < 0.5 || a > 17.5);
}

const TONES: Record<Callout["tone"], string> = {
  gold: "from-yellow-200 via-yellow-400 to-orange-500",
  red: "from-rose-200 via-red-400 to-red-600",
  green: "from-emerald-200 via-emerald-400 to-teal-500",
  white: "from-white via-slate-200 to-slate-400",
  max: "from-yellow-100 via-amber-300 to-red-500",
};

/**
 * The oche: the board, the throwing hand and everything that pops up over them.
 * The modes (computer, online, daily) tell it where each dart landed; it does the show.
 */
export const Stage = forwardRef<StageHandle, {
  canThrow: boolean;
  onThrow: (t: ThrowRequest) => void;
  color: string;
  ghost?: Ghost | null;
  /** Called as the player aims (for showing the opponent) */
  onAimLive?: (p: { x: number; y: number }, holdMs: number | null) => void;
  /** Darts left in this visit (the little dart icons) */
  dartsLeft?: number;
  /** Shown when it isn't the player's turn */
  idleText?: string;
  top?: ReactNode;
  /** Hide the throwing hand (spectators) */
  watchOnly?: boolean;
}>(function Stage({ canThrow, onThrow, color, ghost, onAimLive, dartsLeft, idleText, top, watchOnly }, ref) {
  const [darts, setDarts] = useState<BoardDart[]>([]);
  const [flying, setFlying] = useState<Flying | null>(null);
  const [aim, setAim] = useState<{ x: number; y: number }>({ x: 0, y: -103 });
  const [holding, setHolding] = useState(false);
  const [last, setLast] = useState<Flick | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null);
  const holdStart = useRef<number | null>(null);
  const landedResolve = useRef<(() => void) | null>(null);
  const flyingHit = useRef<{ hit: Hit; color: string; id: number } | null>(null);
  const ids = useRef(0);
  const calloutTimer = useRef<number>();

  const showCallout = useCallback((c: Callout | null) => {
    setCallout(c);
    clearTimeout(calloutTimer.current);
    if (c) calloutTimer.current = window.setTimeout(() => setCallout(null), c.tone === "max" ? 2600 : 1500);
  }, []);

  useImperativeHandle(ref, () => ({
    land: (hit, c) => new Promise<void>((resolve) => {
      const id = ++ids.current;
      flyingHit.current = { hit, color: c, id };
      landedResolve.current = resolve;
      soundManager.dartWhoosh();
      setFlying({ id, hit, color: c });
    }),
    clear: () => setDarts([]),
    set: (list) => setDarts(list.map((d, i) => ({ ...d.hit, id: `r${i}-${++ids.current}`, color: d.color }))),
    callout: showCallout,
  }), [showCallout]);

  const onLanded = useCallback(() => {
    const f = flyingHit.current;
    flyingHit.current = null;
    setFlying(null);
    if (f) {
      const out = f.hit.ring === "miss";
      if (out) soundManager.dartMiss(); else soundManager.dartThunk(nearWire(f.hit));
      setDarts((list) => [...list, { ...f.hit, id: f.id, color: f.color, landedAt: Date.now() }]);
      setPop({ id: f.id, text: `${hitLabel(f.hit)}${f.hit.score && f.hit.ring !== "single" ? ` · ${f.hit.score}` : ""}` });
    }
    const r = landedResolve.current;
    landedResolve.current = null;
    // Let the wobble play for a moment before whatever comes next
    window.setTimeout(() => r?.(), 380);
  }, []);

  const busy = !!flying;
  const enabled = canThrow && !busy && !watchOnly;

  return (
    <div className="w-full flex flex-col gap-1.5" data-testid="darts-stage">
      {top}
      <div className="relative w-full aspect-square rounded-[28px] overflow-hidden border border-yellow-400/25 shadow-[0_18px_50px_rgba(0,0,0,0.55)] bg-[#0c0418]">
        <Dartboard
          darts={darts}
          flying={flying}
          onLanded={onLanded}
          aim={canThrow && !watchOnly ? aim : null}
          holdStart={holdStart}
          zoomed={holding && enabled}
          interactive={enabled}
          onAim={(p) => { setAim(p); onAimLive?.(p, null); }}
          ghost={ghost}
        />
        {/* Darts left this visit */}
        {dartsLeft != null && (
          <div className="absolute left-2.5 top-2.5 flex gap-1 pointer-events-none" data-testid="darts-left">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-2 h-6 rounded-full border border-black/40 ${i < dartsLeft ? "" : "opacity-20"}`} style={{ background: `linear-gradient(${color}, #52525b)` }} />
            ))}
          </div>
        )}
        {/* The score of the dart that just landed */}
        <AnimatePresence>
          {pop && (
            <motion.div key={pop.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              onAnimationComplete={() => window.setTimeout(() => setPop((p) => (p?.id === pop.id ? null : p)), 900)}
              className="absolute right-2.5 top-2.5 px-2.5 py-1 rounded-full bg-black/70 border border-white/20 font-mono font-black text-sm text-white pointer-events-none" data-testid="darts-pop">
              {pop.text}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Big callouts */}
        <AnimatePresence>
          {callout && (
            <motion.div key={callout.id} className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center" data-testid="darts-callout"
              initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.3 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
              {callout.tone === "max" && <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(250,204,21,0.35),transparent_65%)]" />}
              <div className={`relative font-display leading-[0.95] bg-gradient-to-b ${TONES[callout.tone]} bg-clip-text text-transparent drop-shadow-[0_4px_0_rgba(0,0,0,0.75)] ${callout.tone === "max" ? "text-[2.6rem]" : "text-5xl"}`}
                style={{ WebkitTextStroke: "1px rgba(0,0,0,0.35)" }}>
                {callout.big}
              </div>
              {callout.small && <div className="relative mt-1 px-3 py-0.5 rounded-full bg-black/60 text-white font-black text-sm">{callout.small}</div>}
            </motion.div>
          )}
        </AnimatePresence>
        {!enabled && !busy && idleText && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-3 py-1 rounded-full bg-black/65 text-xs font-black text-white/85" data-testid="darts-idle">{idleText}</span>
          </div>
        )}
      </div>
      {!watchOnly && (
        <ThrowPad
          enabled={enabled}
          holdStart={holdStart}
          last={last}
          color={color}
          onHoldChange={(ms) => { setHolding(ms !== null); onAimLive?.(aim, ms); }}
          onThrow={(f) => { setLast(f); onThrow({ x: aim.x, y: aim.y, power: f.power, drift: f.drift, holdMs: f.holdMs }); }}
        />
      )}
    </div>
  );
});
