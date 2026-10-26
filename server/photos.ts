/**
 * Photos in messages: DMs, club chat, lounge rooms and Talk. The phone shrinks and re-encodes a
 * photo through a canvas before upload; the server checks the real bytes, strips every metadata
 * block (EXIF/GPS, XMP, comments) and enforces a size cap, an hourly rate and a per-player store.
 * A photo can only be fetched by people who can see the message it belongs to; an admin can
 * see one only after someone reported it. Nothing is scanned automatically (owner policy).
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { messagePhotos, ugcReports, type User } from "@shared/schema";
import { sniffImage } from "@shared/social";
import { stripImageMetadata } from "@shared/imagemeta";
import { PHOTO_MAX_BYTES, PHOTOS_PER_HOUR, PHOTOS_KEPT, type PhotoScope } from "@shared/social3";
import { speakerRefusal } from "./speech";
import { findPlayer, blockedEither } from "./friends";
import { clubOf } from "./clubs";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Fail = { status: number; message: string };
export const PHOTO_UPLOAD_ROUTE = "/api/photos";

/** Checks base64 bytes, then strips metadata. */
export function decodeMessagePhoto(raw: unknown): { data: Buffer; mime: string } | Fail {
  const bad: Fail = { status: 400, message: "Photo must be a JPEG, PNG or WebP image" };
  if (typeof raw !== "string" || !raw) return bad;
  const b64 = raw.replace(/^data:[\w/+.-]+;base64,/, "");
  if (b64.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8) return { status: 413, message: "Photo is too big" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return bad;
  const data = Buffer.from(b64, "base64");
  if (data.length > PHOTO_MAX_BYTES) return { status: 413, message: "Photo is too big" };
  const mime = sniffImage(data);
  if (!mime) return bad;
  const clean = stripImageMetadata(data, mime);
  if (!clean) return bad;
  return { data: Buffer.from(clean), mime };
}

/** A photo the sender may attach to a message in this place */
export async function ownPhoto(userId: string, photoId: unknown, scope: PhotoScope, ref?: string | null): Promise<number | null | Fail> {
  if (photoId === undefined || photoId === null) return null;
  const id = Number(photoId);
  if (!Number.isInteger(id) || id <= 0) return { status: 400, message: "Bad photo" };
  const [p] = await db.select({ userId: messagePhotos.userId, scope: messagePhotos.scope, ref: messagePhotos.ref, deleted: messagePhotos.deleted })
    .from(messagePhotos).where(eq(messagePhotos.id, id));
  if (!p || p.deleted || p.userId !== userId || p.scope !== scope || (ref !== undefined && (p.ref ?? null) !== (ref ?? null))) return { status: 400, message: "Bad photo" };
  return id;
}

/** Who may see a photo: its sender, the people in the place it was sent, an admin once reported */
async function canSee(u: User, p: typeof messagePhotos.$inferSelect): Promise<boolean> {
  if (p.userId === u.id) return true;
  if (u.isAdmin) {
    const [r] = await db.select({ id: ugcReports.id }).from(ugcReports).where(and(eq(ugcReports.kind, "photo"), eq(ugcReports.targetId, p.id))).limit(1);
    if (r) return true;
  }
  if (await blockedEither(u.id, p.userId)) return false;
  if (p.scope === "dm") return p.ref === u.id;
  if (p.scope === "club") return clubOf(u.id)?.id === Number(p.ref);
  return p.scope === "lounge" || p.scope === "talk";
}

async function uploadPhoto(u: User, body: any): Promise<{ id: number } | Fail> {
  const no = speakerRefusal(u);
  if (no) return { status: no.status, message: no.message };
  const scope = body?.scope as PhotoScope;
  if (!["dm", "club", "lounge", "talk"].includes(scope)) return { status: 400, message: "Bad request" };
  let ref: string | null = null;
  if (scope === "dm") {
    const to = await findPlayer(body?.to);
    if (!to || to.id === u.id) return { status: 404, message: "Player not found" };
    ref = to.id;
  } else if (scope === "club") {
    const c = clubOf(u.id);
    if (!c) return { status: 403, message: "Only members can write in the club chat" };
    ref = String(c.id);
  }
  const photo = decodeMessagePhoto(body?.photo);
  if ("status" in photo) return photo;
  if (!u.isAdmin) {
    const [{ n }] = await db.select({ n: count() }).from(messagePhotos).where(and(eq(messagePhotos.userId, u.id), gt(messagePhotos.createdAt, new Date(Date.now() - 3600_000))));
    if (n >= PHOTOS_PER_HOUR) return { status: 429, message: "Too many photos, try again later" };
  }
  const [row] = await db.insert(messagePhotos).values({ userId: u.id, scope, ref, mime: photo.mime, data: photo.data, bytes: photo.data.length }).returning({ id: messagePhotos.id });
  // Storage: a player keeps their newest PHOTOS_KEPT photos; older ones are emptied
  const old = await db.select({ id: messagePhotos.id }).from(messagePhotos)
    .where(and(eq(messagePhotos.userId, u.id), eq(messagePhotos.deleted, false))).orderBy(sql`${messagePhotos.id} desc`).offset(PHOTOS_KEPT);
  for (const o of old) await deletePhoto(o.id);
  return { id: row.id };
}

/** Empties a photo (admin, the sender deleting, storage limit, account deletion) */
export async function deletePhoto(id: number) {
  await db.update(messagePhotos).set({ deleted: true, data: Buffer.alloc(0), bytes: 0 }).where(eq(messagePhotos.id, id));
}

export function registerPhotoRoutes(app: Express, requireUser: Mw) {
  app.post(PHOTO_UPLOAD_ROUTE, express.json({ limit: "1mb" }), requireUser, async (req, res) => {
    const r = await uploadPhoto(res.locals.user, req.body);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json(r);
  });

  app.get("/api/photos/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.select().from(messagePhotos).where(eq(messagePhotos.id, id)) : [];
    if (!p || p.deleted || !(await canSee(res.locals.user, p))) return res.status(404).json({ message: "Not found" });
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(p.mime).send(p.data);
  });

  app.post("/api/photos/:id/report", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.select().from(messagePhotos).where(eq(messagePhotos.id, id)) : [];
    if (!p || p.deleted || !(await canSee(u, p))) return res.status(404).json({ message: "Not found" });
    if (p.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) || null : null;
    await db.insert(ugcReports).values({ kind: "photo", targetId: id, reporterId: u.id, reason }).onConflictDoNothing();
    res.json({ ok: true });
  });
}

/** Account deletion (inside its transaction) */
export async function deletePhotoData(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
  const ids = (await tx.select({ id: messagePhotos.id }).from(messagePhotos).where(eq(messagePhotos.userId, userId))).map((r) => r.id);
  if (ids.length) await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "photo"), sql`${ugcReports.targetId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  await tx.delete(messagePhotos).where(eq(messagePhotos.userId, userId));
}

