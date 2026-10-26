import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Gamepad2, Loader2, MessageCircle, Search, Swords, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst } from "@/lib/celebrate";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useGameName } from "@/components/SocialBits";
import { FRIENDS_KEY } from "@/hooks/use-social";
import { useSocial3 } from "@/components/Challenge";
import { OnlineNowButton } from "@/components/OnlineNow";
import { ClubTagChip } from "@/components/Social3Bits";
import type { FriendsView, FriendView, GiftBlock, Relation } from "@shared/friends";

interface Found { username: string; avatarUrl: string | null; level: number; online: boolean; relation: Relation }

/** Friend actions shared by the friends tab, search results and the profile sheet */
export function useFriendActions() {
  const { srv, tr } = useLang();
  const { toast } = useToast();
  const run = useMutation({
    mutationFn: async ({ path, username }: { path: string; username: string }) => (await apiRequest("POST", `/api/friends/${path}`, { username })).json() as Promise<{ relation: Relation }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
      queryClient.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0]); return k.startsWith("/api/players/") || k.startsWith("/api/friends/search") || k.startsWith("/api/notifications"); } });
    },
    onError: (e) => toast({ title: e instanceof ApiError ? (e.message === "play_first" ? tr("Chơi vài ván trước đã nhé.", "Play a few games first.", "先玩幾局再來吧。") : srv(e.message)) : String(e), variant: "destructive" }),
  });
  return run;
}

export function giftReason(b: GiftBlock, tr: <T>(vi: T, en: T, zh: T) => T) {
  switch (b) {
    case "sent_today": return tr("Hôm nay bạn đã lì xì người này rồi. Mai quay lại nhé!", "You've sent them a Lì Xì today. Come back tomorrow!", "今天已經送過紅包了，明天再來吧！");
    case "games_you": return tr("Chơi đủ 10 ván để được gửi Lì Xì", "Play 10 games to send Lì Xì", "玩滿 10 局才能送紅包");
    case "games_them": return tr("Bạn của bạn cần chơi đủ 10 ván trước", "Your friend needs to play 10 games first", "你的好友需要先玩滿 10 局");
    case "too_new": return tr("Kết bạn được 1 ngày mới gửi Lì Xì được", "You can send Lì Xì after being friends for a day", "成為好友滿一天後才能送紅包");
    default: return tr("Chỉ gửi được cho bạn bè", "Only for friends", "只能送給好友");
  }
}

