import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { testAuthSecret } from "../../playwright.config";

async function establishFixture(page: Page) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture: "campaign-approver" },
  });
  expect(response.status()).toBe(200);
}

async function createAndVerify(
  page: Page,
  purpose: "GENERAL_DONATE" | "GENERAL_VOLUNTEER",
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
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) })
    .last();
  await row
    .getByText("Review usage and manage destination", { exact: true })
    .click();
  await row.getByRole("button", { name: "Verify destination" }).click();
  await expect(row.getByText(/· Verified$/, { exact: false })).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
}

async function captureBreakpoints(page: Page, name: string) {
  for (const [label, width, height] of [
    ["375", 375, 812],
    ["768", 768, 1024],
    ["1440", 1440, 1100],
    ["1920", 1920, 1200],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: test.info().outputPath(`g2-${name}-${label}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
}

test("G2 public giving and volunteer experience is governed, responsive, and accessible", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page);
  const runId = randomUUID();
  const donateUrl = `https://app.dvforms.net/g2-give-${runId}`;
  const volunteerUrl = `https://app.dvforms.net/g2-volunteer-${runId}`;

  await createAndVerify(
    page,
    "GENERAL_DONATE",
    `G2 general giving ${runId}`,
    donateUrl,
  );
  await createAndVerify(
    page,
    "GENERAL_VOLUNTEER",
    `G2 general volunteer ${runId}`,
    volunteerUrl,
  );

  await page
    .locator('select[name="destinationId"]')
    .first()
    .selectOption({ label: `G2 general giving ${runId}` });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page
      .getByRole("button", { name: "Save canonical destination" })
      .first()
      .click(),
  ]);
  await page
    .locator('select[name="destinationId"]')
    .last()
    .selectOption({ label: `G2 general volunteer ${runId}` });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page
      .getByRole("button", { name: "Save canonical destination" })
      .last()
      .click(),
  ]);

  for (const route of ["/", "/give", "/volunteer"]) {
    await page.goto(route);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    const arrival = page.locator(".editorial-arrival");
    if (await arrival.count()) {
      await expect
        .poll(() =>
          arrival.evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe("1");
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureBreakpoints(page, route === "/" ? "homepage" : route.slice(1));
  }

  await page.goto("/");
  await expect
    .poll(() =>
      page
        .locator(".editorial-arrival")
        .first()
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect(page.locator(`a[href="${donateUrl}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href="${volunteerUrl}"]`).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Why give" })).toHaveAttribute(
    "href",
    "/give",
  );
  await expect(
    page.getByRole("link", { name: "Volunteer", exact: true }).first(),
  ).toHaveAttribute("href", "/volunteer");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText("Menu", { exact: true })).toBeVisible();
  await page.getByText("Menu", { exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile public navigation" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await context.close();
});
