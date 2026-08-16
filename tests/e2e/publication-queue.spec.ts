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

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Fixture =
  | "platform-admin"
  | "story-contributor"
  | "story-editor"
  | "news-editor"
  | "news-manager";
type Kind = "STORY" | "NEWS";
type Workflow = "DRAFT" | "IN_REVIEW" | "PENDING_APPROVAL" | "APPROVED";

type Persona = {
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
};

const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Private queue fixture body." }],
      },
    ],
  },
};

const queueTitles = {
  storyDraft: "C5A2B Story Draft",
  newsDraft: "C5A2B News Draft",
  otherDraft: "C5A2B Other Owner Draft",
  storyReview: "C5A2B Story In Review",
  newsReview: "C5A2B News In Review",
  storyApproval: "C5A2B Story Needs Approval",
  newsApproval: "C5A2B News Needs Approval",
  selfApproval: "C5A2B Self Approval Blocked",
  approvedStory: "C5A2B Approved Story",
  approvedNews: "C5A2B Approved News",
  successor: "C5A2B Approved Story Successor",
  releasedStory: "C5A2B Released Story",
  releasedNews: "C5A2B Released News",
  expiredNews: "C5A2B Expired News",
  archivedStory: "C5A2B Archived Story",
  archivedNews: "C5A2B Archived News",
};

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
  if (!token)
    throw new Error("Test auth session cookie did not contain a token.");
  const session = await database.session.findUniqueOrThrow({
    where: { token },
    select: { userId: true },
  });
  const admin = await database.adminUser.findUniqueOrThrow({
    where: { authUserId: session.userId },
    select: { id: true, authUserId: true },
  });
  return admin;
}

async function persona(
  browser: Browser,
  fixture: Fixture,
  name: string,
): Promise<Persona> {
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
  return { state, adminUserId: admin.id };
}

function hash(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
}

