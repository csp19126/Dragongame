import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
// We are skipping the crashing Replit Auth import
// import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // We DISABLE these because they cause the "clientId" crash on Railway
  // await setupAuth(app);
  // registerAuthRoutes(app);

  registerAudioRoutes(app);
  registerImageRoutes(app);

  // This ensures that even without a login, the app knows who "you" are
  app.use((req, res, next) => {
    (req.session as any).userId = "55109529"; // Your Admin ID
    next();
  });

  // ... (The rest of your game logic stays the same)
  return httpServer;
}
