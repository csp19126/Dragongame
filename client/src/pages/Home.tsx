import { useAuth } from "@/hooks/use-auth";
import { GameTabs } from "@/components/GameTabs";
import { InstallDialog } from "@/components/InstallApp";
import { useGameState, useAchievements, useLeaderboard, useRecentWins, useJackpot } from "@/hooks/use-game";
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
import { useState, useEffect, useMemo } from "react";
import { MAX_WIN_MULTIPLE } from "@shared/schema";

const FLOATING_SYMBOLS = [
  { icon: Flame, delay: 0, duration: 18, x: "10%" },
  { icon: Star, delay: 3, duration: 22, x: "25%" },
  { icon: Crown, delay: 6, duration: 20, x: "40%" },
  { icon: Gem, delay: 1, duration: 24, x: "55%" },
  { icon: Flame, delay: 8, duration: 19, x: "70%" },
  { icon: Star, delay: 4, duration: 21, x: "85%" },
];

function FloatingSymbols() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 motion-reduce:hidden">
      {FLOATING_SYMBOLS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ y: "110vh", opacity: 0 }}
          animate={{ y: "-10vh", opacity: [0, 0.15, 0.15, 0] }}
          transition={{ duration: item.duration, delay: item.delay, repeat: Infinity, ease: "linear" }}
          className="absolute"
          style={{ left: item.x }}
        >
          <item.icon className="w-8 h-8 text-yellow-500/20" />
        </motion.div>
      ))}
    </div>
  );
}

/** Real big wins (10x bet or more) from the server, newest first */
function RecentWinsTicker() {
  const { t } = useLang();
  const { data: wins = [] } = useRecentWins();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (wins.length < 2) return;
    const id = setInterval(() => setI((p) => (p + 1) % wins.length), 3000);
    return () => clearInterval(id);
  }, [wins.length]);

  const w = wins[i % Math.max(wins.length, 1)];

  return (
    <div data-testid="recent-wins-ticker" className="w-full bg-gradient-to-r from-red-900/40 via-orange-900/40 to-red-900/40 border border-yellow-500/30 rounded-md px-3 py-2 overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-black uppercase tracking-wider text-yellow-400">{t.live}</span>
        </div>
        {w ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${w.at}-${i}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 text-sm truncate"
            >
              <span className="text-yellow-100 font-bold">{w.user}</span>
              <span className="text-yellow-100/60">{t.won}</span>
              <span className="text-yellow-400 font-black">{w.amount.toLocaleString()} 🪙</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-500/80 text-white">×{+w.multiple.toFixed(1)}</span>
            </motion.div>
          </AnimatePresence>
        ) : (
          <span className="text-sm text-yellow-100/50 truncate">{t.noWinsYet}</span>
        )}
      </div>
    </div>
  );
}

