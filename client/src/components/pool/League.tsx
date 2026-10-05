import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2 } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/hooks/use-auth";
import { tierOf, nextTier, LEAGUE_WIN, LEAGUE_LOSS, MIN_SHOTS, MAX_PER_PAIR_PER_DAY, DAILY_WIN_BONUS, type LeagueView, type LeagueRow } from "@shared/league";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`);

function Countdown({ to, serverNow }: { to: string; serverNow: string }) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now - offset) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return <span className="font-mono">{d > 0 ? `${d}d ${h}h ${m}m` : `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</span>;
}

function Form({ form }: { form: string[] }) {
  return (
    <span className="flex gap-0.5">
      {form.map((f, i) => <span key={i} className={`w-2 h-2 rounded-full ${f === "W" ? "bg-emerald-400" : "bg-rose-500/80"}`} />)}
    </span>
  );
}

/** The pool league: this month's table, your place, prizes and how points work */
export function League() {
  const { lang } = useLang();
  const vi = lang === "vi";
  const { user } = useAuth();
  const q = useQuery<LeagueView>({ queryKey: ["/api/pool/league"], refetchInterval: 20_000 });
  if (!q.data) return <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto mt-8" />;
  const v = q.data;
  const [y, m] = v.season.split("-");
  const me = v.me;
  const mine = me ? tierOf(me.points) : tierOf(0);
  const up = nextTier(me?.points ?? 0);

  const row = (r: LeagueRow, highlight = false) => {
    const t = tierOf(r.points);
    const prize = v.prizes[r.rank - 1];
    return (
      <div key={r.username} className={`grid grid-cols-[2rem_1fr_2rem_2rem_2.5rem] items-center gap-1 px-3 py-2 text-sm ${highlight ? "bg-yellow-400/15 border-y border-yellow-400/40" : "border-b border-white/5"}`} data-testid={`league-row-${r.rank}`}>
        <span className={`font-black text-center ${r.rank <= 3 ? "text-yellow-300" : "text-white/50"}`}>{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-white truncate">{t.icon} <span className="truncate">{r.username}</span></span>
          <span className="flex items-center gap-2 text-[10px] text-white/45"><Form form={r.form} />{prize ? <span className="text-yellow-300/80">+{short(prize)}</span> : null}</span>
        </span>
        <span className="text-center text-white/60 text-xs">{r.played}</span>
        <span className="text-center text-emerald-300 text-xs">{r.won}</span>
        <span className="text-right font-black text-yellow-300">{r.points}</span>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-3" data-testid="pool-league">
      {/* Season header */}
      <div className="rounded-3xl p-4 bg-gradient-to-br from-emerald-700/80 via-emerald-900/80 to-[#0b0716] border border-emerald-300/30 shadow-[0_10px_40px_rgba(16,185,129,0.25)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[0.25em] uppercase text-emerald-200/80">{vi ? "Giải Vô Địch Bi-a" : "Pool League"}</div>
            <div className="font-display text-3xl text-white leading-none mt-0.5">{vi ? `Mùa ${m}/${y}` : `Season ${m}/${y}`}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-black text-emerald-100/60">{vi ? "Kết thúc sau" : "Ends in"}</div>
            <div className="text-lg font-black text-white"><Countdown to={v.endsAt} serverNow={v.serverNow} /></div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {v.prizes.slice(0, 3).map((p, i) => (
            <div key={i} className="rounded-2xl bg-black/30 py-2">
              <div className="text-lg">{["🥇", "🥈", "🥉"][i]}</div>
              <div className="text-xs font-black text-yellow-200">{short(p)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-emerald-50/80 text-center">
          {vi ? `Hạng 4-10: ${short(v.prizes[3])} · Chơi ${v.participation.games}+ trận: ${short(v.participation.prize)}` : `4th-10th: ${short(v.prizes[3])} · Play ${v.participation.games}+ games: ${short(v.participation.prize)}`}
        </div>
      </div>

      {/* My standing */}
      <div className="rounded-3xl p-4 bg-white/[0.04] border border-white/10 flex items-center gap-3" data-testid="league-me">
        <div className="text-4xl">{mine.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase font-black text-white/50">{vi ? "Hạng của bạn" : "Your standing"}</div>
          <div className="text-white font-black text-lg leading-tight">
            {me ? `#${me.rank} · ${me.points} ${vi ? "điểm" : "pts"}` : (vi ? "Chưa có trận nào" : "No games yet")}
          </div>
          <div className="text-xs text-white/60">{vi ? mine.vi : mine.en}{up ? ` · ${vi ? `còn ${up.need} điểm lên ${up.tier.vi}` : `${up.need} pts to ${up.tier.en}`} ${up.tier.icon}` : ""}</div>
          {up && (
            <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-yellow-300" style={{ width: `${Math.min(100, (((me?.points ?? 0) - mine.min) / (up.tier.min - mine.min)) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className={`text-center rounded-2xl px-2 py-1.5 ${v.todayBonusTaken ? "bg-white/5 text-white/40" : "bg-yellow-400/15 text-yellow-200 border border-yellow-400/40"}`}>
          <div className="text-lg">🎁</div>
          <div className="text-[9px] font-black leading-tight whitespace-pre-line">{v.todayBonusTaken ? (vi ? "Đã nhận\nhôm nay" : "Taken\ntoday") : `+${short(DAILY_WIN_BONUS)}`}</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl overflow-hidden bg-white/[0.04] border border-white/10">
        <div className="grid grid-cols-[2rem_1fr_2rem_2rem_2.5rem] gap-1 px-3 py-2 text-[10px] font-black uppercase text-white/40 border-b border-white/10">
          <span className="text-center">#</span><span>{vi ? "Cơ thủ" : "Player"}</span><span className="text-center">{vi ? "Tr" : "P"}</span><span className="text-center">{vi ? "Th" : "W"}</span><span className="text-right">{vi ? "Điểm" : "Pts"}</span>
        </div>
        {v.table.length === 0 ? (
          <p className="text-sm text-white/50 text-center py-6">{vi ? "Chưa ai ghi điểm mùa này. Thắng một trận để lên đầu bảng!" : "Nobody has scored this season yet. Win a game to top the table!"}</p>
        ) : v.table.map((r) => row(r, r.username === user?.username))}
        {me && me.rank > v.table.length && row(me, true)}
      </div>

      {v.past.length > 0 && (
        <div className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
          <div className="text-xs font-black uppercase text-yellow-400/80 mb-1 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" />{vi ? "Các nhà vô địch" : "Past champions"}</div>
          {v.past.map((p) => <div key={p.season} className="flex justify-between text-sm py-0.5"><span className="text-white/60">{p.season}</span><span className="font-black text-yellow-200">{p.champion} · {p.points}</span></div>)}
        </div>
      )}

      <details className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 text-sm text-white/75">
        <summary className="font-black text-yellow-300 cursor-pointer">{vi ? "Cách tính điểm" : "How points work"}</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>{vi ? `Thắng ${LEAGUE_WIN} điểm, thua vẫn được ${LEAGUE_LOSS} điểm: chơi nhiều là có lợi.` : `A win is ${LEAGUE_WIN} points and a loss still earns ${LEAGUE_LOSS}: playing always counts.`}</li>
          <li>{vi ? `Mọi trận trực tuyến (cả bàn thường lẫn giải đấu) đều tính, nếu đánh ít nhất ${MIN_SHOTS} cú.` : `Every online game counts (casual or tournament) once it reaches ${MIN_SHOTS} shots.`}</li>
          <li>{vi ? `Tối đa ${MAX_PER_PAIR_PER_DAY} trận mỗi ngày với cùng một đối thủ được tính.` : `At most ${MAX_PER_PAIR_PER_DAY} games a day against the same opponent count.`}</li>
          <li>{vi ? `Trận thắng đầu tiên mỗi ngày: thưởng ${fmt(DAILY_WIN_BONUS)} xu.` : `Your first win each day: ${fmt(DAILY_WIN_BONUS)} bonus coins.`}</li>
          <li>{vi ? "Cuối tháng, thưởng tự động được trả và mùa mới bắt đầu. Thưởng là xu ảo." : "At month end prizes are paid automatically and a new season starts. Prizes are play coins."}</li>
        </ul>
      </details>
    </div>
  );
}
