import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Loader2, RotateCw, Volume2, VolumeX, Wand2, Gift, Info, Crown } from "lucide-react";
import { BET_OPTIONS, PAYLINES, SLOT_SYMBOLS } from "@shared/schema";
import { useGameState, useSpin, useSetBalance, type SpinResponse } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const EMOJI: Record<string, string> = { dragon: "🐉", drum: "🥁", lotus: "🌸", lantern: "🏮", coin: "🪙" };
const GLOW: Record<string, string> = {
  dragon: "drop-shadow(0 0 18px #fbbf24)",
  drum: "drop-shadow(0 0 12px #a855f7)",
  lotus: "drop-shadow(0 0 12px #ec4899)",
  lantern: "drop-shadow(0 0 10px #f97316)",
  coin: "drop-shadow(0 0 8px #facc15)",
};
const LINE_COLORS = ["#facc15", "#f97316", "#22d3ee", "#e879f9", "#4ade80"];
const IDS = SLOT_SYMBOLS.map((s) => s.id);
const randomSymbol = () => IDS[Math.floor(Math.random() * IDS.length)];

const REEL_STOP_MS = [450, 700, 950];

function fmtBet(a: number) {
  return a >= 1_000_000 ? `${a / 1_000_000}M` : `${a / 1000}K`;
}

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const frames = 30;
    const id = setInterval(() => {
      frame++;
      setDisplay(Math.round((value * frame) / frames));
      if (frame >= frames) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

export function SlotMachine() {
  const { t, lang, toggleLang } = useLang();
  const { toast } = useToast();
  const { data: state } = useGameState();
  const spinMutation = useSpin();
  const setBalance = useSetBalance();

  const balance = state?.balance ?? 0;
  const freeSpins = state?.freeSpins ?? 0;

  const [grid, setGrid] = useState<string[][]>([["dragon", "coin", "lotus"], ["drum", "dragon", "lantern"], ["lotus", "coin", "dragon"]]);
  const [reelsSpinning, setReelsSpinning] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [bet, setBet] = useState(BET_OPTIONS[0]);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [overlay, setOverlay] = useState<SpinResponse | null>(null);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [showPaytable, setShowPaytable] = useState(false);
  const timers = useRef<number[]>([]);
  const movingRef = useRef([false, false, false]);
  const setMoving = (m: boolean[]) => {
    movingRef.current = m;
    setReelsSpinning(m);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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
    setGrid(res.grid);
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

    const multiple = res.winAmount / res.bet;
    if (multiple >= 10) {
      setOverlay(res);
      soundManager.win(true);
      confetti({ particleCount: multiple >= 50 ? 300 : 150, spread: 100, origin: { y: 0.6 } });
      later(() => setOverlay(null), 2600);
    } else if (res.winAmount > res.bet) {
      soundManager.win(false);
    } else if (res.winAmount === 0) {
      soundManager.lossComfort();
    }
    if (res.freeSpinsAwarded) {
      soundManager.freeSpin();
      toast({ title: `🎁 ${res.freeSpinsAwarded} ${t.freeSpinsWon}` });
    }
    res.newAchievements.forEach((a) => toast({ title: `🏆 ${a.badgeName}`, description: a.description }));
  }, [setBalance, state?.freeSpinBet, t, toast]);

  const handleSpin = useCallback(async () => {
    if (!canSpin) {
      if (state && freeSpins === 0 && balance < bet) {
        toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
        setAutoSpin(false);
      }
      return;
    }
    setBusy(true);
    setResult(null);
    setOverlay(null);
    setMoving([true, true, true]);
    soundManager.spinStart();
    if (freeSpins === 0) setBalance(balance - bet); // show the stake leaving straight away

    const started = Date.now();
    try {
      const res = await spinMutation.mutateAsync(bet);
      const wait = Math.max(0, 250 - (Date.now() - started));
      REEL_STOP_MS.forEach((ms, col) => later(() => {
        setMoving(movingRef.current.map((v, i) => (i === col ? false : v)));
        setGrid((g) => g.map((c, i) => (i === col ? res.grid[col] : c)));
        soundManager.reelStop();
      }, wait + ms));
      later(() => reveal(res), wait + REEL_STOP_MS[2] + 150);
    } catch (e) {
      setMoving([false, false, false]);
      setBusy(false);
      setAutoSpin(false);
      queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
      const msg = e instanceof ApiError && e.status === 400 ? t.insufficientBalanceDesc : (e as Error).message;
      toast({ title: t.error, description: msg, variant: "destructive" });
    }
  }, [balance, bet, canSpin, freeSpins, reveal, setBalance, spinMutation, state, t, toast]);

  // Auto-spin: queue the next spin whenever the machine goes idle
  useEffect(() => {
    if (!autoSpin || busy) return;
    if (!canSpin) { setAutoSpin(false); return; }
    const id = window.setTimeout(handleSpin, overlay ? 2700 : 900);
    return () => clearTimeout(id);
  }, [autoSpin, busy, canSpin, handleSpin, overlay]);

  // Spin animation: shuffle symbols on the columns that are still moving
  const anyMoving = reelsSpinning.some(Boolean);
  useEffect(() => {
    if (!anyMoving) return;
    const id = setInterval(() => {
      setGrid((g) => g.map((col, i) => (movingRef.current[i] ? col.map(randomSymbol) : col)));
    }, 70);
    return () => clearInterval(id);
  }, [anyMoving]);

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

  const winningCells = new Set<string>();
  const shownLines = !busy && result ? result.winLines : [];
  shownLines.forEach((l) => PAYLINES[l].forEach((row, col) => winningCells.add(`${col}-${row}`)));
  const lockedBet = freeSpins > 0 ? state?.freeSpinBet || bet : bet;

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
          <Button variant="ghost" size="icon" onClick={() => setShowPaytable(true)} className="text-yellow-400" aria-label={t.paytable} data-testid="button-paytable">
            <Info className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {state?.blessed && (
            <span className="text-[10px] sm:text-xs bg-purple-600 px-2 py-1 rounded-full text-white font-black animate-pulse" data-testid="badge-blessed">
              {t.blessedBadge}
            </span>
          )}
          {freeSpins > 0 && (
            <span className="flex items-center gap-1 bg-green-600 px-2 py-1 rounded-full text-white text-xs font-black" data-testid="badge-free-spins">
              <Gift className="w-3 h-3" /> {freeSpins} {t.freeSpinsLeft}
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

      {/* Reels */}
      <div className="relative w-full bg-[#0a051a] rounded-[2rem] p-3 border-4 border-yellow-700/50 shadow-[0_0_60px_rgba(0,0,0,0.9)]">
        <div className="relative grid grid-cols-3 gap-2 sm:gap-3 bg-black/60 rounded-[1.5rem] p-2 sm:p-4 border border-white/5 overflow-hidden">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-2 sm:gap-3">
              {col.map((s, r) => {
                const hit = winningCells.has(`${c}-${r}`);
                const moving = reelsSpinning[c];
                return (
                  <div
                    key={r}
                    className={`flex items-center justify-center aspect-square rounded-2xl border transition-colors duration-300 ${
                      hit ? "bg-yellow-500/20 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]" : "bg-white/5 border-white/10"
                    }`}
                    data-testid={`cell-${c}-${r}`}
                  >
                    <motion.span
                      key={moving ? `m${r}` : `s${s}${r}`}
                      initial={moving ? false : { y: -30, opacity: 0.4 }}
                      animate={moving ? { y: [-12, 12] } : hit ? { y: 0, opacity: 1, scale: [1, 1.15, 1] } : { y: 0, opacity: 1 }}
                      transition={moving ? { repeat: Infinity, repeatType: "mirror", duration: 0.07 } : hit ? { scale: { repeat: Infinity, duration: 0.8 } } : { type: "spring", stiffness: 500, damping: 18 }}
                      className="text-5xl sm:text-6xl select-none"
                      style={{ filter: moving ? "blur(3px)" : GLOW[s] }}
                    >
                      {EMOJI[s]}
                    </motion.span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Payline overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 300" preserveAspectRatio="none">
            {shownLines.map((l) => (
              <motion.polyline
                key={l}
                points={PAYLINES[l].map((row, col) => `${50 + col * 100},${50 + row * 100}`).join(" ")}
                fill="none"
                stroke={LINE_COLORS[l]}
                strokeWidth={5}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.85 }}
                transition={{ duration: 0.4 }}
              />
            ))}
          </svg>
        </div>

        {/* Big win overlay */}
        <AnimatePresence>
          {overlay && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/70 backdrop-blur-sm rounded-[2rem] cursor-pointer"
              onClick={() => setOverlay(null)}
              data-testid="overlay-big-win"
            >
              <motion.div animate={{ y: [-8, 8] }} transition={{ repeat: Infinity, duration: 0.5, repeatType: "mirror" }}>
                <Crown className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
              </motion.div>
              <h2 className="text-yellow-400 text-4xl sm:text-6xl font-black italic tracking-tighter my-2">
                {overlay.winAmount / overlay.bet >= 50 ? t.megaWin : t.bigWin}
              </h2>
              <div className="text-4xl sm:text-6xl font-black text-white font-mono">
                <CountUp value={overlay.winAmount} />
              </div>
              <div className="text-yellow-200/70 font-bold mt-1">×{+(overlay.winAmount / overlay.bet).toFixed(1)}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Result line */}
      <div className="h-8 flex items-center justify-center text-center" aria-live="polite" data-testid="text-result">
        {result && !busy && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-black text-lg">
            {result.winAmount > result.bet ? (
              <span className="text-green-400">{t.youWon} {result.winAmount.toLocaleString()} 🪙{result.blessed ? " (×2)" : ""}</span>
            ) : result.winAmount > 0 ? (
              <span className="text-yellow-200/80">{t.returned}: {result.winAmount.toLocaleString()}</span>
            ) : (
              <span className="text-white/40">{t.noWin}</span>
            )}
          </motion.div>
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
            className="flex-1 h-16 rounded-2xl bg-gradient-to-b from-yellow-400 via-orange-500 to-red-700 text-white font-black text-2xl sm:text-4xl shadow-[0_8px_0_#9a3412] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
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
        <DialogContent className="bg-[#140a2e] border-yellow-500/30 text-yellow-50 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-yellow-400 font-black">{t.paytable}</DialogTitle>
            <DialogDescription className="text-yellow-100/70">{t.paytableIntro}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {SLOT_SYMBOLS.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2">
                <span className="text-2xl tracking-widest">{EMOJI[s.id].repeat(3)}</span>
                <span className="font-mono font-black text-yellow-400">×{s.pays}</span>
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
