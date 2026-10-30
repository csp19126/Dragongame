import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Loader2, Lock, Save, Sparkles } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { ALL_ACHIEVEMENTS } from "@/components/slot/achievements";
import { BIO_MAX, SHOWCASE_MAX, PLAYABLE, type PrivacySettings } from "@shared/friends";
import { COUNTRIES, PROFILE_LANGUAGES, PLAY_STYLES } from "@shared/social3";
import { useLangName, usePlayStyleName } from "@/components/Social3Bits";

interface Settings {
  bio: string | null; favGame: string | null; showcase: string[]; privacy: PrivacySettings; badges: string[];
  country: string | null; favGames: string[]; languages: string[]; playStyle: string | null;
  level: { level: number; xp: number; from: number; to: number; progress: number };
}
const KEY = ["/api/social/settings"];
const BADGE_ICON: Record<string, string> = { star: "⭐", flame: "🔥", zap: "⚡", crown: "👑", gem: "💎", trophy: "🏆", target: "🎯", gift: "🎁", mail: "🧧", sparkles: "✨", repeat: "🔁" };

function useErr() {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const codes: Record<string, string> = {
    long: tr(`Tối đa ${BIO_MAX} ký tự.`, `${BIO_MAX} characters at most.`, `最多 ${BIO_MAX} 個字。`),
    muted: tr("Bạn đang bị tạm khóa chat.", "You're muted for now.", "你目前被暫時禁言。"),
    play_first: tr("Chơi vài ván trước đã nhé.", "Play a few games first.", "先玩幾局再來吧。"),
    slow_down: tr("Bạn đổi nhiều quá, mai thử lại nhé.", "That's a lot of changes, try again tomorrow.", "修改太多次了，明天再試吧。"),
  };
  return (e: unknown) => toast({ title: e instanceof ApiError ? codes[e.message] ?? srv(e.message) : String(e), variant: "destructive" });
}

