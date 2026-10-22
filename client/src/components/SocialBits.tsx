import { motion } from "framer-motion";
import { CornerUpLeft, X } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { STICKER_BY_ID } from "@shared/stickers";
import { PLAYABLE_BY_ID, REACTIONS, type ReactionCount, type ReplyRef } from "@shared/friends";

/** A player's level, as a small gold pill next to their name */
export function LevelBadge({ level, className = "" }: { level: number | null | undefined; className?: string }) {
  const { tr } = useLang();
  if (!level) return null;
  const tone = level >= 50 ? "from-fuchsia-400 to-purple-600 text-white" : level >= 20 ? "from-yellow-300 to-orange-500 text-black" : level >= 10 ? "from-sky-300 to-blue-500 text-black" : "from-white/30 to-white/10 text-white/90";
  return (
    <span className={`inline-flex items-center shrink-0 rounded-full bg-gradient-to-b ${tone} px-1.5 h-4 text-[9px] font-black leading-none align-middle ${className}`} title={tr(`Cấp ${level}`, `Level ${level}`, `等級 ${level}`)} data-testid="level-badge">
      {tr(`Cấp ${level}`, `Lv ${level}`, `Lv.${level}`)}
    </span>
  );
}

/** The name of a game a player is on, in the player's language */
export function useGameName() {
  const { loc } = useLang();
  return (id: string | null | undefined) => {
    const g = id ? PLAYABLE_BY_ID.get(id) : undefined;
    return g ? `${g.icon} ${loc(g)}` : null;
  };
}

/** "3 min ago" style times */
export function useAgo() {
  const { tr, locale } = useLang();
  return (iso: string) => {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 45) return tr("vừa xong", "just now", "剛剛");
    const m = Math.round(s / 60);
    if (m < 60) return tr(`${m} phút trước`, `${m} min ago`, `${m} 分鐘前`);
    const h = Math.round(m / 60);
    if (h < 24) return tr(`${h} giờ trước`, `${h} h ago`, `${h} 小時前`);
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  };
}

/** The quoted message above a reply (tap to jump to it) */
export function QuoteBlock({ reply, onJump, mine, compact }: { reply: ReplyRef; onJump?: (id: number) => void; mine?: boolean; compact?: boolean }) {
  const { tr, loc } = useLang();
  const st = reply.sticker ? STICKER_BY_ID.get(reply.sticker) : null;
  const gone = !reply.text && !reply.sticker;
  const who = reply.username ?? (reply.mine ? tr("Bạn", "You", "你") : null);
  return (
    <button type="button" onClick={() => onJump?.(reply.id)} disabled={gone || !onJump}
      className={`w-full max-w-[16rem] text-left rounded-lg border-l-[3px] px-2 py-1 ${compact ? "" : "mb-0.5"} ${mine ? "bg-black/15 border-black/40" : "bg-white/[0.07] border-yellow-400/70"}`} data-testid={`quote-${reply.id}`}>
      {who && <span className={`block text-[10px] font-black truncate ${mine ? "text-black/70" : "text-yellow-300/90"}`}>{who}</span>}
      <span className={`block text-[11px] leading-tight truncate ${mine ? "text-black/70" : "text-white/60"} ${gone ? "italic" : ""}`}>
        {gone ? tr("Tin nhắn đã bị xoá", "Message removed", "訊息已刪除") : st ? `${st.emoji} ${loc(st)}` : reply.text}
      </span>
    </button>
  );
}

/** The bar above the composer while replying */
export function ReplyingBar({ reply, onCancel }: { reply: ReplyRef; onCancel: () => void }) {
  const { tr } = useLang();
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/50 border border-yellow-400/30 px-2 py-1.5" data-testid="replying-bar">
      <CornerUpLeft className="w-4 h-4 text-yellow-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="block text-[10px] font-black text-yellow-300">{tr("Đang trả lời", "Replying to", "回覆")} {reply.username ?? (reply.mine ? tr("chính bạn", "yourself", "你自己") : "")}</span>
        <QuoteBlock reply={reply} compact />
      </div>
      <button type="button" onClick={onCancel} className="p-1.5 text-white/60" aria-label={tr("Huỷ", "Cancel", "取消")} data-testid="button-cancel-reply"><X className="w-4 h-4" /></button>
    </div>
  );
}

/** Reaction counts under a message; tapping one toggles your own */
export function ReactionChips({ reactions, onToggle, mine }: { reactions: ReactionCount[]; onToggle: (e: string) => void; mine?: boolean }) {
  if (!reactions.length) return null;
  const order = (e: string) => (REACTIONS as readonly string[]).indexOf(e);
  return (
    <div className={`flex flex-wrap gap-1 mt-0.5 ${mine ? "justify-end" : ""}`}>
      {[...reactions].sort((a, b) => order(a.e) - order(b.e)).map((r) => (
        <motion.button key={r.e} type="button" initial={{ scale: 0.6 }} animate={{ scale: 1 }} onClick={() => onToggle(r.e)}
          className={`h-6 px-1.5 rounded-full text-xs flex items-center gap-0.5 border ${r.mine ? "bg-yellow-400/25 border-yellow-300/70 text-yellow-100" : "bg-white/10 border-white/10 text-white/80"}`} data-testid={`reaction-${r.e}`}>
          <span>{r.e}</span><span className="font-black text-[10px]">{r.n}</span>
        </motion.button>
      ))}
    </div>
  );
}

/** The row that opens when a message is tapped: the six reactions and Reply */
export function MessageActions({ onReact, onReply, extra, mine }: { onReact: (e: string) => void; onReply?: () => void; extra?: React.ReactNode; mine?: boolean }) {
  const { tr } = useLang();
  return (
    <motion.div initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex items-center gap-0.5 rounded-full bg-[#2a1748] border border-yellow-400/40 shadow-xl px-1 py-0.5 mt-1 ${mine ? "self-end" : "self-start"}`} data-testid="message-actions">
      {REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onReact(e)} className="w-8 h-8 text-lg rounded-full active:scale-90 hover:bg-white/10" aria-label={e} data-testid={`react-${e}`}>{e}</button>
      ))}
      {onReply && (
        <button type="button" onClick={onReply} className="h-8 px-2 rounded-full text-[11px] font-black text-yellow-200 flex items-center gap-1 hover:bg-white/10" data-testid="button-reply">
          <CornerUpLeft className="w-3.5 h-3.5" />{tr("Trả lời", "Reply", "回覆")}
        </button>
      )}
      {extra}
    </motion.div>
  );
}

/** Applies a pushed reaction change to a message's counts */
export function applyReaction(list: ReactionCount[], e: string, on: boolean, byMe: boolean): ReactionCount[] {
  const cur = list.find((r) => r.e === e);
  if (on) {
    if (cur) return list.map((r) => (r.e === e ? { ...r, n: r.n + 1, mine: r.mine || byMe } : r));
    return [...list, { e, n: 1, mine: byMe }];
  }
  if (!cur) return list;
  return list.flatMap((r) => (r.e !== e ? [r] : r.n <= 1 ? [] : [{ ...r, n: r.n - 1, mine: byMe ? false : r.mine }]));
}
