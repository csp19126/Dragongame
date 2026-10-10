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
  { href: "/pool", icon: "🎱", vi: "Bi-a 8 bóng", en: "8-Ball Pool", tagVi: "Trực tuyến · League", tagEn: "Online · League", zh: "8號球撞球", tagZh: "線上對戰 · 聯賽", from: "from-emerald-500", to: "to-teal-900", live: true },
  { href: "/loto", icon: "🎟️", vi: "Lô Tô", en: "Lô Tô bingo", tagVi: "Gọi số trực tiếp · ×50", tagEn: "Live calls · up to ×50", zh: "賓果 (Lô Tô)", tagZh: "即時開號 · 最高 ×50", from: "from-red-500", to: "to-rose-950", live: true },
  { href: "/ban-ca", icon: "🐟", vi: "Bắn Cá", en: "Fish hunter", tagVi: "Rồng vàng ×300", tagEn: "Golden dragon ×300", zh: "捕魚", tagZh: "黃金龍 ×300", from: "from-sky-500", to: "to-blue-950" },
  { href: "/tien-len", icon: "🂡", vi: "Tiến Lên", en: "Tiến Lên", tagVi: "Miền Nam · chặt heo", tagEn: "Southern rules · vs 3", zh: "大老二 (Tiến Lên)", tagZh: "南方規則 · 對戰 3 人", from: "from-emerald-500", to: "to-green-950" },
  { href: "/ban-bai", icon: "🀄", vi: "Xì Dách Online", en: "Live Xì Dách", tagVi: "Đấu với người thật · làm cái", tagEn: "Play real people · be the banker", zh: "線上 21點", tagZh: "真人對戰 · 當莊家", from: "from-indigo-500", to: "to-indigo-950", live: true },
  { href: "/blackjack", icon: "🃏", vi: "Xì Dách", en: "Blackjack", tagVi: "Blackjack trả 3:2", tagEn: "Blackjack pays 3:2", zh: "21點 (Xì Dách)", tagZh: "Blackjack 賠 3:2", from: "from-sky-500", to: "to-indigo-900" },
  { href: "/roulette", icon: "🎡", vi: "Roulette", en: "Roulette", tagVi: "Một số 0 · 97,3%", tagEn: "Single zero · 97.3%", zh: "輪盤", tagZh: "單零 · 97.3%", from: "from-rose-500", to: "to-red-950" },
  { href: "/bau-cua", icon: "🦀", vi: "Bầu Cua", en: "Bầu Cua", tagVi: "Tôm Cá truyền thống", tagEn: "The Tết dice game", zh: "魚蝦蟹 (Bầu Cua)", tagZh: "傳統新年骰子遊戲", from: "from-amber-500", to: "to-orange-950" },
] as const;

