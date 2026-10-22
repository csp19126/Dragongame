import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Check, Eye, EyeOff, Flag, Mail, Megaphone, MessageCircle, RefreshCw, Search, ShieldCheck, Trash2, UserX, VolumeX } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STICKER_BY_ID } from "@shared/stickers";

interface AdminMsg {
  id: number; userId: string; username: string; text: string | null; sticker: string | null; deleted: boolean;
  createdAt: string; reports: number; mutedUntil: string | null; banned: boolean | null;
}
interface Restricted { id: string; username: string; mutedUntil: string | null; banned: boolean }
interface View { messages: AdminMsg[]; restricted: Restricted[]; announcement: string | null }

interface ReportedProfile { userId: string; username: string; avatarUrl: string | null; bio: string | null; reporters: number; reasons: string[]; lastAt: string; mutedUntil: string | null; banned: boolean }
interface ContextMsg { id: number; from: string; text: string | null; sticker: string | null; createdAt: string; deleted: boolean }
interface ReportedDm {
  id: number; fromId: string; fromName: string; fromAvatar: string | null; toName: string; text: string | null; sticker: string | null;
  createdAt: string; deleted: boolean; reports: number; reasons: string[]; lastAt: string; mutedUntil: string | null; banned: boolean; context: ContextMsg[];
}
interface SocialReports { profiles: ReportedProfile[]; messages: ReportedDm[] }

const KEY = ["/api/admin/community/chat"];
const REPORTS_KEY = ["/api/admin/social/reports"];
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const muted = (u: { mutedUntil: string | null }) => !!u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now();

