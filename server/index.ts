import "dotenv/config";
import bcrypt from "bcryptjs";
import { createApp } from "./app";
import { runMigrations } from "./migrate";
import { getSessionSecret } from "./settings";
import { serveStatic } from "./static";
import { storage } from "./storage";
import { pool } from "./db";

async function main() {
  // 1. Database schema: created or upgraded automatically, nothing to run by hand
  await runMigrations();
  console.log("[startup] database ready");

  // 2. Session secret: from SESSION_SECRET, or generated once and stored in the database
  const { app, httpServer } = await createApp(await getSessionSecret());

  // 3. Admins listed in ADMIN_USERNAMES (comma separated)
  const adminNames = (process.env.ADMIN_USERNAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await storage.syncAdmins(adminNames);

  // Owner locked out? Set ADMIN_RESET_USERNAME and ADMIN_RESET_PASSWORD in the host's variables,
  // let it restart, log in, then DELETE both variables. Only works for ADMIN_USERNAMES accounts.
  const resetName = process.env.ADMIN_RESET_USERNAME?.trim();
  const resetPassword = process.env.ADMIN_RESET_PASSWORD;
  if (resetName && resetPassword) {
    if (resetPassword.length < 8 || resetPassword.length > 128) {
      console.warn("[startup] ADMIN_RESET_PASSWORD must be 8 to 128 characters; password not changed");
    } else {
      const result = await storage.resetAdminPassword(resetName, await bcrypt.hash(resetPassword, 10), adminNames);
      if (result === "done") console.log(`[startup] password reset for admin "${resetName}". Now delete ADMIN_RESET_USERNAME and ADMIN_RESET_PASSWORD.`);
      else if (result === "not_admin") console.warn(`[startup] "${resetName}" is not in ADMIN_USERNAMES; password not changed`);
      else console.warn(`[startup] no user "${resetName}"; password not changed`);
    }
  }
  const vouchers = await storage.ensureStarterPack();
  if (vouchers) console.log(`[startup] created the starter pack: ${vouchers} voucher codes (see Admin > Promo codes)`);

  // 4. Frontend
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    // Non-literal path keeps Vite (a dev-only package) out of the production bundle
    const devServer = "./vite";
    const { setupVite } = await import(/* @vite-ignore */ devServer);
    await setupVite(httpServer, app);
  }

  // 5. Listen
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => console.log(`Dragon Engine active on port ${port}`));

  // Hosts send SIGTERM on redeploy: finish in-flight spins, then close the database cleanly
  const shutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received, closing`);
    httpServer.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[startup] failed:", err);
  process.exit(1);
});
