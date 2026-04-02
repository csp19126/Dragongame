import { build as esbuildBuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// These packages must be kept outside the bundle to avoid "Could not resolve" errors
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
  
  // Logic: Only bundle local files and things in the allowlist.
  // Everything else in node_modules, plus our forcedExternals, stays out.
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
    format: "cjs",
    // This stops the "import.meta" warnings during server build
    define: {
      "import.meta.dirname": "__dirname",
      "import.meta.url": "import.meta.url"
    },
    sourcemap: true,
  });
  
  console.log("✅ Build complete: dist/index.js created.");
}

buildAll().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});