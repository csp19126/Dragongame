import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, CheckCheck, Loader2, X } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { ME_KEY } from "@/hooks/use-auth";
import { STATE_KEY } from "@/hooks/use-game";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { useAgo, useGameName } from "@/components/SocialBits";
import { useFriendActions } from "@/components/Friends";
import { NOTIF_KEY, NOTIF_UNREAD_KEY, FRIENDS_KEY, useNotifUnread } from "@/hooks/use-social";
import { PLAY_GAME_TO_PLAYABLE, type NotificationView } from "@shared/friends";

type Page = { items: NotificationView[]; more: boolean; unread: number };

/** The 🔔 in the header, with its unread count; opens the notifications sheet */
export function NotificationBell() {
  const { tr } = useLang();
  const unread = useNotifUnread();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center active:scale-95" aria-label={tr("Thông báo", "Notifications", "通知")} data-testid="button-notifications">
        <motion.span key={unread} animate={unread ? { rotate: [0, -18, 14, -8, 0] } : {}} transition={{ duration: 0.6 }}><Bell className="w-[18px] h-[18px] text-yellow-200" /></motion.span>
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center border border-[#0b0716]" data-testid="badge-notifications">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {createPortal(<AnimatePresence>{open && <NotificationSheet onClose={() => setOpen(false)} />}</AnimatePresence>, document.body)}
    </>
  );
}

