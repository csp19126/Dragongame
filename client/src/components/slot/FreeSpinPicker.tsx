import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { FREE_SPIN_OPTIONS, type FreeSpinChoice } from "@shared/schema";

export interface PickResult { choice: string; mystery: boolean; mult: number; spins: number; freeSpins: number; freeSpinBet: number }

const NAMES: Record<string, { vi: string; en: string; icon: string; vibe: { vi: string; en: string } }> = {
  steady: { vi: "Ổn Định", en: "Steady", icon: "🧧", vibe: { vi: "Nhiều lượt, nhịp nhàng", en: "Lots of spins, smooth ride" } },
  bold: { vi: "Táo Bạo", en: "Bold", icon: "🧨", vibe: { vi: "Cân bằng", en: "Balanced" } },
  daring: { vi: "Liều Lĩnh", en: "Daring", icon: "🐉", vibe: { vi: "Ít lượt, thắng lớn", en: "Few spins, big hits" } },
  mystery: { vi: "Bí Ẩn", en: "Mystery", icon: "❓", vibe: { vi: "Để Rồng chọn giúp", en: "Let the dragon choose" } },
};

/** Chọn Lì Xì: pick how to take the free spins just won. Every envelope is worth the same on average. */
export function FreeSpinPicker({ units, bet, onPicked }: { units: number; bet: number; onPicked: (r: PickResult) => void }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const [busy, setBusy] = useState<FreeSpinChoice | null>(null);
  const [done, setDone] = useState<PickResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (choice: FreeSpinChoice) => {
    if (busy || done) return;
    setBusy(choice);
    setErr(null);
    soundManager.buttonClick();
    try {
      const r: PickResult = await (await apiRequest("POST", "/api/game/free-spins/pick", { choice })).json();
      setDone(r);
      soundManager.bonus();
      setTimeout(() => onPicked(r), r.mystery ? 1800 : 900);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(null);
    }
  };

  const options: { id: FreeSpinChoice; spins: string; mult: string }[] = [
    ...FREE_SPIN_OPTIONS.map((o) => ({ id: o.id as FreeSpinChoice, spins: String(units / o.mult), mult: `×${o.mult}` })),
    { id: "mystery", spins: "?", mult: "×?" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3" data-testid="free-spin-picker">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm rounded-[2rem] bg-gradient-to-b from-red-700 via-red-900 to-[#1a0510] border-4 border-yellow-300 shadow-[0_0_60px_rgba(239,68,68,0.6)] p-4 text-center">
        <div className="text-4xl">🧧🧧🧧</div>
        <div className="font-display text-3xl text-yellow-200 leading-tight">{vi ? "Chọn Lì Xì!" : "Pick your envelope!"}</div>
        <p className="text-xs text-white/85 mb-3">{vi ? `Bạn thắng lượt quay miễn phí ở mức cược ${bet.toLocaleString()}. Chọn cách nhận:` : `You won free spins at ${bet.toLocaleString()} a spin. Choose how to take them:`}</p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => {
            const n = NAMES[o.id];
            const chosen = done && (done.choice === o.id && !done.mystery || (o.id === "mystery" && done.mystery));
            return (
              <motion.button key={o.id} type="button" onClick={() => pick(o.id)} disabled={!!busy || !!done}
                animate={chosen ? { scale: [1, 1.08, 1] } : {}}
                className={`relative rounded-2xl p-2.5 border-2 text-left transition ${chosen ? "bg-yellow-300 text-black border-white" : "bg-gradient-to-b from-red-600 to-red-800 border-yellow-400/70 text-white"} ${done && !chosen ? "opacity-40" : ""}`}
                data-testid={`pick-${o.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{n.icon}</span>
                  {busy === o.id && !done && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
                <div className="font-black text-sm">{vi ? n.vi : n.en}</div>
                <div className="font-mono font-black text-lg leading-tight">{o.spins} {vi ? "lượt" : "spins"} <span className="text-yellow-200">{chosen ? "" : o.mult}</span>{chosen && <span className="text-red-700">{o.mult}</span>}</div>
                <div className={`text-[10px] ${chosen ? "text-black/70" : "text-white/70"}`}>{vi ? n.vibe.vi : n.vibe.en}</div>
              </motion.button>
            );
          })}
        </div>
        {done && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-black text-yellow-200 text-lg" data-testid="pick-result">
            {done.mystery && (vi ? "Bí ẩn mở ra: " : "The mystery is: ")}{done.spins} {vi ? "lượt" : "spins"} ×{done.mult}!
          </motion.div>
        )}
        {err && <div className="mt-2 text-red-200 text-sm font-bold">{err}</div>}
        <p className="mt-3 text-[10px] text-white/50">{vi ? "Số lượt × hệ số nhân luôn bằng nhau: mọi phong bao có giá trị trung bình như nhau, chỉ khác độ mạo hiểm." : "Spins × multiplier is the same for every envelope: they're all worth the same on average, they just swing differently."}</p>
      </motion.div>
    </div>
  );
}
