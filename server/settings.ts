import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { appSettings } from "@shared/schema";
import { db } from "./db";

/**
 * Uses SESSION_SECRET if set. Otherwise generates a strong secret once and
 * keeps it in the database, so logins survive restarts and redeploys without
 * anyone having to invent a secret.
 */
export async function getSessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const candidate = randomBytes(48).toString("hex");
  await db.insert(appSettings).values({ key: "session_secret", value: candidate }).onConflictDoNothing();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "session_secret"));
  return row.value;
}
