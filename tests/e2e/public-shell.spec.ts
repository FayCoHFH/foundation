import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("@smoke public shell provides a usable landmark and skip-navigation structure", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response?.headers()["content-security-policy"]).not.toContain("*");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");

  await expect(page).toHaveTitle("Foundation environment");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Public navigation" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A place where many kinds of help can meet.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.click();
  await expect(page.getByRole("main")).toBeFocused();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityResults.violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 800 });
  const hasPageOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);
});

test("@smoke not-found state is semantic and has no automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/this-foundation-route-does-not-exist");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "This page is not available.",
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
