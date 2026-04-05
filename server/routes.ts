import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  return httpServer;
}