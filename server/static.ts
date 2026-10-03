import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distPath = [path.resolve(here, "public"), path.resolve(process.cwd(), "dist", "public")].find((p) => fs.existsSync(p));
  if (!distPath) throw new Error("Built frontend not found. Run `npm run build` first.");

  // Hashed assets never change, so let browsers cache them for a year.
  // A missing asset (e.g. an old build's file after a redeploy) must be a real 404,
  // not the HTML app shell, or the browser tries to run HTML as JavaScript.
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
  // Everything else (index.html, sw.js, manifest) must always be revalidated so updates show up
  app.use(express.static(distPath, { maxAge: 0 }));

  // Client-side routes (/coins, /profile, ...) get the app shell
  app.get(/^(?!\/api).+/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(distPath, "index.html"));
  });
}
