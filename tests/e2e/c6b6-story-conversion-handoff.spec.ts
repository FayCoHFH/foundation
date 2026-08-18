import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  PublicStorySubmissionStatus,
  PrismaClient,
} from "@/generated/prisma/client";

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fixturePrefix = `C6B6 browser ${randomUUID()}`;

type Persona = Readonly<{
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
}>;

type Fixture = Readonly<{
  acceptedSubmissionId: string;
  reviewerOnlySubmissionId: string;
  sourceEmail: string;
}>;

async function establishFixture(page: Page, fixture: string) {
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
    select: { id: true },
  });
}

async function persona(browser: Browser, fixture: string): Promise<Persona> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page, fixture);
  const admin = await identifySession(page);
  const state = await context.storageState();
  await context.close();
  return { state, adminUserId: admin.id };
}

async function reviewOnlyPersona(browser: Browser): Promise<Persona> {
  const value = await persona(browser, "story-manager");
  const role = await database.role.upsert({
    where: { key: "test-c6b6-reviewer" },
    create: {
      key: "test-c6b6-reviewer",
      name: "C6B6 Submission Reviewer",
      description: "Bounded Story conversion browser reviewer.",
      isSystem: false,
      isActive: true,
    },
    update: { isActive: true },
  });
  const permission = await database.permission.findUniqueOrThrow({
    where: { key: "communications.submissions.review" },
    select: { id: true },
  });
  await database.rolePermission.deleteMany({ where: { roleId: role.id } });
  await database.rolePermission.create({
    data: { roleId: role.id, permissionId: permission.id },
  });
  await database.userRole.deleteMany({
    where: { adminUserId: value.adminUserId },
  });
  await database.userRole.create({
    data: { adminUserId: value.adminUserId, roleId: role.id },
  });
  return value;
}