/** Profile › your social card: bio, favourite game, badge showcase and level */
export function SocialProfileCard() {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const fail = useErr();
  const q = useQuery<Settings>({ queryKey: KEY });
  const [bio, setBio] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [show, setShow] = useState<string[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [langs, setLangs] = useState<string[]>([]);
  const [style, setStyle] = useState<string | null>(null);
  const langName = useLangName();
  const styleName = usePlayStyleName();
  useEffect(() => {
    if (!q.data) return;
    setBio(q.data.bio ?? ""); setShow(q.data.showcase); setCountry(q.data.country); setLangs(q.data.languages); setStyle(q.data.playStyle);
    setFavs(q.data.favGames.length ? q.data.favGames : q.data.favGame ? [q.data.favGame] : []);
  }, [q.data]);
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/social/profile", { bio, favGame: favs[0] ?? null, favGames: favs, showcase: show, country, languages: langs, playStyle: style })).json(),
    onSuccess: () => {
      toast({ title: tr("Đã lưu hồ sơ", "Profile saved", "個人檔案已儲存") });
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/players/") });
    },
    onError: fail,
  });
  if (!q.data) return <div className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-yellow-400" /></div>;
  const s = q.data;
  const earned = ALL_ACHIEVEMENTS.filter((a) => s.badges.includes(a.id));

  return (
    <div className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 space-y-4" data-testid="card-social-profile">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex flex-col items-center justify-center leading-none shadow-[0_0_18px_rgba(250,204,21,0.35)]">
          <span className="text-[9px] font-black uppercase">{tr("Cấp", "Level", "等級")}</span>
          <span className="text-2xl font-black" data-testid="text-my-level">{s.level.level}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-yellow-200 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{tr("Hồ sơ cộng đồng", "Community profile", "社群個人檔案")}</div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-1.5"><div className="h-full bg-gradient-to-r from-yellow-300 to-orange-500" style={{ width: `${Math.round(s.level.progress * 100)}%` }} /></div>
          <div className="text-[10px] text-white/50 mt-1">{fmtCoins(s.level.xp)} / {fmtCoins(s.level.to)} XP · {tr("1 XP cho mỗi 1.000 xu đặt cược", "1 XP for every 1,000 coins you bet", "每押注 1,000 金幣得 1 XP")}</div>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr("Giới thiệu bản thân", "About me", "關於我")}</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} rows={3} placeholder={tr("Ví dụ: Dân Hà Nội ở Leeds, mê bi-a, hay chơi tối thứ Sáu 🎱", "e.g. From Hanoi, living in Leeds. Pool most Friday nights 🎱", "例如：河內人，住在利茲，週五晚上常打撞球 🎱")}
          className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-white placeholder:text-white/30 resize-none" data-testid="input-bio" />
        <span className="block text-right text-[10px] text-white/40">{bio.length}/{BIO_MAX}</span>
      </label>

      <div className="space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr("Trò chơi yêu thích (chọn nhiều)", "Favourite games (pick any)", "最愛的遊戲（可複選）")}</span>
        <div className="flex flex-wrap gap-1.5" data-testid="fav-picker">
          {PLAYABLE.map((g) => (
            <button key={g.id} type="button" onClick={() => setFavs(flip(favs, g.id))}
              className={`h-8 px-2.5 rounded-full text-xs font-bold border ${favs.includes(g.id) ? "bg-yellow-400 text-black border-yellow-300" : "bg-white/5 text-white/75 border-white/10"}`} data-testid={`fav-${g.id}`}>
              {g.icon} {loc(g)}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr("Đang sống ở", "Country I live in", "居住地")}</span>
        <select value={country ?? ""} onChange={(e) => setCountry(e.target.value || null)} className="w-full h-11 rounded-xl bg-black/40 border border-white/15 px-3 text-white" data-testid="select-country">
          <option value="">{tr("Không nói", "Prefer not to say", "不透露")}</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {loc(c)}</option>)}
        </select>
      </label>

      <div className="space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr("Ngôn ngữ tôi nói", "Languages I speak", "我會說的語言")}</span>
        <div className="flex flex-wrap gap-1.5">
          {PROFILE_LANGUAGES.map((l) => (
            <button key={l} type="button" onClick={() => setLangs(flip(langs, l))} className={`h-8 px-3 rounded-full text-xs font-bold border ${langs.includes(l) ? "bg-sky-400 text-black border-sky-300" : "bg-white/5 text-white/75 border-white/10"}`} data-testid={`lang-${l}`}>{langName(l)}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr("Cách chơi", "Play style", "遊戲風格")}</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/40">
          {[null, ...PLAY_STYLES].map((v) => (
            <button key={v ?? "none"} type="button" onClick={() => setStyle(v)} className={`h-9 rounded-lg text-xs font-black ${style === v ? "bg-yellow-400 text-black" : "text-white/60"}`} data-testid={`style-${v ?? "none"}`}>{v ? styleName(v) : tr("Không nói", "Not set", "未設定")}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-black text-white/70">{tr(`Khoe thành tích (chọn tối đa ${SHOWCASE_MAX})`, `Badge showcase (pick up to ${SHOWCASE_MAX})`, `成就展示（最多選 ${SHOWCASE_MAX} 個）`)}</span>
        {earned.length === 0 ? <p className="text-xs text-white/45">{tr("Bạn chưa có thành tích nào. Chơi Slot Rồng Vàng để mở khoá!", "No badges yet. Play the Dragon slot to earn some!", "你還沒有成就。玩神龍老虎機來解鎖吧！")}</p> : (
          <div className="grid grid-cols-3 gap-1.5" data-testid="showcase-picker">
            {earned.map((a) => {
              const on = show.includes(a.id);
              const full = !on && show.length >= SHOWCASE_MAX;
              return (
                <button key={a.id} type="button" disabled={full} onClick={() => setShow(on ? show.filter((x) => x !== a.id) : [...show, a.id])}
                  className={`rounded-xl px-1 py-2 text-center border ${on ? "bg-gradient-to-b from-yellow-500/30 to-orange-700/25 border-yellow-300" : "bg-white/5 border-white/10"} ${full ? "opacity-40" : ""}`} data-testid={`showcase-${a.id}`}>
                  <div className="text-xl leading-none">{BADGE_ICON[a.icon] ?? "🏅"}</div>
                  <div className="text-[10px] font-black text-white leading-tight mt-1">{loc(a.name)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="w-full h-11 rounded-xl bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50" data-testid="button-save-social">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{tr("Lưu hồ sơ", "Save profile", "儲存個人檔案")}
      </button>
    </div>
  );
}

/** Profile › privacy: who can message or add me, whether I show as online and in the feed */
export function PrivacyCard() {
  const { tr } = useLang();
  const fail = useErr();
  const q = useQuery<Settings>({ queryKey: KEY });
  const set = useMutation({
    mutationFn: async (patch: Partial<PrivacySettings>) => (await apiRequest("PUT", "/api/social/privacy", patch)).json() as Promise<PrivacySettings>,
    onMutate: (patch) => queryClient.setQueryData<Settings>(KEY, (old) => old && { ...old, privacy: { ...old.privacy, ...patch } }),
    onSuccess: (p) => queryClient.setQueryData<Settings>(KEY, (old) => old && { ...old, privacy: p }),
    onError: (e) => { fail(e); queryClient.invalidateQueries({ queryKey: KEY }); },
  });
  if (!q.data) return null;
  const p = q.data.privacy;
  const choice = <T extends string>(id: string, label: string, value: T, options: { v: T; label: string }[], onPick: (v: T) => void) => (
    <div className="space-y-1.5" data-testid={`privacy-${id}`}>
      <span className="text-xs font-bold text-white/80">{label}</span>
      <div className="grid gap-1 p-1 rounded-xl bg-black/40" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onPick(o.v)} className={`h-9 rounded-lg text-xs font-black ${value === o.v ? "bg-yellow-400 text-black" : "text-white/60"}`} data-testid={`privacy-${id}-${o.v}`}>{o.label}</button>
        ))}
      </div>
    </div>
  );
  const toggle = (id: string, label: string, sub: string, on: boolean, onFlip: () => void) => (
    <button type="button" onClick={onFlip} className="w-full flex items-center gap-3 text-left" data-testid={`privacy-${id}`}>
      <span className="flex-1 min-w-0"><span className="block text-xs font-bold text-white/80">{label}</span><span className="block text-[10px] text-white/45">{sub}</span></span>
      <span className={`relative w-12 h-7 rounded-full transition ${on ? "bg-emerald-500" : "bg-white/15"}`}><span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} /></span>
    </button>
  );
  return (
    <div className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 space-y-4" data-testid="card-privacy">
      <div className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Lock className="w-4 h-4" />{tr("Quyền riêng tư", "Privacy", "隱私")}</div>
      {choice("dm", tr("Ai được nhắn tin riêng cho tôi", "Who can message me", "誰可以傳私訊給我"), p.dmFrom, [{ v: "everyone", label: tr("Mọi người", "Everyone", "所有人") }, { v: "friends", label: tr("Chỉ bạn bè", "Friends only", "僅限好友") }], (v) => set.mutate({ dmFrom: v }))}
      {choice("requests", tr("Ai được gửi lời mời kết bạn", "Who can send friend requests", "誰可以送出好友邀請"), p.requestsFrom, [{ v: "everyone", label: tr("Mọi người", "Everyone", "所有人") }, { v: "nobody", label: tr("Không ai", "Nobody", "沒有人") }], (v) => set.mutate({ requestsFrom: v }))}
      {toggle("presence", tr("Hiện trạng thái online và trò đang chơi", "Show when I'm online and what I'm playing", "顯示我的在線狀態和正在玩的遊戲"), tr("Tắt thì mọi người thấy bạn ngoại tuyến", "When off, everyone sees you as offline", "關閉後，其他人會看到你離線"), p.showPresence, () => set.mutate({ showPresence: !p.showPresence }))}
      {toggle("country", tr("Ẩn nơi tôi sống", "Hide my country", "隱藏我的居住地"), tr("Hồ sơ và danh sách sẽ không hiện quốc gia của bạn", "Your profile and lists won't show where you live", "個人檔案和名單不會顯示你的居住地"), p.hideCountry, () => set.mutate({ hideCountry: !p.hideCountry }))}
      {toggle("photos", tr("Luôn hiện ảnh", "Always show photos", "一律顯示照片"), tr("Mặc định ảnh từ người không phải bạn bè bị làm mờ, chạm để xem", "By default, photos from people who aren't your friends are blurred until you tap", "預設會模糊非好友傳來的照片，點一下才顯示"), p.showPhotos, () => set.mutate({ showPhotos: !p.showPhotos }))}
      {toggle("feed", tr("Hiện tôi trong mục Hoạt động", "Show me in the Activity feed", "在動態中顯示我"), tr("Thắng lớn, lên cấp, kết bạn mới", "Big wins, level-ups, new friends", "大獎、升級、新朋友"), p.showInFeed, () => set.mutate({ showInFeed: !p.showInFeed }))}
      <p className="text-[10px] text-white/40 flex items-start gap-1.5"><Eye className="w-3 h-3 shrink-0 mt-0.5" />{tr("Số dư, email và tên thật của bạn không bao giờ được hiển thị cho người khác.", "Your balance, email and real name are never shown to anyone.", "你的餘額、電子郵件和真實姓名永遠不會顯示給其他人。")}</p>
    </div>
  );
}
