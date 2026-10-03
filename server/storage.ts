import { db } from "./db";
import {
  users, gameStates, achievements, deposits, giftCards,
  type User, type GameState, type Achievement, type Deposit, type GiftCard,
  STARTING_BALANCE, DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_MS, ORACLE_COOLDOWN_MS,
} from "@shared/schema";
import { eq, desc, sql, and, or, isNull, lt, count, sum } from "drizzle-orm";
import { spin as runSpin, type SpinOutcome } from "./game";

export const SLOT_ID = "main";

const ACHIEVEMENTS = {
  first_win: { name: "First Win", description: "Won your first spin!", icon: "star" },
  hot_streak_3: { name: "Hot Streak", description: "3 wins in a row!", icon: "flame" },
  hot_streak_5: { name: "On Fire", description: "5 wins in a row!", icon: "zap" },
  dragon_master: { name: "Dragon Master", description: "Three dragons on a line!", icon: "crown" },
  high_roller: { name: "High Roller", description: "Bet 100,000 or more!", icon: "gem" },
  millionaire: { name: "Millionaire", description: "Balance reached 1,000,000!", icon: "trophy" },
  jackpot_hunter: { name: "Jackpot Hunter", description: "Won 50x your bet in one spin!", icon: "target" },
  lucky_seven: { name: "Lucky Seven", description: "Won 7 times!", icon: "gift" },
} as const;
type BadgeId = keyof typeof ACHIEVEMENTS;

