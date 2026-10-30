import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, Flag, Shield, Trash2 } from "lucide-react";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STICKER_BY_ID } from "@shared/stickers";

interface ClubRow { id: number; name: string; tag: string; emblem: string; color: string; description: string | null; open: boolean; members: number; weeklyXp: number; rank: number; owner: string | null }
interface Week { week: string; winners: { clubId: number; name: string; rank: number; xp: number; paid: number }[] }
interface ClubMsg { id: number; clubId: number; club: string; emblem: string; userId: string; username: string; text: string | null; sticker: string | null; deleted: boolean; createdAt: string; reports: number; mutedUntil: string | null; banned: boolean }
interface Item { kind: "photo" | "thread" | "reply" | "club" | "match"; id: number; reports: number; reasons: string[]; lastAt: string; userId: string | null; username: string | null; mutedUntil: string | null; banned: boolean; title: string | null; text: string | null; photo: number | null; hidden: boolean; threadId: number | null; createdAt: string | null }

const CLUBS = ["/api/admin/clubs"];
const REPORTS = ["/api/admin/social3/reports"];
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Actions = (u: { id: string; username: string; mutedUntil: string | null; banned: boolean | null }) => ReactNode;

/** Clubs (rename, disband, weekly winners) and the reported Social 3 items (club chat, photos, Talk, clubs, match posts) */
export function Social3Admin({ actions }: { actions: Actions }) {
  const { toast } = useToast();
  const clubs = useQuery<{ clubs: ClubRow[]; weeks: Week[] }>({ queryKey: CLUBS, refetchInterval: 30_000 });
  const reports = useQuery<{ clubMessages: ClubMsg[]; items: Item[] }>({ queryKey: REPORTS, refetchInterval: 20_000 });
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

      <section className="space-y-2" data-testid="admin-reported-items">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Camera className="w-4 h-4" />Reported photos, Talk, clubs &amp; match posts ({reports.data?.items.length ?? 0})</h3>
        <p className="text-[11px] text-white/40">Only what players reported is shown here. Nothing is scanned or filtered automatically.</p>
        {reports.data?.items.length === 0 && <p className="text-sm text-white/40 py-2">Nothing reported.</p>}
        {reports.data?.items.map((m) => {
          const path = `/api/admin/ugc/${m.kind}/${m.id}`;
          const label = { photo: "Photo", thread: "Talk thread", reply: "Talk reply", club: "Club", match: "Match post" }[m.kind];
          return (
            <div key={`${m.kind}-${m.id}`} className={`rounded-xl px-3 py-2 border ${m.hidden ? "bg-red-950/30 border-red-500/20" : "bg-orange-950/30 border-orange-400/40"}`} data-testid={`admin-item-${m.kind}-${m.id}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-black text-yellow-200">{m.username ?? "?"} <span className="text-white/50 font-bold">· {label}{m.hidden ? " (hidden)" : ""}</span></span>
                <span className="text-white/40">{m.createdAt ? when(m.createdAt) : ""}</span>
              </div>
              {m.title && <div className="text-sm font-black text-white mt-1 break-words">{m.title}</div>}
              {m.text && m.kind !== "photo" && <div className="text-sm text-white/85 my-1 break-words whitespace-pre-wrap">{m.text}</div>}
              {m.photo && <img src={`/api/photos/${m.photo}`} alt="" className="max-h-48 rounded-lg my-1" />}
              {m.reasons.length > 0 && <div className="text-[11px] text-white/50">Reasons: {m.reasons.join(" · ")}</div>}
              <div className="flex items-center gap-2 flex-wrap text-xs mt-1">
                <span className="text-orange-300 flex items-center gap-1"><Flag className="w-3 h-3" />{m.reports}</span>
                {(m.kind === "thread" || m.kind === "reply") && (m.hidden
                  ? <button onClick={() => run.mutate({ path, body: { action: "restore" }, done: "Restored" })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 font-bold flex items-center gap-1"><Eye className="w-3 h-3" />Restore</button>
                  : <button onClick={() => run.mutate({ path, body: { action: "hide" }, done: "Hidden" })} className="px-2 py-1 rounded-lg bg-orange-600/30 text-orange-200 font-bold flex items-center gap-1"><EyeOff className="w-3 h-3" />Hide</button>)}
                <button onClick={() => { if (confirm(`Delete this ${label.toLowerCase()}?`)) run.mutate({ path, body: { action: "delete" }, done: "Deleted" }); }} className="px-2 py-1 rounded-lg bg-red-600/30 text-red-200 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" />{m.kind === "club" ? "Disband" : "Delete"}</button>
                <button onClick={() => run.mutate({ path, body: { action: "dismiss" }, done: "Dismissed" })} className="px-2 py-1 rounded-lg bg-white/10 text-white/70 font-bold">Dismiss</button>
                {m.userId && actions({ id: m.userId, username: m.username ?? "?", mutedUntil: m.mutedUntil, banned: m.banned })}
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
