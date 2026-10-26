import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Crown, Flag, Loader2, LogOut, MessageCircle, Plus, Search, Send, Settings, Shield, Smile, Star, Trophy, Users, X } from "lucide-react";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { STATE_KEY } from "@/hooks/use-game";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { fireworks } from "@/lib/celebrate";
import { useSocial, useSocialEvent } from "@/hooks/use-social";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useAgo, useGameName } from "@/components/SocialBits";
import { useFeedText } from "@/components/ActivityFeed";
import { Sheet, useSocialErr } from "@/components/Social3Bits";
import { STICKERS, STICKER_BY_ID, type AlbumView } from "@shared/stickers";
import { CHAT_MAX_LEN } from "@shared/chat";
import { CLUB_NAME_MAX, CLUB_TAG_MAX, CLUB_DESC_MAX, clubAllowed, type ClubRole } from "@shared/social3";
import type { FeedItem } from "@shared/friends";

interface ClubSummary { id: number; name: string; tag: string; emblem: string; color: string; description: string | null; open: boolean; members: number; maxMembers: number; weeklyXp: number; rank: number }
interface ClubsView {
  clubs: ClubSummary[]; top: ClubSummary[]; mine: ClubSummary | null; myRole: ClubRole | null; requested: number[];
  fee: number; maxMembers: number; rewards: number[]; emblems: string[]; colors: string[]; weekStart: string;
  lastWeek: { week: string; winners: { clubId: number; name: string; rank: number; xp: number; paid: number }[] } | null;
}
interface Member { username: string; avatarUrl: string | null; level: number; role: ClubRole; online: boolean; playing: string | null; weeklyXp: number; joinedAt: string }
interface ClubDetail extends Omit<ClubSummary, "members"> {
  createdAt: string; rank: number; weekStart: string; weekEnd: string; members: Member[];
  requests: { username: string; avatarUrl: string | null; level: number; at: string }[];
  me: { role: ClubRole | null; requested: boolean; inOtherClub: boolean }; rewards: number[];
}
interface ClubMsg { id: number; username: string; text: string | null; sticker: string | null; createdAt: string; avatar: string | null; level: number; admin: boolean; role: ClubRole | null }

export const CLUBS_KEY = ["/api/clubs"];
const clubKey = (id: number) => [`/api/clubs/${id}`];
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

