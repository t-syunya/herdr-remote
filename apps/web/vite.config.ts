import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.DEV_HOST ?? "127.0.0.1",
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
