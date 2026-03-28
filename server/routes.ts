import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Optional AI integration routes (require API key). Keep optional for local dev.
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    const [{ registerAudioRoutes }, { registerImageRoutes }, { registerChatRoutes }] = await Promise.all([
      import("./replit_integrations/audio"),
      import("./replit_integrations/image"),
      import("./replit_integrations/chat"),
    ]);
    registerAudioRoutes(app);
    registerImageRoutes(app);
    registerChatRoutes(app);
  }

  app.post("/api/admin/gift-balance", async (req, res) => {
    try {
      const { userId, amount, adminKey } = req.body;
      const validKey = process.env.ADMIN_KEY || "dragon888admin";
      if (adminKey !== validKey) {
        return res.status(403).json({ message: "Forbidden" });
      }
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.getUserByUsername(userId);
      }
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const newBalance = (user.balance ?? 0) + amount;
      await storage.updateBalance(user.id, newBalance);
      res.json({ success: true, userId: user.id, username: user.username, newBalance });
    } catch (err) {
      res.status(500).json({ message: "Failed to gift balance" });
    }
  });

  app.post("/api/admin/create-gift-card", async (req, res) => {
    try {
      const { code, denomination, adminKey } = req.body;
      const validKey = process.env.ADMIN_KEY || "dragon888admin";
      if (adminKey !== validKey) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.createGiftCard(code, denomination);
      res.json({ success: true, code, denomination });
    } catch (err) {
      res.status(500).json({ message: "Failed to create gift card" });
    }
  });

  const ADMIN_USER_ID = "55109529";
  const isAdmin = (req: any, res: any, next: any) => {
    let userId = (req.session as any)?.userId;
    if (!userId || userId !== ADMIN_USER_ID) {
      return res.status(403).json({ message: "Admin access only" });
    }
    next();
  };

  app.get("/api/admin/dashboard/users", isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safe = allUsers.map(({ password: _, ...u }) => u);
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to fetch users" }); }
  });

  app.patch("/api/admin/dashboard/users/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { balance, username, firstName, lastName, password } = req.body;
      const updates: any = {};
      if (balance !== undefined) updates.balance = Number(balance);
      if (username !== undefined) updates.username = username;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        updates.password = hashed;
      }
      const user = await storage.adminUpdateUser(id, updates);
      const { password: _, ...safe } = user;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to update user" }); }
  });

  app.delete("/api/admin/dashboard/users/:id", isAdmin, async (req, res) => {
    try {
      if (req.params.id === ADMIN_USER_ID) return res.status(400).json({ message: "Cannot delete admin account" });
      await storage.adminDeleteUser(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to delete user" }); }
  });

  app.get("/api/admin/dashboard/gift-cards", isAdmin, async (req, res) => {
    try {
      const cards = await storage.getAllGiftCards();
      res.json(cards);
    } catch { res.status(500).json({ message: "Failed to fetch gift cards" }); }
  });

  app.post("/api/admin/dashboard/gift-cards", isAdmin, async (req, res) => {
    try {
      const { code, denomination } = req.body;
      if (!code || !denomination) return res.status(400).json({ message: "Code and denomination required" });
      const card = await storage.createGiftCard(code.toUpperCase(), Number(denomination));
      res.json(card);
    } catch (err: any) {
      if (err.message?.includes("unique")) return res.status(400).json({ message: "Gift card code already exists" });
      res.status(500).json({ message: "Failed to create gift card" });
    }
  });

  app.delete("/api/admin/dashboard/gift-cards/:id", isAdmin, async (req, res) => {
    try {
      await storage.adminDeleteGiftCard(Number(req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to delete gift card" }); }
  });

  app.get("/api/admin/dashboard/withdrawals", isAdmin, async (req, res) => {
    try {
      const all = await storage.getAllWithdrawals();
      res.json(all);
    } catch { res.status(500).json({ message: "Failed to fetch withdrawals" }); }
  });

  app.patch("/api/admin/dashboard/withdrawals/:id", isAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateWithdrawalStatus(Number(req.params.id), status);
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to update withdrawal" }); }
  });

  app.get("/api/admin/dashboard/stats", isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allCards = await storage.getAllGiftCards();
      const allW = await storage.getAllWithdrawals();
      res.json({
        totalUsers: allUsers.length,
        totalBalance: allUsers.reduce((s, u) => s + (u.balance ?? 0), 0),
        totalWins: allUsers.reduce((s, u) => s + (u.totalWins ?? 0), 0),
        totalGamesPlayed: allUsers.reduce((s, u) => s + (u.gamesPlayed ?? 0), 0),
        activeGiftCards: allCards.filter(c => !c.isRedeemed).length,
        redeemedGiftCards: allCards.filter(c => c.isRedeemed).length,
        pendingWithdrawals: allW.filter(w => w.status === "pending").length,
        totalWithdrawals: allW.length,
      });
    } catch { res.status(500).json({ message: "Failed to fetch stats" }); }
  });

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) {
        return res.status(400).json({ message: "Username exists" });
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const user = await storage.createUser({ ...input, password: hashedPassword, email: `${input.username}@example.com` });
      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        res.status(400).json({ message: "Invalid input" });
      }
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      let passwordMatch = false;
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        passwordMatch = await bcrypt.compare(input.password, user.password);
      } else {
        passwordMatch = user.password === input.password;
        if (passwordMatch) {
          const hashed = await bcrypt.hash(input.password, 10);
          await storage.updatePassword(user.id, hashed);
        }
      }
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.status(200).json(safeUser);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post("/api/logout", (req: any, res) => {
    req.session?.destroy((err: unknown) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Logged out" });
    });
  });

  // Social auth placeholders for local mode.
  app.get("/api/auth/google", (_req, res) => {
    res.status(501).json({ message: "Google login requires OAuth credentials setup" });
  });
  app.get("/api/auth/facebook", (_req, res) => {
    res.status(501).json({ message: "Facebook login requires OAuth credentials setup" });
  });
  app.get("/api/auth/apple", (_req, res) => {
    res.status(501).json({ message: "Apple login requires OAuth credentials setup" });
  });

  app.get(api.game.state.path, async (req: any, res) => {
    try {
      let userId = (req.session as any).userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let user = await storage.getUser(userId);
      if (!user) {
        // Try getting by username if userId was nickname
        user = await storage.getUserByUsername(userId);
      }

      if (!user) {
        // If still not found, we might need to create it (should have been done in upsertUser)
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json({
        balance: user.balance,
        gameStates: [],
        streak: user.streak ?? 0,
        maxStreak: user.maxStreak ?? 0,
        totalWins: user.totalWins ?? 0,
        maxWin: user.maxWin ?? 0,
        gamesPlayed: user.gamesPlayed ?? 0,
      });
    } catch (err) {
      console.error("Error fetching game state:", err);
      res.status(500).json({ message: "Failed to fetch state" });
    }
  });

  app.post(api.game.spin.path, async (req: any, res) => {
    try {
      let userId = (req.session as any).userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const input = api.game.spin.input.parse(req.body);
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.getUserByUsername(userId);
      }

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      let gameState = await storage.getGameState(user.id, input.slotId);
      if (!gameState) {
        gameState = await storage.updateGameState(user.id, input.slotId, { freeSpins: 0 });
      }

      const isFreeSpin = (gameState?.freeSpins ?? 0) > 0;
      
      if (!isFreeSpin) {
        const deducted = await storage.deductBalanceAtomic(user.id, input.betAmount);
        if (!deducted) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
        user = deducted;
      }

      const symbols = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];
      const pick = () => symbols[Math.floor(Math.random() * symbols.length)];
      const pickAdj = (s: string) => symbols[(symbols.indexOf(s) + 1) % symbols.length];
      const pickDiff = (s: string) => { let n = pick(); while (n === s) n = pick(); return n; };

      const grid: string[][] = [
        [pick(), pick(), pick()],
        [pick(), pick(), pick()],
        [pick(), pick(), pick()],
      ];

      const PAYLINES: [number, number][][] = [
        [[0,0],[1,0],[2,0]],
        [[0,1],[1,1],[2,1]],
        [[0,2],[1,2],[2,2]],
        [[0,0],[1,1],[2,2]],
        [[0,2],[1,1],[2,0]],
      ];

      const getLine = (line: [number, number][]) => line.map(([c,r]) => grid[c][r]);

      let winAmount = 0;
      let isJackpot = false;
      let freeSpinsAwarded = 0;
      let isBonusRound = false;
      let isRepeater = false;
      let isNearMiss = false;
      let isFakeRepeater = false;
      const winLines: number[] = [];

      const roll = Math.random();

      if (roll < 0.003) {
        const s = pick();
        const lineIdx = Math.floor(Math.random() * 5);
        PAYLINES[lineIdx].forEach(([c,r]) => { grid[c][r] = s; });
      } else if (roll < 0.10) {
        const s = pick();
        const lineIdx = Math.floor(Math.random() * 5);
        const coords = PAYLINES[lineIdx];
        coords.forEach(([c,r]) => { grid[c][r] = s; });
        const missPos = Math.floor(Math.random() * 3);
        const [mc,mr] = coords[missPos];
        grid[mc][mr] = pickDiff(s);
      } else if (roll < 0.50) {
        const s = pick();
        const lineIdx = Math.floor(Math.random() * 5);
        const coords = PAYLINES[lineIdx];
        coords.forEach(([c,r]) => { grid[c][r] = s; });
        const missPos = Math.floor(Math.random() * 3);
        const [mc,mr] = coords[missPos];
        grid[mc][mr] = pickAdj(s);
        isNearMiss = true;
      }

      PAYLINES.forEach((line, idx) => {
        const vals = getLine(line);
        if (vals[0] === vals[1] && vals[1] === vals[2]) {
          winLines.push(idx);
        }
      });

      if (winLines.length > 0) {
        if (winLines.length >= 3) {
          winAmount = input.betAmount * 100;
          isJackpot = true;
          freeSpinsAwarded = 20;
        } else if (winLines.length === 2) {
          winAmount = input.betAmount * 25;
          freeSpinsAwarded = 10;
          isJackpot = true;
        } else {
          const lineVals = getLine(PAYLINES[winLines[0]]);
          const s = lineVals[0];
          let base = input.betAmount * 5;
          if (s === "🐉") base = input.betAmount * 8;
          else if (s === "💎") base = input.betAmount * 7;
          else if (s === "🧧") base = input.betAmount * 6;
          winAmount = base;

          const isDiagonal = winLines[0] >= 3;
          if (isDiagonal) {
            winAmount = Math.floor(winAmount * 1.5);
          }
        }

        if (Math.random() < 0.25) { isBonusRound = true; winAmount = Math.floor(winAmount * 1.5); }
        if (Math.random() < 0.12) { isRepeater = true; winAmount = Math.floor(winAmount * 2); }
      } else {
        const twoMatchLines: number[] = [];
        PAYLINES.forEach((line, idx) => {
          const vals = getLine(line);
          if (vals[0] === vals[1] || vals[1] === vals[2] || vals[0] === vals[2]) {
            twoMatchLines.push(idx);
          }
        });
        if (twoMatchLines.length > 0 && Math.random() < 0.15) {
          winAmount = Math.floor(input.betAmount * (1.5 + Math.random() * 2));
          winLines.push(twoMatchLines[0]);
        }
      }

      if (isNearMiss && winAmount === 0 && Math.random() < 0.12) {
        isFakeRepeater = true;
        isRepeater = true;
      }

      if (winAmount > 0 && Math.random() < 0.08) {
        freeSpinsAwarded += Math.random() < 0.5 ? 3 : 5;
      }

      if (winAmount > 0 && Math.random() < 0.03) {
        const wildMults = [2, 3, 5];
        winAmount *= wildMults[Math.floor(Math.random() * wildMults.length)];
      }

      const newFreeSpins = (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0) + freeSpinsAwarded;
      
      // Update streak tracking
      const newConsecutiveWins = winAmount > 0 ? (gameState?.consecutiveWins ?? 0) + 1 : 0;
      const newTotalWins = (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0);
      const newMaxWin = Math.max(user.maxWin ?? 0, winAmount);

      if (winAmount > 0) {
        user = await storage.creditBalanceAtomic(user.id, winAmount);
      }
      const newBalance = user.balance;

      await storage.updateStreak(user.id, newConsecutiveWins, user.maxStreak ?? 0, newTotalWins, newMaxWin);
      await storage.updateGameState(user.id, input.slotId, { 
        freeSpins: newFreeSpins,
        consecutiveWins: newConsecutiveWins
      });

      const newlyUnlocked: any[] = [];
      const checkAndUnlock = async (badgeId: string, badgeName: string, description: string, icon: string) => {
        const result = await storage.unlockAchievement(user!.id, badgeId, badgeName, description, icon);
        if (result) newlyUnlocked.push(result);
      };

      if (winAmount > 0 && newTotalWins === 1) {
        await checkAndUnlock("first_win", "First Win", "Won your first spin!", "trophy");
      }
      if (newConsecutiveWins >= 3) {
        await checkAndUnlock("hot_streak_3", "Hot Streak x3", "3 consecutive wins!", "flame");
      }
      if (newConsecutiveWins >= 5) {
        await checkAndUnlock("hot_streak_5", "Hot Streak x5", "5 consecutive wins!", "zap");
      }
      const hasDragonLine = winLines.some(li => {
        const vals = getLine(PAYLINES[li]);
        return vals[0] === "🐉" && vals[1] === "🐉" && vals[2] === "🐉";
      });
      if (hasDragonLine) {
        await checkAndUnlock("dragon_master", "Dragon Master", "Win with 3 dragons!", "dragon");
      }
      if (input.betAmount >= 100000) {
        await checkAndUnlock("high_roller", "High Roller", "Bet 100,000 or more!", "gem");
      }
      if (newBalance >= 1000000) {
        await checkAndUnlock("millionaire", "Millionaire", "Balance reached 1,000,000!", "crown");
      }
      if (isJackpot) {
        await checkAndUnlock("jackpot_hunter", "Jackpot Hunter", "Hit a jackpot!", "star");
      }
      if (newTotalWins >= 7) {
        await checkAndUnlock("lucky_seven", "Lucky Seven", "Won 7 times!", "clover");
      }

      res.json({
        grid,
        winLines,
        winAmount,
        newBalance,
        freeSpinsAwarded,
        totalFreeSpins: newFreeSpins,
        isJackpot,
        isBonusRound,
        isRepeater,
        isFakeRepeater,
        isNearMiss,
        multiplier: undefined,
        streak: newConsecutiveWins,
        totalWins: newTotalWins,
        maxWin: newMaxWin,
        gamesPlayed: (user.gamesPlayed ?? 0) + 1,
        newAchievements: newlyUnlocked,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid spin request" });
      } else {
        console.error("Spin error:", err);
        res.status(500).json({ message: "Spin failed" });
      }
    }
  });

  app.get(api.game.leaderboard.path, async (req, res) => {
    const leaderboardUsers = await storage.getLeaderboard();
    res.json(leaderboardUsers.map((u, idx) => ({ 
      rank: idx + 1,
      username: u.username || 'Dragon Player', 
      balance: u.balance,
      totalWins: u.totalWins ?? 0,
      maxWin: u.maxWin ?? 0,
      maxStreak: u.maxStreak ?? 0
    })));
  });

  app.get("/api/achievements/:userId", async (req: any, res) => {
    try {
      const sessionUserId = (req.session as any)?.userId;
      const userId = req.params.userId;
      if (!sessionUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const achvs = await storage.getAchievements(userId);
      res.json(achvs);
    } catch (err) {
      console.error("Error fetching achievements:", err);
      res.status(500).json({ message: "Failed to fetch achievements" });
    }
  });

  app.post("/api/deposits/gift-card", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const codeSchema = z.object({ code: z.string().min(1).max(100) });
      const parsed = codeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid gift card code" });
      }

      const code = parsed.data.code.trim().toUpperCase();

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const result = await storage.redeemGiftCardAtomic(code, user.id);
      if (!result) return res.status(400).json({ message: "Gift card not found or already redeemed" });

      res.json({
        amount: result.amount,
        newBalance: result.newBalance,
        message: `Successfully redeemed ${result.amount.toLocaleString()}đ gift card!`,
      });
    } catch (err) {
      console.error("Gift card redeem error:", err);
      res.status(500).json({ message: "Failed to redeem gift card" });
    }
  });

  app.get("/api/deposits/history", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const history = await storage.getDeposits(user.id);
      res.json(history);
    } catch (err) {
      console.error("Deposit history error:", err);
      res.status(500).json({ message: "Failed to fetch deposit history" });
    }
  });

  app.post("/api/withdrawals/request", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const withdrawalSchema = z.object({
        amount: z.number().min(10000, "Minimum withdrawal is 10,000đ"),
        note: z.string().optional(),
      });
      const parsed = withdrawalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const deducted = await storage.deductBalanceAtomic(user.id, parsed.data.amount);
      if (!deducted) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const newBalance = deducted.balance;
      const withdrawal = await storage.createWithdrawal(user.id, parsed.data.amount, parsed.data.note);

      res.json({
        withdrawal,
        newBalance,
        message: `Withdrawal request for ${parsed.data.amount.toLocaleString()}đ submitted. An agent will contact you.`,
      });
    } catch (err) {
      console.error("Withdrawal request error:", err);
      res.status(500).json({ message: "Failed to submit withdrawal request" });
    }
  });

  app.get("/api/withdrawals/history", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const history = await storage.getWithdrawals(user.id);
      res.json(history);
    } catch (err) {
      console.error("Withdrawal history error:", err);
      res.status(500).json({ message: "Failed to fetch withdrawal history" });
    }
  });

  app.get("/api/user/profile", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        balance: user.balance,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        streak: user.streak,
        maxStreak: user.maxStreak,
        gamesPlayed: user.gamesPlayed,
        createdAt: user.createdAt,
      });
    } catch (err) {
      console.error("Profile fetch error:", err);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/user/profile", async (req: any, res) => {
    try {
      let userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const profileSchema = z.object({
        username: z.string().min(3).max(30).optional(),
        firstName: z.string().max(50).optional(),
        lastName: z.string().max(50).optional(),
      });

      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      let user = await storage.getUser(userId);
      if (!user) user = await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      if (parsed.data.username && parsed.data.username !== user.username) {
        const existing = await storage.getUserByUsername(parsed.data.username);
        if (existing) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      const updated = await storage.updateProfile(user.id, parsed.data);
      res.json({
        id: updated.id,
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        balance: updated.balance,
        totalWins: updated.totalWins,
        maxWin: updated.maxWin,
        streak: updated.streak,
        maxStreak: updated.maxStreak,
        gamesPlayed: updated.gamesPlayed,
        createdAt: updated.createdAt,
      });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get(api.ai.predict.path, async (req, res) => {
    res.json({ advice: "The stars align! The next 5 spins have a higher chance of hitting the Dragon symbol." });
  });

  return httpServer;
}
