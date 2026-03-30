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

  // 1. BYPASS LOGIN: This tells the app you are ALWAYS logged in as the Boss
  app.use((req, res, next) => {
    if (req.session) {
      (req.session as any).userId = 1; 
    }
    next();
  });

  // 2. FAKE LOGIN ROUTE: This stops the 404 error when you click "Login"
  app.post("/api/login", (req, res) => {
    res.json({ id: 1, username: "boss", balance: 1000 });
  });

  // 3. USER CHECK ROUTE: The game calls this to see if you are allowed in
  app.get("/api/user", async (req, res) => {
    res.json({ id: 1, username: "boss", balance: 1000 });
  });

  // 4. GAME STATE: This loads your dragon's balance and stats
  app.get(api.game.state.path, async (req: any, res) => {
    try {
      // We use '1' here because that's our new fixed ID
      let user = await storage.getUser(1);
      
      // If the database is empty, we send a default starting state
      res.json({ 
        balance: user?.balance ?? 1000, 
        gameStates: [], 
        streak: user?.streak ?? 0,
        totalWins: user?.totalWins ?? 0,
        gamesPlayed: user?.gamesPlayed ?? 0
      });
    } catch (err) {
      res.status(500).json({ message: "Server Error" });
    }
  });

  // 5. SPIN ROUTE: This makes the dragon spin work
  app.post(api.game.spin.path, async (req: any, res) => {
     res.json({ success: true, symbol: "🐉", win: 100 });
  });

  return httpServer;
}
