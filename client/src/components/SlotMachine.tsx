import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { Coins, Loader2, Brain, Flame, Zap, Crown, RotateCw, Gift, Sparkles } from "lucide-react";

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];
const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000];

const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
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

function ReelStrip({ symbol, isSpinning, index, nearMiss }: {
  symbol: string;
  isSpinning: boolean;
  index: number;
  nearMiss: boolean;
}) {
  const [spinSymbols, setSpinSymbols] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);

  useEffect(() => {
    if (isSpinning) {
      const interval = setInterval(() => {
        setSpinSymbols([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
      }, 60);
      return () => clearInterval(interval);
    }
  }, [isSpinning]);

  const aboveSymbol = isSpinning ? spinSymbols[0] : getRandomSymbol();
  const belowSymbol = isSpinning ? spinSymbols[2] : getRandomSymbol();
  const aboveAbove = isSpinning ? spinSymbols[1] : getRandomSymbol();

  return (
    <div
      data-testid={`reel-${index}`}
      className={`relative flex-1 overflow-hidden ${nearMiss ? "near-miss-pulse" : ""}`}
      style={{ minHeight: '200px' }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
        <motion.div
          className="text-xl opacity-[0.08] select-none"
          animate={isSpinning ? { y: [0, 12, 0], opacity: [0.05, 0.1, 0.05] } : {}}
          transition={{ duration: 0.12, repeat: isSpinning ? Infinity : 0 }}
        >
          {aboveAbove}
        </motion.div>
        <motion.div
          className="text-3xl select-none"
          style={{ opacity: isSpinning ? 0.3 : 0.15 }}
          animate={isSpinning ? { y: [0, 14, 0] } : {}}
          transition={{ duration: 0.12, repeat: isSpinning ? Infinity : 0 }}
        >
          {aboveSymbol}
        </motion.div>

        <AnimatePresence mode="popLayout">
          <motion.div
            key={isSpinning ? `spin-${index}-${Math.random()}` : `stop-${symbol}`}
            initial={{ y: isSpinning ? -40 : -50, opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.6 }}
            transition={{
              type: "spring",
              stiffness: isSpinning ? 1000 : 100,
              damping: isSpinning ? 15 : 22,
              mass: isSpinning ? 0.2 : 1.4,
              delay: isSpinning ? 0 : index * 0.12
            }}
            className="text-6xl md:text-7xl select-none relative z-10 my-1"
            style={{
              filter: isSpinning ? 'blur(3px) brightness(0.7)' : 'drop-shadow(0 0 12px rgba(251,191,36,0.2))',
              textShadow: isSpinning
                ? 'none'
                : '0 6px 25px rgba(0,0,0,0.6), 0 0 50px rgba(251,191,36,0.15), 0 2px 0 rgba(0,0,0,0.3)',
              transform: isSpinning ? undefined : 'perspective(600px) rotateX(2deg)',
            }}
          >
            {symbol}
          </motion.div>
        </AnimatePresence>

        <motion.div
          className="text-3xl select-none"
          style={{ opacity: isSpinning ? 0.3 : 0.15 }}
          animate={isSpinning ? { y: [0, 14, 0] } : {}}
          transition={{ duration: 0.12, repeat: isSpinning ? Infinity : 0 }}
        >
          {belowSymbol}
        </motion.div>
      </div>

      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(8,3,24,0.95) 0%, rgba(8,3,24,0.4) 18%, transparent 30%, transparent 70%, rgba(8,3,24,0.4) 82%, rgba(8,3,24,0.95) 100%)',
        }}
      />

      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {nearMiss && !isSpinning && (
        <motion.div
          animate={{ opacity: [0, 0.3, 0], boxShadow: ['inset 0 0 0px rgba(220,38,38,0)', 'inset 0 0 30px rgba(220,38,38,0.4)', 'inset 0 0 0px rgba(220,38,38,0)'] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="absolute inset-0 pointer-events-none"
        />
      )}
    </div>
  );
}

export function SlotMachine({ balance }: { balance: number }) {
  const { t } = useLang();
  const { toast } = useToast();
  const spinMutation = useSpin();
  const shakeControls = useAnimation();

  const [reels, setReels] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000);
  const [lastWin, setLastWin] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const autoSpinRef = useRef(false);
  const spinningRef = useRef(false);

  useEffect(() => { autoSpinRef.current = autoSpin; }, [autoSpin]);

  const handleSpin = useCallback(async () => {
    if (spinningRef.current) return;
    if (balance < bet && freeSpins === 0) {
      toast({ title: "Insufficient Balance", description: "Please top up to continue playing!", variant: "destructive" });
      setAutoSpin(false);
      return;
    }

    spinningRef.current = true;
    setIsSpinning(true);
    setLastWin(0);
    setShowParticles(false);
    soundManager.spinStart();

    try {
      const intervals = reels.map((_, i) => {
        return setInterval(() => {
          setReels(prev => {
            const next = [...prev];
            next[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            return next;
          });
        }, 50 + (i * 15));
      });

      const result = await spinMutation.mutateAsync({ slotId: "main", betAmount: bet });

      result.result.forEach((symbol, i) => {
        setTimeout(() => {
          clearInterval(intervals[i]);
          setReels(prev => { const next = [...prev]; next[i] = symbol; return next; });

          if (i === result.result.length - 1) {
            setIsSpinning(false);
            spinningRef.current = false;
            setFreeSpins(result.totalFreeSpins);
            if ((result as any).streak !== undefined) setStreak((result as any).streak);

            if (result.winAmount > 0) {
              setLastWin(result.winAmount);
              setShowParticles(true);
              setTimeout(() => setShowParticles(false), 2000);
              if ((result as any).streak >= 3) soundManager.streak();

              if (result.isJackpot || result.winAmount >= bet * 10) {
                soundManager.win(true);
                shakeControls.start({
                  x: [0, -8, 8, -6, 6, -3, 3, 0],
                  y: [0, -4, 4, -3, 3, -1, 1, 0],
                  transition: { duration: 0.5 }
                });
                triggerJackpotConfetti();
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500', '#FF4500'] });
              } else {
                soundManager.win(false);
                confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
              }

              const messages: { title: string; className: string }[] = [];
              if (result.isJackpot) messages.push({ title: "ROYAL JACKPOT!", className: "bg-gradient-to-r from-red-600 to-red-700 text-white border-red-300 font-black text-2xl shadow-[0_0_50px_rgba(220,38,38,0.6)]" });
              if (result.isRepeater) messages.push({ title: "REPEATER! SPIN AGAIN!", className: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300 font-black text-xl" });
              if (result.isBonusRound) { soundManager.bonus(); messages.push({ title: "BONUS ROUND ACTIVATED!", className: "bg-gradient-to-r from-purple-600 to-pink-600 text-white border-pink-300 font-black text-xl" }); }
              if (result.multiplier && result.multiplier > 1) messages.push({ title: `${result.multiplier}x MULTIPLIER!`, className: "bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-900 border-yellow-300 font-black text-lg" });
              if (!result.isJackpot && !result.isRepeater && !result.isBonusRound && result.winAmount > 0) messages.push({ title: `WIN: +${result.winAmount.toLocaleString()}`, className: "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-lg" });
              messages.forEach((msg, idx) => { setTimeout(() => { toast({ title: msg.title, className: msg.className }); }, idx * 500); });
            } else {
              setStreak(0);
            }

            if (result.freeSpinsAwarded > 0) {
              soundManager.freeSpin();
              setTimeout(() => { toast({ title: `+${result.freeSpinsAwarded} FREE SPINS!`, className: "bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black text-lg" }); }, 1500);
            }
            if (autoSpinRef.current) setTimeout(() => { handleSpin(); }, 600);
          }
        }, 500 + (i * 400));
      });
    } catch (error) {
      setIsSpinning(false);
      spinningRef.current = false;
      setAutoSpin(false);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [balance, bet, freeSpins, reels, spinMutation, toast, shakeControls]);

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
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#fcd34d', '#ef4444'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#fcd34d', '#ef4444'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const toggleAutoSpin = () => {
    const next = !autoSpin;
    setAutoSpin(next);
    if (next && !spinningRef.current) handleSpin();
  };

  const isNearMiss = (i: number) => {
    if (isSpinning || lastWin > 0) return false;
    return (reels[0] === reels[1] && i < 2) || (reels[1] === reels[2] && i > 0) || (reels[0] === reels[2] && (i === 0 || i === 2));
  };

  return (
    <motion.div animate={shakeControls} className="flex flex-col items-center gap-5 w-full max-w-xl mx-auto relative">
      {showParticles && <div className="absolute inset-0 pointer-events-none z-40 win-explosion" />}

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
              animate={{ rotate: [0, -3, 3, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 text-purple-950 px-16 py-10 rounded-[2rem] text-center shadow-[0_0_80px_rgba(234,179,8,0.7),0_0_120px_rgba(234,179,8,0.3)] border-4 border-yellow-200"
            >
              <div className="text-3xl font-black uppercase mb-2 flex items-center justify-center gap-2">
                <Sparkles className="w-7 h-7" /> BIG WIN <Sparkles className="w-7 h-7" />
              </div>
              <div className="text-5xl md:text-6xl font-display font-black">
                <AnimatedWinCounter value={lastWin} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {streak >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="streak-badge flex items-center gap-2 px-5 py-2 rounded-full text-white font-black text-sm"
          data-testid="display-streak"
        >
          <StreakIcon streak={streak} />
          <span>STREAK x{streak}</span>
          <StreakIcon streak={streak} />
        </motion.div>
      )}

      {/* === SLOT MACHINE CABINET === */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="w-full relative"
      >
        {/* Machine outer shell - metallic cabinet */}
        <div className="relative rounded-[2rem] overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #2d1466 0%, #1a0a35 25%, #0d041f 60%, #0a0318 100%)',
            boxShadow: '0 40px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(251,191,36,0.4), 0 0 60px -10px rgba(139,92,246,0.15), inset 0 1px 0 rgba(251,191,36,0.3)',
            border: '2px solid transparent',
            borderImage: 'linear-gradient(180deg, rgba(251,191,36,0.7) 0%, rgba(251,191,36,0.15) 60%, rgba(139,92,246,0.2) 100%) 1',
          }}
        >
          {/* Gold trim top bar */}
          <div className="relative z-10 text-center py-3"
            style={{
              background: 'linear-gradient(180deg, rgba(251,191,36,0.15) 0%, transparent 100%)',
              borderBottom: '1px solid rgba(251,191,36,0.2)',
            }}
          >
            <div className="inline-flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span className="font-display text-xl tracking-[0.3em] uppercase"
                style={{
                  background: 'linear-gradient(to bottom, #fef3c7, #fcd34d, #d97706)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                }}
              >
                VnSlot 888
              </span>
              <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>

            {freeSpins > 0 && (
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute top-2 right-4 z-20 flex items-center gap-1 bg-purple-600/80 text-yellow-300 px-3 py-1 rounded-full font-black text-xs border border-purple-400/50 backdrop-blur-sm"
                data-testid="display-free-spins"
              >
                <Gift className="w-3 h-3" />
                <span>{freeSpins} FREE</span>
              </motion.div>
            )}
          </div>

          {/* === REEL VIEWING WINDOW === */}
          <div className="px-4 md:px-6 py-4">
            <div className="relative rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #050210 0%, #0a0420 50%, #050210 100%)',
                boxShadow: 'inset 0 10px 40px rgba(0,0,0,0.95), inset 0 -10px 40px rgba(0,0,0,0.95), inset 6px 0 20px rgba(0,0,0,0.6), inset -6px 0 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.2), 0 0 30px -5px rgba(139,92,246,0.1)',
              }}
            >
              {/* Scanline effect overlay */}
              <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.025]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px)',
                }}
              />

              {/* Glass reflection - two highlights */}
              <div className="absolute inset-0 pointer-events-none z-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.015) 100%)',
                }}
              />
              <div className="absolute inset-0 pointer-events-none z-20"
                style={{
                  background: 'radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.06) 0%, transparent 50%)',
                }}
              />

              {/* The 3 reels */}
              <div className="flex items-stretch" style={{ height: '220px' }}>
                {reels.map((symbol, i) => (
                  <div key={i} className="flex-1 relative">
                    <ReelStrip
                      symbol={symbol}
                      isSpinning={isSpinning}
                      index={i}
                      nearMiss={isNearMiss(i)}
                    />
                    {/* Reel divider line */}
                    {i < reels.length - 1 && (
                      <div className="absolute top-[10%] right-0 bottom-[10%] w-[1px]"
                        style={{
                          background: 'linear-gradient(to bottom, transparent, rgba(251,191,36,0.2) 30%, rgba(251,191,36,0.2) 70%, transparent)',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Win line indicator - horizontal center line */}
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] -ml-1.5" />
                <div className="flex-1 h-[2px]"
                  style={{
                    background: 'linear-gradient(to right, rgba(251,191,36,0.6), rgba(251,191,36,0.15) 20%, rgba(251,191,36,0.15) 80%, rgba(251,191,36,0.6))',
                  }}
                />
                <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] -mr-1.5" />
              </div>
            </div>
          </div>

          {/* === BOTTOM INFO PANEL === */}
          <div className="px-5 md:px-7 pb-5 pt-1">
            <div className="flex items-center justify-between gap-3"
              style={{ borderTop: '1px solid rgba(251,191,36,0.1)', paddingTop: '12px' }}
            >
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-bold">{t.win}</span>
                <motion.div
                  key={lastWin}
                  initial={lastWin > 0 ? { scale: 1.3 } : {}}
                  animate={{ scale: 1 }}
                  className="font-mono text-2xl md:text-3xl font-black text-yellow-400"
                  data-testid="display-last-win"
                  style={{ textShadow: lastWin > 0 ? '0 0 20px rgba(251,191,36,0.5)' : 'none' }}
                >
                  <AnimatedWinCounter value={lastWin} />
                </motion.div>
              </div>

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
                <span className="font-mono text-lg font-bold text-yellow-300/80">{balance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* === CONTROLS PANEL === */}
      <div className="w-full rounded-2xl p-5 space-y-4"
        style={{
          background: 'linear-gradient(180deg, rgba(45,20,102,0.4) 0%, rgba(15,6,32,0.6) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(251,191,36,0.1)',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        }}
      >
        {/* Bet selector */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <span className="font-black text-sm uppercase tracking-wider gold-gradient-text">{t.bet}</span>
            <span className="font-mono text-lg text-yellow-400 font-bold" data-testid="display-bet-amount">{bet.toLocaleString()}</span>
          </div>
          <div className="flex gap-1.5">
            {BET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => setBet(amount)}
                data-testid={`button-bet-${amount}`}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 ${
                  bet === amount
                    ? "bg-gradient-to-b from-yellow-400 to-yellow-600 text-purple-950 shadow-[0_0_15px_rgba(251,191,36,0.3),inset_0_1px_0_rgba(255,255,255,0.3)] scale-[1.03]"
                    : "bg-white/[0.04] text-yellow-100/50 hover:bg-white/[0.08] hover:text-yellow-100/80 border border-white/[0.06]"
                }`}
              >
                {amount >= 1000 ? `${amount / 1000}K` : amount}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSpin}
            disabled={isSpinning}
            data-testid="button-spin"
            className="flex-1 h-16 text-xl font-display uppercase tracking-wider rounded-xl relative overflow-hidden transition-all duration-100 active:translate-y-[3px] active:shadow-none"
            style={{
              background: freeSpins > 0
                ? 'linear-gradient(180deg, #c084fc 0%, #a855f7 30%, #7c3aed 100%)'
                : 'linear-gradient(180deg, #a78bfa 0%, #8b5cf6 25%, #6d28d9 60%, #5b21b6 100%)',
              boxShadow: '0 5px 0 #3b0764, 0 8px 25px rgba(109,40,217,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              border: '1px solid rgba(251,191,36,0.35)',
            }}
          >
            {isSpinning ? (
              <Loader2 className="animate-spin w-7 h-7" />
            ) : freeSpins > 0 ? (
              <span className="flex items-center gap-2 text-yellow-300">
                <Gift className="w-5 h-5" /> Free ({freeSpins})
              </span>
            ) : (
              <span className="text-yellow-200">{t.spin}</span>
            )}
          </Button>

          <Button
            onClick={toggleAutoSpin}
            data-testid="button-auto-spin"
            className={`h-14 w-14 rounded-xl transition-all duration-300 ${
              autoSpin
                ? "bg-green-600 text-white border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                : "bg-white/[0.04] text-yellow-400/70 hover:bg-white/[0.08] border border-white/[0.06]"
            }`}
          >
            <RotateCw className={`w-5 h-5 ${autoSpin ? "animate-spin" : ""}`} />
          </Button>

          <Button
            onClick={handleAiAdvice}
            data-testid="button-ai-advice"
            className="h-14 w-14 rounded-xl bg-white/[0.04] text-yellow-400/70 hover:bg-white/[0.08] border border-white/[0.06] group transition-all duration-300"
            title={t.aiPredict}
          >
            <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
