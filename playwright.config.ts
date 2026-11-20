import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    env: { PORT: "4174" },
    url: "http://127.0.0.1:4174/after.html",
    reuseExistingServer: false,
  },
});