/** The home screen for signed-in players: every game, today's freebies and what's on */
export default function Lobby() {
  const { user } = useAuth();
  const { tr } = useLang();
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
  const greet = tr(hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối", hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening", hour < 12 ? "早安" : hour < 18 ? "午安" : "晚安");
  const me = league.data?.me;

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-4 flex flex-col gap-3" data-testid="lobby">
        <div className="flex items-end justify-between px-1">
          <div>
            <div className="text-xs text-white/50">{greet}{tr(",", ",", "，")}</div>
            <div className="text-xl font-black text-white leading-tight truncate max-w-[14rem]" data-testid="lobby-name">{user?.username} 👋</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-black text-white/40">{tr("Số dư", "Balance", "餘額")}</div>
            <div className="font-mono font-black text-yellow-300 text-lg">{(state?.balance ?? user?.balance ?? 0).toLocaleString()} 🪙</div>
          </div>
        </div>

        <AnnouncementBar />

        {/* Featured: the slot and its jackpot */}
        <Link href="/slot" data-testid="lobby-slot">
          <motion.div whileTap={{ scale: 0.98 }} className="relative overflow-hidden rounded-[28px] p-4 bg-gradient-to-br from-red-600 via-red-800 to-[#2a0712] border border-yellow-300/40 shadow-[0_14px_40px_rgba(220,38,38,0.35)]">
            <div className="absolute -right-6 -top-6 text-[9rem] leading-none opacity-25 select-none">🐉</div>
            <div className="relative">
              <div className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black tracking-widest text-yellow-200 uppercase">⭐ {tr("Nổi bật", "Featured", "精選")}</div>
              <div className="font-display text-3xl text-white mt-1 leading-none">{tr("Slot Rồng Vàng", "Slot Rồng Vàng", "神龍老虎機")}</div>
              <div className="text-xs text-white/80 mt-1">{tr("Giữ cuộn · Rồng Lặp · Chọn Lì Xì · Xóc Đĩa", "Hold · Rồng Lặp · Pick your envelope · Xóc Đĩa", "保留轉輪 · 神龍連轉 · 選紅包 · 搖碟比倍")}</div>
              <div className="mt-3 rounded-2xl bg-black/35 border border-yellow-400/40 px-3 py-2 flex items-center gap-2">
                <span className="text-2xl">🏺</span>
                <div className="flex-1">
                  <div className="text-[10px] font-black tracking-[0.2em] text-yellow-200/80">{tr("HŨ RỒNG", "HŨ RỒNG", "神龍彩金")}</div>
                  <div className="font-mono font-black text-2xl text-yellow-300 leading-none" data-testid="lobby-jackpot">{jackpot ? jackpot.amount.toLocaleString() : "…"}</div>
                </div>
                <span className="px-3 py-2 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-sm">{tr("Chơi", "Play", "開玩")}</span>
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Freebies */}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!dailyReady || daily.isPending} onClick={() => daily.mutate()}
            className={`rounded-2xl p-2.5 text-center border transition active:scale-95 ${dailyReady ? "bg-gradient-to-b from-yellow-400/25 to-orange-600/20 border-yellow-300/60" : "bg-white/[0.04] border-white/10"}`} data-testid="lobby-daily">
            <div className="text-2xl">{daily.isPending ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-yellow-300" /> : "🎁"}</div>
            <div className="text-[11px] font-black text-white leading-tight">{tr("Quà hằng ngày", "Daily gift", "每日禮物")}</div>
            <div className={`text-[10px] font-bold ${dailyReady ? "text-yellow-300" : "text-white/40"}`}>{dailyReady ? `+${short(DAILY_BONUS_AMOUNT)}` : tr("Đã nhận", "Claimed", "已領取")}</div>
          </button>
          <Link href="/community?tab=album" className={`relative rounded-2xl p-2.5 text-center border active:scale-95 transition ${packs ? "bg-gradient-to-b from-red-500/25 to-red-900/20 border-red-300/50" : "bg-white/[0.04] border-white/10"}`} data-testid="lobby-packs">
            <div className="text-2xl">🧧</div>
            <div className="text-[11px] font-black text-white leading-tight">{tr("Gói sticker", "Sticker packs", "貼圖包")}</div>
            <div className={`text-[10px] font-bold ${packs ? "text-red-200" : "text-white/40"}`}>{packs ? tr(`${packs} gói mới`, `${packs} to open`, `${packs} 包待開`) : tr("Sưu tầm", "Collect", "收集")}</div>
            {packs > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">{packs}</span>}
          </Link>
          <Link href="/community?tab=invite" className="rounded-2xl p-2.5 text-center border bg-white/[0.04] border-white/10 active:scale-95 transition" data-testid="lobby-invite">
            <div className="text-2xl">🤝</div>
            <div className="text-[11px] font-black text-white leading-tight">{tr("Mời bạn", "Invite", "邀請好友")}</div>
            <div className="text-[10px] font-bold text-emerald-300">+{short(REFERRAL_REWARD)}</div>
          </Link>
        </div>

        <TournamentPromo />

        {/* All games */}
        <div className="flex items-center justify-between px-1 mt-1">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/70 font-sans drop-shadow-none">{tr("Trò chơi", "Games", "遊戲")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {GAMES.map((g) => (
            <Link key={g.href} href={g.href} data-testid={`lobby-game-${g.href.slice(1)}`}>
              <motion.div whileTap={{ scale: 0.96 }} className={`relative overflow-hidden h-32 rounded-3xl p-3 bg-gradient-to-br ${g.from} ${g.to} border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.4)] flex flex-col justify-end`}>
                <div className="absolute right-1 top-0 text-6xl drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)] select-none">{g.icon}</div>
                {"live" in g && <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />{tr("LIVE", "LIVE", "直播")}</span>}
                <div className="font-black text-white text-base leading-tight drop-shadow">{tr(g.vi, g.en, g.zh)}</div>
                <div className="text-[10px] text-white/80 font-bold">{tr(g.tagVi, g.tagEn, g.tagZh)}</div>
              </motion.div>
            </Link>
          ))}
        </div>

        {/* Pool league standing */}
        <Link href="/pool?tab=league" className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-3 active:scale-[0.98] transition" data-testid="lobby-league">
          <span className="text-3xl">{tierOf(me?.points ?? 0).icon}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase font-black text-emerald-300/80">{tr("Giải Vô Địch Bi-a", "Pool League", "撞球聯賽")}</span>
            <span className="block font-black text-white text-sm truncate">
              {me ? tr(`Hạng #${me.rank} · ${me.points} điểm`, `#${me.rank} · ${me.points} points`, `第 ${me.rank} 名 · ${me.points} 分`) : tr("Thắng 1 trận để lên bảng xếp hạng", "Win a game to get on the table", "贏一場就能登上排行榜")}
            </span>
            <span className="block text-[10px] text-white/50">{tr("Vô địch tháng nhận 10.000.000 xu", "The monthly champion wins 10,000,000 coins", "每月冠軍可獲得 10,000,000 金幣")}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-white/40" />
        </Link>

        <RecentWinsTicker />

        <div className="grid grid-cols-2 gap-2">
          <Link href="/community?tab=chat" className="rounded-2xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-2 active:scale-95 transition"><span className="text-2xl">💬</span><span className="text-sm font-black text-white">{tr("Trò chuyện", "Chat", "聊天")}</span></Link>
          <Link href="/leaderboard" className="rounded-2xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-2 active:scale-95 transition"><span className="text-2xl">🏆</span><span className="text-sm font-black text-white">{tr("Đại gia", "Rich list", "富豪榜")}</span></Link>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
