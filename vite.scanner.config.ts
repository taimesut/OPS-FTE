import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    viteSingleFile(),
    {
      name: "escape-trailing-tabs",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (
              output.type === "asset" &&
              output.fileName.endsWith(".html") &&
              typeof output.source === "string"
            ) {
              output.source = output.source.replace(/\t(?=\r?\n)/g, "\\t");
            }
          }
        },
      },
    },
  ],
  build: {
    outDir: "dist/scanner",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "scanner.html"),
    },
  },
});
