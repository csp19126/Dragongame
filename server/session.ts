import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db.js";

const PostgresStore = pgSession(session);
const isProd = process.env.NODE_ENV === "production";

export function getSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret && isProd) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return session({
    store: new PostgresStore({
      pool,
      tableName: "session",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
    name: "dragon_session",
    secret: secret || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // HTTPS-only cookie in production (Railway/Replit terminate TLS at the proxy; trust proxy is set)
      secure: isProd,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    },
  });
}
