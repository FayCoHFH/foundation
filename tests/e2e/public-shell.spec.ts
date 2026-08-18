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
      name: "Building and repairing homes with neighbors across Fayette County.",
    }),
  ).toBeVisible();
  const logo = page.getByRole("img", {
    name: "Fayette County Habitat for Humanity",
  });
  await expect(logo).toBeVisible();
  const logoMetrics = await logo.evaluate((element) => {
    const image = element as HTMLImageElement;
    const rect = image.getBoundingClientRect();
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    };
  });
  expect(logoMetrics.naturalWidth).toBe(562);
  expect(logoMetrics.naturalHeight).toBe(190);
  expect(logoMetrics.renderedWidth).toBeGreaterThan(0);
  expect(logoMetrics.renderedHeight).toBeGreaterThan(0);
  expect(logoMetrics.renderedWidth / logoMetrics.renderedHeight).toBeCloseTo(
    562 / 190,
    1,
  );
  const typography = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector("h1")!).fontFamily,
    section: getComputedStyle(document.querySelector("#home-work")!).fontFamily,
    body: getComputedStyle(
      document.querySelector("main p.text-muted-foreground")!,
    ).fontFamily,
  }));
  expect(typography.display.toLowerCase()).toContain("zilla slab");
  expect(typography.section.toLowerCase()).toContain("zilla slab");
  expect(typography.body.toLowerCase()).toContain("source sans 3");
  await expect(page.locator(".public-hero-structure")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator(".public-hero-structure img")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Public experience foundation",
  );
  await expect(page.getByText("Place", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Work", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".editorial-arrival")
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.click();
  await expect(page.getByRole("main")).toBeFocused();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityResults.violations).toEqual([]);

  for (const [width, height] of [
    [320, 700],
    [375, 812],
    [390, 844],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});

test("public display headings use Zilla Slab across core routes", async ({
  page,
}) => {
  for (const route of ["/", "/projects", "/campaigns", "/give", "/volunteer"]) {
    await page.goto(route);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect
      .poll(() =>
        heading.evaluate((element) => getComputedStyle(element).fontFamily),
      )
      .toContain("Zilla Slab");
  }
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
