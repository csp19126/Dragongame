import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Flag, Loader2, MessageSquare, PenSquare, Send, ThumbsUp, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { useSocialEvent } from "@/hooks/use-social";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useAgo } from "@/components/SocialBits";
import { ClubTagChip, MessagePhoto, PhotoPickButton, Sheet, usePhotoBlur, useSocialErr } from "@/components/Social3Bits";
import { TALK_BOARDS, TALK_TITLE_MAX, TALK_BODY_MAX, TALK_REPLY_MAX, type TalkBoard, type TalkThreadView, type TalkReplyView } from "@shared/social3";

const boardOf = (id: string) => TALK_BOARDS.find((b) => b.id === id);
type Page = { items: TalkThreadView[]; more: boolean; next: string | null };

/** Community › Talk: the boards, one board's threads, or one thread */
export function TalkTab({ board, thread }: { board: string | null; thread: number | null }) {
  if (thread) return <ThreadView key={thread} id={thread} />;
  return <BoardView key={board ?? "all"} board={board && boardOf(board) ? (board as TalkBoard) : null} />;
}

function Author({ a, sub }: { a: TalkThreadView["author"]; sub?: string }) {
  const showPlayer = usePlayerSheet();
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); showPlayer(a.username); }} className="flex items-center gap-2 min-w-0 text-left">
      <Avatar user={a} size={28} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 min-w-0"><span className="text-xs font-black text-white/90 truncate">{a.username}</span><ClubTagChip club={a.club} /><LevelBadge level={a.level} /></span>
        {sub && <span className="block text-[10px] text-white/40">{sub}</span>}
      </span>
    </button>
  );
}

