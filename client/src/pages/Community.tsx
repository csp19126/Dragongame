import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Check, Clock, Copy, Flag, Gift, Loader2, Lock, Megaphone, MessageCircle, Repeat, Send, Share2, Smile, Sparkles, Users, X } from "lucide-react";
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

const fmt = fmtCoins;

const TXT = {
  vi: {
    title: "Cộng Đồng", subtitle: "Trò chuyện · Sưu tầm · Mời bạn",
    tabChat: "Trò chuyện", tabAlbum: "Album", tabInvite: "Mời bạn",
    rules: "Lịch sự nhé. Không mua bán xu, không gửi link hay số điện thoại.",
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
    title: "Community", subtitle: "Chat · Collect · Invite",
    tabChat: "Chat", tabAlbum: "Album", tabInvite: "Invite",
    rules: "Be kind. No selling coins, no links, no phone numbers.",
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
    title: "社群", subtitle: "聊天 · 收集 · 邀請",
    tabChat: "聊天", tabAlbum: "圖鑑", tabInvite: "邀請好友",
    rules: "請保持禮貌。禁止買賣金幣，禁止發送連結或電話號碼。",
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
  const tab = (new URLSearchParams(search).get("tab") as "chat" | "album" | "invite" | null) ?? "chat";

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to={`/auth?next=${encodeURIComponent(`/community?tab=${tab}`)}`} />;

  const tabs = [
    { id: "chat", icon: <MessageCircle className="w-4 h-4" />, label: L.tabChat },
    { id: "album", icon: <BookOpen className="w-4 h-4" />, label: L.tabAlbum },
    { id: "invite", icon: <Gift className="w-4 h-4" />, label: L.tabInvite },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a2e] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 relative z-10 w-full max-w-md mx-auto">
        <div className="text-center">
          <h1 className="font-display text-3xl sm:text-4xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-community-title">{L.title}</h1>
          <p className="text-[11px] font-black tracking-[0.25em] text-yellow-500/80 uppercase mt-1">{L.subtitle}</p>
        </div>
        <div className="w-full grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/40 border border-white/10">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setLocation(`/community?tab=${t.id}`)}
              className={`py-2 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition ${tab === t.id ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow" : "text-white/70"}`}
              data-testid={`tab-community-${t.id}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {tab === "chat" && <ChatTab L={L} me={user.username} />}
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

interface Msg { id: number; username: string; text: string | null; sticker: string | null; createdAt: string; admin: boolean | null }
interface ChatResp { messages: Msg[]; removed: number[]; me: { mutedUntil: string | null; gamesToUnlock: number } }

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function ChatTab({ L, me }: { L: L; me: string }) {
  const { toast } = useToast();
  const { loc, srv } = useLang();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [meInfo, setMeInfo] = useState<ChatResp["me"] | null>(null);
  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const announcement = useQuery<{ text: string | null }>({ queryKey: ["/api/announcement"], refetchInterval: 60_000 });
  const album = useQuery<AlbumView>({ queryKey: ALBUM_KEY });

  const nearBottom = () => { const el = listRef.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const toBottom = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const merge = useCallback((r: ChatResp, forceScroll = false) => {
    const stick = forceScroll || nearBottom();
    setMeInfo(r.me);
    setMsgs((cur) => {
      const gone = new Set(r.removed);
      const seen = new Set(cur.map((m) => m.id));
      const next = [...cur.filter((m) => !gone.has(m.id)), ...r.messages.filter((m) => !seen.has(m.id) && !gone.has(m.id))].slice(-200);
      if (next.length) lastId.current = Math.max(lastId.current, next[next.length - 1].id);
      return next;
    });
    if (stick && r.messages.length) toBottom();
  }, []);

  // Poll every 2.5 s while the page is visible
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const poll = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/chat${lastId.current ? `?after=${lastId.current}` : ""}`, { credentials: "include" });
          if (res.ok) merge(await res.json(), lastId.current === 0);
        } catch { /* offline: try again next time */ }
      }
      timer = window.setTimeout(poll, 2500);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [merge]);

  const post = async (body: { text?: string; sticker?: string }) => {
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/chat", body);
      const m: Msg = await res.json();
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      lastId.current = Math.max(lastId.current, m.id);
      setText(""); setTray(false); toBottom();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      toast({ title: L.err[code] ?? srv(code), variant: "destructive" });
    } finally { setSending(false); }
  };

  const report = async (id: number) => {
    try { await apiRequest("POST", `/api/chat/${id}/report`); toast({ title: L.reported }); } catch { /* already reported */ }
  };

  const ownedStickers = useMemo(() => STICKERS.filter((s) => (album.data?.owned[s.id] ?? 0) > 0), [album.data]);
  const locked = meInfo && (meInfo.gamesToUnlock > 0 || meInfo.mutedUntil);

  return (
    <div className="w-full flex flex-col gap-2" data-testid="community-chat">
      {announcement.data?.text && (
        <div className="rounded-xl border border-yellow-400/50 bg-yellow-500/10 px-3 py-2 flex gap-2 items-start" data-testid="chat-announcement">
          <Megaphone className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-100 font-semibold">{announcement.data.text}</p>
        </div>
      )}
      <div ref={listRef} className={`${tray ? "h-[calc(100vh-460px)] min-h-[180px]" : "h-[calc(100vh-330px)] min-h-[300px]"} overflow-y-auto rounded-2xl bg-black/40 border border-white/10 p-2.5 flex flex-col gap-2`} data-testid="chat-list">
        {msgs.length === 0 && <p className="m-auto text-sm text-white/50">{L.empty}</p>}
        {msgs.map((m) => {
          const mine = m.username === me;
          const st = m.sticker ? STICKER_BY_ID.get(m.sticker) : null;
          return (
            <div key={m.id} className={`group flex flex-col max-w-[85%] ${mine ? "self-end items-end" : "self-start items-start"}`} data-testid={`chat-msg-${m.id}`}>
              <span className="text-[10px] font-black px-1" style={{ color: `hsl(${hue(m.username)} 80% 70%)` }}>
                {m.admin && "🛡️ "}{m.username}
                <span className="text-white/30 font-normal ml-1.5">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <div className="flex items-end gap-1">
                {st ? (
                  <div className="text-5xl leading-none py-1" title={loc(st)}>{st.emoji}</div>
                ) : (
                  <div className={`px-3 py-1.5 rounded-2xl text-sm break-words ${mine ? "bg-gradient-to-b from-yellow-400 to-orange-500 text-black rounded-br-md" : m.admin ? "bg-red-800/80 text-white rounded-bl-md border border-yellow-400/40" : "bg-white/10 text-white rounded-bl-md"}`}>{m.text}</div>
                )}
                {!mine && (
                  <button type="button" onClick={() => report(m.id)} className="opacity-30 hover:opacity-100 p-1" aria-label={L.report} data-testid={`button-report-${m.id}`}>
                    <Flag className="w-3 h-3 text-white" />
                  </button>
                )}
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
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) post({ text }); }}>
          <button type="button" onClick={() => setTray((v) => !v)} className={`w-11 h-11 rounded-xl flex items-center justify-center ${tray ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`} aria-label={L.stickers} data-testid="button-sticker-tray">
            <Smile className="w-5 h-5" />
          </button>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX_LEN} placeholder={L.placeholder}
            className="flex-1 min-w-0 rounded-xl bg-black/50 border border-white/15 px-3 text-white placeholder:text-white/30" data-testid="input-chat" />
          <button type="submit" disabled={sending || !text.trim()} className="w-11 h-11 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center disabled:opacity-40" aria-label={L.send} data-testid="button-chat-send">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      )}
      <p className="text-[10px] text-white/40 text-center">{L.rules}</p>
    </div>
  );
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
