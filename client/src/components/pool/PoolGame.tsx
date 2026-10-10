import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  BALL_R, POCKETS, TABLE_W, HEAD_STRING_X, canPlaceCue, legalTargets, nearestPocket, simulate,
  type Ball, type GameState, type Shot,
} from "@shared/pool/engine";
import { drawTable, toTable, VIEW_H, VIEW_W, type Aim, type View } from "@/lib/poolDraw";
import { soundManager } from "@/lib/sound";
import { useLang } from "@/lib/lang-context";

export interface Playback { id: number; start: Ball[]; shot: Shot; onDone: () => void }

interface Props {
  game: GameState;
  /** The player using this screen may shoot now */
  canShoot: boolean;
  /** Pixels the page needs under the controls (an emote row, say) */
  reserveBelow?: number;
  onShoot: (shot: Shot, cue?: { x: number; y: number }) => void;
  /** A shot to animate (ours or the opponent's) */
  playback: Playback | null;
  /** The opponent's live aim (online) */
  remoteAim?: { aim: Aim; cue: { x: number; y: number } | null } | null;
  /** Reports our aim while we line up (online), throttled by the caller */
  onAim?: (aim: Aim, cue: { x: number; y: number } | null) => void;
  labels: { power: string; spin: string; top: string; centre: string; back: string; dragToAim: string; placeCue: string };
}


