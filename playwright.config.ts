import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command:
      "CHARTSTEAD_E2E_PERSIST_PATH=$(mktemp -d) && export CHARTSTEAD_E2E_PERSIST_PATH && npx wrangler d1 migrations apply chartstead-auth-demo --local --env demo --persist-to \"$CHARTSTEAD_E2E_PERSIST_PATH\" && npm run dev:demo -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
