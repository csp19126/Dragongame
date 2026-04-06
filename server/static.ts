import express, { type Express } from "express";
import path from "path";

export function serveStatic(app: Express) {
  // @ts-ignore
  const distPath = path.resolve(__dirname, "public");

  app.use(express.static(distPath));

  // We use a RegExp object here. 
  // It says: "If it's not /api, send the index.html"
  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}