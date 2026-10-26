import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, BookOpen, MessagesSquare, Swords, Shield, Check, Clock, Copy, Flag, Gift, Loader2, Lock, Mail, Megaphone, MessageCircle, Repeat, Send, Share2, Smile, Sparkles, Users, X } from "lucide-react";
import { Header } from "@/components/Header";
import { ShareDialog, type ShareWhat } from "@/components/ShareCard";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { STATE_KEY } from "@/hooks/use-game";
import { useLang, type Language, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import {
  STICKERS, STICKER_SETS, STICKER_BY_ID, ALBUM_REWARD, TRADE_IN, PLAY_PACK_EVERY,
  type AlbumView, type Rarity, type Sticker,
} from "@shared/stickers";
import { CHAT_MAX_LEN } from "@shared/chat";
import { Avatar } from "@/components/Avatar";
import { nameHue } from "@shared/social";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { DmTab } from "@/components/DirectMessages";
import { useDmUnread } from "@/hooks/use-dm";
import { useSocial, useSocialEvent, FRIENDS_KEY } from "@/hooks/use-social";
import { LevelBadge, QuoteBlock, ReplyingBar, ReactionChips, MessageActions, applyReaction } from "@/components/SocialBits";
import { FriendsTab } from "@/components/Friends";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ClubsTab } from "@/components/Clubs";
import { TalkTab } from "@/components/Talk";
import { MatchesTab } from "@/components/Matches";
import { ClubTagChip, MessagePhoto, PhotoPickButton, usePhotoBlur } from "@/components/Social3Bits";
import { LOUNGE_ROOMS, loungeRoom, type ClubTag, type LoungeRoom } from "@shared/social3";
import type { ReactionCount, ReplyRef, FriendsView } from "@shared/friends";

const fmt = fmtCoins;

