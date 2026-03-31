import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage";

const MemoryStoreSession = MemoryStore(session);

export function getSessionMiddleware() {
  return session({
    secret: process.env.SESSION_SECRET || "dragongame-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({ checkPeriod: 86400000 }),
    // Required for Railway's proxy
    proxy: true, 
    cookie: {
      httpOnly: true,
      // Required for Railway's HTTPS/SSL
      secure: true, 
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  });
}