import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { createServer } from "http";
import { getSessionMiddleware } from "./session.js";
import { storage } from "./storage.js";

const app = express();
app.set("trust proxy", 1); // CRITICAL: Tells Express to trust the Railway headers

// Standard middleware for reading JSON data from the Login/Spin buttons
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize the session engine (The "Handshake")
app.use(getSessionMiddleware());

// --- THE "ANTI-HTML" GUARD ---
// This ensures that any request starting with /api ONLY speaks JSON.
// This is the direct fix for the "JSON.parse line 1" error.
app.use("/api", (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Test route to verify the server is alive
app.get("/api/ping", (_req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
});

(async () => {
  // 1. Load your game routes (Login, Spin, Oracle)
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  // 2. Seed the database with VIP profiles and gift cards on every startup
  try {
    await (storage as any).seedVIPBalances();
    console.log("[Startup] VIP balances seeded");
  } catch (err) {
    console.error("[Startup] seedVIPBalances failed:", err);
  }
  try {
    await (storage as any).seedGiftCards();
    console.log("[Startup] Gift cards seeded");
  } catch (err) {
    console.error("[Startup] seedGiftCards failed:", err);
  }

  // 3. Global Error Handler
  // If the code crashes, this catches it and sends a JSON error instead of an HTML page.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("SERVER ERROR:", err);
    res.status(status).json({ message });
  });

  // 4. Serve the Game Frontend
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    // Development mode (Vite)
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  // 5. Start the Engine
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`Dragon Engine active on port ${port}`);
  });
})();