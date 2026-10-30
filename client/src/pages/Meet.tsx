import { useEffect, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Heart, Loader2, MessageCircle, ShieldAlert } from "lucide-react";
import { Header } from "@/components/Header";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { COUNTRY_BY_CODE } from "@shared/social3";
import {
  DATING_MIN_AGE, DATING_MAX_AGE, DATING_MIN_GAMES, DATING_MIN_ACCOUNT_DAYS, LOOKING_FOR, GENDERS, LOOKING_FOR_TEXT, GENDER_TEXT,
  type DatingMe, type DatingPerson, type Gender, type LookingFor,
} from "@shared/dating";

const ME_KEY = ["/api/dating/me"];
const PEOPLE_KEY = ["/api/dating/people"];
const MATCHES_KEY = ["/api/dating/matches"];

export default function Meet() {
  const { user } = useAuth();
  const { tr } = useLang();
  const me = useQuery<DatingMe>({ queryKey: ME_KEY, enabled: !!user });
  const [editing, setEditing] = useState(false);
  if (!user) return <Redirect to="/auth?next=%2Fmeet" />;
  const showSettings = editing || (me.data && !me.data.open);
  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />
      <div className="mx-auto max-w-md px-3 py-4 flex flex-col gap-3" data-testid="meet-page">
        <div className="text-center">
          <h1 className="font-display text-3xl text-yellow-300">💛 {tr("Làm quen", "Meet", "交友")}</h1>
          <p className="text-xs text-white/60">{tr("Gặp gỡ người lớn khác, cùng trò chuyện và chơi. Chỉ dành cho 18+.", "Meet other adults, chat and play together. 18+ only.", "認識其他成年人，一起聊天和玩。限18歲以上。")}</p>
        </div>
        <SafetyNote />
        {me.isLoading || !me.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-300 mx-auto mt-6" /> : (
          <>
            {showSettings ? <Settings me={me.data} onDone={() => setEditing(false)} /> : (
              <button type="button" onClick={() => setEditing(true)} className="self-end text-xs font-bold text-white/60 underline" data-testid="meet-edit">
                {tr("Sửa cài đặt làm quen", "Edit my Meet settings", "編輯交友設定")}
              </button>
            )}
            {me.data.open && <Matches />}
            {me.data.open && <People />}
          </>
        )}
      </div>
    </div>
  );
}

function SafetyNote() {
  const { tr } = useLang();
  return (
    <div className="rounded-2xl p-3 bg-amber-500/10 border border-amber-300/30 flex gap-2 text-[12px] text-amber-100" data-testid="meet-safety">
      <ShieldAlert className="w-5 h-5 shrink-0 text-amber-300" />
      <p>{tr(
        "Đừng bao giờ gửi tiền, thẻ quà tặng hay mã xác minh cho người quen trên mạng, dù họ kể chuyện gì. Thấy ai đáng ngờ: chặn và báo cáo.",
        "Never send money, gift cards or verification codes to someone you met online, whatever their story. If someone seems off: block and report.",
        "無論對方說什麼，千萬不要匯錢、送禮品卡或提供驗證碼給網上認識的人。覺得可疑就封鎖並檢舉。")}</p>
    </div>
  );
}