async function createAcceptedSubmission(statusActorId: string, label: string) {
  const sourceEmail = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID()}@example.org`;
  return database.publicStorySubmission.create({
    data: {
      submitterName: `${label} Submitter`,
      submitterEmail: sourceEmail,
      relationshipToHabitat: "Volunteer",
      suggestedTitle: `${label} suggested title`,
      storyText: `${label} confidential source story text for a private editorial handoff.\n\nThis second paragraph remains ordinary Story draft source material.`,
      contactConsent: true,
      privacyNoticeVersion: "public-story-v1",
      privacyNoticeAcceptedAt: new Date("2026-08-18T12:00:00.000Z"),
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
      publicationInterest: true,
      status: PublicStorySubmissionStatus.ACCEPTED,
      version: 1,
      receivedAt: new Date("2026-08-18T12:00:00.000Z"),
      statusChangedAt: new Date("2026-08-18T12:01:00.000Z"),
      statusChangedByAdminUserId: statusActorId,
    },
    select: { id: true, version: true, submitterEmail: true },
  });
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

test.describe("C6B-6 Story conversion handoff", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let manager: Persona;
  let reviewerOnly: Persona;
  let denied: Persona;
  let fixture: Fixture;

  test.beforeAll(async ({ browser }) => {
    manager = await persona(browser, "story-manager");
    reviewerOnly = await reviewOnlyPersona(browser);
    denied = await persona(browser, "dashboard-only");
    const accepted = await createAcceptedSubmission(
      manager.adminUserId,
      `${fixturePrefix} accepted`,
    );
    const reviewerSubmission = await createAcceptedSubmission(
      manager.adminUserId,
      `${fixturePrefix} reviewer-only`,
    );
    fixture = {
      acceptedSubmissionId: accepted.id,
      reviewerOnlySubmissionId: reviewerSubmission.id,
      sourceEmail: accepted.submitterEmail,
    };
  });

  test.afterAll(async () => {
    if (fixture) {
      const submissionIds = [
        fixture.acceptedSubmissionId,
        fixture.reviewerOnlySubmissionId,
      ];
      await database.publicStorySubmissionStoryConversion.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await database.publicStorySubmission.deleteMany({
        where: { id: { in: submissionIds } },
      });
    }
    await database.$disconnect();
  });

  test("authorized manager creates a private draft, sees the typed handoff, and retains strict boundaries", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: manager.state });
    const page = await context.newPage();
    const diagnostics: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.push(error.message));

    await page.goto(
      `/admin/communications/submissions/${fixture.acceptedSubmissionId}`,
    );
    await expect(
      page.getByRole("heading", { name: "Story handoff" }),
    ).toBeVisible();
    await expect(
      page.getByLabel(
        "Create a private Story draft from this accepted submission for editorial review.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Story draft" }),
    ).toBeVisible();
    await expectAxe(page);

    for (const width of [375, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 1000 ? 900 : 1100 });
      await expectNoHorizontalOverflow(page);
      await expectAxe(page);
    }

    await page
      .getByLabel(
        "Create a private Story draft from this accepted submission for editorial review.",
      )
      .check();
    await page.getByRole("button", { name: "Create Story draft" }).click();
    await expect(page.getByText("Story draft created")).toBeVisible();
    const storyLink = page.getByRole("link", { name: "Open Story draft" });
    await expect(storyLink).toHaveAttribute(
      "href",
      /\/admin\/communications\/stories\/[0-9a-f-]+$/,
    );
    expect(await page.content()).not.toContain("eval() is not supported");
    expect(diagnostics).toEqual([]);

    const storyUrl = await storyLink.getAttribute("href");
    if (!storyUrl) throw new Error("Story draft link was missing.");
    await storyLink.click();
    await expect(page).toHaveURL(new RegExp(`${storyUrl}$`));
    await expect(
      page.getByRole("heading", {
        name: `${fixturePrefix} accepted suggested title`,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Story title")).toHaveValue(
      `${fixturePrefix} accepted suggested title`,
    );
    expect(await page.locator("main").textContent()).not.toContain(
      fixture.sourceEmail,
    );

    const conversion =
      await database.publicStorySubmissionStoryConversion.findUniqueOrThrow({
        where: { submissionId: fixture.acceptedSubmissionId },
        include: { story: { include: { publication: true } } },
      });
    expect(conversion.story.publication.workflowState).toBe("DRAFT");
    expect(conversion.story.publication.releaseState).toBe("UNPUBLISHED");
    expect(
      await database.publicStoryProjection.findUnique({
        where: { publicationId: conversion.story.publicationId },
      }),
    ).toBeNull();
    await context.close();
  });

  test("conversion is one-time and reviewer-only and dashboard-only actors cannot manufacture the action", async ({
    browser,
  }) => {
    const reviewerContext = await browser.newContext({
      storageState: reviewerOnly.state,
    });
    const reviewer = await reviewerContext.newPage();
    await reviewer.goto(
      `/admin/communications/submissions/${fixture.reviewerOnlySubmissionId}`,
    );
    await expect(
      reviewer.getByText(
        "Story draft creation requires both submission-review and Story-create authority.",
      ),
    ).toBeVisible();
    await expect(
      reviewer.getByRole("button", { name: "Create Story draft" }),
    ).toHaveCount(0);
    await expectAxe(reviewer);
    await reviewerContext.close();

    const managerContext = await browser.newContext({
      storageState: manager.state,
    });
    const managerPage = await managerContext.newPage();
    await managerPage.goto(
      `/admin/communications/submissions/${fixture.acceptedSubmissionId}`,
    );
    await expect(managerPage.getByText("Story draft created")).toBeVisible();
    await expect(
      managerPage.getByRole("button", { name: "Create Story draft" }),
    ).toHaveCount(0);
    await managerContext.close();

    const deniedContext = await browser.newContext({
      storageState: denied.state,
    });
    const deniedPage = await deniedContext.newPage();
    await deniedPage.goto(
      `/admin/communications/submissions/${fixture.acceptedSubmissionId}`,
    );
    await expect(deniedPage).toHaveURL(/\/admin\/access-denied$/);
    await expectAxe(deniedPage);
    await deniedContext.close();
  });
});
