import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { Loader2, Brain, Flame, Zap, Crown, RotateCw, Gift, Sparkles, Share2, AlertTriangle } from "lucide-react";

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];
const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

const SYMBOL_GLOW: Record<string, { color: string; shadow: string; bg: string }> = {
  "🐉": { color: "#fbbf24", shadow: "0 0 25px #fbbf24, 0 0 50px #f59e0b", bg: "rgba(251,191,36,0.15)" },
  "🧧": { color: "#ef4444", shadow: "0 0 25px #ef4444, 0 0 50px #dc2626", bg: "rgba(239,68,68,0.15)" },
  "🏮": { color: "#f97316", shadow: "0 0 25px #f97316, 0 0 50px #ea580c", bg: "rgba(249,115,22,0.15)" },
  "💎": { color: "#38bdf8", shadow: "0 0 25px #38bdf8, 0 0 50px #0ea5e9", bg: "rgba(56,189,248,0.15)" },
  "🪙": { color: "#facc15", shadow: "0 0 25px #facc15, 0 0 50px #eab308", bg: "rgba(250,204,21,0.15)" },
  "🎎": { color: "#c084fc", shadow: "0 0 25px #c084fc, 0 0 50px #a855f7", bg: "rgba(192,132,252,0.15)" },
  "🌸": { color: "#f472b6", shadow: "0 0 25px #f472b6, 0 0 50px #ec4899", bg: "rgba(244,114,182,0.15)" },
  "🏯": { color: "#a78bfa", shadow: "0 0 25px #a78bfa, 0 0 50px #8b5cf6", bg: "rgba(167,139,250,0.15)" },
  "⚔️": { color: "#94a3b8", shadow: "0 0 25px #94a3b8, 0 0 50px #64748b", bg: "rgba(148,163,184,0.15)" },
  "📜": { color: "#fcd34d", shadow: "0 0 25px #fcd34d, 0 0 50px #fbbf24", bg: "rgba(252,211,77,0.15)" },
};

const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
const makeGrid = (): string[][] => [
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
];

const PAYLINE_COORDS: [number, number][][] = [
  [[0,0],[1,0],[2,0]],
  [[0,1],[1,1],[2,1]],
  [[0,2],[1,2],[2,2]],
  [[0,0],[1,1],[2,2]],
  [[0,2],[1,1],[2,0]],
];

const PAYLINE_COLORS = [
  'var(--slot-payline-gold)',
  'var(--slot-payline-purple)',
  'var(--slot-payline-red)',
  'var(--slot-payline-cyan)',
  'var(--slot-payline-green)',
];

const PAYLINE_LABELS = ['TOP', 'MID', 'BOT', '↘', '↗'];

function formatBet(amount: number): string {
  if (amount >= 1000000) return `${amount / 1000000}M`;
  if (amount >= 1000) return `${amount / 1000}K`;
  return String(amount);
}

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span>{display.toLocaleString()}</span>;
}

function StreakIcon({ streak }: { streak: number }) {
  if (streak >= 10) return <Crown className="w-5 h-5 text-yellow-300 inline-block" />;
  if (streak >= 5) return <Zap className="w-5 h-5 text-cyan-300 inline-block" />;
  if (streak >= 3) return <Flame className="w-5 h-5 text-orange-400 inline-block" />;
  return null;
}