function Emblem({ c, size = 44 }: { c: { emblem: string; color: string }; size?: number }) {
  return (
    <span className="shrink-0 rounded-2xl flex items-center justify-center border-2 shadow-inner" style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, ${c.color}aa, ${c.color}33 70%)`, borderColor: `${c.color}cc`, fontSize: size * 0.55 }}>
      {c.emblem}
    </span>
  );
}

function RoleIcon({ role }: { role: ClubRole }) {
  if (role === "owner") return <Crown className="w-3.5 h-3.5 text-yellow-300 shrink-0" />;
  if (role === "officer") return <Star className="w-3.5 h-3.5 text-sky-300 shrink-0" />;
  return null;
}

function useRoleName() {
  const { tr } = useLang();
  return (r: ClubRole) => (r === "owner" ? tr("Trưởng hội", "Owner", "會長") : r === "officer" ? tr("Phó hội", "Officer", "幹部") : tr("Thành viên", "Member", "成員"));
}

/** Community › Clubs: browse, search, the weekly top, create; or one club's page */
export function ClubsTab({ clubId }: { clubId: number | null }) {
  return clubId ? <ClubPage key={clubId} id={clubId} /> : <ClubsBrowse />;
}

function ClubsBrowse() {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [, setLocation] = useLocation();
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useQuery<ClubsView>({ queryKey: [`/api/clubs${term.trim().length >= 2 ? `?q=${encodeURIComponent(term.trim())}` : ""}`], refetchInterval: 30_000, placeholderData: (p) => p });
  const v = q.data;
  const open = (id: number) => setLocation(`/community?tab=clubs&club=${id}`);
  const join = useMutation({
    mutationFn: async (id: number) => ({ id, ...(await (await apiRequest("POST", `/api/clubs/${id}/join`)).json()) }) as { id: number; joined: boolean },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/clubs") });
      if (r.joined) { soundManager.bonus(); open(r.id); } else toast({ title: tr("Đã gửi yêu cầu vào hội", "Request sent", "已送出入會申請") });
    },
    onError: (e) => toast({ title: err(e), variant: "destructive" }),
  });

  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-clubs">
      {v?.mine ? (
        <button type="button" onClick={() => open(v.mine!.id)} className="rounded-3xl p-3 text-left flex items-center gap-3 border-2 active:scale-[0.98] transition" style={{ borderColor: `${v.mine.color}aa`, background: `linear-gradient(135deg, ${v.mine.color}40, #140b26 70%)` }} data-testid="my-club">
          <Emblem c={v.mine} size={52} />
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase font-black tracking-widest text-white/60">{tr("Hội của bạn", "Your club", "你的公會")}</span>
            <span className="block font-display text-xl text-white truncate">{v.mine.name} <span className="text-sm" style={{ color: v.mine.color }}>[{v.mine.tag}]</span></span>
            <span className="block text-[11px] text-white/70">#{v.mine.rank} · {fmtCoins(v.mine.weeklyXp)} XP · {v.mine.members}/{v.mine.maxMembers} <Users className="inline w-3 h-3 -mt-0.5" /></span>
          </span>
          <MessageCircle className="w-6 h-6 text-white/60" />
        </button>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="rounded-3xl p-4 text-left flex items-center gap-3 bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 shadow-[0_8px_30px_rgba(245,158,11,0.3)] active:scale-[0.98] transition" data-testid="button-club-create">
          <span className="text-4xl">🏯</span>
          <span className="flex-1"><span className="block font-black text-black text-lg leading-tight">{tr("Lập hội của bạn", "Start your own club", "創立你的公會")}</span><span className="block text-xs text-black/70 font-bold">{tr(`Tối đa ${v?.maxMembers ?? 30} người · phí ${fmtCoins(v?.fee ?? 50000)} xu`, `Up to ${v?.maxMembers ?? 30} players · costs ${fmtCoins(v?.fee ?? 50000)} coins`, `最多 ${v?.maxMembers ?? 30} 人 · 費用 ${fmtCoins(v?.fee ?? 50000)} 金幣`)}</span></span>
          <Plus className="w-6 h-6 text-black" />
        </button>
      )}

      {/* Top clubs this week */}
      <section className="rounded-3xl p-3 bg-gradient-to-br from-purple-900/70 to-black/50 border border-yellow-500/30" data-testid="clubs-top">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-yellow-300 flex items-center gap-1.5"><Trophy className="w-4 h-4" />{tr("Hội mạnh nhất tuần", "Top clubs this week", "本週最強公會")}</h3>
          <WeekCountdown start={v?.weekStart} />
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {(v?.rewards ?? [100000, 50000, 25000]).map((r, i) => (
            <div key={i} className="rounded-xl bg-black/30 text-center py-1.5"><div className="text-lg leading-none">{medal[i]}</div><div className="text-[10px] font-black text-yellow-200 mt-0.5">+{short(r)}</div></div>
          ))}
        </div>
        <p className="text-[10px] text-white/55 mb-2 leading-snug">{tr("Mỗi thành viên đã chơi trong tuần của 3 hội đứng đầu nhận thưởng. XP = số xu đặt cược / 1.000, tính theo giờ Việt Nam, thứ Hai đến Chủ Nhật.", "Every member who played that week in the top 3 clubs gets the reward. XP = coins staked / 1,000, Vietnam time, Monday to Sunday.", "前 3 名公會中當週有遊玩的每位成員都能獲得獎勵。XP = 押注金幣 / 1,000，以越南時間週一至週日計算。")}</p>
        {!v ? <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto my-3" /> : v.top.length === 0 ? (
          <p className="text-xs text-white/45 text-center py-2">{tr("Tuần này chưa hội nào có điểm. Chơi để giành hạng nhất!", "No club has scored this week yet. Play to take first place!", "本週還沒有公會得分，快去遊玩搶第一！")}</p>
        ) : v.top.slice(0, 5).map((c, i) => (
          <button key={c.id} type="button" onClick={() => open(c.id)} className="w-full flex items-center gap-2 py-1.5 border-t border-white/5 first:border-0 text-left" data-testid={`top-club-${c.id}`}>
            <span className="w-6 text-center font-black text-sm">{medal[i] ?? <span className="text-white/50">{i + 1}</span>}</span>
            <Emblem c={c} size={30} />
            <span className="flex-1 min-w-0 truncate font-bold text-white text-sm">{c.name} <span className="text-[10px] font-black" style={{ color: c.color }}>[{c.tag}]</span></span>
            <span className="text-xs font-black text-yellow-300">{fmtCoins(c.weeklyXp)} XP</span>
          </button>
        ))}
        {v?.lastWeek && v.lastWeek.winners.length > 0 && (
          <p className="text-[10px] text-white/45 mt-2 border-t border-white/5 pt-1.5">{tr("Tuần trước:", "Last week:", "上週：")} {v.lastWeek.winners.map((w) => `${medal[w.rank - 1]} ${w.name}`).join(" · ")}</p>
        )}
      </section>

      {/* Browse and search */}
      <div className="flex items-center gap-2 rounded-xl bg-black/50 border border-white/15 px-3">
        <Search className="w-4 h-4 text-white/40 shrink-0" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={30} placeholder={tr("Tìm hội theo tên hoặc ký hiệu…", "Find a club by name or tag…", "以名稱或標籤搜尋公會…")}
          className="flex-1 min-w-0 h-11 bg-transparent text-white placeholder:text-white/30 outline-none" data-testid="input-club-search" />
        {term && <button type="button" onClick={() => setTerm("")} className="p-1 text-white/50" aria-label={tr("Xoá", "Clear", "清除")}><X className="w-4 h-4" /></button>}
      </div>
      <section className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="clubs-list">
        {!v ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-8" /> : v.clubs.length === 0 ? (
          <div className="px-4 py-8 text-center flex flex-col items-center gap-2"><div className="text-4xl">🏯</div><p className="text-sm text-white/60">{term ? tr("Không tìm thấy hội nào", "No clubs found", "找不到公會") : tr("Chưa có hội nào. Hãy là người đầu tiên!", "No clubs yet. Be the first!", "還沒有公會，成為第一個吧！")}</p></div>
        ) : v.clubs.map((c) => {
          const full = c.members >= c.maxMembers;
          const asked = v.requested.includes(c.id);
          const isMine = v.mine?.id === c.id;
          return (
            <div key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 last:border-0" data-testid={`club-row-${c.id}`}>
              <button type="button" onClick={() => open(c.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                <Emblem c={c} size={44} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0"><span className="font-black text-white truncate">{c.name}</span><span className="text-[10px] font-black shrink-0" style={{ color: c.color }}>[{c.tag}]</span></span>
                  <span className="block text-[11px] text-white/55 truncate">{c.description ?? (c.open ? tr("Ai cũng vào được", "Anyone can join", "任何人都可加入") : tr("Cần duyệt", "Approval needed", "需要審核"))}</span>
                  <span className="block text-[10px] text-white/45">{c.members}/{c.maxMembers} 👥 · {fmtCoins(c.weeklyXp)} XP{c.open ? "" : " · 🔒"}</span>
                </span>
              </button>
              {isMine ? <span className="text-[10px] font-black text-emerald-300">✓</span> : !v.mine && (
                <button type="button" disabled={full || asked || join.isPending} onClick={() => join.mutate(c.id)} className={`h-9 px-3 rounded-xl text-xs font-black shrink-0 ${full || asked ? "bg-white/5 text-white/40" : "bg-gradient-to-b from-yellow-300 to-orange-500 text-black"}`} data-testid={`button-club-join-${c.id}`}>
                  {full ? tr("Đầy", "Full", "已滿") : asked ? tr("Đã xin", "Requested", "已申請") : c.open ? tr("Vào hội", "Join", "加入") : tr("Xin vào", "Ask", "申請")}
                </button>
              )}
            </div>
          );
        })}
      </section>
      {createPortal(<AnimatePresence>{creating && v && <CreateClubSheet v={v} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); open(id); }} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function WeekCountdown({ start }: { start?: string }) {
  const { tr } = useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!start) return null;
  const left = Math.max(0, new Date(start).getTime() + 7 * 86_400_000 - now);
  const d = Math.floor(left / 86_400_000), h = Math.floor((left % 86_400_000) / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000);
  return <span className="text-[10px] font-bold text-white/55">{tr("Còn", "Ends in", "剩餘")} {d > 0 ? tr(`${d} ngày ${h} giờ`, `${d}d ${h}h`, `${d} 天 ${h} 小時`) : tr(`${h} giờ ${m} phút`, `${h}h ${m}m`, `${h} 小時 ${m} 分`)}</span>;
}

