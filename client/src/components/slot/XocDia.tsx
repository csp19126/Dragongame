import { useEffect, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useLang, type LocalText } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { GAMBLE_PAYS, GAMBLE_MAX_ROUNDS, GAMBLE_MAX_STAKE, type GamblePick } from "@shared/gamble";

const FLIP_GAP = 220; // ms between coins turning over
const REVEAL_MS = 250 + 3 * FLIP_GAP + 450; // the verdict lands just after the last coin
const STAMP_MS = 2200; // how long the big WIN / LOST stays over the plate

interface Result { coins: boolean[]; reds: number; won: boolean; payout: number; stake: number; kept: number; gambleAmount: number; rounds: number; canContinue: boolean; balance: number }

const PICKS: { id: GamblePick; name: LocalText; sub: LocalText; cls: string }[] = [
  { id: "chan", name: { vi: "CHẴN", en: "EVEN", zh: "雙" }, sub: { vi: "0, 2, 4 đỏ", en: "0, 2 or 4 red", zh: "0、2 或 4 紅" }, cls: "from-red-600 to-red-800 border-red-300" },
  { id: "le", name: { vi: "LẺ", en: "ODD", zh: "單" }, sub: { vi: "1 hoặc 3 đỏ", en: "1 or 3 red", zh: "1 或 3 紅" }, cls: "from-slate-200 to-slate-400 border-white text-black" },
  { id: "tu_do", name: { vi: "4 ĐỎ", en: "4 RED", zh: "4 紅" }, sub: { vi: "cả bốn đỏ", en: "all four red", zh: "四枚全紅" }, cls: "from-red-500 to-rose-700 border-yellow-300" },
  { id: "tu_trang", name: { vi: "4 TRẮNG", en: "4 WHITE", zh: "4 白" }, sub: { vi: "cả bốn trắng", en: "all four white", zh: "四枚全白" }, cls: "from-white to-slate-300 border-yellow-300 text-black" },
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
  const { tr, loc, srv } = useLang();
  const [pot, setPot] = useState(amount);
  const [rounds, setRounds] = useState(startRounds);
  const [half, setHalf] = useState(false);
  const [phase, setPhase] = useState<"pick" | "shake" | "reveal">("pick");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<GamblePick | null>(null);
  // The verdict waits until every coin has turned over, so the result builds up then lands
  const [verdict, setVerdict] = useState(false);
  // The big stamp over the plate, cleared after a moment so the coins can be seen
  const [stamp, setStamp] = useState(false);
  const card = useAnimationControls();
  const stake = half ? Math.floor(pot / 2) : pot;
  const finished = res !== null && !res.canContinue && verdict;
  const busy = phase === "shake" || (phase === "reveal" && !verdict);
  const pickInfo = PICKS.find((p) => p.id === picked);

  useEffect(() => {
    if (phase !== "reveal" || !res) return;
    const flips = [0, 1, 2, 3].map((i) => window.setTimeout(() => soundManager.coinFlip(), 250 + i * FLIP_GAP));
    const land = window.setTimeout(() => {
      setVerdict(true);
      setStamp(true);
      if (res.won) {
        const big = res.payout >= 16 * res.stake;
        soundManager.win(big);
        coinBurst();
        if (big) { soundManager.bigWinFanfare(); fireworks(2500, 1.2); }
      } else {
        soundManager.gambleLose();
        navigator.vibrate?.([80, 60, 160]);
        void card.start({ x: [0, -14, 14, -10, 10, -5, 5, 0], transition: { duration: 0.5 } });
      }
    }, REVEAL_MS);
    const clear = window.setTimeout(() => setStamp(false), REVEAL_MS + STAMP_MS);
    return () => { flips.forEach(clearTimeout); clearTimeout(land); clearTimeout(clear); };
  }, [phase, res, card]);

  const play = async (pick: GamblePick) => {
    if (busy) return;
    setErr(null);
    setPicked(pick);
    setVerdict(false);
    setStamp(false);
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
    } catch (e) {
      setPhase("pick");
      setErr(e instanceof ApiError ? srv(e.message) : String(e));
    }
  };

  const collect = async () => {
    try { await apiRequest("POST", "/api/game/gamble/collect"); } catch { /* the next spin clears it anyway */ }
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3" data-testid="xoc-dia">
      <motion.div animate={card} className={`relative w-full max-w-sm rounded-[2rem] bg-gradient-to-b from-[#3b0d0d] via-[#1f0a2e] to-[#0a051a] border-2 p-4 flex flex-col items-center gap-3 transition-[border-color,box-shadow] duration-300 ${
        verdict && res ? (res.won ? "border-yellow-300 shadow-[0_0_70px_rgba(250,204,21,0.6)]" : "border-red-500 shadow-[0_0_70px_rgba(239,68,68,0.55)]") : "border-yellow-400/70 shadow-[0_0_50px_rgba(250,204,21,0.25)]"}`}>
        <button type="button" onClick={() => (finished ? onClose(false) : collect())} className="absolute top-3 right-3 text-white/50" aria-label={tr("Đóng", "Close", "關閉")}><X className="w-5 h-5" /></button>
        <div className="text-center">
          <div className="font-display text-3xl text-yellow-300 leading-none">Xóc Đĩa</div>
          <div className="text-[10px] font-black tracking-[0.25em] text-yellow-100/60 uppercase">{tr("Nhân đôi tiền thắng", "Double up your win", "獎金翻倍")}</div>
        </div>

        {/* The plate and bowl */}
        <div className="relative w-56 h-56 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-100 to-slate-300 shadow-[inset_0_-8px_20px_rgba(0,0,0,0.25),0_10px_30px_rgba(0,0,0,0.6)] border-4 border-yellow-500/70" />
          <div className="relative grid grid-cols-2 gap-3">
            {(res?.coins ?? [true, false, true, false]).map((red, i) => (
              <motion.div key={`${i}-${res ? `${res.rounds}-${res.reds}-${res.won}` : "idle"}`}
                initial={res ? { rotateY: 180, scale: 0.8 } : { scale: 0.6 }}
                animate={{ rotateY: 0, scale: 1 }}
                transition={res ? { delay: 0.25 + (i * FLIP_GAP) / 1000, duration: 0.35 } : { duration: 0.2 }}
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
          <AnimatePresence>
            {stamp && res && (res.won ? (
              <motion.div key="win" className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" data-testid="xoc-verdict-win"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="absolute -inset-10 rounded-full opacity-70"
                  style={{ background: "repeating-conic-gradient(from 0deg, rgba(253,224,71,0.55) 0deg 10deg, transparent 10deg 30deg)" }}
                  animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
                <div className="absolute inset-6 rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.55),transparent_70%)]" />
                <motion.div initial={{ scale: 0.2, rotate: -10 }} animate={{ scale: [0.2, 1.25, 1], rotate: 0 }} transition={{ duration: 0.55 }}
                  className="relative font-display text-6xl text-yellow-300 drop-shadow-[0_4px_0_#7c2d12] [-webkit-text-stroke:2px_#7c2d12]">
                  {tr("THẮNG!", "WIN!", "贏！")}
                </motion.div>
                <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                  className="relative mt-1 rounded-full bg-black/70 px-4 py-1 font-mono font-black text-2xl text-green-300 border-2 border-yellow-300">
                  +{res.payout.toLocaleString()} 🪙
                </motion.div>
                <div className="relative mt-1 rounded-full bg-yellow-400 px-3 text-black font-black text-sm">×{Math.round(res.payout / res.stake)}</div>
              </motion.div>
            ) : (
              <motion.div key="lose" className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" data-testid="xoc-verdict-lose"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="absolute inset-0 rounded-full bg-red-950/60" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.75] }} transition={{ duration: 0.5 }} />
                <motion.div initial={{ scale: 3, opacity: 0, rotate: -25 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="relative rounded-2xl border-[6px] border-red-500 bg-black/60 px-5 py-1 font-display text-6xl text-red-500 tracking-wider shadow-[0_0_30px_rgba(239,68,68,0.7)]">
                  {tr("THUA", "LOST", "輸了")}
                </motion.div>
                <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}
                  className="relative mt-3 rounded-full bg-black/75 px-4 py-1 font-mono font-black text-xl text-red-200 border-2 border-red-500">
                  −{res.stake.toLocaleString()} 🪙
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* What happened */}
        <div className="min-h-[3rem] text-center" aria-live="polite" data-testid="xoc-dia-result">
          {res && phase === "reveal" ? (
            !verdict ? (
              <div className="text-yellow-200 font-black text-lg animate-pulse">{tr("Đang mở bát…", "Lifting the bowl…", "開碟中…")}</div>
            ) : (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`font-black text-base ${res.won ? "text-green-300" : "text-red-300"}`}>
                <div>
                  {res.won ? "✅ " : "❌ "}{tr("Bạn chọn", "You picked", "你選了")} <span className="text-white">{pickInfo ? loc(pickInfo.name) : "?"}</span>
                  {" · "}{tr("Ra", "It came", "開出")} <span className="text-white">{res.reds} {tr("đỏ", "red", "紅")}{tr(",", ",", "、")} {4 - res.reds} {tr("trắng", "white", "白")}</span>
                </div>
                <div className="text-xs text-white/70 font-bold">
                  {res.won
                    ? tr(`Tiền thắng giờ là ${res.gambleAmount.toLocaleString()} 🪙`, `Your win is now ${res.gambleAmount.toLocaleString()} 🪙`, `獎金現在是 ${res.gambleAmount.toLocaleString()} 🪙`)
                    : res.kept > 0
                      ? tr(`Còn giữ lại ${res.kept.toLocaleString()} 🪙 (nửa kia an toàn)`, `You kept ${res.kept.toLocaleString()} 🪙 (the safe half)`, `保住了 ${res.kept.toLocaleString()} 🪙（安全的另一半）`)
                      : tr("Mất hết tiền thắng lần này", "This win is gone", "這次的獎金沒了")}
                </div>
              </motion.div>
            )
          ) : (
            <div className="text-yellow-200">
              <div className="text-[11px] font-black uppercase text-white/50">{tr("Tiền cược", "At stake", "押注金額")}</div>
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
                  <button key={String(h)} type="button" disabled={busy} onClick={() => setHalf(h)}
                    className={`py-1.5 rounded-lg text-xs font-black ${half === h ? "bg-yellow-400 text-black" : "text-white/70"}`} data-testid={h ? "xoc-half" : "xoc-all"}>
                    {h ? tr(`Một nửa (${Math.floor(pot / 2).toLocaleString()})`, `Half (${Math.floor(pot / 2).toLocaleString()})`, `一半（${Math.floor(pot / 2).toLocaleString()}）`) : tr(`Tất cả (${pot.toLocaleString()})`, `All (${pot.toLocaleString()})`, `全部（${pot.toLocaleString()}）`)}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 w-full">
              {PICKS.map((p) => (
                <button key={p.id} type="button" disabled={busy || stake <= 0 || stake > GAMBLE_MAX_STAKE} onClick={() => play(p.id)}
                  className={`rounded-2xl border-2 bg-gradient-to-b ${p.cls} py-2 font-black shadow-lg active:scale-95 disabled:opacity-40 ${p.cls.includes("text-black") ? "" : "text-white"}`}
                  data-testid={`xoc-${p.id}`}>
                  <div className="text-lg leading-none">{loc(p.name)} <span className="text-sm">×{GAMBLE_PAYS[p.id]}</span></div>
                  <div className="text-[10px] opacity-80">{loc(p.sub)} → {(stake * GAMBLE_PAYS[p.id]).toLocaleString()}</div>
                </button>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={collect} className="w-full py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-700 text-white font-black text-lg disabled:opacity-40" data-testid="xoc-collect">
              {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : tr(`Lấy ${pot.toLocaleString()} 🪙`, `Collect ${pot.toLocaleString()} 🪙`, `收下 ${pot.toLocaleString()} 🪙`)}
            </button>
            <div className="text-[10px] text-white/40 text-center">
              {tr(`Lượt ${rounds}/${GAMBLE_MAX_ROUNDS} · tỷ lệ công bằng tuyệt đối: Chẵn/Lẻ 8/16, Tứ Đỏ/Tứ Trắng 1/16`, `Round ${rounds}/${GAMBLE_MAX_ROUNDS} · exactly fair odds: even/odd 8 in 16, four of a colour 1 in 16`, `第 ${rounds}/${GAMBLE_MAX_ROUNDS} 輪 · 機率完全公平：雙/單 8/16，四紅/四白 1/16`)}
            </div>
          </>
        ) : (
          <button type="button" onClick={() => onClose(false)} className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg" data-testid="xoc-done">
            {res?.won ? tr("Tuyệt vời! Tiếp tục quay", "Brilliant! Back to the reels", "太棒了！回到轉輪") : tr("Quay tiếp", "Back to the reels", "回到轉輪")}
          </button>
        )}
      </motion.div>
    </div>
  );
}
