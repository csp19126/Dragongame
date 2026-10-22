import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useAgo, useGameName } from "@/components/SocialBits";
import { useSocialEvent, FRIENDS_KEY } from "@/hooks/use-social";
import { PLAY_GAME_TO_PLAYABLE, type FeedItem, type FriendsView } from "@shared/friends";

type Page = { items: FeedItem[]; more: boolean };
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

/** One line saying what happened, in the player's language */
function useFeedText() {
  const { tr } = useLang();
  const gameName = useGameName();
  return (it: FeedItem, compact = false): { icon: string; text: ReactNode } => {
    const amt = it.amount ?? 0;
    const coins = compact ? short(amt) : fmtCoins(amt);
    const mult = it.bet ? Math.floor(amt / it.bet) : 0;
    const game = gameName(it.game ? PLAY_GAME_TO_PLAYABLE[it.game] ?? it.game : null);
    const name = <b className="text-white">{it.user.username}</b>;
    switch (it.kind) {
      case "jackpot": return { icon: "🏺", text: <>{name} {tr("NỔ HŨ RỒNG", "hit the HŨ RỒNG jackpot", "爆了神龍彩金")} <b className="text-yellow-300">{coins}</b> {tr("xu!", "coins!", "金幣！")}</> };
      case "big_win": return { icon: "💰", text: <>{name} {tr("thắng", "won", "贏得")} <b className="text-yellow-300">{coins}</b>{mult >= 2 && <span className="text-orange-300"> ×{mult}</span>}{game && !compact && <span className="text-white/60"> · {game}</span>}</> };
      case "horse": return { icon: "🏇", text: <>{name} {tr("thắng đua ngựa", "won at the races", "賽馬贏得")} <b className="text-yellow-300">{coins}</b>{mult >= 2 && <span className="text-orange-300"> ×{mult}</span>}</> };
      case "joined": return { icon: "👋", text: <>{name} {tr("vừa gia nhập VnSlot 888", "just joined VnSlot 888", "剛加入 VnSlot 888")}</> };
      case "level_up": return { icon: "⭐", text: <>{name} {tr(`lên cấp ${it.level}`, `reached level ${it.level}`, `升到 Lv.${it.level}`)}</> };
      case "friends": return { icon: "🤝", text: <>{name} {tr("và", "and", "和")} <b className="text-white">{it.other?.username}</b> {tr("đã kết bạn", "are now friends", "成為了好友")}</> };
      default: return { icon: "✨", text: name };
    }
  };
}

