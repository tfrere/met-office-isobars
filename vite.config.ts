import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /<repo>/ ; the workflow sets VITE_BASE.
  // Locally (dev + preview) the app runs at the root.
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: 5175, // reserved dev port (unique per project)
  },
});
