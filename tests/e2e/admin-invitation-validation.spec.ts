import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { testAuthSecret } from "../../playwright.config";

test("invalid invitation retains valid input and identifies the DST wall-time error", async ({
  page,
}) => {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture: "platform-admin" },
  });
  expect(response.status()).toBe(200);

  await page.goto("/admin/invitations/new");
  const email = page.getByLabel("Google Workspace email");
  const role = page.getByLabel("Initial role preset");
  const expiry = page.getByLabel("Invitation expiry");

  await email.fill("retained@example.org");
  await role.selectOption("contributor");
  await expiry.fill("2026-03-08T02:30");
  await page.getByRole("button", { name: "Create invitation" }).click();

  const summary = page.getByRole("alert", {
    name: "Invitation not created",
  });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(
    summary.getByRole("link", { name: /Invitation expiry/ }),
  ).toHaveAttribute("href", "#expiresAt");
  await expect(expiry).toHaveAttribute("aria-invalid", "true");
  await expect(expiry).toHaveAttribute(
    "aria-describedby",
    "expiry-help expiry-error",
  );
  await expect(page.locator("#expiry-error")).toContainText(
    "does not exist in America/Chicago",
  );
  await expect(email).toHaveValue("retained@example.org");
  await expect(role).toHaveValue("contributor");
  await expect(expiry).toHaveValue("2026-03-08T02:30");

  await expiry.fill("2026-11-01T01:30");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(summary).toBeFocused();
  await expect(page.locator("#expiry-error")).toContainText(
    "occurs twice in America/Chicago",
  );
  await expect(expiry).toHaveValue("2026-11-01T01:30");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
