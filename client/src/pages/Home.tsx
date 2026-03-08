import { useAuth } from "@/hooks/use-auth";
import { useGameState } from "@/hooks/use-game";
import { SlotMachine } from "@/components/SlotMachine";
import { Header } from "@/components/Header";
import { StreakDisplay } from "@/components/StreakDisplay";
import { AchievementBadge } from "@/components/AchievementBadge";
import { useLang } from "@/lib/lang-context";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trophy, Zap, Gift, Gem, Flame, Crown, Gamepad2, TrendingUp, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";

const FLOATING_SYMBOLS = [
  { icon: Flame, delay: 0, duration: 18, x: "10%" },
  { icon: Star, delay: 3, duration: 22, x: "25%" },
  { icon: Crown, delay: 6, duration: 20, x: "40%" },
  { icon: Gem, delay: 1, duration: 24, x: "55%" },
  { icon: Flame, delay: 8, duration: 19, x: "70%" },
  { icon: Star, delay: 4, duration: 21, x: "85%" },
  { icon: Crown, delay: 10, duration: 17, x: "15%" },
  { icon: Gem, delay: 7, duration: 23, x: "60%" },
];

function FloatingSymbols() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {FLOATING_SYMBOLS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ y: "110vh", opacity: 0 }}
          animate={{ y: "-10vh", opacity: [0, 0.15, 0.15, 0] }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute"
          style={{ left: item.x }}
        >
          <item.icon className="w-8 h-8 text-yellow-500/20" />
        </motion.div>
      ))}
    </div>
  );
}

const FAKE_WINS = [
  { user: "Dragon***", amount: 250000 },
  { user: "Lucky***", amount: 500000 },
  { user: "Pho***", amount: 125000 },
  { user: "Viet***", amount: 1000000 },
  { user: "Gold***", amount: 75000 },
  { user: "King***", amount: 350000 },
  { user: "Star***", amount: 850000 },
  { user: "Fire***", amount: 420000 },
];

