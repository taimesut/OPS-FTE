import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const metadata = `// ==UserScript==
// @name         OPS FTE
// @namespace    https://github.com/taimesut/OPS-FTE
// @version      0.3.0
// @description  OPS FTE chạy trực tiếp trong SPX bằng phiên đăng nhập hiện tại
// @match        https://spx.shopee.vn/*
// @match        https://*.spx.shopee.vn/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==`;

const runtimeShim = `var process = globalThis.process || { env: { NODE_ENV: "production" } };`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "userscript-dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: "src/userscript.tsx",
      name: "OpsFteUserscript",
      formats: ["iife"],
      fileName: () => "ops-fte.user.js",
    },
    rollupOptions: {
      output: {
        banner: `${metadata}\n${runtimeShim}`,
        inlineDynamicImports: true,
      },
    },
  },
});
