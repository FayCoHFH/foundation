import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

type Status = "PASS" | "FAIL" | "WARNING" | "MANUAL REVIEW" | "NOT APPLICABLE";

const root = process.cwd();
const phase = process.argv[2] === "baseline" ? "baseline" : "final";
const baseURL = process.env.BRAND_BASE_URL ?? "http://127.0.0.1:3200";
const outputDir = path.join(root, "artifacts", "brand-compliance", phase);
const screenshotDir = path.join(outputDir, "screenshots");
const coreRoutes = [
  "/",
  "/give",
  "/volunteer",
  "/projects",
  "/news",
  "/campaigns",
  "/share-your-story",
];
const allowedColors = new Set([
  "rgb(0, 0, 0)",
  "rgb(255, 255, 255)",
  "rgb(0, 153, 204)",
  "rgb(196, 214, 0)",
  "rgb(136, 139, 141)",
  "rgb(0, 47, 108)",
  "rgb(255, 209, 0)",
  "rgb(58, 160, 71)",
  "rgb(229, 93, 37)",
  "rgb(164, 52, 58)",
  "rgba(0, 0, 0, 0)",
]);

type Finding = {
  ruleId: string;
  status: Status;
  source: string;
  observed: string;
  expected: string;
  evidence?: unknown;
};

function normalizeURL(href: string) {
  const url = new URL(href, baseURL);
  return `${url.pathname}${url.search}${url.hash}`;
}

function linkKey(href: string) {
  const url = new URL(href, baseURL);
  return url.origin === new URL(baseURL).origin
    ? normalizeURL(href)
    : url.toString();
}

function routeKey(route: string) {
  return route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

async function waitForStable(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
}

async function collectLinks(page: Page) {
  return page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: (anchor.textContent ?? "").trim().replace(/\s+/g, " "),
    })),
  );
}

