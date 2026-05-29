import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the /query NL-bar E2E (Phase C / C3 carry-over).
 *
 * Not part of the hermetic `pnpm test` gate (needs a browser via
 * `npx playwright install`). Run locally with `pnpm --filter @databridge/web
 * test:e2e`. The spec mocks the /v1/rules:compile API, so only the web dev
 * server is required; Playwright starts it automatically unless
 * PLAYWRIGHT_NO_SERVER is set (e.g. when reusing a running server).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
