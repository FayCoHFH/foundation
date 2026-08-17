import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const START = new Date("2020-01-01T12:00:00.000Z");
const END = new Date("2099-01-01T12:00:00.000Z");
const UPCOMING_START = new Date("2090-01-01T12:00:00.000Z");
const UPCOMING_END = new Date("2091-01-01T12:00:00.000Z");
const EXPIRED_START = new Date("2019-01-01T12:00:00.000Z");
const EXPIRED_END = new Date("2020-01-01T12:00:00.000Z");

type Persona = {
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
};

type NoticeFixture = {
  id: string;
  title: string;
};

async function establishFixture(
  page: Page,
  fixture: "news-manager" | "story-editor",
) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

async function identifySession(page: Page) {
  const cookie = (await page.context().cookies()).find(
    ({ name }) => name === "better-auth.session_token",
  );
  if (!cookie) throw new Error("Test auth session cookie was not created.");
  const token = decodeURIComponent(cookie.value).split(".")[0];
  if (!token) throw new Error("Test auth session token was empty.");
  const session = await database.session.findUniqueOrThrow({
    where: { token },
    select: { userId: true },
  });
  return database.adminUser.findUniqueOrThrow({
    where: { authUserId: session.userId },
    select: { id: true, authUserId: true },
  });
}

async function persona(
  browser: Browser,
  fixture: "news-manager" | "story-editor",
  name: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page, fixture);
  const admin = await identifySession(page);
  await database.user.update({
    where: { id: admin.authUserId },
    data: { name },
  });
  const state = await context.storageState();
  await context.close();
  return { state, adminUserId: admin.id } satisfies Persona;
}

async function createNotice(
  adminUserId: string,
  input: {
    title: string;
    severity: SiteNoticeSeverity;
    targetArea: SiteNoticeTargetArea;
    lifecycle?: SiteNoticeLifecycle;
    startsAt?: Date;
    endsAt?: Date;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    updatedAt?: Date;
  },
): Promise<NoticeFixture> {
  const lifecycle = input.lifecycle ?? SiteNoticeLifecycle.DRAFT;
  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  const now = input.updatedAt ?? new Date("2026-08-01T12:00:00.000Z");
  const notice = await database.siteNotice.create({
    data: {
      title: input.title,
      message: `${input.title} safe browser fixture message.`,
      severity: input.severity,
      targetArea: input.targetArea,
      lifecycle,
      startsAt,
      endsAt,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      createdByAdminUserId: adminUserId,
      updatedByAdminUserId: adminUserId,
      publishedByAdminUserId:
        lifecycle === SiteNoticeLifecycle.PUBLISHED ||
        lifecycle === SiteNoticeLifecycle.WITHDRAWN
          ? adminUserId
          : null,
      publishedAt:
        lifecycle === SiteNoticeLifecycle.PUBLISHED ||
        lifecycle === SiteNoticeLifecycle.WITHDRAWN
          ? new Date("2026-07-01T12:00:00.000Z")
          : null,
      withdrawnByAdminUserId:
        lifecycle === SiteNoticeLifecycle.WITHDRAWN ? adminUserId : null,
      withdrawnAt:
        lifecycle === SiteNoticeLifecycle.WITHDRAWN
          ? new Date("2026-07-15T12:00:00.000Z")
          : null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return { id: notice.id, title: notice.title };
}

async function createPublicNews(browser: Browser) {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "news-manager");
  await contributor.goto("/admin/communications/news/new");
  await contributor.getByLabel("Headline").fill("C6A2B browser News");
  await contributor.getByLabel("Summary").fill("C6A2B browser News summary.");
  await contributor.getByLabel("Body").fill("C6A2B browser News body.");
  await contributor.getByRole("button", { name: "Save News draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/news\/[0-9a-f-]+$/,
  );
  const url = contributor.url();
  await contributor.getByRole("button", { name: "Submit for review" }).click();

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "news-manager");
  await editor.goto(url);
  await editor.getByRole("button", { name: "Send for approval" }).click();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "news-manager");
  await manager.goto(url);
  await manager.getByRole("button", { name: "Approve exact revision" }).click();
  await manager.getByLabel("Canonical URL slug").fill("c6a2b-browser-news");
  await manager
    .getByRole("button", { name: "Release immutable public snapshot" })
    .click();
  await expect(manager.getByRole("status")).toHaveAttribute(
    "data-notice-code",
    "release",
  );
  await contributorContext.close();
  await editorContext.close();
  await managerContext.close();
}

async function createPublicStory(browser: Browser) {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "news-manager");
  await contributor.goto("/admin/communications/stories/new");
  await contributor.getByLabel("Story title").fill("C6A2B browser Story");
  await contributor.getByLabel("Excerpt").fill("C6A2B browser Story excerpt.");
  await contributor.getByLabel("Story body").fill("C6A2B browser Story body.");
  await contributor.getByRole("button", { name: "Create Story draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/stories\/[0-9a-f-]+$/,
  );
  const url = contributor.url();
  await contributor.getByRole("button", { name: "Submit for review" }).click();

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await establishFixture(editor, "news-manager");
  await editor.goto(url);
  await editor.getByRole("button", { name: "Send for approval" }).click();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await establishFixture(manager, "news-manager");
  await manager.goto(url);
  await manager.getByRole("button", { name: "Approve exact revision" }).click();
  await manager.getByLabel("Canonical URL slug").fill("c6a2b-browser-story");
  await manager
    .getByRole("button", { name: "Release immutable public snapshot" })
    .click();
  await expect(manager.getByText("PUBLISHED", { exact: true })).toBeVisible();
  await contributorContext.close();
  await editorContext.close();
  await managerContext.close();
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
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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

async function captureResponsive(page: Page, name: string) {
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
      path: `output/playwright/${name}-${viewport.width}x${viewport.height}.png`,
    });
  }
}

