import express, { type Express } from "express";
import path from "path";

// __dirname is provided by the build banner
export function serveStatic(app: Express) {
  // @ts-ignore
  const distPath = path.resolve(__dirname, "public");

  app.use(express.static(distPath));

  // The fix is right here: changing '*' to '(.*)' 
  // to satisfy the new Express 5.0 path requirements.
  app.get("(.*)", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}