async function queueFixture(options: {
  kind: Kind;
  title: string;
  owner: string;
  workflow: Workflow;
  offset: number;
  releaseState?: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition?: "ACTIVE" | "ARCHIVED";
  approved?: boolean;
  currentRevisionNumber?: number;
  publicRevisionNumber?: number;
  expiresAt?: Date | null;
}) {
  const createdAt = new Date(Date.now() - options.offset * 60_000);
  const releaseState = options.releaseState ?? "UNPUBLISHED";
  const discoveryDisposition = options.discoveryDisposition ?? "ACTIVE";
  const publication = await database.publication.create({
    data: {
      kind: options.kind,
      workflowState: options.workflow,
      releaseState,
      discoveryDisposition,
      createdById: options.owner,
      createdAt,
      updatedAt: createdAt,
      responsibility: {
        create: {
          editorialOwnerAdminUserId: options.owner,
          changedByAdminUserId: options.owner,
        },
      },
      ...(options.kind === "STORY"
        ? { story: { create: {} } }
        : { newsItem: { create: {} } }),
    },
    include: { story: true, newsItem: true },
  });
  const revisionCount = options.currentRevisionNumber ?? 1;
  const revisions: Array<{
    id: string;
    contentHash: string;
    headline: string;
  }> = [];
  for (let number = 1; number <= revisionCount; number += 1) {
    const parentRevisionId = revisions.at(-1)?.id;
    const revision = await database.publicationRevision.create({
      data: {
        publicationId: publication.id,
        number,
        parentRevisionId: parentRevisionId ?? null,
        headline:
          number === revisionCount
            ? options.title
            : `${options.title} v${number}`,
        excerpt: "C5A2B queue excerpt.",
        newsSummary: options.kind === "NEWS" ? "C5A2B queue summary." : null,
        newsExpiresAt:
          options.kind === "NEWS" && number === revisionCount
            ? (options.expiresAt ?? null)
            : null,
        body,
        schemaVersion: 1,
        contentHash: hash(`${publication.id}:${number}:${options.title}`),
        createdByAdminUserId: options.owner,
        createdAt: new Date(createdAt.getTime() - number * 60_000),
      },
    });
    revisions.push(revision);
  }
  const current = revisions.at(-1)!;
  const approvedRevision = current;
  await database.publication.update({
    where: { id: publication.id },
    data: {
      currentRevisionId: current.id,
      ...(options.approved
        ? {
            approvedRevisionId: approvedRevision.id,
            approvedContentHash: approvedRevision.contentHash,
          }
        : {}),
    },
  });
  await database.publicationLifecycleTransition.create({
    data: {
      publicationId: publication.id,
      dimension: "CANDIDATE_WORKFLOW",
      action: "DRAFT_CREATED",
      toState: "DRAFT",
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: options.owner,
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
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 1_000),
      },
    });
  }
  if (options.workflow === "PENDING_APPROVAL") {
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SENT_FOR_APPROVAL",
        fromState: "IN_REVIEW",
        toState: "PENDING_APPROVAL",
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (options.approved) {
    await database.publicationApproval.create({
      data: {
        publicationId: publication.id,
        revisionId: approvedRevision.id,
        contentHash: approvedRevision.contentHash,
        approvedByAdminUserId: options.owner,
        approvedAt: new Date(createdAt.getTime() + 2_000),
      },
    });
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "APPROVED",
        fromState: "PENDING_APPROVAL",
        toState: "APPROVED",
        revisionId: approvedRevision.id,
        contentHash: approvedRevision.contentHash,
        actorAdminUserId: options.owner,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (releaseState === "PUBLISHED") {
    const publicRevision =
      revisions[(options.publicRevisionNumber ?? revisionCount) - 1]!;
    const publishedAt = new Date(createdAt.getTime() + 3_000);
    const snapshot = await database.publicationSnapshot.create({
      data: {
        publicationId: publication.id,
        sourceRevisionId: publicRevision.id,
        sourceContentHash: publicRevision.contentHash,
        slug: `c5a2b-${randomUUID()}`,
        payload: { headline: publicRevision.headline, body },
        activatedAt: publishedAt,
      },
    });
    if (options.kind === "STORY") {
      await database.publicStoryProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: publicRevision.headline,
          deck: "C5A2B queue deck.",
          excerpt: "C5A2B queue excerpt.",
          body,
          publishedAt,
        },
      });
    } else {
      await database.publicNewsProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: publicRevision.headline,
          summary: "C5A2B queue summary.",
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
  if (discoveryDisposition === "ARCHIVED") {
    await database.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "DISCOVERY_DISPOSITION",
        action: "ARCHIVED",
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 4_000),
      },
    });
  }
}

