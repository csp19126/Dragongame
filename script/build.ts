import { build as esbuildBuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const forcedExternal = [
  "esbuild",
  "vite",
  "@babel/core",
  "@babel/preset-typescript",
  "lightningcss"
];

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
  console.log("🧹 Cleaning dist...");
  await rm("dist", { recursive: true, force: true });

  console.log("📦 Building client (Vite)...");
  await viteBuild();

  console.log("⚙️ Building server (esbuild)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  
  const externals = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...forcedExternal
  ].filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith("./") && !dep.startsWith("../")
  );

  await esbuildBuild({
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    target: "node20",
    external: externals,
    format: "esm",
    // THE CRITICAL FIX: Manually defining __dirname and require for ESM
    banner: {
      js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
      `,
    },
    sourcemap: true,
  });
  
  console.log("✅ Build complete: dist/index.js created with ESM compatibility.");
}

buildAll().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});