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
      const result = [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ];

      let winAmount = 0;
      let isJackpot = false;
      let freeSpinsAwarded = 0;
      let isBonusRound = false;
      let multiplier = 1;
      let isRepeater = false;

      // Enhanced RTP system with multipliers and repeaters
      const allMatch = result[0] === result[1] && result[1] === result[2];
      const twoMatch = result[0] === result[1] || result[1] === result[2] || result[0] === result[2];

      if (allMatch) {
        // JACKPOT: 3 matching symbols
        winAmount = input.betAmount * 50;
        isJackpot = true;
        freeSpinsAwarded = 15;
        
        // 30% chance for bonus round on jackpot
        if (Math.random() < 0.3) {
          isBonusRound = true;
          winAmount *= 2; // 2x multiplier in bonus
        }

        // 20% chance for repeater (re-spin with same symbols)
        if (Math.random() < 0.2) {
          isRepeater = true;
          winAmount *= 2;
        }
      } else if (twoMatch) {
        // BASE WIN: 2 matching symbols
        const baseWin = input.betAmount * 5;
        
        // Dynamic multiplier based on symbol rarity
        if (result[0] === "🐉" || result[1] === "🐉" || result[2] === "🐉") {
          multiplier = 3;
        } else if (result[0] === "💎" || result[1] === "💎" || result[2] === "💎") {
          multiplier = 2.5;
        }
        
        winAmount = Math.floor(baseWin * multiplier);
        
        // 25% chance for free spins
        if (Math.random() < 0.25) {
          freeSpinsAwarded = 8;
        }
        
        // 15% chance for bonus round
        if (Math.random() < 0.15) {
          isBonusRound = true;
          freeSpinsAwarded += 5;
        }
      }

      // Wild multiplier chance (5%)
      if (Math.random() < 0.05) {
        const wildMultipliers = [2, 5, 10];
        const wildMult = wildMultipliers[Math.floor(Math.random() * wildMultipliers.length)];
        winAmount *= wildMult;
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
      if (allMatch && result[0] === "🐉") {
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
        result,
        winAmount,
        newBalance,
        freeSpinsAwarded,
        totalFreeSpins: newFreeSpins,
        isJackpot,
        isBonusRound,
        isRepeater,
        multiplier: multiplier > 1 ? multiplier : undefined,
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
