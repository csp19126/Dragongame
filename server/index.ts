import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js"; // Added .js
import { serveStatic } from "./static.js"; // Added .js
import { createServer } from "http";
import { getSessionMiddleware } from "./session.js"; // Added .js

const app = express();
app.set('trust proxy', 1); 

const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(getSessionMiddleware());

// Global Error Handler to catch "Line 1" HTML errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
});

(async () => {
  await registerRoutes(httpServer, app);
  
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`serving on port ${port}`);
  });
})();