import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      persistState: process.env.CHARTSTEAD_E2E_PERSIST_PATH
        ? { path: process.env.CHARTSTEAD_E2E_PERSIST_PATH }
        : true,
    }),
  ],
});
