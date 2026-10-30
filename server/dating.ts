/**
 * Meeting people (Làm quen / Meet / 交友), opt-in only. Players who switch it on show up on the
 * Meet page to others whose settings fit; 💛 is private, and only when both have tapped 💛 does
 * either hear about it ("It's a match") and a private chat opens, whatever their DM settings.
 * Guards against scammers: an account a few days old, some games played and a profile photo.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "./db";
import { datingProfiles, datingLikes, userSocial, users, type User } from "@shared/schema";
import {
  DATING_MIN_GAMES, DATING_MIN_ACCOUNT_DAYS, DATING_LIKES_PER_DAY, DATING_MIN_AGE, DATING_MAX_AGE,
  LOOKING_FOR, GENDERS, ageFrom, compatible, type DatingMe, type DatingPerson, type Gender, type LookingFor,
} from "@shared/dating";
import { vnDay } from "@shared/league";
import { notify, blockedEither, findPlayer, factsFor, visibleOnline } from "./friends";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof datingProfiles.$inferSelect;

const DAY_MS = 86_400_000;

/** What a player still needs before they can switch Meet on */
export function datingNeeds(u: User) {
  const days = u.createdAt ? Math.floor((Date.now() - new Date(u.createdAt).getTime()) / DAY_MS) : 0;
  return {
    games: Math.max(0, DATING_MIN_GAMES - u.gamesPlayed),
    days: Math.max(0, DATING_MIN_ACCOUNT_DAYS - days),
    photo: !u.profileImageUrl,
  };
}
const eligible = (u: User) => { if (u.isAdmin) return true; const n = datingNeeds(u); return !n.games && !n.days && !n.photo; };

async function profileOf(userId: string): Promise<Row | null> {
  const [r] = await db.select().from(datingProfiles).where(eq(datingProfiles.userId, userId));
  return r ?? null;
}

const view = (u: User, r: Row | null): DatingMe => ({
  open: !!r?.open,
  lookingFor: (r?.lookingFor as LookingFor) ?? "chat",
  birthYear: r?.birthYear ?? null,
  gender: (r?.gender as Gender) ?? null,
  seeking: (r?.seeking ?? []) as Gender[],
  ageMin: r?.ageMin ?? DATING_MIN_AGE,
  ageMax: r?.ageMax ?? DATING_MAX_AGE,
  eligible: eligible(u),
  needs: datingNeeds(u),
});

const fitOf = (r: Row) => ({ gender: r.gender, seeking: r.seeking ?? [], ageMin: r.ageMin, ageMax: r.ageMax, age: ageFrom(r.birthYear) });

/** Both have tapped 💛 on each other */
export async function datingMatched(a: string, b: string): Promise<boolean> {
  const rows = await db.select({ f: datingLikes.fromId }).from(datingLikes)
    .where(or(and(eq(datingLikes.fromId, a), eq(datingLikes.toId, b)), and(eq(datingLikes.fromId, b), eq(datingLikes.toId, a))));
  return rows.length === 2;
}

const thisYear = () => new Date().getUTCFullYear();
const settingsSchema = z.object({
  open: z.boolean(),
  lookingFor: z.enum(LOOKING_FOR),
  birthYear: z.number().int(),
  gender: z.enum(GENDERS),
  seeking: z.array(z.enum(GENDERS)).max(3),
  ageMin: z.number().int().min(DATING_MIN_AGE).max(DATING_MAX_AGE),
  ageMax: z.number().int().min(DATING_MIN_AGE).max(DATING_MAX_AGE),
});

const likesToday = new Map<string, { day: string; n: number }>();

