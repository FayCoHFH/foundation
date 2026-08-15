import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { testAuthSecret } from "../../playwright.config";
import type { NewsWorkflowNoticeCode } from "@/app/admin/communications/news/workflow-notice";

type NewsFixture =
  "news-contributor" | "news-editor" | "news-manager" | "platform-admin";

async function establishFixture(page: Page, fixture: NewsFixture) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

async function completeWorkflowAction(
  page: Page,
  name: string,
  code: NewsWorkflowNoticeCode,
) {
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    code,
  );
}

async function createAndReleaseNews(
  browser: Browser,
  input: {
    headline: string;
    summary: string;
    body: string;
    slug: string;
    expiresAt?: string;
  },
) {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "news-contributor");
  await contributor.goto("/admin/communications/news/new");
  await contributor.getByLabel("Headline").fill(input.headline);
  await contributor.getByLabel("Summary").fill(input.summary);
  await contributor.getByLabel("Body").fill(input.body);
  if (input.expiresAt)
    await contributor.getByLabel("Expiration (optional)").fill(input.expiresAt);
  await contributor.getByRole("button", { name: "Save News draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/news\/[0-9a-f-]+$/,
  );
  const draftUrl = contributor.url();
  await completeWorkflowAction(contributor, "Submit for review", "submit");
  await expect(contributor.getByText(/IN REVIEW/)).toBeVisible();

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "news-editor");
  await editor.goto(draftUrl);
  await expect(editor.getByText("IN REVIEW")).toBeVisible();
  await completeWorkflowAction(editor, "Send for approval", "approval");
  await expect(editor.getByText(/PENDING APPROVAL/)).toBeVisible();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "news-manager");
  await manager.goto(draftUrl);
  await expect(manager.getByText("PENDING APPROVAL")).toBeVisible();
  await completeWorkflowAction(manager, "Approve exact revision", "approve");
  await expect(manager.getByText(/APPROVED/)).toBeVisible();
  await manager.getByLabel("Canonical URL slug").fill(input.slug);
  await completeWorkflowAction(
    manager,
    "Release immutable public snapshot",
    "release",
  );
  await expect(manager.getByText(/PUBLISHED/)).toBeVisible();

  return { contributor, contributorContext, draftUrl, manager, managerContext };
}

