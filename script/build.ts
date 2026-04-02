import { build as esbuildBuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // 1. Clean old build
  await rm("dist", { recursive: true, force: true });

  // 2. Build Frontend (Vite)
  console.log("building client...");
  await viteBuild();

  // 3. Build Backend (esbuild)
  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  
  // Logic: Bundle everything in the allowlist OR anything that is a local path
  // Mark as external ONLY if it's in the package.json and NOT in our allowlist
  const externals = Object.keys(pkg.dependencies || {}).filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith("./") && !dep.startsWith("../")
  );

  await esbuildBuild({
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    target: "node20",
    external: externals,
    format: "cjs",
    sourcemap: true,
  });
  
  console.log("✓ Build complete: dist/index.js created.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});