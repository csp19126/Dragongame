import { db } from "./db";
import { users, gameStates, type InsertUser, type User, type InsertGameState, type GameState } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateBalance(userId: number, newBalance: number): Promise<User>;
  getGameState(userId: number, slotId: string): Promise<GameState | undefined>;
  updateGameState(userId: number, slotId: string, state: Partial<InsertGameState>): Promise<GameState>;
  getLeaderboard(): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
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

  async updateBalance(userId: number, newBalance: number): Promise<User> {
    const [user] = await db.update(users).set({ balance: newBalance }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getGameState(userId: number, slotId: string): Promise<GameState | undefined> {
    const [state] = await db.select().from(gameStates).where(eq(gameStates.userId, userId));
    return state;
  }

  async updateGameState(userId: number, slotId: string, state: Partial<InsertGameState>): Promise<GameState> {
    const existing = await this.getGameState(userId, slotId);
    if (existing) {
      const [updated] = await db.update(gameStates).set(state).where(eq(gameStates.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(gameStates).values({ userId, slotId, ...state } as InsertGameState).returning();
      return created;
    }
  }

  async getLeaderboard(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.balance)).limit(10);
  }
}

export const storage = new DatabaseStorage();
