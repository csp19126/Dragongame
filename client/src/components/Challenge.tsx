import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Swords, UserPlus, X } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import { Avatar } from "@/components/Avatar";
import { LevelBadge, useGameName } from "@/components/SocialBits";
import { Sheet, sendInvite, useSocialErr } from "@/components/Social3Bits";
import { FRIENDS_KEY } from "@/hooks/use-social";
import { INVITE_GAMES, INVITE_GAME_IDS, type InviteGame } from "@shared/social3";
import type { FriendsView } from "@shared/friends";

// ---------------- The shared host: challenge picker, quests sheet, online-now sheet ----------------

interface Social3Ctx { challenge: (username: string) => void; openQuests: () => void; openOnline: () => void }
const Ctx = createContext<Social3Ctx>({ challenge: () => {}, openQuests: () => {}, openOnline: () => {} });
interface HostState { challenge: string | null; quests: boolean; online: boolean }
const StateCtx = createContext<{ s: HostState; set: (f: (s: HostState) => HostState) => void }>({ s: { challenge: null, quests: false, online: false }, set: () => {} });

/** `const { challenge, openQuests, openOnline } = useSocial3()` from anywhere */
export const useSocial3 = () => useContext(Ctx);
export const useSocial3State = () => useContext(StateCtx);

export function Social3Provider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<HostState>({ challenge: null, quests: false, online: false });
  const set = (f: (s: HostState) => HostState) => setS(f);
  const value: Social3Ctx = {
    challenge: (username) => setS((x) => ({ ...x, challenge: username })),
    openQuests: () => setS((x) => ({ ...x, quests: true })),
    openOnline: () => setS((x) => ({ ...x, online: true })),
  };
  return <StateCtx.Provider value={{ s, set }}><Ctx.Provider value={value}>{children}</Ctx.Provider></StateCtx.Provider>;
}