test("News browser workflow preserves public snapshots and exposes truthful structured data", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString(36);
  const earlier = await createAndReleaseNews(browser, {
    headline: `Earlier current News ${suffix}`,
    summary: "An earlier current update.",
    body: "Earlier released News body.",
    slug: `earlier-current-news-${suffix}`,
  });
  const headline = `Current featured News ${suffix}`;
  const summary = "A concise current News summary.";
  const body = "Released News body stays public until a successor releases.";
  const slug = `current-featured-news-${suffix}`;
  const current = await createAndReleaseNews(browser, {
    headline,
    summary,
    body,
    slug,
  });
  await completeWorkflowAction(
    current.manager,
    "Set as Featured News",
    "feature",
  );

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await expect
    .poll(async () => {
      await reader.goto("/news");
      return await reader
        .getByRole("heading", { level: 2, name: "Featured news" })
        .count();
    })
    .toBe(1);
  await expect(
    reader.getByRole("heading", { level: 1, name: "News & updates" }),
  ).toBeVisible();
  await expect(
    reader.getByRole("heading", { level: 2, name: "Featured news" }),
  ).toBeVisible();
  await expect(reader.getByRole("link", { name: headline })).toHaveCount(2);
  const latestLinks = reader.locator("ol a");
  await expect(latestLinks.nth(0)).toHaveText(headline);
  await expect(latestLinks.nth(1)).toHaveText(`Earlier current News ${suffix}`);
  expect((await new AxeBuilder({ page: reader }).analyze()).violations).toEqual(
    [],
  );

  await reader.goto(`/news/${slug}`);
  await expect(
    reader.getByRole("heading", { level: 1, name: headline }),
  ).toBeVisible();
  await expect(reader.getByText(summary)).toBeVisible();
  await expect(reader.getByText(body)).toBeVisible();
  await expect
    .poll(() =>
      reader
        .locator(".editorial-arrival")
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect(reader.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`/news/${slug}$`),
  );
  await expect(reader.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    headline,
  );
  const structuredData = await reader
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts.map((script) => JSON.parse(script.textContent ?? "{}")),
    );
  const article = structuredData.find(
    (value) => value["@type"] === "NewsArticle",
  );
  expect(article).toMatchObject({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description: summary,
    mainEntityOfPage: `http://127.0.0.1:3100/news/${slug}`,
  });
  expect(article.datePublished).toBe(
    await reader.locator("time").getAttribute("datetime"),
  );
  expect(article).not.toHaveProperty("author");
  expect(article).not.toHaveProperty("image");
  expect(article).not.toHaveProperty("dateModified");
  expect(JSON.stringify(article)).not.toContain("private");
  expect((await new AxeBuilder({ page: reader }).analyze()).violations).toEqual(
    [],
  );

  await current.contributor.goto(current.draftUrl);
  await current.contributor
    .getByLabel("Headline")
    .fill(`Draft successor ${suffix}`);
  await current.contributor
    .getByLabel("Summary")
    .fill("Private successor summary.");
  await current.contributor.getByLabel("Body").fill("Private successor body.");
  await current.contributor
    .getByRole("button", { name: "Save News draft" })
    .click();
  await reader.reload();
  await expect(
    reader.getByRole("heading", { level: 1, name: headline }),
  ).toBeVisible();
  await expect(reader.getByText(body)).toBeVisible();
  await expect(reader.getByText("Private successor body.")).toHaveCount(0);

  await completeWorkflowAction(
    current.contributor,
    "Submit for review",
    "submit",
  );
  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "news-editor");
  await editor.goto(current.draftUrl);
  await completeWorkflowAction(editor, "Send for approval", "approval");
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "news-manager");
  await manager.goto(current.draftUrl);
  await completeWorkflowAction(manager, "Approve exact revision", "approve");
  await manager.getByLabel("Canonical URL slug").fill(slug);
  await completeWorkflowAction(
    manager,
    "Release immutable public snapshot",
    "release",
  );
  await reader.reload();
  await expect(
    reader.getByRole("heading", {
      level: 1,
      name: `Draft successor ${suffix}`,
    }),
  ).toBeVisible();
  await expect(reader.getByText("Private successor body.")).toBeVisible();

  await completeWorkflowAction(
    current.manager,
    "Clear Featured News",
    "clear-feature",
  );
  await expect
    .poll(async () => {
      await reader.goto("/news");
      return await reader
        .getByRole("heading", { level: 2, name: "Featured news" })
        .count();
    })
    .toBe(0);

  await editorContext.close();
  await managerContext.close();
  await readerContext.close();
  await earlier.contributorContext.close();
  await earlier.managerContext.close();
  await current.contributorContext.close();
  await current.managerContext.close();
});

test("expired News is directly readable, excluded from discovery and feature controls, then withdrawn", async ({
  browser,
}) => {
  test.setTimeout(45_000);
  const suffix = Date.now().toString(36);
  const slug = `expired-news-${suffix}`;
  const expired = await createAndReleaseNews(browser, {
    headline: `Expired News ${suffix}`,
    summary: "An expired update remains traceable by its direct URL.",
    body: "Expired News body.",
    slug,
    expiresAt: "2000-01-01T00:00",
  });
  await expect(
    expired.manager.getByRole("button", { name: "Set as Featured News" }),
  ).toHaveCount(0);
  const reader = await browser.newPage();
  await reader.goto("/news");
  await expect(reader.getByText(`Expired News ${suffix}`)).toHaveCount(0);
  await reader.goto(`/news/${slug}`);
  await expect(
    reader.getByRole("heading", { level: 1, name: `Expired News ${suffix}` }),
  ).toBeVisible();
  await expired.manager.getByLabel("Withdrawal reason").fill("E2E withdrawal");
  await completeWorkflowAction(
    expired.manager,
    "Withdraw public News",
    "withdraw",
  );
  await expect(expired.manager.getByText(/WITHDRAWN/)).toBeVisible();
  await expect
    .poll(async () => {
      await reader.goto(`/news/${slug}`);
      return await reader
        .getByRole("heading", {
          level: 1,
          name: "This page is not available.",
        })
        .count();
    })
    .toBe(1);
  await reader.context().close();
  await expired.contributorContext.close();
  await expired.managerContext.close();
});

test("News admin creation is capability-gated and has no automated axe violations", async ({
  browser,
}) => {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "news-contributor");
  await contributor.goto("/admin/communications/news/new");
  await expect(
    contributor.getByRole("heading", { level: 1, name: "Create News draft" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page: contributor }).analyze()).violations,
  ).toEqual([]);

  const deniedContext = await browser.newContext();
  const denied = await deniedContext.newPage();
  await establishFixture(denied, "platform-admin");
  await denied.goto("/admin/communications/news/new");
  await expect(denied).toHaveURL(/\/admin\/access-denied$/);

  await contributorContext.close();
  await deniedContext.close();
});
