import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Camera, EyeOff, Flag, Loader2, X } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { FRIENDS_KEY } from "@/hooks/use-social";
import { INVITE_GAMES, COUNTRY_BY_CODE, type ClubTag, type InviteGame, type PlayerFacts } from "@shared/social3";
import type { FriendsView } from "@shared/friends";

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

// ---------------- Profile facts: country, languages, play style ----------------

export function useLangName() {
  const { tr } = useLang();
  return (l: string) => ({ vi: "Tiếng Việt", en: "English", zh: "中文", other: tr("Khác", "Other", "其他") } as Record<string, string>)[l] ?? l;
}
export function usePlayStyleName() {
  const { tr } = useLang();
  return (s: string) => (s === "competitive" ? tr("🔥 Thi đấu", "🔥 Competitive", "🔥 競技") : tr("😌 Thư giãn", "😌 Casual", "😌 休閒"));
}

/** One short line: 🇬🇧 · VI EN · 🔥 Competitive (only what the player chose to share) */
export function FactsLine({ facts, className = "" }: { facts?: PlayerFacts | null; className?: string }) {
  const { loc } = useLang();
  const styleName = usePlayStyleName();
  if (!facts) return null;
  const c = facts.country ? COUNTRY_BY_CODE.get(facts.country) : null;
  const parts: ReactNode[] = [];
  if (c) parts.push(<span key="c" title={loc(c)}>{c.flag}</span>);
  if (facts.languages.length) parts.push(<span key="l" className="font-black tracking-wide">{facts.languages.map((l) => (l === "other" ? "+" : l.toUpperCase())).join(" ")}</span>);
  if (facts.playStyle) parts.push(<span key="s">{styleName(facts.playStyle)}</span>);
  if (!parts.length) return null;
  return <span className={`inline-flex items-center gap-1.5 text-[10px] text-white/55 ${className}`} data-testid="facts-line">{parts.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span className="text-white/25">·</span>}{p}</span>)}</span>;
}

// ---------------- Photos in messages ----------------

const SETTINGS_KEY = ["/api/social/settings"];

/** Shrinks and re-encodes a picked photo through a canvas (drops EXIF/location), then uploads it */
export async function uploadMessagePhoto(file: File, target: { scope: "dm"; to: string } | { scope: "club" | "lounge" | "talk" }): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Photo must be a JPEG, PNG or WebP image")); i.src = url; });
    const max = 1280;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let q = 0.82;
    let data = canvas.toDataURL("image/jpeg", q);
    while (data.length > 760_000 && q > 0.4) { q -= 0.12; data = canvas.toDataURL("image/jpeg", q); }
    const r = await (await apiRequest("POST", "/api/photos", { ...target, photo: data })).json() as { id: number };
    return r.id;
  } finally { URL.revokeObjectURL(url); }
}

/** Should a photo from this player be blurred for me? (non-friends, unless I chose "Always show photos") */
export function usePhotoBlur() {
  const settings = useQuery<{ privacy: { showPhotos: boolean } }>({ queryKey: SETTINGS_KEY, staleTime: 60_000 });
  const friends = useQuery<FriendsView>({ queryKey: FRIENDS_KEY, staleTime: 30_000 });
  const names = new Set((friends.data?.friends ?? []).map((f) => f.username.toLowerCase()));
  return (from: { username: string; mine?: boolean; friend?: boolean }) =>
    !from.mine && !from.friend && !names.has(from.username.toLowerCase()) && !settings.data?.privacy.showPhotos;
}

/** A photo in a message: blurred with "Tap to view" when `blur`; tap again to open it big; report from there */
export function MessagePhoto({ id, blur, mine, className = "" }: { id: number; blur: boolean; mine?: boolean; className?: string }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [shown, setShown] = useState(!blur);
  const [big, setBig] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => { if (!blur) setShown(true); }, [blur]);
  if (gone) return <div className={`w-44 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[11px] text-white/45 ${className}`}>{tr("Ảnh đã bị xoá", "Photo removed", "照片已移除")}</div>;
  const report = async () => {
    try { await apiRequest("POST", `/api/photos/${id}/report`, {}); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); setBig(false); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); if (!shown) setShown(true); else setBig(true); }} className={`relative block overflow-hidden rounded-2xl border border-white/15 bg-black/40 ${className}`} data-testid={`photo-${id}`}>
        <img src={`/api/photos/${id}`} alt="" loading="lazy" onError={() => setGone(true)} className={`block max-w-[14rem] max-h-64 object-cover transition ${shown ? "" : "blur-2xl scale-110 opacity-80"}`} />
        {!shown && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white" data-testid="photo-blurred">
            <EyeOff className="w-6 h-6" />
            <span className="text-xs font-black">{tr("Chạm để xem", "Tap to view", "點一下查看")}</span>
          </span>
        )}
      </button>
      {big && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/90 flex flex-col items-center justify-center p-3" onClick={() => setBig(false)} data-testid="photo-viewer">
          <img src={`/api/photos/${id}`} alt="" className="max-w-full max-h-[80vh] rounded-xl" />
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {!mine && <button type="button" onClick={report} className="h-10 px-4 rounded-xl bg-red-600/30 border border-red-400/40 text-red-100 text-sm font-black flex items-center gap-1.5" data-testid="button-photo-report"><Flag className="w-4 h-4" />{tr("Báo cáo ảnh", "Report photo", "檢舉照片")}</button>}
            <button type="button" onClick={() => setBig(false)} className="h-10 px-4 rounded-xl bg-white/10 text-white text-sm font-black">{tr("Đóng", "Close", "關閉")}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** The 📷 button next to a message box: pick a photo, it's shrunk and uploaded, then `onPhoto(id)` */
export function PhotoPickButton({ target, onPhoto, disabled, className = "" }: { target: Parameters<typeof uploadMessagePhoto>[1]; onPhoto: (id: number) => void; disabled?: boolean; className?: string }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className={className || "w-11 h-11 shrink-0 rounded-xl bg-white/10 text-white flex items-center justify-center disabled:opacity-40"} aria-label={tr("Gửi ảnh", "Send a photo", "傳送照片")} data-testid="button-photo-pick">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { onPhoto(await uploadMessagePhoto(f, target)); } catch (x) { toast({ title: err(x), variant: "destructive" }); } finally { setBusy(false); }
      }} />
    </>
  );
}