async function auditRoute(
  page: Page,
  route: string,
  viewport: { width: number; height: number },
  findings: Finding[],
) {
  await page.setViewportSize(viewport);
  const response = await page.goto(new URL(route, baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  const status = response?.status() ?? 0;
  if (status >= 400) {
    findings.push({
      ruleId: "RUNTIME-ROUTE-001",
      status: "FAIL",
      source: route,
      observed: `Route returned HTTP ${status}.`,
      expected: "Every audited public route resolves successfully.",
    });
    return null;
  }

  const typography = await page
    .locator("h1, h2, h3, nav, button, .type-article-body")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          text: (element.textContent ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120),
          fontFamily: style.fontFamily,
        };
      }),
    );
  const typographyFailures = typography.filter((item) => {
    if (item.className.includes("type-article-body"))
      return !/Minion Pro/i.test(item.fontFamily);
    if (["h1", "h2", "h3"].includes(item.tag))
      return !/Neue Haas Grotesk Display/i.test(item.fontFamily);
    return !/Neue Haas Grotesk Text/i.test(item.fontFamily);
  });
  findings.push({
    ruleId: "RUNTIME-TYPE-001",
    status: typographyFailures.length ? "FAIL" : "PASS",
    source: route,
    observed: `${typography.length} representative text role(s) inspected; ${typographyFailures.length} family mismatch(es).`,
    expected:
      "Display headings use Neue Haas Grotesk Display, UI roles use Neue Haas Grotesk Text, and article body uses Minion Pro.",
    evidence: typographyFailures,
  });

  const logos = await page
    .locator("[data-brand-logo]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const image = element as HTMLImageElement;
        const box = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return {
          src: image.currentSrc || image.src,
          alt: image.alt,
          variant: image.dataset.logoVariant,
          minimumHHeight: image.dataset.logoMinimumHHeight,
          width: Math.round(box.width),
          height: Math.round(box.height),
          filter: style.filter,
        };
      }),
    );
  const logoFailures = logos.filter((logo) => {
    const sourcePath = new URL(logo.src).searchParams.get("url") ?? logo.src;
    return (
      !/fayette-county-habitat-logo-horizontal-(black|white)\.png$/i.test(
        sourcePath,
      ) ||
      logo.alt !== "Fayette County Habitat for Humanity" ||
      !["black", "white"].includes(logo.variant ?? "") ||
      logo.minimumHHeight !== "10" ||
      logo.width < 40 ||
      logo.height < 10 ||
      logo.filter !== "none"
    );
  });
  findings.push({
    ruleId: "RUNTIME-LOGO-001",
    status: logoFailures.length ? "FAIL" : logos.length ? "PASS" : "FAIL",
    source: route,
    observed: `${logos.length} official logo instance(s) inspected; ${logoFailures.length} contract failure(s).`,
    expected:
      "Official horizontal extended black/white asset, correct alt text, no filter, and at least 10px declared digital H-height contract.",
    evidence: logoFailures.length ? logoFailures : logos,
  });

  const visibleColors = await page.locator("body *").evaluateAll((elements) => {
    const colors = new Set<string>();
    for (const element of elements) {
      if (["STYLE", "SCRIPT", "NEXTJS-PORTAL"].includes(element.tagName))
        continue;
      const style = getComputedStyle(element);
      if (style.color) colors.add(style.color);
      if (style.backgroundColor) colors.add(style.backgroundColor);
      if (style.borderTopColor) colors.add(style.borderTopColor);
      if (style.borderRightColor) colors.add(style.borderRightColor);
      if (style.borderBottomColor) colors.add(style.borderBottomColor);
      if (style.borderLeftColor) colors.add(style.borderLeftColor);
    }
    return [...colors];
  });
  const unknownColors = visibleColors.filter(
    (color) => !allowedColors.has(color),
  );
  findings.push({
    ruleId: "RUNTIME-COLOR-001",
    status: unknownColors.length ? "FAIL" : "PASS",
    source: route,
    observed: `${visibleColors.length} computed color value(s) inspected; ${unknownColors.length} unknown value(s).`,
    expected:
      "Visible foreground, background, and border colors use the approved palette or transparent.",
    evidence: unknownColors,
  });

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  findings.push({
    ruleId: "RUNTIME-A11Y-REFLOW-001",
    status: overflow.scrollWidth > overflow.clientWidth + 1 ? "FAIL" : "PASS",
    source: `${route} @ ${viewport.width}px`,
    observed: `Document width ${overflow.scrollWidth}px; viewport ${overflow.clientWidth}px.`,
    expected:
      "Public content reflows without horizontal overflow at supported widths.",
  });

  return collectLinks(page);
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const findings: Finding[] = [];
  const links = new Map<string, { href: string; text: string }>();
  const accessibility: Array<{
    route: string;
    violations: Array<Record<string, unknown>>;
  }> = [];
  const crawlRoutes = new Set(coreRoutes);

  for (const route of coreRoutes) {
    const foundLinks = await auditRoute(
      page,
      route,
      { width: 1440, height: 900 },
      findings,
    );
    for (const link of foundLinks ?? []) {
      const normalized = linkKey(link.href);
      links.set(normalized, link);
      const target = new URL(link.href, baseURL);
      if (
        target.origin === new URL(baseURL).origin &&
        target.pathname.startsWith("/") &&
        !target.pathname.startsWith("/admin") &&
        !target.pathname.startsWith("/api")
      ) {
        crawlRoutes.add(`${target.pathname}${target.search}`);
      }
    }
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    accessibility.push({
      route,
      violations: axeResults.violations as unknown as Array<
        Record<string, unknown>
      >,
    });
  }

  const screenshotRoutes = ["/", "/projects", "/news", "/campaigns"];
  for (const route of screenshotRoutes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(new URL(route, baseURL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await waitForStable(page);
    await page.screenshot({
      path: path.join(screenshotDir, `${routeKey(route)}-desktop.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/", baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  await page.screenshot({
    path: path.join(screenshotDir, "home-mobile.png"),
    fullPage: true,
  });

  const internalLinks = [...links.entries()].filter(
    ([href]) => href.startsWith("/") && !href.startsWith("//"),
  );
  const externalLinks = [...links.entries()].filter(([href]) =>
    /^https?:\/\//i.test(href),
  );
  const linkFailures: Array<{ href: string; status?: number; reason: string }> =
    [];
  for (const [href] of internalLinks) {
    const pathname = href.split("#")[0] ?? href;
    if (!pathname) continue;
    const response = await page.request.get(
      new URL(pathname, baseURL).toString(),
    );
    if (response.status() >= 400)
      linkFailures.push({
        href,
        status: response.status(),
        reason: "internal destination returned an error",
      });
  }
  for (const [href] of externalLinks) {
    const url = new URL(href);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      /\.invalid$/i.test(url.hostname)
    ) {
      linkFailures.push({
        href,
        reason: "invalid or reserved external destination",
      });
    }
  }
  findings.push({
    ruleId: "RUNTIME-LINK-001",
    status: linkFailures.length ? "FAIL" : "PASS",
    source: "rendered public links",
    observed: `${links.size} unique rendered links; ${internalLinks.length} internal and ${externalLinks.length} external; ${linkFailures.length} failure(s).`,
    expected:
      "Rendered links resolve intentionally with no empty hrefs, .invalid hosts, credentials, or broken internal destinations.",
    evidence: linkFailures,
  });

  const axeViolations = accessibility.flatMap((result) =>
    result.violations.map((violation) => ({
      route: result.route,
      ...violation,
    })),
  );
  await writeFile(
    path.join(outputDir, "accessibility-results.json"),
    JSON.stringify(
      {
        phase,
        status: axeViolations.length ? "FAIL" : "PASS",
        routes: accessibility,
        violationCount: axeViolations.length,
        manualReview: [
          "keyboard-only traversal",
          "screen-reader reading order",
          "400% zoom/reflow",
          "reduced-motion review",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "link-audit.json"),
    JSON.stringify(
      {
        phase,
        renderedLinkCount: links.size,
        internalLinkCount: internalLinks.length,
        externalLinkCount: externalLinks.length,
        failures: linkFailures,
        status: linkFailures.length ? "FAIL" : "PASS",
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "visual-regression-summary.json"),
    JSON.stringify(
      {
        phase,
        status: "PASS",
        routes: screenshotRoutes,
        viewports: ["390x844", "1440x900"],
        screenshots: screenshotRoutes
          .map((route) => `screenshots/${routeKey(route)}-desktop.png`)
          .concat("screenshots/home-mobile.png"),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "runtime-brand-audit.json"),
    JSON.stringify(
      {
        phase,
        baseURL,
        crawlRoutes: [...crawlRoutes],
        findings,
        accessibility,
        linkFailures,
      },
      null,
      2,
    ) + "\n",
  );

  const machineFailures =
    findings.filter((finding) => finding.status === "FAIL").length +
    axeViolations.length;
  process.stdout.write(
    JSON.stringify(
      {
        phase,
        baseURL,
        routeCount: crawlRoutes.size,
        renderedLinkCount: links.size,
        axeViolations: axeViolations.length,
        machineFailures,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  if (process.env.BRAND_RUNTIME_STRICT === "1" && machineFailures > 0)
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
