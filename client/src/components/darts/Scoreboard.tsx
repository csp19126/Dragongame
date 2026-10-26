import { Wifi, WifiOff } from "lucide-react";
import { average, checkout, hitLabel, type Seat, type X01State } from "@shared/darts";
import { useLang } from "@/lib/lang-context";
import { SEAT_COLORS } from "./callouts";

/** The 501 scoreboard: what each player needs, legs, averages, this visit, and the way out */
export function Scoreboard({ game, names, me, online, msLeft, clockMs }: {
  game: X01State;
  names: [string, string];
  /** Which seat is the viewer (shown first) */
  me: Seat | null;
  online?: [boolean, boolean];
  msLeft?: number | null;
  clockMs?: number;
}) {
  const { tr } = useLang();
  const order: Seat[] = me === 1 ? [1, 0] : [0, 1];
  return (
    <div className="w-full grid grid-cols-2 gap-1.5" data-testid="darts-scoreboard">
      {order.map((s) => {
        const active = game.turn === s && game.winner === null;
        const rem = game.scores[s];
        const left = 3 - (active ? game.visit.length : 0);
        const co = active && rem <= 170 ? checkout(rem, left) : null;
        return (
          <div key={s} className={`relative rounded-2xl px-2.5 py-1.5 border transition-all overflow-hidden ${active ? "bg-yellow-400/15 border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.3)]" : "bg-black/35 border-white/10"}`} data-testid={`darts-player-${s}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEAT_COLORS[s] }} />
              {online && (online[s] ? <Wifi className="w-3 h-3 text-green-400 shrink-0" /> : <WifiOff className="w-3 h-3 text-red-400 shrink-0" />)}
              <span className="font-black text-[13px] text-white truncate flex-1">{names[s]}</span>
              {game.legsToWin > 1 && (
                <span className="flex gap-0.5 shrink-0" aria-label="legs">
                  {Array.from({ length: game.legsToWin }, (_, i) => <span key={i} className={`w-2 h-2 rounded-full ${i < game.legs[s] ? "bg-yellow-300" : "bg-white/15"}`} />)}
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-1">
              <span className={`font-mono font-black leading-none ${active ? "text-yellow-200" : "text-white/85"} text-[2.1rem]`} data-testid={`darts-score-${s}`}>{rem}</span>
              <span className="text-[10px] text-white/55 font-bold text-right leading-tight pb-0.5">
                {tr("TB", "Avg", "平均")} {average(game, s).toFixed(1)}
                {game.max[s] > 0 && <span className="block text-yellow-300">180 ×{game.max[s]}</span>}
              </span>
            </div>
            <div className="h-4 mt-0.5 text-[11px] font-black truncate">
              {active && game.visit.length > 0 && <span className="text-white/80 font-mono">{game.visit.map(hitLabel).join(" · ")} </span>}
              {co ? <span className="text-emerald-300" data-testid="darts-checkout">✓ {co.join(" ")}</span>
                : !active && game.lastVisit?.by === s ? <span className="text-white/45 font-mono">{game.lastVisit.bust ? tr("Quá điểm", "Bust", "爆分") : `+${game.lastVisit.total}`}</span> : null}
            </div>
            {active && msLeft != null && clockMs && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                <div className={`h-full ${msLeft < 8000 ? "bg-red-500" : "bg-yellow-400"}`} style={{ width: `${Math.min(100, (msLeft / clockMs) * 100)}%`, transition: "width 1s linear" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
