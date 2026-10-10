import { useEffect, useRef, useState } from "react";
import { Redirect } from "wouter";
import { Minus, Plus, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useSetBalance } from "@/hooks/use-game";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { AppFooter } from "@/pages/Home";
import { FISH, BANCA_LEVELS, BANCA_RTP, catchChance, type FishType, type BancaShot } from "@shared/banca";

const W = 400, H = 600;
const CANNON = { x: W / 2, y: H - 34 };
const BULLET_SPEED = 520;
const FIRE_GAP_MS = 220; // under the server's limit of 8 a second
const MAX_FISH = 14;
const fmt = fmtCoins;
const short = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

interface Fish { id: number; t: FishType; x: number; y: number; vx: number; vy: number; phase: number; flash: number; dying: number; born: number }
interface Bullet { x: number; y: number; vx: number; vy: number; bounces: number }
interface Floater { x: number; y: number; text: string; life: number; big: boolean }
interface Coin { x: number; y: number; vx: number; vy: number; life: number }

const totalWeight = FISH.reduce((a, f) => a + f.weight, 0);
function pickFishType(): FishType {
  let r = Math.random() * totalWeight;
  for (const f of FISH) { r -= f.weight; if (r <= 0) return f; }
  return FISH[0];
}

export default function Banca() {
  const { user, isLoading } = useAuth();
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const { data: state } = useGameState();
  const setBalance = useSetBalance();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState(1);
  const [auto, setAuto] = useState(false);
  const [session, setSession] = useState({ spent: 0, won: 0, caught: 0 });
  const [balance, setBal] = useState<number | null>(null);
  // The header's balance too (a ref, since the animation loop is set up once)
  const setHeaderBalance = useRef(setBalance);
  setHeaderBalance.current = setBalance;
  const srvRef = useRef(srv);
  srvRef.current = srv;

  // Everything the animation loop needs lives in refs, so the loop never waits on React
  const g = useRef({
    fish: [] as Fish[], bullets: [] as Bullet[], floaters: [] as Floater[], coins: [] as Coin[],
    aim: -Math.PI / 2, firing: false, lastFire: 0, nextId: 1, lastSpawn: 0, level: BANCA_LEVELS[1], auto: false, balance: 0, stopped: false,
  });
  useEffect(() => { g.current.level = BANCA_LEVELS[levelIdx]; }, [levelIdx]);
  useEffect(() => { g.current.auto = auto; }, [auto]);
  useEffect(() => { if (state && balance === null) { setBal(state.balance); g.current.balance = state.balance; } }, [state, balance]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0, last = performance.now();

    const spawn = (now: number) => {
      const s = g.current;
      if (s.fish.length >= MAX_FISH || now - s.lastSpawn < 650) return;
      let t = pickFishType();
      if (t.id === "rong_vang" && s.fish.some((f) => f.t.id === "rong_vang")) t = FISH[0];
      const fromLeft = Math.random() < 0.5;
      const y = 50 + Math.random() * (H - 220);
      const sp = t.speed * (0.8 + Math.random() * 0.4);
      s.fish.push({ id: s.nextId++, t, x: fromLeft ? -t.size : W + t.size, y, vx: fromLeft ? sp : -sp, vy: (Math.random() - 0.5) * 18, phase: Math.random() * 6, flash: 0, dying: 0, born: now });
      s.lastSpawn = now;
    };

    const shotAt = (f: Fish) => {
      const s = g.current;
      const level = s.level;
      void apiRequest("POST", "/api/banca/shoot", { level, fish: f.t.id })
        .then((r) => r.json() as Promise<BancaShot>)
        .then((r) => {
          s.balance = r.balance;
          setBal(r.balance);
          setHeaderBalance.current(r.balance);
          setSession((x) => ({ spent: x.spent + level, won: x.won + r.payout, caught: x.caught + (r.caught ? 1 : 0) }));
          if (r.caught) {
            if (!f.dying) f.dying = 1;
            s.floaters.push({ x: f.x, y: f.y - f.t.size / 2, text: `+${fmt(r.payout)}`, life: 1.6, big: r.mult >= 50 });
            const n = Math.min(24, 4 + Math.round(Math.sqrt(r.mult) * 2));
            for (let i = 0; i < n; i++) s.coins.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 220, life: 1.2 + Math.random() * 0.4 });
            if (r.mult >= 50) soundManager.bigWinFanfare(); else soundManager.coinDrop();
            navigator.vibrate?.(r.mult >= 50 ? [80, 40, 120] : 20);
          }
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 400) {
            s.firing = false; setAuto(false);
            if (!s.stopped) { s.stopped = true; toast({ title: srvRef.current(e.message), variant: "destructive" }); setTimeout(() => { s.stopped = false; }, 3000); }
          }
        });
    };

    const fire = (now: number) => {
      const s = g.current;
      if (!(s.firing || s.auto) || now - s.lastFire < FIRE_GAP_MS || s.bullets.length >= 12) return;
      if (s.balance < s.level) return;
      s.lastFire = now;
      s.bullets.push({ x: CANNON.x + Math.cos(s.aim) * 36, y: CANNON.y + Math.sin(s.aim) * 36, vx: Math.cos(s.aim) * BULLET_SPEED, vy: Math.sin(s.aim) * BULLET_SPEED, bounces: 0 });
      soundManager.buttonClick();
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = g.current;
      spawn(now);
      fire(now);
      // Fish swim, wobbling
      for (const f of s.fish) {
        if (f.dying) { f.dying += dt * 1.8; continue; }
        f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(now / 600 + f.phase) * 0.4;
        if (f.y < 40 || f.y > H - 140) f.vy = -f.vy;
        f.flash = Math.max(0, f.flash - dt);
      }
      s.fish = s.fish.filter((f) => f.dying < 2 && f.x > -f.t.size * 2 && f.x < W + f.t.size * 2);
      // Bullets fly and bounce; a hit costs the shot and asks the server whether it caught
      for (const b of s.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 6 || b.x > W - 6) { b.vx = -b.vx; b.x = Math.max(6, Math.min(W - 6, b.x)); b.bounces++; }
        if (b.y < 6) { b.vy = -b.vy; b.y = 6; b.bounces++; }
        if (b.y > H) b.bounces = 99;
        for (const f of s.fish) {
          if (f.dying) continue;
          const r = f.t.size * 0.45;
          if ((b.x - f.x) ** 2 + (b.y - f.y) ** 2 < r * r) {
            b.bounces = 99;
            f.flash = 0.15;
            shotAt(f);
            break;
          }
        }
      }
      s.bullets = s.bullets.filter((b) => b.bounces < 6);
      for (const c of s.coins) { c.vy += 420 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
      s.coins = s.coins.filter((c) => c.life > 0);
      for (const fl of s.floaters) { fl.y -= 30 * dt; fl.life -= dt; }
      s.floaters = s.floaters.filter((fl) => fl.life > 0);
      draw(now);
      raf = requestAnimationFrame(step);
    };

    const draw = (now: number) => {
      const s = g.current;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0c4a6e"); bg.addColorStop(0.6, "#082f49"); bg.addColorStop(1, "#04121f");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Light from above and drifting bubbles
      ctx.globalAlpha = 0.07;
      for (let i = 0; i < 5; i++) {
        const x = ((i * 97 + now / 40) % (W + 200)) - 100;
        ctx.fillStyle = "#e0f2fe";
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 140, H); ctx.lineTo(x + 80, H); ctx.fill();
      }
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 14; i++) {
        const bx = (i * 53) % W, by = H - ((now / 25 + i * 71) % H);
        ctx.strokeStyle = "#bae6fd"; ctx.beginPath(); ctx.arc(bx + Math.sin(now / 500 + i) * 6, by, 2 + (i % 3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Seabed
      ctx.fillStyle = "#3f2d14";
      ctx.beginPath(); ctx.moveTo(0, H - 60);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - 60 + Math.sin(x / 30) * 6);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.font = "26px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ["🪸", "🌿", "🐚", "🪸", "🌿"].forEach((e, i) => ctx.fillText(e, 30 + i * 85, H - 52));
      // Fish
      for (const f of s.fish) {
        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.dying) { ctx.rotate(f.dying * 6); ctx.scale(Math.max(0.05, 1.6 - f.dying), Math.max(0.05, 1.6 - f.dying)); ctx.globalAlpha = Math.max(0, 2 - f.dying); }
        if (f.vx > 0 && !f.dying) ctx.scale(-1, 1); // emoji face left; flip those swimming right
        if (f.t.mult >= 100) { ctx.shadowColor = "#facc15"; ctx.shadowBlur = 24; }
        ctx.font = `${f.t.size}px serif`;
        ctx.fillText(f.t.icon, 0, 0);
        if (f.flash > 0) { ctx.globalAlpha = 0.6; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, f.t.size * 0.45, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        if (f.t.mult >= 20 && !f.dying) {
          ctx.font = "bold 11px sans-serif"; ctx.fillStyle = "#fde68a";
          ctx.fillText(`×${f.t.mult}`, f.x, f.y + f.t.size * 0.55);
        }
      }
      // Bullets
      for (const b of s.bullets) {
        ctx.fillStyle = "#fde047"; ctx.shadowColor = "#facc15"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Coins and prize text
      ctx.font = "16px serif";
      for (const c of s.coins) { ctx.globalAlpha = Math.min(1, c.life); ctx.fillText("🪙", c.x, c.y); }
      ctx.globalAlpha = 1;
      for (const fl of s.floaters) {
        ctx.globalAlpha = Math.min(1, fl.life);
        ctx.font = `900 ${fl.big ? 30 : 20}px sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = "#7c2d12"; ctx.strokeText(fl.text, fl.x, fl.y);
        ctx.fillStyle = fl.big ? "#fde047" : "#fef3c7"; ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;
      // Cannon
      ctx.save();
      ctx.translate(CANNON.x, CANNON.y);
      ctx.fillStyle = "#78350f"; ctx.beginPath(); ctx.arc(0, 0, 30, Math.PI, 0); ctx.fill();
      ctx.rotate(s.aim + Math.PI / 2);
      const grad = ctx.createLinearGradient(-10, 0, 10, 0);
      grad.addColorStop(0, "#b45309"); grad.addColorStop(0.5, "#fde68a"); grad.addColorStop(1, "#b45309");
      ctx.fillStyle = grad; ctx.fillRect(-10, -44, 20, 44);
      ctx.fillStyle = "#facc15"; ctx.fillRect(-13, -48, 26, 8);
      ctx.restore();
      ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif";
      ctx.fillText(short(s.level), CANNON.x, CANNON.y + 18);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [toast]);

  // Aim at the finger; hold to keep firing
  const aimAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    g.current.aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, Math.atan2(y - CANNON.y, x - CANNON.x)));
  };

  if (isLoading) return null;
  if (!user) return <Redirect to="/auth" />;
  const net = session.won - session.spent;

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-6 flex flex-col gap-3" data-testid="banca-page">
        <GameTabs />
        <div className="flex items-end justify-between px-1">
          <div>
            <div className="font-display text-3xl text-sky-300 leading-none">{tr("Bắn Cá", "Bắn Cá", "捕魚")}</div>
            <div className="text-[11px] text-white/60">{tr("Chạm để ngắm, giữ để bắn liên tục", "Touch to aim, hold to keep firing", "點擊瞄準，按住連續射擊")}</div>
          </div>
          <div className="text-right text-xs">
            <div className="text-white/50">{tr("Lượt này", "This session", "本局")}</div>
            <div className={`font-black ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`} data-testid="banca-session">{net >= 0 ? "+" : "−"}{fmt(Math.abs(net))} · {session.caught} 🐟</div>
          </div>
        </div>

        <div className="relative rounded-3xl overflow-hidden border-4 border-sky-900 shadow-[0_0_30px_rgba(14,165,233,0.25)] touch-none select-none">
          <canvas ref={canvas} className="w-full h-auto block" style={{ aspectRatio: `${W} / ${H}` }} data-testid="banca-canvas"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); aimAt(e); g.current.firing = true; }}
            onPointerMove={(e) => { if (g.current.firing || e.pointerType === "mouse") aimAt(e); }}
            onPointerUp={() => { g.current.firing = false; }}
            onPointerCancel={() => { g.current.firing = false; }} />
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-white/5 p-1">
            <button type="button" onClick={() => setLevelIdx((i) => Math.max(0, i - 1))} className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center" aria-label={tr("Giảm", "Lower", "降低")}><Minus className="w-4 h-4" /></button>
            <div className="w-16 text-center">
              <div className="text-[9px] uppercase font-black text-white/50">{tr("Mỗi phát", "Per shot", "每發")}</div>
              <div className="font-black text-yellow-300" data-testid="banca-level">{fmt(BANCA_LEVELS[levelIdx])}</div>
            </div>
            <button type="button" onClick={() => setLevelIdx((i) => Math.min(BANCA_LEVELS.length - 1, i + 1))} className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center" aria-label={tr("Tăng", "Raise", "提高")}><Plus className="w-4 h-4" /></button>
          </div>
          <div className="text-center">
            <div className="text-[9px] uppercase font-black text-white/50">{tr("Số dư", "Balance", "餘額")}</div>
            <div className="font-mono font-black text-white">{fmt(balance ?? state?.balance ?? 0)}</div>
          </div>
          <button type="button" onClick={() => { setAuto((a) => !a); soundManager.autoSpinToggle(); }}
            className={`h-11 px-3 rounded-2xl font-black text-sm flex items-center gap-1 ${auto ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`} data-testid="banca-auto">
            <Zap className="w-4 h-4" />{tr("Tự bắn", "Auto", "自動")}
          </button>
        </div>

        <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
          <div className="text-sm font-black text-sky-300 mb-2">{tr("Bảng thưởng", "Prizes", "賠率表")}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {FISH.map((f) => (
              <div key={f.id} className="rounded-xl bg-black/30 py-1.5 text-center">
                <div className="text-2xl leading-none">{f.icon}</div>
                <div className={`text-xs font-black ${f.mult >= 100 ? "text-yellow-300" : "text-white"}`}>×{f.mult}</div>
                <div className="text-[9px] text-white/45">{(catchChance(f) * 100).toFixed(catchChance(f) < 0.01 ? 2 : 1)}%</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/50 mt-2">
            {tr(`Mỗi viên trúng cá tính một phát. Cá to thưởng lớn nhưng khó bắt hơn: tỷ lệ bắt được ghi dưới mỗi con, nên con nào cũng hoàn trả đúng ${Math.round(BANCA_RTP * 100)}%. Đạn trượt không mất tiền.`,
              `Each bullet that hits a fish costs one shot. Bigger fish pay more but are harder to catch: the chance is under each one, so every fish returns exactly ${Math.round(BANCA_RTP * 100)}%. Bullets that miss cost nothing.`,
              `每顆子彈打中魚就算一發。大魚獎勵高但較難捕獲：每條魚下方標示捕獲機率，因此每條魚的返還率都剛好是 ${Math.round(BANCA_RTP * 100)}%。沒打中的子彈不扣金幣。`)}
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