function BoardView({ board }: { board: TalkBoard | null }) {
  const { tr, loc } = useLang();
  const [, setLocation] = useLocation();
  const ago = useAgo();
  const boards = useQuery<{ boards: { id: string; threads: number; lastAt: string | null }[] }>({ queryKey: ["/api/talk/boards"], refetchInterval: 60_000 });
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const load = async (before?: string | null) => {
    setLoading(true);
    try {
      const r = await (await apiRequest("GET", `/api/talk/threads?${board ? `board=${board}&` : ""}${before ? `before=${encodeURIComponent(before)}` : ""}`)).json() as Page;
      setPage((cur) => (before && cur ? { ...r, items: [...cur.items, ...r.items.filter((x) => !cur.items.some((c) => c.id === x.id))] } : r));
    } catch { setPage((c) => c ?? { items: [], more: false, next: null }); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [board]); // eslint-disable-line react-hooks/exhaustive-deps
  useSocialEvent((m) => {
    if (m.t === "talk_thread" && (!board || m.item.board === board)) setPage((cur) => cur && (cur.items.some((x) => x.id === m.item.id) ? cur : { ...cur, items: [m.item, ...cur.items] }));
    else if (m.t === "talk_reply" && (!board || m.board === board)) setPage((cur) => {
      if (!cur) return cur;
      const t = cur.items.find((x) => x.id === m.threadId);
      return t ? { ...cur, items: [{ ...t, replies: m.replies, lastAt: m.lastAt }, ...cur.items.filter((x) => x.id !== m.threadId)] } : cur;
    });
    else if (m.t === "talk_removed") setPage((cur) => cur && { ...cur, items: cur.items.filter((x) => x.id !== m.threadId) });
  });
  const counts = new Map((boards.data?.boards ?? []).map((b) => [b.id, b.threads]));
  const b = board ? boardOf(board) : null;

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-talk">
      {/* Board chips: all + the eight boards */}
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={() => setLocation("/community?tab=talk")} className={`rounded-xl px-2 py-2 text-left border ${!board ? "bg-yellow-400 text-black border-yellow-300" : "bg-white/5 text-white/80 border-white/10"}`} data-testid="talk-board-all">
          <span className="block text-base leading-none">🗂️</span><span className="block text-[11px] font-black leading-tight mt-1">{tr("Mới nhất", "Latest", "最新")}</span>
        </button>
        {TALK_BOARDS.map((x) => (
          <button key={x.id} type="button" onClick={() => setLocation(`/community?tab=talk&board=${x.id}`)} className={`rounded-xl px-2 py-2 text-left border ${board === x.id ? "bg-yellow-400 text-black border-yellow-300" : "bg-white/5 text-white/80 border-white/10"}`} data-testid={`talk-board-${x.id}`}>
            <span className="flex items-center justify-between"><span className="text-base leading-none">{x.icon}</span><span className={`text-[9px] font-black ${board === x.id ? "text-black/60" : "text-white/40"}`}>{counts.get(x.id) ?? 0}</span></span>
            <span className="block text-[11px] font-black leading-tight mt-1">{loc(x)}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl text-yellow-100 truncate">{b ? `${b.icon} ${loc(b)}` : tr("Chủ đề mới nhất", "Latest threads", "最新話題")}</h2>
        <button type="button" onClick={() => setWriting(true)} className="h-10 px-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-sm font-black flex items-center gap-1.5 shrink-0" data-testid="button-talk-new"><PenSquare className="w-4 h-4" />{tr("Viết bài", "New thread", "發新話題")}</button>
      </div>

      <section className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="talk-threads">
        {!page ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-8" /> : page.items.length === 0 ? (
          <div className="px-6 py-10 text-center"><div className="text-4xl mb-2">💬</div><p className="text-sm text-white/60">{tr("Chưa có chủ đề nào. Mở đầu câu chuyện đi!", "No threads yet. Start the conversation!", "還沒有話題，來開個頭吧！")}</p></div>
        ) : page.items.map((t) => (
          <button key={t.id} type="button" onClick={() => setLocation(`/community?tab=talk&board=${t.board}&thread=${t.id}`)} className="w-full text-left px-3 py-2.5 border-b border-white/5 last:border-0 active:bg-white/5" data-testid={`talk-thread-${t.id}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-black text-white leading-snug break-words [overflow-wrap:anywhere]">{t.title}</div>
                <div className="text-xs text-white/55 line-clamp-1 break-words">{t.body}</div>
              </div>
              <span className="shrink-0 flex flex-col items-end gap-0.5 text-[11px] text-white/60">
                <span className="flex items-center gap-1 font-black text-yellow-200"><MessageSquare className="w-3.5 h-3.5" />{t.replies}</span>
                {t.thumbs > 0 && <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{t.thumbs}</span>}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <Author a={t.author} />
              <span className="text-[10px] text-white/40 shrink-0">{!board && <>{boardOf(t.board)?.icon} · </>}{ago(t.lastAt)}</span>
            </div>
          </button>
        ))}
      </section>
      {page?.more && <button type="button" disabled={loading} onClick={() => load(page.next)} className="py-2 text-xs font-bold text-yellow-300/80">{loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : tr("Xem thêm", "Show more", "顯示更多")}</button>}
      <p className="text-[10px] text-white/40 text-center">{tr("Nói chuyện thoải mái như người lớn. Gặp điều khó chịu: chặn hoặc báo cáo.", "Talk freely, like grown-ups. If something's wrong: block or report.", "像大人一樣自在聊天。遇到不舒服的內容：封鎖或檢舉。")}</p>
      {createPortal(<AnimatePresence>{writing && <NewThreadSheet board={board ?? "misc"} onClose={() => setWriting(false)} onPosted={(t) => { setWriting(false); setLocation(`/community?tab=talk&board=${t.board}&thread=${t.id}`); }} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function NewThreadSheet({ board, onClose, onPosted }: { board: TalkBoard; onClose: () => void; onPosted: (t: TalkThreadView) => void }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [b, setB] = useState<TalkBoard>(board);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try {
      const t = await (await apiRequest("POST", "/api/talk/threads", { board: b, title, body, photoId: photo })).json() as TalkThreadView;
      soundManager.pop();
      onPosted(t);
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <Sheet title={tr("Viết bài mới", "New thread", "發新話題")} icon={<PenSquare className="w-5 h-5 text-yellow-300" />} onClose={onClose} testid="talk-new-sheet">
      <div className="p-4 flex flex-col gap-3">
        <select value={b} onChange={(e) => setB(e.target.value as TalkBoard)} className="h-11 rounded-xl bg-black/50 border border-white/15 px-3 text-white" data-testid="select-talk-board">
          {TALK_BOARDS.map((x) => <option key={x.id} value={x.id}>{x.icon} {loc(x)}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TALK_TITLE_MAX} placeholder={tr("Tiêu đề", "Title", "標題")} className="h-11 rounded-xl bg-black/50 border border-white/15 px-3 text-white font-bold placeholder:text-white/30" data-testid="input-talk-title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TALK_BODY_MAX} rows={6} placeholder={tr("Bạn muốn nói gì?", "What's on your mind?", "想聊些什麼？")} className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-white text-sm resize-none placeholder:text-white/30" data-testid="input-talk-body" />
        <div className="flex items-center gap-2">
          <PhotoPickButton target={{ scope: "talk" }} onPhoto={setPhoto} />
          {photo ? <span className="relative"><MessagePhoto id={photo} blur={false} mine className="!max-w-[6rem]" /><button type="button" onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black border border-white/30 text-white flex items-center justify-center" aria-label={tr("Bỏ", "Remove", "移除")}><X className="w-3.5 h-3.5" /></button></span> : <span className="text-[11px] text-white/45">{tr("Thêm ảnh (không bắt buộc)", "Add a photo (optional)", "加入照片（選填）")}</span>}
          <span className="flex-1 text-right text-[10px] text-white/35">{body.length}/{TALK_BODY_MAX}</span>
        </div>
        <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={post} className="h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black disabled:opacity-40" data-testid="button-talk-post">
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : tr("Đăng bài", "Post", "發布")}
        </button>
      </div>
    </Sheet>
  );
}

function ThreadView({ id }: { id: number }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const ago = useAgo();
  const blurFor = usePhotoBlur();
  const [t, setT] = useState<TalkThreadView | null>(null);
  const [replies, setReplies] = useState<TalkReplyView[]>([]);
  const [more, setMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const load = async (after = 0) => {
    try {
      const r = await (await apiRequest("GET", `/api/talk/threads/${id}${after ? `?after=${after}` : ""}`)).json() as { thread: TalkThreadView; replies: { items: TalkReplyView[]; more: boolean } };
      setT(r.thread);
      setReplies((cur) => [...cur, ...r.replies.items.filter((x) => !cur.some((c) => c.id === x.id))]);
      setMore(r.replies.more);
    } catch { setMissing(true); }
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useSocialEvent((m) => {
    if (m.t === "talk_reply" && m.threadId === id) { setReplies((cur) => (cur.some((x) => x.id === m.reply.id) || more ? cur : [...cur, m.reply])); setT((x) => x && { ...x, replies: m.replies, lastAt: m.lastAt }); }
    else if (m.t === "talk_reply_removed" && m.threadId === id) setReplies((cur) => cur.filter((x) => x.id !== m.id));
    else if (m.t === "talk_removed" && m.threadId === id) setMissing(true);
  });
  const back = () => setLocation(t ? `/community?tab=talk&board=${t.board}` : "/community?tab=talk");
  if (missing) return <div className="w-full py-12 text-center text-white/60"><p>{tr("Chủ đề này không còn nữa", "This thread is gone", "這個話題已不存在")}</p><button type="button" onClick={back} className="mt-3 text-yellow-300 underline text-sm">{tr("Quay lại", "Back", "返回")}</button></div>;
  if (!t) return <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mt-10" />;
  const b = boardOf(t.board);

  const send = async () => {
    setBusy(true);
    try {
      const r = await (await apiRequest("POST", `/api/talk/threads/${id}/replies`, { text, photoId: photo })).json() as TalkReplyView;
      setReplies((cur) => (cur.some((x) => x.id === r.id) ? cur : [...cur, r]));
      setT((x) => x && { ...x, replies: x.replies + 1 });
      setText(""); setPhoto(null);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  const thumb = async () => {
    try { const r = await (await apiRequest("POST", `/api/talk/threads/${id}/thumb`)).json() as { on: boolean; thumbs: number }; setT((x) => x && { ...x, thumbed: r.on, thumbs: r.thumbs }); if (r.on) soundManager.pop(); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  const report = async (path: string) => {
    if (!confirm(tr("Báo cáo nội dung này cho quản trị viên?", "Report this to the admins?", "要向管理員檢舉這個內容嗎？"))) return;
    try { await apiRequest("POST", path, {}); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  const remove = async (path: string, onDone: () => void) => {
    if (!confirm(tr("Xoá?", "Delete?", "要刪除嗎？"))) return;
    try { await apiRequest("DELETE", path); onDone(); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };

  return (
    <div className="w-full flex flex-col gap-3" data-testid="talk-thread">
      <button type="button" onClick={back} className="self-start h-9 px-2 -ml-1 rounded-xl text-white/80 text-sm font-bold flex items-center gap-1 active:bg-white/10" data-testid="button-talk-back"><ArrowLeft className="w-4 h-4" />{b ? `${b.icon} ${loc(b)}` : tr("Quay lại", "Back", "返回")}</button>
      <article className="rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.03] border border-white/10 p-3 flex flex-col gap-2">
        <h1 className="font-black text-lg text-white leading-snug break-words [overflow-wrap:anywhere]" data-testid="talk-title">{t.title}</h1>
        <Author a={t.author} sub={ago(t.at)} />
        <p className="text-[15px] text-white/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{t.body}</p>
        {t.photo && <MessagePhoto id={t.photo} blur={blurFor({ username: t.author.username, mine: t.mine, friend: t.friend })} mine={t.mine} />}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={thumb} className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-sm font-black border ${t.thumbed ? "bg-sky-500/25 text-sky-100 border-sky-400/40" : "bg-white/5 text-white/70 border-white/10"}`} data-testid="button-talk-thumb"><ThumbsUp className="w-4 h-4" />{t.thumbs}</button>
          <span className="flex-1 text-xs text-white/50 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />{t.replies}</span>
          {t.mine
            ? <button type="button" onClick={() => remove(`/api/talk/threads/${id}`, back)} className="h-9 w-9 rounded-full text-white/40 flex items-center justify-center" aria-label={tr("Xoá", "Delete", "刪除")}><Trash2 className="w-4 h-4" /></button>
            : <button type="button" onClick={() => report(`/api/talk/threads/${id}/report`)} className="h-9 w-9 rounded-full text-white/40 flex items-center justify-center" aria-label={tr("Báo cáo", "Report", "檢舉")} data-testid="button-talk-report"><Flag className="w-4 h-4" /></button>}
        </div>
      </article>

      <section className="flex flex-col gap-2" data-testid="talk-replies">
        {replies.map((r) => (
          <div key={r.id} className="rounded-2xl bg-black/35 border border-white/5 px-3 py-2" data-testid={`talk-reply-${r.id}`}>
            <div className="flex items-center justify-between gap-2">
              <Author a={r.author} />
              <span className="flex items-center gap-1 text-[10px] text-white/40 shrink-0">
                {ago(r.at)}
                {r.mine
                  ? <button type="button" onClick={() => remove(`/api/talk/replies/${r.id}`, () => setReplies((c) => c.filter((x) => x.id !== r.id)))} className="p-1.5" aria-label={tr("Xoá", "Delete", "刪除")}><Trash2 className="w-3.5 h-3.5" /></button>
                  : <button type="button" onClick={() => report(`/api/talk/replies/${r.id}/report`)} className="p-1.5" aria-label={tr("Báo cáo", "Report", "檢舉")}><Flag className="w-3.5 h-3.5" /></button>}
              </span>
            </div>
            {r.text && <p className="text-sm text-white/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-1">{r.text}</p>}
            {r.photo && <MessagePhoto id={r.photo} blur={blurFor({ username: r.author.username, mine: r.mine, friend: r.friend })} mine={r.mine} className="mt-1.5" />}
          </div>
        ))}
        {more && <button type="button" onClick={() => load(replies[replies.length - 1]?.id ?? 0)} className="py-2 text-xs font-bold text-yellow-300/80">{tr("Xem thêm trả lời", "More replies", "更多回覆")}</button>}
        <div ref={endRef} />
      </section>

      <div className="sticky bottom-20 rounded-2xl bg-[#1a0a2e]/95 border border-white/10 p-2 flex flex-col gap-1.5 backdrop-blur">
        {photo && <span className="relative self-start"><MessagePhoto id={photo} blur={false} mine className="!max-w-[5rem]" /><button type="button" onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black border border-white/30 text-white flex items-center justify-center" aria-label={tr("Bỏ", "Remove", "移除")}><X className="w-3.5 h-3.5" /></button></span>}
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim() || photo) void send(); }}>
          <PhotoPickButton target={{ scope: "talk" }} onPhoto={setPhoto} />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={TALK_REPLY_MAX} placeholder={user ? tr("Viết trả lời…", "Write a reply…", "寫回覆…") : ""} enterKeyHint="send"
            className="flex-1 min-w-0 h-11 rounded-xl bg-[#140b26] border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-talk-reply" />
          <button type="submit" disabled={busy || (!text.trim() && !photo)} className="w-11 h-11 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={tr("Gửi", "Send", "發送")} data-testid="button-talk-send">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
