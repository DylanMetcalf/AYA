import { defineConfig } from "@playwright/test";

/** E2E runs against `next start` on the dev database seeded by `npm run db:seed`. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined } },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npx next start -p 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 120_000 },
});
