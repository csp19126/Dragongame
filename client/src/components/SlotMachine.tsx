import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCw, Volume2, VolumeX, Wand2, Gift, Info, Crown } from "lucide-react";
import { BET_OPTIONS, PAYLINES, SLOT_SYMBOLS, SCATTER_PAYS, WILD_ID, SCATTER_ID } from "@shared/schema";
import { useGameState, useSpin, useSetBalance, type SpinResponse } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { coinBurst, fireworks, luckyRain, cannons, stopCelebrations, winTier, type WinTier } from "@/lib/celebrate";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const EMOJI: Record<string, string> = {
  pearl: "🔮", dragon: "🐉", drum: "🥁", lotus: "🌸", lantern: "🏮", coin: "🪙", envelope: "🧧",
};
const GLOW: Record<string, string> = {
  pearl: "drop-shadow(0 0 14px #c4b5fd)",
  dragon: "drop-shadow(0 0 18px #fbbf24)",
  drum: "drop-shadow(0 0 12px #a855f7)",
  lotus: "drop-shadow(0 0 12px #ec4899)",
  lantern: "drop-shadow(0 0 10px #f97316)",
  coin: "drop-shadow(0 0 8px #facc15)",
  envelope: "drop-shadow(0 0 12px #ef4444)",
};
const LINE_COLORS = ["#facc15", "#f97316", "#22d3ee", "#e879f9", "#4ade80", "#f87171", "#60a5fa", "#fbbf24", "#a3e635"];
const BULB_COLORS = ["#facc15", "#ef4444", "#f472b6", "#22d3ee"];
const IDS = SLOT_SYMBOLS.map((s) => s.id);
const randomSymbol = () => IDS[Math.floor(Math.random() * IDS.length)];

const REEL_STOP_MS = [520, 820, 1120];
const OVERLAY_MS: Record<WinTier, number> = { none: 0, small: 0, win: 0, big: 2600, mega: 3800, epic: 5200 };

function fmtBet(a: number) {
  return a >= 1_000_000 ? `${a / 1_000_000}M` : `${a / 1000}K`;
}

