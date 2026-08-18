import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { testAuthSecret } from "../../playwright.config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type StoryFixture = "story-contributor" | "story-editor" | "story-manager";
type NewsFixture = "news-contributor" | "news-editor" | "news-manager";
type AuthFixture = StoryFixture | NewsFixture | "platform-admin" | "denied";
type HomepageKey = "HOME_HERO" | "HOME_FEATURED_STORY" | "HOME_FEATURED_NEWS";

const database = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

test.afterAll(async () => {
  await database.$disconnect();
});

async function establishFixture(page: Page, fixture: AuthFixture) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

async function submitButton(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await button.evaluate((element) => {
    const submitter = element as HTMLButtonElement;
    submitter.form?.requestSubmit(submitter);
  });
}

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectAxe(page: Page) {
  const arrival = page.locator(".editorial-arrival");
  if (await arrival.count()) {
    await expect
      .poll(() =>
        arrival.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function captureAtViewports(page: Page, name: string) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1100 },
    { width: 1920, height: 1200 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: test
        .info()
        .outputPath(`${name}-${viewport.width}x${viewport.height}.png`),
    });
  }
}

async function createAndReleaseStory(
  browser: Browser,
  input: {
    headline: string;
    deck: string;
    excerpt: string;
    body: string;
    slug: string;
  },
) {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "story-contributor");
  await contributor.goto("/admin/communications/stories/new");
  await contributor.getByLabel("Story title").fill(input.headline);
  await contributor.getByLabel("Deck").fill(input.deck);
  await contributor.getByLabel("Excerpt").fill(input.excerpt);
  await contributor.getByLabel("Story body").fill(input.body);
  await contributor.getByRole("button", { name: "Create Story draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/stories\/[0-9a-f-]+$/,
  );
  const draftUrl = contributor.url();
  const storyId = draftUrl.split("/").at(-1)!;

  await submitButton(contributor, "Submit for review");
  await expect(
    contributor.getByText("IN REVIEW", { exact: true }),
  ).toBeVisible();

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "story-editor");
  await editor.goto(draftUrl);
  await editor.getByRole("button", { name: "Send for approval" }).click();
  await expect(
    editor.getByText("PENDING APPROVAL", { exact: true }),
  ).toBeVisible();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "story-manager");
  await manager.goto(draftUrl);
  await submitButton(manager, "Approve exact revision");
  await expect(manager.getByText("APPROVED", { exact: true })).toBeVisible();
  await manager.getByLabel("Canonical URL slug").fill(input.slug);
  await submitButton(manager, "Release immutable public snapshot");
  await expect(manager.getByText("PUBLISHED", { exact: true })).toBeVisible();

  const story = await database.story.findUniqueOrThrow({
    where: { id: storyId },
    select: { publicationId: true },
  });
  return {
    ...input,
    storyId,
    publicationId: story.publicationId,
    draftUrl,
    contributor,
    contributorContext,
    editorContext,
    manager,
    managerContext,
  };
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
  if (input.expiresAt) {
    await contributor.getByLabel("Expiration (optional)").fill(input.expiresAt);
  }
  await contributor.getByRole("button", { name: "Save News draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/news\/[0-9a-f-]+$/,
  );
  const draftUrl = contributor.url();
  const newsId = draftUrl.split("/").at(-1)!;
  await contributor.getByRole("button", { name: "Submit for review" }).click();
  await expect(contributor.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    "submit",
  );

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "news-editor");
  await editor.goto(draftUrl);
  await editor.getByRole("button", { name: "Send for approval" }).click();
  await expect(editor.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    "approval",
  );

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "news-manager");
  await manager.goto(draftUrl);
  await manager.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(manager.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    "approve",
  );
  await manager.getByLabel("Canonical URL slug").fill(input.slug);
  await manager
    .getByRole("button", { name: "Release immutable public snapshot" })
    .click();
  await expect(manager.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    "release",
  );

  const news = await database.newsItem.findUniqueOrThrow({
    where: { id: newsId },
    select: { publicationId: true },
  });
  return {
    ...input,
    newsId,
    publicationId: news.publicationId,
    draftUrl,
    contributor,
    contributorContext,
    editorContext,
    manager,
    managerContext,
  };
}

