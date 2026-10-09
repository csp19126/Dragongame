import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Loader2, RefreshCw } from "lucide-react";
import { GAME_NAMES, BONUS_NAMES, type AdminAnalytics } from "@shared/analytics";
import { PlayerDrawer } from "./PlayerDrawer";

// Chart colours: validated for colour-blind separation and contrast on this dark surface
const C = { s1: "#3987e5", s2: "#d95926", grid: "rgba(255,255,255,0.08)", axis: "rgba(255,255,255,0.45)", surface: "#1a0f2e" };

const fmt = (n: number) => n.toLocaleString("en-GB");
const short = (n: number) => (Math.abs(n) >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
export const gameName = (g: string) => GAME_NAMES[g] ?? { label: g, icon: "🎮" };

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl p-4 bg-black/25 border border-white/[0.07] ${className}`}>
      <h3 className="text-sm font-black text-white">{title}</h3>
      {sub && <p className="text-[11px] text-white/45 mb-2">{sub}</p>}
      <div className={sub ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl p-3 bg-black/25 border border-white/[0.07] min-w-0">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/45">{label}</div>
      <div className="text-2xl font-black text-white leading-tight [overflow-wrap:anywhere]">{value}</div>
      {note && <div className="text-[11px] text-white/50">{note}</div>}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-4 text-[11px] text-white/70 mb-1">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="w-3 h-[3px] rounded-full" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

function ChartTip({ active, payload, label, fmtValue = fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-[#0b0716] border border-white/15 px-3 py-2 text-xs shadow-xl">
      <div className="font-black text-white mb-1">{label && /^\d{4}-/.test(label) ? dayLabel(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-white/80">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="text-white">{fmtValue(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = { stroke: C.axis, fontSize: 10, tickLine: false, axisLine: false } as const;

/** Everything about how the game is doing, in one page */
export function OverviewTab() {
  const [days, setDays] = useState(30);
  const [admins, setAdmins] = useState(false);
  const [player, setPlayer] = useState<string | null>(null);
  const q = useQuery<AdminAnalytics>({ queryKey: [`/api/admin/analytics?days=${days}&admins=${admins ? 1 : 0}`], refetchInterval: 60_000 });

  if (!q.data) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>;
  const a = q.data;
  const k = a.kpis;
  const totals = a.daily.reduce((t, d) => ({ plays: t.plays + d.plays, wagered: t.wagered + d.wagered, paid: t.paid + d.paid, signups: t.signups + d.signups }), { plays: 0, wagered: 0, paid: 0, signups: 0 });
  const gameMax = Math.max(1, ...a.games.map((g) => g.plays));
  const peakHour = a.hours.indexOf(Math.max(...a.hours));
  const range = days === 1 ? "today" : `last ${days} days`;

  return (
    <div className="space-y-4" data-testid="admin-overview">
      {/* Filters, in one row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-black/30 p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-black ${days === d ? "bg-yellow-400 text-black" : "text-white/60"}`}>{d} days</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70 font-bold cursor-pointer">
          <input type="checkbox" checked={admins} onChange={(e) => setAdmins(e.target.checked)} className="accent-yellow-400" />
          Include admins (you)
        </label>
        <button type="button" onClick={() => q.refetch()} className="ml-auto p-2 rounded-xl bg-white/5 text-white/60" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} /></button>
      </div>
      {a.trackingSince && (
        <p className="text-[11px] text-white/45">Game-by-game numbers start from {new Date(a.trackingSince).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, when tracking was switched on. Sign-ups and accounts go back to the start.</p>
      )}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Online now" value={fmt(k.onlineNow)} note="seen in the last 10 min" />
        <Tile label="Played today" value={fmt(k.dau)} note={`${fmt(k.wau)} this week · ${fmt(k.mau)} this month`} />
        <Tile label="New today" value={fmt(k.newToday)} note={`${fmt(k.new7)} this week · ${fmt(k.new30)} this month`} />
        <Tile label="Players" value={fmt(k.totalUsers)} note="accounts in total" />
        <Tile label="Plays today" value={fmt(k.playsToday)} note={`${short(k.wageredToday)} coins staked`} />
        <Tile label="Paid back today" value={pct(k.paidToday, k.wageredToday)} note={`${short(k.paidToday)} of ${short(k.wageredToday)}`} />
        <Tile label="Came back next day" value={pct(a.retention.d1.returned, a.retention.d1.joined)} note={`${a.retention.d1.returned} of ${a.retention.d1.joined} new players`} />
        <Tile label="Came back after a week" value={pct(a.retention.d7.returned, a.retention.d7.joined)} note={`${a.retention.d7.returned} of ${a.retention.d7.joined} new players`} />
      </div>

      <Card title="Players each day" sub={`Players who opened the game, and new sign-ups · ${range}`}>
        <Legend items={[{ color: C.s1, label: "Played" }, { color: C.s2, label: "Signed up" }]} />
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={a.daily} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} {...axisProps} minTickGap={24} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(255,255,255,0.3)" }} />
              <Line type="monotone" dataKey="active" name="Played" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="signups" name="Signed up" stroke={C.s2} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Games played each day" sub={`${fmt(totals.plays)} plays · ${range}`}>
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={a.daily} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axisProps} minTickGap={24} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                <Bar dataKey="plays" name="Plays" fill={C.s1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Coins staked and paid back" sub={`${short(totals.wagered)} staked, ${short(totals.paid)} paid back (${pct(totals.paid, totals.wagered)}) · ${range}`}>
          <Legend items={[{ color: C.s1, label: "Staked" }, { color: C.s2, label: "Paid back" }]} />
          <div className="h-36">
            <ResponsiveContainer>
              <LineChart data={a.daily} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axisProps} minTickGap={24} />
                <YAxis tickFormatter={short} {...axisProps} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(255,255,255,0.3)" }} />
                <Line type="monotone" dataKey="wagered" name="Staked" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="paid" name="Paid back" stroke={C.s2} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Games" sub={`What people play · ${range}`}>
        {a.games.length === 0 ? <p className="text-sm text-white/50 py-2">No games played in this period.</p> : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead className="text-white/45 text-[10px] uppercase">
                <tr><th className="text-left font-black p-1">Game</th><th className="text-left font-black p-1 w-[30%]">Plays</th><th className="text-right font-black p-1">Players</th><th className="text-right font-black p-1">Staked</th><th className="text-right font-black p-1">Paid back</th><th className="text-right font-black p-1">Biggest</th></tr>
              </thead>
              <tbody>
                {a.games.map((g) => (
                  <tr key={g.game} className="border-t border-white/5">
                    <td className="p-1 font-bold text-white whitespace-nowrap">{gameName(g.game).icon} {gameName(g.game).label}</td>
                    <td className="p-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-r" style={{ width: `${Math.max(4, (g.plays / gameMax) * 100)}%`, background: C.s1 }} />
                        <span className="text-white/80">{fmt(g.plays)}</span>
                      </div>
                    </td>
                    <td className="p-1 text-right text-white/80">{fmt(g.players)}</td>
                    <td className="p-1 text-right text-white/80">{short(g.wagered)}</td>
                    <td className="p-1 text-right text-white/80">{pct(g.paid, g.wagered)}</td>
                    <td className="p-1 text-right text-white/80">{short(g.biggest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Most active players" sub={`Tap a name for everything about them · ${range}`}>
          {a.topPlayers.length === 0 ? <p className="text-sm text-white/50 py-2">Nobody has played in this period.</p> : (
            <div className="divide-y divide-white/5">
              {a.topPlayers.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setPlayer(p.id)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-white/5 rounded-lg px-1">
                  <span className="w-5 text-white/40 text-xs font-black">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-white text-sm truncate">{p.username}</span>
                    <span className="block text-[11px] text-white/45">{fmt(p.plays)} plays · {p.daysPlayed} day{p.daysPlayed === 1 ? "" : "s"} · seen {ago(p.lastSeenAt)}</span>
                  </span>
                  <span className="text-right text-[11px]">
                    <span className="block text-white/80">{short(p.wagered)} staked</span>
                    <span className={`block font-bold ${p.paid >= p.wagered ? "text-emerald-300" : "text-rose-300"}`}>{p.paid >= p.wagered ? "+" : "−"}{short(Math.abs(p.paid - p.wagered))}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title="Newest players" sub="The last 15 to sign up">
          <div className="divide-y divide-white/5">
            {a.recentSignups.map((p) => (
              <button key={p.id} type="button" onClick={() => setPlayer(p.id)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-white/5 rounded-lg px-1">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-white text-sm truncate">{p.username}</span>
                  <span className="block text-[11px] text-white/45">joined {ago(p.createdAt)}{p.invitedBy ? ` · invited by ${p.invitedBy}` : ""}</span>
                </span>
                <span className="text-right text-[11px] text-white/70">
                  <span className="block">{fmt(p.gamesPlayed)} plays</span>
                  <span className="block">seen {ago(p.lastSeenAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="When people play" sub={`Plays by hour, Vietnam time${a.hours.some(Boolean) ? ` · busiest ${peakHour}:00–${peakHour + 1}:00` : ""} · ${range}`}>
          <div className="h-36">
            <ResponsiveContainer>
              <BarChart data={a.hours.map((n, h) => ({ hour: `${h}:00`, plays: n }))} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="hour" {...axisProps} interval={5} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                <Bar dataKey="plays" name="Plays" fill={C.s1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Biggest wins" sub={range}>
          {a.biggestWins.length === 0 ? <p className="text-sm text-white/50 py-2">No wins yet in this period.</p> : (
            <div className="divide-y divide-white/5 text-xs">
              {a.biggestWins.map((w, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <span>{gameName(w.game).icon}</span>
                  <span className="flex-1 min-w-0 truncate font-bold text-white">{w.username}</span>
                  <span className="text-white/50">{short(w.bet)} →</span>
                  <span className="font-black text-white">{short(w.payout)}</span>
                  <span className="text-white/45 w-10 text-right">×{+(w.payout / Math.max(1, w.bet)).toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Free coins given out" sub={`${short(k.givenAway)} in total · ${range} · ${short(k.coinsHeld)} coins held by players now`}>
          {a.bonuses.length === 0 ? <p className="text-sm text-white/50 py-2">None in this period.</p> : (
            <div className="divide-y divide-white/5 text-xs">
              {a.bonuses.map((b) => (
                <div key={b.method} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-white font-bold">{BONUS_NAMES[b.method] ?? b.method}</span>
                  <span className="text-white/50">{fmt(b.times)}×</span>
                  <span className="font-black text-white w-16 text-right">{short(b.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Do new players come back?" sub="Each day's new players, and how many returned the next day and a week later">
          {a.retention.cohorts.length === 0 ? <p className="text-sm text-white/50 py-2">No new players in the last 30 days.</p> : (
            <table className="w-full text-xs">
              <thead className="text-white/45 text-[10px] uppercase"><tr><th className="text-left p-1">Joined</th><th className="text-right p-1">New</th><th className="text-right p-1">Next day</th><th className="text-right p-1">A week later</th></tr></thead>
              <tbody>
                {a.retention.cohorts.map((c) => {
                  const age = (new Date(`${a.today}T00:00:00Z`).getTime() - new Date(`${c.day}T00:00:00Z`).getTime()) / 86_400_000;
                  return (
                    <tr key={c.day} className="border-t border-white/5 text-white/80">
                      <td className="p-1 text-white font-bold">{dayLabel(c.day)}</td>
                      <td className="p-1 text-right">{c.joined}</td>
                      <td className="p-1 text-right">{age >= 1 ? `${c.d1} (${pct(c.d1, c.joined)})` : "—"}</td>
                      <td className="p-1 text-right">{age >= 7 ? `${c.d7} (${pct(c.d7, c.joined)})` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-white/40">Chat messages today: {fmt(k.chatToday)}. "Paid back" is the share of staked coins returned as winnings (stake included). Coins are play money only.</p>

      {player && <PlayerDrawer id={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}
