import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/campaigns",
  "/news",
  "/restore",
  "/this-route-does-not-exist",
];

test("nonproduction public routes are protected from indexing", async ({
  page,
}) => {
  for (const route of publicRoutes) {
    const response = await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    const robotsContent = await page
      .locator('meta[name="robots"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("content") ?? ""),
      );
    expect(robotsContent.length).toBeGreaterThan(0);
    expect(robotsContent.every((content) => /noindex/i.test(content))).toBe(
      true,
    );
    expect(robotsContent.some((content) => /nofollow/i.test(content))).toBe(
      true,
    );
    await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute(
      "content",
      /noindex,?\s*nofollow/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test("nonproduction robots and sitemap responses are explicit", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/User-agent:\s*\*/i);
  expect(await robots.text()).toContain("Disallow: /");
  expect(robots.headers()["x-robots-tag"]).toBe("noindex, nofollow");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(404);
});