export function FriendsTab() {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const showPlayer = usePlayerSheet();
  const gameName = useGameName();
  const q = useQuery<FriendsView>({ queryKey: FRIENDS_KEY, refetchInterval: 30_000, staleTime: 0 });
  const [term, setTerm] = useState("");
  const search = useQuery<{ players: Found[] }>({ queryKey: [`/api/friends/search?q=${encodeURIComponent(term.trim())}`], enabled: term.trim().length >= 2, staleTime: 5_000 });
  const act = useFriendActions();
  const { challenge } = useSocial3();
  const [removing, setRemoving] = useState<string | null>(null);

  const gift = useMutation({
    mutationFn: async (username: string) => (await apiRequest("POST", "/api/friends/gift", { username })).json() as Promise<{ amount: number }>,
    onSuccess: (r, username) => {
      soundManager.coinDrop(); coinBurst({ x: 0.5, y: 0.6 });
      toast({ title: tr(`🧧 Đã gửi Lì Xì cho ${username}!`, `🧧 Lì Xì sent to ${username}!`, `🧧 已送紅包給 ${username}！`), description: tr(`${username} nhận ${fmtCoins(r.amount)} xu do game tặng. Bạn không mất xu nào.`, `${username} gets ${fmtCoins(r.amount)} coins from the game. It costs you nothing.`, `${username} 會獲得遊戲贈送的 ${fmtCoins(r.amount)} 金幣，你不會花到任何金幣。`) });
      queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
    },
    onError: (e) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }),
  });

  const v = q.data;
  const message = (name: string) => setLocation(`/community?tab=dm&dm=${encodeURIComponent(name)}`);
  const online = v?.friends.filter((f) => f.online).length ?? 0;

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-friends">
      <OnlineNowButton className="self-center" />
      {/* Find players */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-xl bg-black/50 border border-white/15 px-3">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={24} placeholder={tr("Tìm bạn theo tên người chơi…", "Find friends by player name…", "用玩家帳號搜尋好友…")}
            className="flex-1 min-w-0 h-11 bg-transparent text-white placeholder:text-white/30 outline-none" data-testid="input-friend-search" />
          {term && <button type="button" onClick={() => setTerm("")} className="p-1 text-white/50" aria-label={tr("Xoá", "Clear", "清除")}><X className="w-4 h-4" /></button>}
        </div>
        {term.trim().length >= 2 && (
          <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="friend-search-results">
            {!search.data ? <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto my-4" /> : search.data.players.length === 0 ? (
              <p className="text-xs text-white/50 text-center py-4">{tr("Không tìm thấy ai", "Nobody found", "找不到玩家")}</p>
            ) : search.data.players.map((p) => (
              <div key={p.username} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0" data-testid={`found-${p.username}`}>
                <Avatar user={p} size={38} online={p.online} onClick={() => showPlayer(p.username)} />
                <button type="button" onClick={() => showPlayer(p.username)} className="flex-1 min-w-0 text-left flex items-center gap-1.5">
                  <span className="font-bold text-white truncate">{p.username}</span><LevelBadge level={p.level} />
                </button>
                <RelationButton relation={p.relation} username={p.username} busy={act.isPending} onAct={(path) => act.mutate({ path, username: p.username })} />
              </div>
            ))}
          </div>
        )}
      </div>

      {!v ? <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mx-auto mt-8" /> : (
        <>
          {/* Requests to answer */}
          {v.incoming.length > 0 && (
            <section className="rounded-2xl bg-gradient-to-br from-yellow-500/15 to-orange-600/10 border border-yellow-400/40 p-2.5 flex flex-col gap-1" data-testid="friend-incoming">
              <h3 className="text-xs font-black text-yellow-200 px-1 flex items-center gap-1.5"><UserPlus className="w-4 h-4" />{tr("Lời mời kết bạn", "Friend requests", "好友邀請")} ({v.incoming.length})</h3>
              {v.incoming.map((r) => (
                <div key={r.username} className="flex items-center gap-2.5 px-1 py-1.5" data-testid={`incoming-${r.username}`}>
                  <Avatar user={r} size={40} onClick={() => showPlayer(r.username)} />
                  <button type="button" onClick={() => showPlayer(r.username)} className="flex-1 min-w-0 text-left flex items-center gap-1.5"><span className="font-bold text-white truncate">{r.username}</span><LevelBadge level={r.level} /></button>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "accept", username: r.username })} className="h-9 px-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-xs font-black flex items-center gap-1" data-testid={`button-accept-${r.username}`}><Check className="w-4 h-4" />{tr("Đồng ý", "Accept", "接受")}</button>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "decline", username: r.username })} className="h-9 w-9 rounded-xl bg-white/10 text-white/70 flex items-center justify-center" aria-label={tr("Từ chối", "Decline", "拒絕")} data-testid={`button-decline-${r.username}`}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </section>
          )}

          {/* Friends */}
          <section className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="friend-list">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <h3 className="text-xs font-black text-white/80 flex items-center gap-1.5"><Users className="w-4 h-4 text-yellow-300" />{tr("Bạn bè", "Friends", "好友")} ({v.friends.length})</h3>
              <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{tr(`${online} đang online`, `${online} online`, `${online} 人在線`)}</span>
            </div>
            {v.friends.length === 0 ? (
              <div className="px-4 py-8 text-center flex flex-col items-center gap-2" data-testid="friends-empty">
                <div className="text-4xl">🤝</div>
                <p className="text-sm text-white/70 font-bold">{tr("Chưa có bạn bè nào", "No friends yet", "還沒有好友")}</p>
                <p className="text-xs text-white/45">{tr("Tìm tên ở trên, hoặc chạm vào ai đó trong phòng chat rồi bấm “Kết bạn”.", "Search above, or tap someone in the chat room and press “Add friend”.", "在上方搜尋，或在聊天室點選玩家後按「加好友」。")}</p>
              </div>
            ) : v.friends.map((f) => (
              <FriendRow key={f.username} f={f} gameName={gameName} onShow={() => showPlayer(f.username)} onMessage={() => message(f.username)}
                onJoin={() => f.join && setLocation(f.join.href)} onChallenge={() => challenge(f.username)} onGift={() => (f.gift ? toast({ title: giftReason(f.gift, tr) }) : gift.mutate(f.username))} giftBusy={gift.isPending && gift.variables === f.username}
                onRemove={() => setRemoving(f.username)} />
            ))}
            <p className="text-[10px] text-white/45 px-3 py-2 border-t border-white/5 leading-snug" data-testid="gift-explainer">
              🧧 {tr(`Mỗi ngày bạn được lì xì mỗi người bạn ${fmtCoins(v.gift.amount)} xu. Xu do game tặng, bạn không mất gì. Cần kết bạn từ 1 ngày và cả hai đã chơi ${v.gift.minGames} ván.`,
                `Once a day you can send each friend a Lì Xì of ${fmtCoins(v.gift.amount)} coins. The game pays for it, it costs you nothing. You need to have been friends for a day and both played ${v.gift.minGames} games.`,
                `每天可以送每位好友一個 ${fmtCoins(v.gift.amount)} 金幣的紅包。金幣由遊戲贈送，你不會有任何花費。須成為好友滿一天，且雙方都已玩滿 ${v.gift.minGames} 局。`)}
            </p>
          </section>

          {/* Requests I sent */}
          {v.outgoing.length > 0 && (
            <section className="rounded-2xl bg-black/30 border border-white/10 p-2.5 flex flex-col gap-1" data-testid="friend-outgoing">
              <h3 className="text-xs font-black text-white/60 px-1 flex items-center gap-1.5"><Clock className="w-4 h-4" />{tr("Đã gửi lời mời", "Requests sent", "已送出的邀請")}</h3>
              {v.outgoing.map((r) => (
                <div key={r.username} className="flex items-center gap-2.5 px-1 py-1" data-testid={`outgoing-${r.username}`}>
                  <Avatar user={r} size={32} onClick={() => showPlayer(r.username)} />
                  <span className="flex-1 min-w-0 truncate text-sm text-white/80">{r.username}</span>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "cancel", username: r.username })} className="h-8 px-3 rounded-lg bg-white/10 text-white/70 text-xs font-bold" data-testid={`button-cancel-${r.username}`}>{tr("Huỷ", "Cancel", "取消")}</button>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <AnimatePresence>
        {removing && (
          <motion.div className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRemoving(null)}>
            <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-[#1a0a2e] border border-white/15 p-4 flex flex-col gap-3 text-center" data-testid="remove-friend-dialog">
              <p className="text-white font-bold">{tr(`Huỷ kết bạn với ${removing}?`, `Remove ${removing} from your friends?`, `要將 ${removing} 從好友中移除嗎？`)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRemoving(null)} className="h-10 rounded-xl bg-white/10 text-white font-bold">{tr("Không", "No", "取消")}</button>
                <button type="button" onClick={() => { act.mutate({ path: "remove", username: removing }); setRemoving(null); }} className="h-10 rounded-xl bg-red-600 text-white font-black" data-testid="button-confirm-remove">{tr("Huỷ kết bạn", "Remove", "移除")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FriendRow({ f, gameName, onShow, onMessage, onJoin, onChallenge, onGift, giftBusy, onRemove }: {
  f: FriendView; gameName: (id: string | null) => string | null; onShow: () => void; onMessage: () => void; onJoin: () => void; onChallenge: () => void; onGift: () => void; giftBusy: boolean; onRemove: () => void;
}) {
  const { tr } = useLang();
  const playing = gameName(f.playing);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-t border-white/5" data-testid={`friend-${f.username}`}>
      <Avatar user={f} size={44} online={f.online} onClick={onShow} />
      <button type="button" onClick={onShow} className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-1.5 min-w-0"><span className="font-black text-white truncate">{f.username}</span><ClubTagChip club={f.club} /><LevelBadge level={f.level} /></span>
        <span className={`block text-[11px] truncate ${playing ? "text-yellow-200" : f.online ? "text-emerald-300" : "text-white/40"}`} data-testid={`friend-status-${f.username}`}>
          {playing ? <><Gamepad2 className="inline w-3 h-3 mr-1 -mt-0.5" />{tr("Đang chơi", "Playing", "正在玩")} {playing}</> : f.online ? tr("Đang online", "Online", "在線上") : tr("Ngoại tuyến", "Offline", "離線")}
        </span>
      </button>
      {f.join && (
        <button type="button" onClick={onJoin} className="h-9 px-2.5 rounded-xl bg-emerald-500 text-black text-xs font-black animate-pulse" data-testid={`button-join-${f.username}`}>{tr("Vào bàn", "Join", "加入")}</button>
      )}
      {!f.join && <button type="button" onClick={onChallenge} className="h-9 w-9 rounded-xl bg-gradient-to-b from-red-500 to-red-700 text-yellow-100 flex items-center justify-center" aria-label={tr("Thách đấu", "Challenge", "挑戰")} data-testid={`button-challenge-${f.username}`}><Swords className="w-4 h-4" /></button>}
      <button type="button" onClick={onGift} disabled={giftBusy} className={`h-9 w-9 rounded-xl flex items-center justify-center text-lg ${f.gift ? "bg-white/5 grayscale opacity-50" : "bg-gradient-to-b from-red-500 to-red-700 border border-yellow-300/70 shadow-[0_0_12px_rgba(250,204,21,0.35)]"}`}
        aria-label={tr("Gửi Lì Xì", "Send Lì Xì", "送紅包")} data-testid={`button-gift-${f.username}`}>
        {giftBusy ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : f.gift === "sent_today" ? <Check className="w-4 h-4 text-emerald-300" /> : "🧧"}
      </button>
      <button type="button" onClick={onMessage} className="h-9 w-9 rounded-xl bg-white/10 text-white flex items-center justify-center" aria-label={tr("Nhắn tin", "Message", "傳訊息")} data-testid={`button-message-${f.username}`}><MessageCircle className="w-4 h-4" /></button>
      <button type="button" onClick={onRemove} className="h-9 w-7 rounded-xl text-white/30 flex items-center justify-center" aria-label={tr("Huỷ kết bạn", "Remove friend", "移除好友")} data-testid={`button-remove-${f.username}`}><UserMinus className="w-4 h-4" /></button>
    </div>
  );
}

/** Add friend / Request sent / Accept / Friends ✓ */
export function RelationButton({ relation, username, busy, onAct, big }: { relation: Relation; username: string; busy: boolean; onAct: (path: "request" | "accept" | "cancel") => void; big?: boolean }) {
  const { tr } = useLang();
  const size = big ? "h-12 rounded-2xl text-sm px-3" : "h-9 rounded-xl text-xs px-2.5";
  if (relation === "friends") return <span className={`${size} inline-flex items-center justify-center gap-1 bg-emerald-600/25 text-emerald-200 border border-emerald-400/30 font-black`} data-testid={`relation-friends-${username}`}><Check className="w-4 h-4" />{tr("Bạn bè", "Friends", "好友")}</span>;
  if (relation === "sent") return <button type="button" disabled={busy} onClick={() => onAct("cancel")} className={`${size} inline-flex items-center justify-center gap-1 bg-white/10 text-white/70 font-bold`} data-testid={`relation-sent-${username}`}><Clock className="w-4 h-4" />{tr("Đã gửi lời mời", "Request sent", "已送出邀請")}</button>;
  if (relation === "received") return <button type="button" disabled={busy} onClick={() => onAct("accept")} className={`${size} inline-flex items-center justify-center gap-1 bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black`} data-testid={`relation-accept-${username}`}><Check className="w-4 h-4" />{tr("Đồng ý kết bạn", "Accept", "接受邀請")}</button>;
  return <button type="button" disabled={busy} onClick={() => onAct("request")} className={`${size} inline-flex items-center justify-center gap-1 bg-gradient-to-b from-sky-400 to-blue-600 text-white font-black`} data-testid={`relation-add-${username}`}><UserPlus className="w-4 h-4" />{tr("Kết bạn", "Add friend", "加好友")}</button>;
}
