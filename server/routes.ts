import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth/index";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup auth FIRST
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register audio and image routes
  registerAudioRoutes(app);
  registerImageRoutes(app);

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) {
        return res.status(400).json({ message: "Username exists" });
      }
      const user = await storage.createUser({ ...input, email: `${input.username}@example.com` });
      (req.session as any).userId = user.id;
      res.status(201).json(user);
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
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      (req.session as any).userId = user.id;
      res.status(200).json(user);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.game.state.path, async (req: any, res) => {
    try {
      let userId = (req.session as any).userId;
      
      // Fallback to Replit Auth if no session userId
      if (!userId && req.user && (req.user as any).claims) {
        userId = (req.user as any).claims.sub;
      }

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
      if (!userId && req.user && req.user.claims) {
        userId = req.user.claims.sub;
      }

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
      
      if (!isFreeSpin && user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
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

      const newBalance = isFreeSpin ? user.balance + winAmount : user.balance - input.betAmount + winAmount;
      const newFreeSpins = (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0) + freeSpinsAwarded;
      
      // Update streak tracking
      const newConsecutiveWins = winAmount > 0 ? (gameState?.consecutiveWins ?? 0) + 1 : 0;
      const newTotalWins = (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0);
      const newMaxWin = Math.max(user.maxWin ?? 0, winAmount);

      await storage.updateBalance(user.id, newBalance);
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
      let sessionUserId = (req.session as any)?.userId;
      if (!sessionUserId && req.user && (req.user as any).claims) {
        sessionUserId = (req.user as any).claims.sub;
      }
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
      if (!userId && req.user && (req.user as any).claims) {
        userId = (req.user as any).claims.sub;
      }
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
      if (!userId && req.user && (req.user as any).claims) {
        userId = (req.user as any).claims.sub;
      }
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

  app.get(api.ai.predict.path, async (req, res) => {
    res.json({ advice: "The stars align! The next 5 spins have a higher chance of hitting the Dragon symbol." });
  });

  return httpServer;
}