async function createQueueFixtures(contributorId: string, managerId: string) {
  const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const currentAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const base = [
    ["STORY", queueTitles.storyDraft, contributorId, "DRAFT"],
    ["NEWS", queueTitles.newsDraft, contributorId, "DRAFT"],
    ["STORY", queueTitles.otherDraft, managerId, "DRAFT"],
    ["STORY", queueTitles.storyReview, contributorId, "IN_REVIEW"],
    ["NEWS", queueTitles.newsReview, contributorId, "IN_REVIEW"],
    ["STORY", queueTitles.storyApproval, contributorId, "PENDING_APPROVAL"],
    ["NEWS", queueTitles.newsApproval, contributorId, "PENDING_APPROVAL"],
    ["STORY", queueTitles.selfApproval, managerId, "PENDING_APPROVAL"],
  ] as const;
  for (const [index, [kind, title, owner, workflow]] of base.entries()) {
    await queueFixture({ kind, title, owner, workflow, offset: index + 1 });
  }
  await queueFixture({
    kind: "STORY",
    title: queueTitles.approvedStory,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    offset: 20,
  });
  await queueFixture({
    kind: "NEWS",
    title: queueTitles.approvedNews,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    offset: 21,
  });
  await queueFixture({
    kind: "STORY",
    title: queueTitles.successor,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    currentRevisionNumber: 2,
    publicRevisionNumber: 1,
    releaseState: "PUBLISHED",
    offset: 22,
  });
  await queueFixture({
    kind: "STORY",
    title: queueTitles.releasedStory,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "PUBLISHED",
    offset: 23,
  });
  await queueFixture({
    kind: "NEWS",
    title: queueTitles.releasedNews,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "PUBLISHED",
    expiresAt: currentAt,
    offset: 24,
  });
  await queueFixture({
    kind: "NEWS",
    title: queueTitles.expiredNews,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "PUBLISHED",
    expiresAt: expiredAt,
    offset: 25,
  });
  await queueFixture({
    kind: "STORY",
    title: queueTitles.archivedStory,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "PUBLISHED",
    discoveryDisposition: "ARCHIVED",
    offset: 26,
  });
  await queueFixture({
    kind: "NEWS",
    title: queueTitles.archivedNews,
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "PUBLISHED",
    discoveryDisposition: "ARCHIVED",
    expiresAt: expiredAt,
    offset: 27,
  });
  await queueFixture({
    kind: "STORY",
    title: "C5A2B Withdrawn Story",
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "WITHDRAWN",
    offset: 28,
  });
  await queueFixture({
    kind: "NEWS",
    title: "C5A2B Withdrawn News",
    owner: contributorId,
    workflow: "APPROVED",
    approved: true,
    releaseState: "WITHDRAWN",
    offset: 29,
  });
  for (let index = 1; index <= 24; index += 1) {
    await queueFixture({
      kind: "STORY",
      title: `C5A2B Pagination Story ${String(index).padStart(2, "0")}`,
      owner: contributorId,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      offset: 40 + index,
    });
  }
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

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function captureResponsiveState(page: Page, name: string) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1100 },
    { width: 1920, height: 1200 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: test
        .info()
        .outputPath(`${name}-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

function rowTexts(page: Page) {
  return page
    .getByRole("list", { name: /items$/ })
    .getByRole("listitem")
    .allTextContents();
}

test.describe("C5A-2B Publication Queue browser validation", () => {
  test.describe.configure({ mode: "serial" });

  let contributor: Persona;
  let editor: Persona;
  let manager: Persona;
  let denied: Persona;

  test.beforeAll(async ({ browser }) => {
    contributor = await persona(
      browser,
      "story-contributor",
      "Queue Contributor",
    );
    editor = await persona(browser, "story-editor", "Queue Editor");
    manager = await persona(browser, "news-manager", "Queue Manager");
    denied = await persona(browser, "platform-admin", "Queue Platform Admin");
    await createQueueFixtures(contributor.adminUserId, manager.adminUserId);
  });

  test.afterAll(async () => {
    await database.$disconnect();
  });

  test("protects the route and filters Communications navigation by capability", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/communications/queue");
    await expect(page).toHaveURL(
      /\/admin\/sign-in\?next=%2Fadmin%2Fcommunications%2Fqueue$/,
    );

    const deniedSession = await newPersonaPage(browser, denied);
    await deniedSession.page.goto("/admin/communications/queue");
    await expect(deniedSession.page).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      deniedSession.page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await expect(
      deniedSession.page.getByRole("link", { name: "Publication Queue" }),
    ).toHaveCount(0);
    await expect(deniedSession.page.locator("body")).not.toContainText("C5A2B");
    await expectAxe(deniedSession.page);
    await deniedSession.context.close();
  });

  test("proves Contributor visibility and typed Story/News links", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, contributor);
    await session.page.goto("/admin/communications/queue?view=MY_DRAFTS");
    await expect(
      session.page.getByRole("heading", {
        level: 1,
        name: "Publication Queue",
      }),
    ).toBeVisible();
    await expect(
      session.page.getByRole("link", { name: "Publication Queue" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      session.page.getByRole("link", { name: /My Drafts, \d+ items/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      session.page.getByText(queueTitles.storyDraft, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.newsDraft, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.otherDraft, { exact: true }),
    ).toHaveCount(0);
    await expect(
      session.page.getByRole("link", { name: /Needs Review/ }),
    ).toHaveCount(0);
    await expect(
      session.page.getByRole("link", { name: /Needs Approval/ }),
    ).toHaveCount(0);
    await expect(session.page.getByLabel("Editorial owner")).toHaveCount(0);
    expect(
      (
        await session.page
          .getByRole("list", { name: "My Drafts items" })
          .locator("li")
          .allTextContents()
      ).join(""),
    ).not.toContain("@");
    await expect(
      session.page
        .getByRole("link", {
          name: `Open Story: ${queueTitles.storyDraft}`,
        })
        .first(),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await expect(
      session.page
        .getByRole("link", {
          name: `Open News: ${queueTitles.newsDraft}`,
        })
        .first(),
    ).toHaveAttribute("href", /\/admin\/communications\/news\//);
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-contributor-my-drafts");

    await session.page.goto(
      `/admin/communications/queue?view=MY_DRAFTS&owner=${manager.adminUserId}`,
    );
    await expect(session.page.locator('section[role="alert"]')).toContainText(
      "not available",
    );
    await expect(session.page.locator("body")).not.toContainText(
      queueTitles.otherDraft,
    );
    await session.context.close();
  });

  test("proves Editor review visibility is type- and capability-filtered", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, editor);
    await session.page.goto("/admin/communications/queue?view=NEEDS_REVIEW");
    await expect(
      session.page.getByText(queueTitles.storyReview, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.newsReview, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.storyDraft, { exact: true }),
    ).toHaveCount(0);
    await expect(
      session.page.getByText(queueTitles.storyApproval, { exact: true }),
    ).toHaveCount(0);
    await expectAxe(session.page);
    await expect(
      session.page
        .getByRole("link", {
          name: `Open Story: ${queueTitles.storyReview}`,
        })
        .first(),
    ).toHaveAttribute("href", /\/admin\/communications\/stories\//);
    await session.page
      .getByRole("link", { name: `Open Story: ${queueTitles.storyReview}` })
      .first()
      .click();
    await expect(session.page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      session.page.getByRole("button", { name: /Approve|Release/ }),
    ).toHaveCount(0);
    await expectAxe(session.page);
    await session.page.goBack();
    await expect(
      session.page.getByRole("heading", {
        name: "Publication Queue",
        exact: true,
      }),
    ).toBeVisible();
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-editor-needs-review");
    await session.context.close();
  });

  test("proves Manager views, counts, self-approval note, and public-state classification", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    for (const view of [
      "NEEDS_APPROVAL",
      "APPROVED_UNRELEASED",
      "RECENTLY_PUBLISHED",
      "EXPIRED_NEWS",
      "ARCHIVED",
    ] as const) {
      await session.page.goto(`/admin/communications/queue?view=${view}`);
      await expect(
        session.page
          .getByRole("navigation", { name: "Publication Queue views" })
          .getByRole("link", {
            name: new RegExp(
              view === "NEEDS_APPROVAL"
                ? "Needs Approval"
                : view === "APPROVED_UNRELEASED"
                  ? "Approved, Not Released"
                  : view === "RECENTLY_PUBLISHED"
                    ? "Recently Published"
                    : view === "EXPIRED_NEWS"
                      ? "Expired News"
                      : "Archived",
            ),
          }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        session.page.getByRole("link", { name: /All, \d+ items/ }),
      ).toBeVisible();
    }
    await session.page.goto("/admin/communications/queue?view=NEEDS_APPROVAL");
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-manager-needs-approval");
    await expect(
      session.page.getByText(queueTitles.storyApproval, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.newsApproval, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText("Another qualified approver is required."),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.approvedStory, { exact: true }),
    ).toHaveCount(0);
    await session.page.goto(
      "/admin/communications/queue?view=APPROVED_UNRELEASED",
    );
    await expectAxe(session.page);
    await expect(
      session.page.getByText(queueTitles.approvedStory, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.approvedNews, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.successor, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.releasedStory, { exact: true }),
    ).toHaveCount(0);
    await session.page.goto(
      "/admin/communications/queue?view=RECENTLY_PUBLISHED",
    );
    await expectAxe(session.page);
    await expect(
      session.page.getByText(queueTitles.releasedStory, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.releasedNews, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.expiredNews, { exact: true }),
    ).toHaveCount(0);
    await session.page.goto("/admin/communications/queue?view=EXPIRED_NEWS");
    await expectAxe(session.page);
    await expect(
      session.page.getByText(queueTitles.expiredNews, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.releasedNews, { exact: true }),
    ).toHaveCount(0);
    await session.page.goto("/admin/communications/queue?view=ARCHIVED");
    await expect(
      session.page.getByText(queueTitles.archivedStory, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.archivedNews, { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(queueTitles.releasedStory, { exact: true }),
    ).toHaveCount(0);
    await expectAxe(session.page);
    await session.context.close();
  });

  test("proves kind and owner filters preserve URL state and authorization", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await session.page.goto(
      `/admin/communications/queue?view=ALL&kind=STORY&owner=${contributor.adminUserId}`,
    );
    await expect(session.page.getByLabel("Editorial owner")).toHaveValue(
      contributor.adminUserId,
    );
    expect(
      (
        await session.page
          .getByRole("list", { name: "All items" })
          .locator("li")
          .allTextContents()
      ).join(""),
    ).not.toContain("News");
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-filtered");
    await session.page
      .getByRole("link", { name: /Recently Published/ })
      .click();
    await expect(session.page).toHaveURL(
      new RegExp(
        `view=RECENTLY_PUBLISHED&kind=STORY&owner=${contributor.adminUserId}`,
      ),
    );
    await session.page.getByLabel("Publication kind").selectOption("NEWS");
    await session.page.getByRole("button", { name: "Apply filters" }).click();
    const newsFilterUrl = new URL(session.page.url());
    expect(newsFilterUrl.searchParams.get("view")).toBe("RECENTLY_PUBLISHED");
    expect(newsFilterUrl.searchParams.get("kind")).toBe("NEWS");
    expect(newsFilterUrl.searchParams.get("page")).toBe("1");
    expect(
      (
        await session.page
          .getByRole("list", { name: "Recently Published items" })
          .locator("li")
          .allTextContents()
      ).join(""),
    ).not.toContain("Story");
    await expect(session.page.getByLabel("Editorial owner")).toHaveValue(
      contributor.adminUserId,
    );
    expect(
      await session.page
        .getByLabel("Editorial owner")
        .locator("option")
        .count(),
    ).toBeGreaterThan(2);

    await session.page.goto(
      `/admin/communications/queue?view=ALL&owner=${contributor.adminUserId}`,
    );
    const ownerOptions = await session.page
      .getByLabel("Editorial owner")
      .locator("option")
      .allTextContents();
    expect(ownerOptions).toEqual(
      expect.arrayContaining([
        "All owners",
        "Queue Contributor",
        "Queue Manager",
      ]),
    );
    await session.page.goto(
      `/admin/communications/queue?view=ALL&kind=NOT_A_KIND&owner=not-an-id&page=-2&pageSize=999%3Cscript%3E`,
    );
    await expect(session.page.locator('section[role="alert"]')).toContainText(
      "invalid view, filter, or page value",
    );
    await expect(session.page.locator("body")).not.toContainText("NOT_A_KIND");
    await expect(session.page.locator("body")).not.toContainText("<script>");
    await expectAxe(session.page);
    await session.context.close();
  });

  test("proves stable pagination, page-size choices, and no duplicated rows", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await session.page.goto(
      `/admin/communications/queue?view=ALL&kind=STORY&owner=${contributor.adminUserId}&pageSize=25&page=1`,
    );
    await expect(session.page.getByLabel("Items per page")).toHaveValue("25");
    await expect(
      session.page.getByRole("link", { name: "Next" }),
    ).toBeVisible();
    const firstPage = await rowTexts(session.page);
    await session.page.getByRole("link", { name: "Next" }).click();
    await expect
      .poll(() => new URL(session.page.url()).searchParams.get("page"))
      .toBe("2");
    const secondPageUrl = new URL(session.page.url());
    expect(secondPageUrl.searchParams.get("view")).toBe("ALL");
    expect(secondPageUrl.searchParams.get("kind")).toBe("STORY");
    expect(secondPageUrl.searchParams.get("owner")).toBe(
      contributor.adminUserId,
    );
    expect(secondPageUrl.searchParams.get("page")).toBe("2");
    expect(secondPageUrl.searchParams.get("pageSize") ?? "25").toBe("25");
    const secondPage = await rowTexts(session.page);
    expect(firstPage).not.toEqual(expect.arrayContaining(secondPage));
    await expect(
      session.page
        .getByRole("navigation", { name: "Publication Queue pagination" })
        .locator('span[aria-current="page"]'),
    ).toHaveText(/Page 2 of \d+/);
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-page-two");
    await session.page.getByLabel("Items per page").selectOption("50");
    await session.page.getByRole("button", { name: "Apply filters" }).click();
    const pageSizeUrl = new URL(session.page.url());
    expect(pageSizeUrl.searchParams.get("page")).toBe("1");
    expect(pageSizeUrl.searchParams.get("pageSize")).toBe("50");
    await expect(session.page.getByRole("link", { name: "Next" })).toHaveCount(
      0,
    );
    await expect(session.page.getByLabel("Items per page")).toHaveValue("50");
    await expect(
      session.page.getByLabel("Items per page").locator("option"),
    ).toHaveText(["25", "50", "100"]);
    await expectAxe(session.page);
    await session.context.close();
  });

  test("proves view-specific empty and invalid-query states are safe", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    const emptyOwner = randomUUID();
    const expected = new Map([
      ["MY_DRAFTS", "You have no draft communications."],
      ["NEEDS_REVIEW", "Nothing is waiting for your review."],
      ["NEEDS_APPROVAL", "Nothing is waiting for approval."],
      [
        "APPROVED_UNRELEASED",
        "No approved communications are waiting to be released.",
      ],
      [
        "RECENTLY_PUBLISHED",
        "No published communications match these filters.",
      ],
      ["EXPIRED_NEWS", "No expired News items match these filters."],
      ["ARCHIVED", "No archived communications match these filters."],
    ]);
    for (const [view, message] of expected) {
      await session.page.goto(
        `/admin/communications/queue?view=${view}&owner=${emptyOwner}`,
      );
      await expect(
        session.page.getByRole("heading", { name: "Nothing here yet" }),
      ).toBeVisible();
      await expect(session.page.getByText(message)).toBeVisible();
    }
    await expectAxe(session.page);
    await captureResponsiveState(session.page, "queue-empty");
    await session.page.goto("/admin/communications/queue?view=NOPE");
    await expect(session.page.locator('section[role="alert"]')).toContainText(
      "invalid view",
    );
    await session.page.goto(
      "/admin/communications/queue?view=ALL&owner=not-an-id",
    );
    await expect(session.page.locator('section[role="alert"]')).toContainText(
      "Queue filter is invalid",
    );
    await expect(session.page.locator("body")).not.toContainText("Prisma");
    await expect(session.page.locator("body")).not.toContainText("SELECT");
    await expect(session.page.locator("body")).not.toContainText(
      "candidateHash",
    );
    await expectAxe(session.page);
    await session.context.close();
  });

  test("proves queue semantics, server rendering, accessibility, and responsive screenshots", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    const requests: string[] = [];
    session.page.on("request", (request) => requests.push(request.url()));
    await session.page.goto(
      `/admin/communications/queue?view=ALL&kind=STORY&owner=${contributor.adminUserId}&pageSize=25`,
    );
    await expect(session.page.getByRole("heading", { level: 1 })).toHaveCount(
      1,
    );
    await expect(
      session.page.getByRole("navigation", { name: "Administration" }),
    ).toBeVisible();
    await expect(
      session.page.getByRole("navigation", { name: "Publication Queue views" }),
    ).toBeVisible();
    await expect(
      session.page.getByRole("navigation", {
        name: "Publication Queue pagination",
      }),
    ).toBeVisible();
    await expect(
      session.page.getByLabel("Filter Publication Queue"),
    ).toBeVisible();
    await expect(
      session.page.getByRole("list", { name: "All items" }),
    ).toBeVisible();
    await expect(
      session.page.getByText("Private queue fixture body."),
    ).toHaveCount(0);
    await expect(session.page.locator("body")).not.toContainText("contentHash");
    await expect(session.page.locator("body")).not.toContainText(
      "candidateHash",
    );
    expect(
      requests.filter((url) => new URL(url).pathname.startsWith("/api/"))
        .length,
    ).toBe(0);
    await expectAxe(session.page);

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1100 },
      { width: 1920, height: 1200 },
    ]) {
      await session.page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(session.page);
      await session.page.screenshot({
        fullPage: true,
        path: test
          .info()
          .outputPath(
            `publication-queue-${viewport.width}x${viewport.height}.png`,
          ),
      });
    }
    await session.context.close();
  });
});
