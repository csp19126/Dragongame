import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Flag, Loader2, MessageCircle, X } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { Avatar } from "@/components/Avatar";
import { PhotoUploader } from "@/components/PhotoUploader";
import type { PlayerProfile } from "@shared/social";

const PlayerSheetContext = createContext<(username: string) => void>(() => {});

/** Opens a player's profile sheet from anywhere: `const showPlayer = usePlayerSheet(); showPlayer(name)` */
export const usePlayerSheet = () => useContext(PlayerSheetContext);

export function PlayerSheetProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <PlayerSheetContext.Provider value={setName}>
      {children}
      {createPortal(<AnimatePresence>{name && <PlayerSheet key={name} username={name} onClose={() => setName(null)} />}</AnimatePresence>, document.body)}
    </PlayerSheetContext.Provider>
  );
}

/** A tappable player name (opens their profile) */
export function PlayerName({ username, className = "", children }: { username: string; className?: string; children?: ReactNode }) {
  const show = usePlayerSheet();
  return (
    <button type="button" onClick={() => show(username)} className={`text-left hover:underline underline-offset-2 ${className}`} data-testid={`player-${username}`}>
      {children ?? username}
    </button>
  );
}

export const profileKey = (username: string) => [`/api/players/${encodeURIComponent(username)}/profile`];

function PlayerSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const { tr, loc, locale, srv } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const q = useQuery<PlayerProfile>({ queryKey: profileKey(username) });
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const p = q.data;

  const fail = (e: unknown) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" });
  const block = async () => {
    if (!p) return;
    const next = !p.blockedByYou;
    if (next && !confirm(tr(`Chặn ${p.username}? Hai bạn sẽ không nhắn tin riêng được cho nhau.`, `Block ${p.username}? Neither of you will be able to send private messages to the other.`, `要封鎖 ${p.username} 嗎？你們將無法互傳私訊。`))) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/players/${encodeURIComponent(p.username)}/block`, { block: next });
      queryClient.setQueryData(profileKey(username), { ...p, blockedByYou: next });
      queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/dm/") });
      toast({ title: next ? tr("Đã chặn", "Blocked", "已封鎖") : tr("Đã bỏ chặn", "Unblocked", "已解除封鎖") });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const report = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/players/${encodeURIComponent(p.username)}/report`, { reason: reason.trim() || undefined });
      toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") });
      setReporting(false); setReason("");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const message = () => { onClose(); setLocation(`/community?tab=dm&dm=${encodeURIComponent(username)}`); };

  const stat = (label: string, value: ReactNode, testid: string) => (
    <div className="rounded-xl bg-black/30 border border-white/5 px-2 py-2 text-center">
      <div className="text-[10px] font-black uppercase tracking-wide text-white/45 leading-tight">{label}</div>
      <div className="font-black text-yellow-200 text-sm mt-0.5 [overflow-wrap:anywhere]" data-testid={testid}>{value}</div>
    </div>
  );

  return (
    <motion.div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-gradient-to-b from-[#24103f] to-[#140b26] border border-yellow-500/30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        data-testid="player-sheet">
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-2 sm:hidden" />
        <div className="flex justify-end -mb-6"><button type="button" onClick={onClose} className="p-2 text-white/50" aria-label={tr("Đóng", "Close", "關閉")} data-testid="button-sheet-close"><X className="w-5 h-5" /></button></div>
        {!p ? (
          q.isError ? <p className="text-center text-white/60 py-12">{srv((q.error as Error).message)}</p> : <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mx-auto my-16" />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Avatar user={p} size={112} ring online={p.online} />
            <div className="text-center -mt-1">
              <div className="font-display text-2xl text-yellow-100 leading-tight break-all" data-testid="sheet-username">{p.admin && "🛡️ "}{p.username}</div>
              <div className={`text-xs font-bold ${p.online ? "text-emerald-300" : "text-white/45"}`}>{p.online ? tr("Đang online", "Online now", "在線上") : tr("Ngoại tuyến", "Offline", "離線")}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full">
              {stat(tr("Tham gia", "Joined", "加入"), p.memberSince ? new Date(p.memberSince).toLocaleDateString(locale, { month: "short", year: "numeric" }) : "—", "sheet-joined")}
              {stat(tr("Đã chơi", "Games", "已玩局數"), fmtCoins(p.gamesPlayed), "sheet-games")}
              {stat(tr("Thắng lớn nhất", "Biggest win", "最大贏額"), `${fmtCoins(p.biggestWin)} 🪙`, "sheet-maxwin")}
              {stat(tr("Giải bi-a", "Pool league", "撞球聯賽"), p.league ? `${p.league.icon} ${loc(p.league)}` : "—", "sheet-league")}
              {stat(tr("Sticker", "Stickers", "貼圖"), `📒 ${p.stickers}`, "sheet-stickers")}
              {stat(tr("Hạng", "Rank", "身分"), p.admin ? tr("Quản trị", "Admin", "管理員") : tr("Người chơi", "Player", "玩家"), "sheet-role")}
            </div>

            {p.you ? (
              <div className="w-full rounded-2xl bg-black/30 border border-white/10 p-3">
                <p className="text-xs font-black text-white/60 mb-2 text-center">{tr("Đây là bạn", "This is you", "這是你")}</p>
                <PhotoUploader compact />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button type="button" onClick={message} className="col-span-3 h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black flex items-center justify-center gap-2 active:scale-[0.98]" data-testid="button-sheet-message">
                    <MessageCircle className="w-5 h-5" />{tr("Nhắn tin", "Message", "傳訊息")}
                  </button>
                  <button type="button" disabled={busy} onClick={block} className={`col-span-2 h-11 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 ${p.blockedByYou ? "bg-emerald-600/25 text-emerald-200 border border-emerald-400/30" : "bg-white/10 text-white/85"}`} data-testid="button-sheet-block">
                    <Ban className="w-4 h-4" />{p.blockedByYou ? tr("Bỏ chặn", "Unblock", "解除封鎖") : tr("Chặn", "Block", "封鎖")}
                  </button>
                  <button type="button" onClick={() => setReporting((v) => !v)} className="h-11 rounded-xl bg-red-600/20 text-red-200 border border-red-400/25 font-black text-sm flex items-center justify-center gap-1.5" data-testid="button-sheet-report">
                    <Flag className="w-4 h-4" />{tr("Báo cáo", "Report", "檢舉")}
                  </button>
                </div>
                {reporting && (
                  <div className="w-full rounded-2xl bg-black/30 border border-red-400/20 p-3 flex flex-col gap-2" data-testid="report-form">
                    <p className="text-xs text-white/70">{tr("Báo cáo ảnh hoặc hồ sơ này (ảnh nhạy cảm, ảnh người khác, tên xúc phạm…)", "Report this photo or profile (explicit, someone else's photo, offensive name…)", "檢舉這張照片或個人檔案（不雅內容、盜用他人照片、冒犯性名稱…）")}</p>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={tr("Lý do (không bắt buộc)", "Reason (optional)", "原因（選填）")}
                      className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2.5 text-white text-sm placeholder:text-white/30" data-testid="input-report-reason" />
                    <button type="button" disabled={busy} onClick={report} className="h-10 rounded-xl bg-red-600 text-white font-black text-sm disabled:opacity-50" data-testid="button-report-send">{tr("Gửi báo cáo", "Send report", "送出檢舉")}</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
