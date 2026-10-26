/**
 * The Social 3 part of the admin's reports queue. It only ever shows what someone reported:
 * a photo, a Talk thread or reply, a club, a find-a-match post, or a club chat message.
 * Nothing is scanned, and admins can't browse private messages or club chat (owner policy).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { ugcReports, talkThreads, talkReplies, matchPosts, messagePhotos, clubs, type User } from "@shared/schema";
import { reportedClubMessages, clubOf, disbandClub } from "./clubs";
import { deletePhoto } from "./photos";
import { removeThreads, removeReplies } from "./talk";
import { pushAll } from "./hub";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Kind = "photo" | "thread" | "reply" | "club" | "match";
const KINDS: Kind[] = ["photo", "thread", "reply", "club", "match"];

export interface ReportedItem {
  kind: Kind; id: number; reports: number; reasons: string[]; lastAt: string;
  userId: string | null; username: string | null; mutedUntil: string | null; banned: boolean;
  title: string | null; text: string | null; photo: number | null; hidden: boolean; threadId: number | null; createdAt: string | null;
}

async function reportedItems(): Promise<ReportedItem[]> {
  const groups = (await db.execute(sql`
    select kind, target_id, count(*)::int as n, max(created_at) as last_at,
      (array_agg(reason order by created_at desc) filter (where reason is not null and reason <> ''))[1:3] as reasons
    from ${ugcReports} group by kind, target_id order by max(created_at) desc limit 80`)).rows as Record<string, any>[];
  const out: ReportedItem[] = [];
  for (const g of groups) {
    const kind = g.kind as Kind;
    const id = Number(g.target_id);
    let row: { userId: string | null; title?: string | null; text?: string | null; photo?: number | null; hidden?: boolean; threadId?: number | null; createdAt?: Date | null } | null = null;
    if (kind === "photo") { const [p] = await db.select().from(messagePhotos).where(eq(messagePhotos.id, id)); if (p && !p.deleted) row = { userId: p.userId, photo: p.id, text: `${p.scope}`, createdAt: p.createdAt }; }
    else if (kind === "thread") { const [t] = await db.select().from(talkThreads).where(eq(talkThreads.id, id)); if (t) row = { userId: t.userId, title: t.title, text: t.body, photo: t.photoId, hidden: t.hidden, threadId: t.id, createdAt: t.createdAt }; }
    else if (kind === "reply") { const [r] = await db.select().from(talkReplies).where(eq(talkReplies.id, id)); if (r) row = { userId: r.userId, text: r.text, photo: r.photoId, hidden: r.hidden, threadId: r.threadId, createdAt: r.createdAt }; }
    else if (kind === "club") { const [c] = await db.select().from(clubs).where(eq(clubs.id, id)); if (c) row = { userId: c.ownerId, title: `${c.emblem} ${c.name} [${c.tag}]`, text: c.description, createdAt: c.createdAt }; }
    else if (kind === "match") { const [m] = await db.select().from(matchPosts).where(eq(matchPosts.id, id)); if (m) row = { userId: m.userId, title: `${m.game} · ${m.stake}`, text: m.note, hidden: !!m.closedAt, createdAt: m.createdAt }; }
    if (!row) continue;
    const [u] = row.userId ? (await db.execute(sql`select username, muted_until, banned from users where id = ${row.userId}`)).rows as Record<string, any>[] : [];
    out.push({
      kind, id, reports: g.n, reasons: g.reasons ?? [], lastAt: new Date(g.last_at).toISOString(),
      userId: row.userId, username: u?.username ?? null, mutedUntil: u?.muted_until ? new Date(u.muted_until).toISOString() : null, banned: !!u?.banned,
      title: row.title ?? null, text: row.text ?? null, photo: row.photo ?? null, hidden: !!row.hidden, threadId: row.threadId ?? null, createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    });
  }
  return out;
}

const dismiss = (kind: Kind, id: number) => db.delete(ugcReports).where(and(eq(ugcReports.kind, kind), eq(ugcReports.targetId, id)));

export function registerReportRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  // Anyone can report a club (its name, emblem or description)
  app.post("/api/clubs/:id/report", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const id = Number(req.params.id);
    const [c] = Number.isInteger(id) ? await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)) : [];
    if (!c) return res.status(404).json({ message: "Club not found" });
    if (clubOf(u.id)?.id === id && clubOf(u.id)?.role === "owner") return res.status(400).json({ message: "That's your own message" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) || null : null;
    await db.insert(ugcReports).values({ kind: "club", targetId: id, reporterId: u.id, reason }).onConflictDoNothing();
    res.json({ ok: true });
  });

  app.get("/api/admin/social3/reports", requireAdmin, async (_req, res) => {
    res.json({ clubMessages: await reportedClubMessages(), items: await reportedItems() });
  });

  /** hide / restore (threads, replies), delete (photos, threads, replies, match posts, clubs), dismiss (any) */
  app.post("/api/admin/ugc/:kind/:id", requireAdmin, async (req, res) => {
    const kind = req.params.kind as Kind;
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!KINDS.includes(kind) || !Number.isInteger(id) || !["hide", "restore", "delete", "dismiss"].includes(action)) return res.status(400).json({ message: "Bad request" });
    if (action === "dismiss") { await dismiss(kind, id); return res.json({ ok: true }); }
    if (kind === "photo" && action === "delete") { await deletePhoto(id); await dismiss(kind, id); pushAll({ t: "photo_removed", id }); }
    else if (kind === "thread" && action === "delete") { await db.transaction((tx) => removeThreads(tx, [id])); pushAll({ t: "talk_removed", threadId: id }); }
    else if (kind === "reply" && action === "delete") { await db.transaction((tx) => removeReplies(tx, [id])); }
    else if (kind === "thread" && (action === "hide" || action === "restore")) { await db.update(talkThreads).set({ hidden: action === "hide" }).where(eq(talkThreads.id, id)); await dismiss(kind, id); }
    else if (kind === "reply" && (action === "hide" || action === "restore")) { await db.update(talkReplies).set({ hidden: action === "hide" }).where(eq(talkReplies.id, id)); await dismiss(kind, id); }
    else if (kind === "match" && action === "delete") { await db.update(matchPosts).set({ closedAt: new Date() }).where(eq(matchPosts.id, id)); await dismiss(kind, id); pushAll({ t: "matches" }); }
    else if (kind === "club" && action === "delete") { await disbandClub(id, "admin"); await dismiss(kind, id); }
    else return res.status(400).json({ message: "Bad request" });
    res.json({ ok: true });
  });
}

/** Account deletion: the reports they sent (reports about their things go with those things) */
export async function deleteReportData(tx: Tx, userId: string) {
  await tx.delete(ugcReports).where(eq(ugcReports.reporterId, userId));
}