const TXT = {
  vi: {
    title: "Cộng Đồng", subtitle: "Bạn bè · Trò chuyện · Sưu tầm",
    tabChat: "Phòng chat", tabDm: "Tin nhắn", tabFriends: "Bạn bè", tabTalk: "Trò chuyện", tabMatches: "Tìm trận", tabClubs: "Hội", tabActivity: "Hoạt động", tabAlbum: "Album", tabInvite: "Mời bạn",
    rules: "Nói chuyện như người lớn. Không mua bán xu bằng tiền thật. Bị làm phiền: chặn hoặc báo cáo.",
    placeholder: "Nhắn gì đó…", send: "Gửi", stickers: "Sticker của bạn", noStickers: "Bạn chưa có sticker nào. Mở gói trong Album!",
    playFirst: (n: number) => `Chơi thêm ${n} ván để mở khóa trò chuyện`, mutedUntil: "Bạn bị tạm khóa chat đến",
    report: "Báo cáo", reported: "Đã báo cáo. Cảm ơn bạn!", empty: "Chưa có tin nhắn. Hãy chào mọi người! 👋",
    err: { trade: "Xu chỉ để chơi: không được mua bán xu hay nói chuyện tiền thật.", link: "Không được gửi đường link.", phone: "Không được gửi số điện thoại.", long: "Tin nhắn quá dài.", slow_down: "Chậm lại một chút nhé…", repeat: "Bạn vừa gửi tin này rồi.", empty: "Tin nhắn trống.", muted: "Bạn đang bị tạm khóa chat.", play_first: "Chơi vài ván trước đã nhé.", not_owned: "Bạn không có sticker này." } as Record<string, string>,
    collected: "Đã sưu tầm", packs: "Gói sticker", freePack: "Gói miễn phí", freeIn: "Gói mới sau", open: "Mở", playPack: "Gói chơi game", nextIn: (n: number) => `Còn ${n} ván nữa`, bonusPack: "Gói thưởng",
    trade: `Đổi ${TRADE_IN} sticker trùng → 1 gói`, spares: "trùng", claim: "Nhận", claimed: "Đã nhận", reward: "Thưởng", albumDone: "Hoàn thành cả Album",
    newOne: "MỚI!", gift: "Tặng", giftTitle: "Tặng 1 sticker trùng", giftTo: "Tên người nhận", giftsLeft: "Lượt tặng hôm nay", giftOk: (n: string) => `Đã tặng cho ${n}! 🎁`,
    needSpare: "Cần ít nhất 2 cái mới tặng được", rarity: { common: "Thường", rare: "Hiếm", epic: "Sử thi", legendary: "Huyền thoại" } as Record<Rarity, string>,
    howToGet: `Mỗi ngày 1 gói miễn phí · cứ ${PLAY_PACK_EVERY} ván được 1 gói · mời bạn được gói thưởng`,
    inviteTitle: "Mời bạn bè, cùng nhận thưởng", inviteSub: (w: string, r: string) => `Bạn của bạn nhận ngay ${w} xu. Khi họ chơi đủ ván, bạn nhận ${r} xu + 1 gói sticker.`,
    yourLink: "Link mời của bạn", copy: "Sao chép", copied: "Đã sao chép!", share: "Chia sẻ", shareText: "Vào chơi VnSlot 888 với mình! Đăng ký bằng link này được tặng thêm xu 🎁",
    step1: "Gửi link cho bạn bè", step2: (w: string) => `Bạn đăng ký: nhận ngay ${w} xu`, step3: (n: number, r: string) => `Bạn chơi ${n} ván: bạn nhận ${r} xu + 1 gói`,
    friends: "Bạn bè đã mời", noFriends: "Chưa có ai. Gửi link ngay!", claimInvite: (n: number) => `Nhận thưởng (${n})`, paid: "Đã nhận", games: "ván",
    announce: "Thông báo", maxInvites: (n: number) => `Tối đa ${n} lượt thưởng mời bạn.`,
  },
  en: {
    title: "Community", subtitle: "Friends · Chat · Collect",
    tabChat: "Lounge", tabDm: "Messages", tabFriends: "Friends", tabTalk: "Talk", tabMatches: "Find a match", tabClubs: "Clubs", tabActivity: "Activity", tabAlbum: "Album", tabInvite: "Invite",
    rules: "Talk like grown-ups. No buying or selling coins for real money. If someone bothers you: block or report.",
    placeholder: "Say something…", send: "Send", stickers: "Your stickers", noStickers: "No stickers yet. Open a pack in the Album!",
    playFirst: (n: number) => `Play ${n} more game${n === 1 ? "" : "s"} to unlock chat`, mutedUntil: "You're muted until",
    report: "Report", reported: "Reported. Thank you!", empty: "No messages yet. Say hello! 👋",
    err: { trade: "Coins are for play only: no buying, selling or real-money talk.", link: "Links aren't allowed.", phone: "Phone numbers aren't allowed.", long: "That message is too long.", slow_down: "Slow down a little…", repeat: "You just sent that.", empty: "Empty message.", muted: "You're muted for now.", play_first: "Play a few games first.", not_owned: "You don't have that sticker." } as Record<string, string>,
    collected: "Collected", packs: "Sticker packs", freePack: "Free pack", freeIn: "Next free pack in", open: "Open", playPack: "Play packs", nextIn: (n: number) => `${n} more games`, bonusPack: "Bonus packs",
    trade: `Swap ${TRADE_IN} spares → 1 pack`, spares: "spare", claim: "Claim", claimed: "Claimed", reward: "Reward", albumDone: "Complete the whole album",
    newOne: "NEW!", gift: "Gift", giftTitle: "Gift a spare sticker", giftTo: "Player's name", giftsLeft: "Gifts left today", giftOk: (n: string) => `Sent to ${n}! 🎁`,
    needSpare: "You need 2 or more to gift one", rarity: { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as Record<Rarity, string>,
    howToGet: `A free pack every day · a pack every ${PLAY_PACK_EVERY} games · bonus packs for inviting friends`,
    inviteTitle: "Invite friends, both of you win", inviteSub: (w: string, r: string) => `Your friend gets ${w} coins straight away. Once they've played a bit, you get ${r} coins + a sticker pack.`,
    yourLink: "Your invite link", copy: "Copy", copied: "Copied!", share: "Share", shareText: "Come and play VnSlot 888 with me! Sign up with this link for bonus coins 🎁",
    step1: "Send your link to friends", step2: (w: string) => `They sign up: ${w} coins for them`, step3: (n: number, r: string) => `They play ${n} games: ${r} coins + a pack for you`,
    friends: "Friends you invited", noFriends: "Nobody yet. Send your link!", claimInvite: (n: number) => `Claim reward (${n})`, paid: "Paid", games: "games",
    announce: "Announcement", maxInvites: (n: number) => `Up to ${n} invite rewards.`,
  },
  zh: {
    title: "社群", subtitle: "好友 · 聊天 · 收集",
    tabChat: "交誼廳", tabDm: "私訊", tabFriends: "好友", tabTalk: "聊天", tabMatches: "找對手", tabClubs: "公會", tabActivity: "動態", tabAlbum: "圖鑑", tabInvite: "邀請好友",
    rules: "像大人一樣聊天。禁止以真錢買賣金幣。被騷擾時：封鎖或檢舉。",
    placeholder: "說點什麼…", send: "發送", stickers: "你的貼圖", noStickers: "你還沒有貼圖。到圖鑑開卡包吧！",
    playFirst: (n: number) => `再玩 ${n} 局即可解鎖聊天`, mutedUntil: "你已被暫時禁言，直到",
    report: "檢舉", reported: "已檢舉，謝謝你！", empty: "還沒有訊息。跟大家打聲招呼吧！👋",
    err: { trade: "金幣僅供遊戲使用：禁止買賣金幣或談論真錢交易。", link: "不能發送連結。", phone: "不能發送電話號碼。", long: "訊息太長了。", slow_down: "慢一點喔…", repeat: "你剛剛已經發過這則訊息了。", empty: "訊息是空的。", muted: "你目前被暫時禁言。", play_first: "先玩幾局再來吧。", not_owned: "你沒有這張貼圖。" } as Record<string, string>,
    collected: "已收集", packs: "貼圖卡包", freePack: "免費卡包", freeIn: "下一個免費卡包", open: "開啟", playPack: "遊戲卡包", nextIn: (n: number) => `再玩 ${n} 局`, bonusPack: "獎勵卡包",
    trade: `${TRADE_IN} 張重複貼圖 → 換 1 包`, spares: "張重複", claim: "領取", claimed: "已領取", reward: "獎勵", albumDone: "集滿整本圖鑑",
    newOne: "新！", gift: "贈送", giftTitle: "贈送 1 張重複貼圖", giftTo: "收件玩家帳號", giftsLeft: "今日剩餘贈送次數", giftOk: (n: string) => `已送給 ${n}！🎁`,
    needSpare: "至少要有 2 張才能贈送", rarity: { common: "普通", rare: "稀有", epic: "史詩", legendary: "傳說" } as Record<Rarity, string>,
    howToGet: `每天 1 包免費卡包 · 每玩 ${PLAY_PACK_EVERY} 局得 1 包 · 邀請好友得獎勵卡包`,
    inviteTitle: "邀請好友，一起拿獎勵", inviteSub: (w: string, r: string) => `你的好友立即獲得 ${w} 金幣。等他們玩夠局數，你可獲得 ${r} 金幣 + 1 包貼圖卡包。`,
    yourLink: "你的邀請連結", copy: "複製", copied: "已複製！", share: "分享", shareText: "來 VnSlot 888 跟我一起玩！用這個連結註冊可額外獲得金幣 🎁",
    step1: "把連結傳給好友", step2: (w: string) => `好友註冊：立即獲得 ${w} 金幣`, step3: (n: number, r: string) => `好友玩滿 ${n} 局：你獲得 ${r} 金幣 + 1 包卡包`,
    friends: "已邀請的好友", noFriends: "還沒有人。快傳送連結吧！", claimInvite: (n: number) => `領取獎勵（${n}）`, paid: "已領取", games: "局",
    announce: "公告", maxInvites: (n: number) => `邀請獎勵最多 ${n} 次。`,
  },
};
type L = typeof TXT.vi;

const RARITY_STYLE: Record<Rarity, string> = {
  common: "from-slate-500/40 to-slate-700/40 border-slate-400/40",
  rare: "from-sky-500/40 to-blue-700/40 border-sky-300/60",
  epic: "from-fuchsia-500/40 to-purple-800/40 border-fuchsia-300/70",
  legendary: "from-amber-400/50 to-orange-700/50 border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.45)]",
};

export default function Community() {
  const { user, isLoading } = useAuth();
  const { lang } = useLang();
  const L: L = TXT[lang];
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const dm = params.get("dm")?.trim() || null;
  const tab = (params.get("tab") as "chat" | "dm" | "friends" | "talk" | "matches" | "clubs" | "activity" | "album" | "invite" | null) ?? (dm ? "dm" : "chat");
  const board = params.get("board");
  const threadId = Number(params.get("thread")) || null;
  const clubId = Number(params.get("club")) || null;
  const focus = Number(params.get("msg")) || null;
  const unread = useDmUnread();
  const friends = useQuery<FriendsView>({ queryKey: FRIENDS_KEY, enabled: !!user, refetchInterval: 60_000 });
  const incoming = friends.data?.incoming.length ?? 0;

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to={`/auth?next=${encodeURIComponent(`/community?${search || `tab=${tab}`}`)}`} />;

  const tabs = [
    { id: "chat", icon: <MessageCircle className="w-4 h-4" />, label: L.tabChat, badge: 0 },
    { id: "dm", icon: <Mail className="w-4 h-4" />, label: L.tabDm, badge: unread },
    { id: "friends", icon: <Users className="w-4 h-4" />, label: L.tabFriends, badge: incoming },
    { id: "talk", icon: <MessagesSquare className="w-4 h-4" />, label: L.tabTalk, badge: 0 },
    { id: "matches", icon: <Swords className="w-4 h-4" />, label: L.tabMatches, badge: 0 },
    { id: "clubs", icon: <Shield className="w-4 h-4" />, label: L.tabClubs, badge: 0 },
    { id: "activity", icon: <Activity className="w-4 h-4" />, label: L.tabActivity, badge: 0 },
    { id: "album", icon: <BookOpen className="w-4 h-4" />, label: L.tabAlbum, badge: 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a2e] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 relative z-10 w-full max-w-md mx-auto">
        <div className={`text-center ${(tab === "dm" && dm) || (tab === "clubs" && clubId) || (tab === "talk" && threadId) ? "hidden" : ""}`}>
          <h1 className="font-display text-3xl sm:text-4xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-community-title">{L.title}</h1>
          <p className="text-[11px] font-black tracking-[0.25em] text-yellow-500/80 uppercase mt-1">{L.subtitle}</p>
        </div>
        <div className={`w-full grid grid-cols-4 gap-0.5 p-1 rounded-2xl bg-black/40 border border-white/10 ${(tab === "dm" && dm) || (tab === "clubs" && clubId) || (tab === "talk" && threadId) ? "hidden" : ""}`}>
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setLocation(`/community?tab=${t.id}`)}
              className={`relative py-1.5 rounded-xl text-[10px] leading-tight font-black flex flex-col items-center justify-center gap-0.5 transition ${tab === t.id ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow" : "text-white/70"}`}
              data-testid={`tab-community-${t.id}`}>
              {t.icon}<span className="truncate max-w-full">{t.label}</span>
              {t.badge > 0 && <span className="absolute top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center" data-testid="tab-dm-badge">{t.badge > 99 ? "99+" : t.badge}</span>}
            </button>
          ))}
        </div>
        {tab === "chat" && <ChatTab L={L} me={user.username} focus={focus} />}
        {tab === "dm" && <DmTab dm={dm} errs={L.err} />}
        {tab === "friends" && <FriendsTab />}
        {tab === "talk" && <TalkTab board={board} thread={threadId} />}
        {tab === "matches" && <MatchesTab />}
        {tab === "clubs" && <ClubsTab clubId={clubId} />}
        {tab === "activity" && <ActivityFeed />}
        {tab === "album" && <AlbumTab L={L} lang={lang} />}
        {tab === "invite" && <InviteTab L={L} />}
      </main>
    </div>
  );
}

