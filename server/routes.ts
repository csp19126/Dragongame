import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";

// ─── SLOT MACHINE CONSTANTS ───────────────────────────────────────────────────

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];

// Symbol payout multipliers (higher = rarer = more valuable)
const SYMBOL_VALUES: Record<string, number> = {
  "🐉": 500,
  "🧧": 200,
  "🏮": 100,
  "💎": 75,
  "🪙": 50,
  "🎎": 30,
  "🌸": 20,
  "🏯": 15,
  "⚔️": 10,
  "📜": 5,
};

// Symbol weights — lower weight = rarer
const SYMBOL_WEIGHTS: Record<string, number> = {
  "🐉": 2,
  "🧧": 4,
  "🏮": 6,
  "💎": 8,
  "🪙": 14,
  "🎎": 16,
  "🌸": 18,
  "🏯": 20,
  "⚔️": 22,
  "📜": 24,
};

// 5 paylines on a 3-column × 3-row grid.
// Each entry is [col, row] for the 3 stops on that payline.
const PAYLINES: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0]], // top row
  [[0, 1], [1, 1], [2, 1]], // middle row
  [[0, 2], [1, 2], [2, 2]], // bottom row
  [[0, 0], [1, 1], [2, 2]], // diagonal ↘
  [[0, 2], [1, 1], [2, 0]], // diagonal ↗
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function weightedRandomSymbol(): string {
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;
  for (const sym of SYMBOLS) {
    rand -= SYMBOL_WEIGHTS[sym];
    if (rand <= 0) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

function generateGrid(): string[][] {
  // grid[col][row]
  return [
    [weightedRandomSymbol(), weightedRandomSymbol(), weightedRandomSymbol()],
    [weightedRandomSymbol(), weightedRandomSymbol(), weightedRandomSymbol()],
    [weightedRandomSymbol(), weightedRandomSymbol(), weightedRandomSymbol()],
  ];
}

interface PaylineResult {
  lineIndex: number;
  symbol: string;
  multiplier: number;
}

function detectWins(grid: string[][]): PaylineResult[] {
  const wins: PaylineResult[] = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const coords = PAYLINES[i];
    const symbols = coords.map(([col, row]) => grid[col][row]);
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      wins.push({
        lineIndex: i,
        symbol: symbols[0],
        multiplier: SYMBOL_VALUES[symbols[0]] ?? 5,
      });
    }
  }
  return wins;
}

// A "near miss" has 2 matching symbols on a payline but not 3
function isNearMiss(grid: string[][]): boolean {
  for (const coords of PAYLINES) {
    const symbols = coords.map(([col, row]) => grid[col][row]);
    if (
      (symbols[0] === symbols[1] && symbols[1] !== symbols[2]) ||
      (symbols[1] === symbols[2] && symbols[0] !== symbols[1])
    ) {
      return true;
    }
  }
  return false;
}

