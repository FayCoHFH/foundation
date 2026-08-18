import { randomUUID } from "node:crypto";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { testAuthSecret } from "../../playwright.config";

async function establishFixture(page: Page, fixture: string) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

async function createAndVerify(
  page: Page,
  purpose: string,
  label: string,
  url: string,
) {
  await page.goto("/admin/engagement");
  const addSection = page
    .locator("section")
    .filter({ hasText: "Add a DonorView destination" });
  await addSection.getByLabel("Purpose").selectOption(purpose);
  await addSection.getByLabel("Administrative label").fill(label);
  await addSection.getByLabel("DonorView HTTPS URL").fill(url);
  await addSection
    .getByRole("button", { name: "Save unverified destination" })
    .click();
  const row = page
    .locator("li")
    .filter({
      has: page.getByRole("heading", { name: label, exact: true }),
    })
    .last();
  await expect(
    row.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  await row
    .getByText("Review usage and manage destination", { exact: true })
    .click();
  await row.getByRole("button", { name: "Verify destination" }).click();
  await expect(
    row.getByText(
      `${purpose === "GENERAL_DONATE" ? "General Donate" : "General Volunteer"} · Verified`,
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
}

test("G1 governs global DonorView handoffs and keeps the public shell accessible", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page, "campaign-approver");
  const runId = randomUUID();
  const givingLabel = `G1 general giving ${runId}`;
  const volunteerLabel = `G1 general volunteer ${runId}`;

  await createAndVerify(
    page,
    "GENERAL_DONATE",
    givingLabel,
    "https://app.dvforms.net/api/dv/g1-giving",
  );
  await createAndVerify(
    page,
    "GENERAL_VOLUNTEER",
    volunteerLabel,
    "https://app.dvforms.net/api/dv/g1-volunteer",
  );

  await page
    .locator('select[name="destinationId"]')
    .first()
    .selectOption({ label: givingLabel });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page
      .getByRole("button", { name: "Save canonical destination" })
      .first()
      .click(),
  ]);
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator('select[name="destinationId"]')
    .last()
    .selectOption({ label: volunteerLabel });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page
      .getByRole("button", { name: "Save canonical destination" })
      .last()
      .click(),
  ]);

  await page.goto("/");
  await expect(
    page.locator('a[href="https://app.dvforms.net/api/dv/g1-giving"]').first(),
  ).toBeVisible();
  await expect(
    page
      .locator('a[href="https://app.dvforms.net/api/dv/g1-volunteer"]')
      .first(),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .include("main")
    .exclude(".editorial-arrival")
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await context.close();
});

test("G1 separates destination read access from configuration", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page, "campaign-reviewer");
  await page.goto("/admin/engagement");
  await expect(
    page.getByRole("heading", { name: "DonorView Destinations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add a DonorView destination" }),
  ).not.toBeVisible();
  await context.close();
});
