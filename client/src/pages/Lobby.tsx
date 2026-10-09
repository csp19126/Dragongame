import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { AnnouncementBar } from "@/components/CommunityStrip";
import { TournamentPromo } from "@/components/TournamentBits";
import { RecentWinsTicker, AppFooter } from "@/pages/Home";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useJackpot, useSetBalance } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_MS } from "@shared/schema";
import { REFERRAL_REWARD, type AlbumView } from "@shared/stickers";
import { tierOf, type LeagueView } from "@shared/league";

const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

const GAMES = [
  { href: "/pool", icon: "🎱", vi: "Bi-a 8 bóng", en: "8-Ball Pool", tagVi: "Trực tuyến · League", tagEn: "Online · League", from: "from-emerald-500", to: "to-teal-900", live: true },
  { href: "/loto", icon: "🎟️", vi: "Lô Tô", en: "Lô Tô bingo", tagVi: "Gọi số trực tiếp · ×50", tagEn: "Live calls · up to ×50", from: "from-red-500", to: "to-rose-950", live: true },
  { href: "/blackjack", icon: "🃏", vi: "Xì Dách", en: "Blackjack", tagVi: "Blackjack trả 3:2", tagEn: "Blackjack pays 3:2", from: "from-sky-500", to: "to-indigo-900" },
  { href: "/roulette", icon: "🎡", vi: "Roulette", en: "Roulette", tagVi: "Một số 0 · 97,3%", tagEn: "Single zero · 97.3%", from: "from-rose-500", to: "to-red-950" },
  { href: "/bau-cua", icon: "🦀", vi: "Bầu Cua", en: "Bầu Cua", tagVi: "Tôm Cá truyền thống", tagEn: "The Tết dice game", from: "from-amber-500", to: "to-orange-950" },
] as const;

