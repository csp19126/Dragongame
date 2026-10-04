import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Play, Plus, Trophy, X } from "lucide-react";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_PRIZES, DEFAULT_SIZE, TOURNAMENT_SIZES } from "@shared/tournament";

interface Row { id: number; name: string; startsAt: string; size: number; prizes: number[]; status: string; auto: boolean; winnerName: string | null; players: number }
interface View { tournaments: Row[]; weekly: boolean; nextWeekly: string }

const KEY = ["/api/admin/tournaments"];
const when = (d: string) => new Date(d).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-500/20 text-emerald-300", live: "bg-red-500/30 text-red-200", finished: "bg-white/10 text-white/60", cancelled: "bg-white/5 text-white/40",
};
/** A datetime-local value for an hour from now, in the admin's own time zone */
function inAnHour() {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Create, start and cancel pool tournaments; switch the weekly one on or off */
export function TournamentsTab() {
  const { toast } = useToast();
  const q = useQuery<View>({ queryKey: KEY, refetchInterval: 10_000 });
  const [form, setForm] = useState({ name: "", startsAt: inAnHour(), size: DEFAULT_SIZE, p1: DEFAULT_PRIZES[0], p2: DEFAULT_PRIZES[1], p3: DEFAULT_PRIZES[2] });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: KEY }); queryClient.invalidateQueries({ queryKey: ["/api/tournaments/current"] }); };
  const fail = (e: unknown) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/tournaments", {
      name: form.name.trim(), startsAt: new Date(form.startsAt).toISOString(), size: form.size, prizes: [form.p1, form.p2, form.p3],
    }),
    onSuccess: () => { toast({ title: "Tournament created" }); setForm((f) => ({ ...f, name: "" })); refresh(); },
    onError: fail,
  });
  const start = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/admin/tournaments/${id}/start`)).json(),
    onSuccess: (r: { result: string }) => { toast({ title: r.result === "started" ? "Started: the bracket is drawn" : "Cancelled: fewer than 2 players" }); refresh(); },
    onError: fail,
  });
  const cancel = useMutation({ mutationFn: (id: number) => apiRequest("POST", `/api/admin/tournaments/${id}/cancel`), onSuccess: refresh, onError: fail });
  const weekly = useMutation({ mutationFn: (enabled: boolean) => apiRequest("PUT", "/api/admin/tournaments/weekly", { enabled }), onSuccess: refresh, onError: fail });

  if (!q.data) return <div className="text-center py-12 text-yellow-400/40">Loading…</div>;
  const v = q.data;
  const input = "w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white text-sm";

  return (
    <div className="space-y-6" data-testid="admin-tournaments">
      <section className="rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
        <CalendarClock className="w-6 h-6 text-yellow-400 shrink-0" />
        <div className="flex-1 text-sm">
          <div className="font-black text-white">Weekly tournament: Saturday 20:00 Vietnam time</div>
          <div className="text-white/50 text-xs">{v.weekly ? `On. The next one is made automatically (${when(v.nextWeekly)} your time).` : "Off. Only tournaments you create below will run."}</div>
        </div>
        <button onClick={() => weekly.mutate(!v.weekly)} className={`px-4 py-2 rounded-xl font-black text-sm ${v.weekly ? "bg-emerald-500 text-black" : "bg-white/10 text-white/70"}`} data-testid="button-weekly-toggle">{v.weekly ? "On" : "Off"}</button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Plus className="w-4 h-4" />New tournament</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Giải Bi-a Tết" maxLength={60} className={input} data-testid="input-tournament-name" />
          <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={input} />
          <label className="text-xs text-white/60">Most players
            <select value={form.size} onChange={(e) => setForm({ ...form, size: Number(e.target.value) })} className={input}>
              {TOURNAMENT_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["p1", "p2", "p3"] as const).map((k, i) => (
              <label key={k} className="text-xs text-white/60">{["🥇 1st", "🥈 2nd", "🥉 3rd/4th"][i]}
                <input type="number" min={0} step={100000} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={input} />
              </label>
            ))}
          </div>
        </div>
        <button onClick={() => create.mutate()} disabled={form.name.trim().length < 3 || create.isPending} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 font-black text-sm disabled:opacity-40" data-testid="button-create-tournament">Create</button>
        <p className="text-[11px] text-white/40">Entry is always free and prizes are play coins, so a tournament is a skill competition, not gambling. Players get 5 minutes to sit down for each match.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Trophy className="w-4 h-4" />Tournaments</h3>
        {v.tournaments.length === 0 && <p className="text-sm text-white/40">None yet.</p>}
        {v.tournaments.map((t) => (
          <div key={t.id} className="rounded-xl bg-white/5 border border-white/5 px-3 py-2 flex items-center gap-3 flex-wrap" data-testid={`admin-tournament-${t.id}`}>
            <div className="flex-1 min-w-[180px]">
              <div className="font-black text-white text-sm">{t.name} {t.auto && <span className="text-[10px] text-white/40">(weekly)</span>}</div>
              <div className="text-xs text-white/50">{when(t.startsAt)} · {t.players}/{t.size} players · 🥇 {t.prizes[0].toLocaleString()}{t.winnerName ? ` · 🏆 ${t.winnerName}` : ""}</div>
            </div>
            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
            {t.status === "open" && (
              <>
                <button onClick={() => { if (confirm(`Start "${t.name}" now with ${t.players} player(s)?`)) start.mutate(t.id); }} className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-200 text-xs font-bold flex items-center gap-1"><Play className="w-3 h-3" />Start now</button>
                <button onClick={() => { if (confirm(`Cancel "${t.name}"?`)) cancel.mutate(t.id); }} className="px-2.5 py-1.5 rounded-lg bg-red-600/30 text-red-200 text-xs font-bold flex items-center gap-1"><X className="w-3 h-3" />Cancel</button>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
