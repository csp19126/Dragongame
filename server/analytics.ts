/**
 * The admin's numbers: who is playing, what they play, where the coins go, and who comes back.
 * Days are Vietnam days (UTC+7). Timestamps in the database are UTC.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { users, deposits } from "@shared/schema";
import { vnDay } from "@shared/league";
import type { AdminAnalytics, AdminPlayer } from "@shared/analytics";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

const VN = sql`interval '7 hours'`;
/** A timestamp column as its Vietnam day, YYYY-MM-DD */
const dayOf = (col: SQL) => sql`to_char(${col} + ${VN}, 'YYYY-MM-DD')`;

async function rows<T>(q: SQL): Promise<T[]> {
  return (await db.execute(q)).rows as T[];
}
const num = (v: unknown) => Number(v ?? 0);

/** Start of the Vietnam day `back` days ago, as a UTC Date */
function vnDayStart(back = 0): Date {
  const today = vnDay(new Date());
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 3600_000 - back * 86_400_000);
}

export async function analytics(days: number, hideAdmins: boolean): Promise<AdminAnalytics> {
  const today = vnDay(new Date());
  const since = vnDayStart(days - 1);
  const sinceDay = vnDay(new Date(since.getTime() + 7 * 3600_000));
  const todayStart = vnDayStart(0);
  // Which players count: everyone, or everyone but the admins
  const who = (col: SQL) => (hideAdmins ? sql`${col} not in (select id from users where is_admin)` : sql`true`);
  const userWho = hideAdmins ? sql`not u.is_admin` : sql`true`;

  const [k] = await rows<Record<string, unknown>>(sql`
    select
      (select count(*) from users u where ${userWho}) as total_users,
      (select count(*) from users u where ${userWho} and u.created_at >= ${todayStart}) as new_today,
      (select count(*) from users u where ${userWho} and u.created_at >= ${vnDayStart(6)}) as new_7,
      (select count(*) from users u where ${userWho} and u.created_at >= ${vnDayStart(29)}) as new_30,
      (select count(*) from user_days d where ${who(sql`d.user_id`)} and d.day = ${today}) as dau,
      (select count(distinct d.user_id) from user_days d where ${who(sql`d.user_id`)} and d.day >= ${vnDay(vnDayStart(6))}) as wau,
      (select count(distinct d.user_id) from user_days d where ${who(sql`d.user_id`)} and d.day >= ${vnDay(vnDayStart(29))}) as mau,
      (select count(*) from users u where ${userWho} and u.last_seen_at >= now() at time zone 'utc' - interval '10 minutes') as online_now,
      (select count(*) from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${todayStart}) as plays_today,
      (select coalesce(sum(p.bet), 0) from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${todayStart}) as wagered_today,
      (select coalesce(sum(p.payout), 0) from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${todayStart}) as paid_today,
      (select coalesce(sum(u.balance), 0) from users u where ${userWho}) as coins_held,
      (select coalesce(sum(x.amount), 0) from deposits x where ${who(sql`x.user_id`)} and x.created_at >= ${since}) as given_away,
      (select count(*) from chat_messages c where ${who(sql`c.user_id`)} and c.created_at >= ${todayStart} and not c.deleted) as chat_today,
      (select min(created_at) from game_plays) as tracking_since
  `);

  const daily = await rows<Record<string, unknown>>(sql`
    with days as (
      select to_char(d, 'YYYY-MM-DD') as day from generate_series(${sinceDay}::date, ${today}::date, interval '1 day') d
    ),
    signups as (select ${dayOf(sql`u.created_at`)} as day, count(*) as n from users u where ${userWho} and u.created_at >= ${since} group by 1),
    actives as (select d.day, count(*) as n from user_days d where ${who(sql`d.user_id`)} and d.day >= ${sinceDay} group by 1),
    plays as (
      select ${dayOf(sql`p.created_at`)} as day, count(*) as n, count(distinct p.user_id) as players, sum(p.bet) as wagered, sum(p.payout) as paid
      from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${since} group by 1
    )
    select days.day, coalesce(s.n, 0) as signups, coalesce(a.n, 0) as active, coalesce(p.n, 0) as plays,
      coalesce(p.players, 0) as players, coalesce(p.wagered, 0) as wagered, coalesce(p.paid, 0) as paid
    from days left join signups s using (day) left join actives a using (day) left join plays p using (day)
    order by days.day
  `);

  const games = await rows<Record<string, unknown>>(sql`
    select p.game, count(*) as plays, count(distinct p.user_id) as players, sum(p.bet) as wagered, sum(p.payout) as paid,
      max(p.payout) as biggest
    from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${since}
    group by p.game order by count(*) desc
  `);

  const top = await rows<Record<string, unknown>>(sql`
    select u.id, u.username, u.balance, u.last_seen_at, count(*) as plays, sum(p.bet) as wagered, sum(p.payout) as paid,
      count(distinct ${dayOf(sql`p.created_at`)}) as days_played
    from game_plays p join users u on u.id = p.user_id
    where ${userWho} and p.created_at >= ${since}
    group by u.id order by count(*) desc limit 15
  `);

  const wins = await rows<Record<string, unknown>>(sql`
    select u.username, p.game, p.bet, p.payout, p.created_at
    from game_plays p join users u on u.id = p.user_id
    where ${userWho} and p.created_at >= ${since} and p.payout > p.bet
    order by p.payout - p.bet desc limit 10
  `);

  const hours = await rows<Record<string, unknown>>(sql`
    select extract(hour from p.created_at + ${VN})::int as hour, count(*) as plays
    from game_plays p where ${who(sql`p.user_id`)} and p.created_at >= ${since} group by 1
  `);

  const bonuses = await rows<Record<string, unknown>>(sql`
    select x.method, count(*) as times, sum(x.amount) as amount
    from deposits x where ${who(sql`x.user_id`)} and x.created_at >= ${since}
    group by x.method order by sum(x.amount) desc
  `);

  // Retention: of the players who joined on a day, how many came back the next day, and a week later.
  // Only cohorts old enough to be measured count towards each figure.
  const cohorts = await rows<Record<string, unknown>>(sql`
    with c as (
      select u.id, ${dayOf(sql`u.created_at`)}::date as joined from users u
      where ${userWho} and u.created_at >= ${vnDayStart(29)}
    )
    select to_char(c.joined, 'YYYY-MM-DD') as day, count(*) as joined,
      count(*) filter (where exists (select 1 from user_days d where d.user_id = c.id and d.day = to_char(c.joined + 1, 'YYYY-MM-DD'))) as d1,
      count(*) filter (where exists (select 1 from user_days d where d.user_id = c.id and d.day = to_char(c.joined + 7, 'YYYY-MM-DD'))) as d7
    from c group by c.joined order by c.joined desc
  `);
  const measurable = (lag: number) => cohorts.filter((c) => new Date(`${c.day}T00:00:00Z`).getTime() + lag * 86_400_000 <= new Date(`${today}T00:00:00Z`).getTime());
  const rate = (lag: number, key: "d1" | "d7") => {
    const cs = measurable(lag);
    const joined = cs.reduce((a, c) => a + num(c.joined), 0);
    return { joined, returned: cs.reduce((a, c) => a + num(c[key]), 0) };
  };

  const recent = await rows<Record<string, unknown>>(sql`
    select u.id, u.username, u.created_at, u.balance, u.games_played, u.last_seen_at, r.username as invited_by
    from users u left join users r on r.id = u.referred_by
    where ${userWho} order by u.created_at desc nulls last limit 15
  `);

  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    days, hideAdmins, today,
    trackingSince: iso(k.tracking_since),
    kpis: {
      totalUsers: num(k.total_users), newToday: num(k.new_today), new7: num(k.new_7), new30: num(k.new_30),
      dau: num(k.dau), wau: num(k.wau), mau: num(k.mau), onlineNow: num(k.online_now),
      playsToday: num(k.plays_today), wageredToday: num(k.wagered_today), paidToday: num(k.paid_today),
      coinsHeld: num(k.coins_held), givenAway: num(k.given_away), chatToday: num(k.chat_today),
    },
    daily: daily.map((d) => ({ day: String(d.day), signups: num(d.signups), active: num(d.active), plays: num(d.plays), players: num(d.players), wagered: num(d.wagered), paid: num(d.paid) })),
    games: games.map((g) => ({ game: String(g.game), plays: num(g.plays), players: num(g.players), wagered: num(g.wagered), paid: num(g.paid), biggest: num(g.biggest) })),
    topPlayers: top.map((t) => ({ id: String(t.id), username: String(t.username), balance: num(t.balance), lastSeenAt: iso(t.last_seen_at), plays: num(t.plays), wagered: num(t.wagered), paid: num(t.paid), daysPlayed: num(t.days_played) })),
    biggestWins: wins.map((w) => ({ username: String(w.username), game: String(w.game), bet: num(w.bet), payout: num(w.payout), at: iso(w.created_at)! })),
    hours: Array.from({ length: 24 }, (_, h) => num(hours.find((x) => num(x.hour) === h)?.plays)),
    bonuses: bonuses.map((b) => ({ method: String(b.method), times: num(b.times), amount: num(b.amount) })),
    retention: {
      d1: rate(1, "d1"), d7: rate(7, "d7"),
      cohorts: cohorts.slice(0, 14).map((c) => ({ day: String(c.day), joined: num(c.joined), d1: num(c.d1), d7: num(c.d7) })),
    },
    recentSignups: recent.map((r) => ({ id: String(r.id), username: String(r.username), createdAt: iso(r.created_at), balance: num(r.balance), gamesPlayed: num(r.games_played), lastSeenAt: iso(r.last_seen_at), invitedBy: r.invited_by ? String(r.invited_by) : null })),
  };
}

