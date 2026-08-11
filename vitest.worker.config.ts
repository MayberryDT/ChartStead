import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BETTER_AUTH_SECRET: "test-worker-signing-secret-32chars!!",
        },
      },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