/** Community › Activity: everything that's happening, or just friends, live */
export function ActivityFeed() {
  const { tr } = useLang();
  const { user } = useAuth();
  const showPlayer = usePlayerSheet();
  const ago = useAgo();
  const text = useFeedText();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "friends">("all");
  const [older, setOlder] = useState<FeedItem[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const key = [`/api/feed?scope=${scope}`];
  const q = useQuery<Page>({ queryKey: key, refetchInterval: 60_000 });
  const [, tick] = useState(0);
  useEffect(() => { setOlder([]); setMore(null); }, [scope]);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  useSocialEvent((m) => {
    if (m.t !== "feed") return;
    const it = m.item as FeedItem;
    if (scope === "friends") {
      const fr = qc.getQueryData<FriendsView>(FRIENDS_KEY);
      const names = new Set([user?.username, ...(fr?.friends.map((f) => f.username) ?? [])]);
      if (!names.has(it.user.username) && !(it.other && names.has(it.other.username))) return;
    }
    qc.setQueryData<Page>(key, (old) => (old && !old.items.some((x) => x.id === it.id) ? { ...old, items: [it, ...old.items].slice(0, 60) } : old));
  });

  const items = [...(q.data?.items ?? []), ...older.filter((o) => !q.data?.items.some((x) => x.id === o.id))];
  const hasMore = more ?? q.data?.more ?? false;
  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const r: Page = await (await fetch(`/api/feed?scope=${scope}&before=${last.id}`, { credentials: "include" })).json();
      setOlder((o) => [...o, ...r.items]);
      setMore(r.more);
    } finally { setLoading(false); }
  };

  return (
    <div className="w-full flex flex-col gap-2" data-testid="community-activity">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
        {(["all", "friends"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setScope(s)} className={`h-9 rounded-lg text-xs font-black ${scope === s ? "bg-white/15 text-yellow-200" : "text-white/55"}`} data-testid={`feed-scope-${s}`}>
            {s === "all" ? tr("🌏 Mọi người", "🌏 Everyone", "🌏 所有人") : tr("🤝 Bạn bè", "🤝 Friends", "🤝 好友")}
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="feed-list">
        {!q.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-10" /> : items.length === 0 ? (
          <div className="px-4 py-10 text-center flex flex-col items-center gap-2">
            <Activity className="w-10 h-10 text-yellow-400/60" />
            <p className="text-sm text-white/70 font-bold">{scope === "friends" ? tr("Bạn bè chưa có hoạt động nào", "Nothing from your friends yet", "好友還沒有動態") : tr("Chưa có hoạt động nào", "Nothing yet", "還沒有動態")}</p>
            <p className="text-xs text-white/45">{tr("Thắng lớn, lên cấp, kết bạn… sẽ hiện ở đây.", "Big wins, level-ups and new friends show up here.", "大獎、升級和新朋友都會顯示在這裡。")}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const t = text(it);
              const hot = it.kind === "jackpot" || it.kind === "big_win" || it.kind === "horse";
              return (
                <motion.div key={it.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  className={`flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0 ${it.kind === "jackpot" ? "bg-gradient-to-r from-yellow-500/20 to-transparent" : ""}`} data-testid={`feed-${it.id}`}>
                  <div className="relative shrink-0">
                    <Avatar user={it.user} size={40} onClick={() => showPlayer(it.user.username)} />
                    <span className="absolute -bottom-1 -right-1 text-base leading-none drop-shadow">{t.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] leading-snug ${hot ? "text-white/90" : "text-white/75"}`}>{t.text}</p>
                    <p className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5"><LevelBadge level={it.user.level} />{ago(it.at)}</p>
                  </div>
                  {it.other && <Avatar user={it.other} size={30} onClick={() => showPlayer(it.other!.username)} />}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {hasMore && (
          <button type="button" disabled={loading} onClick={loadMore} className="w-full py-2.5 text-xs font-bold text-yellow-300/80 border-t border-white/5" data-testid="feed-more">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : tr("Xem thêm", "Show more", "顯示更多")}
          </button>
        )}
      </div>
      <p className="text-[10px] text-white/40 text-center">{tr("Không muốn hiện ở đây? Tắt trong Tôi › Quyền riêng tư.", "Rather not appear here? Turn it off in Me › Privacy.", "不想出現在這裡？到「我的 › 隱私」關閉。")}</p>
    </div>
  );
}

/** A compact live ticker for the lobby: the latest things happening, scrolling past */
export function LobbyTicker() {
  const { tr } = useLang();
  const text = useFeedText();
  const qc = useQueryClient();
  const key = ["/api/feed?scope=all&limit=12"];
  const q = useQuery<Page>({ queryKey: key, refetchInterval: 90_000 });
  const [i, setI] = useState(0);
  useSocialEvent((m) => {
    if (m.t !== "feed") return;
    qc.setQueryData<Page>(key, (old) => (old && !old.items.some((x) => x.id === m.item.id) ? { ...old, items: [m.item, ...old.items].slice(0, 12) } : old));
    setI(0);
  });
  const items = q.data?.items ?? [];
  useEffect(() => {
    if (items.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  const it = items[i % items.length];
  const t = text(it, true);
  return (
    <Link href="/community?tab=activity" className="rounded-2xl bg-gradient-to-r from-purple-900/70 to-black/50 border border-yellow-500/25 px-3 h-12 flex items-center gap-2.5 overflow-hidden active:scale-[0.98] transition" data-testid="lobby-ticker">
      <span className="shrink-0 flex items-center gap-1 text-[10px] font-black text-emerald-300 uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{tr("Live", "Live", "即時")}</span>
      <div className="flex-1 min-w-0 relative h-full">
        <AnimatePresence mode="wait">
          <motion.div key={it.id} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center gap-2">
            <Avatar user={it.user} size={26} />
            <span className="text-xs text-white/75 truncate">{t.icon} {t.text}</span>
          </motion.div>
        </AnimatePresence>
      </div>
      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
    </Link>
  );
}
