/**
 * Pool league: standings worked out from counted games, and the month-end payout.
 * The payout runs on a timer and inserts the season's row first, so it can only pay once.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, deposits, chatMessages, leagueSeasons, type User } from "@shared/schema";
import {
  LEAGUE_WIN, LEAGUE_LOSS, LEAGUE_PRIZES, PARTICIPATION_GAMES, PARTICIPATION_PRIZE,
  seasonOf, seasonEnd, previousSeason, vnDay, type LeagueRow, type LeagueView,
} from "@shared/league";
import { desc, eq, sql } from "drizzle-orm";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Standing extends LeagueRow { userId: string }

/** Every player's record in a season, best first */
export async function standings(season: string, q: Pick<typeof db, "execute"> | Tx = db): Promise<Standing[]> {
  const rows = (await q.execute(sql`
    with games as (
      select player1 as user_id, (winner = player1) as won, finished_at from pool_matches where season = ${season} and counted
      union all
      select player2 as user_id, (winner = player2) as won, finished_at from pool_matches where season = ${season} and counted and player2 is not null
    )
    select g.user_id, u.username,
      count(*)::int as played,
      count(*) filter (where g.won)::int as won,
      count(*) filter (where not g.won)::int as lost,
      (array_agg(case when g.won then 'W' else 'L' end order by g.finished_at desc))[1:5] as form
    from games g join users u on u.id = g.user_id
    group by g.user_id, u.username
  `)).rows as { user_id: string; username: string; played: number; won: number; lost: number; form: string[] }[];
  return rows
    .map((r) => ({ userId: r.user_id, username: r.username, played: r.played, won: r.won, lost: r.lost, points: r.won * LEAGUE_WIN + r.lost * LEAGUE_LOSS, form: r.form ?? [], rank: 0 }))
    .sort((a, b) => b.points - a.points || b.won - a.won || a.played - b.played || a.username.localeCompare(b.username))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Pays out a finished season once: prizes for the top, a thank-you for everyone who played enough */
export async function settleSeason(season: string) {
  const paid = await db.transaction(async (tx) => {
    const table = await standings(season, tx);
    const summary: { username: string; points: number; prize: number }[] = [];
    const awards = table.map((r, i) => ({ r, prize: LEAGUE_PRIZES[i] ?? (r.played >= PARTICIPATION_GAMES ? PARTICIPATION_PRIZE : 0) })).filter((a) => a.prize > 0);
    for (const a of awards) summary.push({ username: a.r.username, points: a.r.points, prize: a.prize });
    const [row] = await tx.insert(leagueSeasons).values({ season, summary }).onConflictDoNothing().returning();
    if (!row) return null; // already paid
    for (const a of awards) {
      await tx.update(users).set({ balance: sql`${users.balance} + ${a.prize}` }).where(eq(users.id, a.r.userId));
      await tx.insert(deposits).values({ userId: a.r.userId, amount: a.prize, method: "league_prize" });
    }
    return { champion: table[0] ?? null, players: table.length, paid: awards.length };
  });
  if (paid?.champion) {
    await db.insert(chatMessages).values({
      userId: "system", username: "🏆 VnSlot 888",
      text: `🎱 Mùa giải bi-a ${season} kết thúc! Vô địch: ${paid.champion.username} (${paid.champion.points} điểm, +${fmt(LEAGUE_PRIZES[0])} xu). ${paid.paid} cơ thủ nhận thưởng. Mùa mới bắt đầu!`,
    });
  }
  return paid;
}

/** Settles last month's season if it hasn't been yet */
export async function leagueTick(now = new Date()) {
  const last = previousSeason(seasonOf(now));
  const [done] = await db.select({ s: leagueSeasons.season }).from(leagueSeasons).where(eq(leagueSeasons.season, last));
  if (!done) await settleSeason(last);
}

export function startLeagueScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await leagueTick(); } catch (e) { console.error("[league]", e); } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 10 * 60_000);
  timer.unref?.();
  httpServer?.on("close", () => clearInterval(timer));
}

export function registerLeagueRoutes(app: Express, requireUser: Mw) {
  app.get("/api/pool/league", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const current = seasonOf(new Date());
    const season = typeof req.query.season === "string" && /^\d{4}-\d{2}$/.test(req.query.season) ? req.query.season : current;
    const table = await standings(season);
    const mine = table.find((r) => r.userId === u.id) ?? null;
    const past = await db.select().from(leagueSeasons).orderBy(desc(leagueSeasons.season)).limit(6);
    const strip = ({ userId: _u, ...r }: Standing): LeagueRow => r;
    const view: LeagueView = {
      season,
      endsAt: seasonEnd(season).toISOString(),
      prizes: LEAGUE_PRIZES,
      participation: { games: PARTICIPATION_GAMES, prize: PARTICIPATION_PRIZE },
      table: table.slice(0, 50).map(strip),
      me: mine ? strip(mine) : null,
      todayBonusTaken: !!u.lastPoolBonusAt && vnDay(u.lastPoolBonusAt) === vnDay(new Date()),
      past: past.filter((p) => p.summary.length).map((p) => ({ season: p.season, champion: p.summary[0].username, points: p.summary[0].points })),
      serverNow: new Date().toISOString(),
    };
    res.json(view);
  });
}
