import { createHash, randomUUID } from "node:crypto";

import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const fixturePlacementIds: string[] = [];

type Fixture =
  | "dashboard-contributor"
  | "story-editor"
  | "news-manager"
  | "dashboard-only"
  | "platform-admin";

type Persona = {
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
};

type Kind = "STORY" | "NEWS";
type Workflow = "DRAFT" | "IN_REVIEW" | "PENDING_APPROVAL" | "APPROVED";

const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dashboard fixture body." }],
      },
    ],
  },
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function establishFixture(page: Page, fixture: Fixture) {
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

async function persona(browser: Browser, fixture: Fixture, name: string) {
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

async function createContent(options: {
  kind: Kind;
  headline: string;
  ownerId: string;
  workflow: Workflow;
  releaseState?: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition?: "ACTIVE" | "ARCHIVED";
  expiresAt?: Date | null;
}) {
  const createdAt = new Date(Date.now() - 60 * 60 * 1_000);
  const releaseState = options.releaseState ?? "UNPUBLISHED";
  const discoveryDisposition = options.discoveryDisposition ?? "ACTIVE";
  const publication = await database.publication.create({
    data: {
      kind: options.kind,
      workflowState: options.workflow,
      releaseState,
      discoveryDisposition,
      createdById: options.ownerId,
      createdAt,
      updatedAt: createdAt,
      responsibility: {
        create: {
          editorialOwnerAdminUserId: options.ownerId,
          changedByAdminUserId: options.ownerId,
        },
      },
      ...(options.kind === "STORY"
        ? { story: { create: {} } }
        : { newsItem: { create: {} } }),
    },
    include: { story: true, newsItem: true },
  });
  const contentHash = hash(`${publication.id}:${options.headline}`);
  const revision = await database.publicationRevision.create({
    data: {
      publicationId: publication.id,
      number: 1,
      headline: options.headline,
      excerpt: "Dashboard fixture excerpt.",
      newsSummary:
        options.kind === "NEWS" ? "Dashboard fixture summary." : null,
      newsExpiresAt:
        options.kind === "NEWS" ? (options.expiresAt ?? null) : null,
      body,
      schemaVersion: 1,
      contentHash,
      createdByAdminUserId: options.ownerId,
      createdAt,
    },
  });
  await database.publication.update({
    where: { id: publication.id },
    data: { currentRevisionId: revision.id },
  });
  await database.publicationLifecycleTransition.create({
    data: {
      publicationId: publication.id,
      dimension: "CANDIDATE_WORKFLOW",
      action: "DRAFT_CREATED",
      toState: "DRAFT",
      revisionId: revision.id,
      contentHash,
      actorAdminUserId: options.ownerId,
      correlationId: randomUUID(),
      occurredAt: createdAt,
    },
  });
  if (options.workflow !== "DRAFT") {
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SUBMITTED",
        fromState: "DRAFT",
        toState: "IN_REVIEW",
        revisionId: revision.id,
        contentHash,
        actorAdminUserId: options.ownerId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 1_000),
      },
    });
  }
  if (
    options.workflow === "PENDING_APPROVAL" ||
    options.workflow === "APPROVED"
  ) {
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SENT_FOR_APPROVAL",
        fromState: "IN_REVIEW",
        toState: "PENDING_APPROVAL",
        revisionId: revision.id,
        contentHash,
        actorAdminUserId: options.ownerId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (options.workflow === "APPROVED") {
    await database.publicationApproval.create({
      data: {
        publicationId: publication.id,
        revisionId: revision.id,
        contentHash,
        approvedByAdminUserId: options.ownerId,
        approvedAt: new Date(createdAt.getTime() + 3_000),
      },
    });
    await database.publication.update({
      where: { id: publication.id },
      data: {
        approvedRevisionId: revision.id,
        approvedContentHash: contentHash,
      },
    });
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "APPROVED",
        fromState: "PENDING_APPROVAL",
        toState: "APPROVED",
        revisionId: revision.id,
        contentHash,
        actorAdminUserId: options.ownerId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 3_000),
      },
    });
  }
  if (releaseState === "PUBLISHED") {
    const publishedAt = new Date(Date.now() - 30 * 60 * 1_000);
    const slug = `c5b2b-${randomUUID()}`;
    const snapshot = await database.publicationSnapshot.create({
      data: {
        publicationId: publication.id,
        sourceRevisionId: revision.id,
        sourceContentHash: contentHash,
        slug,
        payload: { headline: options.headline, body },
        activatedAt: publishedAt,
      },
    });
    if (options.kind === "STORY") {
      await database.publicStoryProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug,
          headline: options.headline,
          deck: "Dashboard fixture deck.",
          excerpt: "Dashboard fixture excerpt.",
          body,
          publishedAt,
        },
      });
    } else {
      await database.publicNewsProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug,
          headline: options.headline,
          summary: "Dashboard fixture summary.",
          body,
          publishedAt,
          expiresAt: options.expiresAt ?? null,
        },
      });
    }
    await database.publication.update({
      where: { id: publication.id },
      data: { activeSnapshotId: snapshot.id },
    });
  }
  return publication;
}

