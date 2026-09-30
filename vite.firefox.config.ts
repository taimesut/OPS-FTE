import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const defaultFirefoxVersion = "0.5.0";
const firefoxVersion =
  process.env.OPS_FTE_FIREFOX_VERSION?.trim() || defaultFirefoxVersion;

const manifest = {
  manifest_version: 3,
  name: "OPS FTE",
  version: firefoxVersion,
  description: "OPS FTE chạy trực tiếp trên SPX bằng phiên đăng nhập hiện tại.",
  browser_specific_settings: {
    gecko: {
      id: "ops-fte@taimesut",
      strict_min_version: "121.0",
    },
  },
  host_permissions: [
    "https://spx.shopee.vn/*",
    "https://*.spx.shopee.vn/*",
    "https://script.google.com/*",
    "https://script.googleusercontent.com/*",
  ],
  content_scripts: [
    {
      matches: ["https://spx.shopee.vn/*", "https://*.spx.shopee.vn/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  background: {
    scripts: ["background.js"],
  },
};

const firefoxStaticFiles = (): Plugin => ({
  name: "ops-fte-firefox-static-files",
  closeBundle() {
    const outDir = resolve("firefox-dist");
    mkdirSync(outDir, { recursive: true });
    copyFileSync(resolve("firefox/background.js"), resolve(outDir, "background.js"));
    writeFileSync(
      resolve(outDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  },
});

const runtimeShim =
  'var process = globalThis.process || { env: { NODE_ENV: "production" } };';

export default defineConfig({
  plugins: [react(), tailwindcss(), firefoxStaticFiles()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "firefox-dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: "src/userscript.tsx",
      name: "OpsFteFirefoxExtension",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        banner: runtimeShim,
        inlineDynamicImports: true,
      },
    },
  },
});
