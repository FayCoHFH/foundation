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
  const logo = page
    .getByRole("img", {
      name: "Fayette County Habitat for Humanity",
    })
    .first();
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
  const footerLogo = page
    .getByRole("contentinfo")
    .getByRole("img", { name: "Fayette County Habitat for Humanity" });
  await expect(footerLogo).toBeVisible();
  await expect(
    page
      .getByRole("contentinfo")
      .getByText("Fayette County Habitat", { exact: true }),
  ).toHaveCount(0);
  await expect(footerLogo).toHaveAttribute(
    "src",
    /fayette-county-habitat-logo-2clr\.avif/,
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
  const headingColors = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    probe.style.color = "var(--timber)";
    const timber = getComputedStyle(probe).color;
    probe.style.color = "var(--display-foreground)";
    const display = getComputedStyle(probe).color;
    probe.style.color = "var(--charcoal)";
    const charcoal = getComputedStyle(probe).color;
    probe.remove();
    return {
      timber,
      display,
      charcoal,
      headings: Array.from(document.querySelectorAll("main h1, main h2")).map(
        (element) => ({
          text: element.textContent?.trim(),
          color: getComputedStyle(element).color,
        }),
      ),
    };
  });
  expect(headingColors.display).toBe(headingColors.charcoal);
  expect(headingColors.display).not.toBe(headingColors.timber);
  for (const heading of headingColors.headings) {
    expect(heading.color, heading.text).not.toBe(headingColors.timber);
  }
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

test("public display headings use approved colors across core routes", async ({
  page,
}) => {
  for (const route of [
    "/",
    "/projects",
    "/campaigns",
    "/give",
    "/volunteer",
    "/news",
  ]) {
    await page.goto(route);
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
    await expect
      .poll(() =>
        heading.evaluate((element) => getComputedStyle(element).fontFamily),
      )
      .toContain("Zilla Slab");
    const colors = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      probe.style.color = "var(--timber)";
      const timber = getComputedStyle(probe).color;
      probe.remove();
      return Array.from(document.querySelectorAll("main h1, main h2")).map(
        (element) => ({
          text: element.textContent?.trim(),
          color: getComputedStyle(element).color,
          timber,
        }),
      );
    });
    for (const item of colors) {
      expect(item.color, `${route}: ${item.text}`).not.toBe(item.timber);
    }
  }
});

test("textual organization identity uses the deliberate two-line lockup", async ({
  page,
}) => {
  for (const route of ["/news", "/share-your-story"]) {
    await page.goto(route);
    const lockup = page.locator(".organization-name-lockup");
    await expect(lockup).toHaveCount(1);
    await expect(lockup.locator("> span")).toHaveText([
      "Fayette County",
      "Habitat for Humanity",
    ]);
    const sizes = await lockup
      .locator("> span")
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).fontSize),
      );
    expect(sizes[1]).toBe(sizes[0]);
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
