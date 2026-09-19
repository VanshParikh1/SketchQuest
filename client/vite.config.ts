import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Reachable from a phone on the LAN, and from tunnel hostnames (e.g. *.trycloudflare.com).
    host: true,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:3001" },
  },
});
