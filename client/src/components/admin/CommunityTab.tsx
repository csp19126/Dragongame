import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Eye, EyeOff, Flag, Megaphone, MessageCircle, RefreshCw, Search, ShieldCheck, VolumeX } from "lucide-react";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STICKER_BY_ID } from "@shared/stickers";

interface AdminMsg {
  id: number; userId: string; username: string; text: string | null; sticker: string | null; deleted: boolean;
  createdAt: string; reports: number; mutedUntil: string | null; banned: boolean | null;
}
interface Restricted { id: string; username: string; mutedUntil: string | null; banned: boolean }
interface View { messages: AdminMsg[]; restricted: Restricted[]; announcement: string | null }

const KEY = ["/api/admin/community/chat"];
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const muted = (u: { mutedUntil: string | null }) => !!u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now();

/** Chat moderation, mutes and bans, and the announcement banner */
export function CommunityTab() {
  const { toast } = useToast();
  const view = useQuery<View>({ queryKey: KEY, refetchInterval: 10_000 });
  const users = useQuery<any[]>({ queryKey: ["/api/admin/dashboard/users"] });
  const [filter, setFilter] = useState<"all" | "reported" | "hidden">("all");
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [find, setFind] = useState("");

  const refresh = () => { queryClient.invalidateQueries({ queryKey: KEY }); queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/users"] }); };
  const fail = (e: unknown) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" });

  const hide = useMutation({
    mutationFn: ({ id, deleted }: { id: number; deleted: boolean }) => apiRequest("POST", `/api/admin/community/chat/${id}`, { deleted }),
    onSuccess: refresh, onError: fail,
  });
  const restrict = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { minutes?: number; banned?: boolean } }) => apiRequest("POST", `/api/admin/community/users/${id}`, body),
    onSuccess: (_r, v) => {
      toast({ title: v.body.banned ? "Banned" : v.body.banned === false ? "Unbanned" : v.body.minutes ? `Muted for ${v.body.minutes >= 1440 ? `${v.body.minutes / 1440} day(s)` : `${v.body.minutes / 60} hour(s)`}` : "Unmuted" });
      refresh();
    },
    onError: fail,
  });
  const announce = useMutation({
    mutationFn: (text: string) => apiRequest("PUT", "/api/admin/announcement", { text }),
    onSuccess: () => { toast({ title: "Announcement saved" }); setAnnouncement(null); refresh(); queryClient.invalidateQueries({ queryKey: ["/api/announcement"] }); },
    onError: fail,
  });

  if (!view.data) return <div className="text-center py-12 text-yellow-400/40">Loading…</div>;
  const v = view.data;
  const text = announcement ?? v.announcement ?? "";
  const shown = v.messages.filter((m) => filter === "all" || (filter === "reported" ? m.reports > 0 : m.deleted));
  const reportedCount = v.messages.filter((m) => m.reports > 0 && !m.deleted).length;
  const matches = find.trim().length >= 2 ? (users.data ?? []).filter((u) => u.username.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 8) : [];

  const actions = (u: { id: string; username: string; mutedUntil: string | null; banned: boolean | null }) => (
    <div className="flex flex-wrap gap-1.5">
      {muted(u) ? (
        <button onClick={() => restrict.mutate({ id: u.id, body: { minutes: 0 } })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 text-xs font-bold">Unmute</button>
      ) : (
        <>
          <button onClick={() => restrict.mutate({ id: u.id, body: { minutes: 60 } })} className="px-2 py-1 rounded-lg bg-orange-600/30 text-orange-200 text-xs font-bold flex items-center gap-1"><VolumeX className="w-3 h-3" />1h</button>
          <button onClick={() => restrict.mutate({ id: u.id, body: { minutes: 1440 } })} className="px-2 py-1 rounded-lg bg-orange-600/30 text-orange-200 text-xs font-bold">24h</button>
          <button onClick={() => restrict.mutate({ id: u.id, body: { minutes: 10080 } })} className="px-2 py-1 rounded-lg bg-orange-600/30 text-orange-200 text-xs font-bold">7d</button>
        </>
      )}
      {u.banned ? (
        <button onClick={() => restrict.mutate({ id: u.id, body: { banned: false } })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 text-xs font-bold">Unban</button>
      ) : (
        <button onClick={() => { if (confirm(`Ban ${u.username}? They are logged out, can't log in, and today's messages are hidden.`)) restrict.mutate({ id: u.id, body: { banned: true } }); }} className="px-2 py-1 rounded-lg bg-red-600/40 text-red-200 text-xs font-bold flex items-center gap-1"><Ban className="w-3 h-3" />Ban</button>
      )}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="admin-community">
      {/* Announcement */}
      <section className="space-y-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Megaphone className="w-4 h-4" />Announcement</h3>
        <p className="text-xs text-white/50">Shown at the top of the home page and the chat for every player. Leave empty to remove it.</p>
        <textarea value={text} onChange={(e) => setAnnouncement(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Giải bi-a tối thứ Bảy 20:00, thưởng 5 triệu xu! 🎱"
          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white text-sm" data-testid="input-announcement" />
        <div className="flex gap-2">
          <button onClick={() => announce.mutate(text)} disabled={announce.isPending} className="px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 font-black text-sm" data-testid="button-save-announcement">Save</button>
          {v.announcement && <button onClick={() => announce.mutate("")} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 font-bold text-sm">Remove</button>}
        </div>
      </section>

      {/* Find a player */}
      <section className="space-y-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Search className="w-4 h-4" />Mute or ban a player</h3>
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Type a username…" className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white text-sm" data-testid="input-find-player" />
        {matches.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
            <div className="text-sm text-white font-bold truncate">{u.username}{u.banned && <span className="ml-2 text-red-300 text-xs">BANNED</span>}{muted(u) && <span className="ml-2 text-orange-300 text-xs">MUTED</span>}</div>
            {actions(u)}
          </div>
        ))}
        {v.restricted.length > 0 && (
          <div className="rounded-xl border border-white/10 p-3 space-y-2">
            <div className="text-xs font-black text-white/60 uppercase">Muted & banned now</div>
            {v.restricted.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2">
                <div className="text-sm text-white truncate">{u.username} <span className="text-xs text-white/50">{u.banned ? "banned" : `muted until ${when(u.mutedUntil!)}`}</span></div>
                {actions(u)}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Messages */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><MessageCircle className="w-4 h-4" />Chat (last 200)</h3>
          <div className="flex gap-1.5">
            {(["all", "reported", "hidden"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-bold ${filter === f ? "bg-yellow-500 text-purple-950" : "bg-white/5 text-white/60"}`}>
                {f === "reported" ? `Reported (${reportedCount})` : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={refresh} className="p-1.5 rounded-lg bg-white/5 text-white/60" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        {shown.length === 0 && <p className="text-sm text-white/40 py-6 text-center">Nothing here.</p>}
        <div className="space-y-2">
          {shown.map((m) => (
            <div key={m.id} className={`rounded-xl px-3 py-2 border ${m.deleted ? "bg-red-950/30 border-red-500/20 opacity-70" : m.reports ? "bg-orange-950/30 border-orange-400/40" : "bg-white/5 border-white/5"}`} data-testid={`admin-msg-${m.id}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-black text-yellow-200">{m.username}{m.banned && <span className="ml-1.5 text-red-300">BANNED</span>}{muted(m) && <span className="ml-1.5 text-orange-300">MUTED</span>}</span>
                <span className="text-white/40">{when(m.createdAt)}</span>
              </div>
              <div className="text-sm text-white my-1 break-words">{m.sticker ? <span className="text-3xl">{STICKER_BY_ID.get(m.sticker)?.emoji ?? m.sticker}</span> : m.text}</div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  {m.reports > 0 && <span className="text-orange-300 flex items-center gap-1"><Flag className="w-3 h-3" />{m.reports} report{m.reports > 1 ? "s" : ""}</span>}
                  {m.deleted
                    ? <button onClick={() => hide.mutate({ id: m.id, deleted: false })} className="px-2 py-1 rounded-lg bg-emerald-600/30 text-emerald-200 font-bold flex items-center gap-1"><Eye className="w-3 h-3" />Restore</button>
                    : <button onClick={() => hide.mutate({ id: m.id, deleted: true })} className="px-2 py-1 rounded-lg bg-red-600/30 text-red-200 font-bold flex items-center gap-1" data-testid={`button-hide-${m.id}`}><EyeOff className="w-3 h-3" />Hide</button>}
                </div>
                {actions({ id: m.userId, username: m.username, mutedUntil: m.mutedUntil, banned: m.banned })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/40 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Links, phone numbers and coin trading are blocked automatically; swearing is starred out; 3 reports hide a message until you look.</p>
      </section>
    </div>
  );
}
