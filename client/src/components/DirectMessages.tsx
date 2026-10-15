import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Ban, Check, CheckCheck, Clock, Flag, Loader2, Lock, Mail, Search, Send, ShieldAlert, Smile, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet, profileKey } from "@/components/PlayerSheet";
import { DM_UNREAD_KEY } from "@/hooks/use-dm";
import { STICKERS, STICKER_BY_ID, type AlbumView } from "@shared/stickers";
import { DM_MAX_LEN, SOCIAL_MIN_GAMES, type DmConversation, type DmMessage, type DmThread } from "@shared/social";

const CONV_KEY = ["/api/dm/conversations"];

/** Private messages: the conversation list, or one conversation when `dm` is set */
export function DmTab({ dm, errs }: { dm: string | null; errs: Record<string, string> }) {
  return dm ? <Thread key={dm.toLowerCase()} username={dm} errs={errs} /> : <Conversations />;
}

function when(iso: string, locale: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function SafetyNote() {
  const { tr } = useLang();
  return (
    <p className="text-[10px] text-white/45 text-center flex items-center justify-center gap-1 leading-tight" data-testid="dm-safety">
      <ShieldAlert className="w-3 h-3 shrink-0 text-yellow-400/70" />
      {tr("Không bao giờ chia sẻ mật khẩu. Mua bán xu là bị cấm.", "Never share your password. Buying or selling coins isn't allowed.", "絕不要分享你的密碼。禁止買賣金幣。")}
    </p>
  );
}

// ---------------- Conversation list ----------------

function Conversations() {
  const { tr, locale, loc } = useLang();
  const [, setLocation] = useLocation();
  const showPlayer = usePlayerSheet();
  const q = useQuery<{ conversations: DmConversation[] }>({ queryKey: CONV_KEY, refetchInterval: 8_000, staleTime: 0 });
  const [to, setTo] = useState("");
  const open = (name: string) => setLocation(`/community?tab=dm&dm=${encodeURIComponent(name)}`);

  return (
    <div className="w-full flex flex-col gap-2" data-testid="dm-list">
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (to.trim()) open(to.trim()); }}>
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-black/50 border border-white/15 px-3">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={24} placeholder={tr("Nhắn cho… (tên người chơi)", "Message… (player name)", "傳訊息給…（玩家帳號）")}
            className="flex-1 min-w-0 h-11 bg-transparent text-white placeholder:text-white/30 outline-none" data-testid="input-dm-to" />
        </div>
        <button type="submit" disabled={!to.trim()} className="w-11 h-11 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={tr("Mở", "Open", "開啟")} data-testid="button-dm-open"><Send className="w-5 h-5" /></button>
      </form>

      <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
        {!q.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-10" /> : q.data.conversations.length === 0 ? (
          <div className="px-4 py-10 text-center flex flex-col items-center gap-2" data-testid="dm-empty">
            <Mail className="w-10 h-10 text-yellow-400/60" />
            <p className="text-sm text-white/70 font-bold">{tr("Chưa có tin nhắn riêng", "No private messages yet", "還沒有私訊")}</p>
            <p className="text-xs text-white/45">{tr("Bấm vào tên hoặc ảnh của ai đó trong phòng chat để nhắn riêng.", "Tap someone's name or photo in the chat room to message them.", "在聊天室點選玩家的名稱或頭像即可傳私訊。")}</p>
          </div>
        ) : q.data.conversations.map((c) => {
          const st = c.last.sticker ? STICKER_BY_ID.get(c.last.sticker) : null;
          const preview = st ? `${st.emoji} ${loc(st)}` : c.last.text ?? "";
          return (
            <div key={c.username} className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 ${c.unread ? "bg-yellow-400/[0.06]" : ""}`} data-testid={`dm-conv-${c.username}`}>
              <Avatar user={c} size={46} online={c.online} onClick={() => showPlayer(c.username)} />
              <button type="button" onClick={() => open(c.username)} className="flex-1 min-w-0 text-left active:opacity-70">
                <div className="flex items-baseline gap-2">
                  <span className={`flex-1 truncate ${c.unread ? "font-black text-white" : "font-bold text-white/90"}`}>{c.username}</span>
                  <span className={`text-[10px] shrink-0 ${c.unread ? "text-yellow-300 font-bold" : "text-white/40"}`}>{when(c.last.at, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`flex-1 truncate text-xs ${c.unread ? "text-white font-semibold" : "text-white/50"}`}>{c.last.mine && <span className="text-white/40">{tr("Bạn: ", "You: ", "你：")}</span>}{preview}</span>
                  {c.unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">{c.unread}</span>}
                </div>
              </button>
            </div>
          );
        })}
      </div>
      <SafetyNote />
    </div>
  );
}

// ---------------- One conversation ----------------

type ThreadResp = DmThread & { readUpTo: number };

function Thread({ username, errs }: { username: string; errs: Record<string, string> }) {
  const { user } = useAuth();
  const { tr, locale, loc, srv } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const showPlayer = usePlayerSheet();
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [info, setInfo] = useState<Omit<ThreadResp, "messages"> | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportFor, setReportFor] = useState<DmMessage | null>(null);
  const [loadingOld, setLoadingOld] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"] });
  const ownedStickers = useMemo(() => STICKERS.filter((s) => (album.data?.owned[s.id] ?? 0) > 0), [album.data]);
  const path = `/api/dm/thread/${encodeURIComponent(username)}`;

  const nearBottom = () => { const el = listRef.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const toBottom = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const markRead = useCallback(async () => {
    try {
      const r = await (await apiRequest("POST", "/api/dm/read", { with: username })).json();
      queryClient.setQueryData(DM_UNREAD_KEY, { total: r.total });
      queryClient.invalidateQueries({ queryKey: CONV_KEY });
    } catch { /* try again on the next poll */ }
  }, [username]);

  const merge = useCallback((r: ThreadResp, first: boolean) => {
    const stick = first || nearBottom();
    const { messages, ...rest } = r;
    setInfo(rest);
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const next = [...cur, ...messages.filter((m) => !seen.has(m.id))].map((m) => (m.mine && m.id <= r.readUpTo ? { ...m, read: true } : m));
      if (next.length) lastId.current = Math.max(lastId.current, next[next.length - 1].id);
      return next;
    });
    if (messages.some((m) => !m.mine)) {
      if (!first) soundManager.buttonClick();
      void markRead();
    }
    if (stick && messages.length) toBottom();
  }, [markRead]);

  // Poll every 3 s while the conversation is open and the page is visible
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const poll = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const first = lastId.current === 0;
          const res = await fetch(`${path}${first ? "" : `?after=${lastId.current}`}`, { credentials: "include" });
          if (res.status === 404) { setMissing(true); return; }
          if (res.ok && !stop) merge(await res.json(), first);
        } catch { /* offline: try again */ }
      }
      timer = window.setTimeout(poll, 3000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [merge, path]);

  const loadOlder = async () => {
    if (!msgs.length) return;
    setLoadingOld(true);
    const el = listRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const r: ThreadResp = await (await fetch(`${path}?before=${msgs[0].id}`, { credentials: "include" })).json();
      setMsgs((cur) => [...r.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]);
      setInfo((i) => (i ? { ...i, more: r.more } : i));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - fromBottom; });
    } finally { setLoadingOld(false); }
  };

  const send = async (body: { text?: string; sticker?: string }) => {
    setSending(true);
    try {
      const m: DmMessage = await (await apiRequest("POST", "/api/dm/send", { to: username, ...body })).json();
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      lastId.current = Math.max(lastId.current, m.id);
      setText(""); setTray(false); toBottom();
      soundManager.coinDrop();
      queryClient.invalidateQueries({ queryKey: CONV_KEY });
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      toast({ title: errs[code] ?? srv(code), variant: "destructive" });
      if (code === "Can't message this player") setInfo((i) => (i ? { ...i, cantMessage: true } : i));
    } finally { setSending(false); }
  };

  const unblock = async () => {
    try {
      await apiRequest("POST", `/api/players/${encodeURIComponent(username)}/block`, { block: false });
      queryClient.invalidateQueries({ queryKey: profileKey(username) });
      const r: ThreadResp = await (await fetch(path, { credentials: "include" })).json();
      const { messages: _m, ...rest } = r;
      setInfo(rest);
    } catch (e) { toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }); }
  };

  const peer = info?.peer ?? { username, avatarUrl: null, online: false };
  const muted = user?.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now() ? user.mutedUntil : null;
  const needGames = user && !user.isAdmin && user.gamesPlayed < SOCIAL_MIN_GAMES ? SOCIAL_MIN_GAMES - user.gamesPlayed : 0;

  if (missing) return (
    <div className="w-full rounded-2xl bg-black/40 border border-white/10 p-6 text-center flex flex-col items-center gap-3" data-testid="dm-missing">
      <p className="text-white/70">{srv("Player not found")}</p>
      <button type="button" onClick={() => setLocation("/community?tab=dm")} className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{tr("Quay lại", "Back", "返回")}</button>
    </div>
  );

  // Day headers between messages from different days
  let lastDay = "";
  return (
    <div className="w-full flex flex-col gap-2" data-testid="dm-thread">
      <div className="flex items-center gap-2 rounded-2xl bg-black/40 border border-white/10 px-2 py-1.5">
        <button type="button" onClick={() => setLocation("/community?tab=dm")} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/80 active:bg-white/10" aria-label={tr("Quay lại", "Back", "返回")} data-testid="button-dm-back"><ArrowLeft className="w-5 h-5" /></button>
        <Avatar user={peer} size={38} online={peer.online} onClick={() => showPlayer(peer.username)} />
        <button type="button" onClick={() => showPlayer(peer.username)} className="flex-1 min-w-0 text-left">
          <div className="font-black text-white truncate" data-testid="dm-peer">{peer.username}</div>
          <div className={`text-[11px] ${peer.online ? "text-emerald-300" : "text-white/45"}`}>{peer.online ? tr("Đang online", "Online now", "在線上") : tr("Ngoại tuyến", "Offline", "離線")}</div>
        </button>
      </div>

      <div ref={listRef} className={`${tray ? "h-[calc(100dvh-470px)] min-h-[170px]" : "h-[calc(100dvh-350px)] min-h-[280px]"} overflow-y-auto overscroll-contain rounded-2xl bg-black/40 border border-white/10 p-2.5 flex flex-col gap-1`} data-testid="dm-messages">
        {info?.more && (
          <button type="button" disabled={loadingOld} onClick={loadOlder} className="self-center text-[11px] font-bold text-yellow-300/80 px-3 py-1 rounded-full bg-white/5 mb-1">
            {loadingOld ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tr("Xem tin cũ hơn", "Load older messages", "載入更早的訊息")}
          </button>
        )}
        {!info && <Loader2 className="w-8 h-8 animate-spin text-yellow-400 m-auto" />}
        {info && msgs.length === 0 && (
          <div className="m-auto text-center flex flex-col items-center gap-2 px-6">
            <Avatar user={peer} size={64} />
            <p className="text-sm text-white/60">{tr(`Gửi lời chào đến ${peer.username}! 👋`, `Say hello to ${peer.username}! 👋`, `跟 ${peer.username} 打聲招呼吧！👋`)}</p>
          </div>
        )}
        {msgs.map((m, i) => {
          const day = new Date(m.createdAt).toDateString();
          const header = day !== lastDay ? new Date(m.createdAt).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) : null;
          lastDay = day;
          const next = msgs[i + 1];
          const lastOfGroup = !next || next.mine !== m.mine || new Date(next.createdAt).toDateString() !== day;
          const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
          return (
            <div key={m.id} className="flex flex-col">
              {header && <div className="self-center my-1.5 text-[10px] font-bold text-white/40 bg-white/5 rounded-full px-2.5 py-0.5">{header}</div>}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`group flex items-end gap-1.5 max-w-[85%] ${m.mine ? "self-end flex-row-reverse" : "self-start"}`} data-testid={`dm-msg-${m.id}`}>
                {!m.mine && (lastOfGroup ? <Avatar user={peer} size={26} onClick={() => showPlayer(peer.username)} /> : <span className="w-[26px] shrink-0" />)}
                <div className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  {st ? (
                    <div className="text-5xl leading-none py-1" title={loc(st)}>{st.emoji}</div>
                  ) : (
                    <div className={`px-3 py-1.5 rounded-2xl text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${m.mine ? `bg-gradient-to-b from-yellow-400 to-orange-500 text-black ${lastOfGroup ? "rounded-br-md" : ""}` : `bg-white/10 text-white ${lastOfGroup ? "rounded-bl-md" : ""}`}`}>{m.text}</div>
                  )}
                  {lastOfGroup && (
                    <span className="text-[9px] text-white/40 px-1 mt-0.5 flex items-center gap-0.5">
                      {new Date(m.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      {m.mine && (m.read ? <CheckCheck className="w-3 h-3 text-sky-300" aria-label={tr("Đã xem", "Seen", "已讀")} /> : <Check className="w-3 h-3" aria-label={tr("Đã gửi", "Sent", "已送出")} />)}
                    </span>
                  )}
                </div>
                {!m.mine && (
                  <button type="button" onClick={() => setReportFor(m)} className="opacity-30 hover:opacity-100 p-1 self-center" aria-label={tr("Báo cáo", "Report", "檢舉")} data-testid={`button-dm-report-${m.id}`}>
                    <Flag className="w-3 h-3 text-white" />
                  </button>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {tray && (
        <div className="rounded-2xl bg-black/60 border border-white/10 p-2" data-testid="dm-sticker-tray">
          {ownedStickers.length === 0 ? <p className="text-xs text-white/50">{tr("Bạn chưa có sticker nào. Mở gói trong Album!", "No stickers yet. Open a pack in the Album!", "你還沒有貼圖。到圖鑑開卡包吧！")}</p> : (
            <div className="grid grid-cols-6 gap-1.5 max-h-36 overflow-y-auto">
              {ownedStickers.map((s) => (
                <button key={s.id} type="button" disabled={sending} onClick={() => send({ sticker: s.id })} className="text-3xl rounded-xl bg-white/5 py-1 active:scale-90" data-testid={`dm-tray-${s.id}`}>{s.emoji}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {info?.cantMessage ? (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-center text-sm text-white/70 flex items-center justify-center gap-2 flex-wrap" data-testid="dm-blocked">
          <Ban className="w-4 h-4" />{srv("Can't message this player")}
          {info.blockedByYou && <button type="button" onClick={unblock} className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs font-black" data-testid="button-dm-unblock">{tr("Bỏ chặn", "Unblock", "解除封鎖")}</button>}
        </div>
      ) : muted ? (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-center text-sm text-white/70 flex items-center justify-center gap-2"><Clock className="w-4 h-4" />{errs.muted}</div>
      ) : needGames ? (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-center text-sm text-white/70 flex items-center justify-center gap-2" data-testid="dm-locked">
          <Lock className="w-4 h-4" />{tr(`Chơi thêm ${needGames} ván để nhắn tin`, `Play ${needGames} more game${needGames === 1 ? "" : "s"} to send messages`, `再玩 ${needGames} 局即可傳訊息`)}
        </div>
      ) : (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
          <button type="button" onClick={() => setTray((v) => !v)} className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tray ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`} aria-label={tr("Sticker", "Stickers", "貼圖")} data-testid="button-dm-stickers">
            <Smile className="w-5 h-5" />
          </button>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={DM_MAX_LEN} placeholder={tr("Nhắn tin…", "Message…", "輸入訊息…")} enterKeyHint="send"
            className="flex-1 min-w-0 rounded-xl bg-[#140b26] border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-dm" />
          <button type="submit" disabled={sending || !text.trim()} className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={tr("Gửi", "Send", "發送")} data-testid="button-dm-send">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      )}
      <SafetyNote />

      <AnimatePresence>{reportFor && <ReportMessage m={reportFor} onClose={() => setReportFor(null)} />}</AnimatePresence>
    </div>
  );
}

