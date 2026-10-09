import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, X, Gift, VolumeX, Ban } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BONUS_NAMES, type AdminPlayer } from "@shared/analytics";
import { ago, gameName } from "./OverviewTab";

const fmt = (n: number) => n.toLocaleString("en-GB");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Everything about one player: what they play, how they're doing, and actions */
export function PlayerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const key = [`/api/admin/players/${id}`];
  const q = useQuery<AdminPlayer>({ queryKey: key });
  const [gift, setGift] = useState("100000");
  const refresh = () => { queryClient.invalidateQueries({ queryKey: key }); queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/admin/") }); };

  const give = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/players/${id}/gift`, { amount: Number(gift) })).json(),
    onSuccess: (r) => { toast({ title: `🎁 Sent. Their balance is now ${fmt(r.balance)}` }); refresh(); },
    onError: (e: any) => toast({ title: e.message || "Couldn't send", variant: "destructive" }),
  });
  const restrict = useMutation({
    mutationFn: (body: { minutes?: number; banned?: boolean }) => apiRequest("POST", `/api/admin/community/users/${id}`, body),
    onSuccess: () => { toast({ title: "✅ Done" }); refresh(); },
    onError: (e: any) => toast({ title: e.message || "Failed", variant: "destructive" }),
  });

  const p = q.data;
  const muted = p?.mutedUntil && new Date(p.mutedUntil) > new Date();
  const staked = p ? p.games.reduce((a, g) => a + g.wagered, 0) : 0;
  const paid = p ? p.games.reduce((a, g) => a + g.paid, 0) : 0;
  // The last 30 days as squares: played or not
  const last30 = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + 7 * 3600_000 - (29 - i) * 86_400_000).toISOString().slice(0, 10));

  // Portalled to <body>: the admin tabs animate with a transform, which would trap a fixed panel inside them
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full overflow-y-auto bg-[#120926] border-l border-yellow-400/20 p-4 space-y-4" data-testid="player-drawer">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-white truncate">{p?.username ?? "…"}</h2>
            {p && <p className="text-xs text-white/50">Joined {when(p.createdAt)} · seen {ago(p.lastSeenAt)}{p.invitedBy ? ` · invited by ${p.invitedBy}` : ""}</p>}
            {p && (p.isAdmin || p.banned || muted) && (
              <div className="flex gap-1 mt-1">
                {p.isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 font-black">ADMIN</span>}
                {p.banned && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-black">BANNED</span>}
                {muted && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-black">MUTED until {when(p.mutedUntil)}</span>}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 text-white/50" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {!p ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-10" /> : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Balance", fmt(p.balance)],
                ["Games played", fmt(p.gamesPlayed)],
                ["Biggest win", fmt(p.maxWin)],
                ["Days active", fmt(p.daysActive)],
                ["Pool W–L", `${p.pool.won}–${p.pool.lost}`],
                ["Friends invited", fmt(p.invited)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-black/30 p-2">
                  <div className="text-[9px] uppercase font-black text-white/45">{l}</div>
                  <div className="font-black text-white text-sm [overflow-wrap:anywhere]">{v}</div>
                </div>
              ))}
            </div>

            <section>
              <h3 className="text-xs font-black uppercase text-white/50 mb-1">Last 30 days</h3>
              <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[2px]" aria-label={`Played on ${p.activeDays.length} of the last 30 days`}>
                {last30.map((d) => <div key={d} title={d} className={`aspect-square rounded-[3px] ${p.activeDays.includes(d) ? "bg-[#3987e5]" : "bg-white/10"}`} />)}
              </div>
              <p className="text-[11px] text-white/45 mt-1">Played on {p.activeDays.length} of the last 30 days</p>
            </section>

            <section>
              <h3 className="text-xs font-black uppercase text-white/50 mb-1">Games</h3>
              {p.games.length === 0 ? <p className="text-sm text-white/50">No games recorded yet.</p> : (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-white/40"><tr><th className="text-left p-1">Game</th><th className="text-right p-1">Plays</th><th className="text-right p-1">Staked</th><th className="text-right p-1">Won back</th><th className="text-right p-1">Last</th></tr></thead>
                  <tbody>
                    {p.games.map((g) => (
                      <tr key={g.game} className="border-t border-white/5 text-white/80">
                        <td className="p-1 font-bold text-white">{gameName(g.game).icon} {gameName(g.game).label}</td>
                        <td className="p-1 text-right">{fmt(g.plays)}</td>
                        <td className="p-1 text-right">{fmt(g.wagered)}</td>
                        <td className="p-1 text-right">{fmt(g.paid)}</td>
                        <td className="p-1 text-right">{ago(g.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {staked > 0 && <p className={`text-xs font-bold mt-1 ${paid >= staked ? "text-emerald-300" : "text-rose-300"}`}>Overall: {paid >= staked ? "up" : "down"} {fmt(Math.abs(paid - staked))} coins on {fmt(staked)} staked</p>}
            </section>

            <section className="rounded-2xl bg-black/30 p-3 space-y-2">
              <h3 className="text-xs font-black uppercase text-white/50">Actions</h3>
              <div className="flex gap-2">
                <input type="number" min={1000} step={1000} value={gift} onChange={(e) => setGift(e.target.value)} className="flex-1 min-w-0 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white text-sm" aria-label="Coins to give" />
                <button type="button" disabled={give.isPending} onClick={() => give.mutate()} className="px-3 py-2 rounded-xl bg-yellow-400 text-black font-black text-sm flex items-center gap-1.5 disabled:opacity-50"><Gift className="w-4 h-4" />Give coins</button>
              </div>
              {!p.isAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => restrict.mutate({ minutes: muted ? 0 : 24 * 60 })} className="flex-1 py-2 rounded-xl bg-orange-500/15 border border-orange-400/30 text-orange-200 font-bold text-xs flex items-center justify-center gap-1.5"><VolumeX className="w-4 h-4" />{muted ? "Unmute" : "Mute chat 24 h"}</button>
                  <button type="button" onClick={() => { if (p.banned || confirm(`Ban ${p.username}? They won't be able to play or chat.`)) restrict.mutate({ banned: !p.banned }); }} className="flex-1 py-2 rounded-xl bg-red-500/15 border border-red-400/30 text-red-200 font-bold text-xs flex items-center justify-center gap-1.5"><Ban className="w-4 h-4" />{p.banned ? "Unban" : "Ban"}</button>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black uppercase text-white/50 mb-1">Recent plays</h3>
              {p.plays.length === 0 ? <p className="text-sm text-white/50">None yet.</p> : (
                <div className="divide-y divide-white/5 text-xs max-h-72 overflow-y-auto">
                  {p.plays.map((x, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span>{gameName(x.game).icon}</span>
                      <span className="flex-1 text-white/60">{when(x.at)}</span>
                      <span className="text-white/70">{x.bet ? fmt(x.bet) : "free"}</span>
                      <span className="text-white/40">→</span>
                      <span className={`w-20 text-right font-bold ${x.payout > x.bet ? "text-emerald-300" : x.payout === x.bet ? "text-white/70" : "text-rose-300"}`}>{fmt(x.payout)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black uppercase text-white/50 mb-1">Free coins received</h3>
              {p.bonuses.length === 0 ? <p className="text-sm text-white/50">None yet.</p> : (
                <div className="divide-y divide-white/5 text-xs">
                  {p.bonuses.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 text-white">{BONUS_NAMES[b.method] ?? b.method}</span>
                      <span className="text-white/50">{when(b.at)}</span>
                      <span className="w-20 text-right font-bold text-white">+{fmt(b.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black uppercase text-white/50 mb-1">Chat ({fmt(p.chatMessages)} messages)</h3>
              {p.chat.length === 0 ? <p className="text-sm text-white/50">Hasn't chatted yet.</p> : (
                <div className="space-y-1 text-xs">
                  {p.chat.map((c, i) => (
                    <div key={i} className={`rounded-lg bg-white/5 px-2 py-1 ${c.deleted ? "opacity-50 line-through" : ""}`}>
                      <span className="text-white/40 mr-2">{when(c.at)}</span><span className="text-white">{c.text ?? `[sticker ${c.sticker}]`}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </motion.aside>
    </div>,
    document.body,
  );
}
