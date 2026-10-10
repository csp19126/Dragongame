import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { ShareButton } from "@/components/ShareCard";
import { STICKS, TOPICS, ADVICE, GRADE_NAME, GRADE_BLESSING, type Topic, type Grade } from "@shared/oracle";
import { ORACLE_COOLDOWN_MS } from "@shared/schema";

const GRADE_STYLE: Record<Grade, string> = {
  dai_cat: "from-yellow-300 via-amber-400 to-orange-500 text-black",
  thuong: "from-emerald-400 to-teal-600 text-white",
  trung: "from-sky-400 to-indigo-600 text-white",
  ha: "from-slate-400 to-slate-600 text-white",
};

/**
 * Xin Xăm: ask the Dragon Oracle. The question stays on the phone; the server draws the
 * stick and sets the blessing for the next spin.
 */
export function Oracle({ lastOracleAt, waitingStick, onBlessed, onClose }: {
  lastOracleAt: string | null;
  waitingStick: number | null;
  onBlessed: (stick: number, blessing: number) => void;
  onClose: () => void;
}) {
  const { lang, tr, loc, srv } = useLang();
  const [topic, setTopic] = useState<Topic>("luck");
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<"ask" | "shake" | "answer">(waitingStick ? "answer" : "ask");
  const [stickN, setStickN] = useState<number | null>(waitingStick);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const readyAt = lastOracleAt ? new Date(lastOracleAt).getTime() + ORACLE_COOLDOWN_MS : 0;
  const resting = readyAt > now && phase === "ask";
  const stick = stickN ? STICKS.find((s) => s.n === stickN) ?? null : null;

  const ask = async () => {
    setErr(null);
    setPhase("shake");
    soundManager.anticipation();
    const started = Date.now();
    try {
      const r = await (await apiRequest("POST", "/api/game/oracle")).json();
      await new Promise((ok) => setTimeout(ok, Math.max(0, 2000 - (Date.now() - started))));
      if (!r.granted) { setPhase("ask"); setErr(tr("Thần Rồng đang nghỉ.", "The oracle is resting.", "龍神正在休息。")); return; }
      setStickN(r.stick);
      setPhase("answer");
      soundManager.bonus();
      onBlessed(r.stick, r.blessing);
    } catch (e) {
      setPhase("ask");
      setErr(e instanceof ApiError ? srv(e.message) : String(e));
    }
  };

  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3" data-testid="oracle">
      <div className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-[2rem] bg-gradient-to-b from-[#2a0f4f] via-[#160a2c] to-[#07030f] border-2 border-purple-400/60 shadow-[0_0_50px_rgba(168,85,247,0.35)] p-4 flex flex-col items-center gap-3 text-center">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-white/50" aria-label="Close" data-testid="oracle-close"><X className="w-5 h-5" /></button>
        <div>
          <div className="font-display text-3xl text-yellow-300 leading-none">{tr("Xin Xăm", "Dragon Oracle", "龍神求籤")}</div>
          <div className="text-[10px] font-black tracking-[0.25em] text-purple-200/70 uppercase">{tr("Hỏi Thần Rồng", "Ask the dragon", "請示龍神")}</div>
        </div>

        {/* The bamboo cylinder */}
        <div className="relative h-36 w-28 flex items-end justify-center">
          <AnimatePresence>
            {phase === "answer" && stick && (
              <motion.div key="stick" initial={{ y: 40, rotate: 0, opacity: 0 }} animate={{ y: -10, rotate: 18, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 10 }}
                className="absolute top-0 left-1/2 w-5 h-28 rounded-t-md bg-gradient-to-b from-red-600 to-amber-200 border border-amber-900/50 flex items-start justify-center pt-1 z-10">
                <span className="text-[10px] font-black text-white [writing-mode:vertical-rl]">{stick.n}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            animate={phase === "shake" ? { rotate: [0, -14, 14, -12, 12, -8, 8, -4, 4, 0], y: [0, -4, 0, -4, 0, -3, 0, -2, 0, 0] } : {}}
            transition={{ duration: 1.8, ease: "easeInOut" }}
            className="relative w-24 h-28 rounded-b-2xl rounded-t-lg bg-gradient-to-b from-amber-600 via-amber-700 to-amber-900 border-2 border-yellow-500/70 shadow-[0_10px_30px_rgba(0,0,0,0.6)] overflow-visible"
            style={{ transformOrigin: "50% 100%" }}
          >
            <div className="absolute -top-6 left-2 right-2 flex justify-between">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="w-2 h-10 rounded-t bg-gradient-to-b from-red-500 to-amber-200 border border-amber-900/40" style={{ transform: `rotate(${(i - 2.5) * 5}deg)` }} />)}
            </div>
            <div className="absolute inset-x-0 top-8 text-center text-yellow-300 font-display text-xl">籤</div>
            <div className="absolute inset-x-2 bottom-3 h-1 bg-yellow-500/60 rounded" />
          </motion.div>
        </div>

        {phase !== "answer" ? (
          <>
            <div className="flex flex-wrap justify-center gap-1.5">
              {TOPICS.map((t) => (
                <button key={t.id} type="button" disabled={phase === "shake"} onClick={() => setTopic(t.id)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-black border ${topic === t.id ? "bg-yellow-400 text-black border-yellow-200" : "bg-white/5 text-white/80 border-white/15"}`}
                  data-testid={`topic-${t.id}`}>
                  {t.icon} {loc(t)}
                </button>
              ))}
            </div>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={100} disabled={phase === "shake"}
              placeholder={tr("Hỏi Thần Rồng điều bạn muốn biết… (không bắt buộc)", "Ask the dragon anything… (optional)", "向龍神問任何事…（選填）")}
              className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2.5 text-white text-sm placeholder:text-white/30" data-testid="oracle-question" />
            {resting ? (
              <div className="w-full rounded-2xl bg-white/5 border border-white/10 py-3 text-white/70 text-sm" data-testid="oracle-resting">
                {tr("Thần Rồng đang nghỉ. Quay lại sau", "The oracle is resting. Back in", "龍神正在休息，再等")} <b className="font-mono text-yellow-300">{mmss(readyAt - now)}</b>
              </div>
            ) : (
              <button type="button" onClick={ask} disabled={phase === "shake"} className="w-full py-3 rounded-2xl bg-gradient-to-b from-purple-500 to-fuchsia-700 text-white font-black text-lg border-2 border-yellow-300/60 shadow-[0_0_20px_rgba(217,70,239,0.5)] disabled:opacity-70" data-testid="oracle-ask">
                {phase === "shake" ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />{tr("Đang xin quẻ…", "Shaking…", "求籤中…")}</span> : tr("🎋 Xin quẻ", "🎋 Shake for a fortune", "🎋 搖籤求運")}
              </button>
            )}
            {err && <div className="text-red-300 text-sm font-bold">{err}</div>}
          </>
        ) : stick ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full flex flex-col gap-2" data-testid="oracle-answer">
            {question.trim() && <div className="text-xs text-white/60 italic">“{question.trim()}”</div>}
            <div className={`mx-auto px-3 py-1 rounded-full bg-gradient-to-r ${GRADE_STYLE[stick.grade]} font-black text-sm`} data-testid="oracle-grade">
              {tr(`Quẻ số ${stick.n}`, `Stick ${stick.n}`, `第 ${stick.n} 籤`)} · {loc(GRADE_NAME[stick.grade])}
            </div>
            <div className="rounded-2xl bg-black/40 border border-yellow-500/30 px-3 py-3">
              <p className="font-display text-xl text-yellow-200 leading-snug">{lang === "zh" ? stick.zh[0] : stick.vi[0]}<br />{lang === "zh" ? stick.zh[1] : stick.vi[1]}</p>
              {lang === "en" && <p className="text-xs text-white/60 italic mt-1">{stick.en[0]} / {stick.en[1]}</p>}
              <p className="text-sm text-white/90 mt-2">{tr(stick.meaningVi, stick.meaningEn, stick.meaningZh)}</p>
            </div>
            <div className="rounded-2xl bg-purple-900/40 border border-purple-400/30 px-3 py-2 text-sm text-purple-100">
              <b>{TOPICS.find((t) => t.id === topic)!.icon} {loc(TOPICS.find((t) => t.id === topic)!)}{tr(":", ":", "：")}</b> {loc(ADVICE[topic][stick.grade])}
            </div>
            <div className="rounded-2xl bg-gradient-to-r from-yellow-500/25 to-orange-600/25 border border-yellow-300/60 py-2 font-black text-yellow-200" data-testid="oracle-blessing">
              ✨ {tr("Lượt quay tới được nhân", "Your next spin's winnings", "下一次旋轉贏得金幣")} ×{GRADE_BLESSING[stick.grade]}
            </div>
            <div className="flex gap-2 justify-center">
              <ShareButton label={tr("Khoe quẻ", "Share", "分享籤詩")} className="px-4 py-2.5 text-sm"
                what={{ emoji: "🎋", title: `${tr(`Quẻ số ${stick.n}`, `Stick ${stick.n}`, `第 ${stick.n} 籤`)} · ${loc(GRADE_NAME[stick.grade])}`, detail: tr(stick.vi.join(" / "), stick.en.join(" / "), stick.zh.join(" / ")) }} />
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-sm" data-testid="oracle-done">{tr("Quay thôi!", "Let's spin!", "開轉吧！")}</button>
            </div>
          </motion.div>
        ) : null}

        <p className="text-[10px] text-white/40">{tr("Quẻ xăm chỉ để giải trí: Thần Rồng không biết trước và không thay đổi kết quả quay. Phước lành chỉ nhân tiền thắng của lượt quay tới.", "For fun only: the oracle can't see or change what the reels will do. The blessing just multiplies your next spin's winnings.", "求籤僅供娛樂：龍神無法預知，也無法改變轉輪的結果。祝福只會讓你下一次旋轉贏得的金幣加倍。")}</p>
      </div>
    </div>
  );
}
