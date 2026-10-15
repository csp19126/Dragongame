import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Info, Loader2, Minus, Plus, X, Zap } from "lucide-react";
import type { Achievement } from "@shared/schema";
import {
  STRIPS_777, PAYLINES_777, LINE_OPTIONS_777, LINE_BETS_777, MAX_TOTAL_BET_777, PAY3_777, MIX_PAY_777, CHERRY_PAYS_777,
  SLOT777_RTP, evalLine777, type Sym777, type LineWin777,
} from "@shared/slot777";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { STATE_KEY, useGameState, useSetBalance } from "@/hooks/use-game";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { achievementToast } from "@/components/slot/achievements";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks, cannons, stopCelebrations } from "@/lib/celebrate";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { AppFooter } from "@/pages/Home";
import { Seven, Bar } from "@/components/Seven777";

interface Spin777Response {
  totalBet: number;
  winAmount: number;
  payout: number;
  lines: number;
  lineBet: number;
  stops: number[];
  reels: Sym777[][];
  lineWins: LineWin777[];
  balance: number;
  newBalance: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

/** Height of one symbol on a reel, in pixels */
const CELL = 78;
const LINE_COLORS = ["#f43f5e", "#38bdf8", "#4ade80", "#facc15", "#e879f9"];
const AUTO_OPTIONS = [10, 25, 50, 100];
const BIG_WIN_X = 20;
const SAVE_KEY = "slot777.bet";

const mod = (a: number, n: number) => ((a % n) + n) % n;
const easeOutBack = (t: number, c1 = 0.9) => { const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const shortBet = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

// ---------------- Symbols ----------------

const EMOJI: Partial<Record<Sym777, string>> = { cherry: "🍒", lemon: "🍋", orange: "🍊", melon: "🍉", bell: "🔔", star: "⭐" };

function Symbol777({ sym, size = 52, wildLabel = true }: { sym: Sym777; size?: number; wildLabel?: boolean }) {
  if (sym === "seven") return <Seven className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" />;
  if (sym === "bar") return <Bar className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" />;
  if (sym === "star") {
    return (
      <span className="relative flex flex-col items-center justify-center leading-none">
        <span className="drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]" style={{ fontSize: size * 0.9 }}>⭐</span>
        {wildLabel && <span className="mt-0.5 rounded-sm bg-fuchsia-700 px-1 text-[9px] font-black tracking-widest text-yellow-200">WILD</span>}
      </span>
    );
  }
  return <span className="leading-none drop-shadow-[0_3px_2px_rgba(0,0,0,0.3)]" style={{ fontSize: size }}>{EMOJI[sym]}</span>;
}

/** A symbol sized for a box (paytable, line-win chips) */
function SymBox({ sym, px }: { sym: Sym777; px: number }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: px, height: px }}>
      {sym === "seven" || sym === "bar"
        ? <span style={{ width: px * (sym === "bar" ? 1 : 0.9) }} className="block">{sym === "seven" ? <Seven /> : <Bar />}</span>
        : <span className="leading-none" style={{ fontSize: px * 0.8 }}>{EMOJI[sym]}</span>}
    </span>
  );
}

// ---------------- Page ----------------

type Anim = { phase: "idle" | "spin" | "stop"; pos: number; from: number; to: number; t0: number; dur: number; clunked: boolean };

function loadSaved(): { lines: number; lineBet: number; turbo: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (s && (LINE_OPTIONS_777 as readonly number[]).includes(s.lines) && LINE_BETS_777.includes(s.lineBet)) {
      return { lines: s.lines, lineBet: s.lineBet, turbo: !!s.turbo };
    }
  } catch {}
  return { lines: 5, lineBet: 200, turbo: false };
}