export function PoolGame({ game, canShoot, onShoot, playback, remoteAim, onAim, labels, reserveBelow = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 2, dpr: 1 });
  const { tr } = useLang();
  const [aim, setAim] = useState<{ dx: number; dy: number }>({ dx: 1, dy: 0 });
  const [power, setPower] = useState(0);
  const [spin, setSpin] = useState<-1 | 0 | 1>(0);
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [animBalls, setAnimBalls] = useState<Ball[] | null>(null);
  const dropping = useRef(new Map<number, { x: number; y: number; t: number }>());
  const drag = useRef<"aim" | "place" | null>(null);
  const powerDrag = useRef(false);
  const [badSpot, setBadSpot] = useState(false);
  useEffect(() => { if (!badSpot) return; const t = window.setTimeout(() => setBadSpot(false), 2200); return () => clearTimeout(t); }, [badSpot]);

  const cueBall = game.balls.find((b) => b.n === 0);
  const ballInHand = canShoot && game.ballInHand;
  const from = placing ?? (cueBall && !cueBall.potted ? { x: cueBall.x, y: cueBall.y } : null);
  const targets = useMemo(() => (canShoot ? legalTargets(game) : []), [canShoot, game]);

  // Size the table to the screen
  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? 360;
      // Fill the screen below whatever sits above the table, keeping the control row
      // (and anything the page puts under it) in view
      const top = (wrapRef.current?.getBoundingClientRect().top ?? 180) + window.scrollY;
      const maxH = Math.max(320, window.innerHeight - top - 60 - reserveBelow);
      const scale = Math.min(w / VIEW_W, maxH / VIEW_H);
      setView({ scale, dpr: Math.min(3, window.devicePixelRatio || 1) });
    };
    fit();
    const raf = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, [reserveBelow]);

  // A new turn: aim at the nearest legal ball, put the cue ball where it may go
  const turnKey = `${game.shots}-${game.turn}-${canShoot}`;
  useEffect(() => {
    if (!canShoot) { setPlacing(null); return; }
    let start = cueBall && !cueBall.potted ? { x: cueBall.x, y: cueBall.y } : { x: HEAD_STRING_X - 20, y: TABLE_W / 2 };
    if (game.ballInHand) {
      if (!canPlaceCue(game, start.x, start.y)) start = { x: HEAD_STRING_X - 20, y: TABLE_W / 2 };
      setPlacing(start);
    } else setPlacing(null);
    const ts = legalTargets(game).map((n) => game.balls.find((b) => b.n === n && !b.potted)!).filter(Boolean);
    const near = ts.sort((a, b) => (a.x - start.x) ** 2 + (a.y - start.y) ** 2 - ((b.x - start.x) ** 2 + (b.y - start.y) ** 2))[0];
    if (near) {
      const l = Math.hypot(near.x - start.x, near.y - start.y) || 1;
      setAim({ dx: (near.x - start.x) / l, dy: (near.y - start.y) / l });
    }
    setPower(0);
    setSpin(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // Playback of a shot, at 60 frames a second
  useEffect(() => {
    if (!playback) return;
    const sim = simulate(playback.start, playback.shot);
    const frames = sim.frames;
    const order = playback.start.map((b) => b.n);
    soundManager.reelStop();
    let raf = 0;
    const t0 = performance.now();
    let lastFrame = -1;
    const potTimes = new Map<number, number>();
    const step = (now: number) => {
      // A frame's timestamp can be a little before t0 on phones, so never go below frame 0
      const f = Math.max(0, Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * 60)));
      if (f !== lastFrame) {
        // Balls that just went down: start their drop
        for (let i = 0; i < order.length; i++) {
          const prev = lastFrame >= 0 ? frames[lastFrame][i] : frames[0][i];
          if (prev && !frames[f][i] && !potTimes.has(order[i])) {
            potTimes.set(order[i], now);
            const p = POCKETS[nearestPocket(prev[0], prev[1])];
            dropping.current.set(order[i], { x: (prev[0] + p.x) / 2, y: (prev[1] + p.y) / 2, t: 0 });
            soundManager.coinDrop();
          }
        }
        lastFrame = f;
        setAnimBalls(order.map((n, i) => {
          const p = frames[f][i];
          return p ? { n, x: p[0], y: p[1], potted: false } : { n, x: 0, y: 0, potted: true };
        }));
      }
      for (const [n, d] of dropping.current) {
        const t0p = potTimes.get(n) ?? now;
        d.t = Math.max(0, Math.min(1, (now - t0p) / 320));
        if (d.t >= 1) dropping.current.delete(n);
      }
      if (f < frames.length - 1 || dropping.current.size) raf = requestAnimationFrame(step);
      else { setAnimBalls(null); playback.onDone(); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.id]);

  // Draw
  const showAim = canShoot && !playback;
  const shownAim: Aim | null = showAim ? { ...aim, power } : remoteAim && !playback ? remoteAim.aim : null;
  const shownPlacing = showAim && placing ? { ...placing, ok: canPlaceCue(game, placing.x, placing.y) } : !playback && remoteAim?.cue ? { ...remoteAim.cue, ok: true } : null;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const w = Math.round(VIEW_W * view.scale), h = Math.round(VIEW_H * view.scale);
    if (c.width !== w * view.dpr) { c.width = w * view.dpr; c.height = h * view.dpr; c.style.width = `${w}px`; c.style.height = `${h}px`; }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawTable(ctx, view, animBalls ?? game.balls, {
      aim: shownAim,
      guide: showAim || !!remoteAim,
      placing: shownPlacing,
      kitchen: game.breakShot && !!shownPlacing,
      highlight: showAim ? targets : [],
      dropping: dropping.current,
    });
  });

  // Report our aim to the opponent
  useEffect(() => {
    if (showAim && onAim) onAim({ ...aim, power }, placing);
  }, [aim, power, placing, showAim, onAim]);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return toTable(view, e.clientX - r.left, e.clientY - r.top);
  };
  const aimAt = useCallback((p: { x: number; y: number }) => {
    if (!from) return;
    const dx = p.x - from.x, dy = p.y - from.y;
    const l = Math.hypot(dx, dy);
    if (l > BALL_R * 0.8) setAim({ dx: dx / l, dy: dy / l });
  }, [from]);

  const onDown = (e: React.PointerEvent) => {
    if (!showAim) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ballInHand && placing && Math.hypot(p.x - placing.x, p.y - placing.y) < BALL_R * 3.5) {
      drag.current = "place";
    } else {
      drag.current = "aim";
      aimAt(p);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = point(e);
    if (drag.current === "place") setPlacing({ x: p.x, y: p.y });
    else aimAt(p);
  };
  const onUp = () => { drag.current = null; };

  const rotate = (deg: number) => {
    const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    setAim((a) => ({ dx: a.dx * c - a.dy * s, dy: a.dx * s + a.dy * c }));
  };
  const hold = useRef<number | null>(null);
  const startHold = (deg: number) => { rotate(deg); hold.current = window.setInterval(() => rotate(deg), 70); };
  const endHold = () => { if (hold.current) { clearInterval(hold.current); hold.current = null; } };
  useEffect(() => endHold, []);

  // Power bar: drag right to pull the cue back, let go to shoot
  const barRef = useRef<HTMLDivElement>(null);
  const powerAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const placeOk = !ballInHand || (placing ? canPlaceCue(game, placing.x, placing.y) : false);
  // The latest power, read straight from the finger: a quick flick can let go before React re-renders
  const powerNow = useRef(0);
  const pull = (clientX: number) => { powerNow.current = powerAt(clientX); setPower(powerNow.current); };
  const release = (e: React.PointerEvent) => {
    if (!powerDrag.current) return;
    powerDrag.current = false;
    pull(e.clientX);
    const p = powerNow.current;
    if (p < 0.03 || !showAim || !placeOk) { setPower(0); return; }
    onShoot({ dx: aim.dx, dy: aim.dy, power: p, spin }, ballInHand && placing ? placing : undefined);
    setPower(0);
  };

  return (
    <div className="w-full flex flex-col items-center gap-2 select-none" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="touch-none rounded-[18px] shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        data-testid="pool-canvas"
      />
      {showAim && (
        <div className="w-full max-w-md" data-testid="pool-controls">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSpin((s) => (s === 0 ? 1 : s === 1 ? -1 : 0))}
              className="w-12 h-11 rounded-xl bg-white/10 text-white flex flex-col items-center justify-center leading-none"
              aria-label={labels.spin}
              data-testid="pool-spin"
            >
              <span className="relative w-5 h-5 rounded-full bg-white">
                <span className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-600" style={{ top: spin === 1 ? 2 : spin === 0 ? 7 : 12 }} />
              </span>
              <span className="text-[9px] font-black mt-0.5">{spin === 1 ? labels.top : spin === 0 ? labels.centre : labels.back}</span>
            </button>
            <button type="button" onPointerDown={() => startHold(-0.15)} onPointerUp={endHold} onPointerLeave={endHold} className="w-10 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20" aria-label={tr("Chỉnh ngắm sang trái", "Nudge aim left", "向左微調瞄準")} data-testid="pool-nudge-left">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div
              ref={barRef}
              className="relative flex-1 h-11 rounded-xl bg-black/50 border border-yellow-400/40 overflow-hidden touch-none"
              onPointerDown={(e) => { if (!placeOk) { setBadSpot(true); return; } powerDrag.current = true; e.currentTarget.setPointerCapture(e.pointerId); pull(e.clientX); }}
              onPointerMove={(e) => { if (powerDrag.current) pull(e.clientX); }}
              onPointerUp={release}
              onPointerCancel={() => { powerDrag.current = false; setPower(0); }}
              data-testid="pool-power"
            >
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" style={{ width: `${power * 100}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white drop-shadow pointer-events-none">
                {badSpot ? <span className="text-red-300 text-[11px] leading-tight px-2 text-center">{labels.placeCue}</span> : power > 0 ? `${Math.round(power * 100)}%` : `${labels.power} ⟶`}
              </span>
            </div>
            <button type="button" onPointerDown={() => startHold(0.15)} onPointerUp={endHold} onPointerLeave={endHold} className="w-10 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20" aria-label={tr("Chỉnh ngắm sang phải", "Nudge aim right", "向右微調瞄準")} data-testid="pool-nudge-right">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
