import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, proxy API calls to the FastAPI backend (python server/app.py).
    // Override the target with VITE_API_PROXY when running on another port.
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://127.0.0.1:7860",
    },
  },
});
