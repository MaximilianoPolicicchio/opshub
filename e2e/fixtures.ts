import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every spec registers its own account, and therefore its own workspace. That
 * keeps specs independent and parallel-safe without truncating tables between
 * runs, and it exercises the real registration path rather than depending on
 * seed data that may be reseeded underneath the suite.
 */
export interface TestAccount {
  email: string;
  password: string;
  name: string;
  workspaceName: string;
}

export function newAccount(prefix: string): TestAccount {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `${prefix}-${unique}@opshub.test`,
    password: "PlaywrightSecret123!",
    name: "Playwright User",
    workspaceName: `PW ${prefix} ${unique.slice(0, 8)}`,
  };
}

export async function registerAndSignIn(page: Page, prefix: string): Promise<TestAccount> {
  const account = newAccount(prefix);

  await page.goto("/register");
  await page.getByLabel("Your name").fill(account.name);
  await page.getByLabel("Workspace name").fill(account.workspaceName);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /create workspace|sign up|create/i }).click();

  // Registration lands on Today.
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  return account;
}

/**
 * Creates a project through the wizard and returns its id, taken from the URL
 * the app navigates to afterwards.
 */
export async function createProject(page: Page, name: string, type = "Product"): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(/project name|name/i).first().fill(name);

  const typeSelect = page.getByLabel(/type/i).first();
  if (await typeSelect.isVisible().catch(() => false)) {
    await typeSelect.selectOption({ label: type }).catch(() => undefined);
  }

  // The wizard is multi-step; advance until the create action appears.
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

  await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 15_000 });
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).pop()!;
  expect(id).toBeTruthy();
  return id;
}

export const test = base;
export { expect };
