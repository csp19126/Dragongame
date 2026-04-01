import { db } from "./db";
import { users, gameStates, achievements, deposits, giftCards, withdrawals, type InsertUser, type User, type InsertGameState, type GameState, type Achievement, type Deposit, type GiftCard, type Withdrawal } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateProfile(userId: string, data: { username?: string; firstName?: string; lastName?: string }): Promise<User>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  updateBalance(userId: string, newBalance: number): Promise<User>;
  deductBalanceAtomic(userId: string, amount: number): Promise<User | null>;
  creditBalanceAtomic(userId: string, amount: number): Promise<User>;
  updateStreak(userId: string, streak: number, maxStreak: number, totalWins: number, maxWin: number): Promise<User>;
  getGameState(userId: string, slotId: string): Promise<GameState | undefined>;
  updateGameState(userId: string, slotId: string, state: Partial<InsertGameState>): Promise<GameState>;
  getLeaderboard(): Promise<User[]>;
  getAchievements(userId: string): Promise<Achievement[]>;
  unlockAchievement(userId: string, badgeId: string, badgeName: string, description: string, icon: string): Promise<Achievement | null>;
  createDeposit(userId: string, amount: number, method: string, cardCode?: string): Promise<Deposit>;
  getDeposits(userId: string): Promise<Deposit[]>;
  getGiftCard(code: string): Promise<GiftCard | undefined>;
  redeemGiftCard(code: string, userId: string): Promise<GiftCard>;
  redeemGiftCardAtomic(code: string, userId: string): Promise<{ amount: number; newBalance: number } | null>;
  createGiftCard(code: string, denomination: number): Promise<GiftCard>;
  createWithdrawal(userId: string, amount: number, note?: string): Promise<Withdrawal>;
  getWithdrawals(userId: string): Promise<Withdrawal[]>;
  getAllUsers(): Promise<User[]>;
  updateActiveModifier(userId: string, modifier: number): Promise<void>;
  consultOracle(userId: string): Promise<{ message: string; type: "good" | "bad" | "neutral" }>;
  adminUpdateUser(userId: string, data: { balance?: number; username?: string; firstName?: string; lastName?: string; password?: string }): Promise<User>;
  adminDeleteUser(userId: string): Promise<void>;
  getAllGiftCards(): Promise<GiftCard[]>;
  adminDeleteGiftCard(id: number): Promise<void>;
  getAllWithdrawals(): Promise<Withdrawal[]>;
  updateWithdrawalStatus(id: number, status: string): Promise<Withdrawal>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  async updateProfile(userId: string, data: { username?: string; firstName?: string; lastName?: string }): Promise<User> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.username !== undefined) updateData.username = data.username;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    const [user] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return user;
  }

  async updateBalance(userId: string, newBalance: number): Promise<User> {
    const [user] = await db.update(users).set({ balance: newBalance }).where(eq(users.id, userId)).returning();
    return user;
  }

  async deductBalanceAtomic(userId: string, amount: number): Promise<User | null> {
    const [user] = await db.update(users).set({
      balance: sql`${users.balance} - ${amount}`,
    }).where(
      and(eq(users.id, userId), sql`${users.balance} >= ${amount}`)
    ).returning();
    return user || null;
  }

  async creditBalanceAtomic(userId: string, amount: number): Promise<User> {
    const [user] = await db.update(users).set({
      balance: sql`${users.balance} + ${amount}`,
    }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getGameState(userId: string, slotId: string): Promise<GameState | undefined> {
    const [state] = await db.select().from(gameStates).where(
      sql`${gameStates.userId} = ${userId} AND ${gameStates.slotId} = ${slotId}`
    );
    return state;
  }

  async updateActiveModifier(userId: string, modifier: number): Promise<void> {
    await db.update(gameStates)
      .set({ activeModifier: modifier, updatedAt: new Date() })
      .where(eq(gameStates.userId, userId));
  }

  async consultOracle(userId: string): Promise<{ message: string; type: "good" | "bad" | "neutral" }> {
    const outcomes = [
      { text: "The Great Dragon breathes fire! (2x Multiplier)", mod: 200, type: "good" },
      { text: "A Golden Lotus blooms. (1.5x Multiplier)", mod: 150, type: "good" },
      { text: "The spirits are silent. (No change)", mod: 100, type: "neutral" },
      { text: "A storm approaches. (0.5x Multiplier)", mod: 50, type: "bad" },
      { text: "The Dragon is sleeping. (0.2x Multiplier)", mod: 20, type: "bad" }
    ];

    // Pick a random outcome
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];

    // We check if the user has a game state record first
    const existing = await db.select().from(gameStates).where(eq(gameStates.userId, userId));
    
    if (existing.length > 0) {
      await db.update(gameStates)
        .set({ activeModifier: result.mod, updatedAt: new Date() })
        .where(eq(gameStates.userId, userId));
    } else {
      // If they've never played, create a basic state for them with the modifier
      await db.insert(gameStates).values({
        userId,
        slotId: "default",
        activeModifier: result.mod
      } as any);
    }

    return { message: result.text, type: result.type as "good" | "bad" | "neutral" };
  }

  async updateGameState(userId: string, slotId: string, state: Partial<InsertGameState>): Promise<GameState> {
    const existing = await this.getGameState(userId, slotId);
    if (existing) {
      const [updated] = await db.update(gameStates).set(state).where(eq(gameStates.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(gameStates).values({ userId, slotId, ...state } as any).returning();
      return created;
    }
  }

  async getLeaderboard(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.balance)).limit(10);
  }

  async updateStreak(userId: string, streak: number, maxStreak: number, totalWins: number, maxWin: number): Promise<User> {
    const [user] = await db.update(users).set({ 
      streak,
      maxStreak: Math.max(maxStreak, streak),
      totalWins,
      maxWin,
      gamesPlayed: sql`${users.gamesPlayed} + 1`
    }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getAchievements(userId: string): Promise<Achievement[]> {
    return await db.select().from(achievements).where(eq(achievements.userId, userId));
  }

  async unlockAchievement(userId: string, badgeId: string, badgeName: string, description: string, icon: string): Promise<Achievement | null> {
    const [existing] = await db.select().from(achievements).where(
      and(eq(achievements.userId, userId), eq(achievements.badgeId, badgeId))
    );
    if (existing) return null;
    const [achievement] = await db.insert(achievements).values({
      userId,
      badgeId,
      badgeName,
      description,
      icon,
    }).returning();
    return achievement;
  }

  async createDeposit(userId: string, amount: number, method: string, cardCode?: string): Promise<Deposit> {
    const [deposit] = await db.insert(deposits).values({ userId, amount, method, cardCode, status: "completed" }).returning();
    return deposit;
  }

  async getDeposits(userId: string): Promise<Deposit[]> {
    return await db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt));
  }

  async getGiftCard(code: string): Promise<GiftCard | undefined> {
    const [card] = await db.select().from(giftCards).where(eq(giftCards.code, code));
    return card;
  }

  async redeemGiftCard(code: string, userId: string): Promise<GiftCard> {
    const [card] = await db.update(giftCards).set({
      isRedeemed: true,
      redeemedBy: userId,
      redeemedAt: new Date(),
    }).where(eq(giftCards.code, code)).returning();
    return card;
  }

  async redeemGiftCardAtomic(code: string, userId: string): Promise<{ amount: number; newBalance: number } | null> {
    const [claimed] = await db.update(giftCards).set({
      isRedeemed: true,
      redeemedBy: userId,
      redeemedAt: new Date(),
    }).where(
      and(eq(giftCards.code, code), eq(giftCards.isRedeemed, false))
    ).returning();

    if (!claimed) return null;

    const [updatedUser] = await db.update(users).set({
      balance: sql`${users.balance} + ${claimed.denomination}`,
    }).where(eq(users.id, userId)).returning();

    await db.insert(deposits).values({
      userId,
      amount: claimed.denomination,
      method: "gift_card",
      cardCode: code,
      status: "completed",
    });

    return { amount: claimed.denomination, newBalance: updatedUser.balance };
  }

  async createGiftCard(code: string, denomination: number): Promise<GiftCard> {
    const [card] = await db.insert(giftCards).values({ code, denomination }).returning();
    return card;
  }

  async createWithdrawal(userId: string, amount: number, note?: string): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values({
      userId,
      amount,
      status: "pending",
      note: note || null,
    }).returning();
    return withdrawal;
  }

  async getWithdrawals(userId: string): Promise<Withdrawal[]> {
    return await db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.balance));
  }

  async adminUpdateUser(userId: string, data: { balance?: number; username?: string; firstName?: string; lastName?: string; password?: string }): Promise<User> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async adminDeleteUser(userId: string): Promise<void> {
    await db.delete(achievements).where(eq(achievements.userId, userId));
    await db.delete(gameStates).where(eq(gameStates.userId, userId));
    await db.delete(deposits).where(eq(deposits.userId, userId));
    await db.delete(withdrawals).where(eq(withdrawals.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async getAllGiftCards(): Promise<GiftCard[]> {
    return await db.select().from(giftCards).orderBy(desc(giftCards.createdAt));
  }

  async adminDeleteGiftCard(id: number): Promise<void> {
    await db.delete(giftCards).where(eq(giftCards.id, id));
  }

  async getAllWithdrawals(): Promise<Withdrawal[]> {
    return await db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
  }

  async updateWithdrawalStatus(id: number, status: string): Promise<Withdrawal> {
    const [updated] = await db.update(withdrawals).set({ status, updatedAt: new Date() }).where(eq(withdrawals.id, id)).returning();
    return updated;
  }

  async seedVIPBalances(): Promise<void> {
    const adminPasswordHash = await bcrypt.hash("4444", 10);

    const vipProfiles = [
      {
        userId: "55109529",
        profile: {
          username: "The Boss",
          firstName: "Chris",
          lastName: "hannah",
          email: "csp19126@gmail.com",
          balance: 432966077,
          totalWins: 218,
          maxWin: 100000000,
          maxStreak: 4,
          gamesPlayed: 1054,
        },
        minBalance: 300000000,
        achievements: [
          { badgeId: "high_roller", badgeName: "High Roller", description: "Bet 100,000 or more!", icon: "gem" },
          { badgeId: "millionaire", badgeName: "Millionaire", description: "Balance reached 1,000,000!", icon: "crown" },
          { badgeId: "first_win", badgeName: "First Win", description: "Won your first spin!", icon: "trophy" },
          { badgeId: "hot_streak_3", badgeName: "Hot Streak x3", description: "3 consecutive wins!", icon: "flame" },
          { badgeId: "lucky_seven", badgeName: "Lucky Seven", description: "Won 7 times!", icon: "clover" },
          { badgeId: "jackpot_hunter", badgeName: "Jackpot Hunter", description: "Hit a jackpot!", icon: "star" },
          { badgeId: "dragon_master", badgeName: "Dragon Master", description: "Win with 3 dragons!", icon: "dragon" },
        ],
      },
    ];

    for (const vip of vipProfiles) {
      const existing = await db.select().from(users).where(eq(users.id, vip.userId));
      if (existing.length === 0) {
        await db.insert(users).values({ id: vip.userId, password: adminPasswordHash, ...vip.profile });
        console.log(`[VIP Seed] Created profile for ${vip.userId}`);
      } else {
        const updates: Record<string, any> = {
          totalWins: vip.profile.totalWins,
          maxWin: vip.profile.maxWin,
          maxStreak: vip.profile.maxStreak,
          gamesPlayed: vip.profile.gamesPlayed,
          password: adminPasswordHash,
        };
        if ((existing[0].balance ?? 0) < vip.minBalance) {
          updates.balance = vip.profile.balance;
          console.log(`[VIP Seed] Topped up balance for ${vip.userId} to ${vip.profile.balance}`);
        }
        await db.update(users).set(updates).where(eq(users.id, vip.userId));
        console.log(`[VIP Seed] Restored game stats for ${vip.userId}`);
      }

      for (const ach of vip.achievements) {
        const existingAch = await db.select().from(achievements)
          .where(and(eq(achievements.userId, vip.userId), eq(achievements.badgeId, ach.badgeId)));
        if (existingAch.length === 0) {
          await db.insert(achievements).values({ userId: vip.userId, ...ach });
          console.log(`[VIP Seed] Unlocked achievement ${ach.badgeId} for ${vip.userId}`);
        }
      }
    }
  }

  async seedGiftCards(): Promise<void> {
    const defaultCards = [
      { code: "DRAGON-50K-2024", denomination: 50000 },
      { code: "FORTUNE-100K-888", denomination: 100000 },
      { code: "LUCKY-500K-VIP", denomination: 500000 },
      { code: "PHOENIX-1M-GOLD", denomination: 1000000 },
      { code: "EMPEROR-5M-PLAT", denomination: 5000000 },
      { code: "DRAGON-10M-ULTRA", denomination: 10000000 },
      { code: "WELCOME-50K-NEW", denomination: 50000 },
      { code: "VIP-100K-2024", denomination: 100000 },
      { code: "SUSU-10M-VIP", denomination: 10000000 },
      { code: "SUSU-85M-DRAGON", denomination: 85000000 },
    ];
    for (const card of defaultCards) {
      const existing = await db.select().from(giftCards).where(eq(giftCards.code, card.code));
      if (existing.length === 0) {
        await db.insert(giftCards).values(card);
      }
    }
  }
}

export const storage = new DatabaseStorage();