export interface SpinResult extends SpinOutcome {
  bet: number;
  isFreeSpin: boolean;
  blessed: boolean;
  newBalance: number;
  totalFreeSpins: number;
  streak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

export type SpinError = { error: "insufficient_balance" | "no_user" };

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  }

  async createUser(data: { username: string; password: string }): Promise<User> {
    const [user] = await db.insert(users).values({
      username: data.username,
      password: data.password,
      balance: STARTING_BALANCE,
    }).returning();
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateProfile(userId: string, data: { username?: string; firstName?: string; lastName?: string }): Promise<User> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getGameState(userId: string): Promise<GameState | undefined> {
    const [state] = await db.select().from(gameStates)
      .where(and(eq(gameStates.userId, userId), eq(gameStates.slotId, SLOT_ID)))
      .orderBy(gameStates.id).limit(1);
    return state;
  }

  private async ensureGameState(userId: string): Promise<GameState> {
    const existing = await this.getGameState(userId);
    if (existing) return existing;
    const [created] = await db.insert(gameStates).values({ userId, slotId: SLOT_ID }).returning();
    return created;
  }

  /**
   * One spin, all-or-nothing. The stake is taken (or a free spin consumed) with a
   * conditional UPDATE so two simultaneous requests can never both spend the same
   * balance, and the whole thing runs in a transaction so a crash can't take a
   * stake without paying the win.
   */
  async spin(userId: string, requestedBet: number): Promise<SpinResult | SpinError> {
    const state = await this.ensureGameState(userId);

    return db.transaction(async (tx) => {
      // 1. Pay for the spin: free spin first, otherwise stake from balance
      let isFreeSpin = false;
      let bet = requestedBet;
      const [usedFree] = await tx.update(gameStates)
        .set({ freeSpins: sql`${gameStates.freeSpins} - 1` })
        .where(and(eq(gameStates.id, state.id), sql`${gameStates.freeSpins} > 0`))
        .returning();
      if (usedFree) {
        isFreeSpin = true;
        bet = usedFree.freeSpinBet || requestedBet;
      } else {
        const [paid] = await tx.update(users)
          .set({ balance: sql`${users.balance} - ${bet}` })
          .where(and(eq(users.id, userId), sql`${users.balance} >= ${bet}`))
          .returning({ id: users.id });
        if (!paid) return { error: "insufficient_balance" } as SpinError;
      }

      // 2. Consume the oracle blessing, if one is waiting
      const [blessing] = await tx.update(gameStates)
        .set({ activeModifier: 100 })
        .where(and(eq(gameStates.id, state.id), sql`${gameStates.activeModifier} > 100`))
        .returning({ id: gameStates.id });
      const blessed = !!blessing;

      // 3. Spin
      const outcome = runSpin(bet, { blessed });
      // A "win" means the spin actually made a profit; getting your stake back isn't a win
      const won = outcome.winAmount > bet;

      // 4. Free spins: awarded spins are locked to the bet that won them
      const [gs] = await tx.update(gameStates).set({
        freeSpins: sql`${gameStates.freeSpins} + ${outcome.freeSpinsAwarded}`,
        ...(outcome.freeSpinsAwarded > 0 ? { freeSpinBet: bet } : {}),
        consecutiveWins: won ? sql`${gameStates.consecutiveWins} + 1` : 0,
        updatedAt: new Date(),
      }).where(eq(gameStates.id, state.id)).returning();

      // 5. Pay out and update stats in one statement
      const [user] = await tx.update(users).set({
        balance: sql`${users.balance} + ${outcome.winAmount}`,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
        totalWins: won ? sql`${users.totalWins} + 1` : users.totalWins,
        streak: won ? sql`${users.streak} + 1` : 0,
        maxStreak: won ? sql`greatest(${users.maxStreak}, ${users.streak} + 1)` : users.maxStreak,
        maxWin: sql`greatest(${users.maxWin}, ${outcome.winAmount})`,
      }).where(eq(users.id, userId)).returning();
      if (!user) throw new Error("User vanished mid-spin");

      // 6. Achievements
      const earned: BadgeId[] = [];
      if (won) earned.push("first_win");
      if (user.streak >= 3) earned.push("hot_streak_3");
      if (user.streak >= 5) earned.push("hot_streak_5");
      if (outcome.dragonLine) earned.push("dragon_master");
      if (bet >= 100000 && !isFreeSpin) earned.push("high_roller");
      if (user.balance >= 1_000_000) earned.push("millionaire");
      if (outcome.winAmount >= bet * 50) earned.push("jackpot_hunter");
      if (user.totalWins >= 7) earned.push("lucky_seven");

      const newAchievements: Achievement[] = [];
      if (earned.length) {
        const have = new Set((await tx.select({ b: achievements.badgeId }).from(achievements)
          .where(eq(achievements.userId, userId))).map((r) => r.b));
        for (const id of earned.filter((b) => !have.has(b))) {
          const def = ACHIEVEMENTS[id];
          const [a] = await tx.insert(achievements).values({
            userId, badgeId: id, badgeName: def.name, description: def.description, icon: def.icon,
          }).returning();
          newAchievements.push(a);
        }
      }

      return {
        ...outcome,
        bet,
        isFreeSpin,
        blessed,
        newBalance: user.balance,
        totalFreeSpins: gs.freeSpins ?? 0,
        streak: user.streak,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
        newAchievements,
      };
    });
  }

  /** Returns the time the oracle can next be used, or null if the blessing was granted now. */
  async consultOracle(userId: string): Promise<{ granted: boolean; nextAvailableAt: Date }> {
    const state = await this.ensureGameState(userId);
    const cutoff = new Date(Date.now() - ORACLE_COOLDOWN_MS);
    const [updated] = await db.update(gameStates)
      .set({ activeModifier: 200, lastOracleAt: new Date() })
      .where(and(eq(gameStates.id, state.id), or(isNull(gameStates.lastOracleAt), lt(gameStates.lastOracleAt, cutoff))))
      .returning();
    const last = updated?.lastOracleAt ?? state.lastOracleAt ?? new Date();
    return { granted: !!updated, nextAvailableAt: new Date(last.getTime() + ORACLE_COOLDOWN_MS) };
  }

  async claimDailyBonus(userId: string): Promise<{ granted: boolean; balance: number; nextAvailableAt: Date }> {
    const cutoff = new Date(Date.now() - DAILY_BONUS_COOLDOWN_MS);
    return db.transaction(async (tx) => {
      const [u] = await tx.update(users).set({
        balance: sql`${users.balance} + ${DAILY_BONUS_AMOUNT}`,
        lastDailyBonusAt: new Date(),
      }).where(and(eq(users.id, userId), or(isNull(users.lastDailyBonusAt), lt(users.lastDailyBonusAt, cutoff))))
        .returning();
      if (u) {
        await tx.insert(deposits).values({ userId, amount: DAILY_BONUS_AMOUNT, method: "daily_bonus" });
        return { granted: true, balance: u.balance, nextAvailableAt: new Date(Date.now() + DAILY_BONUS_COOLDOWN_MS) };
      }
      const [cur] = await tx.select().from(users).where(eq(users.id, userId));
      const last = cur?.lastDailyBonusAt ?? new Date();
      return { granted: false, balance: cur?.balance ?? 0, nextAvailableAt: new Date(last.getTime() + DAILY_BONUS_COOLDOWN_MS) };
    });
  }

  async getLeaderboard(limit = 10): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.balance)).limit(limit);
  }

  async getAchievements(userId: string): Promise<Achievement[]> {
    return db.select().from(achievements).where(eq(achievements.userId, userId));
  }

  async getCredits(userId: string): Promise<Deposit[]> {
    return db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt)).limit(50);
  }

  async redeemPromoCode(code: string, userId: string): Promise<{ amount: number; newBalance: number } | null> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx.update(giftCards)
        .set({ isRedeemed: true, redeemedBy: userId, redeemedAt: new Date() })
        .where(and(eq(giftCards.code, code), eq(giftCards.isRedeemed, false)))
        .returning();
      if (!claimed) return null;
      const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${claimed.denomination}` })
        .where(eq(users.id, userId)).returning();
      await tx.insert(deposits).values({ userId, amount: claimed.denomination, method: "promo_code", cardCode: code });
      return { amount: claimed.denomination, newBalance: u.balance };
    });
  }

  // ---- Admin ----

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.balance));
  }

  async adminUpdateUser(userId: string, data: Partial<Pick<User, "balance" | "username" | "firstName" | "lastName" | "password">>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async adminDeleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(achievements).where(eq(achievements.userId, userId));
      await tx.delete(gameStates).where(eq(gameStates.userId, userId));
      await tx.delete(deposits).where(eq(deposits.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  async getAllPromoCodes(): Promise<GiftCard[]> {
    return db.select().from(giftCards).orderBy(desc(giftCards.createdAt));
  }

  async createPromoCode(code: string, denomination: number): Promise<GiftCard> {
    const [card] = await db.insert(giftCards).values({ code, denomination }).returning();
    return card;
  }

  async deletePromoCode(id: number): Promise<void> {
    await db.delete(giftCards).where(eq(giftCards.id, id));
  }

  async getAdminStats() {
    const [u] = await db.select({
      totalUsers: count(),
      totalBalance: sum(users.balance),
      totalWins: sum(users.totalWins),
      totalGamesPlayed: sum(users.gamesPlayed),
    }).from(users);
    const [active] = await db.select({ n: count() }).from(giftCards).where(eq(giftCards.isRedeemed, false));
    const [redeemed] = await db.select({ n: count() }).from(giftCards).where(eq(giftCards.isRedeemed, true));
    return {
      totalUsers: u.totalUsers,
      totalBalance: Number(u.totalBalance ?? 0),
      totalWins: Number(u.totalWins ?? 0),
      totalGamesPlayed: Number(u.totalGamesPlayed ?? 0),
      activePromoCodes: active.n,
      redeemedPromoCodes: redeemed.n,
    };
  }

  /** Grants admin to the usernames listed in the ADMIN_USERNAMES env var (comma separated). */
  async syncAdmins(usernames: string[]): Promise<void> {
    for (const name of usernames) {
      const u = await this.getUserByUsername(name);
      if (u && !u.isAdmin) {
        await db.update(users).set({ isAdmin: true }).where(eq(users.id, u.id));
        console.log(`[startup] granted admin to "${u.username}"`);
      } else if (!u) {
        console.warn(`[startup] ADMIN_USERNAMES lists "${name}" but no such user exists yet`);
      }
    }
  }
}

export const storage = new DatabaseStorage();