function GridCell({ symbol, isSpinning, col, row, isWinning, isSlowing }: {
  symbol: string;
  isSpinning: boolean;
  col: number;
  row: number;
  isWinning: boolean;
  isSlowing: boolean;
}) {
  const [spinSymbol, setSpinSymbol] = useState(getRandomSymbol());
  const glow = SYMBOL_GLOW[isSpinning ? spinSymbol : symbol] || SYMBOL_GLOW["📜"];

  useEffect(() => {
    if (isSpinning) {
      const speed = isSlowing ? 100 : 30;
      const interval = setInterval(() => setSpinSymbol(getRandomSymbol()), speed);
      return () => clearInterval(interval);
    }
  }, [isSpinning, isSlowing]);

  const displaySymbol = isSpinning ? spinSymbol : symbol;

  return (
    <div
      data-testid={`cell-${col}-${row}`}
      className="relative flex items-center justify-center aspect-square overflow-hidden"
    >
      {!isSpinning && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={isWinning
            ? { opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }
            : { opacity: [0.05, 0.12, 0.05] }
          }
          transition={{ duration: isWinning ? 0.8 : 3, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `radial-gradient(circle at center, ${glow.bg} 0%, transparent 70%)`,
          }}
        />
      )}

      <AnimatePresence mode="popLayout">
        <motion.div
          key={isSpinning ? `spin-${col}-${row}-${Math.random()}` : `stop-${symbol}-${col}-${row}`}
          initial={isSpinning
            ? { y: -30, opacity: 0, scale: 0.3, rotateX: 90 }
            : { y: -40, opacity: 0, scale: 0.2, rotateX: -180 }
          }
          animate={isSpinning
            ? { y: 0, opacity: 0.6, scale: 0.9, rotateX: 0 }
            : isWinning
              ? {
                  y: 0, opacity: 1, scale: [0.2, 1.3, 1.05],
                  rotateX: 0,
                  rotate: [0, -5, 5, -3, 0],
                }
              : { y: 0, opacity: 1, scale: [0.2, 1.15, 1], rotateX: 0 }
          }
          exit={{ y: 30, opacity: 0, scale: 0.3, rotateX: -90 }}
          transition={{
            type: "spring",
            stiffness: isSpinning ? 1200 : 120,
            damping: isSpinning ? 12 : 12,
            mass: isSpinning ? 0.1 : 0.8,
            delay: isSpinning ? 0 : col * 0.1 + row * 0.03,
          }}
          className={`select-none relative z-10 symbol-cell ${isWinning ? 'symbol-winning' : ''}`}
          style={{
            fontSize: 'clamp(2.2rem, 8vw, 4rem)',
            lineHeight: 1,
            filter: isSpinning
              ? (isSlowing ? 'blur(1px) brightness(0.7)' : 'blur(4px) brightness(0.4)')
              : isWinning
                ? `drop-shadow(${glow.shadow}) brightness(1.2)`
                : `drop-shadow(0 0 12px ${glow.color}44) drop-shadow(0 4px 8px rgba(0,0,0,0.6))`,
            textShadow: isSpinning ? 'none'
              : isWinning
                ? `${glow.shadow}, 0 4px 15px rgba(0,0,0,0.5)`
                : `0 0 15px ${glow.color}33, 0 4px 12px rgba(0,0,0,0.5)`,
          }}
        >
          {displaySymbol}
        </motion.div>
      </AnimatePresence>

      {isWinning && !isSpinning && (
        <>
          <motion.div
            animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.5, 0.8] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 pointer-events-none rounded-xl z-0"
            style={{ background: `radial-gradient(circle, ${glow.color}40 0%, transparent 60%)` }}
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-20%] pointer-events-none z-0"
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, ${glow.color}15 10%, transparent 20%, ${glow.color}10 30%, transparent 40%, ${glow.color}15 50%, transparent 60%, ${glow.color}10 70%, transparent 80%, ${glow.color}15 90%, transparent 100%)`,
            }}
          />
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full pointer-events-none z-20"
              style={{ backgroundColor: glow.color }}
              animate={{
                x: [0, (Math.random() - 0.5) * 60],
                y: [0, -30 - Math.random() * 30],
                opacity: [0.8, 0],
                scale: [1, 0.3],
              }}
              transition={{
                duration: 0.8 + Math.random() * 0.6,
                repeat: Infinity,
                delay: i * 0.25,
                ease: "easeOut",
              }}
            />
          ))}
        </>
      )}

      {!isSpinning && !isWinning && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0 rounded-xl"
          animate={{ opacity: [0, 0.08, 0] }}
          transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: col * 0.3 + row * 0.2 }}
          style={{
            background: `radial-gradient(circle at 50% 30%, ${glow.color}20 0%, transparent 60%)`,
          }}
        />
      )}
    </div>
  );
}

function WinLineOverlay({ winLines, gridRef }: { winLines: number[]; gridRef: React.RefObject<HTMLDivElement | null> }) {
  if (winLines.length === 0 || !gridRef.current) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[25]">
      {winLines.map((lineIdx) => {
        const color = PAYLINE_COLORS[lineIdx];
        const label = PAYLINE_LABELS[lineIdx];
        const isTopRow = lineIdx === 0;
        const isMidRow = lineIdx === 1;
        const isBotRow = lineIdx === 2;
        const isDiagDown = lineIdx === 3;
        const isDiagUp = lineIdx === 4;

        let lineStyle: React.CSSProperties = {};
        if (isTopRow) {
          lineStyle = { top: '13.3%', left: 0, right: 0, height: '2px', position: 'absolute' };
        } else if (isMidRow) {
          lineStyle = { top: '50%', left: 0, right: 0, height: '2px', position: 'absolute', transform: 'translateY(-1px)' };
        } else if (isBotRow) {
          lineStyle = { bottom: '13.3%', left: 0, right: 0, height: '2px', position: 'absolute' };
        }

        if (isTopRow || isMidRow || isBotRow) {
          return (
            <motion.div
              key={lineIdx}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1, opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.3, opacity: { duration: 1, repeat: Infinity } }}
              style={{ ...lineStyle, background: color, boxShadow: `0 0 10px ${color}`, transformOrigin: 'left' }}
            >
              <span className="absolute -left-1 -top-3 text-[8px] font-black text-yellow-300 bg-black/60 px-1 rounded">{label}</span>
            </motion.div>
          );
        }

        if (isDiagDown || isDiagUp) {
          return (
            <motion.svg
              key={lineIdx}
              className="absolute inset-0 w-full h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <line
                x1="16.6%"
                y1={isDiagDown ? "13.3%" : "86.6%"}
                x2="83.3%"
                y2={isDiagDown ? "86.6%" : "13.3%"}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                filter={`drop-shadow(0 0 6px ${color})`}
              />
              <text x="2%" y={isDiagDown ? "15%" : "90%"} fill="#fcd34d" fontSize="8" fontWeight="900">{label}</text>
            </motion.svg>
          );
        }
        return null;
      })}
    </div>
  );
}

function NearMissOverlay({ show, soCloseText }: { show: boolean; soCloseText: string }) {
  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0.7, 1, 0] }}
      transition={{ duration: 1.5 }}
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.3, rotate: -10 }}
        animate={{ scale: [0.3, 1.3, 1], rotate: [-10, 5, 0] }}
        transition={{ duration: 0.5 }}
        className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-display font-black text-xl sm:text-2xl md:text-3xl uppercase tracking-wider"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--slot-red),0.9), rgba(var(--slot-orange),0.9))',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          boxShadow: '0 0 60px rgba(var(--slot-red),0.5), 0 0 120px rgba(var(--slot-orange),0.3)',
          color: `rgb(var(--slot-gold-light))`,
        }}
      >
        <AlertTriangle className="w-6 h-6 inline mr-2" />
        {soCloseText}
      </motion.div>
    </motion.div>
  );
}

function FakeRepeaterOverlay({ show, onDone, repeaterText, reSpinningText }: { show: boolean; onDone: () => void; repeaterText: string; reSpinningText: string }) {
  useEffect(() => {
    if (show) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [show, onDone]);

  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center"
    >
      <motion.div
        animate={{ scale: [1, 1.15, 1, 1.1, 1], rotate: [0, -2, 2, -1, 0] }}
        transition={{ duration: 0.8, repeat: 2 }}
        className="px-6 sm:px-10 py-4 sm:py-6 rounded-2xl font-display font-black text-2xl sm:text-3xl md:text-4xl uppercase tracking-wider text-center mx-4"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--slot-cyan),0.95), rgba(var(--slot-blue),0.95))',
          textShadow: '0 2px 15px rgba(0,0,0,0.5)',
          boxShadow: '0 0 80px rgba(var(--slot-cyan),0.6), 0 0 160px rgba(var(--slot-blue),0.3)',
          color: '#fff',
        }}
      >
        <RotateCw className="w-8 h-8 inline mr-3 animate-spin" />
        {repeaterText}
        <div className="text-base mt-2 text-cyan-100 font-bold tracking-normal">{reSpinningText}</div>
      </motion.div>
    </motion.div>
  );
}

function ShareWinButton({ winAmount, bet, shareWinText }: { winAmount: number; bet: number; shareWinText: string }) {
  if (winAmount < bet * 3) return null;
  const shareText = `🐉 I just won ${winAmount.toLocaleString()}đ on VnSlot 888 Dragon Fortune! 🎰💰 Can you beat my score?`;
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'VnSlot 888 Dragon Fortune', text: shareText }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      onClick={handleShare}
      data-testid="button-share-win"
      className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-gradient-to-r from-green-500 to-emerald-600 text-white border border-green-300/50 shadow-lg hover:scale-105 transition-transform"
    >
      <Share2 className="w-3.5 h-3.5" />
      {shareWinText}
    </motion.button>
  );
}

export function SlotMachine({ balance }: { balance: number }) {
  const { t } = useLang();
  const { toast } = useToast();
  const spinMutation = useSpin();
  const shakeControls = useAnimation();
  const gridRef = useRef<HTMLDivElement>(null);

  const [grid, setGrid] = useState<string[][]>(makeGrid);
  const [isSpinning, setIsSpinning] = useState(false);
  const [slowingCol, setSlowingCol] = useState(-1);
  const [bet, setBet] = useState(1000);
  const [lastWin, setLastWin] = useState(0);
  const [winLines, setWinLines] = useState<number[]>([]);
  const [freeSpins, setFreeSpins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [showNearMiss, setShowNearMiss] = useState(false);
  const [showFakeRepeater, setShowFakeRepeater] = useState(false);
  const [lossCount, setLossCount] = useState(0);
  const [screenFlash, setScreenFlash] = useState<string | null>(null);
  const autoSpinRef = useRef(false);
  const spinningRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const colIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const stopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { autoSpinRef.current = autoSpin; }, [autoSpin]);

  const flashScreen = (color: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setScreenFlash(color);
    flashTimerRef.current = setTimeout(() => setScreenFlash(null), 150);
  };

  const isWinningCell = (col: number, row: number): boolean => {
    if (isSpinning || winLines.length === 0) return false;
    return winLines.some(lineIdx => {
      const coords = PAYLINE_COORDS[lineIdx];
      return coords.some(([c, r]) => c === col && r === row);
    });
  };

  const handleSpin = useCallback(async () => {
    if (spinningRef.current) return;
    if (balance < bet && freeSpins === 0) {
      toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
      setAutoSpin(false);
      return;
    }

    spinningRef.current = true;
    setIsSpinning(true);
    setLastWin(0);
    setWinLines([]);
    setShowParticles(false);
    setShowNearMiss(false);
    setShowFakeRepeater(false);
    setSlowingCol(-1);
    soundManager.spinStart();
    flashScreen('rgba(var(--slot-purple),0.15)');

    try {
      const clearAllTimers = () => {
        colIntervalsRef.current.forEach(clearInterval);
        colIntervalsRef.current = [];
        stopTimeoutsRef.current.forEach(clearTimeout);
        stopTimeoutsRef.current = [];
      };

      colIntervalsRef.current = [0, 1, 2].map((col) => {
        return setInterval(() => {
          setGrid(prev => {
            const next = prev.map(c => [...c]);
            next[col] = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
            return next;
          });
        }, 30 + (col * 10));
      });

      const activeBet = bet;
      const result = await spinMutation.mutateAsync({ slotId: "main", betAmount: activeBet });
      const isNearMiss = result.isNearMiss;
      const isFakeRepeater = result.isFakeRepeater;

      const reelStopBase = 250;
      const reelStopGap = isNearMiss ? 350 : 180;

      [0, 1, 2].forEach((col) => {
        const delay = reelStopBase + (col * reelStopGap);

        if (isNearMiss && col === 2) {
          stopTimeoutsRef.current.push(setTimeout(() => setSlowingCol(2), delay - 200));
        }

        stopTimeoutsRef.current.push(setTimeout(() => {
          clearInterval(colIntervalsRef.current[col]);
          setGrid(prev => {
            const next = prev.map(c => [...c]);
            next[col] = result.grid[col];
            return next;
          });
          soundManager.reelStop();

          if (col === 1 && isNearMiss) {
            soundManager.nearMiss();
          }

          if (col === 2) {
            setIsSpinning(false);
            setSlowingCol(-1);
            spinningRef.current = false;
            setFreeSpins(result.totalFreeSpins);
            setWinLines(result.winLines);
            if (result.streak !== undefined) setStreak(result.streak);

            if (isNearMiss && result.winAmount === 0) {
              setShowNearMiss(true);
              soundManager.nearMissReveal();
              shakeControls.start({ x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.3 } });
              setTimeout(() => setShowNearMiss(false), 1500);
            }

            if (isFakeRepeater && result.winAmount === 0) {
              setShowFakeRepeater(true);
              soundManager.bonus();
              flashScreen('rgba(var(--slot-cyan),0.2)');
            }

            if (result.winAmount > 0) {
              setLastWin(result.winAmount);
              setShowParticles(true);
              setLossCount(0);
              setTimeout(() => setShowParticles(false), 1800);
              if (result.streak >= 3) soundManager.streak();

              if (result.isJackpot || result.winAmount >= bet * 10) {
                soundManager.win(true);
                flashScreen('rgba(var(--slot-gold),0.3)');
                shakeControls.start({
                  x: [0, -10, 10, -8, 8, -4, 4, 0],
                  y: [0, -5, 5, -4, 4, -2, 2, 0],
                  transition: { duration: 0.4 }
                });
                triggerJackpotConfetti();
                confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500', '#FF4500', '#8B5CF6'] });
              } else {
                soundManager.win(false);
                confetti({ particleCount: 50, spread: 55, origin: { y: 0.7 } });
              }

              const messages: { title: string; className: string }[] = [];
              const lineCount = result.winLines.length;
              if (result.isJackpot) messages.push({ title: `🐉 ROYAL JACKPOT! ${lineCount} LINES! 🐉`, className: "bg-gradient-to-r from-red-600 to-red-700 text-white border-red-300 font-black text-2xl shadow-[0_0_50px_rgba(220,38,38,0.6)]" });
              if (result.isRepeater && !isFakeRepeater) messages.push({ title: "⚡ REPEATER! SPIN AGAIN! ⚡", className: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300 font-black text-xl" });
              if (result.isBonusRound) { soundManager.bonus(); messages.push({ title: "🎰 BONUS ROUND ACTIVATED!", className: "bg-gradient-to-r from-purple-600 to-pink-600 text-white border-pink-300 font-black text-xl" }); }
              if (result.multiplier && result.multiplier > 1) messages.push({ title: `💥 ${result.multiplier}x MULTIPLIER!`, className: "bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-900 border-yellow-300 font-black text-lg" });
              if (lineCount > 0 && result.winLines.some(l => l >= 3)) messages.push({ title: `↗ DIAGONAL WIN! ↘`, className: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-300 font-black text-lg" });
              if (!result.isJackpot && !result.isRepeater && !result.isBonusRound && result.winAmount > 0) messages.push({ title: `🔥 WIN: +${result.winAmount.toLocaleString()}đ`, className: "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-lg" });
              messages.forEach((msg, idx) => { setTimeout(() => { toast({ title: msg.title, className: msg.className }); }, idx * 400); });
            } else {
              setStreak(0);
              setLossCount(prev => prev + 1);
            }

            if (result.freeSpinsAwarded > 0) {
              soundManager.freeSpin();
              setTimeout(() => { toast({ title: `🎁 +${result.freeSpinsAwarded} FREE SPINS!`, className: "bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black text-lg" }); }, 1200);
            }
            if (autoSpinRef.current) setTimeout(() => { handleSpin(); }, 350);
          }
        }, delay));
      });
    } catch (error) {
      colIntervalsRef.current.forEach(clearInterval);
      colIntervalsRef.current = [];
      stopTimeoutsRef.current.forEach(clearTimeout);
      stopTimeoutsRef.current = [];
      setIsSpinning(false);
      setSlowingCol(-1);
      spinningRef.current = false;
      setAutoSpin(false);
      toast({ title: t.error, description: (error as Error).message, variant: "destructive" });
    }
  }, [balance, bet, freeSpins, spinMutation, toast, shakeControls]);

  const handleAiAdvice = async () => {
    try {
      const res = await fetch("/api/ai/predict");
      const data = await res.json();
      toast({ title: t.aiAdviceTitle, description: data.advice, className: "bg-purple-900 text-yellow-100 border-yellow-500/20" });
    } catch (e) { /* ignore */ }
  };

  const triggerJackpotConfetti = () => {
    const end = Date.now() + 3000;
    (function frame() {
      confetti({ particleCount: 7, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#fcd34d', '#ef4444', '#8b5cf6'] });
      confetti({ particleCount: 7, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#fcd34d', '#ef4444', '#8b5cf6'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const toggleAutoSpin = () => {
    const next = !autoSpin;
    setAutoSpin(next);
    soundManager.autoSpinToggle();
    if (next && !spinningRef.current) handleSpin();
  };

  return (
    <motion.div animate={shakeControls} className="flex flex-col items-center gap-3 sm:gap-5 w-full max-w-xl mx-auto relative">
      {screenFlash && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 pointer-events-none z-[100]"
          style={{ background: screenFlash }}
        />
      )}

      {showParticles && <div className="absolute inset-0 pointer-events-none z-40 win-explosion" />}

      <NearMissOverlay show={showNearMiss} soCloseText={t.soClose} />

      <AnimatePresence>
        <FakeRepeaterOverlay show={showFakeRepeater} onDone={() => setShowFakeRepeater(false)} repeaterText={t.repeater} reSpinningText={t.reSpinning} />
      </AnimatePresence>

      <AnimatePresence>
        {lastWin >= bet * 5 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
            data-testid="display-big-win"
          >
            <motion.div
              animate={{ rotate: [0, -3, 3, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 text-purple-950 px-8 sm:px-16 py-6 sm:py-10 rounded-[2rem] text-center shadow-[0_0_100px_rgba(234,179,8,0.8),0_0_150px_rgba(234,179,8,0.4)] border-4 border-yellow-200 mx-4"
            >
              <div className="text-2xl sm:text-3xl font-black uppercase mb-2 flex items-center justify-center gap-2">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" /> {t.bigWin} <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="text-3xl sm:text-5xl md:text-6xl font-display font-black">
                <AnimatedWinCounter value={lastWin} />đ
              </div>
              {winLines.length > 1 && (
                <div className="text-lg mt-1 font-bold">{winLines.length} {t.lines}</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareWinButton winAmount={lastWin} bet={bet} shareWinText={t.shareWin} />

      {streak >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="streak-badge flex items-center gap-2 px-5 py-2 rounded-full text-white font-black text-sm"
          data-testid="display-streak"
        >
          <StreakIcon streak={streak} />
          <span>🔥 STREAK x{streak} 🔥</span>
          <StreakIcon streak={streak} />
        </motion.div>
      )}

      {lossCount >= 5 && lossCount % 3 === 0 && !isSpinning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: [0, 1, 1, 0], y: 0 }}
          transition={{ duration: 3 }}
          className="text-xs text-yellow-400/80 font-bold tracking-wider uppercase"
          data-testid="text-encouragement"
        >
          {lossCount >= 10 ? t.encouragement1 : t.encouragement2}
        </motion.div>
      )}

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="w-full relative"
      >
        <div className="relative rounded-[2rem] overflow-hidden"
          style={{
            background: `linear-gradient(180deg, var(--slot-frame-top) 0%, var(--slot-frame-mid) 25%, var(--slot-frame-dark) 60%, var(--slot-frame-bottom) 100%)`,
            boxShadow: `0 40px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(var(--slot-gold),0.4), 0 0 60px -10px rgba(var(--slot-purple),0.15), inset 0 1px 0 rgba(var(--slot-gold),0.3)`,
            border: '2px solid transparent',
            borderImage: `linear-gradient(180deg, rgba(var(--slot-gold),0.7) 0%, rgba(var(--slot-gold),0.15) 60%, rgba(var(--slot-purple),0.2) 100%) 1`,
          }}
        >
          <div className="absolute inset-0 pointer-events-none z-0 edge-glow-ambient" />

          <div className="relative z-10 text-center py-3"
            style={{
              background: `linear-gradient(180deg, rgba(var(--slot-gold),0.15) 0%, transparent 100%)`,
              borderBottom: `1px solid rgba(var(--slot-gold),0.2)`,
            }}
          >
            <div className="inline-flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
              />
              <span className="font-display text-xl tracking-[0.3em] uppercase"
                style={{
                  background: `linear-gradient(to bottom, rgb(var(--slot-gold-light)), rgb(var(--slot-gold-mid)), rgb(var(--slot-gold-dark)))`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                }}
              >
                VnSlot 888
              </span>
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.75 }}
                className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
              />
            </div>

            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-[9px] uppercase tracking-[0.15em] text-yellow-500/40 font-bold">{t.paylines}</span>
              <span className="text-[9px] text-yellow-500/30">•</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-yellow-500/40 font-bold">{t.grid3x3}</span>
              <span className="text-[9px] text-yellow-500/30">•</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-yellow-500/40 font-bold">{t.diagonals}</span>
            </div>

            {freeSpins > 0 && (
              <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute top-2 right-4 z-20 flex items-center gap-1 bg-purple-600/80 text-yellow-300 px-3 py-1 rounded-full font-black text-xs border border-purple-400/50 backdrop-blur-sm"
                data-testid="display-free-spins"
              >
                <Gift className="w-3 h-3" />
                <span>{freeSpins} {t.free}</span>
              </motion.div>
            )}
          </div>

          <div className="px-2 sm:px-4 md:px-6 py-3 sm:py-4">
            <div ref={gridRef} className="relative rounded-2xl overflow-hidden"
              style={{
                background: `linear-gradient(180deg, var(--slot-grid-dark) 0%, var(--slot-grid-mid) 50%, var(--slot-grid-dark) 100%)`,
                boxShadow: `inset 0 10px 40px rgba(0,0,0,0.95), inset 0 -10px 40px rgba(0,0,0,0.95), inset 6px 0 20px rgba(0,0,0,0.6), inset -6px 0 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(var(--slot-gold),0.2), 0 0 30px -5px rgba(var(--slot-purple),0.1)`,
              }}
            >
              <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.025]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px)',
                }}
              />

              <div className="absolute inset-0 pointer-events-none z-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.015) 100%)',
                }}
              />

              <WinLineOverlay winLines={winLines} gridRef={gridRef} />

              <div className="grid grid-cols-3 gap-0">
                {[0, 1, 2].map((col) => (
                  <div key={col} className="flex flex-col relative">
                    {[0, 1, 2].map((row) => (
                      <GridCell
                        key={`${col}-${row}`}
                        symbol={grid[col]?.[row] ?? getRandomSymbol()}
                        isSpinning={isSpinning}
                        col={col}
                        row={row}
                        isWinning={isWinningCell(col, row)}
                        isSlowing={slowingCol === col}
                      />
                    ))}

                    {col < 2 && (
                      <div className="absolute top-[5%] right-0 bottom-[5%] w-[1px] z-10"
                        style={{
                          background: `linear-gradient(to bottom, transparent, rgba(var(--slot-gold),0.2) 20%, rgba(var(--slot-gold),0.2) 80%, transparent)`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: `linear-gradient(to bottom, rgba(8,3,24,0.6) 0%, transparent 15%, transparent 85%, rgba(8,3,24,0.6) 100%)`,
                }}
              />
              <div className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.3) 100%)',
                }}
              />
            </div>
          </div>

          <div className="px-3 sm:px-5 md:px-7 pb-4 sm:pb-5 pt-1">
            <div className="flex items-center justify-between gap-3"
              style={{ borderTop: `1px solid rgba(var(--slot-gold),0.1)`, paddingTop: '12px' }}
            >
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-bold">{t.win}</span>
                <motion.div
                  key={lastWin}
                  initial={lastWin > 0 ? { scale: 1.4 } : {}}
                  animate={{ scale: 1 }}
                  className="font-mono text-xl sm:text-2xl md:text-3xl font-black text-yellow-400"
                  data-testid="display-last-win"
                  style={{ textShadow: lastWin > 0 ? '0 0 25px var(--slot-win-glow-strong)' : 'none' }}
                >
                  <AnimatedWinCounter value={lastWin} />
                </motion.div>
              </div>

              {winLines.length > 0 && (
                <div className="flex gap-1">
                  {winLines.map(li => (
                    <span key={li} className="text-[9px] font-black px-1.5 py-0.5 rounded"
                      style={{ background: PAYLINE_COLORS[li], color: '#fff' }}
                    >
                      {PAYLINE_LABELS[li]}
                    </span>
                  ))}
                </div>
              )}

              {streak > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30"
                  data-testid="display-streak-counter"
                >
                  <StreakIcon streak={streak} />
                  <span className="text-sm font-black text-orange-400">x{streak}</span>
                </motion.div>
              )}

              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-bold">{t.balance}</span>
                <motion.span
                  key={balance}
                  initial={{ color: "#eab308" }}
                  animate={{ color: "#d97706" }}
                  className="font-mono text-lg font-bold"
                >
                  {balance.toLocaleString()}
                </motion.span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="w-full rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4"
        style={{
          background: 'linear-gradient(180deg, rgba(45,20,102,0.4) 0%, rgba(15,6,32,0.6) 100%)',
          backdropFilter: 'blur(20px)',
          border: `1px solid rgba(var(--slot-gold),0.1)`,
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        }}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <span className="font-black text-sm uppercase tracking-wider gold-gradient-text">{t.bet}</span>
            <motion.span
              key={bet}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="font-mono text-lg text-yellow-400 font-bold"
              data-testid="display-bet-amount"
            >
              {bet.toLocaleString()}đ
            </motion.span>
          </div>
          <div className="flex flex-wrap gap-1">
            {BET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => { if (!isSpinning) { setBet(amount); soundManager.betChange(); } }}
                disabled={isSpinning}
                data-testid={`button-bet-${amount}`}
                className={`min-w-[38px] flex-1 py-1.5 sm:py-2 rounded-xl font-bold text-[10px] sm:text-[11px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                  bet === amount
                    ? "bg-gradient-to-b from-yellow-400 to-yellow-600 text-purple-950 shadow-[0_0_20px_rgba(251,191,36,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] scale-[1.05]"
                    : "bg-white/[0.04] text-yellow-100/50 hover:bg-white/[0.08] hover:text-yellow-100/80 border border-white/[0.06]"
                }`}
              >
                {formatBet(amount)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSpin}
            disabled={isSpinning}
            data-testid="button-spin"
            className={`flex-1 h-14 sm:h-16 text-lg sm:text-xl font-display uppercase tracking-wider rounded-xl relative overflow-hidden transition-all duration-100 active:translate-y-[3px] active:shadow-none ${isSpinning ? 'spin-button-active' : ''}`}
            style={{
              background: freeSpins > 0
                ? `linear-gradient(180deg, var(--slot-spin-free-top) 0%, var(--slot-spin-free-mid) 30%, var(--slot-spin-free-bottom) 100%)`
                : `linear-gradient(180deg, var(--slot-spin-top) 0%, var(--slot-spin-mid) 25%, var(--slot-spin-low) 60%, var(--slot-spin-bottom) 100%)`,
              boxShadow: isSpinning
                ? `0 2px 0 var(--slot-purple-darkest), 0 4px 15px rgba(var(--slot-purple-deep),0.3)`
                : `0 5px 0 var(--slot-purple-darkest), 0 8px 25px rgba(var(--slot-purple-deep),0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
              border: `1px solid rgba(var(--slot-gold),0.35)`,
            }}
          >
            {isSpinning ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.4, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-7 h-7" />
              </motion.div>
            ) : freeSpins > 0 ? (
              <span className="flex items-center gap-2 text-yellow-300">
                <Gift className="w-5 h-5" /> {t.freeButton} ({freeSpins})
              </span>
            ) : (
              <span className="text-yellow-200 flex items-center gap-2">
                <Zap className="w-5 h-5" /> {t.spin}
              </span>
            )}
          </Button>

          <Button
            onClick={toggleAutoSpin}
            data-testid="button-auto-spin"
            className={`h-14 w-12 sm:w-14 rounded-xl transition-all duration-200 ${
              autoSpin
                ? "bg-green-600 text-white border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.5)]"
                : "bg-white/[0.04] text-yellow-400/70 hover:bg-white/[0.08] border border-white/[0.06]"
            }`}
          >
            <RotateCw className={`w-5 h-5 ${autoSpin ? "animate-spin" : ""}`} />
          </Button>

          <Button
            onClick={handleAiAdvice}
            data-testid="button-ai-advice"
            className="h-14 w-12 sm:w-14 rounded-xl bg-white/[0.04] text-yellow-400/70 hover:bg-white/[0.08] border border-white/[0.06] group transition-all duration-200"
            title={t.aiPredict}
          >
            <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