function NotificationSheet({ onClose }: { onClose: () => void }) {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const showPlayer = usePlayerSheet();
  const ago = useAgo();
  const gameName = useGameName();
  const q = useQuery<Page>({ queryKey: NOTIF_KEY, staleTime: 0 });
  const [older, setOlder] = useState<NotificationView[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const act = useFriendActions();

  const setUnread = (n: number) => queryClient.setQueryData(NOTIF_UNREAD_KEY, { total: n });
  const read = async (body: { id?: number; all?: boolean }) => {
    try {
      const r = await (await apiRequest("POST", "/api/notifications/read", body)).json();
      setUnread(r.unread);
      queryClient.setQueryData<Page>(NOTIF_KEY, (old) => old && { ...old, unread: r.unread, items: old.items.map((n) => (body.all || n.id === body.id ? { ...n, read: true } : n)) });
      if (body.all) setOlder((o) => o.map((n) => ({ ...n, read: true })));
    } catch { /* next time */ }
  };
  const claim = useMutation({
    mutationFn: async (n: NotificationView) => (await apiRequest("POST", `/api/friends/gift/${n.data.giftId}/claim`)).json() as Promise<{ amount: number; balance: number }>,
    onSuccess: (r) => {
      soundManager.coinShower(); coinBurst(); fireworks(1200, 0.5);
      toast({ title: tr(`🧧 +${fmtCoins(r.amount)} xu!`, `🧧 +${fmtCoins(r.amount)} coins!`, `🧧 +${fmtCoins(r.amount)} 金幣！`) });
      queryClient.invalidateQueries({ queryKey: NOTIF_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
    onError: (e) => { toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }); queryClient.invalidateQueries({ queryKey: NOTIF_KEY }); },
  });

  const items = [...(q.data?.items ?? []), ...older.filter((o) => !q.data?.items.some((x) => x.id === o.id))];
  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const r: Page = await (await fetch(`/api/notifications?before=${last.id}`, { credentials: "include" })).json();
    setOlder((o) => [...o, ...r.items]);
    setMore(r.more);
  };
  const go = (n: NotificationView) => {
    if (!n.read) void read({ id: n.id });
    if ((n.kind === "mention" || n.kind === "reply" || n.kind === "reaction") && n.data.scope === "chat") { onClose(); setLocation(`/community?tab=chat&msg=${n.data.messageId}`); }
    else if (n.kind === "reaction" && n.data.scope === "dm" && n.actor) { onClose(); setLocation(`/community?tab=dm&dm=${encodeURIComponent(n.actor.username)}`); }
    else if (n.kind === "friend_accepted" || n.kind === "friend_request") { onClose(); setLocation("/community?tab=friends"); }
    else if (n.actor) showPlayer(n.actor.username);
  };

  const line = (n: NotificationView) => {
    const who = <b className="text-white">{n.actor?.username ?? tr("Ai đó", "Someone", "有人")}</b>;
    const quote = n.data.snippet ? <span className="text-white/55"> “{n.data.snippet}”</span> : null;
    switch (n.kind) {
      case "friend_request": return <>{who} {tr("muốn kết bạn với bạn", "wants to be your friend", "想加你為好友")}</>;
      case "friend_accepted": return <>{who} {tr("đã đồng ý kết bạn. Giờ hai bạn là bạn bè!", "accepted your friend request. You're friends now!", "接受了你的好友邀請，你們現在是好友了！")}</>;
      case "mention": return <>{who} {tr("nhắc đến bạn trong phòng chat:", "mentioned you in the chat:", "在聊天室提到了你：")}{quote}</>;
      case "reply": return <>{who} {tr("trả lời bạn:", "replied to you:", "回覆了你：")}{quote}</>;
      case "reaction": {
        const names: string[] = n.data.actors ?? [];
        const others = Math.max(0, (n.data.total ?? 1) - names.length);
        const emojis = Object.keys(n.data.counts ?? {}).join("");
        const people = <b className="text-white">{names.join(", ") || tr("Ai đó", "Someone", "有人")}</b>;
        return <>{people}{others > 0 && tr(` và ${others} người khác`, ` and ${others} more`, ` 等 ${others} 人`)} {tr("đã thả", "reacted", "對你的訊息按了")} {emojis} {tr("vào tin nhắn của bạn", "to your message", "")}{quote}</>;
      }
      case "gift": return <>{who} {tr("gửi bạn một Lì Xì", "sent you a Lì Xì of", "送你一個紅包：")} <b className="text-yellow-300">{fmtCoins(n.data.amount)} {tr("xu", "coins", "金幣")}</b> 🧧</>;
      case "big_win": {
        const g = gameName(PLAY_GAME_TO_PLAYABLE[n.data.game] ?? n.data.game);
        return <>{tr("Bạn của bạn", "Your friend", "你的好友")} {who} {n.data.kind === "jackpot" ? tr("vừa NỔ HŨ RỒNG", "just hit the HŨ RỒNG jackpot:", "剛爆了神龍彩金：") : tr("vừa thắng lớn", "just won big:", "剛贏了大獎：")} <b className="text-yellow-300">{fmtCoins(n.data.amount)}</b>{g && <span className="text-white/55"> · {g}</span>} 🎉</>;
      }
      default: return who;
    }
  };
  const icon = (n: NotificationView) => ({ friend_request: "👋", friend_accepted: "🤝", mention: "💬", reply: "↩️", reaction: "❤️", gift: "🧧", big_win: "🎉" } as Record<string, string>)[n.kind] ?? "🔔";

  return (
    <motion.div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[86vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-gradient-to-b from-[#24103f] to-[#140b26] border border-yellow-500/30 shadow-2xl pb-[env(safe-area-inset-bottom)]" data-testid="notification-sheet">
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mt-2 sm:hidden" />
        <div className="flex items-center gap-2 px-4 pt-2 pb-2 border-b border-white/10">
          <Bell className="w-5 h-5 text-yellow-300" />
          <h2 className="font-display text-xl text-yellow-100 flex-1">{tr("Thông báo", "Notifications", "通知")}</h2>
          {!!q.data?.unread && (
            <button type="button" onClick={() => read({ all: true })} className="h-8 px-2.5 rounded-lg bg-white/10 text-white/80 text-[11px] font-bold flex items-center gap-1" data-testid="button-read-all"><CheckCheck className="w-3.5 h-3.5" />{tr("Đọc hết", "Mark all read", "全部已讀")}</button>
          )}
          <button type="button" onClick={onClose} className="p-2 text-white/60" aria-label={tr("Đóng", "Close", "關閉")} data-testid="button-notifications-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!q.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-12" /> : items.length === 0 ? (
            <div className="px-6 py-14 text-center flex flex-col items-center gap-2" data-testid="notifications-empty">
              <div className="text-5xl">🔔</div>
              <p className="text-sm font-bold text-white/70">{tr("Chưa có thông báo nào", "No notifications yet", "還沒有通知")}</p>
              <p className="text-xs text-white/45">{tr("Lời mời kết bạn, ai đó nhắc tên bạn, Lì Xì từ bạn bè… sẽ hiện ở đây.", "Friend requests, mentions and Lì Xì from friends will show up here.", "好友邀請、提及你的訊息和好友紅包都會顯示在這裡。")}</p>
            </div>
          ) : items.map((n) => (
            <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-white/5 ${n.read ? "" : "bg-yellow-400/[0.07]"}`} data-testid={`notif-${n.id}`}>
              <div className="relative shrink-0 self-start h-[42px]">
                {n.actor ? <Avatar user={n.actor} size={42} onClick={() => showPlayer(n.actor!.username)} /> : <span className="w-[42px] h-[42px] rounded-full bg-white/10 flex items-center justify-center text-xl">{icon(n)}</span>}
                {n.actor && <span className="absolute -bottom-1 -right-1 text-sm leading-none">{icon(n)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => go(n)} className="text-left text-[13px] leading-snug text-white/80 [overflow-wrap:anywhere]">{line(n)}</button>
                <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1.5">{ago(n.at)}{!n.read && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}</div>
                {n.kind === "friend_request" && n.actor && !n.data.state && (
                  <div className="flex gap-2 mt-2">
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "accept", username: n.actor!.username }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: NOTIF_KEY }); queryClient.invalidateQueries({ queryKey: FRIENDS_KEY }); soundManager.pop(); } })}
                      className="h-9 px-4 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-xs font-black flex items-center gap-1" data-testid={`notif-accept-${n.id}`}><Check className="w-4 h-4" />{tr("Đồng ý", "Accept", "接受")}</button>
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "decline", username: n.actor!.username }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIF_KEY }) })}
                      className="h-9 px-4 rounded-xl bg-white/10 text-white/80 text-xs font-bold" data-testid={`notif-decline-${n.id}`}>{tr("Từ chối", "Decline", "拒絕")}</button>
                  </div>
                )}
                {n.kind === "friend_request" && n.data.state && <div className="text-[11px] mt-1 font-bold text-white/45">{n.data.state === "accepted" ? tr("✓ Đã đồng ý", "✓ Accepted", "✓ 已接受") : tr("Đã từ chối", "Declined", "已拒絕")}</div>}
                {n.kind === "gift" && (n.data.claimed ? (
                  <div className="text-[11px] mt-1 font-bold text-emerald-300">{tr("✓ Đã nhận", "✓ Opened", "✓ 已領取")}</div>
                ) : (
                  <motion.button type="button" disabled={claim.isPending} onClick={() => claim.mutate(n)} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                    className="mt-2 h-10 px-4 rounded-xl bg-gradient-to-b from-red-500 to-red-700 border border-yellow-300 text-yellow-100 text-sm font-black shadow-[0_0_16px_rgba(250,204,21,0.4)]" data-testid={`notif-claim-${n.id}`}>
                    {claim.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("🧧 Mở Lì Xì", "🧧 Open Lì Xì", "🧧 打開紅包")}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
          {(more ?? q.data?.more) && <button type="button" onClick={loadMore} className="w-full py-3 text-xs font-bold text-yellow-300/80">{tr("Xem thêm", "Show more", "顯示更多")}</button>}
        </div>
      </motion.div>
    </motion.div>
  );
}