export default function Slot777() {
  const { user, isLoading } = useAuth();
  const { data: state } = useGameState(!!user);
  const { tr, loc, srv } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();

  const saved = useMemo(loadSaved, []);
  const [lines, setLines] = useState(saved.lines);
  const [lineBet, setLineBet] = useState(saved.lineBet);
  const [turbo, setTurbo] = useState(saved.turbo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Spin777Response | null>(null);
  const [shownWin, setShownWin] = useState(0);
  const [focus, setFocus] = useState(0);
  const [preview, setPreview] = useState(false);
  const [bigWin, setBigWin] = useState<{ amount: number; x: number; stars: boolean } | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoMenu, setAutoMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const cabinet = useAnimationControls();

  const balance = state?.balance ?? user?.balance ?? 0;
  const totalBet = lines * lineBet;

  // Everything the animation loop and auto-spin read, kept current between renders
  const live = useRef({ lines, lineBet, turbo, balance, autoLeft });
  live.current = { lines, lineBet, turbo, balance, autoLeft };

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ lines, lineBet, turbo })); } catch {}
  }, [lines, lineBet, turbo]);

  // ---- Reels ----
  const stripEls = useRef<(HTMLDivElement | null)[]>([]);
  const anims = useRef<Anim[]>(STRIPS_777.map((s) => ({ phase: "idle", pos: Math.floor(Math.random() * s.length), from: 0, to: 0, t0: 0, dur: 0, clunked: false })));
  const raf = useRef(0);
  const last = useRef(0);
  const pending = useRef<Spin777Response | null>(null);
  const timers = useRef<number[]>([]);
  const busyRef = useRef(false);
  const countRaf = useRef(0);

  const paint = useCallback(() => {
    anims.current.forEach((a, r) => {
      const el = stripEls.current[r];
      if (!el) return;
      const n = STRIPS_777[r].length;
      let blur = 0;
      if (a.phase === "spin") blur = 2.6;
      else if (a.phase === "stop") blur = 2.6 * Math.max(0, 1 - (performance.now() - a.t0) / (a.dur * 0.55)) ** 2;
      el.style.transform = `translate3d(0, ${-mod(a.pos, n) * CELL}px, 0)`;
      el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
    });
  }, []);

  const onAllStopped = useRef<() => void>(() => {});

  const tick = useCallback((now: number) => {
    const dt = Math.min(50, now - (last.current || now));
    last.current = now;
    const speed = live.current.turbo ? 0.05 : 0.034;
    let moving = false;
    anims.current.forEach((a, r) => {
      if (a.phase === "spin") {
        const ramp = Math.min(1, (now - a.t0) / 140);
        a.pos -= speed * dt * ramp * ramp;
        moving = true;
      } else if (a.phase === "stop") {
        const t = Math.min(1, (now - a.t0) / a.dur);
        const e = easeOutBack(t);
        a.pos = a.from + (a.to - a.from) * e;
        if (!a.clunked && e >= 1) {
          a.clunked = true;
          soundManager.clunk(r);
          void cabinet.start({ y: [0, 3, 0], transition: { duration: 0.12 } });
        }
        if (t >= 1) { a.pos = a.to; a.phase = "idle"; } else moving = true;
      }
    });
    paint();
    if (moving) raf.current = requestAnimationFrame(tick);
    else { raf.current = 0; onAllStopped.current(); }
  }, [paint, cabinet]);

  const runLoop = useCallback(() => {
    if (!raf.current) { last.current = 0; raf.current = requestAnimationFrame(tick); }
  }, [tick]);

  /** Lands a reel on `stop`: it jumps (unseen, mid-blur) to a few stops above and eases down with a bounce */
  const beginStop = useCallback((r: number, stop: number) => {
    const a = anims.current[r];
    if (a.phase !== "spin") return;
    const d = live.current.turbo ? 3 : 5;
    const speed = live.current.turbo ? 0.05 : 0.034;
    a.to = stop;
    a.from = stop + d;
    a.pos = a.from;
    a.dur = (3.9 * d) / speed; // starts at the spinning speed (easeOutBack's slope at 0 is c1 + 3)
    a.t0 = performance.now();
    a.clunked = false;
    a.phase = "stop";
    runLoop();
  }, [runLoop]);

  const mounted = useRef(true);
  useEffect(() => {
    paint();
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Left mid-spin: the header still gets the real balance
      if (pending.current) setBalance(pending.current.newBalance);
      pending.current = null;
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(countRaf.current);
      timers.current.forEach(clearTimeout);
      stopCelebrations();
    };
  }, [paint]);

  // Cycle through the winning lines, one highlighted at a time
  useEffect(() => {
    if (!result || result.lineWins.length < 2) { setFocus(0); return; }
    const id = window.setInterval(() => setFocus((f) => (f + 1) % result.lineWins.length), 1100);
    return () => window.clearInterval(id);
  }, [result]);

  // Show the paylines briefly when the number of lines changes
  useEffect(() => {
    if (busyRef.current) return;
    setPreview(true);
    const id = window.setTimeout(() => setPreview(false), 1200);
    return () => window.clearTimeout(id);
  }, [lines]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const rollUp = (to: number, ms: number) => {
    cancelAnimationFrame(countRaf.current);
    const start = performance.now();
    let lastTick = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShownWin(Math.round(to * (1 - (1 - t) ** 3)));
      if (now - lastTick > 70 && t < 1) { lastTick = now; soundManager.countUp(); }
      if (t < 1) countRaf.current = requestAnimationFrame(step);
    };
    countRaf.current = requestAnimationFrame(step);
  };

  const stopAuto = () => { setAutoLeft(0); live.current.autoLeft = 0; };

  const finish = (r: Spin777Response) => {
    setResult(r);
    setFocus(0);
    setBalance(r.newBalance, { gamesPlayed: r.gamesPlayed, totalWins: r.totalWins, maxWin: r.maxWin });
    r.newAchievements.forEach((a) => toast(achievementToast(a, loc)));
    if (r.newAchievements.length) void queryClient.invalidateQueries({ queryKey: ["/api/achievements"] });
    const x = r.payout / r.totalBet;
    const big = x >= BIG_WIN_X;
    const quick = live.current.turbo;
    if (r.payout > 0) {
      rollUp(r.payout, big ? 2200 : quick ? 350 : Math.min(1400, 400 + x * 120));
      soundManager.bellDing(Math.min(4, Math.floor(Math.log2(1 + x))));
      if (x > 1) coinBurst({ x: 0.5, y: 0.4 });
      if (big) {
        const stars = r.lineWins.some((w) => w.kind === "stars");
        later(() => {
          setBigWin({ amount: r.payout, x, stars });
          soundManager.bigWinFanfare();
          fireworks(x >= 100 ? 4500 : 3000, x >= 100 ? 1.4 : 1);
          if (x >= 100 || stars) cannons(2500);
        }, 250);
        later(() => setBigWin(null), 4200);
      }
    } else {
      setShownWin(0);
    }
    // Auto-spin carries on unless it's run out, the win was big, or the coins are short
    const left = live.current.autoLeft;
    if (left > 0) {
      const next = left - 1;
      const { lines: l, lineBet: b } = live.current;
      if (next === 0 || big || r.newBalance < l * b) {
        stopAuto();
        if (next > 0 && r.newBalance < l * b) toast({ title: tr("Không đủ xu để quay tiếp", "Not enough coins to keep spinning", "金幣不足，無法繼續旋轉"), variant: "destructive" });
      } else {
        setAutoLeft(next);
        live.current.autoLeft = next;
        later(() => { if (live.current.autoLeft > 0) spinRef.current(); }, r.payout > 0 ? (quick ? 650 : 1300) : quick ? 180 : 450);
      }
    }
  };

  onAllStopped.current = () => {
    const r = pending.current;
    pending.current = null;
    busyRef.current = false;
    setBusy(false);
    if (r) finish(r);
  };

  /** Tapping SPIN again while the reels run stops them all at once */
  const slam = () => {
    const r = pending.current;
    if (!r || !anims.current.some((a) => a.phase === "spin")) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    anims.current.forEach((a, i) => { if (a.phase === "spin") later(() => beginStop(i, r.stops[i]), i * 70); });
  };

  const spin = async () => {
    if (busyRef.current) return slam();
    setAutoMenu(false);
    if (bigWin) setBigWin(null);
    const { lines: l, lineBet: b, balance: bal } = live.current;
    const total = l * b;
    if (total > bal) {
      stopAuto();
      soundManager.nearMiss();
      toast({ title: tr("Không đủ xu", "Not enough coins", "金幣不足"), description: tr("Hãy giảm mức cược hoặc nhận quà hằng ngày.", "Lower your bet or grab the daily gift.", "請降低押注，或領取每日禮物。"), variant: "destructive" });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopCelebrations();
    cancelAnimationFrame(countRaf.current);
    setResult(null);
    setShownWin(0);
    setPreview(false);
    setBalance(bal - total); // the stake leaves straight away; the server's figure lands when the reels stop
    soundManager.leverPull();
    const t0 = performance.now();
    anims.current.forEach((a) => { a.phase = "spin"; a.t0 = t0; });
    runLoop();
    try {
      const r: Spin777Response = await (await apiRequest("POST", "/api/slot777/spin", { lines: l, lineBet: b })).json();
      if (!mounted.current) { setBalance(r.newBalance, { gamesPlayed: r.gamesPlayed, totalWins: r.totalWins, maxWin: r.maxWin }); return; }
      pending.current = r;
      const quick = live.current.turbo;
      const base = quick ? 220 : 560, gap = quick ? 110 : 280;
      // Two sevens or stars lined up on a played line: make the last reel wait a moment
      const tease = !quick && PAYLINES_777.slice(0, l).some((rows) => {
        const a = r.reels[0][rows[0]], c = r.reels[1][rows[1]];
        return (a === "seven" || a === "star") && (c === "seven" || c === "star");
      });
      const elapsed = performance.now() - t0;
      [0, 1, 2].forEach((i) => {
        const at = base + i * gap + (i === 2 && tease ? 750 : 0);
        later(() => beginStop(i, r.stops[i]), Math.max(0, at - elapsed));
      });
      if (tease) later(() => soundManager.anticipation(), Math.max(0, base + gap - elapsed + 120));
    } catch (e) {
      stopAuto();
      pending.current = null;
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      anims.current.forEach((a, i) => later(() => beginStop(i, mod(Math.round(a.pos), STRIPS_777[i].length)), i * 120));
      const msg = e instanceof ApiError ? srv(e.message) : tr("Mất kết nối, hãy thử lại", "Connection lost, try again", "連線中斷，請再試一次");
      toast({ title: msg, variant: "destructive" });
    }
  };
  const spinRef = useRef(spin);
  spinRef.current = spin;

  // Space bar spins on a keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement)?.closest("input, textarea, button, select")) return;
      e.preventDefault();
      void spinRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to="/auth?next=%2Fslot-777" />;

  const locked = busy || autoLeft > 0;
  const betIdx = LINE_BETS_777.indexOf(lineBet);
  const canUp = betIdx < LINE_BETS_777.length - 1 && lines * LINE_BETS_777[betIdx + 1] <= MAX_TOTAL_BET_777;
  const changeBet = (dir: 1 | -1) => {
    if (locked) return;
    const next = LINE_BETS_777[betIdx + dir];
    if (next === undefined || lines * next > MAX_TOTAL_BET_777) return soundManager.nearMiss();
    setLineBet(next);
    soundManager.betChange();
  };
  const pickLines = (n: number) => {
    if (locked) return;
    setLines(n);
    soundManager.buttonClick();
  };
  const maxBet = () => {
    if (locked) return;
    // All five lines at the biggest line bet the balance covers (the smallest if none does)
    const fits = LINE_BETS_777.filter((b) => 5 * b <= Math.min(balance, MAX_TOTAL_BET_777));
    setLines(5);
    setLineBet(fits.length ? fits[fits.length - 1] : LINE_BETS_777[0]);
    soundManager.multiplierHit(3);
  };
  const startAuto = (n: number) => {
    setAutoMenu(false);
    if (totalBet > balance) return void spin();
    setAutoLeft(n);
    live.current.autoLeft = n;
    soundManager.autoSpinToggle();
    void spin();
  };

  const wins = result?.lineWins ?? [];
  const focused = wins[focus];
  const winCells = new Set<string>();
  for (const w of wins) {
    const count = w.kind === "cherry" ? evalLine777(w.symbols).count : 3;
    PAYLINES_777[w.line - 1].slice(0, count).forEach((row, reel) => winCells.add(`${reel}-${row}`));
  }
  const xTotal = result ? result.payout / result.totalBet : 0;
  const rtpText = tr(SLOT777_RTP.toFixed(2).replace(".", ","), SLOT777_RTP.toFixed(2), SLOT777_RTP.toFixed(2));
  const combos = STRIPS_777.reduce((a, s) => a * s.length, 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#24093f] to-[#0a0515] flex flex-col">
      <style>{`
        @keyframes s7-bulb { 0%, 49% { opacity: 1 } 50%, 100% { opacity: .22 } }
        .s7-bulb { animation: s7-bulb 1.1s steps(1) infinite; }
        .s7-fast .s7-bulb { animation-duration: .28s; }
        .s7-bulb:nth-child(even) { animation-delay: -.55s; }
        .s7-fast .s7-bulb:nth-child(even) { animation-delay: -.14s; }
        @keyframes s7-glow { 0%, 100% { box-shadow: inset 0 0 0 3px rgba(250,204,21,.95), 0 0 18px rgba(250,204,21,.8) } 50% { box-shadow: inset 0 0 0 3px rgba(250,204,21,.35), 0 0 4px rgba(250,204,21,.2) } }
        .s7-win { animation: s7-glow .55s ease-in-out infinite; }
      `}</style>
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 relative z-10">
        <div className="text-center">
          <h1 className="font-display text-3xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-slot777-title">
            {tr("Slot 777 Cổ Điển", "Classic 777", "經典777")}
          </h1>
          <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🍒 {tr("Quay là ăn liền", "Pull · spin · win", "一拉就轉 · 轉了就贏")} 🍒</p>
        </div>
        <GameTabs />

        {/* The cabinet */}
        <motion.div animate={cabinet} className={`relative w-full max-w-md rounded-[2.2rem] p-[5px] bg-gradient-to-b from-yellow-200 via-amber-500 to-yellow-700 shadow-[0_0_50px_rgba(168,85,247,0.45),0_20px_40px_rgba(0,0,0,0.6)] ${wins.length ? "s7-fast" : ""}`} data-testid="slot777-cabinet">
          <div className="rounded-[2rem] bg-gradient-to-b from-[#3b0d63] via-[#1d0736] to-[#12041f] px-3 pt-2 pb-3 border border-white/10">
            {/* Marquee */}
            <div className="flex justify-between px-2" aria-hidden>
              {Array.from({ length: 13 }, (_, i) => (
                <span key={i} className={`s7-bulb w-2.5 h-2.5 rounded-full ${i % 2 ? "bg-fuchsia-300 shadow-[0_0_8px_#f0abfc]" : "bg-yellow-200 shadow-[0_0_8px_#fde047]"}`} />
              ))}
            </div>

            {/* Win display */}
            <div className="mt-2 mx-1 h-12 rounded-xl bg-black border-2 border-yellow-600/60 shadow-[inset_0_0_14px_rgba(0,0,0,0.9)] flex items-center justify-center px-3 overflow-hidden" aria-live="polite" data-testid="slot777-display">
              {busy ? (
                <span className="font-mono font-black tracking-[0.3em] text-fuchsia-300/80 text-sm animate-pulse">{tr("CHÚC MAY MẮN", "GOOD LUCK", "祝你好運")}</span>
              ) : result && result.payout > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-black text-yellow-500/80 tracking-widest">{tr("THẮNG", "WIN", "贏")}</span>
                  <span className="font-mono font-black text-3xl text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]" data-testid="text-slot777-win">{fmtCoins(shownWin)}</span>
                </div>
              ) : result ? (
                <span className="font-mono font-black tracking-widest text-white/40 text-sm">{tr("QUAY TIẾP NÀO!", "SPIN AGAIN!", "再轉一次！")}</span>
              ) : (
                <span className="font-mono font-black tracking-widest text-yellow-300/80 text-sm">{tr(`${lines} DÒNG · ${fmtCoins(totalBet)} XU`, `${lines} LINE${lines > 1 ? "S" : ""} · ${fmtCoins(totalBet)}`, `${lines} 條連線 · ${fmtCoins(totalBet)} 金幣`)}</span>
              )}
            </div>

            {/* Reels with the line markers either side */}
            <div className="mt-2 flex items-stretch gap-1">
              <LineMarkers side="left" lines={lines} wins={wins} />
              <div className="relative flex-1 rounded-xl p-[3px] bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-300 shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
                <div className="relative grid grid-cols-3 gap-[3px] rounded-[10px] overflow-hidden bg-zinc-700" style={{ height: CELL * 3 }} data-testid="slot777-reels">
                  {STRIPS_777.map((strip, r) => (
                    <div key={r} className="relative overflow-hidden bg-gradient-to-b from-[#cfc7b8] via-[#fffdf7] to-[#cfc7b8]">
                      <div ref={(el) => { stripEls.current[r] = el; }} className="absolute inset-x-0 top-0 will-change-transform">
                        {[...strip, ...strip.slice(0, 4)].map((s, i) => (
                          <div key={i} className="flex items-center justify-center px-2" style={{ height: CELL }}>
                            <div className="w-[58px] h-[58px] flex items-center justify-center"><Symbol777 sym={s} /></div>
                          </div>
                        ))}
                      </div>
                      {/* Glow on winning cells */}
                      {[0, 1, 2].map((row) => winCells.has(`${r}-${row}`) && !busy && (
                        <div key={row} className="absolute inset-x-0.5 rounded-lg s7-win pointer-events-none" style={{ top: row * CELL + 2, height: CELL - 4 }} />
                      ))}
                      {/* Cylinder shading */}
                      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,rgba(0,0,0,0.38),transparent_22%,transparent_78%,rgba(0,0,0,0.38))]" />
                    </div>
                  ))}
                  <PaylineOverlay lines={lines} wins={busy ? [] : wins} focusLine={focused?.line ?? null} preview={preview && !busy && !result} />
                </div>
              </div>
              <LineMarkers side="right" lines={lines} wins={wins} />
            </div>

            {/* Line wins */}
            <div className="mt-2 min-h-[30px] flex flex-wrap items-center justify-center gap-1.5" data-testid="slot777-linewins">
              {!busy && wins.map((w, i) => (
                <span key={w.line} className={`inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[11px] font-black border transition ${i === focus ? "bg-yellow-300 text-black border-yellow-100" : "bg-white/10 text-yellow-100 border-white/15"}`}>
                  <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-black" style={{ background: LINE_COLORS[w.line - 1] }}>{w.line}</span>
                  <span className="flex">{w.symbols.map((s, j) => <SymBox key={j} sym={s} px={15} />)}</span>
                  +{fmtCoins(w.payout)}
                </span>
              ))}
              {!busy && result && wins.length === 0 && <span className="text-[11px] text-white/35 font-bold">{tr("Không trúng dòng nào", "No winning lines", "沒有中獎連線")}</span>}
            </div>

            {/* Meters */}
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-black/50 border border-white/10 px-3 py-1.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-yellow-500/70">{tr("Số dư", "Balance", "餘額")}</div>
                <div className="font-mono font-black text-lg text-yellow-300 truncate" data-testid="text-slot777-balance">{fmtCoins(balance)}</div>
              </div>
              <div className="rounded-xl bg-black/50 border border-yellow-500/40 px-3 py-1.5 text-right">
                <div className="text-[9px] font-black uppercase tracking-widest text-yellow-500/70">{tr("Tổng cược", "Total bet", "總押注")}</div>
                <div className="font-mono font-black text-lg text-white truncate" data-testid="text-slot777-total">{fmtCoins(totalBet)}</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Spin row */}
        <div className="relative w-full max-w-md grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-center gap-2">
          <RoundButton onClick={() => { setSheet(true); soundManager.buttonClick(); }} label={tr("Bảng thưởng", "Paytable", "賠率表")} testId="button-paytable"><Info className="w-5 h-5" /></RoundButton>
          <RoundButton
            onClick={() => { if (autoLeft > 0) { stopAuto(); soundManager.autoSpinToggle(); } else if (!busy) setAutoMenu((v) => !v); }}
            active={autoLeft > 0} label={autoLeft > 0 ? tr("Dừng", "Stop", "停止") : tr("Tự quay", "Auto", "自動")} testId="button-auto">
            <span className="font-black text-sm">{autoLeft > 0 ? autoLeft : "AUTO"}</span>
          </RoundButton>
          <motion.button
            type="button" whileTap={{ scale: 0.92 }} onClick={() => void spin()} disabled={autoLeft > 0}
            className="relative w-[6.5rem] h-[6.5rem] rounded-full font-display text-3xl text-white bg-[radial-gradient(circle_at_35%_30%,#fde047,#f97316_45%,#b91c1c_80%)] border-4 border-yellow-200 shadow-[0_6px_0_#7f1d1d,0_0_30px_rgba(249,115,22,0.7)] disabled:opacity-80 active:translate-y-1 active:shadow-[0_2px_0_#7f1d1d]"
            data-testid="button-spin777"
          >
            {autoLeft > 0 ? <span className="text-xl">AUTO</span> : busy ? <span className="text-2xl">{tr("Dừng", "Stop", "停")}</span> : tr("Quay", "Spin", "旋轉")}
          </motion.button>
          <RoundButton onClick={() => { setTurbo((v) => !v); soundManager.buttonClick(); }} active={turbo} label={tr("Siêu tốc", "Turbo", "加速")} testId="button-turbo"><Zap className={`w-5 h-5 ${turbo ? "fill-current" : ""}`} /></RoundButton>
          <RoundButton onClick={maxBet} disabled={locked} label={tr("Cược tối đa", "Max bet", "最大押注")} testId="button-maxbet"><span className="font-black text-sm">MAX</span></RoundButton>

          <AnimatePresence>
            {autoMenu && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full mb-2 left-0 right-0 mx-auto w-max z-30 rounded-2xl bg-[#1d0736] border border-yellow-400/50 p-2 shadow-2xl" data-testid="slot777-auto-menu">
                <div className="text-[10px] text-center font-black uppercase tracking-widest text-yellow-400/80 mb-1.5">{tr("Số lượt tự quay", "Auto spins", "自動旋轉次數")}</div>
                <div className="flex gap-1.5">
                  {AUTO_OPTIONS.map((n) => (
                    <button key={n} type="button" onClick={() => startAuto(n)} className="w-12 h-11 rounded-xl bg-gradient-to-b from-fuchsia-500 to-purple-700 text-white font-black active:scale-90" data-testid={`button-auto-${n}`}>{n}</button>
                  ))}
                </div>
                <div className="text-[10px] text-center text-white/45 mt-1.5 max-w-[15rem]">{tr(`Tự dừng khi thắng từ ×${BIG_WIN_X} tổng cược hoặc hết xu`, `Stops on a win of ×${BIG_WIN_X} your bet or more, or when coins run low`, `贏得總押注 ×${BIG_WIN_X} 以上或金幣不足時自動停止`)}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bet controls */}
        <div className="w-full max-w-md grid grid-cols-[auto_1fr] gap-2">
          <div className="rounded-2xl bg-purple-950/70 border border-yellow-500/25 p-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-yellow-500/70 text-center mb-1">{tr("Số dòng", "Lines", "連線")}</div>
            <div className="flex gap-1">
              {LINE_OPTIONS_777.map((n) => (
                <button key={n} type="button" disabled={locked} onClick={() => pickLines(n)} data-testid={`button-lines-${n}`}
                  className={`w-11 h-11 rounded-xl font-black text-lg transition active:scale-90 disabled:opacity-50 ${lines === n ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]" : "bg-white/10 text-white/70"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-purple-950/70 border border-yellow-500/25 p-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-yellow-500/70 text-center mb-1">{tr("Cược mỗi dòng", "Line bet", "每線押注")}</div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={locked || betIdx === 0} onClick={() => changeBet(-1)} className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-90 disabled:opacity-30" data-testid="button-bet-down" aria-label={tr("Giảm cược", "Lower bet", "降低押注")}><Minus className="w-5 h-5" /></button>
              <div className="flex-1 text-center font-mono font-black text-xl text-yellow-300" data-testid="text-slot777-linebet">{fmtCoins(lineBet)}</div>
              <button type="button" disabled={locked || !canUp} onClick={() => changeBet(1)} className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-90 disabled:opacity-30" data-testid="button-bet-up" aria-label={tr("Tăng cược", "Raise bet", "提高押注")}><Plus className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        {/* The bet ladder, for jumping straight to a stake */}
        <div className="w-full max-w-md flex gap-1 overflow-x-auto scrollbar-hide pb-0.5" data-testid="slot777-ladder">
          {LINE_BETS_777.map((b) => {
            const ok = lines * b <= MAX_TOTAL_BET_777;
            return (
              <button key={b} type="button" disabled={locked || !ok} onClick={() => { setLineBet(b); soundManager.betChange(); }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black border transition disabled:opacity-30 ${b === lineBet ? "bg-yellow-300 text-black border-yellow-100" : "bg-white/5 text-yellow-100/70 border-white/10"}`}>{shortBet(b)}</button>
            );
          })}
        </div>

        <p className="text-[11px] text-white/35 text-center max-w-md">
          {tr(`Tỷ lệ hoàn trả ${rtpText}% · cược tối đa ${fmtCoins(MAX_TOTAL_BET_777)} xu một lượt`, `Return to player ${rtpText}% · up to ${fmtCoins(MAX_TOTAL_BET_777)} a spin`, `返還率 ${rtpText}% · 每轉最高押注 ${fmtCoins(MAX_TOTAL_BET_777)} 金幣`)}
        </p>
      </main>

      {/* Big win */}
      <AnimatePresence>
        {bigWin && (
          <motion.button type="button" onClick={() => setBigWin(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" data-testid="slot777-bigwin">
            <motion.div initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: [0.3, 1.15, 1], rotate: 0 }} transition={{ duration: 0.6 }}
              className="mx-6 rounded-[2rem] p-[4px] bg-gradient-to-b from-yellow-200 via-amber-500 to-yellow-700 shadow-[0_0_60px_rgba(250,204,21,0.7)]">
              <div className="rounded-[1.8rem] bg-gradient-to-b from-[#5b1190] to-[#1d0736] px-8 py-6 text-center">
                <div className="flex justify-center gap-1 mb-1">{[0, 1, 2].map((i) => <span key={i} className="w-10 h-10">{bigWin.stars ? <span className="text-4xl">⭐</span> : <Seven />}</span>)}</div>
                <div className="font-display text-[2.6rem] leading-tight whitespace-nowrap bg-gradient-to-b from-yellow-100 via-yellow-300 to-orange-500 bg-clip-text text-transparent drop-shadow">
                  {bigWin.stars ? tr("NỔ HŨ!", "JACKPOT!", "頭獎！") : bigWin.x >= 100 ? tr("SIÊU THẮNG!", "MEGA WIN!", "超級大獎！") : tr("THẮNG LỚN!", "BIG WIN!", "大獎！")}
                </div>
                <div className="mt-2 font-mono font-black text-4xl text-white">{fmtCoins(shownWin)}</div>
                <div className="mt-1 text-sm font-black text-yellow-300/80">×{Math.round(bigWin.x * 10) / 10} {tr("tổng cược", "your bet", "總押注")}</div>
              </div>
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Paytable */}
      <AnimatePresence>
        {sheet && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-[2rem] bg-[#1a0631] border-t-2 border-yellow-400/60 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" data-testid="slot777-paytable">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-yellow-300 text-lg">{tr("Bảng thưởng · luật chơi", "Paytable & rules", "賠率表 · 規則")}</h2>
                <button type="button" onClick={() => setSheet(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white" aria-label={tr("Đóng", "Close", "關閉")}><X className="w-5 h-5" /></button>
              </div>
              <p className="text-[11px] text-white/50 mb-2">{tr("Tiền thưởng tính theo cược mỗi dòng. Mỗi dòng trả khoản thưởng cao nhất của nó.", "Pays are × your line bet. Each line pays its single best win.", "派彩以每線押注計算。每條連線只派最高的一項獎金。")}</p>
              <div className="grid grid-cols-1 gap-1">
                {(["star", "seven", "bar", "bell", "melon", "cherry", "orange", "lemon"] as Sym777[]).map((s) => (
                  <div key={s} className={`flex items-center gap-2 rounded-xl px-2 py-1 ${s === "star" ? "bg-gradient-to-r from-fuchsia-700/60 to-purple-900/40 border border-yellow-300/40" : "bg-white/[0.04]"}`}>
                    <span className="flex">{[0, 1, 2].map((i) => <SymBox key={i} sym={s} px={28} />)}</span>
                    <span className="flex-1 text-[11px] text-white/50">{s === "star" ? tr("Giải cao nhất", "Top prize", "最高獎") : ""}</span>
                    <span className="font-mono font-black text-yellow-300 text-lg">×{fmtCoins(PAY3_777[s])}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-xl px-2 py-1 bg-white/[0.04]">
                  <span className="flex"><SymBox sym="bar" px={28} /><SymBox sym="seven" px={28} /><SymBox sym="bar" px={28} /></span>
                  <span className="flex-1 text-[11px] text-white/50">{tr("BAR và 7 lẫn lộn", "Any BAR/7 mix", "BAR 與 7 任意組合")}</span>
                  <span className="font-mono font-black text-yellow-300 text-lg">×{MIX_PAY_777}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl px-2 py-1 bg-white/[0.04]">
                  <span className="flex"><SymBox sym="cherry" px={28} /><SymBox sym="cherry" px={28} /><span className="w-7" /></span>
                  <span className="flex-1 text-[11px] text-white/50">{tr("2 anh đào từ bên trái", "2 cherries from the left", "左起 2 顆櫻桃")}</span>
                  <span className="font-mono font-black text-yellow-300 text-lg">×{CHERRY_PAYS_777[2]}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl px-2 py-1 bg-white/[0.04]">
                  <span className="flex"><SymBox sym="cherry" px={28} /><span className="w-14" /></span>
                  <span className="flex-1 text-[11px] text-white/50">{tr("1 anh đào ở cuộn trái", "1 cherry on the left reel", "左轉輪 1 顆櫻桃")}</span>
                  <span className="font-mono font-black text-yellow-300 text-lg">×{CHERRY_PAYS_777[1]}</span>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-gradient-to-r from-fuchsia-900/50 to-purple-900/30 border border-fuchsia-400/30 p-3 flex gap-3 items-center">
                <span className="text-4xl">⭐</span>
                <p className="text-xs text-white/80 leading-relaxed">
                  {tr(
                    "Ngôi sao là WILD: thay cho mọi biểu tượng và nhân đôi tiền thắng của dòng. Hai ngôi sao ×4! (Thắng anh đào vẫn cần ít nhất một quả anh đào thật.)",
                    "The star is WILD: it stands in for any symbol and doubles the line win. Two stars ×4! (Cherry wins still need at least one real cherry.)",
                    "星星是 WILD：可替代任何圖案，並讓該連線獎金翻倍。兩顆星星 ×4！（櫻桃獎仍需至少一顆真的櫻桃。）",
                  )}
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono font-black text-yellow-300">
                    <span className="inline-flex items-center"><SymBox sym="seven" px={20} /><SymBox sym="seven" px={20} /><SymBox sym="star" px={20} />&nbsp;×{fmtCoins(PAY3_777.seven * 2)}</span>
                    <span className="inline-flex items-center"><SymBox sym="seven" px={20} /><SymBox sym="star" px={20} /><SymBox sym="star" px={20} />&nbsp;×{fmtCoins(PAY3_777.seven * 4)}</span>
                  </span>
                </p>
              </div>

              <h3 className="mt-4 mb-2 text-xs font-black uppercase tracking-widest text-yellow-400/80">{tr("5 dòng thưởng", "The 5 paylines", "5 條連線")}</h3>
              <div className="grid grid-cols-5 gap-2">
                {PAYLINES_777.map((rows, i) => (
                  <div key={i} className="text-center">
                    <div className="grid grid-cols-3 gap-[2px] rounded-md overflow-hidden bg-white/10 p-[2px]">
                      {[0, 1, 2].map((row) => [0, 1, 2].map((reel) => (
                        <span key={`${row}-${reel}`} className="aspect-square rounded-[2px]" style={{ background: rows[reel] === row ? LINE_COLORS[i] : "rgba(255,255,255,0.08)" }} />
                      )))}
                    </div>
                    <div className="text-[10px] font-black text-white/60 mt-0.5">{tr(`Dòng ${i + 1}`, `Line ${i + 1}`, `第 ${i + 1} 線`)}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-white/65 leading-relaxed list-disc pl-4">
                <li>{tr("Chơi 1 dòng (giữa), 3 dòng (ngang) hoặc 5 dòng (thêm 2 đường chéo). Tổng cược = số dòng × cược mỗi dòng.", "Play 1 line (middle), 3 lines (rows) or 5 lines (plus both diagonals). Total bet = lines × line bet.", "可玩 1 條（中線）、3 條（三橫線）或 5 條（再加兩條斜線）。總押注 = 連線數 × 每線押注。")}</li>
                <li>{tr("Mỗi cuộn là một dải biểu tượng cố định; máy chủ chọn điểm dừng hoàn toàn ngẫu nhiên.", "Each reel is a fixed strip of symbols; the server picks where it stops completely at random.", "每個轉輪是一條固定的圖案帶；停在哪裡完全由伺服器隨機決定。")}</li>
                <li>{tr(`Thắng từ ×${BIG_WIN_X} tổng cược trở lên là THẮNG LỚN.`, `A win of ×${BIG_WIN_X} your total bet or more is a BIG WIN.`, `贏得總押注 ×${BIG_WIN_X} 以上即為大獎。`)}</li>
                <li className="font-bold text-yellow-200/90">{tr(
                  `Tỷ lệ hoàn trả (RTP): ${rtpText}% cho mỗi dòng, tính chính xác trên toàn bộ ${fmtCoins(combos)} tổ hợp điểm dừng.`,
                  `Return to player: ${rtpText}% on every line, worked out exactly over all ${fmtCoins(combos)} reel-stop combinations.`,
                  `返還率：每條連線 ${rtpText}%，依全部 ${fmtCoins(combos)} 種停輪組合精確計算。`,
                )}</li>
              </ul>
              <p className="mt-3 text-[10px] text-white/35">{tr(
                "Xu chỉ để giải trí, không mua bằng tiền thật và không đổi được ra tiền mặt, giải thưởng hay bất kỳ thứ gì có giá trị.",
                "Coins are for fun only: they can't be bought with real money or exchanged for cash, prizes or anything of value.",
                "金幣僅供娛樂，無法用真錢購買，也無法兌換成現金、獎品或任何有價物品。",
              )}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AppFooter />
    </div>
  );
}

function RoundButton({ children, onClick, label, active = false, disabled = false, testId }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className="flex flex-col items-center gap-1 disabled:opacity-40">
      <span className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition active:scale-90 ${active ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black border-yellow-100 shadow-[0_0_16px_rgba(250,204,21,0.6)]" : "bg-gradient-to-b from-purple-700 to-purple-950 text-yellow-200 border-yellow-500/50"}`}>{children}</span>
      <span className="text-[10px] font-black text-white/60 leading-none text-center">{label}</span>
    </button>
  );
}

/** The numbered line markers down each side of the reels, lit for the lines being played */
function LineMarkers({ side, lines, wins }: { side: "left" | "right"; lines: number; wins: LineWin777[] }) {
  // Where each line enters (left) or leaves (right) the window
  const rowOf = (i: number) => PAYLINES_777[i][side === "left" ? 0 : 2];
  const won = new Set(wins.map((w) => w.line));
  return (
    <div className="w-5 relative" style={{ height: CELL * 3 + 6 }} aria-hidden>
      {PAYLINES_777.map((_, i) => {
        const row = rowOf(i);
        const sameRow = PAYLINES_777.slice(0, i).filter((__, j) => rowOf(j) === row).length;
        const on = i < lines;
        return (
          <span key={i}
            className={`absolute left-0 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center transition ${won.has(i + 1) ? "scale-125 text-black" : on ? "text-black" : "text-white/30 bg-white/10"}`}
            style={{ top: 3 + row * CELL + CELL / 2 - 10 + (sameRow ? (row === 2 ? -24 : 24) : 0), background: on ? LINE_COLORS[i] : undefined, boxShadow: won.has(i + 1) ? `0 0 10px ${LINE_COLORS[i]}` : undefined }}>
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}

/** The paylines drawn over the reels: the winners flash, the one in focus is bold */
function PaylineOverlay({ lines, wins, focusLine, preview }: { lines: number; wins: LineWin777[]; focusLine: number | null; preview: boolean }) {
  const pts = (i: number) => PAYLINES_777[i].map((row, reel) => `${((reel + 0.5) / 3) * 100},${((row + 0.5) / 3) * 100}`);
  const path = (i: number) => { const p = pts(i); const first = p[0].split(","), lastP = p[2].split(","); return `M0,${first[1]} L${p.join(" L")} L100,${lastP[1]}`; };
  const show = preview ? PAYLINES_777.map((_, i) => i).slice(0, lines) : wins.map((w) => w.line - 1);
  if (!show.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      {show.map((i) => {
        const focus = !preview && focusLine === i + 1;
        return (
          <g key={i}>
            <motion.path d={path(i)} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={focus ? 9 : 7} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
            <motion.path d={path(i)} fill="none" stroke={LINE_COLORS[i]} strokeWidth={focus ? 5 : 3.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
              initial={{ opacity: 0 }} animate={{ opacity: preview ? 0.9 : focus ? 1 : [1, 0.35, 1] }}
              transition={{ duration: preview || focus ? 0.2 : 0.7, repeat: preview || focus ? 0 : Infinity }}
              style={{ filter: `drop-shadow(0 0 4px ${LINE_COLORS[i]})` }} />
          </g>
        );
      })}
    </svg>
  );
}
