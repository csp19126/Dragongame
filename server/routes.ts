import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "./storage";
import { bauCuaBetsSchema, rouletteBetsSchema, playBauCua, playRoulette } from "./tablegames";
import { publicView } from "./blackjack";
import { registerPoolRoutes } from "./pool";
import { registerCommunityRoutes, applyReferral, communityStats } from "./community";
import { registerTournamentRoutes } from "./tournament";
import { GAMBLE_PICKS, GAMBLE_PAYS } from "@shared/gamble";
import { GRADE_BLESSING } from "@shared/oracle";
import {
  BET_OPTIONS, credentialsSchema, SLOT_SYMBOLS, PAYLINES, SCATTER_PAYS, MAX_WIN_MULTIPLE,
  DAILY_BONUS_AMOUNT, REPEATER_MULTIPLIERS, REPEATER_PEARLS, HOLD_CHANCE, HOLD_MAX_REELS, RTP_WITHOUT_HOLD, BASE_RTP, TOTAL_RTP, FREE_SPIN_OPTIONS,
  JACKPOT_ROW, JACKPOT_CONTRIBUTION, JACKPOT_FULL_BET, JACKPOT_SEED, type User, type PublicUser,
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
    if (process.env.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) return next();
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
const recentWins: { user: string; amount: number; multiple: number; at: number; jackpot?: boolean }[] = [];
function maskName(name: string) {
  return name.length <= 3 ? name[0] + "**" : name.slice(0, 3) + "***";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const authLimiter = rateLimit(20, 10 * 60 * 1000);

  async function requireUser(req: Request, res: Response, next: NextFunction) {
    const id = req.session.userId;
    const user = id ? await storage.getUser(id) : undefined;
    if (!user) return res.status(401).json({ message: "Not logged in" });
    if (user.banned) {
      req.session.destroy(() => res.status(403).json({ message: "This account has been suspended" }));
      return;
    }
    // "Last seen" for the admin's active-player counts, written at most every 5 minutes
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 5 * 60_000) void storage.touch(user.id).catch(() => {});
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
    let user = await storage.createUser({ username, password: await bcrypt.hash(password, 10) });
    // Joined through a friend's invite link: link them up and add the welcome bonus
    if (req.body?.ref && (await applyReferral(user.id, req.body.ref))) user = (await storage.getUser(user.id)) ?? user;
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
    if (user.banned) return res.status(403).json({ message: "This account has been suspended" });
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
      symbols: SLOT_SYMBOLS.map(({ id, name, kind, pays }) => ({ id, name, kind, pays })),
      paylines: PAYLINES,
      scatterPays: SCATTER_PAYS,
      bets: BET_OPTIONS,
      repeaterMultipliers: REPEATER_MULTIPLIERS,
      repeaterPearls: REPEATER_PEARLS,
      hold: { chance: HOLD_CHANCE, maxReels: HOLD_MAX_REELS },
      freeSpinOptions: FREE_SPIN_OPTIONS,
      jackpot: { row: JACKPOT_ROW, contribution: JACKPOT_CONTRIBUTION, fullBet: JACKPOT_FULL_BET, seed: JACKPOT_SEED },
      maxWinMultiple: MAX_WIN_MULTIPLE,
      rtp: { base: BASE_RTP, total: TOTAL_RTP, withoutHold: RTP_WITHOUT_HOLD },
      oracleBlessings: GRADE_BLESSING,
      gamblePays: GAMBLE_PAYS,
    });
  });

  app.get("/api/game/jackpot", async (_req, res) => {
    const pot = await storage.getJackpot();
    res.json({
      amount: pot.amount,
      lastWinner: pot.lastWinner ? maskName(pot.lastWinner) : null,
      lastAmount: pot.lastAmount,
      lastWonAt: pot.lastWonAt,
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
      blessing: (state?.activeModifier ?? 100) > 100 ? (state?.activeModifier ?? 100) / 100 : 1,
      oracleStick: (state?.activeModifier ?? 100) > 100 ? state?.oracleStick ?? null : null,
      freeSpinMult: state?.freeSpinMult ?? 1,
      pendingFreeSpinUnits: state?.freeSpinUnits ?? 0,
      gambleAmount: state?.gambleAmount ?? 0,
      gambleRounds: state?.gambleRounds ?? 0,
      holdOffer: !!state?.holdGrid,
      holdBet: state?.holdBet ?? null,
      lastOracleAt: state?.lastOracleAt ?? null,
      lastDailyBonusAt: user.lastDailyBonusAt,
    });
  });

  app.post("/api/game/spin", requireUser, async (req, res) => {
    const user: User = res.locals.user;
    const bet = Number(req.body?.betAmount);
    if (!BET_OPTIONS.includes(bet)) return res.status(400).json({ message: "Invalid bet" });

    const hold = Array.isArray(req.body?.hold) ? req.body.hold.map(Number) : [];
    const result = await storage.spin(user.id, bet, undefined, hold);
    if ("error" in result) {
      if (result.error === "pick_free_spins") return res.status(409).json({ message: "Pick your free spins first", code: result.error });
      if (result.error === "no_hold") return res.status(409).json({ message: "No hold to use", code: result.error });
      if (result.error === "bad_hold") return res.status(400).json({ message: "Hold up to 2 reels, at the bet you lost on", code: result.error });
      return res.status(400).json({ message: "Insufficient balance", code: result.error });
    }
    const multiple = result.winAmount / result.bet;
    if (multiple >= 10 || result.jackpotWin > 0) {
      recentWins.unshift({ user: maskName(user.username), amount: result.winAmount, multiple, at: Date.now(), jackpot: result.jackpotWin > 0 });
      recentWins.length = Math.min(recentWins.length, 20);
    }
    res.json(result);
  });

  // ---------------- Table games ----------------

  function recordBigWin(user: User, winAmount: number, totalBet: number) {
    const multiple = winAmount / totalBet;
    if (multiple >= 10) {
      recentWins.unshift({ user: maskName(user.username), amount: winAmount, multiple, at: Date.now() });
      recentWins.length = Math.min(recentWins.length, 20);
    }
  }

  app.post("/api/games/baucua", requireUser, async (req, res) => {
    const parsed = bauCuaBetsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const bets = parsed.data.bets;
    const total = Object.values(bets).reduce((a, n) => a + n, 0);
    const result = await storage.playTable(res.locals.user.id, total, () => playBauCua(bets));
    if ("error" in result) return res.status(400).json({ message: "Insufficient balance", code: result.error });
    recordBigWin(res.locals.user, result.winAmount, total);
    res.json(result);
  });

  app.post("/api/games/roulette", requireUser, async (req, res) => {
    const parsed = rouletteBetsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const bets = parsed.data.bets;
    const total = bets.reduce((a, b) => a + b.amount, 0);
    const result = await storage.playTable(res.locals.user.id, total, () => playRoulette(bets));
    if ("error" in result) return res.status(400).json({ message: "Insufficient balance", code: result.error });
    recordBigWin(res.locals.user, result.winAmount, total);
    res.json(result);
  });

  registerPoolRoutes(app, requireUser);
  registerCommunityRoutes(app, requireUser, requireAdmin);
  registerTournamentRoutes(app, requireUser, requireAdmin);

  // Blackjack: the hand lives on the server; the browser only ever sees publicView()
  const BJ_MAX_BET = 1_000_000;
  app.get("/api/games/blackjack", requireUser, async (_req, res) => {
    const s = await storage.getActiveBlackjack(res.locals.user.id);
    res.json({ hand: s ? publicView(s) : null });
  });

  app.post("/api/games/blackjack/deal", requireUser, async (req, res) => {
    const bet = Number(req.body?.bet);
    if (!Number.isInteger(bet) || bet < 1000 || bet > BJ_MAX_BET || bet % 1000 !== 0) return res.status(400).json({ message: "Invalid bet" });
    const r = await storage.blackjackDeal(res.locals.user.id, bet);
    if ("error" in r) return res.status(r.error === "hand_in_progress" ? 409 : 400).json({ message: r.error === "hand_in_progress" ? "Finish your hand first" : "Insufficient balance", code: r.error });
    if (r.stats) recordBigWin(res.locals.user, r.state.payout, r.state.totalBet);
    res.json({ hand: publicView(r.state), newBalance: r.balance, ...(r.stats ?? {}) });
  });

  app.post("/api/games/blackjack/action", requireUser, async (req, res) => {
    const action = req.body?.action;
    if (!["hit", "stand", "double", "split"].includes(action)) return res.status(400).json({ message: "Invalid action" });
    const r = await storage.blackjackAct(res.locals.user.id, action);
    if ("error" in r) {
      const msg = { no_hand: "No hand in play", not_allowed: "You can't do that now", insufficient_balance: "Insufficient balance" }[r.error];
      return res.status(r.error === "no_hand" ? 404 : 400).json({ message: msg, code: r.error });
    }
    if (r.stats) recordBigWin(res.locals.user, r.state.payout, r.state.totalBet);
    res.json({ hand: publicView(r.state), newBalance: r.balance, ...(r.stats ?? {}) });
  });

  app.post("/api/game/oracle", requireUser, async (_req, res) => {
    const r = await storage.consultOracle(res.locals.user.id);
    res.json(r);
  });

  // Chọn Lì Xì: how to take the free spins just won
  app.post("/api/game/free-spins/pick", requireUser, async (req, res) => {
    const choice = req.body?.choice;
    if (!["steady", "bold", "daring", "mystery"].includes(choice)) return res.status(400).json({ message: "Invalid choice" });
    const r = await storage.pickFreeSpins(res.locals.user.id, choice);
    if (!r) return res.status(409).json({ message: "No free spins to pick" });
    res.json(r);
  });

  // Xóc Đĩa double-up on the last win
  app.post("/api/game/gamble", requireUser, async (req, res) => {
    const pick = req.body?.pick;
    if (!GAMBLE_PICKS.includes(pick)) return res.status(400).json({ message: "Invalid pick" });
    const r = await storage.gamble(res.locals.user.id, pick, req.body?.half === true);
    if ("error" in r) {
      const msg = ({ nothing_to_gamble: "Nothing to double up", no_more_rounds: "That's the last round", too_big: "That's over the double-up limit" } as Record<string, string>)[r.error as string];
      return res.status(409).json({ message: msg, code: r.error });
    }
    if (r.won) recordBigWin(res.locals.user, r.payout, r.stake);
    res.json(r);
  });

  app.post("/api/game/gamble/collect", requireUser, async (_req, res) => {
    await storage.collectGamble(res.locals.user.id);
    res.json({ ok: true });
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

  // ---------------- Android app (Google Play) ----------------

  // Digital Asset Links: proves the Play app and this site have the same owner, so the
  // app opens the site full-screen. ANDROID_CERT_SHA256 lists the signing certificates'
  // SHA-256 fingerprints, comma separated (upload key and Play app signing key).
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    res.json(fingerprints.length ? [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: process.env.ANDROID_PACKAGE || "online.vnslot888.twa", sha256_cert_fingerprints: fingerprints },
    }] : []);
  });

  // ---------------- Profile ----------------

  // Players can delete their own account and all its data (required by Google Play)
  app.post("/api/user/delete", authLimiter, requireUser, async (req, res) => {
    const user: User = res.locals.user;
    const password = req.body?.password;
    if (typeof password !== "string" || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Password is wrong" });
    }
    await storage.adminDeleteUser(user.id);
    req.session.destroy(() => {
      res.clearCookie("dragon_session");
      res.json({ ok: true });
    });
  });

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
    res.json({ ...(await storage.getAdminStats()), ...(await communityStats()) });
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
      note: z.string().trim().max(120).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    try {
      res.json(await storage.createPromoCode(parsed.data.code, parsed.data.denomination, parsed.data.note));
    } catch {
      res.status(409).json({ message: "That code already exists" });
    }
  });

  app.post("/api/admin/dashboard/gift-cards/batch", requireAdmin, async (req, res) => {
    const parsed = z.object({
      count: z.coerce.number().int().min(1).max(200),
      denomination: z.coerce.number().int().positive().max(1_000_000_000),
      batch: z.string().trim().max(60).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: firstError(parsed.error) });
    const { count: n, denomination, batch } = parsed.data;
    const name = batch || `${n} × ${denomination.toLocaleString("en")} · ${new Date().toISOString().slice(0, 10)}`;
    res.json(await storage.createPromoBatch(n, denomination, name));
  });

  app.patch("/api/admin/dashboard/gift-cards/:id", requireAdmin, async (req, res) => {
    const note = z.string().trim().max(120).safeParse(req.body?.note ?? "");
    if (!note.success) return res.status(400).json({ message: firstError(note.error) });
    const card = await storage.updatePromoNote(Number(req.params.id), note.data);
    if (!card) return res.status(404).json({ message: "Code not found" });
    res.json(card);
  });

  app.delete("/api/admin/dashboard/gift-cards/:id", requireAdmin, async (req, res) => {
    await storage.deletePromoCode(Number(req.params.id));
    res.json({ ok: true });
  });

  // Anything else under /api is a 404 in JSON, never the HTML app shell
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  return httpServer;
}
