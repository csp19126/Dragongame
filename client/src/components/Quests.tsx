import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, ChevronRight, Loader2, ScrollText } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { ME_KEY } from "@/hooks/use-auth";
import { STATE_KEY } from "@/hooks/use-game";
import { useSocialEvent } from "@/hooks/use-social";
import { Sheet, useSocialErr } from "@/components/Social3Bits";
import { useSocial3 } from "@/components/Challenge";
import { QUEST_BY_ID, questText, type QuestKind } from "@shared/social3";

export const QUESTS_KEY = ["/api/quests"];

export interface QuestRow { slot: number; id: string; kind: QuestKind; icon: string; social: boolean; target: number; reward: number; progress: number; claimed: boolean }
export interface QuestsView {
  day: string; resetsAt: string; quests: QuestRow[];
  chest: { amount: number; claimed: boolean; ready: boolean };
  streak: { days: number; inCycle: number; target: number; bonus: number };
}

const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

/** Where to go to work on a quest */
const QUEST_GO: Partial<Record<QuestKind, string>> = {
  spins: "/slot", plays: "/slot", games: "/", wins: "/slot", horse_win: "/dua-ngua", friend_match: "/community?tab=friends",
  chat: "/community?tab=chat", react: "/community?tab=chat", gift: "/community?tab=friends", moment: "/community?tab=moments", like: "/community?tab=moments",
};

function useQuests(enabled = true) {
  const q = useQuery<QuestsView>({ queryKey: QUESTS_KEY, enabled, refetchInterval: 30_000, staleTime: 5_000 });
  // A finished quest rings the bell: refresh the card at once
  useSocialEvent((m) => { if (m.t === "notif" && m.n?.kind === "quest") queryClient.invalidateQueries({ queryKey: QUESTS_KEY }); });
  return q;
}

