import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";

// Arbitrary constant: stops two instances migrating at the same time
const MIGRATION_LOCK_ID = 88_888_888;

function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), "migrations"),
    path.resolve(here, "..", "migrations"),
  ].filter(Boolean) as string[];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "meta", "_journal.json")));
  if (!found) throw new Error(`Could not find the migrations folder (looked in: ${candidates.join(", ")})`);
  return found;
}

/** Brings the database schema up to date. Safe to run on every boot. */
export async function runMigrations(): Promise<void> {
  const folder = migrationsFolder();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
