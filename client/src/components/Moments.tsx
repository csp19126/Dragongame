import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Flag, Heart, Loader2, MessageCircle, Send, Smile, Trash2, Trophy, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { useSocialEvent } from "@/hooks/use-social";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useAgo, useGameName } from "@/components/SocialBits";
import { ClubTagChip, Sheet, useSocialErr } from "@/components/Social3Bits";
import { STICKERS, STICKER_BY_ID, type AlbumView } from "@shared/stickers";
import { PLAY_GAME_TO_PLAYABLE } from "@shared/friends";
import { MOMENT_MAX_LEN, MOMENT_COMMENT_MAX, type MomentView, type MomentComment, type WinCard } from "@shared/social3";

type Scope = "all" | "friends" | "club";

/** Text with @names picked out */
function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}\p{N}_.-]{3,24})/u);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="font-black text-yellow-300">{p}</span> : p))}</>;
}

/** A verified win: the numbers come from the server's own record of the play */
export function WinCardView({ win, compact }: { win: WinCard | Omit<WinCard, "playId">; compact?: boolean }) {
  const { tr } = useLang();
  const gameName = useGameName();
  const mult = win.bet > 0 ? win.payout / win.bet : 0;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-yellow-300/60 bg-gradient-to-br from-red-600 via-red-800 to-[#2a0712] ${compact ? "p-2.5" : "p-3"} shadow-[0_8px_24px_rgba(220,38,38,0.35)]`} data-testid="win-card">
      <div className="absolute -right-3 -top-4 text-7xl opacity-20 select-none">🏆</div>
      <div className="relative flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-200/90">
        <Trophy className="w-3.5 h-3.5" />{tr("Thắng thật · đã xác minh", "Real win · verified", "真實贏局 · 已驗證")}
      </div>
      <div className={`relative font-mono font-black text-yellow-300 leading-none mt-1 ${compact ? "text-2xl" : "text-3xl"}`}>+{fmtCoins(win.payout - win.bet)}</div>
      <div className="relative text-[11px] text-white/85 mt-1 flex flex-wrap gap-x-2">
        <span>{gameName(PLAY_GAME_TO_PLAYABLE[win.game] ?? win.game) ?? win.game}</span>
        <span>{tr("Cược", "Bet", "押注")} {fmtCoins(win.bet)}</span>
        {mult >= 2 && <span className="font-black text-yellow-200">×{mult >= 100 ? Math.round(mult) : +mult.toFixed(1)}</span>}
      </div>
    </div>
  );
}