function SlotPreview() {
  const symbols = ["🐉", "🪙", "🌸", "🏮", "🥁"];
  const [reel, setReel] = useState([0, 1, 2]);

  useEffect(() => {
    const id = setInterval(() => setReel((prev) => prev.map(() => Math.floor(Math.random() * symbols.length))), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="slot-preview" className="flex gap-2 justify-center my-6">
      {reel.map((s, i) => (
        <motion.div
          key={`${i}-${s}`}
          initial={{ rotateX: 90, opacity: 0.4 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: i * 0.12 }}
          className="w-16 h-16 bg-gradient-to-b from-purple-800/70 to-purple-950/80 border-2 border-yellow-500/40 rounded-md flex items-center justify-center shadow-[0_0_18px_rgba(251,191,36,0.22)]"
        >
          <span className="text-3xl">{symbols[s]}</span>
        </motion.div>
      ))}
    </div>
  );
}

const ALL_ACHIEVEMENTS = [
  { id: "first_win", name: "First Win", description: "Win your first spin", icon: "star" },
  { id: "hot_streak_3", name: "Hot Streak", description: "3 wins in a row", icon: "flame" },
  { id: "hot_streak_5", name: "On Fire", description: "5 wins in a row", icon: "zap" },
  { id: "dragon_master", name: "Dragon Master", description: "3 dragons on a line", icon: "crown" },
  { id: "high_roller", name: "High Roller", description: "Bet 100,000+", icon: "gem" },
  { id: "millionaire", name: "Millionaire", description: "Reach 1M balance", icon: "trophy" },
  { id: "jackpot_hunter", name: "Jackpot Hunter", description: "Win 50x your bet", icon: "target" },
  { id: "lucky_seven", name: "Lucky Seven", description: "Win 7 times", icon: "gift" },
  { id: "lucky_envelope", name: "Lucky Envelope", description: "Land 3 red envelopes", icon: "mail" },
  { id: "pearl_power", name: "Pearl Power", description: "Win a line with a wild", icon: "sparkles" },
  { id: "chain_reaction", name: "Chain Reaction", description: "3 Repeaters in one spin", icon: "repeat" },
  { id: "no_hu", name: "Nổ Hũ!", description: "Win the Hũ Rồng jackpot", icon: "crown" },
];

function Landing() {
  const { t } = useLang();
  const { data: jackpot } = useJackpot();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col relative overflow-hidden">
      <FloatingSymbols />
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:p-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center space-y-6 max-w-4xl w-full">
          <div>
            <h1 data-testid="text-landing-title" className="text-6xl sm:text-8xl lg:text-9xl font-display font-black bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 bg-clip-text text-transparent leading-tight">
              VnSlot
            </h1>
            <p className="text-lg sm:text-3xl text-yellow-500/80 font-bold tracking-[0.2em] uppercase mt-2">{t.subtitle}</p>
          </div>

          <p className="text-base sm:text-xl text-yellow-100/70 max-w-2xl mx-auto leading-relaxed">
            {t.description} <span className="text-yellow-400 font-bold">{t.descriptionDragon}</span>{t.descriptionEnd}
          </p>

          <SlotPreview />

          <div className="max-w-2xl mx-auto"><RecentWinsTicker /></div>

          <div className="grid grid-cols-3 gap-2 sm:gap-6 mt-6">
            {[
              { label: t.maxWinStat, value: `${MAX_WIN_MULTIPLE.toLocaleString()}×`, Icon: Trophy },
              { label: t.freeSpins, value: "10", Icon: Zap },
              { label: t.jackpotName, value: jackpot ? jackpot.amount.toLocaleString() : "…", Icon: Gift },
            ].map((stat, i) => (
              <div key={i} data-testid={`stat-card-${i}`} className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-yellow-500/30 rounded-md p-3 sm:p-6 backdrop-blur-xl">
                <stat.Icon className="w-6 h-6 sm:w-9 sm:h-9 text-yellow-500 mx-auto mb-1" />
                <div className="text-yellow-500/70 text-[10px] sm:text-xs uppercase tracking-widest font-black">{stat.label}</div>
                <div className="text-yellow-400 text-xl sm:text-3xl font-display font-black mt-1">{stat.value}</div>
              </div>
            ))}
          </div>

          <Link href="/auth">
            <Button
              data-testid="button-begin-quest"
              size="lg"
              className="mt-4 text-lg sm:text-2xl px-10 sm:px-20 py-8 sm:py-10 rounded-md font-display font-black uppercase tracking-[0.15em] bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white border-4 border-yellow-300 shadow-[0_0_50px_rgba(234,179,8,0.6)] pulse-glow"
            >
              <Gem className="w-6 h-6 mr-2" />
              {t.beginQuest}
              <Gem className="w-6 h-6 ml-2" />
            </Button>
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 pt-8 border-t border-yellow-500/20">
            {[
              { title: t.feature1, desc: t.feature1Desc },
              { title: t.feature2, desc: t.feature2Desc },
              { title: t.feature3, desc: t.feature3Desc },
            ].map((f, i) => (
              <div key={i} className="text-center" data-testid={`feature-card-${i}`}>
                <h3 className="text-lg md:text-xl font-black text-yellow-400 uppercase tracking-widest mb-2">{f.title}</h3>
                <p className="text-yellow-100/60 text-sm md:text-base">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-yellow-100/40">{t.playMoneyNote}</p>
        </motion.div>
      </main>
      <AppFooter />
    </div>
  );
}

export default function Home() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: gameState } = useGameState(!!user);
  const { data: achievements = [] } = useAchievements(user?.id);
  const { t } = useLang();

  const mergedAchievements = useMemo(() => {
    const unlocked = new Set(achievements.map((a) => a.badgeId));
    return ALL_ACHIEVEMENTS.map((b) => ({ ...b, unlocked: unlocked.has(b.id) }));
  }, [achievements]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!user) return <Landing />;

  const stats = [
    { label: t.gamesPlayed, value: (gameState?.gamesPlayed ?? 0).toLocaleString(), Icon: Gamepad2, id: "games-played" },
    { label: t.totalWins, value: (gameState?.totalWins ?? 0).toLocaleString(), Icon: TrendingUp, id: "total-wins" },
    { label: t.maxWin, value: (gameState?.maxWin ?? 0).toLocaleString(), Icon: Trophy, id: "max-win" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col relative">
      <FloatingSymbols />
      <Header />

      <main className="flex-1 relative z-10">
        {/* One layout for all sizes, so there is only ever one slot machine mounted */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-4 p-3 sm:p-4 max-w-[1400px] mx-auto">
          <section className="order-1 lg:order-2 flex flex-col items-center gap-4 min-w-0">
            <div className="w-full max-w-md text-center lg:hidden" data-testid="game-title">
              <h1 className="font-display text-4xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(250,204,21,0.35)]">
                VnSlot 888
              </h1>
              <p className="text-[11px] sm:text-xs font-black tracking-[0.35em] text-yellow-500/80 uppercase mt-1">🐉 {t.subtitle} 🐉</p>
            </div>
            <GameTabs />
            <div className="w-full max-w-md lg:hidden"><RecentWinsTicker /></div>
            {gameState ? (
              <SlotMachine />
            ) : (
              <div className="flex justify-center p-20"><Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-game" /></div>
            )}
            <div data-testid="stats-bar" className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-md">
              {stats.map((s) => (
                <Card key={s.id} className="bg-purple-950/60 border-yellow-500/20 p-3 text-center">
                  <s.Icon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500/70 mx-auto mb-1" />
                  <div className="text-[10px] sm:text-xs text-yellow-100/50 uppercase font-bold tracking-wider">{s.label}</div>
                  <div data-testid={`text-${s.id}`} className="text-lg sm:text-2xl font-display font-black text-yellow-400 truncate">{s.value}</div>
                </Card>
              ))}
            </div>
          </section>

          <aside className="order-3 lg:order-1 space-y-4" data-testid="sidebar-achievements">
            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2">
                <Star className="w-4 h-4" /> {t.achievements}
              </h3>
              <div className="grid grid-cols-4 lg:grid-cols-2 gap-3">
                {mergedAchievements.map((badge) => <AchievementBadge key={badge.id} badge={badge} />)}
              </div>
            </Card>
          </aside>

          <aside className="order-2 lg:order-3 space-y-4" data-testid="sidebar-right">
            <div className="hidden lg:block"><RecentWinsTicker /></div>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <StreakDisplay streak={gameState?.streak ?? 0} maxStreak={gameState?.maxStreak ?? 0} />
            </Card>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4" /> {t.topPlayers}
              </h3>
              <MiniLeaderboard />
            </Card>
          </aside>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

function MiniLeaderboard() {
  const { t } = useLang();
  const { data: entries = [], isLoading } = useLeaderboard();
  const top5 = entries.slice(0, 5);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-4 h-4 text-gray-300" />;
    if (rank === 3) return <Crown className="w-4 h-4 text-orange-400" />;
    return <span className="text-xs text-yellow-100/50 font-bold">#{rank}</span>;
  };

  if (isLoading) return <div className="text-center text-yellow-100/40 text-sm py-4">{t.loading}</div>;
  if (top5.length === 0) return <div className="text-center text-yellow-100/40 text-sm py-4">{t.noPlayersYet}</div>;

  return (
    <div className="space-y-2" data-testid="mini-leaderboard">
      {top5.map((e) => (
        <div key={e.rank} className="flex items-center gap-2 p-2 rounded-md bg-purple-800/20 border border-yellow-500/10">
          <div className="w-6 flex justify-center">{rankIcon(e.rank)}</div>
          <div className="flex-1 min-w-0 text-sm font-bold text-yellow-100 truncate">{e.username}</div>
          <div className="text-sm font-black text-yellow-400 shrink-0">{e.balance.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

export function AppFooter() {
  const { t } = useLang();
  const [installOpen, setInstallOpen] = useState(false);
  return (
    <footer className="relative z-10 border-t border-yellow-500/10 bg-[#080315]/80 backdrop-blur-sm mt-8" data-testid="app-footer">
      <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-2 text-xs text-yellow-100/50">
          <Link href="/about" className="hover:text-yellow-400 transition-colors" data-testid="link-about">{t.about}</Link>
          <Link href="/terms" className="hover:text-yellow-400 transition-colors" data-testid="link-terms">{t.terms}</Link>
          <Link href="/coins" className="hover:text-yellow-400 transition-colors" data-testid="link-coins">{t.deposit}</Link>
          <Link href="/privacy" className="hover:text-yellow-400 transition-colors" data-testid="link-privacy">{t.privacy}</Link>
          <button type="button" onClick={() => setInstallOpen(true)} className="hover:text-yellow-400 transition-colors font-bold text-yellow-300/80" data-testid="link-install">📲 {t.installShort}</button>
        </div>
        <InstallDialog open={installOpen} onOpenChange={setInstallOpen} />
        <div className="text-xs text-yellow-100/30 text-center">{t.copyright}</div>
      </div>
    </footer>
  );
}
