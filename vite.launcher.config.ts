import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "launcher-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "launcher.html"),
    },
  },
});