function LiveWinsTicker() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FAKE_WINS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      data-testid="live-wins-ticker"
      className="w-full max-w-2xl mx-auto bg-gradient-to-r from-red-900/40 via-orange-900/40 to-red-900/40 border border-yellow-500/30 rounded-md px-4 py-2 overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-black uppercase tracking-wider text-yellow-400">LIVE</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 text-sm"
          >
            <span className="text-yellow-100 font-bold">{FAKE_WINS[currentIndex].user}</span>
            <span className="text-yellow-100/60">won</span>
            <span className="text-yellow-400 font-black">
              {FAKE_WINS[currentIndex].amount.toLocaleString()}d
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SlotPreview() {
  const symbols = ["A", "B", "C"];
  const [reel, setReel] = useState([0, 1, 2]);

  useEffect(() => {
    const interval = setInterval(() => {
      setReel((prev) => prev.map(() => Math.floor(Math.random() * 3)));
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const symbolColors = ["text-yellow-400", "text-red-400", "text-purple-400"];

  return (
    <motion.div
      data-testid="slot-preview"
      className="flex gap-2 justify-center my-6"
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {reel.map((s, i) => (
        <motion.div
          key={i}
          animate={{ rotateX: [0, 360] }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
          className="w-16 h-16 bg-gradient-to-b from-purple-800/60 to-purple-900/60 border-2 border-yellow-500/40 rounded-md flex items-center justify-center"
        >
          <span className={`text-2xl font-black ${symbolColors[s]}`}>{symbols[s]}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

const DEFAULT_ACHIEVEMENTS = [
  { id: "first_win", name: "First Win", description: "Win your first spin", icon: "star", unlocked: false },
  { id: "hot_streak_3", name: "Hot Streak", description: "3 wins in a row", icon: "flame", unlocked: false },
  { id: "hot_streak_5", name: "On Fire", description: "5 wins in a row", icon: "zap", unlocked: false },
  { id: "dragon_master", name: "Dragon Master", description: "3 dragons in a row", icon: "crown", unlocked: false },
  { id: "high_roller", name: "High Roller", description: "Bet 100,000+", icon: "gem", unlocked: false },
  { id: "millionaire", name: "Millionaire", description: "Reach 1M balance", icon: "trophy", unlocked: false },
];

export default function Home() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: gameState, isLoading: isGameLoading } = useGameState();
  const { t } = useLang();

  const { data: achievements = [] } = useQuery<any[]>({
    queryKey: ["/api/achievements", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/achievements/${user?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const mergedAchievements = useMemo(() => {
    const unlockedIds = new Set(achievements.map((a: any) => a.badgeId));
    return DEFAULT_ACHIEVEMENTS.map((badge) => ({
      ...badge,
      unlocked: unlockedIds.has(badge.id),
    }));
  }, [achievements]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col selection:bg-yellow-500 selection:text-purple-900 relative overflow-hidden">
        <FloatingSymbols />

        <motion.div
          animate={{
            x: [0, 100, -100, 0],
            y: [0, -50, 50, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute top-10 left-10 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{
            x: [0, -100, 100, 0],
            y: [0, 50, -50, 0],
            scale: [1, 0.9, 1.2, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, delay: 2 }}
          className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none"
        />

        <Header />

        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="text-center space-y-8 max-w-4xl"
          >
            <motion.div
              animate={{
                textShadow: [
                  "0 0 20px rgba(234,179,8,0.3)",
                  "0 0 60px rgba(234,179,8,0.6)",
                  "0 0 20px rgba(234,179,8,0.3)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="relative"
            >
              <h1
                data-testid="text-landing-title"
                className="text-8xl md:text-9xl font-display font-black bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 bg-clip-text text-transparent leading-tight"
              >
                VnSlot
              </h1>
              <p className="text-2xl md:text-4xl text-yellow-500/80 font-bold tracking-[0.3em] uppercase mt-4">
                888 Dragon Fortune
              </p>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-xl md:text-2xl text-yellow-100/70 max-w-2xl mx-auto leading-relaxed font-light"
            >
              Experience the legendary power of the{" "}
              <span className="text-yellow-400 font-bold">Dragon</span>. Win massive rewards, unlock
              bonus rounds, and claim your fortune in the ultimate Oriental slot experience.
            </motion.p>

            <SlotPreview />

            <LiveWinsTicker />

            <div className="grid grid-cols-3 gap-4 md:gap-8 mt-12 mb-8">
              {[
                { label: "MAX WIN", value: "1M+", Icon: Trophy },
                { label: "FREE SPINS", value: "\u221E", Icon: Zap },
                { label: "BONUS ROUNDS", value: "5+", Icon: Gift },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  data-testid={`stat-card-${i}`}
                  className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-yellow-500/30 rounded-md p-4 md:p-6 backdrop-blur-xl"
                >
                  <stat.Icon className="w-8 h-8 md:w-10 md:h-10 text-yellow-500 mx-auto mb-2" />
                  <div className="text-yellow-500/70 text-xs uppercase tracking-widest font-black">
                    {stat.label}
                  </div>
                  <div className="text-yellow-400 text-2xl md:text-3xl font-display font-black mt-1">
                    {stat.value}
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Link href="/auth">
                <Button
                  data-testid="button-begin-quest"
                  size="lg"
                  className="text-2xl px-20 py-12 rounded-md font-display font-black uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white border-4 border-yellow-300 shadow-[0_0_50px_rgba(234,179,8,0.6)] pulse-glow"
                >
                  <Gem className="w-6 h-6 mr-2" />
                  Begin Your Quest
                  <Gem className="w-6 h-6 ml-2" />
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pt-8 border-t border-yellow-500/20"
            >
              {[
                { title: "REPEATER WINS", desc: "Chain matching symbols for exponential rewards" },
                { title: "WILD MULTIPLIERS", desc: "Unlock 2x, 5x, 10x bonus multipliers" },
                { title: "DRAGON JACKPOT", desc: "Hit the legendary jackpot for ultimate glory" },
              ].map((feature, i) => (
                <div key={i} className="text-center" data-testid={`feature-card-${i}`}>
                  <h3 className="text-lg md:text-xl font-black text-yellow-400 uppercase tracking-widest mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-yellow-100/60 text-sm md:text-base">{feature.desc}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </main>
      </div>
    );
  }

  const streak = (gameState as any)?.streak ?? 0;
  const maxStreak = (gameState as any)?.maxStreak ?? 0;
  const totalWins = (gameState as any)?.totalWins ?? 0;
  const maxWin = (gameState as any)?.maxWin ?? 0;
  const gamesPlayed = (gameState as any)?.gamesPlayed ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col selection:bg-primary selection:text-white relative">
      <FloatingSymbols />
      <Header />

      <main className="flex-1 relative z-10 overflow-auto">
        <div className="hidden lg:grid lg:grid-cols-[280px_1fr_280px] gap-4 p-4 h-full">
          <aside className="space-y-4" data-testid="sidebar-achievements">
            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2">
                <Star className="w-4 h-4" />
                Achievements
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {mergedAchievements.map((badge) => (
                  <AchievementBadge key={badge.id} badge={badge} />
                ))}
              </div>
            </Card>
          </aside>

          <div className="flex flex-col items-center justify-start">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-4xl mx-auto space-y-4 py-4"
            >
              {isGameLoading ? (
                <div className="flex justify-center p-20">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-game" />
                </div>
              ) : (
                <SlotMachine balance={gameState?.balance ?? (user as any).balance} />
              )}

              <div
                data-testid="stats-bar"
                className="grid grid-cols-3 gap-3"
              >
                <Card className="bg-purple-950/60 border-yellow-500/20 p-4 text-center">
                  <Gamepad2 className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                  <div className="text-xs text-yellow-100/50 uppercase font-bold tracking-wider">
                    Games Played
                  </div>
                  <div
                    data-testid="text-games-played"
                    className="text-2xl font-display font-black text-yellow-400"
                  >
                    {gamesPlayed.toLocaleString()}
                  </div>
                </Card>
                <Card className="bg-purple-950/60 border-yellow-500/20 p-4 text-center">
                  <TrendingUp className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                  <div className="text-xs text-yellow-100/50 uppercase font-bold tracking-wider">
                    Total Wins
                  </div>
                  <div
                    data-testid="text-total-wins"
                    className="text-2xl font-display font-black text-yellow-400"
                  >
                    {totalWins.toLocaleString()}
                  </div>
                </Card>
                <Card className="bg-purple-950/60 border-yellow-500/20 p-4 text-center">
                  <Trophy className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                  <div className="text-xs text-yellow-100/50 uppercase font-bold tracking-wider">
                    Max Win
                  </div>
                  <div
                    data-testid="text-max-win"
                    className="text-2xl font-display font-black text-yellow-400"
                  >
                    {maxWin.toLocaleString()}d
                  </div>
                </Card>
              </div>
            </motion.div>
          </div>

          <aside className="space-y-4" data-testid="sidebar-right">
            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <StreakDisplay streak={streak} maxStreak={maxStreak} />
            </Card>

            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Top Players
              </h3>
              <MiniLeaderboard />
            </Card>
          </aside>
        </div>

        <div className="hidden lg:block">
          <AppFooter />
        </div>

        <div className="lg:hidden flex flex-col items-center p-4 space-y-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-lg"
          >
            {isGameLoading ? (
              <div className="flex justify-center p-20">
                <Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-game-mobile" />
              </div>
            ) : (
              <SlotMachine balance={gameState?.balance ?? (user as any).balance} />
            )}
          </motion.div>

          <div
            data-testid="stats-bar-mobile"
            className="grid grid-cols-3 gap-2 w-full max-w-lg"
          >
            <Card className="bg-purple-950/60 border-yellow-500/20 p-3 text-center">
              <Gamepad2 className="w-4 h-4 text-yellow-500/70 mx-auto mb-1" />
              <div className="text-[10px] text-yellow-100/50 uppercase font-bold">Games</div>
              <div data-testid="text-games-played-mobile" className="text-lg font-black text-yellow-400">
                {gamesPlayed.toLocaleString()}
              </div>
            </Card>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-3 text-center">
              <TrendingUp className="w-4 h-4 text-yellow-500/70 mx-auto mb-1" />
              <div className="text-[10px] text-yellow-100/50 uppercase font-bold">Wins</div>
              <div data-testid="text-total-wins-mobile" className="text-lg font-black text-yellow-400">
                {totalWins.toLocaleString()}
              </div>
            </Card>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-3 text-center">
              <Trophy className="w-4 h-4 text-yellow-500/70 mx-auto mb-1" />
              <div className="text-[10px] text-yellow-100/50 uppercase font-bold">Max Win</div>
              <div data-testid="text-max-win-mobile" className="text-lg font-black text-yellow-400">
                {maxWin.toLocaleString()}d
              </div>
            </Card>
          </div>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-4 w-full max-w-lg">
            <StreakDisplay streak={streak} maxStreak={maxStreak} />
          </Card>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-4 w-full max-w-lg" data-testid="achievements-mobile">
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2">
              <Star className="w-4 h-4" />
              Achievements
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {mergedAchievements.map((badge) => (
                <AchievementBadge key={badge.id} badge={badge} />
              ))}
            </div>
          </Card>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-4 w-full max-w-lg" data-testid="leaderboard-mobile">
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Top Players
            </h3>
            <MiniLeaderboard />
          </Card>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

function MiniLeaderboard() {
  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/game/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/game/leaderboard");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const top5 = entries.slice(0, 5);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-4 h-4 text-gray-300" />;
    if (rank === 3) return <Crown className="w-4 h-4 text-orange-400" />;
    return <span className="text-xs text-yellow-100/50 font-bold">#{rank}</span>;
  };

  if (isLoading) {
    return <div className="text-center text-yellow-100/40 text-sm py-4">Loading...</div>;
  }

  if (top5.length === 0) {
    return <div className="text-center text-yellow-100/40 text-sm py-4">No players yet</div>;
  }

  return (
    <div className="space-y-2" data-testid="mini-leaderboard">
      {top5.map((entry: any, i: number) => (
        <motion.div
          key={entry.rank ?? i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-2 p-2 rounded-md bg-purple-800/20 border border-yellow-500/10"
        >
          <div className="w-6 flex justify-center">{getRankIcon(i + 1)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-yellow-100 truncate">
              {entry.username}
            </div>
          </div>
          <div className="text-sm font-black text-yellow-400 shrink-0">
            {(entry.balance ?? 0).toLocaleString()}d
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function AppFooter() {
  const { t } = useLang();

  return (
    <footer className="relative z-10 border-t border-yellow-500/10 bg-[#080315]/80 backdrop-blur-sm mt-8" data-testid="app-footer">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs text-yellow-100/40">
            <Link href="/about" className="hover:text-yellow-400 transition-colors" data-testid="link-about">
              {t.about}
            </Link>
            <Link href="/terms" className="hover:text-yellow-400 transition-colors" data-testid="link-terms">
              {t.terms}
            </Link>
            <Link href="/deposit" className="hover:text-yellow-400 transition-colors" data-testid="link-deposit">
              {t.deposit}
            </Link>
            <a href="mailto:support@vnslot888.com" className="hover:text-yellow-400 transition-colors" data-testid="link-support">
              {t.support}
            </a>
          </div>
          <div className="text-xs text-yellow-100/25">
            © 2024 Dragon Fortune Entertainment Ltd.
          </div>
        </div>
      </div>
    </footer>
  );
}