export async function playerDetail(id: string): Promise<AdminPlayer | null> {
  const [u] = await rows<Record<string, unknown>>(sql`
    select u.*, r.username as invited_by,
      (select count(*) from users f where f.referred_by = u.id) as invited,
      (select count(*) from user_days d where d.user_id = u.id) as days_active,
      (select count(*) from chat_messages c where c.user_id = u.id) as chat_messages,
      (select count(*) from pool_matches m where m.status = 'finished' and m.winner = u.id) as pool_won,
      (select count(*) from pool_matches m where m.status = 'finished' and m.winner <> u.id and (m.player1 = u.id or m.player2 = u.id)) as pool_lost
    from users u left join users r on r.id = u.referred_by where u.id = ${id}
  `);
  if (!u) return null;
  const games = await rows<Record<string, unknown>>(sql`
    select game, count(*) as plays, sum(bet) as wagered, sum(payout) as paid, max(payout) as biggest, max(created_at) as last_at
    from game_plays where user_id = ${id} group by game order by count(*) desc
  `);
  const plays = await rows<Record<string, unknown>>(sql`
    select game, bet, payout, created_at from game_plays where user_id = ${id} order by id desc limit 60
  `);
  const bonuses = await rows<Record<string, unknown>>(sql`
    select method, amount, created_at from deposits where user_id = ${id} order by id desc limit 30
  `);
  const days = await rows<Record<string, unknown>>(sql`
    select day from user_days where user_id = ${id} and day >= ${vnDay(vnDayStart(29))} order by day
  `);
  const chat = await rows<Record<string, unknown>>(sql`
    select text, sticker, created_at, deleted from chat_messages where user_id = ${id} order by id desc limit 10
  `);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(u.id), username: String(u.username), balance: num(u.balance),
    createdAt: iso(u.created_at), lastSeenAt: iso(u.last_seen_at),
    isAdmin: !!u.is_admin, banned: !!u.banned, mutedUntil: iso(u.muted_until),
    gamesPlayed: num(u.games_played), totalWins: num(u.total_wins), maxWin: num(u.max_win),
    invitedBy: u.invited_by ? String(u.invited_by) : null, invited: num(u.invited),
    daysActive: num(u.days_active), chatMessages: num(u.chat_messages),
    pool: { won: num(u.pool_won), lost: num(u.pool_lost) },
    activeDays: days.map((d) => String(d.day)),
    games: games.map((g) => ({ game: String(g.game), plays: num(g.plays), wagered: num(g.wagered), paid: num(g.paid), biggest: num(g.biggest), lastAt: iso(g.last_at) })),
    plays: plays.map((p) => ({ game: String(p.game), bet: num(p.bet), payout: num(p.payout), at: iso(p.created_at)! })),
    bonuses: bonuses.map((b) => ({ method: String(b.method), amount: num(b.amount), at: iso(b.created_at)! })),
    chat: chat.map((c) => ({ text: c.text ? String(c.text) : null, sticker: c.sticker ? String(c.sticker) : null, at: iso(c.created_at)!, deleted: !!c.deleted })),
  };
}

export function registerAnalyticsRoutes(app: Express, requireAdmin: Mw) {
  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    res.json(await analytics(days, req.query.admins !== "1"));
  });

  app.get("/api/admin/players/:id", requireAdmin, async (req, res) => {
    const p = await playerDetail(String(req.params.id));
    if (!p) return res.status(404).json({ message: "Player not found" });
    res.json(p);
  });

  // A gift of coins to one player, recorded with the other bonuses
  const giftSchema = z.object({ amount: z.number().int().min(1000).max(100_000_000) });
  app.post("/api/admin/players/:id/gift", requireAdmin, async (req, res) => {
    const parsed = giftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Give between 1,000 and 100,000,000 coins" });
    const id = String(req.params.id);
    const balance = await db.transaction(async (tx) => {
      const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${parsed.data.amount}` })
        .where(sql`${users.id} = ${id}`).returning({ balance: users.balance });
      if (!u) return null;
      await tx.insert(deposits).values({ userId: id, amount: parsed.data.amount, method: "admin_gift" });
      return u.balance;
    });
    if (balance === null) return res.status(404).json({ message: "Player not found" });
    res.json({ balance });
  });
}