/** The game picker for "Challenge": opens the game with ?challenge=<name> */
export function ChallengePicker({ username, onClose }: { username: string; onClose: () => void }) {
  const { tr } = useLang();
  const [, setLocation] = useLocation();
  const blurb: Record<InviteGame, { vi: string; en: string; zh: string }> = {
    pool: { vi: "Mở bàn 8 bóng và mời ngay", en: "Opens an 8-ball table and invites them", zh: "開一桌 8 號球並立即邀請" },
    cards: { vi: "Mở bàn Xì Dách và mời ngay", en: "Opens a Xì Dách table and invites them", zh: "開一桌 21 點並立即邀請" },
    darts: { vi: "Đấu phi tiêu một chọi một", en: "One-on-one darts", zh: "一對一飛鏢對決" },
    football: { vi: "Đá luân lưu một chọi một", en: "One-on-one shootout", zh: "一對一 PK 大戰" },
  };
  return createPortal(
    <Sheet title={<>⚔️ {tr("Thách đấu", "Challenge", "挑戰")} {username}</>} onClose={onClose} testid="challenge-picker">
      <div className="p-3 grid grid-cols-2 gap-2">
        {(["pool", "cards", "darts", "football"] as InviteGame[]).map((g) => {
          const x = INVITE_GAMES[g];
          return (
            <motion.button key={g} type="button" whileTap={{ scale: 0.96 }} onClick={() => { onClose(); setLocation(`${x.route}?challenge=${encodeURIComponent(username)}`); }}
              className="rounded-2xl p-3 text-left bg-gradient-to-br from-purple-700/60 to-black/50 border border-yellow-400/30 min-h-[7rem] flex flex-col justify-between" data-testid={`challenge-game-${g}`}>
              <span className="text-4xl leading-none">{x.icon}</span>
              <span>
                <span className="block font-black text-white leading-tight">{tr(x.vi, x.en, x.zh)}</span>
                <span className="block text-[10px] text-white/60 leading-tight mt-0.5">{tr(blurb[g].vi, blurb[g].en, blurb[g].zh)}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="px-4 pb-4 text-[11px] text-white/45 text-center">{tr("Họ sẽ nhận lời mời trong 🔔 và tin nhắn riêng.", "They'll get the invite in 🔔 and in your private messages.", "對方會在 🔔 和私訊中收到邀請。")}</p>
    </Sheet>,
    document.body,
  );
}

/** Reads ?challenge=<name> on a game page */
export function useChallengeTarget(): string | null {
  const search = useSearch();
  const v = new URLSearchParams(search).get("challenge")?.trim();
  return v ? v.slice(0, 40) : null;
}

/**
 * On a game lobby opened with ?challenge=<name>: "Challenge <name>" creates a table with the
 * lobby's current settings, invites them (bell + DM card) and opens the table.
 */
export function ChallengeBanner({ game, target, create, settings, onOpen }: {
  game: InviteGame; target: string; create: () => Promise<string>; settings?: ReactNode; onOpen: (code: string) => void;
}) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const code = await create();
      try {
        await sendInvite(target, game, `${INVITE_GAMES[game].route}?table=${code}`);
        soundManager.ping();
        toast({ title: tr(`⚔️ Đã gửi lời thách đấu tới ${target}!`, `⚔️ Challenge sent to ${target}!`, `⚔️ 已向 ${target} 發出挑戰！`), description: tr("Chờ họ vào bàn nhé.", "Wait here for them to join.", "在這裡等對方入座吧。") });
      } catch (e) {
        toast({ title: err(e), variant: "destructive" });
      }
      onOpen(code);
    } catch (e) {
      toast({ title: err(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="w-full rounded-3xl p-3 bg-gradient-to-br from-red-600/90 via-red-800/90 to-purple-950 border border-yellow-300/60 shadow-[0_10px_30px_rgba(220,38,38,0.35)] flex flex-col gap-2" data-testid="challenge-banner">
      <div className="flex items-center gap-2">
        <Swords className="w-7 h-7 text-yellow-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl text-yellow-100 leading-tight truncate">{tr("Thách đấu", "Challenge", "挑戰")} {target}</div>
          <div className="text-[11px] text-white/75">{INVITE_GAMES[game].icon} {tr(INVITE_GAMES[game].vi, INVITE_GAMES[game].en, INVITE_GAMES[game].zh)}{settings ? <> · {settings}</> : null}</div>
        </div>
        <button type="button" onClick={() => setLocation(INVITE_GAMES[game].route)} className="p-1.5 text-white/60" aria-label={tr("Huỷ", "Cancel", "取消")}><X className="w-5 h-5" /></button>
      </div>
      <button type="button" disabled={busy} onClick={go} className="h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-base flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60" data-testid="button-challenge-go">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>⚔️ {tr("Mở bàn và mời", "Open a table & invite", "開桌並邀請")}</>}
      </button>
    </motion.div>
  );
}

/** "Invite a friend" on a table: the friends list, online first, each with an invite button */
export function InviteFriendsButton({ game, path, className = "" }: { game: InviteGame; path: string; className?: string }) {
  const { tr } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "w-full rounded-2xl py-3 font-black text-white bg-gradient-to-r from-sky-500 to-indigo-600 flex items-center justify-center gap-2"} data-testid="button-invite-friends">
        <UserPlus className="w-5 h-5" />{tr("Mời bạn bè", "Invite a friend", "邀請好友")}
      </button>
      {createPortal(<AnimatePresence>{open && <InviteFriendsSheet game={game} path={path} onClose={() => setOpen(false)} />}</AnimatePresence>, document.body)}
    </>
  );
}

function InviteFriendsSheet({ game, path, onClose }: { game: InviteGame; path: string; onClose: () => void }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const gameName = useGameName();
  const q = useQuery<FriendsView>({ queryKey: FRIENDS_KEY, staleTime: 0 });
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const invite = async (name: string) => {
    setBusy(name);
    try {
      await sendInvite(name, game, path);
      soundManager.ping();
      setSent((s) => new Set(s).add(name));
    } catch (e) { toast({ title: err(e), variant: "destructive" }); } finally { setBusy(null); }
  };
  const friends = [...(q.data?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  return (
    <Sheet title={tr("Mời bạn bè", "Invite a friend", "邀請好友")} icon={<UserPlus className="w-5 h-5 text-yellow-300" />} onClose={onClose} testid="invite-friends-sheet">
      {!q.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-10" /> : friends.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-white/60">{tr("Bạn chưa có bạn bè nào. Hãy kết bạn trong Cộng Đồng!", "No friends yet. Make some in Community!", "你還沒有好友，到社群認識新朋友吧！")}</div>
      ) : friends.map((f) => (
        <div key={f.username} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5" data-testid={`invite-row-${f.username}`}>
          <Avatar user={f} size={40} online={f.online} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5"><span className="font-bold text-white truncate">{f.username}</span><LevelBadge level={f.level} /></div>
            <div className={`text-[11px] truncate ${f.playing ? "text-yellow-200" : f.online ? "text-emerald-300" : "text-white/40"}`}>{f.playing ? gameName(f.playing) : f.online ? tr("Đang online", "Online", "在線上") : tr("Ngoại tuyến", "Offline", "離線")}</div>
          </div>
          {sent.has(f.username) ? (
            <span className="h-9 px-3 rounded-xl bg-emerald-600/25 text-emerald-200 text-xs font-black flex items-center gap-1"><Check className="w-4 h-4" />{tr("Đã mời", "Invited", "已邀請")}</span>
          ) : (
            <button type="button" disabled={busy === f.username} onClick={() => invite(f.username)} className="h-9 px-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-xs font-black" data-testid={`button-invite-${f.username}`}>
              {busy === f.username ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("Mời", "Invite", "邀請")}
            </button>
          )}
        </div>
      ))}
    </Sheet>
  );
}

export const CHALLENGE_GAMES = INVITE_GAME_IDS;