/** The Lobby card: today's three quests at a glance */
export function LobbyQuestsCard() {
  const { tr } = useLang();
  const { openQuests } = useSocial3();
  const q = useQuests();
  const v = q.data;
  const done = v?.quests.filter((x) => x.progress >= x.target).length ?? 0;
  const ready = (v?.quests.filter((x) => x.progress >= x.target && !x.claimed).length ?? 0) + (v?.chest.ready ? 1 : 0);
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={openQuests}
      className={`w-full rounded-3xl p-3 text-left border flex flex-col gap-2 ${ready ? "bg-gradient-to-br from-yellow-500/30 to-orange-700/25 border-yellow-300/70 shadow-[0_0_24px_rgba(250,204,21,0.25)]" : "bg-gradient-to-br from-purple-800/50 to-black/40 border-yellow-500/25"}`} data-testid="lobby-quests">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📜</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase font-black tracking-widest text-yellow-300/80">{tr("Nhiệm vụ hôm nay", "Today's quests", "每日任務")}</div>
          <div className="text-sm font-black text-white leading-tight">{v ? tr(`${done}/3 hoàn thành`, `${done}/3 done`, `已完成 ${done}/3`) : "…"}{v && v.streak.days > 0 && <span className="text-orange-300"> · 🔥 {v.streak.days}</span>}</div>
        </div>
        {ready > 0 && <span className="px-2.5 h-7 rounded-full bg-red-600 text-white text-xs font-black flex items-center animate-pulse" data-testid="lobby-quests-ready">{tr(`Nhận ${ready}`, `Claim ${ready}`, `領取 ${ready}`)}</span>}
        <ChevronRight className="w-5 h-5 text-white/40" />
      </div>
      {v && (
        <div className="grid grid-cols-3 gap-1.5">
          {v.quests.map((x) => (
            <div key={x.slot} className="rounded-xl bg-black/30 px-2 py-1.5">
              <div className="flex items-center justify-between"><span className="text-lg leading-none">{x.icon}</span>{x.claimed ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <span className="text-[9px] font-black text-yellow-200">+{short(x.reward)}</span>}</div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1"><div className={`h-full ${x.progress >= x.target ? "bg-emerald-400" : "bg-yellow-400"}`} style={{ width: `${Math.round((x.progress / x.target) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </motion.button>
  );
}

/** The quests sheet: progress bars, Claim buttons, the chest and the streak */
export function QuestsSheet({ onClose }: { onClose: () => void }) {
  const { tr, loc } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const [, setLocation] = useLocation();
  const q = useQuests();
  const v = q.data;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: QUESTS_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); queryClient.invalidateQueries({ queryKey: STATE_KEY }); };
  const claim = useMutation({
    mutationFn: async (slot: number) => (await apiRequest("POST", `/api/quests/${slot}/claim`)).json() as Promise<{ reward: number }>,
    onSuccess: (r) => { soundManager.coinShower(); coinBurst(); toast({ title: tr(`✅ +${fmtCoins(r.reward)} xu!`, `✅ +${fmtCoins(r.reward)} coins!`, `✅ +${fmtCoins(r.reward)} 金幣！`) }); refresh(); },
    onError: (e) => { toast({ title: err(e), variant: "destructive" }); refresh(); },
  });
  const chest = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/quests/chest")).json() as Promise<{ amount: number; streakBonus: number; streak: number }>,
    onSuccess: (r) => {
      soundManager.win(true); fireworks(r.streakBonus ? 3500 : 2000); coinBurst();
      toast({
        title: tr(`🎁 Rương: +${fmtCoins(r.amount + r.streakBonus)} xu!`, `🎁 Chest: +${fmtCoins(r.amount + r.streakBonus)} coins!`, `🎁 寶箱：+${fmtCoins(r.amount + r.streakBonus)} 金幣！`),
        description: r.streakBonus ? tr(`🔥 ${r.streak} ngày liên tiếp! Thưởng chuỗi ${fmtCoins(r.streakBonus)} xu`, `🔥 ${r.streak} days in a row! Streak bonus ${fmtCoins(r.streakBonus)}`, `🔥 連續 ${r.streak} 天！連勝獎勵 ${fmtCoins(r.streakBonus)} 金幣`) : undefined,
      });
      refresh();
    },
    onError: (e) => { toast({ title: err(e), variant: "destructive" }); refresh(); },
  });
  const left = v ? Math.max(0, new Date(v.resetsAt).getTime() - now) : 0;
  const hms = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  return (
    <Sheet title={tr("Nhiệm vụ", "Quests", "每日任務")} icon={<ScrollText className="w-5 h-5 text-yellow-300" />} onClose={onClose} testid="quests-sheet">
      {!v ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-12" /> : (
        <div className="p-3 flex flex-col gap-2.5">
          <p className="text-[11px] text-white/55 text-center">{tr("Nhiệm vụ mới sau", "New quests in", "新任務倒數")} <b className="font-mono text-yellow-200">{hms(left)}</b></p>
          {v.quests.map((x) => {
            const def = QUEST_BY_ID.get(x.id);
            const done = x.progress >= x.target;
            const go = QUEST_GO[x.kind];
            return (
              <div key={x.slot} className={`rounded-2xl p-3 border flex items-center gap-3 ${x.claimed ? "bg-emerald-900/20 border-emerald-400/25" : done ? "bg-yellow-500/15 border-yellow-300/60" : "bg-black/30 border-white/10"}`} data-testid={`quest-${x.slot}`}>
                <span className="text-3xl leading-none">{x.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-white leading-tight">{def ? loc(questText(def, def.text)) : x.id}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.round((x.progress / x.target) * 100)}%` }} className={`h-full ${done ? "bg-emerald-400" : "bg-gradient-to-r from-yellow-300 to-orange-500"}`} /></div>
                    <span className="text-[10px] font-black text-white/60 shrink-0" data-testid={`quest-progress-${x.slot}`}>{x.progress}/{x.target}</span>
                  </div>
                  <div className="text-[10px] mt-0.5 flex items-center gap-1.5">
                    <span className="text-yellow-300 font-black">🪙 {fmtCoins(x.reward)}</span>
                    {x.social && <span className="px-1.5 rounded-full bg-sky-500/25 text-sky-200 font-black">{tr("Giao lưu", "Social", "社交")}</span>}
                  </div>
                </div>
                {x.claimed ? (
                  <span className="h-9 px-2.5 rounded-xl bg-emerald-600/25 text-emerald-200 text-xs font-black flex items-center gap-1"><Check className="w-4 h-4" />{tr("Đã nhận", "Done", "已領取")}</span>
                ) : done ? (
                  <motion.button type="button" disabled={claim.isPending} onClick={() => claim.mutate(x.slot)} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.3 }}
                    className="h-10 px-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-sm font-black" data-testid={`quest-claim-${x.slot}`}>{tr("Nhận", "Claim", "領取")}</motion.button>
                ) : go ? (
                  <button type="button" onClick={() => { onClose(); setLocation(go); }} className="h-9 px-3 rounded-xl bg-white/10 text-white text-xs font-black">{tr("Đi", "Go", "前往")}</button>
                ) : null}
              </div>
            );
          })}

          {/* The chest */}
          <div className={`rounded-3xl p-3 border flex items-center gap-3 ${v.chest.ready ? "bg-gradient-to-r from-red-600 to-orange-500 border-yellow-200 shadow-[0_0_24px_rgba(250,204,21,0.45)]" : "bg-black/30 border-white/10"}`} data-testid="quest-chest">
            <motion.span className="text-4xl leading-none" animate={v.chest.ready ? { rotate: [0, -8, 8, -4, 0] } : {}} transition={{ repeat: Infinity, duration: 1.6 }}>{v.chest.claimed ? "🔓" : "🎁"}</motion.span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-white">{tr("Rương hoàn thành", "All-done chest", "全部完成寶箱")}</div>
              <div className="text-[11px] text-white/75">{tr(`Xong cả 3 nhiệm vụ: +${fmtCoins(v.chest.amount)} xu`, `Finish all 3: +${fmtCoins(v.chest.amount)} coins`, `完成全部 3 個任務：+${fmtCoins(v.chest.amount)} 金幣`)}</div>
            </div>
            {v.chest.claimed ? <span className="text-emerald-200 text-xs font-black flex items-center gap-1"><Check className="w-4 h-4" />{tr("Đã mở", "Opened", "已開啟")}</span> : (
              <button type="button" disabled={!v.chest.ready || chest.isPending} onClick={() => chest.mutate()} className="h-10 px-3 rounded-xl bg-yellow-300 text-black text-sm font-black disabled:bg-white/10 disabled:text-white/40" data-testid="button-quest-chest">
                {chest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("Mở", "Open", "開啟")}
              </button>
            )}
          </div>

          {/* The 7-day streak */}
          <div className="rounded-2xl p-3 bg-black/30 border border-orange-400/30" data-testid="quest-streak">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-orange-200">🔥 {tr(`Chuỗi ${v.streak.days} ngày`, `${v.streak.days}-day streak`, `連續 ${v.streak.days} 天`)}</span>
              <span className="text-[10px] font-black text-yellow-300">{tr(`Ngày 7: +${short(v.streak.bonus)}`, `Day 7: +${short(v.streak.bonus)}`, `第 7 天：+${short(v.streak.bonus)}`)}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: v.streak.target }, (_, i) => {
                const lit = i < v.streak.inCycle;
                return <div key={i} className={`h-8 rounded-lg flex items-center justify-center text-[11px] font-black ${lit ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "bg-white/5 text-white/30"}`}>{i === v.streak.target - 1 ? "💰" : i + 1}</div>;
              })}
            </div>
            <p className="text-[10px] text-white/50 mt-2 leading-snug">{tr("Mở rương mỗi ngày để giữ chuỗi. Bỏ một ngày là chuỗi về 0.", "Open the chest every day to keep the streak. Miss a day and it starts again.", "每天開啟寶箱才能維持連續紀錄，漏掉一天就會重新計算。")}</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
