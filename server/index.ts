import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../shared/routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getSessionMiddleware } from "./session";

const app = express();
app.set('trust proxy', 1); // CRITICAL FOR RAILWAY

const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(getSessionMiddleware());

(async () => {
  await registerRoutes(httpServer, app);
  const { storage } = await import("./storage");
  
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`serving on port ${port}`);
  });
})();