function sectionFor(page: Page, key: HomepageKey) {
  return page.locator("section").filter({
    has: page.getByRole("heading", {
      name: key.replaceAll("_", " "),
      exact: true,
    }),
  });
}

async function homepageAction(
  page: Page,
  key: HomepageKey,
  action: "Assign" | "Schedule" | "Clear" | "Cancel upcoming",
  notice: "assign" | "schedule" | "clear" | "cancel",
  publicationId?: string,
) {
  const form = page.locator(
    `form:has(input[name="placement"][value="${key}"])`,
  );
  await expect(form).toHaveCount(1);
  if (publicationId) {
    const select = form.getByLabel(`${key} eligible content`);
    await select.selectOption(publicationId);
    await select.evaluate((element, value) => {
      const input = element as HTMLSelectElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, publicationId);
    await expect(select).toHaveValue(publicationId);
  }
  const button = form.getByRole("button", { name: action, exact: true });
  await button.evaluate((element) => {
    const submitter = element as HTMLButtonElement;
    submitter.form?.requestSubmit(submitter);
  });
  await expect(page.locator(`[data-notice-code="${notice}"]`)).toBeVisible();
  await page.goto("/admin/communications/homepage");
}

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("homepage curation covers configured, scheduled, cancelled, cleared, empty, and accessible states", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const story = await createAndReleaseStory(browser, {
    headline: `C4.3A Story ${suffix}`,
    deck: "A Story selected for the homepage hero.",
    excerpt: "A Story selected for homepage curation.",
    body: "The released Story body remains public.",
    slug: `c43a-story-${suffix}`,
  });
  const featuredNews = await createAndReleaseNews(browser, {
    headline: `C4.3A Featured News ${suffix}`,
    summary: "A News item selected for the homepage.",
    body: "The released News body remains public.",
    slug: `c43a-featured-news-${suffix}`,
  });
  const latestNews = await createAndReleaseNews(browser, {
    headline: `C4.3A Latest News ${suffix}`,
    summary: "A second News item for deterministic latest ordering.",
    body: "The latest News body remains public.",
    slug: `c43a-latest-news-${suffix}`,
  });
  const manager = story.manager;
  const errors = diagnostics(manager);

  await manager.goto("/admin/communications/homepage");
  await expect(
    manager.getByRole("heading", { level: 1, name: "Homepage curation" }),
  ).toBeVisible();
  for (const key of [
    "HOME_HERO",
    "HOME_FEATURED_STORY",
    "HOME_FEATURED_NEWS",
  ] as const) {
    await expect(sectionFor(manager, key)).toBeVisible();
  }
  await expectAxe(manager);
  await captureAtViewports(manager, "homepage-admin-initial");

  const heroSection = sectionFor(manager, "HOME_HERO");
  const scheduleInput = heroSection.getByLabel("HOME_HERO future activation");
  await expect(scheduleInput).toHaveAttribute("required", "");
  await heroSection
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await expect(scheduleInput).toBeFocused();
  expect(
    await scheduleInput.evaluate(
      (element) => !(element as HTMLInputElement).checkValidity(),
    ),
  ).toBe(true);

  await homepageAction(
    manager,
    "HOME_HERO",
    "Assign",
    "assign",
    story.publicationId,
  );
  await homepageAction(
    manager,
    "HOME_HERO",
    "Assign",
    "assign",
    featuredNews.publicationId,
  );
  await homepageAction(
    manager,
    "HOME_FEATURED_STORY",
    "Assign",
    "assign",
    story.publicationId,
  );
  await homepageAction(
    manager,
    "HOME_FEATURED_NEWS",
    "Assign",
    "assign",
    featuredNews.publicationId,
  );

  await manager.goto("/admin/communications/homepage");
  await expectAxe(manager);
  const future = new Date(Date.now() + 5 * 60 * 1000);
  await sectionFor(manager, "HOME_HERO")
    .getByLabel("HOME_HERO eligible content")
    .selectOption(story.publicationId);
  await sectionFor(manager, "HOME_HERO")
    .getByLabel("HOME_HERO future activation")
    .fill(localDateTime(future));
  await sectionFor(manager, "HOME_HERO")
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await expect(manager.locator('[data-notice-code="schedule"]')).toBeVisible();
  await expect(manager.getByText(`Upcoming: ${story.headline}`)).toBeVisible();
  await expectAxe(manager);
  await captureAtViewports(manager, "homepage-admin-upcoming");
  await homepageAction(manager, "HOME_HERO", "Cancel upcoming", "cancel");
  await expect(manager.getByText(`Upcoming: ${story.headline}`)).toHaveCount(0);

  await manager.goto("/");
  await expect(
    manager.getByRole("heading", {
      level: 1,
      name: "Building and repairing homes with neighbors across Fayette County.",
    }),
  ).toBeVisible();
  await expect(
    manager.getByText("Featured story", { exact: true }),
  ).toBeVisible();
  await expect(
    manager.getByRole("link", { name: story.headline, exact: true }),
  ).toHaveAttribute("href", `/stories/${story.slug}`);
  await expect(
    manager.getByText("Featured news", { exact: true }),
  ).toBeVisible();
  await expect(
    manager.locator("#featured-news").getByRole("link", {
      name: featuredNews.headline,
      exact: true,
    }),
  ).toHaveAttribute("href", `/news/${featuredNews.slug}`);
  await expect(
    manager.getByRole("heading", {
      level: 2,
      name: "Keep up with the work.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    manager.getByText(latestNews.headline, { exact: true }),
  ).toBeVisible();
  await expect(
    manager.getByRole("heading", { name: "Keep up with the work." }),
  ).toBeVisible();
  await expect(manager.locator("body")).not.toContainText("undefined");
  await expectAxe(manager);
  await captureAtViewports(manager, "homepage-configured");

  const skipLink = manager.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.click();
  await expect(manager.getByRole("main")).toBeFocused();

  await manager.goto("/news");
  await expect(
    manager.getByRole("heading", { level: 1, name: "News & updates" }),
  ).toBeVisible();
  await expect(
    manager.getByRole("heading", {
      level: 2,
      name: "Latest news",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    manager.getByRole("link", { name: latestNews.headline, exact: true }),
  ).toHaveAttribute("href", `/news/${latestNews.slug}`);
  await expectAxe(manager);
  await captureAtViewports(manager, "news-index-featured");

  await manager.goto(`/news/${featuredNews.slug}`);
  await expect(
    manager.getByRole("heading", { level: 1, name: featuredNews.headline }),
  ).toBeVisible();
  await expect(manager.getByText(featuredNews.summary)).toBeVisible();
  await expect(manager.getByText(featuredNews.body)).toBeVisible();
  await expectAxe(manager);
  await captureAtViewports(manager, "news-detail-reference");

  const storyReaderContext = await browser.newContext();
  const storyReader = await storyReaderContext.newPage();
  const storyErrors = diagnostics(storyReader);
  await storyReader.goto(`/stories/${story.slug}`);
  await expect(
    storyReader.getByRole("heading", { level: 1, name: story.headline }),
  ).toBeVisible();
  await expectAxe(storyReader);
  await captureAtViewports(storyReader, "story-detail-reference");

  for (const key of [
    "HOME_HERO",
    "HOME_FEATURED_STORY",
    "HOME_FEATURED_NEWS",
  ] as const) {
    await manager.goto("/admin/communications/homepage");
    await homepageAction(manager, key, "Clear", "clear");
  }
  await manager.goto("/");
  await expect(
    manager.getByRole("heading", {
      level: 1,
      name: "Building and repairing homes with neighbors across Fayette County.",
    }),
  ).toBeVisible();
  await expect(
    manager.getByRole("heading", { level: 2, name: /Featured story/i }),
  ).toHaveCount(0);
  await expect(
    manager.getByRole("heading", { level: 2, name: /Featured news/i }),
  ).toHaveCount(0);
  await expect(
    manager.getByRole("heading", {
      level: 2,
      name: "Keep up with the work.",
    }),
  ).toBeVisible();
  await expect(
    manager.getByRole("heading", { name: "Keep up with the work." }),
  ).toBeVisible();
  await expect(
    manager.getByRole("navigation", { name: "Public navigation" }),
  ).toBeVisible();
  await expect(manager.getByRole("contentinfo")).toBeVisible();
  await expect(manager.locator("body")).not.toContainText("undefined");
  await expectAxe(manager);
  await captureAtViewports(manager, "homepage-empty");
  expect(errors).toEqual([]);
  expect(storyErrors).toEqual([]);

  await storyReaderContext.close();
  await story.contributorContext.close();
  await story.editorContext.close();
  await story.managerContext.close();
  await featuredNews.contributorContext.close();
  await featuredNews.editorContext.close();
  await featuredNews.managerContext.close();
  await latestNews.contributorContext.close();
  await latestNews.editorContext.close();
  await latestNews.managerContext.close();
});

test("homepage curation enforces access and excludes expired, withdrawn, and ended content", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const deniedContext = await browser.newContext();
  const denied = await deniedContext.newPage();
  const deniedErrors = diagnostics(denied);
  await establishFixture(denied, "platform-admin");
  await denied.goto("/admin/communications/homepage");
  await expect(denied).toHaveURL(/\/admin\/communications\/homepage$/);
  await expect(
    denied.getByRole("heading", { name: "Homepage curation" }),
  ).toBeVisible();
  await expect(denied.getByLabel("HOME_HERO eligible content")).toHaveCount(0);
  await expect(denied.locator("[data-notice-code]")).toHaveCount(0);
  await expectAxe(denied);

  const unauthenticatedContext = await browser.newContext();
  const unauthenticated = await unauthenticatedContext.newPage();
  await establishFixture(unauthenticated, "denied");
  await unauthenticated.goto("/admin/communications/homepage");
  await expect(unauthenticated).toHaveURL(/\/admin\/access-denied$/);
  await expect(
    unauthenticated.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await expectAxe(unauthenticated);

  const suffix = Date.now().toString(36);
  const expired = await createAndReleaseNews(browser, {
    headline: `C4.3A Expired News ${suffix}`,
    summary: "This News item is expired.",
    body: "Expired News must not be selectable for homepage placement.",
    slug: `c43a-expired-news-${suffix}`,
    expiresAt: "2000-01-01T00:00",
  });
  const withdrawn = await createAndReleaseStory(browser, {
    headline: `C4.3A Withdrawn Story ${suffix}`,
    deck: "A withdrawn Story.",
    excerpt: "A withdrawn Story must not be selectable.",
    body: "Withdrawn Story body.",
    slug: `c43a-withdrawn-story-${suffix}`,
  });
  await withdrawn.manager
    .getByLabel("Withdrawal reason")
    .fill("C4.3A eligibility fixture");
  await submitButton(withdrawn.manager, "Withdraw public Story");
  await expect(
    withdrawn.manager.getByText("WITHDRAWN", { exact: true }),
  ).toBeVisible();

  const eligibilityManager = expired.manager;
  const managerErrors = diagnostics(eligibilityManager);
  await eligibilityManager.goto("/admin/communications/homepage");
  await expect(
    eligibilityManager.locator("option").filter({ hasText: expired.headline }),
  ).toHaveCount(0);
  await expect(
    eligibilityManager
      .locator("option")
      .filter({ hasText: withdrawn.headline }),
  ).toHaveCount(0);

  const ended = await createAndReleaseStory(browser, {
    headline: `C4.3A Ended Story ${suffix}`,
    deck: "An ended placement fixture.",
    excerpt: "An ended placement must not remain effective.",
    body: "Ended placement body.",
    slug: `c43a-ended-story-${suffix}`,
  });
  const manager = ended.manager;
  await manager.goto("/admin/communications/homepage");
  await homepageAction(
    manager,
    "HOME_HERO",
    "Assign",
    "assign",
    ended.publicationId,
  );
  const placement = await database.contentPlacement.findFirstOrThrow({
    where: { key: "HOME_HERO", publicationId: ended.publicationId },
  });
  await database.contentPlacement.update({
    where: { id: placement.id },
    data: {
      endsAt: new Date(placement.startsAt.getTime() + 1),
    },
  });
  await manager.goto("/admin/communications/homepage");
  await expect(sectionFor(manager, "HOME_HERO")).toContainText(
    "No effective assignment",
  );
  await manager.goto("/");
  await expect(
    manager.getByRole("heading", {
      level: 1,
      name: "Building and repairing homes with neighbors across Fayette County.",
    }),
  ).toBeVisible();
  await expect(manager.getByText(ended.headline, { exact: true })).toHaveCount(
    0,
  );
  await expectAxe(manager);
  expect(deniedErrors).toEqual([]);
  expect(managerErrors).toEqual([]);

  await deniedContext.close();
  await unauthenticatedContext.close();
  await expired.contributorContext.close();
  await expired.editorContext.close();
  await expired.managerContext.close();
  await withdrawn.contributorContext.close();
  await withdrawn.editorContext.close();
  await withdrawn.managerContext.close();
  await ended.contributorContext.close();
  await ended.editorContext.close();
  await ended.managerContext.close();
});

test("placed Story successor stays private until release and updates without reassignment", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const story = await createAndReleaseStory(browser, {
    headline: `C4.3A Original Story ${suffix}`,
    deck: "The original public Story.",
    excerpt: "The original public Story remains visible.",
    body: "Original Story body.",
    slug: `c43a-successor-${suffix}`,
  });
  const manager = story.manager;
  await manager.goto("/admin/communications/homepage");
  await homepageAction(
    manager,
    "HOME_HERO",
    "Assign",
    "assign",
    story.publicationId,
  );

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  const errors = diagnostics(reader);
  await reader.goto("/");
  await expect(
    reader.getByRole("link", { name: story.headline, exact: true }),
  ).toBeVisible();

  await story.contributor.goto(story.draftUrl);
  await story.contributor
    .getByLabel("Story title")
    .fill(`C4.3A Successor Story ${suffix}`);
  await story.contributor.getByLabel("Deck").fill("The successor deck.");
  await story.contributor.getByLabel("Excerpt").fill("The successor excerpt.");
  await story.contributor
    .getByLabel("Story body")
    .fill("Successor Story body.");
  await submitButton(story.contributor, "Save successor revision");
  await expect(
    story.contributor.getByText("DRAFT", { exact: true }),
  ).toBeVisible();
  await reader.reload();
  await expect(
    reader.getByRole("link", { name: story.headline, exact: true }),
  ).toBeVisible();
  await expect(reader.getByText("Successor Story body.")).toHaveCount(0);

  await submitButton(story.contributor, "Submit for review");
  await expect(
    story.contributor.getByText("IN REVIEW", { exact: true }),
  ).toBeVisible();
  const editor = story.editorContext.pages()[0]!;
  await editor.goto(story.draftUrl);
  await expect(editor.getByText("IN REVIEW", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Send for approval" }).click();
  await expect(
    editor.getByText("PENDING APPROVAL", { exact: true }),
  ).toBeVisible();
  await story.manager.goto(story.draftUrl);
  await expect(
    story.manager.getByText("PENDING APPROVAL", { exact: true }),
  ).toBeVisible();
  await submitButton(story.manager, "Approve exact revision");
  await expect(
    story.manager.getByText("APPROVED", { exact: true }),
  ).toBeVisible();
  await story.manager.getByLabel("Canonical URL slug").fill(story.slug);
  await submitButton(story.manager, "Release immutable public snapshot");
  await expect(
    story.manager.getByText("PUBLISHED", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      await reader.reload();
      return await reader
        .getByRole("link", {
          name: `C4.3A Successor Story ${suffix}`,
          exact: true,
        })
        .count();
    })
    .toBe(1);
  await expect(reader.getByText("The successor deck.")).toBeVisible();
  await reader.goto(`/stories/${story.slug}`);
  await expect(
    reader.getByRole("heading", {
      level: 1,
      name: `C4.3A Successor Story ${suffix}`,
    }),
  ).toBeVisible();
  await expect(reader.getByText("Successor Story body.")).toBeVisible();
  await expectAxe(reader);
  await captureAtViewports(reader, "homepage-successor-story");
  expect(errors).toEqual([]);

  await story.manager.goto("/admin/communications/homepage");
  await homepageAction(story.manager, "HOME_HERO", "Clear", "clear");

  await readerContext.close();
  await story.contributorContext.close();
  await story.editorContext.close();
  await story.managerContext.close();
});