function ReportMessage({ m, onClose }: { m: DmMessage; onClose: () => void }) {
  const { tr, loc, srv } = useLang();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
  const send = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", `/api/dm/${m.id}/report`, { reason: reason.trim() || undefined });
      toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") });
      onClose();
    } catch (e) { toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <motion.div className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} className="w-full max-w-xs rounded-2xl bg-[#1a0a2e] border border-red-400/40 p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="dm-report-dialog">
        <div className="flex items-center justify-between">
          <span className="font-black text-red-200 flex items-center gap-1.5"><Flag className="w-4 h-4" />{tr("Báo cáo tin nhắn", "Report message", "檢舉訊息")}</span>
          <button type="button" onClick={onClose} aria-label={tr("Đóng", "Close", "關閉")}><X className="w-5 h-5 text-white/60" /></button>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/85 break-words">{st ? `${st.emoji} ${loc(st)}` : m.text}</div>
        <p className="text-[11px] text-white/55">{tr("Quản trị viên sẽ đọc tin nhắn này và vài tin trước đó để xử lý.", "An admin will read this message and the few before it to decide what to do.", "管理員會查看這則訊息及前幾則訊息來處理。")}</p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={tr("Lý do (không bắt buộc)", "Reason (optional)", "原因（選填）")}
          className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2.5 text-white text-sm placeholder:text-white/30" data-testid="input-dm-report-reason" />
        <button type="button" disabled={busy} onClick={send} className="h-10 rounded-xl bg-red-600 text-white font-black text-sm disabled:opacity-50" data-testid="button-dm-report-send">{tr("Gửi báo cáo", "Send report", "送出檢舉")}</button>
      </motion.div>
    </motion.div>
  );
}