function CreateClubSheet({ v, onClose, onCreated }: { v: ClubsView; onClose: () => void; onCreated: (id: number) => void }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emblem, setEmblem] = useState(v.emblems[0]);
  const [color, setColor] = useState(v.colors[0]);
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(true);
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/clubs", { name, tag, emblem, color, description: description.trim() || null, open })).json() as Promise<{ id: number }>,
    onSuccess: (r) => {
      soundManager.win(true); fireworks(2000);
      toast({ title: tr("🏯 Đã lập hội!", "🏯 Club created!", "🏯 公會已建立！") });
      queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/clubs") });
      queryClient.invalidateQueries({ queryKey: ME_KEY }); queryClient.invalidateQueries({ queryKey: STATE_KEY });
      onCreated(r.id);
    },
    onError: (e) => toast({ title: err(e), variant: "destructive" }),
  });
  const poor = (user?.balance ?? 0) < v.fee;
  return (
    <Sheet title={tr("Lập hội", "Start a club", "創立公會")} icon={<span className="text-xl">🏯</span>} onClose={onClose} testid="create-club-sheet">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl p-3 border-2" style={{ borderColor: `${color}aa`, background: `linear-gradient(135deg, ${color}40, transparent)` }}>
          <Emblem c={{ emblem, color }} size={56} />
          <div className="min-w-0">
            <div className="font-display text-xl text-white truncate">{name.trim() || tr("Tên hội", "Club name", "公會名稱")}</div>
            <div className="text-xs font-black" style={{ color }}>[{tag.trim().toUpperCase() || "TAG"}]</div>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black text-white/60">{tr("Tên hội (3–20 ký tự)", "Club name (3–20 characters)", "公會名稱（3–20 個字）")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={CLUB_NAME_MAX} className="h-11 rounded-xl bg-black/50 border border-white/15 px-3 text-white" data-testid="input-club-name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black text-white/60">{tr("Ký hiệu (2–5 chữ, hiện cạnh tên thành viên)", "Tag (2–5 letters, shown next to members' names)", "標籤（2–5 字，顯示在成員名稱旁）")}</span>
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={CLUB_TAG_MAX} className="h-11 rounded-xl bg-black/50 border border-white/15 px-3 text-white font-black tracking-widest" data-testid="input-club-tag" />
        </label>
        <div>
          <span className="text-[11px] font-black text-white/60">{tr("Biểu tượng", "Emblem", "徽章")}</span>
          <div className="grid grid-cols-8 gap-1 mt-1">
            {v.emblems.map((e) => <button key={e} type="button" onClick={() => setEmblem(e)} className={`h-9 rounded-xl text-xl ${emblem === e ? "bg-yellow-400/30 ring-2 ring-yellow-300" : "bg-white/5"}`} data-testid={`emblem-${e}`}>{e}</button>)}
          </div>
        </div>
        <div>
          <span className="text-[11px] font-black text-white/60">{tr("Màu", "Colour", "顏色")}</span>
          <div className="flex gap-2 mt-1 flex-wrap">
            {v.colors.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`w-9 h-9 rounded-full border-2 ${color === c ? "border-white scale-110" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black text-white/60">{tr("Giới thiệu (không bắt buộc)", "Description (optional)", "簡介（選填）")}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CLUB_DESC_MAX} rows={2} className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-white text-sm resize-none" data-testid="input-club-desc" />
        </label>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
          <button type="button" onClick={() => setOpen(true)} className={`py-2 rounded-xl text-xs font-black ${open ? "bg-white/15 text-yellow-200" : "text-white/60"}`}>🔓 {tr("Ai cũng vào được", "Anyone can join", "任何人可加入")}</button>
          <button type="button" onClick={() => setOpen(false)} className={`py-2 rounded-xl text-xs font-black ${!open ? "bg-white/15 text-yellow-200" : "text-white/60"}`}>🔒 {tr("Cần duyệt", "Approval", "需審核")}</button>
        </div>
        <p className="text-[11px] text-white/55 text-center">{tr(`Phí lập hội ${fmtCoins(v.fee)} xu (xu bị trừ, không ai nhận). Mỗi người chỉ ở một hội.`, `Starting a club costs ${fmtCoins(v.fee)} coins (they're spent, nobody receives them). One club per player.`, `創立公會費用 ${fmtCoins(v.fee)} 金幣（金幣會被消耗，不會給任何人）。每位玩家只能加入一個公會。`)}</p>
        <button type="button" disabled={create.isPending || poor || !!v.mine || name.trim().length < 3 || tag.trim().length < 2} onClick={() => create.mutate()}
          className="h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2" data-testid="button-club-create-go">
          {create.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : poor ? tr("Không đủ xu", "Not enough coins", "金幣不足") : <>🏯 {tr("Lập hội", "Create", "建立")} · {fmtCoins(v.fee)} 🪙</>}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------- One club ----------------

function ClubPage({ id }: { id: number }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [, setLocation] = useLocation();
  const q = useQuery<ClubDetail>({ queryKey: clubKey(id), refetchInterval: 30_000, retry: false });
  const [tab, setTab] = useState<"chat" | "members" | "activity">("chat");
  const [editing, setEditing] = useState(false);
  const c = q.data;
  const refresh = useCallback(() => { queryClient.invalidateQueries({ queryKey: clubKey(id) }); queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/clubs?") || x.queryKey[0] === "/api/clubs" }); }, [id]);
  useSocialEvent((m) => {
    if (m.t === "club" && m.clubId === id) {
      if (m.action === "disbanded") { toast({ title: tr("Hội đã giải tán", "The club was disbanded", "公會已解散") }); setLocation("/community?tab=clubs"); }
      refresh();
    }
  });
  const act = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) => (await apiRequest("POST", `/api/clubs/${id}/${path}`, body)).json(),
    onSuccess: (_r, v) => {
      refresh();
      if (v.path === "join") soundManager.bonus();
      if (v.path === "leave" || v.path === "disband") setLocation("/community?tab=clubs");
    },
    onError: (e) => toast({ title: err(e), variant: "destructive" }),
  });

  if (q.isError) return <div className="w-full py-12 text-center text-white/60"><p>{tr("Không tìm thấy hội", "Club not found", "找不到公會")}</p><button type="button" onClick={() => setLocation("/community?tab=clubs")} className="mt-3 text-yellow-300 underline text-sm">{tr("Quay lại", "Back", "返回")}</button></div>;
  if (!c) return <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mt-10" />;
  const role = c.me.role;
  const full = c.members.length >= c.maxMembers;

  return (
    <div className="w-full flex flex-col gap-3" data-testid="club-page">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl p-3 border-2" style={{ borderColor: `${c.color}aa`, background: `linear-gradient(150deg, ${c.color}55, #1a0a2e 65%)` }}>
        <div className="absolute -right-4 -bottom-6 text-[8rem] leading-none opacity-15 select-none">{c.emblem}</div>
        <div className="relative flex items-start gap-3">
          <button type="button" onClick={() => setLocation("/community?tab=clubs")} className="w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-white/80 active:bg-white/10" aria-label={tr("Quay lại", "Back", "返回")} data-testid="button-club-back"><ArrowLeft className="w-5 h-5" /></button>
          <Emblem c={c} size={60} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-2xl text-white leading-tight break-words" data-testid="club-name">{c.name}</div>
            <div className="text-xs font-black" style={{ color: c.color }}>[{c.tag}] <span className="text-white/60 font-bold">· {c.open ? tr("Mở", "Open", "開放") : tr("Cần duyệt", "Approval", "需審核")}</span></div>
            {c.description && <p className="text-xs text-white/80 mt-1 break-words">{c.description}</p>}
          </div>
          {role === "owner" && <button type="button" onClick={() => setEditing(true)} className="w-9 h-9 rounded-xl bg-black/30 flex items-center justify-center text-white/80" aria-label={tr("Cài đặt hội", "Club settings", "公會設定")} data-testid="button-club-settings"><Settings className="w-5 h-5" /></button>}
        </div>
        <div className="relative grid grid-cols-3 gap-1.5 mt-3">
          <div className="rounded-xl bg-black/35 text-center py-1.5"><div className="text-[9px] font-black uppercase text-white/50">{tr("Hạng tuần", "Week rank", "週排名")}</div><div className="font-black text-yellow-200" data-testid="club-rank">#{c.rank}</div></div>
          <div className="rounded-xl bg-black/35 text-center py-1.5"><div className="text-[9px] font-black uppercase text-white/50">XP</div><div className="font-black text-yellow-200">{fmtCoins(c.weeklyXp)}</div></div>
          <div className="rounded-xl bg-black/35 text-center py-1.5"><div className="text-[9px] font-black uppercase text-white/50">{tr("Thành viên", "Members", "成員")}</div><div className="font-black text-yellow-200">{c.members.length}/{c.maxMembers}</div></div>
        </div>
        <div className="relative mt-2 flex items-center justify-between gap-2">
          <WeekCountdown start={c.weekStart} />
          {!role && !c.me.inOtherClub && (
            c.me.requested ? (
              <button type="button" disabled={act.isPending} onClick={() => act.mutate({ path: "cancel-request" })} className="h-10 px-4 rounded-xl bg-white/10 text-white text-sm font-black">{tr("Huỷ yêu cầu", "Cancel request", "取消申請")}</button>
            ) : (
              <button type="button" disabled={act.isPending || full} onClick={() => act.mutate({ path: "join" })} className="h-10 px-4 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-sm font-black disabled:opacity-40" data-testid="button-club-join">
                {full ? tr("Hội đã đầy", "Club is full", "公會已滿") : c.open ? tr("Vào hội", "Join club", "加入公會") : tr("Xin vào hội", "Ask to join", "申請加入")}
              </button>
            )
          )}
        </div>
      </div>

      {role && (
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
          {([["chat", tr("Trò chuyện", "Chat", "聊天")], ["members", tr("Thành viên", "Members", "成員")], ["activity", tr("Hoạt động", "Activity", "動態")]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`relative py-2 rounded-xl text-xs font-black ${tab === k ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "text-white/70"}`} data-testid={`club-tab-${k}`}>
              {label}{k === "members" && c.requests.length > 0 && <span className="absolute top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">{c.requests.length}</span>}
            </button>
          ))}
        </div>
      )}
      {role && tab === "chat" ? <ClubChat id={id} /> : (!role || tab === "members") ? <MembersList c={c} onAct={(path, body) => act.mutate({ path, body })} busy={act.isPending} /> : <ClubActivity id={id} />}

      {role && (
        <button type="button" disabled={act.isPending} onClick={() => {
          if (role === "owner" && c.members.length > 1) { toast({ title: tr("Hãy chuyển hội cho thành viên khác trước", "Hand the club to another member first", "請先把公會轉讓給其他成員") }); return; }
          if (confirm(role === "owner" ? tr("Bạn là người cuối cùng, rời đi sẽ giải tán hội. Tiếp tục?", "You're the last member: leaving disbands the club. Continue?", "你是最後一位成員，離開將解散公會。要繼續嗎？") : tr(`Rời hội ${c.name}?`, `Leave ${c.name}?`, `要離開 ${c.name} 嗎？`))) act.mutate({ path: "leave" });
        }} className="self-center text-xs text-red-300/80 font-bold flex items-center gap-1 py-2" data-testid="button-club-leave"><LogOut className="w-3.5 h-3.5" />{tr("Rời hội", "Leave club", "離開公會")}</button>
      )}
      {createPortal(<AnimatePresence>{editing && <EditClubSheet c={c} onClose={() => setEditing(false)} onDisband={() => { setEditing(false); if (confirm(tr("Giải tán hội? Không thể hoàn tác và không hoàn phí.", "Disband the club? This can't be undone and the fee isn't refunded.", "要解散公會嗎？此操作無法復原，費用也不會退還。"))) act.mutate({ path: "disband" }); }} onSaved={refresh} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function MembersList({ c, onAct, busy }: { c: ClubDetail; onAct: (path: string, body: unknown) => void; busy: boolean }) {
  const { tr } = useLang();
  const showPlayer = usePlayerSheet();
  const gameName = useGameName();
  const roleName = useRoleName();
  const { user } = useAuth();
  const [manage, setManage] = useState<Member | null>(null);
  const role = c.me.role;
  const canManage = (m: Member) => !!role && m.username !== user?.username && (["kick", "promote", "demote", "transfer"] as const).some((a) => clubAllowed(role, a, m.role));
  return (
    <div className="flex flex-col gap-3">
      {c.requests.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-br from-yellow-500/15 to-orange-600/10 border border-yellow-400/40 p-2.5" data-testid="club-requests">
          <h3 className="text-xs font-black text-yellow-200 px-1 mb-1">{tr("Xin vào hội", "Join requests", "入會申請")} ({c.requests.length})</h3>
          {c.requests.map((r) => (
            <div key={r.username} className="flex items-center gap-2.5 px-1 py-1.5">
              <Avatar user={r} size={36} onClick={() => showPlayer(r.username)} />
              <span className="flex-1 min-w-0 flex items-center gap-1.5"><span className="font-bold text-white truncate">{r.username}</span><LevelBadge level={r.level} /></span>
              <button type="button" disabled={busy} onClick={() => onAct("requests", { username: r.username, accept: true })} className="h-9 px-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-xs font-black" data-testid={`club-accept-${r.username}`}>{tr("Nhận", "Accept", "接受")}</button>
              <button type="button" disabled={busy} onClick={() => onAct("requests", { username: r.username, accept: false })} className="h-9 w-9 rounded-xl bg-white/10 text-white/70 flex items-center justify-center" aria-label={tr("Từ chối", "Decline", "拒絕")}><X className="w-4 h-4" /></button>
            </div>
          ))}
        </section>
      )}
      <section className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="club-members">
        <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
          <h3 className="text-xs font-black text-white/80 flex items-center gap-1.5"><Users className="w-4 h-4 text-yellow-300" />{tr("Thành viên", "Members", "成員")} ({c.members.length}/{c.maxMembers})</h3>
          <span className="text-[10px] text-white/45">{tr("XP tuần này", "XP this week", "本週 XP")}</span>
        </div>
        {c.members.map((m) => {
          const playing = gameName(m.playing);
          return (
            <div key={m.username} className="flex items-center gap-2.5 px-3 py-2 border-t border-white/5" data-testid={`club-member-${m.username}`}>
              <Avatar user={m} size={40} online={m.online} onClick={() => showPlayer(m.username)} />
              <button type="button" onClick={() => showPlayer(m.username)} className="flex-1 min-w-0 text-left">
                <span className="flex items-center gap-1 min-w-0"><RoleIcon role={m.role} /><span className="font-black text-white truncate">{m.username}</span><LevelBadge level={m.level} /></span>
                <span className={`block text-[10px] truncate ${playing ? "text-yellow-200" : m.online ? "text-emerald-300" : "text-white/40"}`}>{roleName(m.role)} · {playing ? `🎮 ${playing}` : m.online ? tr("Online", "Online", "在線") : tr("Ngoại tuyến", "Offline", "離線")}</span>
              </button>
              <span className="text-xs font-black text-yellow-300 shrink-0">{fmtCoins(m.weeklyXp)}</span>
              {canManage(m) && <button type="button" onClick={() => setManage(m)} className="h-8 w-8 rounded-lg bg-white/10 text-white/70 flex items-center justify-center" aria-label={tr("Quản lý", "Manage", "管理")} data-testid={`club-manage-${m.username}`}><Shield className="w-4 h-4" /></button>}
            </div>
          );
        })}
      </section>
      {createPortal(<AnimatePresence>{manage && role && (
        <Sheet title={manage.username} onClose={() => setManage(null)} testid="club-manage-sheet">
          <div className="p-4 flex flex-col gap-2">
            {clubAllowed(role, "promote", manage.role) && <button type="button" onClick={() => { onAct("members", { action: "promote", username: manage.username }); setManage(null); }} className="h-11 rounded-xl bg-sky-500/25 text-sky-100 font-black">⭐ {tr("Phong phó hội", "Make officer", "升為幹部")}</button>}
            {clubAllowed(role, "demote", manage.role) && <button type="button" onClick={() => { onAct("members", { action: "demote", username: manage.username }); setManage(null); }} className="h-11 rounded-xl bg-white/10 text-white font-black">{tr("Thôi phó hội", "Remove officer", "取消幹部")}</button>}
            {clubAllowed(role, "transfer", manage.role) && <button type="button" onClick={() => { if (confirm(tr(`Chuyển hội cho ${manage.username}? Bạn sẽ thành phó hội.`, `Hand the club to ${manage.username}? You'll become an officer.`, `要把公會轉讓給 ${manage.username} 嗎？你將成為幹部。`))) onAct("members", { action: "transfer", username: manage.username }); setManage(null); }} className="h-11 rounded-xl bg-yellow-500/25 text-yellow-100 font-black">👑 {tr("Chuyển trưởng hội", "Make owner", "轉讓會長")}</button>}
            {clubAllowed(role, "kick", manage.role) && <button type="button" onClick={() => { if (confirm(tr(`Mời ${manage.username} ra khỏi hội?`, `Remove ${manage.username} from the club?`, `要將 ${manage.username} 移出公會嗎？`))) onAct("members", { action: "kick", username: manage.username }); setManage(null); }} className="h-11 rounded-xl bg-red-600/30 text-red-100 font-black">{tr("Mời ra khỏi hội", "Remove from club", "移出公會")}</button>}
          </div>
        </Sheet>
      )}</AnimatePresence>, document.body)}
    </div>
  );
}

function EditClubSheet({ c, onClose, onDisband, onSaved }: { c: ClubDetail; onClose: () => void; onDisband: () => void; onSaved: () => void }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const list = useQuery<ClubsView>({ queryKey: CLUBS_KEY });
  const [description, setDescription] = useState(c.description ?? "");
  const [emblem, setEmblem] = useState(c.emblem);
  const [color, setColor] = useState(c.color);
  const [open, setOpen] = useState(c.open);
  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/clubs/${c.id}`, { description: description.trim() || null, emblem, color, open }),
    onSuccess: () => { toast({ title: tr("Đã lưu", "Saved", "已儲存") }); onSaved(); onClose(); },
    onError: (e) => toast({ title: err(e), variant: "destructive" }),
  });
  return (
    <Sheet title={tr("Cài đặt hội", "Club settings", "公會設定")} icon={<Settings className="w-5 h-5 text-yellow-300" />} onClose={onClose} testid="edit-club-sheet">
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-8 gap-1">
          {(list.data?.emblems ?? [c.emblem]).map((e) => <button key={e} type="button" onClick={() => setEmblem(e)} className={`h-9 rounded-xl text-xl ${emblem === e ? "bg-yellow-400/30 ring-2 ring-yellow-300" : "bg-white/5"}`}>{e}</button>)}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(list.data?.colors ?? [c.color]).map((x) => <button key={x} type="button" onClick={() => setColor(x)} className={`w-9 h-9 rounded-full border-2 ${color === x ? "border-white scale-110" : "border-transparent"}`} style={{ background: x }} aria-label={x} />)}
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CLUB_DESC_MAX} rows={2} placeholder={tr("Giới thiệu", "Description", "簡介")} className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-white text-sm resize-none" />
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
          <button type="button" onClick={() => setOpen(true)} className={`py-2 rounded-xl text-xs font-black ${open ? "bg-white/15 text-yellow-200" : "text-white/60"}`}>🔓 {tr("Ai cũng vào được", "Anyone can join", "任何人可加入")}</button>
          <button type="button" onClick={() => setOpen(false)} className={`py-2 rounded-xl text-xs font-black ${!open ? "bg-white/15 text-yellow-200" : "text-white/60"}`}>🔒 {tr("Cần duyệt", "Approval", "需審核")}</button>
        </div>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black">{save.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : tr("Lưu", "Save", "儲存")}</button>
        <button type="button" onClick={onDisband} className="h-11 rounded-2xl bg-red-700/40 border border-red-400/40 text-red-100 font-black text-sm" data-testid="button-club-disband">{tr("Giải tán hội", "Disband club", "解散公會")}</button>
      </div>
    </Sheet>
  );
}

function ClubActivity({ id }: { id: number }) {
  const { tr } = useLang();
  const ago = useAgo();
  const text = useFeedText();
  const showPlayer = usePlayerSheet();
  const q = useQuery<{ items: FeedItem[] }>({ queryKey: [`/api/clubs/${id}/activity`], refetchInterval: 60_000 });
  if (!q.data) return <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-8" />;
  if (!q.data.items.length) return <p className="rounded-2xl bg-black/30 border border-white/10 px-4 py-8 text-center text-sm text-white/55">{tr("Chưa có gì. Thắng lớn để lên đây!", "Nothing yet. Win big to show up here!", "目前沒有動態，贏大獎就會出現在這裡！")}</p>;
  return (
    <section className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden" data-testid="club-activity">
      {q.data.items.map((it) => {
        const t = text(it);
        return (
          <div key={it.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
            <Avatar user={it.user} size={34} onClick={() => showPlayer(it.user.username)} />
            <div className="flex-1 min-w-0 text-[13px] text-white/80 leading-snug">{t.icon} {t.text}</div>
            <span className="text-[10px] text-white/40 shrink-0">{ago(it.at)}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------------- Club chat ----------------

function ClubChat({ id }: { id: number }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const { user } = useAuth();
  const { connected } = useSocial();
  const showPlayer = usePlayerSheet();
  const [msgs, setMsgs] = useState<ClubMsg[]>([]);
  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"] });
  const owned = useMemo(() => STICKERS.filter((s) => (album.data?.owned[s.id] ?? 0) > 0), [album.data]);
  const toBottom = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
  const add = useCallback((incoming: ClubMsg[], gone: number[] = []) => {
    setMsgs((cur) => {
      const g = new Set(gone);
      const seen = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) seen.set(m.id, m);
      const next = [...seen.values()].filter((m) => !g.has(m.id)).sort((a, b) => a.id - b.id).slice(-150);
      if (next.length) lastId.current = Math.max(lastId.current, next[next.length - 1].id);
      return next;
    });
    if (incoming.length) toBottom();
  }, []);
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    let first = true;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await (await apiRequest("GET", `/api/clubs/${id}/chat${first ? "" : `?after=${lastId.current}`}`)).json() as { messages: ClubMsg[]; removed: number[] };
        first = false;
        add(r.messages, r.removed);
      } catch { /* try again */ }
      timer = window.setTimeout(poll, connected ? 20_000 : 3000);
    };
    void poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, connected, add]);
  useSocialEvent((m) => {
    if (m.t === "club_chat" && m.clubId === id) add([m.m]);
    else if (m.t === "club_chat_removed" && m.clubId === id) setMsgs((cur) => cur.filter((x) => !m.ids.includes(x.id)));
  });
  const post = async (body: { text?: string; sticker?: string }) => {
    setSending(true);
    try {
      const m = await (await apiRequest("POST", `/api/clubs/${id}/chat`, body)).json() as ClubMsg;
      add([m]); setText(""); setTray(false);
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setSending(false); }
  };
  const report = async (mid: number) => {
    setActive(null);
    try { await apiRequest("POST", `/api/clubs/chat/${mid}/report`); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  return (
    <div className="flex flex-col gap-2" data-testid="club-chat">
      <div ref={listRef} className={`${tray ? "h-[calc(100dvh-600px)]" : "h-[calc(100dvh-480px)]"} min-h-[220px] overflow-y-auto overscroll-contain rounded-2xl bg-black/40 border border-white/10 p-2.5 flex flex-col gap-2`}>
        {msgs.length === 0 && <p className="m-auto text-sm text-white/50 text-center px-4">{tr("Chào cả hội một câu đi! 👋", "Say hello to your club! 👋", "跟公會成員打聲招呼吧！👋")}</p>}
        {msgs.map((m) => {
          const mine = m.username === user?.username;
          const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
          return (
            <div key={m.id} className={`flex items-start gap-1.5 max-w-[88%] ${mine ? "self-end flex-row-reverse" : "self-start"}`} data-testid={`club-msg-${m.id}`}>
              <Avatar user={{ username: m.username, avatarUrl: m.avatar }} size={28} onClick={() => showPlayer(m.username)} />
              <div className={`flex flex-col min-w-0 ${mine ? "items-end" : "items-start"}`}>
                <button type="button" onClick={() => showPlayer(m.username)} className="text-[10px] font-black px-1 flex items-center gap-1 text-white/70">
                  {m.role && <RoleIcon role={m.role} />}<span>{m.username}</span><LevelBadge level={m.level} />
                  <span className="text-white/30 font-normal">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </button>
                <button type="button" onClick={() => setActive((a) => (a === m.id ? null : m.id))} className="text-left">
                  {st ? <div className="text-5xl leading-none py-1" title={loc(st)}>{st.emoji}</div> : (
                    <div className={`px-3 py-1.5 rounded-2xl text-sm break-words [overflow-wrap:anywhere] ${mine ? "bg-gradient-to-b from-yellow-400 to-orange-500 text-black rounded-br-md" : "bg-white/10 text-white rounded-bl-md"}`}>{m.text}</div>
                  )}
                </button>
                {active === m.id && !mine && (
                  <button type="button" onClick={() => report(m.id)} className="mt-1 h-8 px-3 rounded-full bg-[#2a1748] border border-red-400/40 text-red-200 text-[11px] font-black flex items-center gap-1" data-testid={`club-report-${m.id}`}><Flag className="w-3.5 h-3.5" />{tr("Báo cáo", "Report", "檢舉")}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {tray && (
        <div className="rounded-2xl bg-black/60 border border-white/10 p-2">
          {owned.length === 0 ? <p className="text-xs text-white/50">{tr("Bạn chưa có sticker nào. Mở gói trong Album!", "No stickers yet. Open a pack in the Album!", "你還沒有貼圖。到圖鑑開卡包吧！")}</p> : (
            <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto">
              {owned.map((s) => <button key={s.id} type="button" disabled={sending} onClick={() => post({ sticker: s.id })} className="text-3xl rounded-xl bg-white/5 py-1 active:scale-90">{s.emoji}</button>)}
            </div>
          )}
        </div>
      )}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void post({ text }); }}>
        <button type="button" onClick={() => setTray((v) => !v)} className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tray ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`} aria-label={tr("Sticker", "Stickers", "貼圖")}><Smile className="w-5 h-5" /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX_LEN} placeholder={tr("Nhắn cho cả hội…", "Message your club…", "傳訊息給公會…")} enterKeyHint="send"
          className="flex-1 min-w-0 rounded-xl bg-[#140b26] border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-club-chat" />
        <button type="submit" disabled={sending || !text.trim()} className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={tr("Gửi", "Send", "發送")} data-testid="button-club-chat-send">
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
      <p className="text-[10px] text-white/40 text-center">{tr("Lịch sự nhé. Không mua bán xu, không gửi link hay số điện thoại.", "Be kind. No selling coins, no links, no phone numbers.", "請保持禮貌。禁止買賣金幣，禁止發送連結或電話號碼。")}</p>
    </div>
  );
}
