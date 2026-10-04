import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, Gift, Loader2, Lock, Sparkles, Ticket, User } from "lucide-react";
import { STARTING_BALANCE } from "@shared/schema";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const GAMES = [
  { icon: "🐉", vi: "Slot Rồng", en: "Dragon Slot" },
  { icon: "🦀", vi: "Bầu Cua", en: "Bầu Cua" },
  { icon: "🎡", vi: "Roulette", en: "Roulette" },
  { icon: "🃏", vi: "Xì Dách", en: "Blackjack" },
];

/** Gold sparks drifting up behind the panel (JS-free on purpose: purely decorative) */
function Sparks() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-yellow-300 shadow-[0_0_8px_2px_rgba(250,204,21,0.6)]"
          style={{ left: `${(i * 53) % 100}%`, bottom: -10 }}
          animate={{ y: [0, -900], opacity: [0, 1, 0] }}
          transition={{ duration: 7 + (i % 5), repeat: Infinity, delay: (i * 0.7) % 6, ease: "linear" }}
        />
      ))}
    </div>
  );
}

function Field({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500/70 pointer-events-none" />
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-12 rounded-2xl pl-11 pr-4 bg-black/30 border border-yellow-500/25 text-yellow-50 placeholder:text-yellow-100/30 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition";

export default function Auth() {
  const { login, register, user } = useAuth();
  const { lang, t } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [mode, setMode] = useState<"login" | "register">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code") ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [adult, setAdult] = useState(false);
  // A voucher link like vnslot888.online/auth?code=VN888-XXXX-XXXX fills this in
  const [code, setCode] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("code") ?? "").toUpperCase() : "");

  useEffect(() => {
    if (!user) return;
    // Back to where the player was heading (e.g. a friend's pool table invite)
    const next = new URLSearchParams(window.location.search).get("next");
    setLocation(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }, [user, setLocation]);
  if (user) return null;

  const busy = login.isPending || register.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login.mutateAsync({ username, password });
        toast({ title: vi ? "Chào mừng trở lại!" : "Welcome back!", className: "bg-yellow-500 text-purple-900 font-bold" });
        return;
      }
      await register.mutateAsync({ username, password });
      toast({ title: vi ? `Đã tạo tài khoản! +${STARTING_BALANCE.toLocaleString()} 🪙` : `Account created! +${STARTING_BALANCE.toLocaleString()} 🪙`, className: "bg-yellow-500 text-purple-900 font-bold" });
      if (code.trim()) {
        try {
          const r = await (await apiRequest("POST", "/api/promo/redeem", { code: code.trim() })).json();
          queryClient.invalidateQueries({ queryKey: ME_KEY });
          toast({ title: vi ? `🎁 Mã quà tặng: +${r.amount.toLocaleString()} xu!` : `🎁 Voucher: +${r.amount.toLocaleString()} coins!`, className: "bg-yellow-500 text-purple-900 font-bold" });
        } catch {
          toast({ title: vi ? "Mã quà tặng không hợp lệ hoặc đã dùng" : "That voucher code is invalid or used", variant: "destructive" });
        }
      }
    } catch (error) {
      toast({
        title: mode === "login" ? (vi ? "Đăng nhập thất bại" : "Login failed") : (vi ? "Đăng ký thất bại" : "Registration failed"),
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[radial-gradient(ellipse_at_top,#4a0d1f_0%,#1a0a35_45%,#07030f_100%)] relative overflow-hidden">
      <Sparks />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-5">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-yellow-400/40 blur-2xl scale-110" />
            <img src="/icons/icon-512.png" alt="VnSlot 888" className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[2rem] border-2 border-yellow-300/70 shadow-[0_10px_40px_rgba(0,0,0,0.6)]" data-testid="img-auth-logo" />
          </motion.div>
          <h1 className="mt-4 font-display text-5xl leading-none bg-gradient-to-b from-yellow-100 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_2px_16px_rgba(250,204,21,0.35)]">VnSlot 888</h1>
          <p className="mt-1 text-[11px] font-black tracking-[0.35em] text-yellow-500/80 uppercase">{t.subtitle}</p>
        </div>

        {/* The games */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {GAMES.map((g) => (
            <div key={g.en} className="rounded-2xl bg-white/5 border border-yellow-500/15 py-2 text-center">
              <div className="text-2xl leading-none">{g.icon}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-yellow-100/70">{vi ? g.vi : g.en}</div>
            </div>
          ))}
        </div>

        {/* Panel */}
        <div className="rounded-[2rem] p-[1.5px] bg-gradient-to-b from-yellow-300/70 via-orange-500/40 to-purple-700/40 shadow-[0_0_60px_rgba(234,88,12,0.25)]">
          <div className="rounded-[calc(2rem-1.5px)] bg-[#140a26]/95 backdrop-blur-xl p-6 sm:p-7 space-y-5">
            <div className="relative grid grid-cols-2 p-1 rounded-2xl bg-black/40 border border-white/5">
              <motion.div
                layout
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 shadow-[0_0_20px_rgba(234,179,8,0.35)]"
                style={{ left: mode === "login" ? 4 : "calc(50%)" }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  data-testid={`tab-${m}`}
                  className={`relative z-10 py-2.5 rounded-xl font-black uppercase text-sm tracking-wider transition-colors ${mode === m ? "text-purple-950" : "text-yellow-400/60 hover:text-yellow-300"}`}
                >
                  {m === "login" ? (vi ? "Đăng nhập" : "Login") : (vi ? "Đăng ký" : "Register")}
                </button>
              ))}
            </div>

            {mode === "register" && (
              <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-yellow-500/15 to-orange-500/10 border border-yellow-400/30 px-4 py-3">
                <Gift className="w-6 h-6 text-yellow-300 shrink-0" />
                <p className="text-sm text-yellow-100">
                  <b className="text-yellow-300">+{STARTING_BALANCE.toLocaleString()} {vi ? "xu" : "coins"}</b> {vi ? "khi đăng ký, thêm xu miễn phí mỗi ngày." : "when you join, plus free coins every day."}
                </p>
              </div>
            )}

            <form onSubmit={submit} className="space-y-3.5">
              <Field icon={User}>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.username} autoComplete="username" required minLength={3} maxLength={24} className={inputCls} data-testid="input-username" />
              </Field>
              <Field icon={Lock}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.password}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  className={`${inputCls} pr-12`}
                  data-testid="input-password"
                />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-yellow-100/50 hover:text-yellow-100" aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </Field>

              {mode === "register" && (
                <>
                  <Field icon={Ticket}>
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={vi ? "Mã quà tặng (nếu có)" : "Voucher code (optional)"} autoComplete="off" className={`${inputCls} font-mono uppercase`} data-testid="input-voucher" />
                  </Field>
                  <p className="text-[11px] text-yellow-100/40 -mt-1 pl-1">{vi ? "3-24 ký tự cho tên, mật khẩu ít nhất 6 ký tự." : "Username 3-24 characters, password at least 6."}</p>
                  <label className="flex items-start gap-2.5 text-sm text-yellow-100/80 cursor-pointer select-none">
                    <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} required className="mt-0.5 w-4 h-4 accent-yellow-500" data-testid="checkbox-adult" />
                    <span>{vi ? "Tôi từ 18 tuổi trở lên và đồng ý với " : "I'm 18 or older and agree to the "}<a href="/terms" className="underline text-yellow-300">{vi ? "Điều khoản" : "Terms"}</a>.</span>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={busy || (mode === "register" && !adult)}
                data-testid="button-submit"
                className="w-full h-13 py-3.5 rounded-2xl font-display font-black text-xl text-purple-950 bg-gradient-to-b from-yellow-300 via-yellow-500 to-orange-500 border-b-4 border-orange-700 shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:brightness-110 active:translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="animate-spin w-6 h-6" /> : <><Sparkles className="w-5 h-5" />{mode === "login" ? (vi ? "Vào chơi" : "Play now") : (vi ? "Tạo tài khoản" : "Create account")}</>}
              </button>
            </form>

            <p className="text-center text-sm text-yellow-100/50">
              {mode === "login" ? (vi ? "Chưa có tài khoản? " : "New here? ") : (vi ? "Đã có tài khoản? " : "Already playing? ")}
              <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="font-black text-yellow-300 hover:underline">
                {mode === "login" ? (vi ? "Đăng ký miễn phí" : "Join free") : (vi ? "Đăng nhập" : "Log in")}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-yellow-500/50 text-[11px] mt-6 px-4">{t.playMoneyNote} 18+</p>
      </motion.div>
    </div>
  );
}
