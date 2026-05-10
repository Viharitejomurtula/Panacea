import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/presets": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/preset": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/predict": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/parse": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/chat": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/narrate": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