// Achievement definitions checked after each spin
const ACHIEVEMENT_CHECKS = [
  {
    id: "first_win",
    name: "First Win",
    description: "Won your first spin!",
    icon: "trophy",
    check: (totalWins: number) => totalWins === 1,
  },
  {
    id: "hot_streak_3",
    name: "Hot Streak x3",
    description: "3 consecutive wins!",
    icon: "flame",
    check: (_: number, streak: number) => streak >= 3,
  },
  {
    id: "lucky_seven",
    name: "Lucky Seven",
    description: "Won 7 times!",
    icon: "clover",
    check: (totalWins: number) => totalWins === 7,
  },
  {
    id: "high_roller",
    name: "High Roller",
    description: "Bet 100,000 or more!",
    icon: "gem",
    check: (_: number, __: number, bet: number) => bet >= 100000,
  },
  {
    id: "millionaire",
    name: "Millionaire",
    description: "Balance reached 1,000,000!",
    icon: "crown",
    check: (_: number, __: number, ___: number, balance: number) => balance >= 1000000,
  },
  {
    id: "jackpot_hunter",
    name: "Jackpot Hunter",
    description: "Hit a jackpot!",
    icon: "star",
    check: (_: number, __: number, ___: number, ____: number, isJackpot: boolean) => isJackpot,
  },
  {
    id: "dragon_master",
    name: "Dragon Master",
    description: "Win with 3 dragons!",
    icon: "dragon",
    check: (_: number, __: number, ___: number, ____: number, _____: boolean, symbol: string) => symbol === "🐉",
  },
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── AUTH ──────────────────────────────────────────────────────────────────

  // --- HELPER: UNIVERSAL LOGIN LOGIC ---
  const handleLogin = async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      
      if (!user) return res.status(401).json({ message: "User not found" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password" });

      (req.session as any).userId = user.id;
      req.session.save((err: any) => {
        if (err) return res.status(500).json({ message: "Session Error" });
        return res.json({
          id: user.id,
          username: user.username,
          balance: user.balance || 50000
        });
      });
    } catch (err) {
      res.status(500).json({ message: "Server Error" });
    }
  };

  // Listen on BOTH possible paths to ensure the frontend finds the door
  app.post("/api/auth/login", handleLogin);
  app.post("/api/login", handleLogin);

  // --- HELPER: UNIVERSAL REGISTER LOGIC ---
  const handleRegister = async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await (storage as any).createUser({ 
        username, 
        password: hashedPassword, 
        balance: 50000 
      });
      (req.session as any).userId = user.id;
      req.session.save(() => res.status(201).json(user));
    } catch (err) {
      res.status(500).json({ message: "Reg Error" });
    }
  };

  app.post("/api/auth/register", handleRegister);
  app.post("/api/register", handleRegister);

  // ─── GAME STATE ────────────────────────────────────────────────────────────

  app.get("/api/game/state", async (req: any, res: any) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const gameStates = await storage.getGameState(userId, "main");

      return res.json({
        balance: user.balance,
        gameStates: gameStates ? [gameStates] : [],
        streak: user.streak ?? 0,
        maxStreak: user.maxStreak ?? 0,
        totalWins: user.totalWins ?? 0,
        maxWin: user.maxWin ?? 0,
        gamesPlayed: user.gamesPlayed ?? 0,
      });
    } catch (err) {
      console.error("[/api/game/state]", err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  // ─── SPIN ──────────────────────────────────────────────────────────────────

  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { slotId = "main", betAmount } = req.body;
      const bet = parseInt(betAmount, 10);

      if (!bet || bet <= 0) {
        return res.status(400).json({ message: "Invalid bet amount" });
      }

      // Fetch current user and game state
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const gameState = await storage.getGameState(userId, slotId);
      const freeSpins = gameState?.freeSpins ?? 0;
      const activeModifier = gameState?.activeModifier ?? 100; // 100 = 1.0x

      // Check if player can afford the bet (free spins bypass this)
      if (freeSpins === 0 && user.balance < bet) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct bet atomically (skip if using a free spin)
      let updatedUser = user;
      if (freeSpins === 0) {
        const deducted = await storage.deductBalanceAtomic(userId, bet);
        if (!deducted) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
        updatedUser = deducted;
      }

      // ── Special event rolls ──────────────────────────────────────────────
      const rand = Math.random();
      const isFakeRepeater = rand < 0.04;   // 4% chance — fake re-spin teaser
      const isNearMissForced = !isFakeRepeater && rand < 0.12; // 8% near-miss
      const isBonusRound = rand > 0.97;     // 3% bonus round
      const freeSpinsAwarded = isBonusRound ? 3 : 0;

      // ── Generate the grid ────────────────────────────────────────────────
      let grid = generateGrid();

      // Force a near-miss: make 2 of 3 symbols on the middle row match
      if (isNearMissForced) {
        const sym = weightedRandomSymbol();
        grid[0][1] = sym;
        grid[1][1] = sym;
        // col 2 row 1 stays random (and must differ)
        while (grid[2][1] === sym) grid[2][1] = weightedRandomSymbol();
      }

      // ── Detect wins ──────────────────────────────────────────────────────
      const wins = detectWins(grid);
      const winLines = wins.map((w) => w.lineIndex);
      const nearMiss = wins.length === 0 && (isNearMissForced || isNearMiss(grid));

      // ── Calculate win amount ─────────────────────────────────────────────
      let winAmount = 0;
      let isJackpot = false;
      let multiplier = 1;
      let jackpotSymbol = "";

      if (wins.length > 0) {
        // Apply oracle modifier (stored as integer percentage, e.g. 200 = 2x)
        const oracleMult = activeModifier / 100;

        for (const win of wins) {
          winAmount += bet * win.multiplier;
        }

        // Multi-line bonus
        if (wins.length >= 3) winAmount = Math.round(winAmount * 1.5);
        if (wins.length >= 5) winAmount = Math.round(winAmount * 2);

        // Apply oracle multiplier
        winAmount = Math.round(winAmount * oracleMult);

        // Jackpot: all 5 paylines win, or dragon on middle row
        isJackpot = wins.length === 5 || wins.some((w) => w.symbol === "🐉" && w.lineIndex === 1);
        if (isJackpot) {
          winAmount = Math.round(winAmount * 3);
          multiplier = 3;
        }

        jackpotSymbol = wins[0]?.symbol ?? "";
      }

      // ── Repeater (free re-spin) ──────────────────────────────────────────
      // A real repeater triggers when the player wins on all 3 rows
      const isRepeater = wins.some((w) => w.lineIndex === 0) &&
                         wins.some((w) => w.lineIndex === 1) &&
                         wins.some((w) => w.lineIndex === 2);

      // ── Credit winnings ──────────────────────────────────────────────────
      if (winAmount > 0) {
        updatedUser = await storage.creditBalanceAtomic(userId, winAmount);
      }

      // ── Update streak & stats ────────────────────────────────────────────
      const didWin = winAmount > 0;
      const newStreak = didWin ? (user.streak ?? 0) + 1 : 0;
      const newTotalWins = didWin ? (user.totalWins ?? 0) + 1 : (user.totalWins ?? 0);
      const newMaxWin = Math.max(user.maxWin ?? 0, winAmount);
      const newMaxStreak = Math.max(user.maxStreak ?? 0, newStreak);

      const finalUser = await storage.updateStreak(
        userId,
        newStreak,
        newMaxStreak,
        newTotalWins,
        newMaxWin
      );

      // ── Update game state ────────────────────────────────────────────────
      const newFreeSpins = Math.max(0, freeSpins - (freeSpins > 0 ? 1 : 0)) + freeSpinsAwarded;
      await storage.updateGameState(userId, slotId, {
        lastReels: grid.map((col) => col.join(",")).join("|"),
        lastSpinResult: didWin ? "win" : "loss",
        freeSpins: newFreeSpins,
        consecutiveWins: newStreak,
        // Reset oracle modifier after it's been consumed
        activeModifier: didWin ? 100 : activeModifier,
      });

      // ── Check & unlock achievements ──────────────────────────────────────
      const newAchievements: any[] = [];
      for (const ach of ACHIEVEMENT_CHECKS) {
        const unlocked = await storage.unlockAchievement(
          userId,
          ach.id,
          ach.name,
          ach.description,
          ach.icon
        );
        if (unlocked) {
          // Only include if the condition is actually met
          const conditionMet = ach.check(
            newTotalWins,
            newStreak,
            bet,
            finalUser.balance,
            isJackpot,
            jackpotSymbol
          );
          if (conditionMet) {
            newAchievements.push(unlocked);
          }
        }
      }

      return res.json({
        grid,
        winLines,
        winAmount,
        newBalance: finalUser.balance,
        freeSpinsAwarded,
        totalFreeSpins: newFreeSpins,
        isJackpot,
        isBonusRound,
        isRepeater,
        isFakeRepeater,
        isNearMiss: nearMiss,
        multiplier,
        streak: finalUser.streak,
        totalWins: finalUser.totalWins,
        maxWin: finalUser.maxWin,
        gamesPlayed: finalUser.gamesPlayed,
        newAchievements,
      });
    } catch (err) {
      console.error("[/api/game/spin]", err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  // ─── LEADERBOARD ───────────────────────────────────────────────────────────

  app.get("/api/game/leaderboard", async (_req: any, res: any) => {
    try {
      const users = await storage.getLeaderboard();
      const leaderboard = users.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        balance: user.balance,
        totalWins: user.totalWins ?? 0,
        maxWin: user.maxWin ?? 0,
        maxStreak: user.maxStreak ?? 0,
      }));
      return res.json(leaderboard);
    } catch (err) {
      console.error("[/api/game/leaderboard]", err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  // ─── ACHIEVEMENTS ──────────────────────────────────────────────────────────

  app.get("/api/achievements/:userId", async (req: any, res: any) => {
    try {
      const { userId } = req.params;
      if (!userId) return res.status(400).json({ message: "Missing userId" });

      const achievements = await storage.getAchievements(userId);
      return res.json(achievements);
    } catch (err) {
      console.error("[/api/achievements/:userId]", err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  // ─── ORACLE ────────────────────────────────────────────────────────────────

  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const result = await storage.consultOracle(userId);
      return res.json(result);
    } catch (err) {
      console.error("[/api/game/oracle]", err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  return httpServer;
}