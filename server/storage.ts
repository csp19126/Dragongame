import { db } from "./db";
import { users, gameStates, achievements, deposits, giftCards, type InsertUser, type User, type InsertGameState, type GameState, type Achievement, type Deposit, type GiftCard } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateBalance(userId: string, newBalance: number): Promise<User>;
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

  async updateBalance(userId: string, newBalance: number): Promise<User> {
    const [user] = await db.update(users).set({ balance: newBalance }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getGameState(userId: string, slotId: string): Promise<GameState | undefined> {
    const [state] = await db.select().from(gameStates).where(
      sql`${gameStates.userId} = ${userId} AND ${gameStates.slotId} = ${slotId}`
    );
    return state;
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
