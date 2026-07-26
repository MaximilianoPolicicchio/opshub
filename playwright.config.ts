import { defineConfig, devices } from "@playwright/test";

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

/**
 * Browser-level tests for the flows that only exist once the API and the UI are
 * wired together — the API e2e suite already covers the rules themselves.
 *
 * Both servers are started by Playwright unless E2E_REUSE_SERVER is set, so a
 * single `pnpm test:e2e:ui` works from a clean checkout.
 */
export default defineConfig({
  testDir: "./e2e",
  // Each spec creates its own account and workspace, so specs cannot collide.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"], ["list"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: WEB_URL,
    // Trace only on the first retry: full traces on every run are slow and
    // enormous, but a flake that reproduces on retry is exactly what you want
    // to open in the trace viewer.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.E2E_REUSE_SERVER
    ? undefined
    : [
        {
          command: "pnpm --filter @opshub/api start",
          url: `${API_URL}/api/v1/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            // Fixture setup registers an account per spec, which would trip the
            // register limit. The limits themselves are covered by the API's
            // throttling.e2e-spec.ts.
            THROTTLE_ENABLED: "false",
            SCHEDULER_ENABLED: "false",
          },
        },
        {
          command: "pnpm --filter @opshub/web start",
          url: WEB_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            // The suite runs a production build over plain http://localhost, so
            // a Secure session cookie would be set and never sent back. Real
            // deployments run behind HTTPS and keep the default.
            COOKIE_SECURE: "false",
          },
        },
      ],
});
