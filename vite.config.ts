/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    proxy: {
      "/api": {
        target: "https://spx.shopee.vn",
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const cookie = req.headers["x-shopee-cookie"];
            if (cookie) {
              proxyReq.setHeader("Cookie", cookie);
            }
          });
        },
      },
      "/api-shopee": {
        target: "https://spx.shopee.vn",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-shopee/, ""),
        configure: (proxy, _options) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const cookie = req.headers["x-shopee-cookie"];
            if (cookie) {
              proxyReq.setHeader("Cookie", cookie);
            }
          });
        },
      },
    },
  },
});