/** Chat moderation, mutes and bans, and the announcement banner */
export function CommunityTab() {
  const { toast } = useToast();
  const view = useQuery<View>({ queryKey: KEY, refetchInterval: 10_000 });
  const reports = useQuery<SocialReports>({ queryKey: REPORTS_KEY, refetchInterval: 20_000 });
  const users = useQuery<any[]>({ queryKey: ["/api/admin/dashboard/users"] });
  const [filter, setFilter] = useState<"all" | "reported" | "hidden">("all");
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [find, setFind] = useState("");

  const refresh = () => { queryClient.invalidateQueries({ queryKey: KEY }); queryClient.invalidateQueries({ queryKey: REPORTS_KEY }); queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/users"] }); };
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
  const social = useMutation({
    mutationFn: ({ path, body, done }: { path: string; body?: unknown; done: string }) => apiRequest("POST", path, body).then(() => done),
    onSuccess: (done) => { toast({ title: done }); refresh(); },
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

      {/* Reported profiles */}
      <section className="space-y-2" data-testid="admin-reported-profiles">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><UserX className="w-4 h-4" />Reported profiles ({reports.data?.profiles.length ?? 0})</h3>
        {reports.data?.profiles.length === 0 && <p className="text-sm text-white/40 py-2">No reported photos or profiles.</p>}
        {reports.data?.profiles.map((r) => (
          <div key={r.userId} className="rounded-xl px-3 py-2.5 border bg-orange-950/30 border-orange-400/40 flex gap-3" data-testid={`reported-profile-${r.username}`}>
            <Avatar user={r} size={64} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-black text-yellow-200 truncate">{r.username}{r.banned && <span className="ml-1.5 text-red-300">BANNED</span>}{muted(r) && <span className="ml-1.5 text-orange-300">MUTED</span>}</span>
                <span className="text-orange-300 flex items-center gap-1 shrink-0"><Flag className="w-3 h-3" />{r.reporters} player{r.reporters > 1 ? "s" : ""}</span>
              </div>
              {r.bio && <div className="text-xs text-sky-100/90 break-words bg-white/5 rounded-lg px-2 py-1" data-testid={`reported-bio-${r.username}`}>Bio: {r.bio}</div>}
              {r.reasons.length > 0 && <div className="text-xs text-white/70 break-words">“{r.reasons.join("” · “")}”</div>}
              <div className="text-[10px] text-white/40">last report {when(r.lastAt)}{r.avatarUrl ? "" : " · no photo now"}{r.bio ? "" : " · no bio"}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.avatarUrl && <button onClick={() => social.mutate({ path: `/api/admin/social/photo/${r.userId}/remove`, done: "Photo removed" })} className="px-2 py-1 rounded-lg bg-red-600/40 text-red-100 text-xs font-bold flex items-center gap-1" data-testid={`button-remove-photo-${r.username}`}><Trash2 className="w-3 h-3" />Remove photo</button>}
                {r.bio && <button onClick={() => social.mutate({ path: `/api/admin/social/bio/${r.userId}/clear`, done: "Bio cleared" })} className="px-2 py-1 rounded-lg bg-red-600/40 text-red-100 text-xs font-bold flex items-center gap-1" data-testid={`button-clear-bio-${r.username}`}><Trash2 className="w-3 h-3" />Clear bio</button>}
                <button onClick={() => social.mutate({ path: `/api/admin/social/profile/${r.userId}/dismiss`, done: "Dismissed" })} className="px-2 py-1 rounded-lg bg-white/10 text-white/80 text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" />Dismiss</button>
                {actions({ id: r.userId, username: r.username, mutedUntil: r.mutedUntil, banned: r.banned })}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Reported private messages */}
      <section className="space-y-2" data-testid="admin-reported-dms">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2"><Mail className="w-4 h-4" />Reported private messages ({reports.data?.messages.length ?? 0})</h3>
        <p className="text-[11px] text-white/45">Private messages are only shown here once the player who received one reports it, with the five messages before it for context.</p>
        {reports.data?.messages.length === 0 && <p className="text-sm text-white/40 py-2">No reported messages.</p>}
        {reports.data?.messages.map((m) => (
          <div key={m.id} className="rounded-xl px-3 py-2.5 border bg-orange-950/30 border-orange-400/40 space-y-2" data-testid={`reported-dm-${m.id}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 min-w-0"><Avatar user={{ username: m.fromName, avatarUrl: m.fromAvatar }} size={22} /><span className="font-black text-yellow-200 truncate">{m.fromName}</span><span className="text-white/40">→ {m.toName}</span></span>
              <span className="text-orange-300 flex items-center gap-1 shrink-0"><Flag className="w-3 h-3" />{m.reports}</span>
            </div>
            <div className="rounded-lg bg-black/30 p-2 space-y-1 text-xs">
              {m.context.map((c) => (
                <div key={c.id} className={`text-white/55 break-words ${c.deleted ? "line-through opacity-60" : ""}`}><b className="text-white/70">{c.from}:</b> {c.sticker ? STICKER_BY_ID.get(c.sticker)?.emoji ?? c.sticker : c.text} <span className="text-white/30">{when(c.createdAt)}</span></div>
              ))}
              <div className={`text-white break-words rounded-md bg-orange-500/15 px-1.5 py-1 ${m.deleted ? "line-through opacity-60" : ""}`}><b className="text-yellow-200">{m.fromName}:</b> {m.sticker ? <span className="text-2xl">{STICKER_BY_ID.get(m.sticker)?.emoji ?? m.sticker}</span> : m.text} <span className="text-white/40">{when(m.createdAt)}</span></div>
            </div>
            {m.reasons.length > 0 && <div className="text-xs text-white/70">Reason: “{m.reasons.join("” · “")}”</div>}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => social.mutate({ path: `/api/admin/social/dm/${m.id}`, body: { action: "delete" }, done: "Message deleted" })} className="px-2 py-1 rounded-lg bg-red-600/40 text-red-100 text-xs font-bold flex items-center gap-1" data-testid={`button-dm-delete-${m.id}`}><Trash2 className="w-3 h-3" />Delete message</button>
              <button onClick={() => social.mutate({ path: `/api/admin/social/dm/${m.id}`, body: { action: "dismiss" }, done: "Dismissed" })} className="px-2 py-1 rounded-lg bg-white/10 text-white/80 text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" />Dismiss</button>
              {actions({ id: m.fromId, username: m.fromName, mutedUntil: m.mutedUntil, banned: m.banned })}
            </div>
          </div>
        ))}
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