function Settings({ me, onDone }: { me: DatingMe; onDone: () => void }) {
  const { tr, loc, srv } = useLang();
  const { toast } = useToast();
  const year = new Date().getFullYear();
  const [lookingFor, setLookingFor] = useState<LookingFor>(me.lookingFor);
  const [birthYear, setBirthYear] = useState<number>(me.birthYear ?? year - 30);
  const [gender, setGender] = useState<Gender | null>(me.gender);
  const [seeking, setSeeking] = useState<Gender[]>(me.seeking);
  const [ageMin, setAgeMin] = useState(me.ageMin);
  const [ageMax, setAgeMax] = useState(me.ageMax);
  const save = useMutation({
    mutationFn: async (open: boolean) => (await apiRequest("PUT", "/api/dating/me", { open, lookingFor, birthYear, gender, seeking, ageMin, ageMax })).json() as Promise<DatingMe>,
    onSuccess: (d) => { queryClient.setQueryData(ME_KEY, d); queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }); onDone(); },
    onError: (e: Error) => toast({ title: /not_eligible/.test(e.message) ? tr("Bạn chưa đủ điều kiện", "Not quite yet", "還不符合條件") : srv(e.message), variant: "destructive" }),
  });
  const years = Array.from({ length: DATING_MAX_AGE - DATING_MIN_AGE }, (_, i) => year - DATING_MIN_AGE - 1 - i);
  const chip = (on: boolean) => `px-3 py-2 rounded-xl text-sm font-black ${on ? "bg-yellow-400 text-black" : "bg-white/5 text-white/75"}`;
  const n = me.needs;
  return (
    <div className="rounded-3xl p-4 bg-black/40 border border-yellow-400/25 flex flex-col gap-3" data-testid="meet-settings">
      {!me.eligible && (
        <div className="rounded-2xl p-3 bg-white/5 text-[12px] text-white/80" data-testid="meet-needs">
          <p className="font-black text-white mb-1">{tr("Để bật Làm quen, bạn cần:", "To switch on Meet you need:", "開啟交友前你需要：")}</p>
          <ul className="list-disc ml-4 space-y-0.5">
            {n.photo && <li>{tr("Một ảnh đại diện thật", "A real profile photo", "一張真實的頭像")} (<Link href="/profile" className="underline text-yellow-200">{tr("thêm ảnh", "add one", "上傳")}</Link>)</li>}
            {n.games > 0 && <li>{tr(`Chơi thêm ${n.games} ván (tổng ${DATING_MIN_GAMES})`, `${n.games} more games played (${DATING_MIN_GAMES} in all)`, `再玩 ${n.games} 局（共 ${DATING_MIN_GAMES} 局）`)}</li>}
            {n.days > 0 && <li>{tr(`Tài khoản được ${DATING_MIN_ACCOUNT_DAYS} ngày (còn ${n.days} ngày)`, `An account at least ${DATING_MIN_ACCOUNT_DAYS} days old (${n.days} to go)`, `帳號滿 ${DATING_MIN_ACCOUNT_DAYS} 天（還差 ${n.days} 天）`)}</li>}
          </ul>
          <p className="mt-1 text-white/50">{tr("Giúp chặn tài khoản lừa đảo.", "It keeps scam accounts out.", "這能擋住詐騙帳號。")}</p>
        </div>
      )}
      <Field label={tr("Bạn tìm", "Looking for", "想找")}>
        {LOOKING_FOR.map((k) => <button key={k} type="button" onClick={() => setLookingFor(k)} className={chip(lookingFor === k)} data-testid={`meet-looking-${k}`}>{LOOKING_FOR_TEXT[k].icon} {loc(LOOKING_FOR_TEXT[k])}</button>)}
      </Field>
      <Field label={tr("Bạn là", "I am", "我是")}>
        {GENDERS.map((g) => <button key={g} type="button" onClick={() => setGender(g)} className={chip(gender === g)} data-testid={`meet-gender-${g}`}>{loc(GENDER_TEXT[g])}</button>)}
      </Field>
      <Field label={tr("Muốn gặp", "Want to meet", "想認識")}>
        <button type="button" onClick={() => setSeeking([])} className={chip(!seeking.length)}>{tr("Bất kỳ ai", "Anyone", "任何人")}</button>
        {GENDERS.map((g) => <button key={g} type="button" onClick={() => setSeeking((s) => s.includes(g) ? s.filter((x) => x !== g) : [...s, g])} className={chip(seeking.includes(g))} data-testid={`meet-seeking-${g}`}>{loc(GENDER_TEXT[g])}</button>)}
      </Field>
      <div className="grid grid-cols-3 gap-2 text-xs text-white/70">
        <label className="flex flex-col gap-1">{tr("Năm sinh", "Born", "出生年")}
          <select value={birthYear} onChange={(e) => setBirthYear(Number(e.target.value))} className="rounded-xl bg-white/10 px-2 py-2 text-white" data-testid="meet-birth-year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">{tr("Tuổi từ", "Age from", "年齡從")}
          <input type="number" min={DATING_MIN_AGE} max={DATING_MAX_AGE} value={ageMin} onChange={(e) => setAgeMin(Math.max(DATING_MIN_AGE, Math.min(DATING_MAX_AGE, Number(e.target.value) || DATING_MIN_AGE)))} className="rounded-xl bg-white/10 px-2 py-2 text-white" />
        </label>
        <label className="flex flex-col gap-1">{tr("đến", "to", "到")}
          <input type="number" min={DATING_MIN_AGE} max={DATING_MAX_AGE} value={ageMax} onChange={(e) => setAgeMax(Math.max(DATING_MIN_AGE, Math.min(DATING_MAX_AGE, Number(e.target.value) || DATING_MAX_AGE)))} className="rounded-xl bg-white/10 px-2 py-2 text-white" />
        </label>
      </div>
      <p className="text-[11px] text-white/45">{tr("Người khác thấy ảnh, tên, tuổi, phần giới thiệu và quốc gia (nếu bạn không ẩn) trong hồ sơ của bạn.", "Others see your photo, name, age, about-me and country (unless you hide it) from your profile.", "其他人會看到你的頭像、名字、年齡、自我介紹和國家（除非你隱藏）。")}</p>
      <div className="grid grid-cols-2 gap-2">
        {me.open && <button type="button" disabled={save.isPending} onClick={() => save.mutate(false)} className="rounded-2xl py-3 font-black text-white bg-white/10" data-testid="meet-off">{tr("Tắt Làm quen", "Switch off", "關閉交友")}</button>}
        <button type="button" disabled={save.isPending || !gender || ageMin > ageMax || !me.eligible} onClick={() => save.mutate(true)}
          className={`rounded-2xl py-3 font-black text-black bg-gradient-to-b from-yellow-300 to-orange-500 disabled:opacity-40 flex items-center justify-center gap-2 ${me.open ? "" : "col-span-2"}`} data-testid="meet-on">
          {save.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>💛 {me.open ? tr("Lưu", "Save", "儲存") : tr("Bật Làm quen", "Switch on Meet", "開啟交友")}</>}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><span className="text-xs font-bold text-white/60">{label}</span><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}