// ---------------- Stickers ----------------

function StickerCard({ s, count, lang: _lang, L, small, isNew }: { s: Sticker; count: number; lang: Language; L: L; small?: boolean; isNew?: boolean }) {
  const { loc } = useLang();
  const owned = count > 0;
  return (
    <div className={`relative rounded-2xl border bg-gradient-to-br ${owned ? RARITY_STYLE[s.rarity] : "from-white/5 to-white/0 border-white/10 border-dashed"} ${small ? "p-1.5" : "p-2"} flex flex-col items-center text-center`}
      data-testid={`sticker-${s.id}`}>
      <div className={`${small ? "text-3xl" : "text-5xl"} leading-none my-1 ${owned ? "drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" : "grayscale opacity-20"}`}>{s.emoji}</div>
      <div className={`font-black leading-tight ${small ? "text-[9px]" : "text-[11px]"} ${owned ? "text-white" : "text-white/30"}`}>{owned ? loc(s) : "???"}</div>
      {!small && <div className={`text-[9px] font-bold uppercase tracking-wider ${owned ? "text-white/60" : "text-white/20"}`}>{L.rarity[s.rarity]}</div>}
      {count > 1 && <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center border-2 border-[#1a0a2e]">×{count}</span>}
      {isNew && <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 rounded-full bg-yellow-400 text-black text-[10px] font-black">{L.newOne}</span>}
    </div>
  );
}

const ALBUM_KEY = ["/api/stickers"];

function AlbumTab({ L, lang }: { L: L; lang: Language }) {
  const { toast } = useToast();
  const { tr, loc, srv } = useLang();
  const album = useQuery<AlbumView>({ queryKey: ALBUM_KEY });
  const [reveal, setReveal] = useState<{ id: string; isNew: boolean }[] | null>(null);
  const [giftFor, setGiftFor] = useState<Sticker | null>(null);
  const [brag, setBrag] = useState<ShareWhat | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const fail = (e: unknown) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" });
  const open = useMutation({
    mutationFn: async (kind: "free" | "play" | "bonus") => (await apiRequest("POST", "/api/stickers/open", { kind })).json() as Promise<{ stickers: { id: string; isNew: boolean }[] }>,
    onSuccess: (r) => { soundManager.bonus(); setReveal(r.stickers); queryClient.invalidateQueries({ queryKey: ALBUM_KEY }); },
    onError: fail,
  });
  const claim = useMutation({
    mutationFn: async (set: string) => ({ set, ...(await (await apiRequest("POST", "/api/stickers/claim", { set })).json()) }) as { set: string; reward: number },
    onSuccess: (r) => {
      soundManager.win(true); fireworks(2500); coinBurst();
      toast({ title: `+${fmt(r.reward)} 🪙` });
      const set = STICKER_SETS.find((x) => x.id === r.set);
      const emoji = r.set === "album" ? "📒" : STICKERS.filter((x) => x.set === r.set).map((x) => x.emoji).slice(0, 3).join("");
      setBrag({
        emoji,
        title: r.set === "album" ? tr("HOÀN THÀNH ALBUM!", "ALBUM COMPLETE!", "圖鑑集滿！") : tr("ĐỦ BỘ STICKER!", "SET COMPLETE!", "貼圖套組集滿！"),
        amount: r.reward,
        detail: set ? loc(set) : tr("Sưu tầm đủ 24 sticker", "All 24 stickers collected", "24 張貼圖全部收集完成"),
      });
      queryClient.invalidateQueries({ queryKey: ALBUM_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
    onError: fail,
  });
  const trade = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/stickers/trade")).json(),
    onSuccess: () => { soundManager.coinDrop(); queryClient.invalidateQueries({ queryKey: ALBUM_KEY }); },
    onError: fail,
  });

  if (!album.data) return <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mt-10" />;
  const a = album.data;
  const own = (id: string) => a.owned[id] ?? 0;
  const total = STICKERS.filter((s) => own(s.id) > 0).length;
  const spares = Object.values(a.owned).reduce((t, n) => t + Math.max(0, n - 1), 0);
  const freeLeft = a.packs.freeAt ? Math.max(0, new Date(a.packs.freeAt).getTime() - now) : 0;
  const hms = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const albumDone = total === STICKERS.length;

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-album">
      {/* Packs */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-900/60 to-black/60 border border-yellow-500/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-black text-yellow-300 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{L.packs}</span>
          <span className="text-xs font-bold text-white/70">{L.collected}: <b className="text-yellow-300">{total}/{STICKERS.length}</b></span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <PackButton label={L.freePack} n={a.packs.free ? 1 : 0} sub={a.packs.free ? undefined : `${hms(freeLeft)}`} onOpen={() => open.mutate("free")} busy={open.isPending} L={L} testid="pack-free" />
          <PackButton label={L.playPack} n={a.packs.play} sub={a.packs.play ? undefined : L.nextIn(a.packs.nextPlayIn)} onOpen={() => open.mutate("play")} busy={open.isPending} L={L} testid="pack-play" />
          <PackButton label={L.bonusPack} n={a.packs.bonus} onOpen={() => open.mutate("bonus")} busy={open.isPending} L={L} testid="pack-bonus" />
        </div>
        <p className="text-[10px] text-white/50 mt-2 text-center">{L.howToGet}</p>
        <button type="button" disabled={spares < TRADE_IN || trade.isPending} onClick={() => trade.mutate()}
          className="mt-2 w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 bg-white/10 text-white disabled:opacity-40" data-testid="button-trade">
          <Repeat className="w-3.5 h-3.5" />{L.trade} <span className="text-white/50">({spares} {L.spares})</span>
        </button>
      </div>

      {/* Whole-album reward */}
      <div className="rounded-2xl border border-yellow-400/50 bg-gradient-to-r from-yellow-500/15 to-orange-600/15 px-3 py-2 flex items-center gap-2">
        <span className="text-2xl">🏆</span>
        <div className="flex-1 leading-tight">
          <div className="text-xs font-black text-yellow-200">{L.albumDone}</div>
          <div className="text-[11px] text-white/70">{L.reward}: {fmt(ALBUM_REWARD)} 🪙</div>
        </div>
        <ClaimBtn done={albumDone} claimed={a.claimedSets.includes("album")} onClick={() => claim.mutate("album")} L={L} testid="claim-album" />
      </div>

      {/* Sets */}
      {STICKER_SETS.map((set) => {
        const items = STICKERS.filter((s) => s.set === set.id);
        const have = items.filter((s) => own(s.id) > 0).length;
        return (
          <div key={set.id} className="rounded-2xl border border-white/10 bg-black/30 p-2.5" data-testid={`set-${set.id}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 leading-tight">
                <div className="font-black text-sm" style={{ color: set.colors[1] }}>{loc(set)}</div>
                <div className="text-[11px] text-white/60">{have}/{items.length} · {L.reward}: {fmt(set.reward)} 🪙</div>
              </div>
              <ClaimBtn done={have === items.length} claimed={a.claimedSets.includes(set.id)} onClick={() => claim.mutate(set.id)} L={L} testid={`claim-${set.id}`} />
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
              <div className="h-full" style={{ width: `${(have / items.length) * 100}%`, background: `linear-gradient(90deg, ${set.colors[0]}, ${set.colors[1]})` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((s) => (
                <button key={s.id} type="button" onClick={() => own(s.id) > 0 && setGiftFor(s)} className="text-left">
                  <StickerCard s={s} count={own(s.id)} lang={lang} L={L} />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {reveal && <PackReveal items={reveal} L={L} lang={lang} onClose={() => setReveal(null)} />}
      </AnimatePresence>
      {brag && <ShareDialog what={brag} onClose={() => setBrag(null)} />}
      {giftFor && <GiftDialog s={giftFor} count={own(giftFor.id)} left={a.giftsLeft} L={L} lang={lang} onClose={() => setGiftFor(null)} />}
    </div>
  );
}

function PackButton({ label, n, sub, onOpen, busy, L, testid }: { label: string; n: number; sub?: string; onOpen: () => void; busy: boolean; L: L; testid: string }) {
  const ready = n > 0;
  return (
    <button type="button" disabled={!ready || busy} onClick={onOpen} data-testid={testid}
      className={`relative rounded-xl p-2 flex flex-col items-center gap-0.5 border transition ${ready ? "bg-gradient-to-b from-red-600 to-red-800 border-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.4)] active:scale-95" : "bg-white/5 border-white/10 opacity-70"}`}>
      <span className={`text-2xl ${ready ? "animate-bounce" : "grayscale"}`}>🧧</span>
      <span className="text-[10px] font-black text-white leading-tight text-center">{label}</span>
      <span className={`text-[10px] font-bold leading-tight ${ready ? "text-yellow-300" : "text-white/50"}`}>{ready ? `${L.open}${n > 1 ? ` ×${n}` : ""}` : sub ?? "0"}</span>
    </button>
  );
}

function ClaimBtn({ done, claimed, onClick, L, testid }: { done: boolean; claimed: boolean; onClick: () => void; L: L; testid: string }) {
  if (claimed) return <span className="text-[11px] font-black text-emerald-300 flex items-center gap-1"><Check className="w-3.5 h-3.5" />{L.claimed}</span>;
  return (
    <button type="button" disabled={!done} onClick={onClick} data-testid={testid}
      className={`px-3 py-1.5 rounded-lg text-xs font-black ${done ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black animate-pulse" : "bg-white/5 text-white/30"}`}>
      {done ? L.claim : <Lock className="w-3.5 h-3.5" />}
    </button>
  );
}

function PackReveal({ items, L, lang, onClose }: { items: { id: string; isNew: boolean }[]; L: L; lang: Language; onClose: () => void }) {
  useEffect(() => {
    const best = items.map((i) => STICKER_BY_ID.get(i.id)!.rarity);
    if (best.includes("legendary") || best.includes("epic")) { fireworks(1800); soundManager.bigWinFanfare(); }
  }, [items]);
  return (
    <motion.div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="pack-reveal">
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {items.map((it, i) => (
          <motion.div key={i} initial={{ rotateY: 180, scale: 0.6, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }} transition={{ delay: 0.25 + i * 0.35, type: "spring", stiffness: 160, damping: 14 }}>
            <StickerCard s={STICKER_BY_ID.get(it.id)!} count={1} lang={lang} L={L} isNew={it.isNew} />
          </motion.div>
        ))}
      </div>
      <button type="button" className="px-8 py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black" onClick={onClose} data-testid="button-reveal-close">OK</button>
    </motion.div>
  );
}

function GiftDialog({ s, count, left, L, lang, onClose }: { s: Sticker; count: number; left: number; L: L; lang: Language; onClose: () => void }) {
  const { toast } = useToast();
  const { tr, srv } = useLang();
  const [to, setTo] = useState("");
  const gift = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/stickers/gift", { to, sticker: s.id })).json() as Promise<{ to: string }>,
    onSuccess: (r) => { toast({ title: L.giftOk(r.to) }); queryClient.invalidateQueries({ queryKey: ALBUM_KEY }); onClose(); },
    onError: (e) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-[#1a0a2e] border border-yellow-500/40 p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="gift-dialog">
        <div className="flex items-center justify-between">
          <span className="font-black text-yellow-300 flex items-center gap-1.5"><Gift className="w-4 h-4" />{L.giftTitle}</span>
          <button type="button" onClick={onClose} aria-label={tr("Đóng", "Close", "關閉")}><X className="w-5 h-5 text-white/60" /></button>
        </div>
        <div className="w-28 self-center"><StickerCard s={s} count={count} lang={lang} L={L} /></div>
        {count < 2 ? (
          <p className="text-sm text-white/70 text-center">{L.needSpare}</p>
        ) : (
          <>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={L.giftTo} maxLength={40}
              className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2.5 text-white placeholder:text-white/30" data-testid="input-gift-to" />
            <button type="button" disabled={!to.trim() || left <= 0 || gift.isPending} onClick={() => gift.mutate()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black disabled:opacity-40" data-testid="button-gift-send">
              {gift.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : L.gift}
            </button>
            <p className="text-[11px] text-white/50 text-center">{L.giftsLeft}: {left}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Chat ----------------

interface Msg {
  id: number; username: string; text: string | null; sticker: string | null; createdAt: string; admin: boolean | null; avatar?: string | null;
  level?: number; reply?: ReplyRef | null; reactions?: ReactionCount[]; club?: ClubTag | null; room?: string; photo?: number | null;
}
interface ChatResp { messages: Msg[]; removed: number[]; me: { mutedUntil: string | null; gamesToUnlock: number } }

const hue = nameHue;

/** Scrolls to a message and makes it flash; false if it isn't loaded */
function jumpTo(id: number) {
  const el = document.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("msg-flash");
  window.setTimeout(() => el.classList.remove("msg-flash"), 1600);
  return true;
}

function ChatTab({ L, me, focus }: { L: L; me: string; focus: number | null }) {
  const { toast } = useToast();
  const { loc, srv, tr, lang } = useLang();
  const blurFor = usePhotoBlur();
  // Lounge rooms: remembered per device; the first time, Chinese speakers start in 中文
  const [room, setRoomState] = useState<LoungeRoom>(() => {
    try { const r = localStorage.getItem("lounge-room"); if (r) return loungeRoom(r); } catch { /* private mode */ }
    return lang === "zh" ? "zh" : "main";
  });
  const setRoom = (r: LoungeRoom) => { try { localStorage.setItem("lounge-room", r); } catch { /* ignore */ } setMsgs([]); lastId.current = 0; loaded.current = false; setReplyTo(null); setRoomState(r); };
  const showPlayer = usePlayerSheet();
  const { connected } = useSocial();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [meInfo, setMeInfo] = useState<ChatResp["me"] | null>(null);
  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [mentions, setMentions] = useState<string[]>([]);
  const [suggest, setSuggest] = useState<{ q: string; start: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastId = useRef(0);
  const loaded = useRef(false);
  const jumped = useRef(false);
  const announcement = useQuery<{ text: string | null }>({ queryKey: ["/api/announcement"], refetchInterval: 60_000 });
  const album = useQuery<AlbumView>({ queryKey: ALBUM_KEY });
  const sugg = useQuery<{ players: { username: string; avatarUrl: string | null }[] }>({
    queryKey: [`/api/players/suggest?q=${encodeURIComponent(suggest?.q ?? "")}`], enabled: !!suggest && suggest.q.length >= 1, staleTime: 15_000,
  });

  const nearBottom = () => { const el = listRef.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const toBottom = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const addMessages = useCallback((incoming: Msg[], gone: number[] = [], forceScroll = false) => {
    const stick = forceScroll || nearBottom();
    setMsgs((cur) => {
      const g = new Set(gone);
      const seen = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) if (!g.has(m.id)) seen.set(m.id, { ...seen.get(m.id), ...m });
      const next = [...seen.values()].filter((m) => !g.has(m.id)).sort((a, b) => a.id - b.id).slice(-200);
      if (next.length) lastId.current = Math.max(lastId.current, next[next.length - 1].id);
      return next;
    });
    if (stick && incoming.length) toBottom();
  }, []);

  // Live over the socket; polling catches up (often while the socket is down, rarely while it's up)
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const poll = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          // The first load is the latest page, even if live messages already arrived over the socket
          const first = !loaded.current;
          const res = await fetch(`/api/chat?room=${room}${first ? "" : `&after=${lastId.current}`}`, { credentials: "include" });
          if (res.ok) { const r: ChatResp = await res.json(); loaded.current = true; setMeInfo(r.me); addMessages(r.messages, r.removed, first); }
        } catch { /* offline: try again next time */ }
      }
      timer = window.setTimeout(poll, connected ? 15_000 : 2500);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [addMessages, connected, room]);

  useSocialEvent((m) => {
    if (m.t === "chat" && (m.m.room ?? "main") === room) addMessages([m.m]);
    else if (m.t === "chat_removed") setMsgs((cur) => cur.filter((x) => !m.ids.includes(x.id)));
    else if (m.t === "react" && m.scope === "chat" && m.by !== me) {
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: applyReaction(x.reactions ?? [], m.e, m.on, false) } : x)));
    }
  });

  // Opened from a notification: jump to that message once it's loaded
  useEffect(() => {
    if (!focus || jumped.current || !msgs.length) return;
    jumped.current = true;
    window.setTimeout(() => { if (!jumpTo(focus)) toast({ title: tr("Tin nhắn này đã cũ, không còn hiện ở đây", "That message is too old to show here", "這則訊息太舊，已不在這裡顯示") }); }, 150);
  }, [focus, msgs.length, toast, tr]);

  const post = async (body: { text?: string; sticker?: string; photoId?: number }) => {
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/chat", { ...body, room, ...(replyTo ? { replyTo: replyTo.id } : {}), ...(body.text && mentions.length ? { mentions } : {}) });
      const m: Msg = await res.json();
      addMessages([m], [], true);
      setText(""); setTray(false); setReplyTo(null); setMentions([]); setSuggest(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      toast({ title: L.err[code] ?? srv(code), variant: "destructive" });
    } finally { setSending(false); }
  };

  const react = async (id: number, emoji: string) => {
    setActive(null);
    try {
      const r = await (await apiRequest("POST", `/api/chat/${id}/react`, { emoji })).json() as { on: boolean; reactions: ReactionCount[] };
      if (r.on) soundManager.pop();
      setMsgs((cur) => cur.map((x) => (x.id === id ? { ...x, reactions: r.reactions } : x)));
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      toast({ title: L.err[code] ?? srv(code), variant: "destructive" });
    }
  };

  const report = async (id: number) => {
    setActive(null);
    try { await apiRequest("POST", `/api/chat/${id}/report`); toast({ title: L.reported }); } catch { /* already reported */ }
  };

  // @mention autocomplete: the word being typed right before the cursor
  const onType = (v: string) => {
    setText(v);
    const caret = inputRef.current?.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}_.-]{0,24})$/u);
    setSuggest(m ? { q: m[1], start: caret - m[1].length - 1 } : null);
  };
  const pick = (name: string) => {
    if (!suggest) return;
    const caret = suggest.start + 1 + suggest.q.length;
    const next = `${text.slice(0, suggest.start)}@${name} ${text.slice(caret)}`;
    setText(next.slice(0, CHAT_MAX_LEN));
    setMentions((cur) => (cur.includes(name) ? cur : [...cur, name]));
    setSuggest(null);
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); const p = suggest.start + name.length + 2; el.setSelectionRange(p, p); } });
  };

  const ownedStickers = useMemo(() => STICKERS.filter((s) => (album.data?.owned[s.id] ?? 0) > 0), [album.data]);
  const locked = meInfo && (meInfo.gamesToUnlock > 0 || meInfo.mutedUntil);
  const mentionsMe = (t: string | null) => !!t && t.toLowerCase().includes(`@${me.toLowerCase()}`);
  const suggestions = suggest && suggest.q.length >= 1 ? sugg.data?.players ?? [] : [];

  return (
    <div className="w-full flex flex-col gap-2" data-testid="community-chat">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5" data-testid="lounge-rooms">
        {LOUNGE_ROOMS.map((r) => (
          <button key={r.id} type="button" onClick={() => r.id !== room && setRoom(r.id)} className={`h-8 px-3 shrink-0 rounded-full text-xs font-black border whitespace-nowrap ${room === r.id ? "bg-yellow-400 text-black border-yellow-300" : "bg-white/5 text-white/70 border-white/10"}`} data-testid={`room-${r.id}`}>
            {r.icon} {loc(r)}
          </button>
        ))}
      </div>
      {announcement.data?.text && (
        <div className="rounded-xl border border-yellow-400/50 bg-yellow-500/10 px-3 py-2 flex gap-2 items-start" data-testid="chat-announcement">
          <Megaphone className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-100 font-semibold">{announcement.data.text}</p>
        </div>
      )}
      <div ref={listRef} onClick={(e) => { if (e.target === e.currentTarget) setActive(null); }}
        className={`${tray ? "h-[calc(100dvh-578px)] min-h-[180px]" : replyTo ? "h-[calc(100dvh-513px)] min-h-[220px]" : "h-[calc(100dvh-453px)] min-h-[260px]"} overflow-y-auto overscroll-contain rounded-2xl bg-black/40 border border-white/10 p-2.5 flex flex-col gap-2`} data-testid="chat-list">
        {msgs.length === 0 && <p className="m-auto text-sm text-white/50">{L.empty}</p>}
        {msgs.map((m) => {
          const mine = m.username === me;
          const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
          const tagged = !mine && mentionsMe(m.text);
          return (
            <div key={m.id} data-msg-id={m.id} className={`group flex items-start gap-1.5 max-w-[88%] rounded-2xl transition-colors ${mine ? "self-end flex-row-reverse" : "self-start"}`} data-testid={`chat-msg-${m.id}`}>
              <Avatar user={{ username: m.username, avatarUrl: m.avatar }} size={30} onClick={m.admin === null ? undefined : () => showPlayer(m.username)} testid={`chat-avatar-${m.id}`} />
              <div className={`flex flex-col min-w-0 ${mine ? "items-end" : "items-start"}`}>
                <button type="button" disabled={m.admin === null} onClick={() => showPlayer(m.username)} className="text-[10px] font-black px-1 text-left flex items-center gap-1 flex-wrap" style={{ color: `hsl(${hue(m.username)} 80% 70%)` }}>
                  <span>{m.admin && "🛡️ "}{m.username}</span>
                  <ClubTagChip club={m.club} />
                  <LevelBadge level={m.level} />
                  <span className="text-white/30 font-normal">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </button>
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {m.reply && <QuoteBlock reply={m.reply} onJump={(id) => { if (!jumpTo(id)) toast({ title: tr("Tin nhắn này đã cũ, không còn hiện ở đây", "That message is too old to show here", "這則訊息太舊，已不在這裡顯示") }); }} />}
                  <button type="button" onClick={() => setActive((a) => (a === m.id ? null : m.id))} className="text-left" data-testid={`chat-bubble-${m.id}`}>
                    {m.photo ? (
                      <div className="flex flex-col gap-1">
                        <MessagePhoto id={m.photo} blur={blurFor({ username: m.username, mine })} mine={mine} />
                        {m.text && <div className={`px-3 py-1.5 rounded-2xl text-sm break-words [overflow-wrap:anywhere] ${mine ? "bg-gradient-to-b from-yellow-400 to-orange-500 text-black" : "bg-white/10 text-white"}`}><MentionText text={m.text} mine={mine} /></div>}
                      </div>
                    ) : st ? (
                      <div className="text-5xl leading-none py-1" title={loc(st)}>{st.emoji}</div>
                    ) : (
                      <div className={`px-3 py-1.5 rounded-2xl text-sm break-words [overflow-wrap:anywhere] ${mine ? "bg-gradient-to-b from-yellow-400 to-orange-500 text-black rounded-br-md" : m.admin ? "bg-red-800/80 text-white rounded-bl-md border border-yellow-400/40" : tagged ? "bg-yellow-400/15 text-white rounded-bl-md border border-yellow-300/60" : "bg-white/10 text-white rounded-bl-md"}`}>
                        <MentionText text={m.text ?? ""} mine={mine} />
                      </div>
                    )}
                  </button>
                  <ReactionChips reactions={m.reactions ?? []} onToggle={(e) => react(m.id, e)} mine={mine} />
                  {active === m.id && !locked && (
                    <MessageActions mine={mine} onReact={(e) => react(m.id, e)} onReply={() => { setReplyTo(m); setActive(null); inputRef.current?.focus(); }}
                      extra={!mine ? (
                        <button type="button" onClick={() => report(m.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10" aria-label={L.report} data-testid={`button-report-${m.id}`}><Flag className="w-3.5 h-3.5" /></button>
                      ) : undefined} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tray && (
        <div className="rounded-2xl bg-black/60 border border-white/10 p-2" data-testid="sticker-tray">
          <p className="text-[11px] font-black text-white/60 mb-1.5">{L.stickers}</p>
          {ownedStickers.length === 0 ? <p className="text-xs text-white/50">{L.noStickers}</p> : (
            <div className="grid grid-cols-6 gap-1.5">
              {ownedStickers.map((s) => (
                <button key={s.id} type="button" disabled={sending} onClick={() => post({ sticker: s.id })} className="text-3xl rounded-xl bg-white/5 py-1 active:scale-90" data-testid={`tray-${s.id}`}>{s.emoji}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {locked ? (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-center text-sm text-white/70 flex items-center justify-center gap-2" data-testid="chat-locked">
          {meInfo!.mutedUntil ? <><Clock className="w-4 h-4" />{L.mutedUntil} {new Date(meInfo!.mutedUntil).toLocaleString()}</> : <><Lock className="w-4 h-4" />{L.playFirst(meInfo!.gamesToUnlock)}</>}
        </div>
      ) : (
        <div className="relative flex flex-col gap-1.5">
          {replyTo && <ReplyingBar reply={{ id: replyTo.id, username: replyTo.username, text: replyTo.text, sticker: replyTo.sticker }} onCancel={() => setReplyTo(null)} />}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bottom-full mb-1.5 left-12 right-12 rounded-2xl bg-[#1f0f38] border border-yellow-400/40 shadow-2xl overflow-hidden z-20" data-testid="mention-suggest">
                {suggestions.map((p) => (
                  <button key={p.username} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p.username)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 active:bg-white/10 border-b border-white/5 last:border-0" data-testid={`suggest-${p.username}`}>
                    <Avatar user={p} size={26} /><span className="font-bold text-white text-sm truncate">@{p.username}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) post({ text }); }}>
            <button type="button" onClick={() => setTray((v) => !v)} className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tray ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`} aria-label={L.stickers} data-testid="button-sticker-tray">
              <Smile className="w-5 h-5" />
            </button>
            <PhotoPickButton target={{ scope: "lounge" }} disabled={sending} onPhoto={(id) => post({ photoId: id, text: text.trim() || undefined })} />
            <input ref={inputRef} value={text} onChange={(e) => onType(e.target.value)} onBlur={() => window.setTimeout(() => setSuggest(null), 150)} maxLength={CHAT_MAX_LEN} placeholder={L.placeholder}
              enterKeyHint="send" className="flex-1 min-w-0 rounded-xl bg-[#140b26] border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-chat" />
            <button type="submit" disabled={sending || !text.trim()} className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={L.send} data-testid="button-chat-send">
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      )}
      <p className="text-[10px] text-white/40 text-center leading-tight">{L.rules}<br />{tr("Chạm tin nhắn để thả cảm xúc, trả lời · gõ @ để gọi tên", "Tap a message to react or reply · type @ to mention", "點訊息可按表情、回覆 · 輸入 @ 提及玩家")}</p>
    </div>
  );
}

/** Message text with @names picked out */
function MentionText({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(/(@[\p{L}\p{N}_.-]{3,24})/u);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className={`font-black ${mine ? "text-red-900" : "text-yellow-300"}`}>{p}</span> : p))}</>;
}

// ---------------- Invite ----------------

interface RefView { code: string; welcome: number; reward: number; gamesNeeded: number; maxPaid: number; paid: number; claimable: number; friends: { username: string; gamesPlayed: number; paid: boolean }[] }

function InviteTab({ L }: { L: L }) {
  const { toast } = useToast();
  const ref = useQuery<RefView>({ queryKey: ["/api/referrals"], refetchInterval: 15_000 });
  const claim = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/referrals/claim")).json() as Promise<{ paid: number; amount: number }>,
    onSuccess: (r) => {
      if (r.paid) { soundManager.win(true); fireworks(2500); coinBurst(); toast({ title: `+${fmt(r.amount)} 🪙 · +${r.paid} 🧧` }); }
      queryClient.invalidateQueries({ queryKey: ["/api/referrals"] }); queryClient.invalidateQueries({ queryKey: ME_KEY });
      queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ALBUM_KEY });
    },
  });
  if (!ref.data) return <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mt-10" />;
  const r = ref.data;
  const link = `${location.origin}/auth?ref=${encodeURIComponent(r.code)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast({ title: L.copied }); } catch { /* ignore */ } };
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "VnSlot 888", text: L.shareText, url: link }); return; }
      await copy();
    } catch { /* cancelled */ }
  };

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-invite">
      <div className="rounded-2xl bg-gradient-to-br from-red-700 to-orange-600 border border-yellow-300/60 p-4 text-center shadow-[0_10px_30px_rgba(220,38,38,0.35)]">
        <div className="text-5xl mb-1">🎁</div>
        <h2 className="font-display text-2xl text-yellow-100 leading-tight">{L.inviteTitle}</h2>
        <p className="text-sm text-white/90 mt-1">{L.inviteSub(fmt(r.welcome), fmt(r.reward))}</p>
      </div>

      <div className="rounded-2xl bg-black/40 border border-white/10 p-3 flex flex-col gap-2">
        <span className="text-xs font-black text-white/60">{L.yourLink}</span>
        <div className="font-mono text-xs text-yellow-200 bg-black/50 rounded-lg px-2.5 py-2 break-all" data-testid="text-invite-link">{link}</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={share} className="py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black flex items-center justify-center gap-1.5" data-testid="button-invite-share"><Share2 className="w-4 h-4" />{L.share}</button>
          <button type="button" onClick={copy} className="py-2.5 rounded-xl bg-white/10 text-white font-black flex items-center justify-center gap-1.5" data-testid="button-invite-copy"><Copy className="w-4 h-4" />{L.copy}</button>
        </div>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer"
          className="py-2 rounded-xl bg-[#1877f2] text-white font-black text-sm text-center">Facebook</a>
      </div>

      <ol className="rounded-2xl bg-black/30 border border-white/10 p-3 flex flex-col gap-2 text-sm text-white/85">
        {[L.step1, L.step2(fmt(r.welcome)), L.step3(r.gamesNeeded, fmt(r.reward))].map((s, i) => (
          <li key={i} className="flex gap-2 items-start"><span className="w-6 h-6 shrink-0 rounded-full bg-yellow-400 text-black text-xs font-black flex items-center justify-center">{i + 1}</span>{s}</li>
        ))}
      </ol>

      <div className="rounded-2xl bg-black/30 border border-white/10 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-white flex items-center gap-1.5"><Users className="w-4 h-4" />{L.friends} ({r.friends.length})</span>
          <button type="button" disabled={!r.claimable || claim.isPending} onClick={() => claim.mutate()}
            className={`px-3 py-1.5 rounded-lg text-xs font-black ${r.claimable ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black animate-pulse" : "bg-white/5 text-white/30"}`} data-testid="button-invite-claim">
            {L.claimInvite(r.claimable)}
          </button>
        </div>
        {r.friends.length === 0 ? <p className="text-xs text-white/50">{L.noFriends}</p> : r.friends.map((f) => (
          <div key={f.username} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate text-white">{f.username}</span>
            {f.paid ? <span className="text-emerald-300 text-xs font-black flex items-center gap-1"><Check className="w-3.5 h-3.5" />{L.paid}</span> : (
              <div className="w-28">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, (f.gamesPlayed / r.gamesNeeded) * 100)}%` }} /></div>
                <div className="text-[10px] text-white/50 text-right">{Math.min(f.gamesPlayed, r.gamesNeeded)}/{r.gamesNeeded} {L.games}</div>
              </div>
            )}
          </div>
        ))}
        <p className="text-[10px] text-white/40">{L.maxInvites(r.maxPaid)}</p>
      </div>
    </div>
  );
}