function CountUp({ value, ms = 1200 }: { value: number; ms?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setDisplay(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{display.toLocaleString()}</>;
}

/** One reel column: a blurred scrolling strip while spinning, then the landed symbols with a bounce */
function Reel({ symbols, spinning, spinId, lineCells, scatterRows, celebrate }: {
  symbols: string[];
  spinning: boolean;
  spinId: number;
  lineCells: Set<number>;
  scatterRows: Set<number>;
  celebrate: boolean;
}) {
  // A fresh random strip for every spin, repeated twice so the CSS loop is seamless
  const strip = useMemo(() => {
    const s = Array.from({ length: 6 }, randomSymbol);
    return [...s, ...s];
  }, [spinId]);

  return (
    <div className="relative" data-testid="reel">
      <div className={`flex flex-col gap-2 sm:gap-3 ${spinning ? "opacity-0" : "reel-land"}`} key={`land-${spinId}-${spinning}`}>
        {symbols.map((s, r) => {
          const onLine = celebrate && lineCells.has(r);
          const scatter = celebrate && scatterRows.has(r);
          return (
            <div
              key={r}
              className={`flex items-center justify-center aspect-square rounded-2xl border transition-colors duration-300 ${
                scatter ? "bg-red-500/25 border-red-400 shadow-[0_0_24px_rgba(239,68,68,0.6)]"
                  : onLine ? "bg-yellow-500/20 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                  : "bg-white/5 border-white/10"
              }`}
              data-testid="reel-cell"
            >
              <span
                className={`text-5xl sm:text-6xl select-none ${scatter ? "scatter-hit" : onLine ? "symbol-winning" : ""} ${s === WILD_ID ? "wild-glow" : ""}`}
                style={{ filter: GLOW[s] }}
              >
                {EMOJI[s]}
              </span>
            </div>
          );
        })}
      </div>
      {spinning && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white/5 border border-white/10">
          <div className="reel-strip absolute inset-x-0 top-0" style={{ height: "400%" }}>
            {strip.map((s, i) => (
              <div key={i} className="flex items-center justify-center" style={{ height: `${100 / strip.length}%` }}>
                <span className="text-5xl sm:text-6xl select-none">{EMOJI[s]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Bulbs({ mode }: { mode: "idle" | "spin" | "win" }) {
  return (
    <div className={`flex justify-between px-3 bulbs-${mode}`} aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="bulb" style={{ color: BULB_COLORS[i % BULB_COLORS.length], animationDelay: `${(i % 4) * 0.11}s` }} />
      ))}
    </div>
  );
}

export function SlotMachine() {
  const { t, lang, toggleLang } = useLang();
  const { toast } = useToast();
  const { data: state } = useGameState();
  const spinMutation = useSpin();
  const setBalance = useSetBalance();

  const balance = state?.balance ?? 0;
  const freeSpins = state?.freeSpins ?? 0;

  const [grid, setGrid] = useState<string[][]>([["dragon", "pearl", "lotus"], ["envelope", "dragon", "lantern"], ["lotus", "drum", "dragon"]]);
  const [reelsSpinning, setReelsSpinning] = useState([false, false, false]);
  const [spinId, setSpinId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bet, setBet] = useState(BET_OPTIONS[0]);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [overlay, setOverlay] = useState<{ res: SpinResponse; tier: WinTier } | null>(null);
  const [scatterBanner, setScatterBanner] = useState<SpinResponse | null>(null);
  const [shaking, setShaking] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [showPaytable, setShowPaytable] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); stopCelebrations(); }, []);

  // Keep the bet affordable after a loss
  useEffect(() => {
    if (!state || freeSpins > 0 || busy || bet <= balance) return;
    const affordable = [...BET_OPTIONS].reverse().find((b) => b <= balance);
    if (affordable) setBet(affordable);
  }, [balance, bet, busy, freeSpins, state]);

  const canSpin = !busy && !!state && (freeSpins > 0 || balance >= bet);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const reveal = useCallback((res: SpinResponse) => {
    setResult(res);
    setBalance(res.newBalance, {
      freeSpins: res.totalFreeSpins,
      freeSpinBet: res.isFreeSpin || res.freeSpinsAwarded ? res.bet : state?.freeSpinBet ?? 0,
      streak: res.streak,
      totalWins: res.totalWins,
      maxWin: res.maxWin,
      gamesPlayed: res.gamesPlayed,
      blessed: false,
    });
    setBusy(false);

    // Celebrations scale with the win. Spins that pay back less than the bet are not celebrated.
    const tier = winTier(res.winAmount, res.bet);
    if (tier === "win") {
      coinBurst();
      soundManager.win(false);
    } else if (tier === "big" || tier === "mega" || tier === "epic") {
      setOverlay({ res, tier });
      setShaking(true);
      later(() => setShaking(false), 1300);
      soundManager.bigWinFanfare();
      soundManager.coinShower();
      if (tier === "big") fireworks(2200);
      if (tier === "mega") { fireworks(3400, 1.4); luckyRain(3200); }
      if (tier === "epic") { fireworks(4800, 1.8); cannons(2600); luckyRain(4600); }
      later(() => setOverlay(null), OVERLAY_MS[tier]);
    } else if (tier === "none" && res.scatterCount < 3) {
      soundManager.lossComfort();
    }

    if (res.freeSpinsAwarded) {
      later(() => {
        setScatterBanner(res);
        soundManager.freeSpin();
        soundManager.bonus();
        if (tier === "none" || tier === "small" || tier === "win") luckyRain(2400);
      }, OVERLAY_MS[tier] ? OVERLAY_MS[tier] - 400 : 150);
      later(() => setScatterBanner(null), (OVERLAY_MS[tier] || 0) + 2600);
    }
    res.newAchievements.forEach((a) => toast({ title: `🏆 ${a.badgeName}`, description: a.description }));
  }, [setBalance, state?.freeSpinBet, toast]);

  const handleSpin = useCallback(async () => {
    if (!canSpin) {
      if (state && freeSpins === 0 && balance < bet) {
        toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
        setAutoSpin(false);
      }
      return;
    }
    stopCelebrations();
    setBusy(true);
    setResult(null);
    setOverlay(null);
    setScatterBanner(null);
    setSpinId((n) => n + 1);
    setReelsSpinning([true, true, true]);
    soundManager.spinStart();
    if (freeSpins === 0) setBalance(balance - bet); // show the stake leaving straight away

    const started = Date.now();
    try {
      const res = await spinMutation.mutateAsync(bet);
      const wait = Math.max(0, 300 - (Date.now() - started));
      REEL_STOP_MS.forEach((ms, col) => later(() => {
        setGrid((g) => g.map((c, i) => (i === col ? res.grid[col] : c)));
        setReelsSpinning((r) => r.map((v, i) => (i === col ? false : v)));
        soundManager.reelStop();
      }, wait + ms));
      later(() => reveal(res), wait + REEL_STOP_MS[2] + 380);
    } catch (e) {
      setReelsSpinning([false, false, false]);
      setBusy(false);
      setAutoSpin(false);
      queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
      const msg = e instanceof ApiError && e.status === 400 ? t.insufficientBalanceDesc : (e as Error).message;
      toast({ title: t.error, description: msg, variant: "destructive" });
    }
  }, [balance, bet, canSpin, freeSpins, reveal, setBalance, spinMutation, state, t, toast]);

  // Auto-spin: queue the next spin once the machine is idle and any celebration has played
  useEffect(() => {
    if (!autoSpin || busy) return;
    if (!canSpin) { setAutoSpin(false); return; }
    const id = window.setTimeout(handleSpin, overlay ? OVERLAY_MS[overlay.tier] + 200 : scatterBanner ? 2600 : 900);
    return () => clearTimeout(id);
  }, [autoSpin, busy, canSpin, handleSpin, overlay, scatterBanner]);

  // Space bar spins
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handleSpin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSpin]);

  const consultOracle = async () => {
    soundManager.buttonClick();
    try {
      const r = await (await apiRequest("POST", "/api/game/oracle")).json();
      if (r.granted) {
        soundManager.bonus();
        queryClient.setQueryData(["/api/game/state"], (old: any) => (old ? { ...old, blessed: true, lastOracleAt: new Date().toISOString() } : old));
        toast({ title: `🐉 ${t.oracle}`, description: t.oracleBlessed });
      } else {
        const at = new Date(r.nextAvailableAt).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-GB", { hour: "2-digit", minute: "2-digit" });
        toast({ title: `🐉 ${t.oracle}`, description: `${t.oracleCooldown} ${at}` });
      }
    } catch (e) {
      toast({ title: t.error, description: (e as Error).message, variant: "destructive" });
    }
  };

  const toggleMute = () => {
    soundManager.setMuted(!muted);
    setMuted(!muted);
  };

  // Which cells to light up, per column
  const celebrate = !busy && !!result;
  const lineCellsByCol = [new Set<number>(), new Set<number>(), new Set<number>()];
  const scatterRowsByCol = [new Set<number>(), new Set<number>(), new Set<number>()];
  if (celebrate && result) {
    result.winLines.forEach((l) => PAYLINES[l].forEach((row, col) => lineCellsByCol[col].add(row)));
    if (result.scatterCount >= 3) {
      result.grid.forEach((col, c) => col.forEach((s, r) => { if (s === SCATTER_ID) scatterRowsByCol[c].add(r); }));
    }
  }
  const shownLines = celebrate && result ? result.winLines : [];
  const lockedBet = freeSpins > 0 ? state?.freeSpinBet || bet : bet;
  const bulbMode = busy ? "spin" : overlay || scatterBanner || (result && result.winAmount > result.bet) ? "win" : "idle";
  const tierTitle = (tier: WinTier) => (tier === "epic" ? t.megaWin : tier === "mega" ? t.hugeWin : t.bigWin);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md mx-auto" data-testid="slot-machine">
      {/* Top bar */}
      <div className="w-full flex justify-between items-center bg-indigo-950/80 px-3 py-2 sm:px-5 sm:py-3 rounded-2xl border border-yellow-500/20 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleMute} className="text-yellow-400" aria-label={t.sound} data-testid="button-mute">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleLang} className="text-yellow-400 font-bold" data-testid="button-lang">
            {lang === "en" ? "EN" : "VI"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { stopCelebrations(); setShowPaytable(true); }} className="text-yellow-400" aria-label={t.paytable} data-testid="button-paytable">
            <Info className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {state?.blessed && (
            <span className="text-[10px] sm:text-xs bg-purple-600 px-2 py-1 rounded-full text-white font-black animate-pulse" data-testid="badge-blessed">
              {t.blessedBadge}
            </span>
          )}
          <div className="text-right">
            <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest">{t.balance}</p>
            <p className="text-xl sm:text-3xl font-mono font-black text-yellow-400 tracking-tight" data-testid="text-machine-balance">
              {balance.toLocaleString()} 🪙
            </p>
          </div>
        </div>
      </div>

      {/* Cabinet */}
      <div
        className={`relative w-full bg-gradient-to-b from-[#2a0f4f] via-[#140726] to-[#0a051a] rounded-[2rem] pt-2 pb-2 px-2 sm:px-3 border-4 shadow-[0_0_60px_rgba(0,0,0,0.9)] ${
          freeSpins > 0 ? "border-purple-400 free-spins-frame" : "border-yellow-700/60"
        } ${shaking ? "cabinet-shake" : ""}`}
        data-testid="cabinet"
      >
        <Bulbs mode={bulbMode} />

        {freeSpins > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-10 flex items-center gap-1 bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 py-1 rounded-full text-white text-xs font-black shadow-lg border-2 border-yellow-300" data-testid="badge-free-spins">
            <Gift className="w-3.5 h-3.5" /> {t.freeSpinsMode} · {freeSpins}
          </div>
        )}

        <div className="relative grid grid-cols-3 gap-2 sm:gap-3 bg-black/60 rounded-[1.5rem] p-2 sm:p-3 my-2 border border-white/5 overflow-hidden">
          {grid.map((col, c) => (
            <Reel
              key={c}
              symbols={col}
              spinning={reelsSpinning[c]}
              spinId={spinId}
              lineCells={lineCellsByCol[c]}
              scatterRows={scatterRowsByCol[c]}
              celebrate={celebrate}
            />
          ))}

          {/* Payline overlay: each winning line drawn in turn */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 300" preserveAspectRatio="none">
            {shownLines.map((l, i) => (
              <motion.polyline
                key={`${spinId}-${l}`}
                points={PAYLINES[l].map((row, col) => `${50 + col * 100},${50 + row * 100}`).join(" ")}
                fill="none"
                stroke={LINE_COLORS[l]}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 6px ${LINE_COLORS[l]})` }}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                transition={{ duration: 0.35, delay: i * 0.18 }}
              />
            ))}
          </svg>
        </div>

        <Bulbs mode={bulbMode} />

        {/* Big / mega / epic win overlay */}
        <AnimatePresence>
          {overlay && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/70 backdrop-blur-sm rounded-[2rem] cursor-pointer"
              onClick={() => setOverlay(null)}
              data-testid="overlay-big-win"
            >
              <motion.div animate={{ y: [-8, 8], rotate: [-6, 6] }} transition={{ repeat: Infinity, duration: 0.5, repeatType: "mirror" }}>
                {overlay.tier === "epic" ? <span className="text-7xl">🐉</span> : <Crown className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />}
              </motion.div>
              <motion.h2
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-4xl sm:text-6xl font-black italic tracking-tighter my-2 bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]"
              >
                {tierTitle(overlay.tier)}
              </motion.h2>
              <div className="text-4xl sm:text-6xl font-black text-white font-mono drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]">
                <CountUp value={overlay.res.winAmount} ms={OVERLAY_MS[overlay.tier] * 0.55} />
              </div>
              <div className="text-yellow-200/80 font-bold mt-1">×{+(overlay.res.winAmount / overlay.res.bet).toFixed(1)}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lucky envelopes banner */}
        <AnimatePresence>
          {scatterBanner && !overlay && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.3 }}
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-20 rounded-3xl bg-gradient-to-b from-red-600 to-red-800 border-4 border-yellow-300 shadow-[0_0_40px_rgba(239,68,68,0.8)] text-center py-4 px-3"
              data-testid="banner-scatter"
            >
              <div className="text-4xl">🧧🧧🧧</div>
              <div className="text-2xl sm:text-3xl font-black text-yellow-300 tracking-tight">{t.scatterWin}</div>
              <div className="text-white font-black text-lg">+{scatterBanner.freeSpinsAwarded} {t.freeSpinsLeft}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Result line + what paid */}
      <div className="min-h-[3.25rem] flex flex-col items-center justify-start text-center gap-1" aria-live="polite" data-testid="text-result">
        {result && !busy && (
          <>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-black text-lg">
              {result.winAmount > result.bet ? (
                <span className="text-green-400">{t.youWon} {result.winAmount.toLocaleString()} 🪙{result.blessed ? " (×2)" : ""}</span>
              ) : result.winAmount > 0 ? (
                <span className="text-yellow-200/70">{t.smallWin} +{result.winAmount.toLocaleString()} · {t.bet} {result.bet.toLocaleString()}</span>
              ) : (
                <span className="text-white/40">{t.noWin}</span>
              )}
            </motion.div>
            {(result.lineWins.length > 0 || result.scatterWin > 0) && (
              <div className="flex flex-wrap justify-center gap-1.5" data-testid="win-breakdown">
                {result.lineWins.slice(0, 4).map((w, i) => (
                  <motion.span
                    key={`${w.line}-${i}`}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.18 }}
                    className="text-xs font-bold px-2 py-0.5 rounded-full border bg-black/40"
                    style={{ borderColor: LINE_COLORS[w.line], color: LINE_COLORS[w.line] }}
                  >
                    {EMOJI[w.symbol].repeat(3)}{w.withWild ? " 🔮" : ""} +{w.amount.toLocaleString()}
                  </motion.span>
                ))}
                {result.lineWins.length > 4 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/40 text-yellow-200/70">+{result.lineWins.length - 4}</span>
                )}
                {result.scatterWin > 0 && (
                  <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                    className="text-xs font-bold px-2 py-0.5 rounded-full border border-red-400 text-red-300 bg-black/40">
                    🧧×{result.scatterCount} +{result.scatterWin.toLocaleString()}
                  </motion.span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="w-full bg-black/70 p-4 rounded-[2rem] border border-white/10 backdrop-blur-2xl">
        <div className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest mb-2 text-center">
          {t.bet}: {lockedBet.toLocaleString()}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
          {BET_OPTIONS.map((a) => (
            <button
              key={a}
              disabled={busy || freeSpins > 0 || a > balance}
              onClick={() => { setBet(a); soundManager.betChange(); }}
              className={`py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed ${
                lockedBet === a ? "bg-yellow-500 text-black shadow-[0_0_16px_rgba(251,191,36,0.5)]" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
              data-testid={`button-bet-${a}`}
            >
              {fmtBet(a)}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleSpin}
            disabled={!canSpin}
            className={`relative overflow-hidden spin-shine flex-1 h-16 rounded-2xl text-white font-black text-2xl sm:text-4xl shadow-[0_8px_0_#9a3412] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60 ${
              freeSpins > 0 ? "bg-gradient-to-b from-fuchsia-400 via-purple-600 to-indigo-800" : "bg-gradient-to-b from-yellow-400 via-orange-500 to-red-700"
            }`}
            data-testid="button-spin"
          >
            {busy ? <Loader2 className="animate-spin w-10 h-10" /> : freeSpins > 0 ? `${t.spin} 🎁` : t.spin}
          </Button>
          <Button
            onClick={() => { setAutoSpin(!autoSpin); soundManager.autoSpinToggle(); }}
            aria-pressed={autoSpin}
            aria-label={t.autoSpin}
            className={`h-16 w-16 sm:w-20 rounded-2xl border-2 flex-col gap-0 ${autoSpin ? "bg-green-600 border-green-400 text-white" : "bg-white/5 border-white/10 text-yellow-500 hover:bg-white/10"}`}
            data-testid="button-autospin"
          >
            <RotateCw className={autoSpin ? "animate-spin w-6 h-6" : "w-6 h-6"} />
            <span className="text-[10px] font-black uppercase">{t.autoSpin}</span>
          </Button>
          <Button
            onClick={consultOracle}
            disabled={state?.blessed}
            aria-label={t.oracle}
            className="h-16 w-16 sm:w-20 rounded-2xl bg-purple-900/40 border-2 border-purple-500/50 text-purple-300 hover:bg-purple-800/50 flex-col gap-0"
            data-testid="button-oracle"
          >
            <Wand2 className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase">{t.oracle}</span>
          </Button>
        </div>
      </div>

      <Dialog open={showPaytable} onOpenChange={setShowPaytable}>
        <DialogContent className="bg-[#140a2e] border-yellow-500/30 text-yellow-50 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-yellow-400 font-black">{t.paytable}</DialogTitle>
            <DialogDescription className="text-yellow-100/70">{t.paytableIntro}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {SLOT_SYMBOLS.filter((s) => s.kind !== "scatter").map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-xl px-4 py-2 ${s.kind === "wild" ? "bg-purple-500/20 border border-purple-400/40" : "bg-white/5"}`}>
                <span className="text-2xl tracking-widest">
                  {EMOJI[s.id].repeat(3)}
                  {s.kind === "wild" && <span className="ml-2 text-[10px] font-black tracking-normal text-purple-200 align-middle">{t.wild}</span>}
                </span>
                <span className="font-mono font-black text-yellow-400">×{s.pays}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-purple-200/90">{t.paytableWild}</p>
          <p className="text-sm text-red-200/90 mt-1">{t.paytableScatter}</p>
          <div className="space-y-1.5">
            {[...SCATTER_PAYS].reverse().map((tier) => (
              <div key={tier.count} className="flex items-center justify-between bg-red-500/15 border border-red-400/30 rounded-xl px-4 py-1.5">
                <span className="text-xl">{"🧧".repeat(tier.count)}<span className="text-[10px] text-red-200 ml-1">{tier.count === 5 ? "5+" : ""}</span></span>
                <span className="font-mono font-black text-yellow-400 text-sm">×{tier.pays} + {tier.freeSpins} 🎁</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2 my-2">
            {PAYLINES.map((line, l) => (
              <svg key={l} viewBox="0 0 30 30" className="w-full bg-white/5 rounded">
                {[0, 1, 2].flatMap((c) => [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={c * 10 + 1} y={r * 10 + 1} width={8} height={8} rx={1.5} fill={line[c] === r ? LINE_COLORS[l] : "rgba(255,255,255,0.1)"} />))}
              </svg>
            ))}
          </div>
          <p className="text-sm text-yellow-100/70">{t.paytableFree}</p>
          <p className="text-sm text-yellow-100/70">{t.oracleBlessed}.</p>
          <p className="text-xs text-yellow-100/50">{t.rtpNote}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
