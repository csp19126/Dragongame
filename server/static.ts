import express, { type Express } from "express";
import path from "path";

// NOTE: fileURLToPath, dirname, __filename, and __dirname 
// are provided automatically by the esbuild banner. 
// Do NOT import them here manually.

export function serveStatic(app: Express) {
  // @ts-ignore - __dirname is injected by the build banner
  const distPath = path.resolve(__dirname, "public");

  app.use(express.static(distPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}