export function registerDatingRoutes(app: Express, requireUser: Mw) {
  const me = (res: Response) => res.locals.user as User;

  app.get("/api/dating/me", requireUser, async (_req, res) => { const u = me(res); res.json(view(u, await profileOf(u.id))); });

  app.put("/api/dating/me", requireUser, async (req, res) => {
    const u = me(res);
    const p = settingsSchema.safeParse(req.body ?? {});
    if (!p.success) return res.status(400).json({ message: "Bad request" });
    const s = p.data;
    const age = thisYear() - s.birthYear;
    // Born this year minus 18 may not have had their birthday yet: ask for one more year to be sure
    if (age < DATING_MIN_AGE + 1 || age > DATING_MAX_AGE) return res.status(400).json({ message: "You must be 18 or over" });
    if (s.ageMin > s.ageMax) return res.status(400).json({ message: "Bad request" });
    if (s.open && !eligible(u)) return res.status(403).json({ message: "not_eligible", needs: datingNeeds(u) });
    const values = { open: s.open, lookingFor: s.lookingFor, birthYear: s.birthYear, gender: s.gender, seeking: [...new Set(s.seeking)], ageMin: s.ageMin, ageMax: s.ageMax, updatedAt: new Date() };
    await db.insert(datingProfiles).values({ userId: u.id, ...values }).onConflictDoUpdate({ target: datingProfiles.userId, set: values });
    res.json(view(u, await profileOf(u.id)));
  });

  // People who are open to meeting and fit your settings (and you theirs)
  app.get("/api/dating/people", requireUser, async (req, res) => {
    const u = me(res);
    const mine = await profileOf(u.id);
    if (!mine?.open) return res.json({ people: [] });
    const country = typeof req.query.country === "string" ? req.query.country : null;
    const rows = (await db.execute(sql`
      select d.*, u.username, u.profile_image_url as avatar, u.last_seen_at, s.bio,
        exists(select 1 from ${datingLikes} l where l.from_id = ${u.id} and l.to_id = d.user_id) as liked,
        exists(select 1 from ${datingLikes} l where l.from_id = d.user_id and l.to_id = ${u.id}) as likes_me
      from ${datingProfiles} d join ${users} u on u.id = d.user_id left join ${userSocial} s on s.user_id = d.user_id
      where d.open and d.user_id <> ${u.id} and not u.banned and u.profile_image_url is not null
        and d.user_id not in (select blocked_id from user_blocks where blocker_id = ${u.id} union select blocker_id from user_blocks where blocked_id = ${u.id})
      order by d.updated_at desc limit 200`)).rows as Record<string, any>[];
    const fit = rows.filter((r) => compatible(fitOf(mine), {
      gender: r.gender, seeking: r.seeking ?? [], ageMin: Number(r.age_min), ageMax: Number(r.age_max), age: ageFrom(r.birth_year),
    }));
    const facts = await factsFor(fit.map((r) => r.user_id));
    let people: DatingPerson[] = fit.map((r) => {
      const f = facts.get(r.user_id)!;
      return {
        username: r.username, avatarUrl: r.avatar ?? null, age: ageFrom(r.birth_year), gender: r.gender ?? null, lookingFor: r.looking_for,
        bio: r.bio ?? null, country: f.country, languages: f.languages, favGames: f.favGames,
        online: visibleOnline(r.user_id, r.last_seen_at), liked: !!r.liked, matched: !!r.liked && !!r.likes_me,
      };
    });
    if (country) people = people.filter((p) => p.country === country);
    // Online first, then the rest as they come (most recently active profiles)
    people.sort((a, b) => Number(b.online) - Number(a.online));
    res.json({ people: people.slice(0, 60) });
  });

  // 💛: private; only a match is announced, to both
  app.post("/api/dating/like/:username", requireUser, async (req, res) => {
    const u = me(res);
    const mine = await profileOf(u.id);
    if (!mine?.open) return res.status(403).json({ message: "Switch on Meet first" });
    if (!eligible(u)) return res.status(403).json({ message: "not_eligible", needs: datingNeeds(u) });
    const them = await findPlayer(req.params.username);
    if (!them || them.id === u.id) return res.status(404).json({ message: "Player not found" });
    const theirs = await profileOf(them.id);
    if (!theirs?.open || (await blockedEither(u.id, them.id))) return res.status(404).json({ message: "Player not found" });
    const day = vnDay(new Date());
    const c = likesToday.get(u.id);
    const n = c && c.day === day ? c.n : 0;
    if (n >= DATING_LIKES_PER_DAY) return res.status(429).json({ message: "That's enough 💛 for today" });
    const [added] = await db.insert(datingLikes).values({ fromId: u.id, toId: them.id }).onConflictDoNothing().returning();
    if (added) likesToday.set(u.id, { day, n: n + 1 });
    const matched = await datingMatched(u.id, them.id);
    if (added && matched) {
      await notify(them.id, "dating", u.id, { matched: true }, `dating:${u.id}`);
      await notify(u.id, "dating", them.id, { matched: true }, `dating:${them.id}`);
    }
    res.json({ liked: true, matched });
  });

  app.delete("/api/dating/like/:username", requireUser, async (req, res) => {
    const u = me(res);
    const them = await findPlayer(req.params.username);
    if (them) await db.delete(datingLikes).where(and(eq(datingLikes.fromId, u.id), eq(datingLikes.toId, them.id)));
    res.json({ liked: false, matched: false });
  });

  // Your matches (both tapped 💛), newest first
  app.get("/api/dating/matches", requireUser, async (_req, res) => {
    const u = me(res);
    const rows = (await db.execute(sql`
      select u.username, u.profile_image_url as avatar, u.last_seen_at, u.id, greatest(a.created_at, b.created_at) as at
      from ${datingLikes} a join ${datingLikes} b on b.from_id = a.to_id and b.to_id = a.from_id
      join ${users} u on u.id = a.to_id
      where a.from_id = ${u.id} and not u.banned
        and u.id not in (select blocked_id from user_blocks where blocker_id = ${u.id} union select blocker_id from user_blocks where blocked_id = ${u.id})
      order by at desc limit 100`)).rows as Record<string, any>[];
    res.json({ matches: rows.map((r) => ({ username: r.username, avatarUrl: r.avatar ?? null, online: visibleOnline(r.id, r.last_seen_at), at: new Date(r.at).toISOString() })) });
  });
}

export async function deleteDatingData(tx: Tx, userId: string) {
  await tx.delete(datingLikes).where(or(eq(datingLikes.fromId, userId), eq(datingLikes.toId, userId)));
  await tx.delete(datingProfiles).where(eq(datingProfiles.userId, userId));
}
