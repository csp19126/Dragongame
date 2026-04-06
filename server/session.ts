import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage.js";

const SessionStore = MemoryStore(session);

export function getSessionMiddleware() {
  return session({
    name: "dragon_session",
    secret: "dragon_gold_888", 
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Set to false for Railway unless using full SSL
      sameSite: "lax",
    },
    store: new SessionStore({
      checkPeriod: 86400000
    }),
  });
}