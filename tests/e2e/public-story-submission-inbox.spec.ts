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
  PublicStorySubmissionStatus,
} from "@/generated/prisma/client";

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Fixture = "story-manager" | "super-admin" | "dashboard-only";

type Persona = {
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
};

type SubmissionFixture = {
  id: string;
  name: string;
  email: string;
  status: PublicStorySubmissionStatus;
};

const FIXTURE_PREFIX = "C6B2B";
const BASE_TIME = new Date("2026-08-17T12:00:00.000Z");

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

async function newPersonaPage(browser: Browser, value: Persona) {
  const context = await browser.newContext({ storageState: value.state });
  return { context, page: await context.newPage() };
}

function emailFor(label: string) {
  return `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}@example.org`;
}

async function createSubmission(
  managerId: string,
  options: {
    label: string;
    status?: PublicStorySubmissionStatus;
    offsetMinutes?: number;
    publicationInterest?: boolean | null;
    involvesMinor?: boolean;
    involvesHomeownerOrApplicant?: boolean;
    containsSensitivePersonalCircumstances?: boolean;
    internalReviewNote?: string | null;
    storyText?: string;
  },
): Promise<SubmissionFixture> {
  const status = options.status ?? PublicStorySubmissionStatus.RECEIVED;
  const receivedAt = new Date(
    BASE_TIME.getTime() - (options.offsetMinutes ?? 0) * 60_000,
  );
  const name = `${FIXTURE_PREFIX} ${options.label}`;
  const email = emailFor(options.label);
  const submission = await database.publicStorySubmission.create({
    data: {
      submitterName: name,
      submitterEmail: email,
      relationshipToHabitat: "C6B2B test relationship",
      suggestedTitle: `${FIXTURE_PREFIX} ${options.label} title`,
      storyText:
        options.storyText ??
        `${FIXTURE_PREFIX} ${options.label} story text with enough characters for the confidential browser fixture.`,
      contactConsent: true,
      privacyNoticeVersion: "public-story-v1",
      privacyNoticeAcceptedAt: receivedAt,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
      publicationInterest: options.publicationInterest ?? null,
      involvesMinor: options.involvesMinor ?? false,
      involvesHomeownerOrApplicant:
        options.involvesHomeownerOrApplicant ?? false,
      containsSensitivePersonalCircumstances:
        options.containsSensitivePersonalCircumstances ?? false,
      status,
      internalReviewNote: options.internalReviewNote ?? null,
      version: 1,
      receivedAt,
      statusChangedAt: receivedAt,
      statusChangedByAdminUserId:
        status === PublicStorySubmissionStatus.RECEIVED ? null : managerId,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    },
  });
  return { id: submission.id, name, email, status };
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
      path: test
        .info()
        .outputPath(`${name}-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

function submissionRows(page: Page) {
  return page.locator("main > ul > li");
}

async function openDetail(page: Page, fixture: SubmissionFixture) {
  await page.goto(`/admin/communications/submissions/${fixture.id}`);
  await expect(
    page.getByRole("heading", { name: "Review Story Submission", level: 1 }),
  ).toBeVisible();
}

test.describe("C6B-2B Public Story Submission inbox browser validation", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let manager: Persona;
  let restorer: Persona;
  let denied: Persona;
  let received: SubmissionFixture;
  let inReview: SubmissionFixture;
  let followUp: SubmissionFixture;
  let accepted: SubmissionFixture;
  let declined: SubmissionFixture;
  let spam: SubmissionFixture;
  let allFlags: SubmissionFixture;
  let falseInterest: SubmissionFixture;
  let noFlags: SubmissionFixture;
  const paginationFixtures: SubmissionFixture[] = [];

  test.beforeAll(async ({ browser }) => {
    manager = await persona(browser, "story-manager", "C6B2B Review Manager");
    restorer = await persona(browser, "super-admin", "C6B2B Spam Restorer");
    denied = await persona(
      browser,
      "dashboard-only",
      "C6B2B Dashboard-Only User",
    );
    received = await createSubmission(manager.adminUserId, {
      label: "Received Detail",
      offsetMinutes: 1,
      publicationInterest: true,
      involvesMinor: true,
      storyText:
        "First paragraph with <script>alert('no')</script> & angle brackets.\nSecond line.\n\nSecond paragraph with \"quotes\" and Unicode punctuation — safely rendered.",
      internalReviewNote: "C6B2B existing internal note",
    });
    inReview = await createSubmission(manager.adminUserId, {
      label: "In Review Filter",
      status: PublicStorySubmissionStatus.IN_REVIEW,
      offsetMinutes: 2,
    });
    followUp = await createSubmission(manager.adminUserId, {
      label: "Follow Up Filter",
      status: PublicStorySubmissionStatus.FOLLOW_UP,
      offsetMinutes: 3,
    });
    accepted = await createSubmission(manager.adminUserId, {
      label: "Accepted Filter",
      status: PublicStorySubmissionStatus.ACCEPTED,
      offsetMinutes: 4,
    });
    declined = await createSubmission(manager.adminUserId, {
      label: "Declined Filter",
      status: PublicStorySubmissionStatus.DECLINED,
      offsetMinutes: 5,
    });
    spam = await createSubmission(manager.adminUserId, {
      label: "Spam Filter",
      status: PublicStorySubmissionStatus.SPAM,
      offsetMinutes: 6,
    });
    allFlags = await createSubmission(manager.adminUserId, {
      label: "All Sensitivity Flags",
      offsetMinutes: 7,
      involvesMinor: true,
      involvesHomeownerOrApplicant: true,
      containsSensitivePersonalCircumstances: true,
    });
    falseInterest = await createSubmission(manager.adminUserId, {
      label: "No Publication Interest",
      offsetMinutes: 8,
      publicationInterest: false,
    });
    noFlags = await createSubmission(manager.adminUserId, {
      label: "No Sensitivity Declaration",
      offsetMinutes: 9,
    });
    for (let index = 1; index <= 26; index += 1) {
      paginationFixtures.push(
        await createSubmission(manager.adminUserId, {
          label: `Pagination ${String(index).padStart(2, "0")}`,
          offsetMinutes: 20 + index,
        }),
      );
    }
  });

  test.afterAll(async () => {
    await database.$disconnect();
  });

  test("validates protected routes, navigation, denial boundaries, no-store, and safe prefetch", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    const errors = diagnostics(session.page);
    const response = await session.page.goto(
      "/admin/communications/submissions",
    );
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(
      session.page.getByRole("heading", {
        name: "Story Submissions",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      session.page.getByRole("link", { name: "Story Submissions" }),
    ).toHaveAttribute("aria-current", "page");
    await expectAxe(session.page);
    await expectNoOverflow(session.page);

    const detailLink = session.page.getByRole("link", {
      name: `Review Story Submission from ${received.name}`,
    });
    const detailHref = await detailLink.getAttribute("href");
    expect(detailHref).toBe(`/admin/communications/submissions/${received.id}`);
    const detailRequests: string[] = [];
    session.page.on("request", (request) => {
      if (detailHref && request.url().includes(detailHref)) {
        detailRequests.push(request.url());
      }
    });
    await session.page.waitForTimeout(400);
    expect(detailRequests).toEqual([]);
    expect(
      await session.page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] });

    await expect(session.page.locator("main")).not.toContainText(
      received.email,
    );
    await expect(session.page.locator("main")).not.toContainText(
      received.name + " story",
    );
    await expect(session.page.locator("main")).not.toContainText(
      "C6B2B existing internal note",
    );
    await expect(session.page.locator("head")).not.toContainText(
      received.email,
    );
    await captureResponsive(session.page, "inbox-populated");

    await session.page.goto("/admin/communications");
    await expect(session.page.locator("main")).not.toContainText("C6B2B");
    await session.page.goto("/admin/communications/queue");
    await expect(session.page.locator("main")).not.toContainText("C6B2B");

    const deniedSession = await newPersonaPage(browser, denied);
    await deniedSession.page.goto("/admin/communications/submissions");
    await expect(deniedSession.page).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      deniedSession.page.getByRole("link", { name: "Story Submissions" }),
    ).toHaveCount(0);
    await expect(deniedSession.page.locator("body")).not.toContainText("C6B2B");
    await deniedSession.page.goto(
      `/admin/communications/submissions/${received.id}`,
    );
    await expect(deniedSession.page).toHaveURL(/\/admin\/access-denied$/);
    await expect(deniedSession.page.locator("body")).not.toContainText(
      received.email,
    );

    const anonymous = await browser.newPage();
    await anonymous.goto("/admin/communications/submissions");
    await expect(anonymous).toHaveURL(/\/admin\/sign-in\?next=/);
    await expect(anonymous.locator("body")).not.toContainText("C6B2B");
    await anonymous.goto("/share-your-story");
    expect((await anonymous.title()).toLowerCase()).not.toContain(
      "story submission",
    );

    expect(errors).toEqual([]);
    await session.context.close();
    await deniedSession.context.close();
    await anonymous.context().close();
  });

  test("validates all status filters, invalid-query safety, pagination, and ordering", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    const filters = [
      ["RECEIVED", received],
      ["IN_REVIEW", inReview],
      ["FOLLOW_UP", followUp],
      ["ACCEPTED", accepted],
      ["DECLINED", declined],
      ["SPAM", spam],
    ] as const;
    for (const [status, fixture] of filters) {
      await session.page.goto(
        `/admin/communications/submissions?status=${status}`,
      );
      await expect(session.page.getByLabel("Status")).toHaveValue(status);
      await expect(
        session.page.getByText(fixture.name, { exact: true }),
      ).toBeVisible();
      if (status === "RECEIVED") {
        await expect(submissionRows(session.page)).toHaveCount(25);
      } else {
        await expect(submissionRows(session.page)).toHaveCount(1);
      }
      await expect(
        submissionRows(session.page).getByText(
          status === "RECEIVED" ? inReview.name : received.name,
          { exact: true },
        ),
      ).toHaveCount(0);
      await expectAxe(session.page);
    }

    await session.page.goto("/admin/communications/submissions");
    await expect(submissionRows(session.page)).toHaveCount(25);
    const firstPageNames = await submissionRows(session.page).allTextContents();
    await session.page.getByLabel("Status").selectOption("RECEIVED");
    await session.page.getByRole("button", { name: "Apply filter" }).click();
    await expect(session.page).toHaveURL(/status=RECEIVED/);
    await expect(session.page).toHaveURL(/page=1/);
    await session.page.getByRole("link", { name: "Next page" }).click();
    await expect(session.page).toHaveURL(/status=RECEIVED/);
    await expect(session.page).toHaveURL(/page=2/);
    await expect(submissionRows(session.page)).toHaveCount(5);
    const secondPageNames = await submissionRows(
      session.page,
    ).allTextContents();
    expect(secondPageNames.some((name) => firstPageNames.includes(name))).toBe(
      false,
    );
    await expect(
      session.page.getByText("Page 2 of 2", { exact: true }),
    ).toBeVisible();
    await expectAxe(session.page);

    await session.page.goto("/admin/communications/submissions?status=");
    await expect(
      session.page.locator('main [role="alert"]:visible'),
    ).toHaveCount(0);
    await expect(session.page.getByLabel("Status")).toHaveValue("");
    await expectAxe(session.page);

    await session.page.goto(
      "/admin/communications/submissions?status=RECEIVED&page=9999&pageSize=101&leak=C6B2B-secret",
    );
    await expect(session.page.locator("main").getByRole("alert")).toContainText(
      "invalid filter or page value",
    );
    await expect(session.page.locator("body")).not.toContainText(
      "C6B2B-secret",
    );
    await expect(session.page.locator("body")).not.toContainText(
      received.email,
    );
    await expectAxe(session.page);

    await session.context.close();
  });

  test("validates detail escaping, acknowledgments, publication-interest wording, and sensitivity", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await openDetail(session.page, received);
    await expect(
      session.page.getByRole("link", { name: received.email }),
    ).toHaveAttribute("href", `mailto:${received.email}`);
    await expect(session.page.locator("main")).toContainText(
      "Open to discussing publication — this is not publication consent.",
    );
    await expect(session.page.locator("main")).toContainText(
      "First paragraph with <script>alert('no')</script> & angle brackets.",
    );
    await expect(session.page.locator("main script")).toHaveCount(0);
    expect(await session.page.locator("main").innerHTML()).not.toContain(
      "<script>alert('no')",
    );
    await expect(session.page.locator("main")).toContainText(
      "Second paragraph",
    );
    await expect(session.page.locator("main")).toContainText("public-story-v1");
    await expect(session.page.locator("main")).toContainText("Granted");
    await expect(session.page.locator("main")).toContainText(
      "C6B2B existing internal note",
    );
    await expect(session.page.locator("main")).not.toContainText("auditEvents");
    await expect(session.page.locator("main")).not.toContainText("tokenHash");
    await expect(session.page.locator("main")).not.toContainText("127.0.0.1");
    await expect(
      session.page.getByLabel("Internal review note"),
    ).toHaveAttribute("maxLength", "2000");
    await expectAxe(session.page);
    await captureResponsive(session.page, "detail-received");

    await openDetail(session.page, allFlags);
    for (const label of [
      "Minor involved",
      "Homeowner or applicant involved",
      "Sensitive personal circumstances",
    ]) {
      await expect(
        session.page.getByText(label, { exact: true }),
      ).toBeVisible();
    }
    await expectAxe(session.page);
    await captureResponsive(session.page, "detail-all-flags");

    await openDetail(session.page, falseInterest);
    await expect(session.page.locator("main")).toContainText(
      "No publication interest indicated.",
    );
    await expect(session.page.locator("main")).toContainText("Granted");
    await openDetail(session.page, noFlags);
    await expect(session.page.locator("main")).toContainText(
      "No sensitivity declaration was recorded; this is not proof that the submission is safe.",
    );
    await expect(session.page.locator("main")).not.toContainText("Safe");
    await expectAxe(session.page);
    await session.context.close();
  });

  test("validates explicit lifecycle actions and terminal-state closure", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    const begin = await createSubmission(manager.adminUserId, {
      label: "Action Begin Review",
      offsetMinutes: 80,
    });
    await openDetail(session.page, begin);
    await session.page.getByRole("button", { name: "Begin Review" }).click();
    await expect(session.page).toHaveURL(/submission-review-started/);
    await expect(session.page.locator("main")).toContainText("In Review");

    const follow = await createSubmission(manager.adminUserId, {
      label: "Action Follow Up",
      status: PublicStorySubmissionStatus.IN_REVIEW,
      offsetMinutes: 81,
    });
    await openDetail(session.page, follow);
    await session.page
      .getByRole("button", { name: "Mark for Follow-Up" })
      .click();
    await expect(session.page).toHaveURL(/submission-follow-up-marked/);
    await expect(session.page.locator("main")).toContainText("Follow Up");

    const resume = await createSubmission(manager.adminUserId, {
      label: "Action Resume Review",
      status: PublicStorySubmissionStatus.FOLLOW_UP,
      offsetMinutes: 82,
    });
    await openDetail(session.page, resume);
    await session.page.getByRole("button", { name: "Resume Review" }).click();
    await expect(session.page).toHaveURL(/submission-review-resumed/);
    await expect(session.page.locator("main")).toContainText("In Review");

    for (const [label, button, code] of [
      ["Action Accept", "Accept", "submission-accepted"],
      ["Action Decline", "Decline", "submission-declined"],
      ["Action Spam", "Mark as Spam", "submission-marked-spam"],
    ] as const) {
      const fixture = await createSubmission(manager.adminUserId, {
        label,
        offsetMinutes: 90 + label.length,
      });
      await openDetail(session.page, fixture);
      await session.page.getByRole("button", { name: button }).click();
      if (button === "Mark as Spam") {
        await expect(session.page.locator("main")).toContainText(
          "leave ordinary triage",
        );
        await session.page
          .getByRole("button", { name: "Confirm Mark as Spam" })
          .click();
      }
      await expect(session.page).toHaveURL(new RegExp(code));
      await expect(session.page.locator("main")).toContainText(
        button === "Mark as Spam"
          ? "terminal for ordinary reviewers"
          : "This submission is terminal. No further lifecycle actions are available.",
      );
      for (const unsupported of [
        "Begin Review",
        "Resume Review",
        "Mark for Follow-Up",
        "Accept",
        "Decline",
        "Mark as Spam",
        "Reopen",
        "Restore",
        "Convert to Story",
        "Delete",
      ]) {
        await expect(
          session.page.getByRole("button", { name: unsupported, exact: true }),
        ).toHaveCount(0);
      }
      await expectAxe(session.page);
    }

    const ordinarySpam = await createSubmission(manager.adminUserId, {
      label: "Restore Capability Check",
      status: PublicStorySubmissionStatus.SPAM,
      offsetMinutes: 100,
    });
    await openDetail(session.page, ordinarySpam);
    await expect(
      session.page.getByRole("button", { name: "Restore to Received" }),
    ).toHaveCount(0);
    await expect(session.page.locator("main")).toContainText(
      "higher restore capability",
    );
    const restorerSession = await newPersonaPage(browser, restorer);
    await openDetail(restorerSession.page, ordinarySpam);
    await expect(
      restorerSession.page.getByRole("button", {
        name: "Restore to Received",
      }),
    ).toBeVisible();
    await expect(restorerSession.page.locator("main")).toContainText(
      "does not accept or approve it",
    );
    await restorerSession.page
      .getByRole("button", { name: "Restore to Received" })
      .click();
    await expect(restorerSession.page).toHaveURL(/submission-spam-restored/);
    await expect(restorerSession.page.locator("main")).toContainText(
      "Received",
    );
    await expectAxe(restorerSession.page);
    await restorerSession.context.close();
    await session.context.close();
  });

  test("validates review-note persistence, validation, and stale status/note conflicts", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await openDetail(session.page, received);
    await session.page
      .getByLabel("Internal review note")
      .fill("C6B2B updated review note");
    await session.page
      .getByRole("button", { name: "Save internal note" })
      .click();
    await expect(session.page).toHaveURL(/submission-note-updated/);
    await expect(session.page.locator("main")).toContainText(
      "Internal review note updated.",
    );
    await expect(session.page.getByLabel("Internal review note")).toHaveValue(
      "C6B2B updated review note",
    );
    expect(
      await database.publicStorySubmission.findUniqueOrThrow({
        where: { id: received.id },
      }),
    ).toMatchObject({
      internalReviewNote: "C6B2B updated review note",
      version: 2,
    });

    const staleNote = await createSubmission(manager.adminUserId, {
      label: "Concurrency Note",
      offsetMinutes: 110,
      internalReviewNote: "Original concurrency note",
    });
    const pageA = await newPersonaPage(browser, manager);
    const pageB = await newPersonaPage(browser, manager);
    await openDetail(pageA.page, staleNote);
    await openDetail(pageB.page, staleNote);
    await pageB.page
      .getByLabel("Internal review note")
      .fill("Page B wins this note.");
    await pageB.page
      .getByRole("button", { name: "Save internal note" })
      .click();
    await expect(pageB.page).toHaveURL(/submission-note-updated/);
    await pageA.page
      .getByLabel("Internal review note")
      .fill("Page A stale note.");
    await pageA.page
      .getByRole("button", { name: "Save internal note" })
      .click();
    await expect(pageA.page.locator("main").getByRole("alert")).toContainText(
      "changed in another session",
    );
    await expect(pageA.page.getByLabel("Internal review note")).toHaveValue(
      "Page A stale note.",
    );
    expect(
      await database.publicStorySubmission.findUniqueOrThrow({
        where: { id: staleNote.id },
      }),
    ).toMatchObject({
      internalReviewNote: "Page B wins this note.",
      version: 2,
    });

    const staleStatus = await createSubmission(manager.adminUserId, {
      label: "Concurrency Status",
      offsetMinutes: 120,
    });
    await openDetail(pageA.page, staleStatus);
    await openDetail(pageB.page, staleStatus);
    await pageB.page.getByRole("button", { name: "Begin Review" }).click();
    await expect(pageB.page).toHaveURL(/submission-review-started/);
    await pageA.page.getByRole("button", { name: "Begin Review" }).click();
    await expect(pageA.page.locator("main").getByRole("alert")).toContainText(
      "changed in another session",
    );
    expect(
      await database.publicStorySubmission.findUniqueOrThrow({
        where: { id: staleStatus.id },
      }),
    ).toMatchObject({
      status: PublicStorySubmissionStatus.IN_REVIEW,
      version: 2,
    });
    await expectAxe(pageA.page);
    await captureResponsive(pageA.page, "detail-concurrency-error");
    await pageA.context.close();
    await pageB.context.close();
    await session.context.close();
  });

  test("validates public and operational feature boundaries", async ({
    browser,
  }) => {
    const session = await newPersonaPage(browser, manager);
    await session.page.goto("/");
    await expect(
      session.page.getByRole("link", { name: /Story Submissions/i }),
    ).toHaveCount(0);
    await session.page.goto("/share-your-story");
    await expect(
      session.page.getByRole("heading", {
        name: "Share Your Story is not accepting submissions right now.",
      }),
    ).toBeVisible();
    await expect(session.page.locator("#storyImages")).toHaveCount(0);
    await session.page.goto("/admin/communications");
    await expect(session.page.locator("main")).not.toContainText("C6B2B");
    await session.page.goto("/admin/communications/queue");
    await expect(session.page.locator("main")).not.toContainText("C6B2B");
    await session.page.goto("/admin/communications/homepage");
    await expect(session.page.locator("main")).not.toContainText("C6B2B");
    await expectAxe(session.page);
    await captureResponsive(session.page, "boundary-homepage-curation");
    await session.context.close();
  });
});
