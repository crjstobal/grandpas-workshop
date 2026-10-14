import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    host: true, // reachable from the Fire TV and the phones on the LAN
    allowedHosts: [".trycloudflare.com"], // HTTPS tunnel for phones (camera, mic, motion need it on iOS)
    // the game API and MCP server run on 8788 locally (npm run dev:server)
    proxy: { "/api": "http://localhost:8788", "/mcp": "http://localhost:8788" },
  },
});