async function createPlacement(options: {
  key:
    | "HOME_HERO"
    | "HOME_FEATURED_STORY"
    | "HOME_FEATURED_NEWS"
    | "NEWS_FEATURED";
  publicationId: string;
  managerId: string;
  startsAt: Date;
  endsAt?: Date | null;
}) {
  const placement = await database.contentPlacement.create({
    data: {
      key: options.key,
      publicationId: options.publicationId,
      startsAt: options.startsAt,
      endsAt: options.endsAt ?? null,
      createdByAdminUserId: options.managerId,
      updatedByAdminUserId: options.managerId,
    },
  });
  fixturePlacementIds.push(placement.id);
  return placement;
}

async function createActivity(options: {
  action: string;
  targetType: string;
  targetId: string;
  actorAdminUserId: string;
  occurredAt: Date;
}) {
  await database.auditEvent.create({
    data: {
      ...buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: options.actorAdminUserId,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId,
        summary: { source: "C5B-2B browser fixture" },
      }),
      occurredAt: options.occurredAt,
    },
  });
}

async function newPersonaPage(browser: Browser, personaValue: Persona) {
  const context = await browser.newContext({
    storageState: personaValue.state,
  });
  return { context, page: await context.newPage() };
}

async function expectAxe(page: Page) {
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
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe("C5B-2B Communications Dashboard browser validation", () => {
  test.describe.configure({ mode: "serial" });

  let contributor: Persona;
  let editor: Persona;
  let manager: Persona;
  let dashboardOnly: Persona;
  let denied: Persona;
  let currentIneffectiveProjectionId: string;
  let currentIneffectivePlacementId: string;
  let homeFeaturedStoryPlacementId: string;
  const titles = {
    storyReview: "C5B2B Story Needs Review",
    newsReview: "C5B2B News Needs Review",
    storyApproval: "C5B2B Story Needs Approval",
    newsApproval: "C5B2B News Needs Approval",
    selfApproval: "C5B2B Self Approval Blocked",
    approvedStory: "C5B2B Approved Story",
    approvedNews: "C5B2B Approved News",
    currentStory: "C5B2B Current Homepage Story",
    currentNews: "C5B2B Current Featured News",
    upcomingHeroStory: "C5B2B Upcoming Hero Story",
    upcomingFeaturedStory: "C5B2B Upcoming Featured Story",
    upcomingFeaturedNews: "C5B2B Upcoming Featured News",
    upcomingNewsFeatured: "C5B2B Upcoming News Featured",
    expiringNews: "C5B2B News Expiring Soon",
    outsideNews: "C5B2B News Expiring Outside Window",
    expiredNews: "C5B2B Already Expired News",
    withdrawnNews: "C5B2B Withdrawn Upcoming News",
    archivedNews: "C5B2B Archived Upcoming News",
    otherOwnerDraft: "C5B2B Other Owner Private Draft",
  };

  test.beforeAll(async ({ browser }) => {
    contributor = await persona(
      browser,
      "dashboard-contributor",
      "Dashboard Contributor",
    );
    editor = await persona(browser, "story-editor", "Dashboard Editor");
    manager = await persona(browser, "news-manager", "Dashboard Manager");
    dashboardOnly = await persona(browser, "dashboard-only", "Dashboard Only");
    denied = await persona(
      browser,
      "platform-admin",
      "Dashboard Platform Admin",
    );

    const now = new Date();
    const day = 24 * 60 * 60 * 1_000;
    const publishedStory = await createContent({
      kind: "STORY",
      headline: titles.currentStory,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
    });
    const currentNews = await createContent({
      kind: "NEWS",
      headline: titles.currentNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() + 10 * day),
    });
    const upcomingHero = await createContent({
      kind: "STORY",
      headline: titles.upcomingHeroStory,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
    });
    const upcomingFeaturedStory = await createContent({
      kind: "STORY",
      headline: titles.upcomingFeaturedStory,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
    });
    const upcomingFeaturedNews = await createContent({
      kind: "NEWS",
      headline: titles.upcomingFeaturedNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() + 10 * day),
    });
    const upcomingNewsFeatured = await createContent({
      kind: "NEWS",
      headline: titles.upcomingNewsFeatured,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() + 10 * day),
    });
    const expiringNews = await createContent({
      kind: "NEWS",
      headline: titles.expiringNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() + 4 * day),
    });
    await createContent({
      kind: "NEWS",
      headline: titles.outsideNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() + 30 * day),
    });
    await createContent({
      kind: "NEWS",
      headline: titles.expiredNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date(now.getTime() - day),
    });
    await createContent({
      kind: "NEWS",
      headline: titles.withdrawnNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "WITHDRAWN",
      expiresAt: new Date(now.getTime() + 2 * day),
    });
    await createContent({
      kind: "NEWS",
      headline: titles.archivedNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      discoveryDisposition: "ARCHIVED",
      expiresAt: new Date(now.getTime() + 2 * day),
    });

    const reviewStory = await createContent({
      kind: "STORY",
      headline: titles.storyReview,
      ownerId: contributor.adminUserId,
      workflow: "IN_REVIEW",
    });
    const reviewNews = await createContent({
      kind: "NEWS",
      headline: titles.newsReview,
      ownerId: contributor.adminUserId,
      workflow: "IN_REVIEW",
    });
    const approvalStory = await createContent({
      kind: "STORY",
      headline: titles.storyApproval,
      ownerId: contributor.adminUserId,
      workflow: "PENDING_APPROVAL",
    });
    const approvalNews = await createContent({
      kind: "NEWS",
      headline: titles.newsApproval,
      ownerId: contributor.adminUserId,
      workflow: "PENDING_APPROVAL",
    });
    const selfApproval = await createContent({
      kind: "STORY",
      headline: titles.selfApproval,
      ownerId: manager.adminUserId,
      workflow: "PENDING_APPROVAL",
    });
    await createContent({
      kind: "STORY",
      headline: titles.approvedStory,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
    });
    await createContent({
      kind: "NEWS",
      headline: titles.approvedNews,
      ownerId: contributor.adminUserId,
      workflow: "APPROVED",
    });
    const otherOwnerDraft = await createContent({
      kind: "STORY",
      headline: titles.otherOwnerDraft,
      ownerId: manager.adminUserId,
      workflow: "DRAFT",
    });

    const currentHero = await createPlacement({
      key: "HOME_HERO",
      publicationId: publishedStory.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() - day),
      endsAt: new Date(now.getTime() + 12 * 60 * 60 * 1_000),
    });
    await createPlacement({
      key: "HOME_HERO",
      publicationId: upcomingHero.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + day),
    });
    const homeFeaturedStoryPlacement = await createPlacement({
      key: "HOME_FEATURED_STORY",
      publicationId: upcomingFeaturedStory.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + 2 * day),
      endsAt: new Date(now.getTime() + 4 * day),
    });
    homeFeaturedStoryPlacementId = homeFeaturedStoryPlacement.id;
    await createPlacement({
      key: "HOME_FEATURED_NEWS",
      publicationId: upcomingFeaturedNews.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + 3 * day),
      endsAt: new Date(now.getTime() + 14 * day),
    });
    const ineffective = await createPlacement({
      key: "NEWS_FEATURED",
      publicationId: currentNews.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() - day),
      endsAt: new Date(now.getTime() + 12 * 60 * 60 * 1_000),
    });
    await createPlacement({
      key: "NEWS_FEATURED",
      publicationId: upcomingNewsFeatured.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + 4 * day),
    });
    await createPlacement({
      key: "HOME_FEATURED_NEWS",
      publicationId: upcomingFeaturedNews.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + 30 * day),
    });
    const cancelled = await createPlacement({
      key: "HOME_FEATURED_STORY",
      publicationId: upcomingFeaturedStory.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() + 5 * day),
    });
    await database.contentPlacement.update({
      where: { id: cancelled.id },
      data: { cancelledAt: new Date(now.getTime() - 1_000) },
    });
    const ended = await createPlacement({
      key: "HOME_FEATURED_NEWS",
      publicationId: upcomingFeaturedNews.id,
      managerId: manager.adminUserId,
      startsAt: new Date(now.getTime() - 2 * day),
      endsAt: new Date(now.getTime() - day),
    });
    void currentHero;
    void reviewStory;
    void reviewNews;
    void approvalStory;
    void approvalNews;
    void selfApproval;
    void otherOwnerDraft;
    void expiringNews;
    void ended;
    currentIneffectivePlacementId = ineffective.id;
    const currentProjection =
      await database.publicNewsProjection.findUniqueOrThrow({
        where: { publicationId: currentNews.id },
        select: { id: true },
      });
    currentIneffectiveProjectionId = currentProjection.id;

    await createActivity({
      action: "story.submit",
      targetType: "Story",
      targetId: reviewStory.story!.id,
      actorAdminUserId: contributor.adminUserId,
      occurredAt: new Date(now.getTime() - 1_000),
    });
    await createActivity({
      action: "news.approve",
      targetType: "NewsItem",
      targetId: approvalNews.newsItem!.id,
      actorAdminUserId: manager.adminUserId,
      occurredAt: new Date(now.getTime() - 2_000),
    });
    await createActivity({
      action: "placement.assigned",
      targetType: "ContentPlacement",
      targetId: currentHero.id,
      actorAdminUserId: manager.adminUserId,
      occurredAt: new Date(now.getTime() - 3_000),
    });
    await createActivity({
      action: "story.revision.create",
      targetType: "Story",
      targetId: otherOwnerDraft.story!.id,
      actorAdminUserId: manager.adminUserId,
      occurredAt: new Date(now.getTime() - 4_000),
    });
    await database.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: manager.adminUserId,
        action: "users.invite",
        targetType: "AdminUser",
        targetId: manager.adminUserId,
        summary: { source: "C5B-2B browser fixture" },
      }),
    });
  });

  test.afterAll(async () => {
    await database.contentPlacement.deleteMany({
      where: { id: { in: fixturePlacementIds } },
    });
    await database.$disconnect();
  });

  test("validates route protection, authorized navigation, and forbidden isolation", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/communications");
    await expect(page).toHaveURL(
      /\/admin\/sign-in\?next=%2Fadmin%2Fcommunications$/,
    );

    const managerSession = await newPersonaPage(browser, manager);
    await managerSession.page.goto("/admin/communications");
    await expect(
      managerSession.page.getByRole("heading", {
        level: 1,
        name: "Communications Dashboard",
      }),
    ).toBeVisible();
    const navigationLinks = managerSession.page
      .getByRole("navigation", { name: "Administration" })
      .getByRole("link");
    await expect(navigationLinks.nth(1)).toHaveText("Communications Dashboard");
    await expect(
      managerSession.page.getByRole("link", {
        name: "Communications Dashboard",
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      managerSession.page.getByRole("link", {
        name: "Publication Queue",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      managerSession.page.getByRole("link", {
        name: "Homepage curation",
        exact: true,
      }),
    ).toBeVisible();
    await expectAxe(managerSession.page);
    await managerSession.context.close();

    const deniedSession = await newPersonaPage(browser, denied);
    await deniedSession.page.goto("/admin/communications");
    await expect(deniedSession.page).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      deniedSession.page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await expect(deniedSession.page.locator("body")).not.toContainText(
      /Communications Dashboard|Needs Attention|C5B2B|Dashboard Manager|Activity/,
    );
    await expectAxe(deniedSession.page);
    await deniedSession.context.close();
  });

  test("validates Editor Needs Attention, typed links, safe counts, and redaction", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, editor);
    await session.page.goto("/admin/communications");
    const needsAttention = session.page.locator("section").filter({
      has: session.page.getByRole("heading", {
        level: 2,
        name: "Needs Attention",
      }),
    });
    await expect(needsAttention).toBeVisible();
    await expect(
      needsAttention.getByRole("heading", { name: /Needs Review/ }),
    ).toContainText("2");
    await expect(
      needsAttention.getByRole("link", {
        name: new RegExp(titles.storyReview),
      }),
    ).toBeVisible();
    await expect(
      needsAttention.getByRole("link", {
        name: new RegExp(titles.newsReview),
      }),
    ).toBeVisible();
    await expect(
      needsAttention.getByRole("heading", { name: /Needs Approval/ }),
    ).toHaveCount(0);
    await expect(
      needsAttention.getByRole("link", {
        name: new RegExp(titles.storyReview),
      }),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await expect(
      needsAttention.getByRole("link", {
        name: new RegExp(titles.newsReview),
      }),
    ).toHaveAttribute("href", /\/admin\/communications\/news\//);
    await expect(
      needsAttention
        .getByRole("link", { name: "View all in Publication Queue" })
        .first(),
    ).toHaveAttribute("href", "/admin/communications/queue?view=NEEDS_REVIEW");
    await expect(needsAttention).not.toContainText(
      /Dashboard Manager|e2e-|contentHash|requestPayload|revision JSON/,
    );
    await expectAxe(session.page);
    await session.context.close();
  });

  test("validates Contributor and Dashboard-only module authorization", async ({
    browser,
  }) => {
    const contributorSession = await newPersonaPage(browser, contributor);
    await contributorSession.page.goto("/admin/communications");
    const contributorNeedsAttention = contributorSession.page
      .locator("section")
      .filter({
        has: contributorSession.page.getByRole("heading", {
          level: 2,
          name: "Needs Attention",
        }),
      });
    await expect(
      contributorSession.page.getByRole("heading", {
        level: 1,
        name: "Communications Dashboard",
      }),
    ).toBeVisible();
    await expect(contributorNeedsAttention).toBeVisible();
    await expect(
      contributorSession.page.getByText(
        "There are no actionable publication items for your current access.",
      ),
    ).toBeVisible();
    await expect(
      contributorSession.page.getByRole("heading", {
        name: "Current Curation",
      }),
    ).toHaveCount(0);
    await expect(
      contributorNeedsAttention.getByRole("link", {
        name: new RegExp(titles.storyReview),
      }),
    ).toHaveCount(0);
    await expect(contributorNeedsAttention).not.toContainText(
      /Needs Approval|Approved, Not Released|Dashboard Manager|C5B2B Other Owner/,
    );
    await expectAxe(contributorSession.page);
    await contributorSession.context.close();

    const limitedSession = await newPersonaPage(browser, dashboardOnly);
    await limitedSession.page.goto("/admin/communications");
    await expect(
      limitedSession.page.getByRole("heading", { name: "Needs Attention" }),
    ).toHaveCount(0);
    await expect(
      limitedSession.page.getByRole("heading", { name: "Upcoming" }),
    ).toHaveCount(0);
    await expect(
      limitedSession.page.getByRole("heading", { name: "Current Curation" }),
    ).toHaveCount(0);
    await expect(
      limitedSession.page.getByRole("heading", { name: "Recent Activity" }),
    ).toBeVisible();
    await expect(
      limitedSession.page.getByText(
        "No recent Communications activity is available.",
      ),
    ).toBeVisible();
    await expect(limitedSession.page.locator("body")).not.toContainText(
      /C5B2B|Dashboard Manager|Home hero/,
    );
    await expectAxe(limitedSession.page);
    await limitedSession.context.close();
  });

  test("validates Upcoming ordering, window, cancellation, eligibility, and typed destinations", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await session.page.goto("/admin/communications");
    const upcoming = session.page
      .locator("section")
      .filter({ has: session.page.getByRole("heading", { name: "Upcoming" }) });
    await expect(upcoming).toContainText("Upcoming in the next 14 days");
    await expect(upcoming).toContainText("Placement activation");
    await expect(upcoming).toContainText("News expiration");
    for (const title of [
      titles.upcomingHeroStory,
      titles.upcomingFeaturedStory,
      titles.upcomingFeaturedNews,
      titles.upcomingNewsFeatured,
      titles.expiringNews,
    ]) {
      await expect(
        upcoming.getByRole("link", { name: new RegExp(title) }).first(),
      ).toBeVisible();
    }
    for (const title of [
      titles.outsideNews,
      titles.expiredNews,
      titles.withdrawnNews,
      titles.archivedNews,
    ]) {
      await expect(
        upcoming.getByRole("link", { name: new RegExp(title) }),
      ).toHaveCount(0);
    }
    const text = await upcoming.innerText();
    expect(text.indexOf(titles.upcomingHeroStory)).toBeLessThan(
      text.indexOf(titles.upcomingFeaturedStory),
    );
    expect(text.indexOf(titles.upcomingFeaturedStory)).toBeLessThan(
      text.indexOf(titles.upcomingFeaturedNews),
    );
    await expect(
      upcoming.getByRole("link", { name: titles.expiringNews }),
    ).toHaveAttribute("href", /\/admin\/communications\/news\//);
    await expect(
      upcoming.getByRole("link", { name: titles.upcomingHeroStory }),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await expect(
      upcoming.getByRole("link", { name: "Manage Homepage curation" }).first(),
    ).toHaveAttribute("href", "/admin/communications/homepage");
    await expect(upcoming).not.toContainText(
      /scheduled publication|publication scheduling/,
    );
    await expectAxe(session.page);
    await session.context.close();
  });

  test("validates all four Current Curation slots, statuses, links, and ineffective state", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await database.contentPlacement.update({
      where: { id: homeFeaturedStoryPlacementId },
      data: { cancelledAt: new Date() },
    });
    await session.page.goto("/admin/communications");
    const curation = session.page.locator("section").filter({
      has: session.page.getByRole("heading", { name: "Current Curation" }),
    });
    for (const label of [
      "Home hero",
      "Home featured Story",
      "Home featured News",
      "Featured News",
    ])
      await expect(curation).toContainText(label);
    await expect(curation).toContainText("Current and upcoming");
    await expect(curation).toContainText("Empty");
    await expect(curation).toContainText("Upcoming only");
    await expect(
      curation.getByRole("link", { name: new RegExp(titles.currentStory) }),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await expect(
      curation.getByRole("link", { name: new RegExp(titles.currentNews) }),
    ).toHaveAttribute("href", /\/admin\/communications\/news\//);
    await expect(
      curation.getByRole("link", { name: "Manage Homepage curation" }),
    ).toBeVisible();
    await expect(curation).not.toContainText(/Project|Campaign/);
    await expectAxe(session.page);

    await database.publicNewsProjection.update({
      where: { id: currentIneffectiveProjectionId },
      data: { expiresAt: new Date(Date.now() - 60 * 60 * 1_000) },
    });
    await session.page.reload();
    await expect(
      session.page.getByText("Configured but not currently effective"),
    ).toBeVisible();
    await expect(
      session.page.getByText(
        "The configured item is no longer publicly eligible.",
      ),
    ).toBeVisible();
    await expect(
      session.page.getByRole("link", { name: new RegExp(titles.currentNews) }),
    ).toBeVisible();
    await expectAxe(session.page);
    await captureAtViewports(session.page, "dashboard-manager-ineffective");
    await database.contentPlacement.update({
      where: { id: currentIneffectivePlacementId },
      data: { cancelledAt: new Date() },
    });
    await session.context.close();
  });

  test("validates allowlisted activity, actor privacy, empty/error states, and no inline mutations", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await session.page.goto("/admin/communications?days=0");
    await expect(
      session.page.getByRole("heading", { name: "Dashboard unavailable" }),
    ).toBeVisible();
    await expect(session.page.locator("body")).not.toContainText(
      /Prisma|stack trace|contentHash|requestPayload/,
    );
    await expectAxe(session.page);

    await session.page.goto("/admin/communications");
    const activity = session.page.locator("section").filter({
      has: session.page.getByRole("heading", { name: "Recent Activity" }),
    });
    await expect(activity).toContainText(
      "Dashboard Contributor submitted a Story for review",
    );
    await expect(activity).toContainText("Dashboard Manager approved News");
    await expect(activity).toContainText(
      "Dashboard Manager assigned a placement",
    );
    await expect(activity).not.toContainText("revision.save");
    await expect(activity).not.toContainText(
      /e2e-|@example.org|actorAdminUser|requestPayload|contentHash/,
    );
    await expect(
      activity.getByRole("link", { name: /submitted a Story/ }),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await expect(
      activity.getByRole("link", { name: /approved News/ }),
    ).toHaveAttribute("href", /\/admin\/communications\/news\//);
    await expect(
      activity.getByRole("link", { name: /assigned a placement/ }),
    ).toHaveAttribute("href", "/admin/communications/homepage");
    await expect(session.page.locator("form")).toHaveCount(1);
    await expect(session.page.locator("form button")).toHaveText("Sign out");
    await expect(
      session.page.getByRole("button", {
        name: /Approve|Release|Assign|Clear|Schedule|Withdraw|Archive|Submit|Request changes/,
      }),
    ).toHaveCount(0);
    await expectAxe(session.page);
    await captureAtViewports(session.page, "dashboard-manager-populated");
    await session.context.close();
  });

  test("validates narrow mobile accessibility and visual structure", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, editor);
    await session.page.setViewportSize({ width: 375, height: 812 });
    await session.page.goto("/admin/communications");
    await expect(
      session.page.getByRole("heading", {
        level: 1,
        name: "Communications Dashboard",
      }),
    ).toBeVisible();
    await expectNoOverflow(session.page);
    await expectAxe(session.page);
    await expect(session.page.locator("h1")).toHaveCount(1);
    await expect(session.page.locator("section h2")).toHaveCount(3);
    await session.context.close();
  });
});