/** The home screen for signed-in players: every game, today's freebies and what's on */
export default function Lobby() {
  const { user } = useAuth();
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const { data: state } = useGameState();
  const { data: jackpot } = useJackpot();
  const setBalance = useSetBalance();
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"] });
  const league = useQuery<LeagueView>({ queryKey: ["/api/pool/league"] });

  const dailyReady = !state?.lastDailyBonusAt || new Date(state.lastDailyBonusAt).getTime() + DAILY_BONUS_COOLDOWN_MS <= Date.now();
  const daily = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/bonus/daily")).json(),
    onSuccess: (r) => { setBalance(r.balance, { lastDailyBonusAt: new Date().toISOString() }); soundManager.coinShower(); toast({ title: `+${r.amount.toLocaleString()} 🪙` }); },
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/game/state"] }),
  });
  const packs = album.data ? (album.data.packs.free ? 1 : 0) + album.data.packs.play + album.data.packs.bonus : 0;
  const hour = new Date().getHours();
  const greet = vi ? (hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối") : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const me = league.data?.me;

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-4 flex flex-col gap-3" data-testid="lobby">
        <div className="flex items-end justify-between px-1">
          <div>
            <div className="text-xs text-white/50">{greet},</div>
            <div className="text-xl font-black text-white leading-tight truncate max-w-[14rem]" data-testid="lobby-name">{user?.username} 👋</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-black text-white/40">{vi ? "Số dư" : "Balance"}</div>
            <div className="font-mono font-black text-yellow-300 text-lg">{(state?.balance ?? user?.balance ?? 0).toLocaleString()} 🪙</div>
          </div>
        </div>

        <AnnouncementBar />

        {/* Featured: the slot and its jackpot */}
        <Link href="/slot" data-testid="lobby-slot">
          <motion.div whileTap={{ scale: 0.98 }} className="relative overflow-hidden rounded-[28px] p-4 bg-gradient-to-br from-red-600 via-red-800 to-[#2a0712] border border-yellow-300/40 shadow-[0_14px_40px_rgba(220,38,38,0.35)]">
            <div className="absolute -right-6 -top-6 text-[9rem] leading-none opacity-25 select-none">🐉</div>
            <div className="relative">
              <div className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black tracking-widest text-yellow-200 uppercase">⭐ {vi ? "Nổi bật" : "Featured"}</div>
              <div className="font-display text-3xl text-white mt-1 leading-none">Slot Rồng Vàng</div>
              <div className="text-xs text-white/80 mt-1">{vi ? "Giữ cuộn · Rồng Lặp · Chọn Lì Xì · Xóc Đĩa" : "Hold · Rồng Lặp · Pick your envelope · Xóc Đĩa"}</div>
              <div className="mt-3 rounded-2xl bg-black/35 border border-yellow-400/40 px-3 py-2 flex items-center gap-2">
                <span className="text-2xl">🏺</span>
                <div className="flex-1">
                  <div className="text-[10px] font-black tracking-[0.2em] text-yellow-200/80">HŨ RỒNG</div>
                  <div className="font-mono font-black text-2xl text-yellow-300 leading-none" data-testid="lobby-jackpot">{jackpot ? jackpot.amount.toLocaleString() : "…"}</div>
                </div>
                <span className="px-3 py-2 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-sm">{vi ? "Chơi" : "Play"}</span>
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Freebies */}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!dailyReady || daily.isPending} onClick={() => daily.mutate()}
            className={`rounded-2xl p-2.5 text-center border transition active:scale-95 ${dailyReady ? "bg-gradient-to-b from-yellow-400/25 to-orange-600/20 border-yellow-300/60" : "bg-white/[0.04] border-white/10"}`} data-testid="lobby-daily">
            <div className="text-2xl">{daily.isPending ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-yellow-300" /> : "🎁"}</div>
            <div className="text-[11px] font-black text-white leading-tight">{vi ? "Quà hằng ngày" : "Daily gift"}</div>
            <div className={`text-[10px] font-bold ${dailyReady ? "text-yellow-300" : "text-white/40"}`}>{dailyReady ? `+${short(DAILY_BONUS_AMOUNT)}` : (vi ? "Đã nhận" : "Claimed")}</div>
          </button>
          <Link href="/community?tab=album" className={`relative rounded-2xl p-2.5 text-center border active:scale-95 transition ${packs ? "bg-gradient-to-b from-red-500/25 to-red-900/20 border-red-300/50" : "bg-white/[0.04] border-white/10"}`} data-testid="lobby-packs">
            <div className="text-2xl">🧧</div>
            <div className="text-[11px] font-black text-white leading-tight">{vi ? "Gói sticker" : "Sticker packs"}</div>
            <div className={`text-[10px] font-bold ${packs ? "text-red-200" : "text-white/40"}`}>{packs ? (vi ? `${packs} gói mới` : `${packs} to open`) : (vi ? "Sưu tầm" : "Collect")}</div>
            {packs > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">{packs}</span>}
          </Link>
          <Link href="/community?tab=invite" className="rounded-2xl p-2.5 text-center border bg-white/[0.04] border-white/10 active:scale-95 transition" data-testid="lobby-invite">
            <div className="text-2xl">🤝</div>
            <div className="text-[11px] font-black text-white leading-tight">{vi ? "Mời bạn" : "Invite"}</div>
            <div className="text-[10px] font-bold text-emerald-300">+{short(REFERRAL_REWARD)}</div>
          </Link>
        </div>

        <TournamentPromo />

        {/* All games */}
        <div className="flex items-center justify-between px-1 mt-1">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/70 font-sans drop-shadow-none">{vi ? "Trò chơi" : "Games"}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {GAMES.map((g) => (
            <Link key={g.href} href={g.href} data-testid={`lobby-game-${g.href.slice(1)}`}>
              <motion.div whileTap={{ scale: 0.96 }} className={`relative overflow-hidden h-32 rounded-3xl p-3 bg-gradient-to-br ${g.from} ${g.to} border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.4)] flex flex-col justify-end`}>
                <div className="absolute right-1 top-0 text-6xl drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)] select-none">{g.icon}</div>
                {"live" in g && <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />LIVE</span>}
                <div className="font-black text-white text-base leading-tight drop-shadow">{vi ? g.vi : g.en}</div>
                <div className="text-[10px] text-white/80 font-bold">{vi ? g.tagVi : g.tagEn}</div>
              </motion.div>
            </Link>
          ))}
        </div>

        {/* Pool league standing */}
        <Link href="/pool?tab=league" className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-3 active:scale-[0.98] transition" data-testid="lobby-league">
          <span className="text-3xl">{tierOf(me?.points ?? 0).icon}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase font-black text-emerald-300/80">{vi ? "Giải Vô Địch Bi-a" : "Pool League"}</span>
            <span className="block font-black text-white text-sm truncate">
              {me ? (vi ? `Hạng #${me.rank} · ${me.points} điểm` : `#${me.rank} · ${me.points} points`) : (vi ? "Thắng 1 trận để lên bảng xếp hạng" : "Win a game to get on the table")}
            </span>
            <span className="block text-[10px] text-white/50">{vi ? "Vô địch tháng nhận 10.000.000 xu" : "The monthly champion wins 10,000,000 coins"}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-white/40" />
        </Link>

        <RecentWinsTicker />

        <div className="grid grid-cols-2 gap-2">
          <Link href="/community?tab=chat" className="rounded-2xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-2 active:scale-95 transition"><span className="text-2xl">💬</span><span className="text-sm font-black text-white">{vi ? "Trò chuyện" : "Chat"}</span></Link>
          <Link href="/leaderboard" className="rounded-2xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-2 active:scale-95 transition"><span className="text-2xl">🏆</span><span className="text-sm font-black text-white">{vi ? "Đại gia" : "Rich list"}</span></Link>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