function useWall(scope: Scope) {
  const [items, setItems] = useState<MomentView[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = async (before?: number) => {
    setLoading(true);
    try {
      const r = await (await apiRequest("GET", `/api/moments?scope=${scope}${before ? `&before=${before}` : ""}`)).json() as { items: MomentView[]; more: boolean };
      setItems((cur) => (before && cur ? [...cur, ...r.items.filter((x) => !cur.some((c) => c.id === x.id))] : r.items));
      setMore(r.more);
    } catch { setItems((c) => c ?? []); } finally { setLoading(false); }
  };
  useEffect(() => { setItems(null); void load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, setItems, more, loading, load };
}

/** The Moments wall: Everyone / Friends / Club, a composer, live likes and comments */
export function MomentsTab({ focus }: { focus: number | null }) {
  const { tr } = useLang();
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const wall = useWall(scope);
  const [commentsFor, setCommentsFor] = useState<MomentView | null>(null);
  const opened = useRef(false);

  // Opened from a notification: show that Moment's comments
  useEffect(() => {
    if (!focus || opened.current) return;
    opened.current = true;
    apiRequest("GET", `/api/moments/${focus}`).then((r) => r.json()).then((m: MomentView) => setCommentsFor(m)).catch(() => {});
  }, [focus]);

  useSocialEvent((m) => {
    if (m.t === "moment" && scope === "all") wall.setItems((cur) => (cur && !cur.some((x) => x.id === m.item.id) ? [m.item, ...cur] : cur));
    else if (m.t === "moment_like") wall.setItems((cur) => cur && cur.map((x) => (x.id === m.id ? { ...x, likes: m.likes, liked: m.by === user?.username ? m.on : x.liked } : x)));
    else if (m.t === "moment_comment") wall.setItems((cur) => cur && cur.map((x) => (x.id === m.id ? { ...x, comments: x.comments + 1 } : x)));
    else if (m.t === "moment_comment_removed") wall.setItems((cur) => cur && cur.map((x) => (x.id === m.id ? { ...x, comments: Math.max(0, x.comments - 1) } : x)));
    else if (m.t === "moment_removed") wall.setItems((cur) => cur && cur.filter((x) => x.id !== m.id));
  });

  const scopes: { id: Scope; label: string }[] = [
    { id: "all", label: tr("Mọi người", "Everyone", "所有人") },
    { id: "friends", label: tr("Bạn bè", "Friends", "好友") },
    { id: "club", label: tr("Hội", "Club", "公會") },
  ];

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-moments">
      <Composer onPosted={(m) => { if (scope !== "club") wall.setItems((cur) => (cur ? [m, ...cur.filter((x) => x.id !== m.id)] : [m])); }} />
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
        {scopes.map((s) => (
          <button key={s.id} type="button" onClick={() => setScope(s.id)} className={`py-2 rounded-xl text-xs font-black ${scope === s.id ? "bg-white/15 text-yellow-200" : "text-white/60"}`} data-testid={`moments-scope-${s.id}`}>{s.label}</button>
        ))}
      </div>
      {!wall.items ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-8" /> : wall.items.length === 0 ? (
        <div className="rounded-2xl bg-black/30 border border-white/10 px-6 py-10 text-center flex flex-col items-center gap-2" data-testid="moments-empty">
          <div className="text-5xl">📸</div>
          <p className="text-sm font-bold text-white/70">{scope === "club" ? tr("Chưa có Khoảnh khắc nào từ hội (hoặc bạn chưa vào hội).", "No Moments from your club yet (or you're not in one).", "還沒有公會的動態（或你尚未加入公會）。") : tr("Chưa có Khoảnh khắc nào. Đăng cái đầu tiên đi!", "No Moments yet. Post the first one!", "還沒有動態，來發第一則吧！")}</p>
        </div>
      ) : (
        <>
          {wall.items.map((m) => <MomentCard key={m.id} m={m} onComments={() => setCommentsFor(m)} onChange={(next) => wall.setItems((cur) => cur && (next ? cur.map((x) => (x.id === m.id ? next : x)) : cur.filter((x) => x.id !== m.id)))} />)}
          {wall.more && (
            <button type="button" disabled={wall.loading} onClick={() => wall.load(wall.items![wall.items!.length - 1]?.id)} className="py-2.5 text-xs font-bold text-yellow-300/80">
              {wall.loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : tr("Xem thêm", "Show more", "顯示更多")}
            </button>
          )}
        </>
      )}
      {createPortal(<AnimatePresence>{commentsFor && <CommentsSheet m={commentsFor} onClose={() => setCommentsFor(null)} onCount={(n) => wall.setItems((cur) => cur && cur.map((x) => (x.id === commentsFor.id ? { ...x, comments: n } : x)))} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function Composer({ onPosted }: { onPosted: (m: MomentView) => void }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [sticker, setSticker] = useState<string | null>(null);
  const [win, setWin] = useState<WinCard | null>(null);
  const [picker, setPicker] = useState<"sticker" | "win" | null>(null);
  const [busy, setBusy] = useState(false);
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"], enabled: picker === "sticker" });
  const wins = useQuery<{ wins: WinCard[] }>({ queryKey: ["/api/moments/wins"], enabled: picker === "win", staleTime: 0 });
  const owned = useMemo(() => STICKERS.filter((s) => (album.data?.owned[s.id] ?? 0) > 0), [album.data]);
  const locked = (user?.gamesPlayed ?? 0) < 3 && !user?.isAdmin;
  const st = sticker ? STICKER_BY_ID.get(sticker) : null;

  const post = async () => {
    setBusy(true);
    try {
      const m = await (await apiRequest("POST", "/api/moments", { text: text.trim() || null, sticker, playId: win?.playId ?? null })).json() as MomentView;
      soundManager.pop();
      onPosted(m);
      setText(""); setSticker(null); setWin(null); setPicker(null);
      toast({ title: tr("📸 Đã đăng Khoảnh khắc!", "📸 Moment posted!", "📸 已發布動態！") });
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setBusy(false); }
  };

  if (locked) return (
    <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-3 text-center text-sm text-white/70" data-testid="moments-locked">
      🔒 {tr("Chơi 3 ván để đăng Khoảnh khắc", "Play 3 games to post Moments", "玩 3 局即可發布動態")}
    </div>
  );

  return (
    <div className="rounded-2xl bg-black/40 border border-yellow-500/25 p-2.5 flex flex-col gap-2" data-testid="moment-composer">
      <div className="flex gap-2">
        {user && <Avatar user={user} size={36} />}
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MOMENT_MAX_LEN))} rows={2} placeholder={tr("Bạn đang nghĩ gì? Khoe ván thắng nào…", "What's happening? Show off a win…", "在想什麼？炫耀一下你的贏局…")}
          className="flex-1 min-w-0 resize-none rounded-xl bg-[#140b26] border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/30" data-testid="input-moment" />
      </div>
      {(st || win) && (
        <div className="relative ml-11">
          {st && <div className="text-6xl leading-none py-1" title={loc(st)}>{st.emoji}</div>}
          {win && <WinCardView win={win} compact />}
          <button type="button" onClick={() => { setSticker(null); setWin(null); }} className="absolute -top-2 -right-1 w-7 h-7 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center" aria-label={tr("Bỏ", "Remove", "移除")}><X className="w-4 h-4" /></button>
        </div>
      )}
      <AnimatePresence>
        {picker && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {picker === "sticker" ? (
              owned.length === 0 ? <p className="text-xs text-white/50 px-1 py-2">{tr("Bạn chưa có sticker nào. Mở gói trong Album!", "No stickers yet. Open a pack in the Album!", "你還沒有貼圖。到圖鑑開卡包吧！")}</p> : (
                <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
                  {owned.map((s) => <button key={s.id} type="button" onClick={() => { setSticker(s.id); setWin(null); setPicker(null); }} className="text-3xl rounded-xl bg-white/5 py-1 active:scale-90">{s.emoji}</button>)}
                </div>
              )
            ) : !wins.data ? <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto my-3" /> : wins.data.wins.length === 0 ? (
              <p className="text-xs text-white/50 px-1 py-2">{tr("Chưa có ván thắng lớn nào trong 7 ngày qua (từ ×5 và lời 10K, hoặc lời 200K).", "No big wins in the last 7 days yet (×5 with 10K profit, or 200K profit).", "過去 7 天還沒有大贏局（×5 且贏 10K，或贏 200K）。")}</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto" data-testid="win-picker">
                {wins.data.wins.map((w) => (
                  <button key={w.playId} type="button" onClick={() => { setWin(w); setSticker(null); setPicker(null); }} className="text-left active:scale-[0.98]" data-testid={`win-pick-${w.playId}`}><WinCardView win={w} compact /></button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setPicker((p) => (p === "sticker" ? null : "sticker"))} className={`h-9 px-2.5 rounded-xl text-xs font-black flex items-center gap-1 ${picker === "sticker" ? "bg-yellow-400 text-black" : "bg-white/10 text-white/80"}`} data-testid="button-moment-sticker"><Smile className="w-4 h-4" />{tr("Sticker", "Sticker", "貼圖")}</button>
        <button type="button" onClick={() => setPicker((p) => (p === "win" ? null : "win"))} className={`h-9 px-2.5 rounded-xl text-xs font-black flex items-center gap-1 ${picker === "win" ? "bg-yellow-400 text-black" : "bg-white/10 text-white/80"}`} data-testid="button-moment-win"><Trophy className="w-4 h-4" />{tr("Ván thắng", "A win", "贏局")}</button>
        <span className="flex-1 text-right text-[10px] text-white/35">{text.length}/{MOMENT_MAX_LEN}</span>
        <button type="button" disabled={busy || (!text.trim() && !sticker && !win)} onClick={post} className="h-9 px-4 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-sm font-black flex items-center gap-1 disabled:opacity-40" data-testid="button-moment-post">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Camera className="w-4 h-4" />{tr("Đăng", "Post", "發布")}</>}
        </button>
      </div>
    </div>
  );
}

export function MomentCard({ m, onComments, onChange, compact }: { m: MomentView; onComments: () => void; onChange?: (next: MomentView | null) => void; compact?: boolean }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const showPlayer = usePlayerSheet();
  const ago = useAgo();
  const [menu, setMenu] = useState(false);
  const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
  const like = async () => {
    const optimistic = { ...m, liked: !m.liked, likes: m.likes + (m.liked ? -1 : 1) };
    onChange?.(optimistic);
    try {
      const r = await (await apiRequest("POST", `/api/moments/${m.id}/like`)).json() as { on: boolean; likes: number };
      if (r.on) soundManager.pop();
      onChange?.({ ...m, liked: r.on, likes: r.likes });
    } catch (e) { onChange?.(m); toast({ title: err(e), variant: "destructive" }); }
  };
  const report = async () => {
    setMenu(false);
    try { await apiRequest("POST", `/api/moments/${m.id}/report`, {}); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  const remove = async () => {
    setMenu(false);
    if (!confirm(tr("Xoá Khoảnh khắc này?", "Delete this Moment?", "要刪除這則動態嗎？"))) return;
    try { await apiRequest("DELETE", `/api/moments/${m.id}`); onChange?.(null); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/10 p-3 flex flex-col gap-2" data-testid={`moment-${m.id}`}>
      <div className="flex items-center gap-2.5">
        <Avatar user={m.author} size={38} onClick={() => showPlayer(m.author.username)} />
        <button type="button" onClick={() => showPlayer(m.author.username)} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5 min-w-0"><span className="font-black text-white truncate">{m.author.username}</span><ClubTagChip club={m.author.club} /><LevelBadge level={m.author.level} /></span>
          <span className="block text-[10px] text-white/40">{ago(m.at)}</span>
        </button>
        {onChange && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="w-8 h-8 rounded-full text-white/40 text-lg leading-none" aria-label="⋯" data-testid={`moment-menu-${m.id}`}>⋯</button>
            {menu && (
              <div className="absolute right-0 top-8 z-10 rounded-xl bg-[#2a1748] border border-white/15 shadow-xl overflow-hidden min-w-[9rem]">
                {m.mine ? (
                  <button type="button" onClick={remove} className="w-full px-3 py-2.5 text-left text-sm text-red-200 flex items-center gap-2 hover:bg-white/10" data-testid={`moment-delete-${m.id}`}><Trash2 className="w-4 h-4" />{tr("Xoá", "Delete", "刪除")}</button>
                ) : (
                  <button type="button" onClick={report} className="w-full px-3 py-2.5 text-left text-sm text-red-200 flex items-center gap-2 hover:bg-white/10" data-testid={`moment-report-${m.id}`}><Flag className="w-4 h-4" />{tr("Báo cáo", "Report", "檢舉")}</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {m.text && <p className={`text-white/90 break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${compact ? "text-sm line-clamp-3" : "text-[15px] leading-snug"}`}><Mentions text={m.text} /></p>}
      {st && <div className="text-6xl leading-none" title={loc(st)}>{st.emoji}</div>}
      {m.win && <WinCardView win={m.win} compact={compact} />}
      <div className="flex items-center gap-2 pt-0.5">
        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={like} disabled={!onChange} className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-sm font-black ${m.liked ? "bg-pink-500/25 text-pink-200 border border-pink-400/40" : "bg-white/5 text-white/70 border border-white/10"}`} data-testid={`moment-like-${m.id}`}>
          <Heart className={`w-4 h-4 ${m.liked ? "fill-pink-400 text-pink-400" : ""}`} />{m.likes}
        </motion.button>
        <button type="button" onClick={onComments} className="h-9 px-3 rounded-full bg-white/5 border border-white/10 text-white/70 flex items-center gap-1.5 text-sm font-black" data-testid={`moment-comments-${m.id}`}>
          <MessageCircle className="w-4 h-4" />{m.comments}
        </button>
      </div>
    </motion.article>
  );
}

function CommentsSheet({ m, onClose, onCount }: { m: MomentView; onClose: () => void; onCount: (n: number) => void }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const showPlayer = usePlayerSheet();
  const ago = useAgo();
  const [list, setList] = useState<MomentComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [moment, setMoment] = useState(m);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    apiRequest("GET", `/api/moments/${m.id}/comments`).then((r) => r.json()).then((r) => setList(r.comments)).catch(() => setList([]));
  }, [m.id]);
  useSocialEvent((x) => {
    if (x.t === "moment_comment" && x.id === m.id) setList((cur) => (cur && !cur.some((c) => c.id === x.comment.id) ? [...cur, x.comment] : cur));
    else if (x.t === "moment_comment_removed" && x.id === m.id) setList((cur) => cur && cur.filter((c) => c.id !== x.commentId));
    else if (x.t === "moment_like" && x.id === m.id) setMoment((cur) => ({ ...cur, likes: x.likes }));
  });
  useEffect(() => { if (list) { onCount(list.length); requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" })); } }, [list?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    try {
      const c = await (await apiRequest("POST", `/api/moments/${m.id}/comments`, { text })).json() as MomentComment;
      setList((cur) => (cur && !cur.some((x) => x.id === c.id) ? [...cur, c] : cur));
      setText("");
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  const remove = async (c: MomentComment) => {
    try { await apiRequest("DELETE", `/api/moments/comments/${c.id}`); setList((cur) => cur && cur.filter((x) => x.id !== c.id)); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  const report = async (c: MomentComment) => {
    try { await apiRequest("POST", `/api/moments/comments/${c.id}/report`, {}); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };

  return (
    <Sheet title={tr("Bình luận", "Comments", "留言")} icon={<MessageCircle className="w-5 h-5 text-yellow-300" />} onClose={onClose} testid="moment-comments-sheet" tall>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 flex flex-col gap-2.5">
          <MomentCard m={moment} compact onComments={() => {}} onChange={(n) => n && setMoment(n)} />
          {!list ? <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto my-6" /> : list.length === 0 ? (
            <p className="text-xs text-white/45 text-center py-6">{tr("Chưa có bình luận. Nói gì đó đi!", "No comments yet. Say something!", "還沒有留言，說點什麼吧！")}</p>
          ) : list.map((c) => (
            <div key={c.id} className="flex gap-2" data-testid={`comment-${c.id}`}>
              <Avatar user={c.author} size={30} onClick={() => showPlayer(c.author.username)} />
              <div className="flex-1 min-w-0">
                <div className="rounded-2xl rounded-tl-md bg-white/10 px-3 py-1.5">
                  <button type="button" onClick={() => showPlayer(c.author.username)} className="flex items-center gap-1 text-[11px] font-black text-yellow-200"><span className="truncate">{c.author.username}</span><ClubTagChip club={c.author.club} /></button>
                  <p className="text-sm text-white break-words [overflow-wrap:anywhere]"><Mentions text={c.text} /></p>
                </div>
                <div className="flex items-center gap-3 px-2 mt-0.5 text-[10px] text-white/40">
                  <span>{ago(c.at)}</span>
                  {c.mine || moment.mine ? <button type="button" onClick={() => remove(c)} className="font-bold hover:text-red-300">{tr("Xoá", "Delete", "刪除")}</button> : null}
                  {!c.mine && <button type="button" onClick={() => report(c)} className="font-bold hover:text-red-300">{tr("Báo cáo", "Report", "檢舉")}</button>}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="flex gap-1.5 p-2.5 border-t border-white/10" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MOMENT_COMMENT_MAX} placeholder={tr("Viết bình luận…", "Write a comment…", "寫留言…")} enterKeyHint="send"
            className="flex-1 min-w-0 h-11 rounded-xl bg-[#140b26] border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-comment" />
          <button type="submit" disabled={busy || !text.trim()} className="w-11 h-11 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={tr("Gửi", "Send", "發送")} data-testid="button-comment-send">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </Sheet>
  );
}

/** The Lobby card: today's most-liked Moment */
export function LobbyTopMoment() {
  const { tr } = useLang();
  const [, setLocation] = useLocation();
  const q = useQuery<{ item: MomentView | null }>({ queryKey: ["/api/moments/top"], refetchInterval: 60_000 });
  const m = q.data?.item;
  if (!m) return (
    <Link href="/community?tab=moments" className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex items-center gap-3 active:scale-[0.98] transition" data-testid="lobby-moments">
      <span className="text-3xl">📸</span>
      <span className="flex-1"><span className="block text-[10px] uppercase font-black text-pink-300/80">{tr("Khoảnh khắc", "Moments", "動態牆")}</span><span className="block text-sm font-black text-white">{tr("Khoe ván thắng, đăng điều vui hôm nay", "Show off a win, share today's fun", "炫耀贏局、分享今天的趣事")}</span></span>
    </Link>
  );
  return (
    <div className="rounded-3xl p-2.5 bg-gradient-to-b from-pink-500/15 to-transparent border border-pink-400/30 flex flex-col gap-2" data-testid="lobby-top-moment">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase font-black tracking-widest text-pink-200">📸 {tr("Khoảnh khắc nổi bật hôm nay", "Top Moment today", "今日熱門動態")}</span>
        <Link href="/community?tab=moments" className="text-[11px] font-black text-yellow-300">{tr("Xem tất cả", "See all", "查看全部")} ›</Link>
      </div>
      <MomentCard m={m} compact onComments={() => setLocation(`/community?tab=moments&moment=${m.id}`)} />
    </div>
  );
}