function Matches() {
  const { tr } = useLang();
  const [, setLocation] = useLocation();
  const q = useQuery<{ matches: { username: string; avatarUrl: string | null; online: boolean }[] }>({ queryKey: MATCHES_KEY, refetchInterval: 30_000 });
  const list = q.data?.matches ?? [];
  if (!list.length) return null;
  return (
    <div className="rounded-3xl p-3 bg-gradient-to-br from-pink-600/25 to-purple-900/40 border border-pink-300/30" data-testid="meet-matches">
      <p className="text-sm font-black text-pink-100 mb-2">💛 {tr("Đã thích nhau", "Your matches", "互相喜歡")}</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {list.map((m) => (
          <button key={m.username} type="button" onClick={() => setLocation(`/community?tab=dm&dm=${encodeURIComponent(m.username)}`)} className="flex flex-col items-center gap-1 shrink-0 w-16" data-testid={`meet-match-${m.username}`}>
            <Avatar user={{ username: m.username, avatarUrl: m.avatarUrl }} size={52} online={m.online} ring />
            <span className="text-[11px] text-white truncate w-full text-center">{m.username}</span>
            <MessageCircle className="w-4 h-4 text-pink-200" />
          </button>
        ))}
      </div>
    </div>
  );
}

function People() {
  const { tr, loc, srv } = useLang();
  const { toast } = useToast();
  const showPlayer = usePlayerSheet();
  const q = useQuery<{ people: DatingPerson[] }>({ queryKey: PEOPLE_KEY, refetchInterval: 60_000 });
  const like = useMutation({
    mutationFn: async ({ username, on }: { username: string; on: boolean }) =>
      (await apiRequest(on ? "POST" : "DELETE", `/api/dating/like/${encodeURIComponent(username)}`)).json() as Promise<{ liked: boolean; matched: boolean }>,
    onSuccess: (r, v) => {
      queryClient.setQueryData<{ people: DatingPerson[] }>(PEOPLE_KEY, (d) => d && { people: d.people.map((p) => p.username === v.username ? { ...p, liked: r.liked, matched: r.matched } : p) });
      if (r.matched) {
        toast({ title: tr(`💛 Hai bạn đã thích nhau: ${v.username}!`, `💛 It's a match with ${v.username}!`, `💛 你和 ${v.username} 互相喜歡！`), description: tr("Giờ hai bạn có thể nhắn tin riêng.", "You can message each other now.", "你們現在可以私訊了。") });
        queryClient.invalidateQueries({ queryKey: MATCHES_KEY });
      }
    },
    onError: (e: Error) => toast({ title: srv(e.message), variant: "destructive" }),
  });
  useEffect(() => { /* refresh when the page opens */ q.refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isLoading) return <Loader2 className="w-7 h-7 animate-spin text-yellow-300 mx-auto mt-4" />;
  const people = q.data?.people ?? [];
  if (!people.length) return <p className="text-center text-sm text-white/55 py-6" data-testid="meet-empty">{tr("Chưa có ai phù hợp lúc này. Quay lại sau nhé!", "Nobody who fits your settings yet. Check back soon!", "目前還沒有符合條件的人，晚點再來看看！")}</p>;
  return (
    <div className="grid grid-cols-2 gap-2.5" data-testid="meet-people">
      {people.map((p) => {
        const c = p.country ? COUNTRY_BY_CODE.get(p.country) : null;
        return (
          <motion.div key={p.username} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl p-3 bg-black/40 border border-white/10 flex flex-col items-center gap-1.5 text-center" data-testid={`meet-person-${p.username}`}>
            <Avatar user={{ username: p.username, avatarUrl: p.avatarUrl }} size={84} online={p.online} onClick={() => showPlayer(p.username)} />
            <button type="button" onClick={() => showPlayer(p.username)} className="font-black text-white truncate max-w-full">{p.username}{p.age ? `, ${p.age}` : ""}</button>
            <p className="text-[11px] text-white/60">{c ? `${c.flag} ` : ""}{LOOKING_FOR_TEXT[p.lookingFor].icon} {loc(LOOKING_FOR_TEXT[p.lookingFor])}</p>
            {p.bio && <p className="text-[11px] text-white/75 line-clamp-3">{p.bio}</p>}
            <button type="button" disabled={like.isPending} onClick={() => like.mutate({ username: p.username, on: !p.liked })}
              className={`mt-auto w-full rounded-2xl py-2 font-black text-sm flex items-center justify-center gap-1.5 ${p.matched ? "bg-pink-500 text-white" : p.liked ? "bg-pink-500/30 text-pink-100" : "bg-white/10 text-white"}`} data-testid={`meet-like-${p.username}`}>
              <Heart className={`w-4 h-4 ${p.liked ? "fill-current" : ""}`} />
              {p.matched ? tr("Đã thích nhau", "Matched", "互相喜歡") : p.liked ? tr("Đã thích", "Liked", "已喜歡") : tr("Thích", "Like", "喜歡")}
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
