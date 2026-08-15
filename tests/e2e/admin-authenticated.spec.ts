import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { testAuthSecret } from "../../playwright.config";

async function establishFixture(
  page: import("@playwright/test").Page,
  fixture: "platform-admin" | "denied",
) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

test("@smoke active capability-backed administrator can create an audited invitation", async ({
  page,
}) => {
  await establishFixture(page, "platform-admin");
  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { level: 1, name: "Administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Administration" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("link", { name: "Invite administrator" }).click();
  await page
    .getByLabel("Google Workspace email")
    .fill(`invite-${Date.now()}@example.org`);
  await page.getByLabel("Initial role preset").selectOption("contributor");
  await page
    .getByLabel("Invitation expiry")
    .fill(
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    );
  await page.getByRole("button", { name: "Create invitation" }).click();

  await expect(
    page.getByText("Invitation created and recorded in the audit log."),
  ).toBeVisible();
  await expect(page.getByLabel("One-time invitation link")).toHaveValue(
    /\/admin\/invitations\/accept\?token=/,
  );

  await page.goto("/admin");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/admin/sign-in");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in\?next=%2Fadmin$/);
});

test("@smoke database session without an active local principal is denied", async ({
  page,
}) => {
  await establishFixture(page, "denied");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/access-denied$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Access denied" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
