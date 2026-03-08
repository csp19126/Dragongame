import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { Coins, Loader2, Brain, Flame, Zap, Crown, RotateCw, Gift } from "lucide-react";

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];
const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000];

const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const start = 0;
    const duration = 800;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
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

  useEffect(() => {
    autoSpinRef.current = autoSpin;
  }, [autoSpin]);

  const handleSpin = useCallback(async () => {
    if (spinningRef.current) return;
    if (balance < bet && freeSpins === 0) {
      toast({
        title: "Insufficient Balance",
        description: "Please top up to continue playing!",
        variant: "destructive",
      });
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
          setReels(prev => {
            const next = [...prev];
            next[i] = symbol;
            return next;
          });

          if (i === result.result.length - 1) {
            setIsSpinning(false);
            spinningRef.current = false;
            setFreeSpins(result.totalFreeSpins);

            if ((result as any).streak !== undefined) {
              setStreak((result as any).streak);
            }

            if (result.winAmount > 0) {
              setLastWin(result.winAmount);
              setShowParticles(true);
              setTimeout(() => setShowParticles(false), 2000);

              if ((result as any).streak >= 3) {
                soundManager.streak();
              }

              if (result.isJackpot || result.winAmount >= bet * 10) {
                soundManager.win(true);
                shakeControls.start({
                  x: [0, -8, 8, -6, 6, -3, 3, 0],
                  y: [0, -4, 4, -3, 3, -1, 1, 0],
                  transition: { duration: 0.5 }
                });
                triggerJackpotConfetti();
                confetti({
                  particleCount: 150,
                  spread: 70,
                  origin: { y: 0.6 },
                  colors: ['#FFD700', '#FFA500', '#FF4500']
                });
              } else {
                soundManager.win(false);
                confetti({
                  particleCount: 40,
                  spread: 50,
                  origin: { y: 0.7 }
                });
              }

              const messages: { title: string; className: string }[] = [];

              if (result.isJackpot) {
                messages.push({
                  title: "ROYAL JACKPOT!",
                  className: "bg-gradient-to-r from-red-600 to-red-700 text-white border-red-300 font-black text-2xl shadow-[0_0_50px_rgba(220,38,38,0.6)]"
                });
              }

              if (result.isRepeater) {
                messages.push({
                  title: "REPEATER! SPIN AGAIN!",
                  className: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300 font-black text-xl shadow-[0_0_30px_rgba(34,211,238,0.5)]"
                });
              }

              if (result.isBonusRound) {
                soundManager.bonus();
                messages.push({
                  title: "BONUS ROUND ACTIVATED!",
                  className: "bg-gradient-to-r from-purple-600 to-pink-600 text-white border-pink-300 font-black text-xl shadow-[0_0_30px_rgba(236,72,153,0.5)]"
                });
              }

              if (result.multiplier && result.multiplier > 1) {
                messages.push({
                  title: `${result.multiplier}x MULTIPLIER!`,
                  className: "bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-900 border-yellow-300 font-black text-lg shadow-[0_0_25px_rgba(251,191,36,0.5)]"
                });
              }

              if (!result.isJackpot && !result.isRepeater && !result.isBonusRound && result.winAmount > 0) {
                messages.push({
                  title: `WIN: +${result.winAmount.toLocaleString()}`,
                  className: "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(251,191,36,0.4)]"
                });
              }

              messages.forEach((msg, idx) => {
                setTimeout(() => {
                  toast({ title: msg.title, className: msg.className });
                }, idx * 500);
              });
            } else {
              setStreak(0);
            }

            if (result.freeSpinsAwarded > 0) {
              soundManager.freeSpin();
              setTimeout(() => {
                toast({
                  title: `+${result.freeSpinsAwarded} FREE SPINS!`,
                  className: "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] font-black text-lg",
                });
              }, 1500);
            }

            if (autoSpinRef.current) {
              setTimeout(() => {
                handleSpin();
              }, 600);
            }
          }
        }, 500 + (i * 400));
      });
    } catch (error) {
      setIsSpinning(false);
      spinningRef.current = false;
      setAutoSpin(false);
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }, [balance, bet, freeSpins, reels, spinMutation, toast, shakeControls]);

  const handleAiAdvice = async () => {
    try {
      const res = await fetch("/api/ai/predict");
      const data = await res.json();
      toast({
        title: t.aiAdviceTitle,
        description: data.advice,
        className: "bg-purple-900 text-yellow-100 border-yellow-500/20",
      });
    } catch (e) {
      // ignore
    }
  };

  const triggerJackpotConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#fcd34d', '#ef4444']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#fcd34d', '#ef4444']
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  const toggleAutoSpin = () => {
    const next = !autoSpin;
    setAutoSpin(next);
    if (next && !spinningRef.current) {
      handleSpin();
    }
  };

  const isNearMiss = (i: number) => {
    if (isSpinning || lastWin > 0) return false;
    return (
      (reels[0] === reels[1] && i < 2) ||
      (reels[1] === reels[2] && i > 0) ||
      (reels[0] === reels[2] && (i === 0 || i === 2))
    );
  };

  return (
    <motion.div
      animate={shakeControls}
      className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto p-4 relative"
    >
      {showParticles && (
        <div className="absolute inset-0 pointer-events-none z-40 win-explosion" />
      )}

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
              animate={{
                rotate: [0, -5, 5, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="bg-yellow-500 text-purple-900 p-12 rounded-[3rem] text-center shadow-[0_0_100px_#eab308] border-8 border-white"
            >
              <div className="text-4xl font-black uppercase mb-2 flex items-center justify-center gap-2">
                <Coins className="w-8 h-8" /> BIG WIN <Coins className="w-8 h-8" />
              </div>
              <div className="text-6xl font-display font-black">
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
          className="streak-badge flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-600 to-red-600 text-white font-black text-sm shadow-[0_0_20px_rgba(239,68,68,0.5)]"
          data-testid="display-streak"
        >
          <StreakIcon streak={streak} />
          <span>STREAK x{streak}</span>
          <StreakIcon streak={streak} />
        </motion.div>
      )}

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15 }}
        className="slot-machine-frame p-10 rounded-[4rem] w-full relative bg-[#4c1d95] border-[12px] border-[#31106e] shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        <motion.div
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-purple-500/20 pointer-events-none"
        />

        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gradient-to-b from-yellow-300 to-yellow-500 text-red-900 px-8 py-2 rounded-full font-bold border-4 border-red-800 shadow-[0_5px_15px_rgba(0,0,0,0.3)] z-10 whitespace-nowrap text-lg uppercase tracking-widest">
          VnSlot 888
        </div>

        {freeSpins > 0 && (
          <motion.div
            animate={{ scale: [1, 1.05, 1], boxShadow: ["0 0 10px rgba(168,85,247,0.4)", "0 0 25px rgba(168,85,247,0.8)", "0 0 10px rgba(168,85,247,0.4)"] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-purple-600 text-yellow-300 px-3 py-1 rounded-full font-black text-sm border border-purple-400"
            data-testid="display-free-spins"
          >
            <Gift className="w-4 h-4" />
            <span>{freeSpins} FREE</span>
          </motion.div>
        )}

        <div className="bg-[#1a0b3c] rounded-[2.5rem] border-[10px] border-[#3d1a8a] p-6 flex justify-between items-center h-80 reel-container overflow-hidden shadow-[inset_0_20px_50px_rgba(0,0,0,0.8)] gap-6">
          {reels.map((symbol, i) => {
            const nearMiss = isNearMiss(i);
            return (
              <div
                key={i}
                data-testid={`reel-${i}`}
                className={`flex-1 h-full bg-[#2a1061] rounded-2xl border-[3px] flex items-center justify-center text-8xl shadow-2xl relative overflow-hidden transition-all duration-500 ${
                  nearMiss ? "border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]" : "border-[#4a2b9d]"
                } ${isSpinning ? "reel-spinning" : ""}`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] pointer-events-none" />
                {nearMiss && (
                  <motion.div
                    animate={{ opacity: [0, 0.3, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="absolute inset-0 bg-red-500/15 pointer-events-none"
                  />
                )}
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={isSpinning ? `spinning-${i}-${Math.random()}` : symbol}
                    initial={{ y: -80, opacity: 0, filter: "blur(8px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: 80, opacity: 0, filter: "blur(8px)" }}
                    transition={{
                      type: "spring",
                      stiffness: isSpinning ? 800 : 150,
                      damping: isSpinning ? 15 : 25,
                      mass: isSpinning ? 0.5 : 1,
                      delay: isSpinning ? 0 : i * 0.08
                    }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span className="drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">{symbol}</span>
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-between items-center gap-4 text-yellow-100 px-4 flex-wrap">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-yellow-500/80 font-bold">{t.win}</span>
            <motion.span
              key={lastWin}
              initial={{ scale: 1.5, color: "#fcd34d" }}
              animate={{ scale: 1, color: "#fbbf24" }}
              className="font-mono text-3xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              data-testid="display-last-win"
            >
              <AnimatedWinCounter value={lastWin} />
            </motion.span>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1 text-sm font-bold text-orange-400" data-testid="display-streak-counter">
              <StreakIcon streak={streak} />
              <span>x{streak}</span>
            </div>
          )}
          <div className="h-12 w-12 rounded-full border-2 border-yellow-500/30 flex items-center justify-center bg-black/20">
            <Coins className="w-6 h-6 text-yellow-400 animate-bounce" />
          </div>
        </div>
      </motion.div>

      <div className="w-full bg-purple-950/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-yellow-500/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between items-center gap-2 px-2 flex-wrap">
            <span className="font-black text-xl uppercase tracking-tighter gold-gradient-text">{t.bet}</span>
            <span className="font-mono text-2xl text-yellow-400/90 font-bold" data-testid="display-bet-amount">{bet.toLocaleString()}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {BET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => setBet(amount)}
                data-testid={`button-bet-${amount}`}
                className={`flex-1 min-w-[60px] py-3 rounded-full font-black text-sm transition-all duration-300 border-2 flex flex-col items-center gap-0.5 ${
                  bet === amount
                    ? "bg-yellow-500 text-purple-900 border-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105"
                    : "bg-purple-900/40 text-yellow-100/70 border-yellow-500/10"
                }`}
              >
                <Coins className="w-4 h-4" />
                <span>{amount >= 1000 ? `${amount / 1000}K` : amount}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={handleSpin}
            disabled={isSpinning}
            data-testid="button-spin"
            className={`flex-1 h-16 text-2xl font-display uppercase tracking-[0.1em] purple-button border-yellow-500/50 rounded-2xl ${
              freeSpins > 0 ? "text-yellow-400 border-yellow-400" : "text-yellow-300"
            }`}
          >
            {isSpinning ? (
              <Loader2 className="animate-spin w-8 h-8" />
            ) : freeSpins > 0 ? (
              <span className="flex items-center gap-2">
                <Gift className="w-6 h-6" /> Free ({freeSpins})
              </span>
            ) : (
              t.spin
            )}
          </Button>

          <Button
            onClick={toggleAutoSpin}
            data-testid="button-auto-spin"
            variant="outline"
            className={`h-16 w-16 rounded-2xl border-2 transition-all duration-500 ${
              autoSpin
                ? "auto-spin-active border-green-400 bg-green-900/40 text-green-300"
                : "border-yellow-500/20 bg-purple-900/40 text-yellow-400"
            }`}
          >
            <RotateCw className={`w-6 h-6 ${autoSpin ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="outline"
            onClick={handleAiAdvice}
            data-testid="button-ai-advice"
            className="h-16 w-16 rounded-2xl border-2 border-yellow-500/20 bg-purple-900/40 text-yellow-400 group transition-all duration-500"
            title={t.aiPredict}
          >
            <Brain className="w-6 h-6 group-hover:scale-125 transition-transform" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
