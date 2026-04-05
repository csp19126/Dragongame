import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // --- LOGIN: THE IRONCLAD VERSION ---
  app.post("/api/auth/login", async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      
      // 1. Fetch User
      const user = await (storage as any).getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // 2. Check Password
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ message: "Wrong password" });
      }

      // 3. Set Session
      (req.session as any).userId = user.id;

      // 4. Manual Save & Response (Stops the JSON.parse error)
      req.session.save((err: any) => {
        if (err) return res.status(500).json({ message: "Session fail" });
        
        // Only send back safe data - NO circular database objects
        return res.json({
          id: user.id,
          username: user.username,
          balance: user.balance || 50000,
          firstName: user.firstName || "",
          lastName: user.lastName || ""
        });
      });
    } catch (err) {
      console.error("LOGIN CRASH:", err);
      return res.status(500).json({ message: "Server Error" });
    }
  });

  // --- SPIN: THE "SAFE" VERSION ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Login expired" });

      const { betAmount } = req.body;
      let user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "User lost" });

      // Placeholder grid (Weighted logic can go here once login works)
      const grid = [
        ["diamond", "bar", "cherry"],
        ["cherry", "diamond", "bar"],
        ["bar", "cherry", "diamond"]
      ];

      res.json({ 
        grid, 
        winLines: [], 
        winAmount: 0, 
        newBalance: user.balance, 
        streak: 0 
      });
    } catch (err) {
      res.status(500).json({ message: "Spin failed" });
    }
  });

  return httpServer;
}