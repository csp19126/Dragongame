import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { coinBurst } from "@/lib/celebrate";
import { GAMBLE_PAYS, GAMBLE_MAX_ROUNDS, GAMBLE_MAX_STAKE, type GamblePick } from "@shared/gamble";

interface Result { coins: boolean[]; reds: number; won: boolean; payout: number; stake: number; kept: number; gambleAmount: number; rounds: number; canContinue: boolean; balance: number }

const PICKS: { id: GamblePick; vi: string; en: string; sub: { vi: string; en: string }; cls: string }[] = [
  { id: "chan", vi: "CHẴN", en: "EVEN", sub: { vi: "0, 2, 4 đỏ", en: "0, 2 or 4 red" }, cls: "from-red-600 to-red-800 border-red-300" },
  { id: "le", vi: "LẺ", en: "ODD", sub: { vi: "1 hoặc 3 đỏ", en: "1 or 3 red" }, cls: "from-slate-200 to-slate-400 border-white text-black" },
  { id: "tu_do", vi: "4 ĐỎ", en: "4 RED", sub: { vi: "cả bốn đỏ", en: "all four red" }, cls: "from-red-500 to-rose-700 border-yellow-300" },
  { id: "tu_trang", vi: "4 TRẮNG", en: "4 WHITE", sub: { vi: "cả bốn trắng", en: "all four white" }, cls: "from-white to-slate-300 border-yellow-300 text-black" },
];

/**
 * Xóc Đĩa double-up: stake the last win (all or half) on four coins under a bowl.
 * Every bet pays fair odds; the server shakes the coins.
 */
