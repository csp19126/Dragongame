import express, { type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import helmet from "helmet";
import { sql } from "drizzle-orm";
import { registerRoutes } from "./routes";
import { getSessionMiddleware } from "./session";
import { db } from "./db";
import { attachPoolSockets, recoverPoolMatches } from "./pool";

const isProd = () => process.env.NODE_ENV === "production";

/** Builds the HTTP app (API only). The caller adds the frontend and starts listening. */
export async function createApp(sessionSecret: string): Promise<{ app: express.Express; httpServer: Server }> {
  const app = express();
  app.set("trust proxy", 1); // behind Railway/Replit/nginx TLS proxies
  app.disable("x-powered-by");

  app.use(helmet({
    // Vite's dev server injects inline scripts, so the CSP only applies in production
    contentSecurityPolicy: isProd() ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        // The page talks to its own host over HTTPS and WebSocket (online pool)
        connectSrc: ["'self'", (req) => `wss://${(req as Request).headers.host}`],
        workerSrc: ["'self'", "blob:"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: "100kb" }));

  // Health check for the host (Railway, Docker). Also confirms the database answers.
  app.get("/api/health", async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "database unavailable" });
    }
  });
  app.get("/api/ping", (_req, res) => res.json({ status: "alive" }));

  const sessionMiddleware = getSessionMiddleware(sessionSecret);
  app.use(sessionMiddleware);

  // Compact API request log: "POST /api/game/spin 200 12ms"
  if (process.env.NODE_ENV !== "test") {
    app.use("/api", (req, res, next) => {
      const start = Date.now();
      res.on("finish", () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await recoverPoolMatches();
  attachPoolSockets(httpServer, sessionMiddleware);

  // Errors always come back as JSON, never an HTML stack trace
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error("[error]", err);
    if (res.headersSent) return;
    res.status(status).json({ message: status >= 500 ? "Something went wrong" : err.message || "Bad request" });
  });

  return { app, httpServer };
}
