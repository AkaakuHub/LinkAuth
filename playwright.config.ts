import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
});
