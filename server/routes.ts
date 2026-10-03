import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "./storage";
import {
  BET_OPTIONS, credentialsSchema, SLOT_SYMBOLS, PAYLINES, FREE_SPINS_AWARD,
  FREE_SPINS_TRIGGER_MULTIPLE, ORACLE_WIN_MULTIPLIER, DAILY_BONUS_AMOUNT, type User, type PublicUser,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

function toPublic(user: User): PublicUser {
  const { password: _password, ...rest } = user;
  return rest;
}

function firstError(err: z.ZodError) {
  return err.errors[0]?.message ?? "Invalid input";
}

/** Small in-memory limiter for login/register brute force. Good enough for one instance. */
function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 10000) hits.clear();
      return next();
    }
    if (++h.n > max) return res.status(429).json({ message: "Too many attempts, try again in a few minutes" });
    next();
  };
}

/** Real recent big wins, for the "live wins" ticker. In-memory, resets on restart. */
const recentWins: { user: string; amount: number; multiple: number; at: number }[] = [];
function maskName(name: string) {
  return name.length <= 3 ? name[0] + "**" : name.slice(0, 3) + "***";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const authLimiter = rateLimit(20, 10 * 60 * 1000);

  async function requireUser(req: Request, res: Response, next: NextFunction) {
    const id = req.session.userId;
    const user = id ? await storage.getUser(id) : undefined;
    if (!user) return res.status(401).json({ message: "Not logged in" });
    res.locals.user = user;
    next();
  }

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    requireUser(req, res, () => {
      if (!(res.locals.user as User).isAdmin) return res.status(403).json({ message: "Admins only" });
      next();
    });
  }

  function startSession(req: Request, res: Response, user: User) {
    // New session id on login stops session-fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ message: "Could not start session" });
      req.session.userId = user.id;
      req.session.save(() => res.json(toPublic(user)));
    });
  }

  // ---------------- Auth ----------------

  app.post("/api/register", authLimiter, async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const { username, password } = parsed.data;
    if (await storage.getUserByUsername(username)) {
      return res.status(409).json({ message: "That username is taken" });
    }
    const user = await storage.createUser({ username, password: await bcrypt.hash(password, 10) });
    startSession(req, res, user);
  });

  app.post("/api/login", authLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Username and password required" });
    }
    const user = await storage.getUserByUsername(username.trim());
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Wrong username or password" });
    }
    startSession(req, res, user);
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("dragon_session");
      res.json({ ok: true });
    });
  });

  app.get("/api/me", requireUser, (_req, res) => {
    res.json(toPublic(res.locals.user));
  });

  // ---------------- Game ----------------

  app.get("/api/game/config", (_req, res) => {
    res.json({
      symbols: SLOT_SYMBOLS.map(({ id, name, pays }) => ({ id, name, pays })),
      paylines: PAYLINES,
      bets: BET_OPTIONS,
      freeSpinsAward: FREE_SPINS_AWARD,
      freeSpinsTriggerMultiple: FREE_SPINS_TRIGGER_MULTIPLE,
      oracleMultiplier: ORACLE_WIN_MULTIPLIER,
    });
  });

  app.get("/api/game/state", requireUser, async (_req, res) => {
    const user: User = res.locals.user;
    const state = await storage.getGameState(user.id);
    res.json({
      balance: user.balance,
      streak: user.streak,
      maxStreak: user.maxStreak,
      totalWins: user.totalWins,
      maxWin: user.maxWin,
      gamesPlayed: user.gamesPlayed,
      freeSpins: state?.freeSpins ?? 0,
      freeSpinBet: state?.freeSpinBet ?? 0,
      blessed: (state?.activeModifier ?? 100) > 100,
      lastOracleAt: state?.lastOracleAt ?? null,
      lastDailyBonusAt: user.lastDailyBonusAt,
    });
  });

  app.post("/api/game/spin", requireUser, async (req, res) => {
    const user: User = res.locals.user;
    const bet = Number(req.body?.betAmount);
    if (!BET_OPTIONS.includes(bet)) return res.status(400).json({ message: "Invalid bet" });

    const result = await storage.spin(user.id, bet);
    if ("error" in result) {
      return res.status(400).json({ message: "Insufficient balance", code: result.error });
    }
    const multiple = result.winAmount / result.bet;
    if (multiple >= 10) {
      recentWins.unshift({ user: maskName(user.username), amount: result.winAmount, multiple, at: Date.now() });
      recentWins.length = Math.min(recentWins.length, 20);
    }
    res.json(result);
  });

  app.post("/api/game/oracle", requireUser, async (_req, res) => {
    const r = await storage.consultOracle(res.locals.user.id);
    res.json(r);
  });

  app.get("/api/game/leaderboard", async (_req, res) => {
    const top = await storage.getLeaderboard(10);
    res.json(top.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      balance: u.balance,
      totalWins: u.totalWins,
      maxWin: u.maxWin,
      maxStreak: u.maxStreak,
    })));
  });

  app.get("/api/game/recent-wins", (_req, res) => {
    res.json(recentWins);
  });

  app.get("/api/achievements/:userId", requireUser, async (req, res) => {
    res.json(await storage.getAchievements(String(req.params.userId)));
  });

  // ---------------- Coins (play money only) ----------------

  app.post("/api/bonus/daily", requireUser, async (_req, res) => {
    const r = await storage.claimDailyBonus(res.locals.user.id);
    res.status(r.granted ? 200 : 429).json({ ...r, amount: DAILY_BONUS_AMOUNT });
  });

  app.post("/api/promo/redeem", requireUser, async (req, res) => {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!code) return res.status(400).json({ message: "Enter a code" });
    const r = await storage.redeemPromoCode(code, res.locals.user.id);
    if (!r) return res.status(400).json({ message: "Invalid or already used code" });
    res.json(r);
  });

  app.get("/api/coins/history", requireUser, async (_req, res) => {
    res.json(await storage.getCredits(res.locals.user.id));
  });

  // ---------------- Profile ----------------

  app.get("/api/user/profile", requireUser, (_req, res) => {
    res.json(toPublic(res.locals.user));
  });

  const profileSchema = z.object({
    username: credentialsSchema.shape.username.optional(),
    firstName: z.string().trim().max(50).optional(),
    lastName: z.string().trim().max(50).optional(),
  });

  app.patch("/api/user/profile", requireUser, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const user: User = res.locals.user;
    if (parsed.data.username && parsed.data.username.toLowerCase() !== user.username.toLowerCase()) {
      if (await storage.getUserByUsername(parsed.data.username)) {
        return res.status(409).json({ message: "That username is taken" });
      }
    }
    res.json(toPublic(await storage.updateProfile(user.id, parsed.data)));
  });

  app.post("/api/user/password", requireUser, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const user: User = res.locals.user;
    if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: "Current password is wrong" });
    }
    const parsed = credentialsSchema.shape.password.safeParse(newPassword);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    await storage.updatePassword(user.id, await bcrypt.hash(parsed.data, 10));
    res.json({ ok: true });
  });

  // ---------------- Admin ----------------

  app.get("/api/admin/dashboard/stats", requireAdmin, async (_req, res) => {
    res.json(await storage.getAdminStats());
  });

  app.get("/api/admin/dashboard/users", requireAdmin, async (_req, res) => {
    res.json((await storage.getAllUsers()).map(toPublic));
  });

  const adminUserSchema = z.object({
    balance: z.number().int().min(0).optional(),
    username: credentialsSchema.shape.username.optional(),
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    password: credentialsSchema.shape.password.optional(),
  });

  app.patch("/api/admin/dashboard/users/:id", requireAdmin, async (req, res) => {
    const parsed = adminUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const data = { ...parsed.data };
    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    const updated = await storage.adminUpdateUser(String(req.params.id), data);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(toPublic(updated));
  });

  app.delete("/api/admin/dashboard/users/:id", requireAdmin, async (req, res) => {
    if (req.params.id === res.locals.user.id) return res.status(400).json({ message: "You can't delete yourself" });
    await storage.adminDeleteUser(String(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/admin/dashboard/gift-cards", requireAdmin, async (_req, res) => {
    res.json(await storage.getAllPromoCodes());
  });

  app.post("/api/admin/dashboard/gift-cards", requireAdmin, async (req, res) => {
    const parsed = z.object({
      code: z.string().trim().min(3).max(40).transform((s) => s.toUpperCase()),
      denomination: z.coerce.number().int().positive().max(1_000_000_000),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    try {
      res.json(await storage.createPromoCode(parsed.data.code, parsed.data.denomination));
    } catch {
      res.status(409).json({ message: "That code already exists" });
    }
  });

  app.delete("/api/admin/dashboard/gift-cards/:id", requireAdmin, async (req, res) => {
    await storage.deletePromoCode(Number(req.params.id));
    res.json({ ok: true });
  });

  // Anything else under /api is a 404 in JSON, never the HTML app shell
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  return httpServer;
}
