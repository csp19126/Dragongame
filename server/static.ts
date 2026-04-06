import express, { type Express } from "express";
import path from "path";

// __dirname is provided by the build banner
export function serveStatic(app: Express) {
  // @ts-ignore
  const distPath = path.resolve(__dirname, "public");

  app.use(express.static(distPath));

  // This "index" name inside the parentheses gives the wildcard a label
  // which prevents the PathError crash in Express 5.
  app.get("/:index*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}