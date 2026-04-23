import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- RNG ENGINE: WEIGHTED SYMBOLS ---
  function getWeightedSymbol(modifier: number = 1) {
    const symbols = SLOT_SYMBOLS as any[];
    // If modifier > 1, we artificially boost the weight of higher value symbols
    const totalWeight = symbols.reduce((sum, s) => {
      const weightBoost = (s.value > 100 && modifier > 1) ? s.weight * modifier : s.weight;
      return sum + weightBoost;
    }, 0);

    let random = Math.random() * totalWeight;
    for (const symbol of symbols) {
      const currentWeight = (symbol.value > 100 && modifier > 1) ? symbol.weight * modifier : symbol.weight;
      if (random < currentWeight) return symbol;
      random -= currentWeight;
    }
    return symbols[symbols.length - 1];
  }

  // --- AUTH: REGISTER ---
  app.post("/api/register", async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required", upstreamErrors: "" });
      }
      const existing = await (storage as any).getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already taken", upstreamErrors: "" });
      }
      const hashed = await bcrypt.hash(password, 10);
      const user = await (storage as any).createUser({ username, password: hashed });
      req.session.userId = user.id;
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Registration Error", upstreamErrors: "" });
    }
  });

  // --- AUTH: LOGIN & SESSION ---
  app.post(["/api/auth/login", "/api/login"], async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "User not found", upstreamErrors: "" });
      
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password", upstreamErrors: "" });

      req.session.userId = user.id;
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Login Error", upstreamErrors: "" });
    }
  });

  // --- GAME: SPIN (The Multiplier Engine) ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });

      const { betAmount } = req.body;
      const user = await (storage as any).getUser(userId);

      if (!user || user.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance", upstreamErrors: "" });
      }

      // Fetch Oracle state (Luck Modifier)
      const gameState = await (storage as any).getGameState(userId, "default");
      const luckMod = (gameState?.activeModifier ?? 100) / 100;

      // Generate 3x3 Grid
      const grid = [
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      // Calculate Wins based on Bet Multipliers
      (PAYLINES as any[]).forEach((line, idx) => {
        const s1 = grid[0][line[0]];
        const s2 = grid[1][line[1]];
        const s3 = grid[2][line[2]];

        if (s1 === s2 && s2 === s3) {
          const symbolDef = (SLOT_SYMBOLS as any[]).find(s => s.id === s1);
          if (symbolDef) {
            // The payout is: (Symbol Base Value / 10) * Total Bet
            // Example: Dragon (5000) with 1M bet = (500) * 1,000,000 = 50,000,000đ
            const lineWin = Math.floor((symbolDef.value / 10) * betAmount);
            winAmount += lineWin;
            winLines.push(idx);
          }
        }
      });

      // Update Database Atomics
      const updatedUser = await (storage as any).creditBalanceAtomic(user.id, winAmount - betAmount);

      // Update streak, totalWins, maxWin, gamesPlayed
      const isWin = winAmount > 0;
      const newStreak = isWin ? (user.streak ?? 0) + 1 : 0;
      const newMaxStreak = Math.max(user.maxStreak ?? 0, newStreak);
      const newTotalWins = (user.totalWins ?? 0) + (isWin ? 1 : 0);
      const newMaxWin = Math.max(user.maxWin ?? 0, winAmount);
      const newGamesPlayed = (user.gamesPlayed ?? 0) + 1;
      await (storage as any).updateStreak(userId, newStreak, newMaxStreak, newTotalWins, newMaxWin);
      
      // Consume Oracle luck
      if (luckMod > 1) {
        await (storage as any).updateGameState(userId, "default", { activeModifier: 100 });
      }

      // Sync Session & Respond
      req.session.save(() => {
        res.json({
          grid,
          winLines: winLines ?? [],
          winAmount: winAmount ?? 0,
          newBalance: updatedUser.balance,
          isJackpot: winAmount >= betAmount * 50,
          streak: newStreak,
          totalWins: newTotalWins,
          maxWin: newMaxWin,
          gamesPlayed: newGamesPlayed,
          freeSpinsAwarded: 0,
          totalFreeSpins: 0,
          upstreamErrors: "",
        });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server Error", upstreamErrors: "" });
    }
  });

  // --- GAME: ORACLE (LUCK INJECTION) ---
  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });

      const roll = Math.random();
      let modifier = 100;
      let message = "The spirits are indifferent.";
      let type = "neutral";

      if (roll > 0.8) {
        modifier = 300; // 3x Luck
        message = "🐉 THE GOLDEN DRAGON BLESSES YOUR NEXT SPIN!";
        type = "good";
      } else if (roll < 0.2) {
        modifier = 50; // Half luck
        message = "🌑 Shadows cloud your vision. Be careful.";
        type = "bad";
      }

      await (storage as any).updateGameState(userId, "default", { activeModifier: modifier });
      
      res.json({ message, type, upstreamErrors: "" });
    } catch (err) {
      res.status(500).json({ message: "Oracle is silent.", upstreamErrors: "" });
    }
  });

  // --- GAME: STATE (used by auth hook to check session) ---
  app.get("/api/game/state", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        balance: user.balance,
        streak: user.streak,
        maxStreak: user.maxStreak,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
        gameStates: [],
        upstreamErrors: "",
      });
    } catch (err) {
      res.status(500).json({ message: "State error", upstreamErrors: "" });
    }
  });

  // --- USER: PROFILE ---
  app.get("/api/user/profile", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const { password: _, ...safeUser } = user;
      res.setHeader("Cache-Control", "no-store");
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ message: "Profile error", upstreamErrors: "" });
    }
  });

  // --- AUTH: LOGOUT ---
  app.post("/api/logout", (req: any, res: any) => {
    req.session.destroy((err: any) => {
      if (err) return res.status(500).json({ message: "Logout failed", upstreamErrors: "" });
      res.clearCookie("dragon_session");
      res.json({ message: "Logged out", upstreamErrors: "" });
    });
  });

  // --- GAME: ACHIEVEMENTS ---
  app.get("/api/achievements/:userId", async (req: any, res: any) => {
    try {
      const achievements = await (storage as any).getAchievements(req.params.userId);
      res.json(achievements);
    } catch (err) {
      res.status(500).json({ message: "Achievements error", upstreamErrors: "" });
    }
  });

  // --- GAME: LEADERBOARD ---
  app.get("/api/game/leaderboard", async (req: any, res: any) => {
    try {
      const topUsers = await (storage as any).getTopUsers(10);
      res.json(topUsers);
    } catch (err) {
      res.status(500).json({ message: "Leaderboard error", upstreamErrors: "" });
    }
  });

  // --- DEPOSITS: GIFT CARD REDEMPTION ---
  app.post("/api/deposits/gift-card", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "Card code is required", upstreamErrors: "" });

      const result = await (storage as any).redeemGiftCardAtomic(code.trim().toUpperCase(), userId);
      if (!result) {
        return res.status(400).json({ message: "Invalid or already redeemed code", upstreamErrors: "" });
      }
      res.json({ amount: result.amount, newBalance: result.newBalance, upstreamErrors: "" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Redemption error", upstreamErrors: "" });
    }
  });

  // --- DEPOSITS: HISTORY ---
  app.get("/api/deposits/history", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const deposits = await (storage as any).getDeposits(userId);
      res.json(deposits);
    } catch (err) {
      res.status(500).json({ message: "Deposit history error", upstreamErrors: "" });
    }
  });

  // --- WITHDRAWALS: REQUEST ---
  app.post("/api/withdrawals/request", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const { amount, note } = req.body;
      if (!amount || amount < 10000) {
        return res.status(400).json({ message: "Minimum withdrawal is 10,000đ", upstreamErrors: "" });
      }
      const user = await (storage as any).getUser(userId);
      if (!user || user.balance < amount) {
        return res.status(400).json({ message: "Insufficient balance", upstreamErrors: "" });
      }
      // Deduct balance atomically
      await (storage as any).deductBalanceAtomic(userId, amount);
      const withdrawal = await (storage as any).createWithdrawal(userId, amount, note);
      res.json({ withdrawal, upstreamErrors: "" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Withdrawal error", upstreamErrors: "" });
    }
  });

  // --- WITHDRAWALS: HISTORY ---
  app.get("/api/withdrawals/history", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const withdrawals = await (storage as any).getWithdrawals(userId);
      res.json(withdrawals);
    } catch (err) {
      res.status(500).json({ message: "Withdrawal history error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: DASHBOARD STATS ---
  app.get("/api/admin/dashboard/stats", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });

      const allUsers = await (storage as any).getAllUsers();
      const allCards = await (storage as any).getAllGiftCards();
      const allWithdrawals = await (storage as any).getAllWithdrawals();

      res.json({
        totalUsers: allUsers.length,
        totalBalance: allUsers.reduce((sum: number, u: any) => sum + (u.balance ?? 0), 0),
        totalWins: allUsers.reduce((sum: number, u: any) => sum + (u.totalWins ?? 0), 0),
        totalGamesPlayed: allUsers.reduce((sum: number, u: any) => sum + (u.gamesPlayed ?? 0), 0),
        activeGiftCards: allCards.filter((c: any) => !c.isRedeemed).length,
        redeemedGiftCards: allCards.filter((c: any) => c.isRedeemed).length,
        pendingWithdrawals: allWithdrawals.filter((w: any) => w.status === "pending").length,
        totalWithdrawals: allWithdrawals.length,
        upstreamErrors: "",
      });
    } catch (err) {
      res.status(500).json({ message: "Stats error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: LIST USERS ---
  app.get("/api/admin/dashboard/users", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      const users = await (storage as any).getAllUsers();
      res.json(users);
    } catch (err) {
      res.status(500).json({ message: "Users error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: UPDATE USER ---
  app.patch("/api/admin/dashboard/users/:id", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });

      const { id } = req.params;
      const data = req.body;
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
      }
      const updated = await (storage as any).adminUpdateUser(id, data);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Update error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: DELETE USER ---
  app.delete("/api/admin/dashboard/users/:id", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      await (storage as any).adminDeleteUser(req.params.id);
      res.json({ success: true, upstreamErrors: "" });
    } catch (err) {
      res.status(500).json({ message: "Delete error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: LIST GIFT CARDS ---
  app.get("/api/admin/dashboard/gift-cards", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      const cards = await (storage as any).getAllGiftCards();
      res.json(cards);
    } catch (err) {
      res.status(500).json({ message: "Gift cards error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: CREATE GIFT CARD ---
  app.post("/api/admin/dashboard/gift-cards", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      const { code, denomination } = req.body;
      if (!code || !denomination) {
        return res.status(400).json({ message: "Code and denomination are required", upstreamErrors: "" });
      }
      const card = await (storage as any).createGiftCard(code.trim().toUpperCase(), denomination);
      res.status(201).json(card);
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "Gift card code already exists", upstreamErrors: "" });
      }
      res.status(500).json({ message: "Create gift card error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: DELETE GIFT CARD ---
  app.delete("/api/admin/dashboard/gift-cards/:id", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      await (storage as any).adminDeleteGiftCard(Number(req.params.id));
      res.json({ success: true, upstreamErrors: "" });
    } catch (err) {
      res.status(500).json({ message: "Delete gift card error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: LIST WITHDRAWALS ---
  app.get("/api/admin/dashboard/withdrawals", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      const withdrawals = await (storage as any).getAllWithdrawals();
      res.json(withdrawals);
    } catch (err) {
      res.status(500).json({ message: "Withdrawals error", upstreamErrors: "" });
    }
  });

  // --- ADMIN: UPDATE WITHDRAWAL STATUS ---
  app.patch("/api/admin/dashboard/withdrawals/:id", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", upstreamErrors: "" });
      const user = await (storage as any).getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden", upstreamErrors: "" });
      const { status } = req.body;
      const updated = await (storage as any).updateWithdrawalStatus(Number(req.params.id), status);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Update withdrawal error", upstreamErrors: "" });
    }
  });

  return httpServer;
}