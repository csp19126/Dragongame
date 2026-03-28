import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";
import { setupAuth } from "./replit_integrations/auth";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
// Setup auth FIRST
  // await setupAuth(app);
  // registerAuthRoutes(app);
  // FORCE THE APP TO THINK YOU ARE LOGGED IN AS ADMIN
  app.use((req, res, next) => {
    (req.session as any).userId = "55109529";
    next();
  });

  app.get(api.game.state.path, async (req: any, res) => {
    try {
      const user = await storage.getUser("55109529");
      if (!user) return res.status(401).json({ message: "User not found" });
      res.json({ 
        balance: user.balance, 
        gameStates: [], 
        streak: user.streak ?? 0,
        totalWins: user.totalWins ?? 0,
        gamesPlayed: user.gamesPlayed ?? 0
      });
    } catch (err) {
      res.status(500).json({ message: "Server Error" });
    }
  });

  // Basic Spin Route to keep the game alive
  app.post(api.game.spin.path, async (req: any, res) => {
     res.json({ success: true, symbol: "🐉", win: 100 });
  });

  return httpServer;
}
