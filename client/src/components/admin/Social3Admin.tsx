import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, Flag, Shield, Trash2 } from "lucide-react";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STICKER_BY_ID } from "@shared/stickers";

interface ClubRow { id: number; name: string; tag: string; emblem: string; color: string; description: string | null; open: boolean; members: number; weeklyXp: number; rank: number; owner: string | null }
interface Week { week: string; winners: { clubId: number; name: string; rank: number; xp: number; paid: number }[] }
interface ClubMsg { id: number; clubId: number; club: string; emblem: string; userId: string; username: string; text: string | null; sticker: string | null; deleted: boolean; createdAt: string; reports: number; mutedUntil: string | null; banned: boolean }
interface MomentRep { kind: "moment" | "comment"; id: number; momentId: number; userId: string; username: string; text: string | null; sticker: string | null; win: { game: string; bet: number; payout: number } | null; hidden: boolean; createdAt: string; reports: number; reasons: string[]; mutedUntil: string | null; banned: boolean }

const CLUBS = ["/api/admin/clubs"];
const REPORTS = ["/api/admin/social3/reports"];
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Actions = (u: { id: string; username: string; mutedUntil: string | null; banned: boolean | null }) => ReactNode;

/** Clubs (rename, disband, weekly winners) and reported club chat, Moments and comments */
export function Social3Admin({ actions }: { actions: Actions }) {
  const { toast } = useToast();
  const clubs = useQuery<{ clubs: ClubRow[]; weeks: Week[] }>({ queryKey: CLUBS, refetchInterval: 30_000 });
  const reports = useQuery<{ clubMessages: ClubMsg[]; moments: MomentRep[] }>({ queryKey: REPORTS, refetchInterval: 20_000 });
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; done: string }) => apiRequest("POST", path, body),
    onSuccess: (_r, v) => { toast({ title: v.done }); queryClient.invalidateQueries({ queryKey: CLUBS }); queryClient.invalidateQueries({ queryKey: REPORTS }); },
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" }),
  });
  const content = (t: string | null, sticker: string | null) => (sticker ? <span className="text-3xl">{STICKER_BY_ID.get(sticker)?.emoji ?? sticker}</span> : t);

  return (
    <>
      <section className="space-y-2" data-testid="admin-reported-club-chat">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Shield className="w-4 h-4" />Reported club chat ({reports.data?.clubMessages.length ?? 0})</h3>
        {reports.data?.clubMessages.length === 0 && <p className="text-sm text-white/40 py-2">No reported club messages.</p>}
        {reports.data?.clubMessages.map((m) => (
          <div key={m.id} className={`rounded-xl px-3 py-2 border ${m.deleted ? "bg-red-950/30 border-red-500/20" : "bg-orange-950/30 border-orange-400/40"}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-black text-yellow-200">{m.username} <span className="text-white/50 font-bold">in {m.emblem} {m.club}</span></span>
              <span className="text-white/40">{when(m.createdAt)}</span>
            </div>
            <div className="text-sm text-white my-1 break-words">{content(m.text, m.sticker)}</div>
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <span className="text-orange-300 flex items-center gap-1"><Flag className="w-3 h-3" />{m.reports}</span>
              {m.deleted
                ? <button onClick={() => run.mutate({ path: `/api/admin/clubs/messages/${m.id}`, body: { hidden: false }, done: "Restored" })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 font-bold flex items-center gap-1"><Eye className="w-3 h-3" />Restore</button>
                : <button onClick={() => run.mutate({ path: `/api/admin/clubs/messages/${m.id}`, body: { hidden: true }, done: "Hidden" })} className="px-2 py-1 rounded-lg bg-red-600/30 text-red-200 font-bold flex items-center gap-1"><EyeOff className="w-3 h-3" />Hide</button>}
              {actions({ id: m.userId, username: m.username, mutedUntil: m.mutedUntil, banned: m.banned })}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2" data-testid="admin-reported-moments">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Camera className="w-4 h-4" />Reported Moments &amp; comments ({reports.data?.moments.length ?? 0})</h3>
        {reports.data?.moments.length === 0 && <p className="text-sm text-white/40 py-2">No reported Moments.</p>}
        {reports.data?.moments.map((m) => {
          const path = m.kind === "moment" ? `/api/admin/moments/${m.id}` : `/api/admin/moments/comments/${m.id}`;
          return (
            <div key={`${m.kind}-${m.id}`} className={`rounded-xl px-3 py-2 border ${m.hidden ? "bg-red-950/30 border-red-500/20" : "bg-orange-950/30 border-orange-400/40"}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-black text-yellow-200">{m.username} <span className="text-white/50 font-bold">{m.kind === "moment" ? "Moment" : `comment on Moment #${m.momentId}`}</span></span>
                <span className="text-white/40">{when(m.createdAt)}</span>
              </div>
              <div className="text-sm text-white my-1 break-words">{content(m.text, m.sticker)}{m.win && <span className="block text-xs text-yellow-300">Win card: {m.win.game} bet {m.win.bet} → {m.win.payout}</span>}</div>
              {m.reasons.length > 0 && <div className="text-[11px] text-white/50">Reasons: {m.reasons.join(" · ")}</div>}
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs mt-1">
                <span className="text-orange-300 flex items-center gap-1"><Flag className="w-3 h-3" />{m.reports}</span>
                {m.hidden
                  ? <button onClick={() => run.mutate({ path, body: { hidden: false }, done: "Restored" })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 font-bold flex items-center gap-1"><Eye className="w-3 h-3" />Restore</button>
                  : <button onClick={() => run.mutate({ path, body: { hidden: true }, done: "Hidden" })} className="px-2 py-1 rounded-lg bg-red-600/30 text-red-200 font-bold flex items-center gap-1"><EyeOff className="w-3 h-3" />Hide</button>}
                {actions({ id: m.userId, username: m.username, mutedUntil: m.mutedUntil, banned: m.banned })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2" data-testid="admin-clubs">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2">🏯 Clubs ({clubs.data?.clubs.length ?? 0})</h3>
        {clubs.data?.clubs.length === 0 && <p className="text-sm text-white/40 py-2">No clubs yet.</p>}
        {clubs.data?.clubs.map((c) => (
          <div key={c.id} className="rounded-xl px-3 py-2 border bg-white/5 border-white/10 flex items-center gap-2">
            <span className="text-2xl">{c.emblem}</span>
            <div className="flex-1 min-w-0">
              <div className="font-black text-white truncate">{c.name} <span className="text-xs" style={{ color: c.color }}>[{c.tag}]</span></div>
              <div className="text-[11px] text-white/50 truncate">#{c.rank} · {c.weeklyXp} XP · {c.members} members · owner {c.owner ?? "?"}{c.description ? ` · “${c.description}”` : ""}</div>
            </div>
            <button onClick={() => { const name = prompt("New club name (3–20)", c.name); if (name && name !== c.name) run.mutate({ path: `/api/admin/clubs/${c.id}/rename`, body: { name, clearDescription: confirm("Also clear the description?") }, done: "Renamed" }); }} className="px-2 py-1 rounded-lg bg-white/10 text-white/80 text-xs font-bold">Rename</button>
            <button onClick={() => { if (confirm(`Disband ${c.name}? Members are told; the fee isn't refunded.`)) run.mutate({ path: `/api/admin/clubs/${c.id}/disband`, done: "Disbanded" }); }} className="px-2 py-1 rounded-lg bg-red-600/30 text-red-200 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" />Disband</button>
          </div>
        ))}
        {!!clubs.data?.weeks.length && (
          <div className="text-[11px] text-white/50 space-y-0.5">
            {clubs.data.weeks.filter((w) => w.winners.length).map((w) => <div key={w.week}>Week of {w.week}: {w.winners.map((x) => `#${x.rank} ${x.name} (${x.xp} XP, ${x.paid} paid)`).join(" · ")}</div>)}
          </div>
        )}
      </section>
    </>
  );
}
