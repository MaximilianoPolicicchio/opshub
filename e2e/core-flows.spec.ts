import { test, expect } from "./fixtures";
import { registerAndSignIn } from "./fixtures";

/**
 * Browser coverage for the paths that only exist once the UI and API are wired
 * together. The business rules themselves (dependency gating, timer conflicts,
 * budget burn) are asserted in the API e2e suite; here we check that a user can
 * actually reach and trigger them.
 */

test.describe("core flows", () => {
  test("a new user lands on an empty Today and can navigate the shell", async ({ page }) => {
    await registerAndSignIn(page, "shell");

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    for (const name of ["Projects", "Time", "Financial", "Automations", "Weekly Review"]) {
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(name.toLowerCase().replace(" ", "-")));
    }
  });

  test("creating a project shows it on the projects page", async ({ page }) => {
    await registerAndSignIn(page, "project");

    const projectName = `Playwright Project ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel(/name/i).first().fill(projectName);

    // Walk the wizard to the end without depending on the exact step count.
    for (let i = 0; i < 6; i++) {
      const create = page.getByRole("button", { name: /^create project$/i });
      if (await create.isVisible().catch(() => false)) {
        await create.click();
        break;
      }
      const next = page.getByRole("button", { name: /^(next|continue)$/i });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }

    await page.goto("/projects");
    await expect(page.getByText(projectName, { exact: false }).first()).toBeVisible();
  });

  test("the weekly review renders for a fresh workspace", async ({ page }) => {
    await registerAndSignIn(page, "review");

    await page.goto("/weekly-review");
    await expect(page.getByRole("heading", { name: /weekly review/i })).toBeVisible();
    // A brand-new workspace has nothing completed; the page must still render
    // rather than erroring on empty aggregates.
    await expect(page.getByText(/completed/i).first()).toBeVisible();
  });

  test("the financial overview renders with no budgets configured", async ({ page }) => {
    await registerAndSignIn(page, "financial");

    await page.goto("/financial");
    await expect(page.getByRole("heading", { name: /financial/i })).toBeVisible();
  });

  test("signing out returns to the login page and protects the app", async ({ page }) => {
    await registerAndSignIn(page, "signout");

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // The session is really gone, not just navigated away from.
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * Regression guard. This failed against a production build until the refresh
   * reuse grace window was added: reloading while the boot refresh was still in
   * flight meant the rotated cookie never landed, the next load replayed the
   * previous token, and reuse-detection revoked the whole family.
   */
  test("a reload keeps the user signed in", async ({ page }) => {
    await registerAndSignIn(page, "session");

    await page.goto("/projects");
    await page.reload();

    // Regression guard: the access token lives in memory only, so this works
    // solely because the httpOnly refresh cookie is exchanged on boot.
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});
