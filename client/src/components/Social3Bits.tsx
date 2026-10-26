import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { INVITE_GAMES, type ClubTag, type InviteGame } from "@shared/social3";

/** A club's tag next to a player's name: emblem + short tag on the club's colour */
export function ClubTagChip({ club, className = "", onClick }: { club: ClubTag | null | undefined; className?: string; onClick?: () => void }) {
  if (!club) return null;
  const body = (
    <span className={`inline-flex items-center gap-0.5 shrink-0 rounded-md px-1 h-4 text-[9px] font-black leading-none align-middle border ${className}`}
      style={{ background: `${club.color}33`, borderColor: `${club.color}99`, color: club.color }} data-testid="club-tag">
      <span className="text-[10px]">{club.emblem}</span>{club.tag}
    </span>
  );
  if (!onClick) return body;
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="shrink-0">{body}</button>;
}

/** The name of a game players can be invited to, with its icon */
export function useInviteGameName() {
  const { tr } = useLang();
  return (g: string) => {
    const x = INVITE_GAMES[g as InviteGame];
    return x ? `${x.icon} ${tr(x.vi, x.en, x.zh)}` : g;
  };
}

/** Turns a server refusal into words: the chat-style codes first, then the translated messages */
export function useSocialErr() {
  const { tr, srv } = useLang();
  return (e: unknown): string => {
    const code = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
    switch (code) {
      case "slow_down": return tr("Chậm lại một chút nhé…", "Slow down a little…", "慢一點喔…");
      case "repeat": return tr("Bạn vừa gửi nội dung này rồi.", "You just sent that.", "你剛剛已經發過了。");
      case "link": return tr("Không được gửi đường link.", "Links aren't allowed.", "不能發送連結。");
      case "phone": return tr("Không được gửi số điện thoại.", "Phone numbers aren't allowed.", "不能發送電話號碼。");
      case "trade": return tr("Xu chỉ để chơi: không được mua bán xu hay nói chuyện tiền thật.", "Coins are for play only: no buying, selling or real-money talk.", "金幣僅供遊戲使用：禁止買賣金幣或談論真錢交易。");
      case "long": return tr("Nội dung quá dài.", "That's too long.", "內容太長了。");
      case "empty": return tr("Chưa có nội dung.", "Nothing to post.", "內容是空的。");
      case "muted": return tr("Bạn đang bị tạm khóa chat.", "You're muted for now.", "你目前被暫時禁言。");
      case "play_first": return tr("Chơi vài ván trước đã nhé.", "Play a few games first.", "先玩幾局再來吧。");
      case "not_owned": return tr("Bạn không có sticker này.", "You don't have that sticker.", "你沒有這張貼圖。");
      default: return srv(code);
    }
  };
}

/** POST /api/invites (the contract shared with the game pages) */
export async function sendInvite(to: string, game: InviteGame, path: string) {
  await apiRequest("POST", "/api/invites", { to, game, path });
}

/** A path from an invite is only followed if it stays on this site */
export const safeInternalPath = (p: unknown): p is string => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\");

/** The bottom sheet used by the Social 3 screens (same look as the profile sheet) */
export function Sheet({ title, icon, onClose, children, testid, tall }: { title: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; testid?: string; tall?: boolean }) {
  const { tr } = useLang();
  return (
    <motion.div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md ${tall ? "h-[88vh]" : "max-h-[88vh]"} flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-gradient-to-b from-[#24103f] to-[#140b26] border border-yellow-500/30 shadow-2xl pb-[env(safe-area-inset-bottom)]`} data-testid={testid}>
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mt-2 sm:hidden" />
        <div className="flex items-center gap-2 px-4 pt-2 pb-2 border-b border-white/10">
          {icon}
          <h2 className="font-display text-xl text-yellow-100 flex-1 min-w-0 truncate">{title}</h2>
          <button type="button" onClick={onClose} className="p-2 text-white/60" aria-label={tr("Đóng", "Close", "關閉")} data-testid="button-sheet3-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </motion.div>
    </motion.div>
  );
}
