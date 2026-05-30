import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite drives the React app (HMR, fast refresh). The Bun API server
// runs separately on STUDIO_API_PORT (default 4174); the proxy below
// routes /api/* and /assets/* to it so the React app calls relative
// URLs in dev mode AND in prod (when Bun serves the built static
// bundle, the same prefixes hit the same handlers).
const API_PORT = Number(process.env.STUDIO_API_PORT ?? 4174);

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  server: {
    port: Number(process.env.STUDIO_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
      // Asset bytes (source.quality.png, tui.txt) live under /files/ on the API.
      // Same proxy so <img src="/files/source/..."> works without CORS.
      "/files": `http://localhost:${API_PORT}`,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
