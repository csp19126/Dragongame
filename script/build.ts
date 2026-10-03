/**
 * Production build:
 *   dist/public/   the frontend (Vite)
 *   dist/index.js  the server, with every runtime dependency bundled in, so
 *                  running it needs only Node and the migrations folder:
 *                  no node_modules, no npm install on the server.
 */
import { build as esbuildBuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "fs/promises";

// Optional native add-ons that the bundled libraries try to load but fall back without
const OPTIONAL_NATIVE = ["pg-native", "bufferutil", "utf-8-validate"];

async function buildAll() {
  console.log("🧹 Cleaning dist...");
  await rm("dist", { recursive: true, force: true });

  console.log("📦 Building client (Vite)...");
  await viteBuild();

  console.log("⚙️  Building server (esbuild)...");
  await esbuildBuild({
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    external: OPTIONAL_NATIVE,
    alias: { "@shared": "./shared" },
    banner: {
      // Bundled CommonJS packages expect these. Aliased imports can't clash with app code.
      js: [
        "import { createRequire as __bannerCreateRequire } from 'module';",
        "import { fileURLToPath as __bannerFileURLToPath } from 'url';",
        "import { dirname as __bannerDirname } from 'path';",
        "const require = __bannerCreateRequire(import.meta.url);",
        "const __filename = __bannerFileURLToPath(import.meta.url);",
        "const __dirname = __bannerDirname(__filename);",
      ].join("\n"),
    },
    sourcemap: true,
    logLevel: "warning",
  });

  console.log("✅ Build complete: dist/index.js + dist/public");
}

buildAll().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