test.describe("C6A-2B Site Notice browser validation", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let manager: Persona;
  let denied: Persona;
  let draft: NoticeFixture;
  let activeInfo: NoticeFixture;
  let activeOlderInfo: NoticeFixture;
  let activeUrgent: NoticeFixture;
  let activeHomepage: NoticeFixture;
  let withdrawn: NoticeFixture;
  let concurrency: NoticeFixture;
  let publishable: NoticeFixture;
  let withdrawable: NoticeFixture;

  test.beforeAll(async ({ browser }) => {
    manager = await persona(browser, "news-manager", "C6A2B Notice Manager");
    denied = await persona(browser, "story-editor", "C6A2B Editorial User");
    await createPublicNews(browser);
    await createPublicStory(browser);
    draft = await createNotice(manager.adminUserId, {
      title: "C6A2B Draft SITE_WIDE Info",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
    });
    await createNotice(manager.adminUserId, {
      title: "C6A2B Draft HOMEPAGE Important",
      severity: SiteNoticeSeverity.IMPORTANT,
      targetArea: SiteNoticeTargetArea.HOMEPAGE,
    });
    await createNotice(manager.adminUserId, {
      title: "C6A2B Upcoming SITE_WIDE",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: UPCOMING_START,
      endsAt: UPCOMING_END,
    });
    await createNotice(manager.adminUserId, {
      title: "C6A2B Active SITE_WIDE Info Recent",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: new Date("2024-01-01T12:00:00.000Z"),
      endsAt: END,
    });
    activeInfo = await createNotice(manager.adminUserId, {
      title: "C6A2B Active SITE_WIDE Info Newer",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: new Date("2023-01-01T12:00:00.000Z"),
      endsAt: END,
      ctaLabel: "Read News",
      ctaUrl: "/news",
    });
    activeOlderInfo = await createNotice(manager.adminUserId, {
      title: "C6A2B Active SITE_WIDE Info Older",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: new Date("2022-01-01T12:00:00.000Z"),
      endsAt: END,
    });
    activeUrgent = await createNotice(manager.adminUserId, {
      title: "C6A2B Active SITE_WIDE Urgent",
      severity: SiteNoticeSeverity.URGENT,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: START,
      endsAt: END,
      ctaLabel: "External details",
      ctaUrl: "https://example.org/c6a2b-details",
    });
    activeHomepage = await createNotice(manager.adminUserId, {
      title: "C6A2B Active HOMEPAGE Important",
      severity: SiteNoticeSeverity.IMPORTANT,
      targetArea: SiteNoticeTargetArea.HOMEPAGE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: START,
      endsAt: END,
    });
    await createNotice(manager.adminUserId, {
      title: "C6A2B Expired SITE_WIDE",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: EXPIRED_START,
      endsAt: EXPIRED_END,
    });
    withdrawn = await createNotice(manager.adminUserId, {
      title: "C6A2B Withdrawn SITE_WIDE",
      severity: SiteNoticeSeverity.IMPORTANT,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.WITHDRAWN,
      startsAt: START,
      endsAt: END,
    });
    concurrency = await createNotice(manager.adminUserId, {
      title: "C6A2B Concurrency Draft",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      startsAt: START,
      endsAt: END,
    });
    publishable = await createNotice(manager.adminUserId, {
      title: "C6A2B Publishable Draft",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      startsAt: START,
      endsAt: END,
    });
    withdrawable = await createNotice(manager.adminUserId, {
      title: "C6A2B Withdrawable Published",
      severity: SiteNoticeSeverity.INFO,
      targetArea: SiteNoticeTargetArea.SITE_WIDE,
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt: START,
      endsAt: END,
    });
  });

  test.afterAll(async () => {
    await database.$disconnect();
  });

  test("validates authorized routes, capability navigation, anonymous redirect, and access denial", async ({
    browser,
  }) => {
    const managerContext = await browser.newContext({
      storageState: manager.state,
    });
    const managerPage = await managerContext.newPage();
    await managerPage.goto("/admin/communications/notices");
    await expect(
      managerPage.getByRole("heading", { level: 1, name: "Site Notices" }),
    ).toBeVisible();
    await expect(
      managerPage.getByRole("link", { name: "Site Notices" }),
    ).toHaveAttribute("aria-current", "page");
    await managerPage.goto("/admin/communications/notices/new");
    await expect(
      managerPage.getByRole("heading", {
        level: 1,
        name: "Create Site Notice",
      }),
    ).toBeVisible();
    await managerPage.goto(`/admin/communications/notices/${draft.id}`);
    await expect(
      managerPage.getByRole("heading", { level: 1, name: "Edit Site Notice" }),
    ).toBeVisible();
    await expectAxe(managerPage);
    await managerContext.close();

    const deniedContext = await browser.newContext({
      storageState: denied.state,
    });
    const deniedPage = await deniedContext.newPage();
    await deniedPage.goto("/admin/communications/notices");
    await expect(deniedPage).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      deniedPage.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await expect(
      deniedPage.getByRole("link", { name: "Site Notices" }),
    ).toHaveCount(0);
    const deniedText = (await deniedPage.getByRole("main").textContent()) ?? "";
    expect(deniedText).not.toContain(draft.title);
    expect(deniedText).not.toContain("safe browser fixture message");
    await expectAxe(deniedPage);
    await deniedContext.close();

    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    await anonymous.goto("/admin/communications/notices");
    await expect(anonymous).toHaveURL(
      /\/admin\/sign-in\?next=%2Fadmin%2Fcommunications%2Fnotices$/,
    );
    await expectAxe(anonymous);
    await anonymousContext.close();
  });

  test("renders administrative statuses, ordering, safe fields, and mobile list structure", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    await page.goto("/admin/communications/notices");
    await expect(page.getByText("Lifecycle: Draft").first()).toBeVisible();
    await expect(page.getByText("Status: Upcoming")).toBeVisible();
    await expect(page.getByText("Status: Active").first()).toBeVisible();
    await expect(page.getByText("Status: Expired")).toBeVisible();
    await expect(page.getByText("Lifecycle: Withdrawn").first()).toBeVisible();
    await expect(page.getByText("Starts").first()).toBeVisible();
    await expect(page.getByText("Ends").first()).toBeVisible();
    await expect(page.getByText("Updated by").first()).toBeVisible();
    await expect(page.getByRole("link", { name: draft.title })).toHaveAttribute(
      "href",
      `/admin/communications/notices/${draft.id}`,
    );
    const mainText = (await page.getByRole("main").textContent()) ?? "";
    expect(mainText).not.toContain("@example.org");
    expect(mainText).not.toContain("site_notice.updated");
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoOverflow(page);
    await expectAxe(page);
    await context.close();
  });

  test("creates a draft, retains safe validation values, and ignores arbitrary status text", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    await page.goto("/admin/communications/notices/new");
    for (const field of [
      "title",
      "message",
      "severity",
      "targetArea",
      "startsAt",
      "endsAt",
      "ctaLabel",
      "ctaUrl",
    ]) {
      await expect(page.locator(`[name="${field}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[name="lifecycle"]')).toHaveCount(0);
    await expect(page.locator('[name="version"]')).toHaveCount(0);
    await expect(page.locator('[name="createdByAdminUserId"]')).toHaveCount(0);
    await page.getByLabel("Title").fill("C6A2B Created Draft");
    await page.getByLabel("Message").fill("C6A2B created draft message.");
    await page.getByLabel("Starts").fill("2098-01-01T08:00");
    await page.getByLabel("Ends").fill("2098-01-02T08:00");
    await page.getByRole("button", { name: "Save Site Notice draft" }).click();
    await expect(page).toHaveURL(
      /\/admin\/communications\/notices\/[0-9a-f-]+\?notice=notice-created$/,
    );
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-notice-code",
      "notice-created",
    );
    const createdTitle = "C6A2B Created Draft";
    await page.goto(
      `/admin/communications/notices/${draft.id}?notice=untrusted%3Cscript%3E`,
    );
    await expect(page.getByText("untrusted", { exact: true })).toHaveCount(0);
    await page.goto("/admin/communications/notices");
    await expect(page.getByRole("link", { name: createdTitle })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: createdTitle })).toHaveCount(
      0,
    );
    await expectAxe(page);
    await context.close();
  });

  test("retains validation errors and associates unsafe URL and window fields", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    await page.goto("/admin/communications/notices/new");
    await page.getByLabel("Title").fill("C6A2B Invalid draft");
    await page.getByLabel("Message").fill("C6A2B invalid draft message.");
    await page.getByLabel("Starts").fill("2098-01-02T08:00");
    await page.getByLabel("Ends").fill("2098-01-01T08:00");
    await page.getByLabel("CTA label").fill("Unsafe link");
    await page.getByLabel("CTA URL").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save Site Notice draft" }).click();
    await expect(
      page.getByRole("alert", { name: "Site Notice not saved" }),
    ).toBeFocused();
    await expect(page.getByLabel("Starts")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Ends")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.getByLabel("Starts").fill("2098-01-01T08:00");
    await page.getByLabel("Ends").fill("2098-01-02T08:00");
    await page.getByRole("button", { name: "Save Site Notice draft" }).click();
    await expect(
      page.getByRole("alert", { name: "Site Notice not saved" }),
    ).toBeFocused();
    await expect(page.getByLabel("CTA URL")).toHaveValue("javascript:alert(1)");
    await expect(page.getByLabel("CTA URL")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page
        .getByRole("alert", { name: "Site Notice not saved" })
        .getByText("CTA URL must use a safe internal or HTTPS URL.", {
          exact: true,
        }),
    ).toBeVisible();
    await expectAxe(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoOverflow(page);
    await context.close();
  });

  test("updates drafts, rejects stale writes, and keeps the current value usable", async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ storageState: manager.state });
    const contextB = await browser.newContext({ storageState: manager.state });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const url = `/admin/communications/notices/${concurrency.id}`;
    await pageA.goto(url);
    await pageB.goto(url);
    await pageB.getByLabel("Title").fill("C6A2B Fresh concurrent value");
    await pageB.getByRole("button", { name: "Save Site Notice" }).click();
    await expect(pageB.getByRole("status")).toHaveAttribute(
      "data-notice-code",
      "notice-updated",
    );
    await pageA.getByLabel("Title").fill("C6A2B Stale concurrent value");
    await pageA.getByRole("button", { name: "Save Site Notice" }).click();
    await expect(
      pageA.getByRole("alert", { name: "Site Notice not saved" }),
    ).toBeFocused();
    await expect(
      pageA.getByText(/record changed before this action/),
    ).toBeVisible();
    await expect(pageA.getByLabel("Title")).toHaveValue(
      "C6A2B Stale concurrent value",
    );
    await pageA.reload();
    await expect(pageA.getByLabel("Title")).toHaveValue(
      "C6A2B Fresh concurrent value",
    );
    await expect(
      (
        await database.siteNotice.findUniqueOrThrow({
          where: { id: concurrency.id },
        })
      ).title,
    ).toBe("C6A2B Fresh concurrent value");
    await expectAxe(pageA);
    await contextA.close();
    await contextB.close();
  });

  test("publishes valid drafts, shows truthful lifecycle status, and withdraws without deletion", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    await page.goto(`/admin/communications/notices/${publishable.id}`);
    await expect(
      page.getByRole("button", { name: "Publish Site Notice" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Publish Site Notice" }).click();
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-notice-code",
      "notice-published",
    );
    await expect(
      page.getByText("Lifecycle", { exact: true }).locator(".."),
    ).toContainText("Published");
    await expect(
      page.getByText("Derived status", { exact: true }).locator(".."),
    ).toContainText("Active");
    await expect(
      page.getByRole("button", { name: "Withdraw from public display" }),
    ).toBeVisible();
    await page.goto(`/admin/communications/notices/${withdrawable.id}`);
    await page
      .getByRole("button", { name: "Withdraw from public display" })
      .click();
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-notice-code",
      "notice-withdrawn",
    );
    await expect(
      page.getByText("Withdrawn", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Publish|Withdraw|Delete|Restore|Republish/,
      }),
    ).toHaveCount(0);
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
    await page.goto("/admin/communications/notices");
    await expect(
      page.getByRole("link", { name: withdrawable.title }),
    ).toBeVisible();
    await expect(page.getByText("Lifecycle: Withdrawn").first()).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: withdrawable.title }),
    ).toHaveCount(0);
    await expectAxe(page);
    await context.close();
  });

  test("renders target-area filtering, ordering, CTA behavior, time context, and clean console output", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = diagnostics(page);
    await page.goto("/");
    const homepageResponse = await page.goto("/");
    expect(
      homepageResponse?.headers()["content-security-policy"],
    ).not.toContain("'unsafe-eval'");
    const siteWide = page.getByRole("complementary", {
      name: "Operational notices",
    });
    const homepage = page.getByRole("complementary", {
      name: "Homepage notices",
    });
    await expect(siteWide).toBeVisible();
    await expect(homepage).toBeVisible();
    await expect(
      siteWide.getByRole("heading", { name: activeUrgent.title }),
    ).toBeVisible();
    await expect(
      siteWide.getByRole("heading", { name: activeInfo.title }),
    ).toBeVisible();
    await expect(
      siteWide.getByRole("heading", { name: activeOlderInfo.title }),
    ).toHaveCount(0);
    await expect(
      siteWide.getByRole("heading", { name: activeUrgent.title }),
    ).toBeVisible();
    await expect(siteWide.getByText("Urgent", { exact: true })).toBeVisible();
    await expect(
      siteWide.getByText("Info", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      siteWide.getByRole("link", { name: "Read News" }),
    ).toHaveAttribute("href", "/news");
    await expect(
      siteWide.getByRole("link", { name: "External details" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      siteWide.getByRole("link", { name: "External details" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    await expect(siteWide.locator("time").first()).toHaveAttribute(
      "datetime",
      /T/,
    );
    await expect(siteWide).not.toContainText("Lifecycle");
    await expect(siteWide).not.toContainText("Version");
    await expect(
      page.locator('[role="alert"]:visible:not(#__next-route-announcer__)'),
    ).toHaveCount(0);
    await expectAxe(page);

    for (const path of [
      "/news",
      "/news/c6a2b-browser-news",
      "/stories/c6a2b-browser-story",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("complementary", { name: "Operational notices" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: activeUrgent.title }),
      ).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Homepage notices" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: activeHomepage.title }),
      ).toHaveCount(0);
      await expectAxe(page);
    }
    expect(errors).toEqual([]);
    await context.close();
  });

  test("supports responsive visual QA across public and administrative states", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    await page.goto("/");
    await captureResponsive(page, "homepage-site-notices");
    await page.goto("/admin/communications/notices");
    await captureResponsive(page, "admin-notice-list");
    await page.goto("/admin/communications/notices/new");
    await captureResponsive(page, "admin-notice-create");
    await page.goto(`/admin/communications/notices/${draft.id}`);
    await captureResponsive(page, "admin-notice-draft");
    await page.goto(`/admin/communications/notices/${withdrawn.id}`);
    await captureResponsive(page, "admin-notice-withdrawn");
    await expectAxe(page);
    await context.close();
  });

  test("renders an empty public notice state without an empty frame", async ({
    browser,
  }) => {
    await database.siteNotice.updateMany({
      where: {
        title: { startsWith: "C6A2B" },
        lifecycle: SiteNoticeLifecycle.PUBLISHED,
      },
      data: {
        startsAt: new Date("2020-01-01T12:00:00.000Z"),
        endsAt: new Date("2021-01-01T12:00:00.000Z"),
      },
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("complementary", { name: "Operational notices" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Homepage notices" }),
    ).toHaveCount(0);
    await expectAxe(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoOverflow(page);
    await context.close();
  });
});
