import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, Send, Share2, X } from "lucide-react";
import type { FriendsView } from "@shared/friends";
import { Avatar } from "@/components/Avatar";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";

/**
 * "Invite a friend": the player's friends with a button each (POST /api/invites), plus a
 * plain share link. If the invites route isn't there (404), it falls back to sharing the link.
 */
export function InviteSheet({ open, onClose, path, game }: { open: boolean; onClose: () => void; path: string; game: "darts" }) {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const friends = useQuery<FriendsView>({ queryKey: ["/api/friends"], enabled: open });
  const [sent, setSent] = useState<Record<string, "sending" | "sent">>({});
  const url = `${location.origin}${path}`;
  const shareText = tr("🎯 Vào ném phi tiêu với mình nào!", "🎯 Come and play darts with me!", "🎯 來跟我玩飛鏢吧！");

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "VnSlot 888", text: shareText, url }); return; }
      await navigator.clipboard.writeText(url);
      toast({ title: tr("Đã sao chép link!", "Link copied!", "已複製連結！") });
    } catch { /* cancelled */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast({ title: tr("Đã sao chép link!", "Link copied!", "已複製連結！") }); } catch { /* ignore */ }
  };
  const invite = async (to: string) => {
    setSent((s) => ({ ...s, [to]: "sending" }));
    try {
      await apiRequest("POST", "/api/invites", { to, game, path });
      setSent((s) => ({ ...s, [to]: "sent" }));
      toast({ title: tr(`Đã mời ${to}`, `Invited ${to}`, `已邀請 ${to}`) });
    } catch (e) {
      setSent((s) => { const n = { ...s }; delete n[to]; return n; });
      if (e instanceof ApiError && e.status === 404 && e.message === "Not found") { await share(); return; }
      toast({ title: srv((e as Error).message), variant: "destructive" });
    }
  };

  const list = [...(friends.data?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));

  // Portalled: the page content sits in its own stacking context under the bottom bar
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm text-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-t-3xl bg-gradient-to-b from-[#2a0f4f] to-[#140726] border-t-2 border-yellow-400/50 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }} transition={{ type: "spring", damping: 26, stiffness: 260 }} onClick={(e) => e.stopPropagation()} data-testid="darts-invite-sheet">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-2xl text-yellow-300">{tr("Mời bạn bè", "Invite a friend", "邀請好友")}</p>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="close"><X className="w-5 h-5 text-white/80" /></button>
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5 min-h-[6rem]">
              {friends.isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-yellow-300" /></div>
                : list.length ? list.map((f) => (
                  <div key={f.username} className="flex items-center gap-3 rounded-2xl px-3 py-2 bg-black/30 border border-white/10" data-testid={`darts-invite-${f.username}`}>
                    <Avatar user={f} size={38} online={f.online} />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white truncate">{f.username}</p>
                      <p className={`text-[11px] ${f.online ? "text-emerald-300" : "text-white/40"}`}>{f.online ? tr("Đang online", "Online", "線上") : tr("Ngoại tuyến", "Offline", "離線")}</p>
                    </div>
                    <button type="button" disabled={!!sent[f.username]} onClick={() => invite(f.username)}
                      className={`px-3.5 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 ${sent[f.username] === "sent" ? "bg-emerald-500/20 text-emerald-200" : "bg-yellow-400 text-black"} disabled:opacity-80`}>
                      {sent[f.username] === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : sent[f.username] === "sent" ? <><Check className="w-4 h-4" />{tr("Đã mời", "Sent", "已邀請")}</> : <><Send className="w-4 h-4" />{tr("Mời", "Invite", "邀請")}</>}
                    </button>
                  </div>
                ))
                : <p className="text-sm text-white/50 text-center py-6">{tr("Bạn chưa có bạn bè nào. Hãy gửi link bên dưới!", "No friends yet. Send the link below!", "你還沒有好友。傳送下方的連結吧！")}</p>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={share} className="rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500 flex items-center justify-center gap-2" data-testid="darts-share-link"><Share2 className="w-4 h-4" />{tr("Chia sẻ link", "Share link", "分享連結")}</button>
              <button type="button" onClick={copy} className="rounded-2xl py-3 font-bold text-white/85 bg-white/5 border border-white/10 flex items-center justify-center gap-2"><Copy className="w-4 h-4" />{tr("Sao chép", "Copy", "複製")}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