export function XocDia({ amount, rounds: startRounds, onBalance, onClose }: {
  amount: number;
  rounds: number;
  onBalance: (balance: number, gambleAmount: number, rounds: number) => void;
  onClose: (collected: boolean) => void;
}) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const [pot, setPot] = useState(amount);
  const [rounds, setRounds] = useState(startRounds);
  const [half, setHalf] = useState(false);
  const [phase, setPhase] = useState<"pick" | "shake" | "reveal">("pick");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const stake = half ? Math.floor(pot / 2) : pot;
  const finished = res !== null && !res.canContinue;

  const play = async (pick: GamblePick) => {
    if (phase === "shake") return;
    setErr(null);
    setPhase("shake");
    setRes(null);
    soundManager.tension();
    const started = Date.now();
    try {
      const r: Result = await (await apiRequest("POST", "/api/game/gamble", { pick, half })).json();
      await new Promise((ok) => setTimeout(ok, Math.max(0, 1400 - (Date.now() - started))));
      setRes(r);
      setPhase("reveal");
      setPot(r.gambleAmount);
      setRounds(r.rounds);
      onBalance(r.balance, r.gambleAmount, r.rounds);
      if (r.won) { soundManager.win(r.payout >= 16 * r.stake); coinBurst(); } else soundManager.lossComfort();
    } catch (e) {
      setPhase("pick");
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  };

  const collect = async () => {
    try { await apiRequest("POST", "/api/game/gamble/collect"); } catch { /* the next spin clears it anyway */ }
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3" data-testid="xoc-dia">
      <div className="relative w-full max-w-sm rounded-[2rem] bg-gradient-to-b from-[#3b0d0d] via-[#1f0a2e] to-[#0a051a] border-2 border-yellow-400/70 shadow-[0_0_50px_rgba(250,204,21,0.25)] p-4 flex flex-col items-center gap-3">
        <button type="button" onClick={() => (finished ? onClose(false) : collect())} className="absolute top-3 right-3 text-white/50" aria-label="Close"><X className="w-5 h-5" /></button>
        <div className="text-center">
          <div className="font-display text-3xl text-yellow-300 leading-none">Xóc Đĩa</div>
          <div className="text-[10px] font-black tracking-[0.25em] text-yellow-100/60 uppercase">{vi ? "Nhân đôi tiền thắng" : "Double up your win"}</div>
        </div>

        {/* The plate and bowl */}
        <div className="relative w-56 h-56 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-100 to-slate-300 shadow-[inset_0_-8px_20px_rgba(0,0,0,0.25),0_10px_30px_rgba(0,0,0,0.6)] border-4 border-yellow-500/70" />
          <div className="relative grid grid-cols-2 gap-3">
            {(res?.coins ?? [true, false, true, false]).map((red, i) => (
              <motion.div key={`${i}-${res?.rounds ?? 0}`} initial={{ scale: 0.6 }} animate={{ scale: 1 }}
                className={`w-14 h-14 rounded-full border-4 shadow-md ${red ? "bg-gradient-to-br from-red-500 to-red-700 border-red-300" : "bg-gradient-to-br from-white to-slate-200 border-slate-300"}`}
                data-testid={`coin-${i}`} />
            ))}
          </div>
          <AnimatePresence>
            {phase !== "reveal" && (
              <motion.div
                key="bowl"
                initial={{ y: -60, opacity: 0 }}
                animate={phase === "shake" ? { y: 0, opacity: 1, rotate: [0, -12, 12, -10, 10, -6, 6, 0], x: [0, -10, 10, -8, 8, -4, 4, 0] } : { y: 0, opacity: 1 }}
                exit={{ y: -120, opacity: 0, rotate: -15 }}
                transition={phase === "shake" ? { duration: 1.2, ease: "easeInOut" } : { duration: 0.35 }}
                className="absolute inset-4 rounded-full bg-gradient-to-b from-amber-700 via-amber-900 to-amber-950 border-4 border-yellow-600 shadow-[0_12px_30px_rgba(0,0,0,0.7)] flex items-center justify-center"
              >
                <span className="text-yellow-400/80 font-display text-2xl">{phase === "shake" ? "..." : "?"}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* What happened */}
        <div className="min-h-[3rem] text-center" aria-live="polite" data-testid="xoc-dia-result">
          {res && phase === "reveal" ? (
            res.won ? (
              <div className="text-green-400 font-black text-xl">{vi ? "THẮNG" : "WIN"} +{res.payout.toLocaleString()} 🪙
                <div className="text-xs text-white/60 font-bold">{res.reds} {vi ? "đỏ" : "red"} · {4 - res.reds} {vi ? "trắng" : "white"}</div>
              </div>
            ) : (
              <div className="text-red-300 font-black text-xl">{vi ? "Thua" : "Lost"} {res.stake.toLocaleString()}
                <div className="text-xs text-white/60 font-bold">{res.reds} {vi ? "đỏ" : "red"} · {4 - res.reds} {vi ? "trắng" : "white"}{res.kept > 0 ? ` · ${vi ? "giữ lại" : "kept"} ${res.kept.toLocaleString()}` : ""}</div>
              </div>
            )
          ) : (
            <div className="text-yellow-200">
              <div className="text-[11px] font-black uppercase text-white/50">{vi ? "Tiền cược" : "At stake"}</div>
              <div className="font-mono font-black text-2xl" data-testid="xoc-dia-stake">{stake.toLocaleString()} 🪙</div>
            </div>
          )}
          {err && <div className="text-red-300 text-sm font-bold">{err}</div>}
        </div>

        {!finished ? (
          <>
            {pot > 0 && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/40 w-full">
                {[false, true].map((h) => (
                  <button key={String(h)} type="button" disabled={phase === "shake"} onClick={() => setHalf(h)}
                    className={`py-1.5 rounded-lg text-xs font-black ${half === h ? "bg-yellow-400 text-black" : "text-white/70"}`} data-testid={h ? "xoc-half" : "xoc-all"}>
                    {h ? (vi ? `Một nửa (${Math.floor(pot / 2).toLocaleString()})` : `Half (${Math.floor(pot / 2).toLocaleString()})`) : (vi ? `Tất cả (${pot.toLocaleString()})` : `All (${pot.toLocaleString()})`)}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 w-full">
              {PICKS.map((p) => (
                <button key={p.id} type="button" disabled={phase === "shake" || stake <= 0 || stake > GAMBLE_MAX_STAKE} onClick={() => play(p.id)}
                  className={`rounded-2xl border-2 bg-gradient-to-b ${p.cls} py-2 font-black shadow-lg active:scale-95 disabled:opacity-40 ${p.cls.includes("text-black") ? "" : "text-white"}`}
                  data-testid={`xoc-${p.id}`}>
                  <div className="text-lg leading-none">{vi ? p.vi : p.en} <span className="text-sm">×{GAMBLE_PAYS[p.id]}</span></div>
                  <div className="text-[10px] opacity-80">{vi ? p.sub.vi : p.sub.en} → {(stake * GAMBLE_PAYS[p.id]).toLocaleString()}</div>
                </button>
              ))}
            </div>
            <button type="button" disabled={phase === "shake"} onClick={collect} className="w-full py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-700 text-white font-black text-lg disabled:opacity-40" data-testid="xoc-collect">
              {phase === "shake" ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (vi ? `Lấy ${pot.toLocaleString()} 🪙` : `Collect ${pot.toLocaleString()} 🪙`)}
            </button>
            <div className="text-[10px] text-white/40 text-center">
              {vi ? `Lượt ${rounds}/${GAMBLE_MAX_ROUNDS} · tỷ lệ công bằng tuyệt đối: Chẵn/Lẻ 8/16, Tứ Đỏ/Tứ Trắng 1/16` : `Round ${rounds}/${GAMBLE_MAX_ROUNDS} · exactly fair odds: even/odd 8 in 16, four of a colour 1 in 16`}
            </div>
          </>
        ) : (
          <button type="button" onClick={() => onClose(false)} className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg" data-testid="xoc-done">
            {res?.won ? (vi ? "Tuyệt vời! Tiếp tục quay" : "Brilliant! Back to the reels") : (vi ? "Quay tiếp" : "Back to the reels")}
          </button>
        )}
      </div>
    </div>
  );
}
