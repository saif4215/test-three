import { defineConfig } from "@playwright/test";

/** Browser tests. `npm run e2e` starts the store and its stand-ins and passes the addresses in through the environment. */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  // The tests share one store (and run in file order), so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "../.data/e2e-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    viewport: { width: 1280, height: 800 },
    // Set E2E_CHROMIUM to use an already-installed Chromium instead of the one `npx playwright install` downloads.
    launchOptions: { args: ["--no-sandbox"], executablePath: process.env.E2E_CHROMIUM || undefined },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
