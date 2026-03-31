import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  registerAudioRoutes(app);
  registerImageRoutes(app);

  // POST /api/login — validate credentials and establish session
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        return res.json({
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
        });
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/register — create a new account and establish session
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashedPassword });

      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        return res.status(201).json({
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
        });
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/logout — destroy session
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  // GET /api/user/profile — return the authenticated user's profile
  app.get("/api/user/profile", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(String(userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

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
      res.status(500).json({ message: "Server error" });
    }
  });

  // PATCH /api/user/profile — update the authenticated user's profile
  app.patch("/api/user/profile", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { username, firstName, lastName } = req.body;
      const updated = await storage.updateProfile(String(userId), { username, firstName, lastName });
      res.json(updated);
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/game/state — return the authenticated user's game state
  app.get(api.game.state.path, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(String(userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        balance: user.balance,
        gameStates: [],
        streak: user.streak,
        maxStreak: user.maxStreak,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
      });
    } catch (err) {
      console.error("Game state error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/game/spin — process a spin for the authenticated user
  app.post(api.game.spin.path, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(String(userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, symbol: "🐉", win: 100 });
    } catch (err) {
      console.error("Spin error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return httpServer;
}
