import { expect, test } from "@playwright/test";

const INDEX_ROUTES = [
  "/",
  "/projects",
  "/campaigns",
  "/news",
  "/give",
  "/volunteer",
  "/restore",
  "/share-your-story",
] as const;

const INTERNAL_ORIGIN = "http://127.0.0.1:3100";

function resolveHref(href: string) {
  return new URL(href, INTERNAL_ORIGIN);
}

test("public links resolve intentionally without following third-party hosts", async ({
  page,
  request,
}) => {
  const internalHrefs = new Set<string>();

  for (const route of INDEX_ROUTES) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status(), route).toBeGreaterThanOrEqual(200);
    expect(response?.status(), route).toBeLessThan(400);
    const links = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        href: anchor.getAttribute("href") ?? "",
        text: anchor.textContent?.trim() ?? "",
      })),
    );

    for (const link of links) {
      if (!link.href || link.href.startsWith("#")) continue;
      const url = resolveHref(link.href);
      if (url.origin === INTERNAL_ORIGIN) {
        if (!url.hash) internalHrefs.add(`${url.pathname}${url.search}`);
        continue;
      }
      if (url.protocol === "mailto:" || url.protocol === "tel:") continue;
      expect(url.protocol, `${route}: ${link.text}`).toBe("https:");
      expect(url.username, `${route}: ${link.text}`).toBe("");
      expect(url.password, `${route}: ${link.text}`).toBe("");
      expect(url.hostname, `${route}: ${link.text}`).not.toMatch(/\.invalid$/i);
    }
  }

  for (const href of internalHrefs) {
    const response = await request.get(href);
    expect(response.status(), href).toBeGreaterThanOrEqual(200);
    expect(response.status(), href).toBeLessThan(400);
  }
});

test("public navigation matrix reaches current destinations and mobile navigation", async ({
  page,
}) => {
  async function visit(href: string) {
    const response = await page.goto(href, { waitUntil: "networkidle" });
    expect(response?.status(), href).toBeGreaterThanOrEqual(200);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.getByRole("main")).toBeVisible();
  }

  for (const href of [
    "/projects",
    "/campaigns",
    "/news",
    "/give",
    "/volunteer",
    "/restore",
  ]) {
    await visit(href);
  }

  for (const [indexRoute, prefix] of [
    ["/projects", "/projects/"],
    ["/campaigns", "/campaigns/"],
    ["/news", "/news/"],
  ] as const) {
    await page.goto(indexRoute, { waitUntil: "networkidle" });
    const detailLinks = page.locator(`a[href^="${prefix}"]`);
    const detailHref = (await detailLinks.count())
      ? await detailLinks.first().getAttribute("href")
      : null;
    if (detailHref) await visit(detailHref);
  }

  await page.goto("/", { waitUntil: "networkidle" });
  const storyLinks = page.locator('a[href^="/stories/"]');
  const storyHref = (await storyLinks.count())
    ? await storyLinks.first().getAttribute("href")
    : null;
  if (storyHref) await visit(storyHref);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/", { waitUntil: "networkidle" });
  const mobileMenu = page.locator("details.site-mobile-menu");
  await mobileMenu.locator("summary").click();
  const mobileHrefs = await mobileMenu
    .locator("a[href]")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")),
    );
  expect(mobileHrefs).toEqual(
    expect.arrayContaining([
      "/",
      "/news",
      "/projects",
      "/campaigns",
      "/volunteer",
      "/restore",
    ]),
  );
  for (const href of mobileHrefs.filter((value): value is string =>
    Boolean(value),
  )) {
    if (href.startsWith("/")) await visit(href);
  }
});
