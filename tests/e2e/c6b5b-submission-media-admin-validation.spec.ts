import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import sharp from "sharp";

import {
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaSubjectType,
  PrismaClient,
} from "@/generated/prisma/client";
import {
  createPublicStorySubmissionMediaClearance,
  createPublicStorySubmissionMediaSubject,
  verifyPublicStorySubmissionMediaClearance,
} from "@/modules/communications/submissions/submission-media-clearance-service";

import { testAuthSecret } from "../../playwright.config";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fixedNow = new Date("2026-08-17T12:00:00.000Z");
const fixturePrefix = "C6B5B";
const allUses = {
  websitePublicationAllowed: true,
  socialMediaAllowed: true,
  printAllowed: true,
  fundraisingPromotionalAllowed: true,
  paidAdvertisingAllowed: true,
} as const;

type Persona = {
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
  adminUserId: string;
};

type Fixture = {
  submissionId: string;
  primaryMediaId: string;
  secondaryMediaId: string;
  primaryOriginalFilename: string;
  textOnlySubmissionId: string;
};

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
    select: { id: true, authUserId: true },
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
    where: { key: "test-c6b5b-reviewer" },
    create: {
      key: "test-c6b5b-reviewer",
      name: "C6B5B Submission Reviewer",
      description: "Bounded browser validation reviewer.",
      isSystem: false,
      isActive: true,
    },
    update: { isActive: true },
  });
  const reviewPermission = await database.permission.findUniqueOrThrow({
    where: { key: "communications.submissions.review" },
    select: { id: true },
  });
  await database.rolePermission.deleteMany({ where: { roleId: role.id } });
  await database.rolePermission.create({
    data: { roleId: role.id, permissionId: reviewPermission.id },
  });
  await database.userRole.deleteMany({
    where: { adminUserId: value.adminUserId },
  });
  await database.userRole.create({
    data: { adminUserId: value.adminUserId, roleId: role.id },
  });
  return value;
}

async function managerCapabilities() {
  const role = await database.role.findUniqueOrThrow({
    where: { key: "communications-manager" },
    include: { permissions: { include: { permission: true } } },
  });
  return role.permissions.map(({ permission }) => permission.key as never);
}

async function imageBuffer(background: { r: number; g: number; b: number }) {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background,
    },
  })
    .jpeg()
    .toBuffer();
}

async function createFixture(
  browser: Browser,
  promoter: Persona,
): Promise<Fixture> {
  const primaryFlags = {
    involvesMinor: true,
    involvesHomeownerOrApplicant: true,
    involvesOtherIdentifiablePerson: true,
    depictsPrivateResidence: true,
    containsSensitivePersonalCircumstances: true,
  } as const;
  const secondaryFlags = {
    involvesMinor: false,
    involvesHomeownerOrApplicant: false,
    involvesOtherIdentifiablePerson: false,
    depictsPrivateResidence: false,
    containsSensitivePersonalCircumstances: false,
  } as const;
  const submitterEmail = `${fixturePrefix.toLowerCase()}-${randomUUID()}@example.org`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto("/share-your-story");
  expect(response?.status()).toBe(200);
  await expect(page.locator("#storyImages")).toBeEnabled({ timeout: 30_000 });
  await page
    .getByLabel("Name", { exact: true })
    .fill(`${fixturePrefix} Synthetic Submitter`);
  await page.getByLabel("Email", { exact: true }).fill(submitterEmail);
  await page
    .getByLabel("Your relationship to Habitat", { exact: true })
    .fill("Volunteer");
  await page
    .getByLabel("Suggested title", { exact: false })
    .fill(`${fixturePrefix} confidential review story`);
  await page
    .locator("#storyText")
    .fill(
      `${fixturePrefix} confidential story text must never appear in public metadata or storage.`,
    );
  await page.locator("#storyImages").setInputFiles([
    {
      name: `${fixturePrefix}-primary-original.jpg`,
      mimeType: "image/jpeg",
      buffer: await imageBuffer({ r: 74, g: 111, b: 94 }),
    },
    {
      name: `${fixturePrefix}-secondary-original.jpg`,
      mimeType: "image/jpeg",
      buffer: await imageBuffer({ r: 142, g: 83, b: 54 }),
    },
  ]);
  await expect(page.locator("legend").filter({ hasText: /Ready/ })).toHaveCount(
    2,
    {
      timeout: 30_000,
    },
  );
  await page.getByLabel(/right to submit these images/i).check();
  for (const id of [
    "contactConsent",
    "editorialReviewAcknowledged",
    "sensitiveDataWarningAcknowledged",
    "privacyNoticeAcknowledged",
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.getByRole("button", { name: "Send my story" }).click();
  await expect(
    page.getByText("Your story has been received for confidential review."),
  ).toBeVisible({ timeout: 30_000 });
  const submission = await database.publicStorySubmission.findFirstOrThrow({
    where: { submitterEmail },
    include: { submissionMedia: { orderBy: { ordinal: "asc" } } },
  });
  expect(submission.submissionMedia).toHaveLength(2);
  await context.close();

  const primary = submission.submissionMedia[0];
  const secondary = submission.submissionMedia[1];
  if (!primary || !secondary)
    throw new Error("Synthetic media fixture was incomplete.");
  await database.publicStorySubmissionMedia.update({
    where: { id: primary.id },
    data: {
      ...primaryFlags,
      description: "Synthetic contributor description for browser validation.",
      suggestedPhotoCredit: "Contributor suggested credit only",
    },
  });
  await database.publicStorySubmissionMedia.update({
    where: { id: secondary.id },
    data: secondaryFlags,
  });

  const capabilities = await managerCapabilities();
  const actor = { adminUserId: promoter.adminUserId, capabilities };
  const adult = await createPublicStorySubmissionMediaSubject(database, actor, {
    submissionId: submission.id,
    displayLabel: "Synthetic identifiable adult",
    subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
    mediaIds: [primary.id],
  });
  const minor = await createPublicStorySubmissionMediaSubject(database, actor, {
    submissionId: submission.id,
    displayLabel: "Synthetic minor subject",
    subjectType: PublicStorySubmissionMediaSubjectType.MINOR,
    mediaIds: [primary.id],
  });
  const submitter = await createPublicStorySubmissionMediaSubject(
    database,
    actor,
    {
      submissionId: submission.id,
      displayLabel: "Synthetic submitter",
      subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
      isSubmitter: true,
      mediaIds: [primary.id],
    },
  );

  const clearances = [
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      evidenceType:
        PublicStorySubmissionMediaEvidenceType.EXISTING_HABITAT_RELEASE,
      existingEvidenceReference: "habitat-release-c6b5b-001",
      existingEvidenceVersion: "2026.1",
      verify: false,
    },
    {
      clearanceType:
        PublicStorySubmissionMediaClearanceType.HOMEOWNER_APPLICANT,
      evidenceType:
        PublicStorySubmissionMediaEvidenceType.EXISTING_HABITAT_RELEASE,
      existingEvidenceReference: "habitat-release-c6b5b-002",
      verify: true,
    },
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.PRIVATE_RESIDENCE,
      evidenceType: PublicStorySubmissionMediaEvidenceType.STAFF_PRIVACY_REVIEW,
      verify: true,
    },
    {
      clearanceType:
        PublicStorySubmissionMediaClearanceType.SENSITIVE_CIRCUMSTANCES,
      evidenceType: PublicStorySubmissionMediaEvidenceType.STAFF_PRIVACY_REVIEW,
      verify: true,
    },
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
      subjectId: adult.id,
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      verify: true,
    },
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN,
      subjectId: minor.id,
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      verify: true,
    },
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS,
      subjectId: submitter.id,
      evidenceType:
        PublicStorySubmissionMediaEvidenceType.SUBMITTER_LIKENESS_CONSENT,
      verify: true,
    },
  ] as const;
  for (const item of clearances) {
    const created = await createPublicStorySubmissionMediaClearance(
      database,
      actor,
      {
        submissionId: submission.id,
        clearanceType: item.clearanceType,
        subjectId: "subjectId" in item ? item.subjectId : null,
        mediaIds: [primary.id],
        evidenceType: item.evidenceType,
        existingEvidenceReference:
          "existingEvidenceReference" in item
            ? item.existingEvidenceReference
            : null,
        existingEvidenceVersion:
          "existingEvidenceVersion" in item
            ? item.existingEvidenceVersion
            : null,
        dateObtained: fixedNow,
        ...allUses,
      },
      { now: () => fixedNow },
    );
    if (item.verify) {
      await verifyPublicStorySubmissionMediaClearance(
        database,
        actor,
        {
          clearanceId: created.id,
          expectedClearanceVersion: created.version,
          dateObtained: fixedNow,
        },
        { now: () => fixedNow },
      );
    }
  }
  const textOnly = await database.publicStorySubmission.create({
    data: {
      submitterName: `${fixturePrefix} Text Only`,
      submitterEmail: `${fixturePrefix.toLowerCase()}-text-${randomUUID()}@example.org`,
      relationshipToHabitat: "Volunteer",
      suggestedTitle: `${fixturePrefix} text-only submission`,
      storyText: `${fixturePrefix} text-only confidential story fixture with enough narrative length for the submission constraint.`,
      contactConsent: true,
      privacyNoticeVersion: "public-story-v1",
      privacyNoticeAcceptedAt: fixedNow,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
      version: 1,
      receivedAt: fixedNow,
      statusChangedAt: fixedNow,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
    select: { id: true },
  });
  return {
    submissionId: submission.id,
    primaryMediaId: primary.id,
    secondaryMediaId: secondary.id,
    primaryOriginalFilename: `${fixturePrefix}-primary-original.jpg`,
    textOnlySubmissionId: textOnly.id,
  };
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

async function openMedia(page: Page, fixture: Fixture, mediaId: string) {
  const response = await page.goto(
    `/admin/communications/submissions/${fixture.submissionId}/media/${mediaId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Review submitted image" }),
  ).toBeVisible();
  return response;
}

test.describe("C6B-5B administrative Story Submission media validation", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let reviewer: Persona;
  let promoter: Persona;
  let restorer: Persona;
  let denied: Persona;
  let fixture: Fixture;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    reviewer = await reviewOnlyPersona(browser);
    promoter = await persona(browser, "story-manager");
    restorer = await persona(browser, "super-admin");
    denied = await persona(browser, "dashboard-only");
    fixture = await createFixture(browser, promoter);
  });

  test.afterAll(async () => {
    if (!fixture) {
      await database.$disconnect();
      return;
    }
    const submissionIds = [fixture.submissionId, fixture.textOnlySubmissionId];
    const promotions =
      await database.publicStorySubmissionMediaPromotion.findMany({
        where: { sourceSubmissionId: { in: submissionIds } },
        select: { id: true, mediaAssetId: true },
      });
    const mediaAssetIds = promotions.map(({ mediaAssetId }) => mediaAssetId);
    if (mediaAssetIds.length) {
      await database.mediaUsage.deleteMany({
        where: { mediaAssetId: { in: mediaAssetIds } },
      });
      await database.publicStorySubmissionMediaPromotion.deleteMany({
        where: { id: { in: promotions.map(({ id }) => id) } },
      });
      await database.mediaAsset.deleteMany({
        where: { id: { in: mediaAssetIds } },
      });
    }
    await database.publicStorySubmission.deleteMany({
      where: { id: { in: submissionIds } },
    });
    await rm(process.env.LOCAL_STORAGE_ROOT ?? ".data/storage", {
      recursive: true,
      force: true,
    });
    await database.$disconnect();
  });

  test("authorized review is confidential, accessible, responsive, and capability bounded", async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ storageState: reviewer.state });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    const response = await openMedia(page, fixture, fixture.primaryMediaId);
    const html = await page.content();
    expect(html).not.toContain("quarantineStorageKey");
    expect(html).not.toContain("originalSha256");
    expect(html).not.toContain("uploadAuthorization");
    expect(html).not.toContain(fixture.primaryOriginalFilename);
    expect(html).toContain("Suggested photo credit");
    expect(html).toContain("Final public credit");
    expect(html).toContain("Ready for review");
    expect(html).not.toContain("Approved");
    expect(html).not.toContain("Cleared");
    expect(html).not.toContain("Publishable");
    expect(html).toContain("Minor involved");
    expect(html).toContain("Private residence");
    expect(html).toContain("Existing Habitat release");
    expect(html).toContain("Image rights");
    expect(html).toContain("Paid advertising");
    expect(html).not.toContain("Promote to Media Library");
    expect(html).toContain("Promotion requires communications.media.promote");
    expect(response?.headers()["content-security-policy"] ?? "").not.toContain(
      "unsafe-eval",
    );
    await expectAxe(page);
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1100 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`media-review-${viewport.width}.png`),
      });
    }
    const reviewImage = page.locator(
      'img[alt="Private review derivative of submitted image"]',
    );
    const reviewImageUrl = await reviewImage.getAttribute("src");
    expect(reviewImageUrl).toContain("/review-image");
    expect(reviewImageUrl).not.toContain("public");
    const imageResponse = await page.request.get(reviewImageUrl!);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["cache-control"]).toContain("private");
    expect(imageResponse.headers()["cache-control"]).toContain("no-store");
    expect(imageResponse.headers()["content-type"]).toBe("image/jpeg");
    const storageState = await page.evaluate(async () => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      indexedDb: "databases" in indexedDB ? await indexedDB.databases() : [],
    }));
    expect(JSON.stringify(storageState)).not.toContain("confidential");
    expect(JSON.stringify(storageState)).not.toContain("suggested");
    expect(JSON.stringify(storageState)).not.toContain("storageKey");
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  test("anonymous and authenticated users without review capability cannot receive confidential media", async ({
    browser,
  }) => {
    const anonymous = await browser.newPage();
    await anonymous.goto(
      `/admin/communications/submissions/${fixture.submissionId}`,
    );
    await expect(anonymous).toHaveURL(
      new RegExp(`/admin/sign-in\\?next=.*${fixture.submissionId}`),
    );
    await anonymous.close();

    const deniedContext = await browser.newContext({
      storageState: denied.state,
    });
    const deniedPage = await deniedContext.newPage();
    await deniedPage.goto(
      `/admin/communications/submissions/${fixture.submissionId}`,
    );
    await expect(deniedPage).toHaveURL("/admin/access-denied");
    await expect(
      deniedPage.getByText("C6B5B confidential story text"),
    ).toHaveCount(0);
    await deniedContext.close();
  });

  test("reviewer can create bounded subject/clearance and safely review evidence", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: reviewer.state });
    const page = await context.newPage();
    await openMedia(page, fixture, fixture.secondaryMediaId);
    const subjectForm = page.locator("form").filter({ hasText: "Add subject" });
    await subjectForm
      .getByLabel("Subject label")
      .fill("Synthetic adult reviewer label");
    await subjectForm
      .getByLabel("Subject type")
      .selectOption("IDENTIFIABLE_ADULT");
    await subjectForm.getByRole("button", { name: "Add subject" }).click();
    await expect(page.getByRole("status")).toContainText("Subject added");

    const createForm = page
      .locator("form")
      .filter({ hasText: "Create clearance" });
    await createForm.getByLabel("Clearance type").selectOption("IMAGE_RIGHTS");
    await createForm
      .getByLabel("Evidence type")
      .selectOption("EXISTING_HABITAT_RELEASE");
    await createForm
      .getByLabel("Existing release reference (if applicable)")
      .fill("browser-release-reference");
    await createForm
      .getByLabel("Release/version (if known)")
      .fill("browser-v1");
    for (const name of [
      "Website/publication",
      "Social media",
      "Print",
      "Fundraising/promotional",
      "Paid advertising",
    ]) {
      await createForm.getByLabel(name).check();
    }
    await createForm.getByRole("button", { name: "Create clearance" }).click();
    await expect(page.getByRole("status")).toContainText("Clearance created");
    const imageRights = page
      .locator('section[aria-labelledby="media-clearances-heading"] li')
      .filter({ hasText: "Image rights" })
      .last();
    await imageRights.getByRole("button", { name: "Verify clearance" }).click();
    await expect(page.getByRole("status")).toContainText("Clearance verified");
    await expect(imageRights).toContainText("Verified");
    const evidenceFile = imageRights.locator('input[name="evidenceFile"]');
    await evidenceFile.setInputFiles({
      name: "synthetic-clearance-evidence.jpg",
      mimeType: "image/jpeg",
      buffer: await imageBuffer({ r: 38, g: 88, b: 128 }),
    });
    await imageRights.getByLabel("Declared format").selectOption("image/jpeg");
    await imageRights.getByRole("button", { name: "Upload evidence" }).click();
    await expect(page.getByRole("status")).toContainText("Evidence uploaded");
    await expect(imageRights).toContainText("Ready");
    const reviewEvidence = imageRights.getByRole("link", {
      name: "Review page 1",
    });
    const reviewEvidenceResponse = await page.request.get(
      (await reviewEvidence.getAttribute("href"))!,
    );
    expect(reviewEvidenceResponse.status()).toBe(200);
    expect(reviewEvidenceResponse.headers()["cache-control"]).toContain(
      "no-store",
    );
    expect(reviewEvidenceResponse.headers()["content-type"]).toBe("image/jpeg");
    const originalEvidence = imageRights.getByRole("link", {
      name: "Download original evidence",
    });
    const originalEvidenceResponse = await page.request.get(
      (await originalEvidence.getAttribute("href"))!,
    );
    expect(originalEvidenceResponse.status()).toBe(200);
    expect(originalEvidenceResponse.headers()["content-disposition"]).toMatch(
      /attachment/i,
    );
    await expect(page.locator("body")).toContainText("Website/publication");
    await expectAxe(page);
    await context.close();
  });

  test("promoter can verify the final gate, promote once, and preserve source privacy", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: promoter.state });
    const page = await context.newPage();
    await openMedia(page, fixture, fixture.primaryMediaId);
    const imageRights = page
      .locator('section[aria-labelledby="media-clearances-heading"] li')
      .filter({ hasText: "Image rights" })
      .first();
    await imageRights.getByRole("button", { name: "Verify clearance" }).click();
    await expect(page.getByRole("status")).toContainText("Clearance verified");
    await expect(
      page
        .getByRole("region", { name: "Public-use eligibility" })
        .getByText("Eligible")
        .first(),
    ).toBeVisible();
    const publicationCountBefore = await database.publication.count();
    const creditForm = page
      .locator("form")
      .filter({ hasText: "Promote to Media Library" });
    await creditForm
      .getByLabel("Credit treatment")
      .selectOption("VERIFIED_CREDIT");
    await creditForm
      .getByLabel("Final public credit")
      .fill("Verified synthetic Habitat credit");
    await creditForm
      .getByRole("button", { name: "Promote to Media Library" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Sanitized media asset created",
    );
    await expect(
      page.getByText("Promotion creates a sanitized public asset"),
    ).toBeVisible();
    expect(
      await database.publicStorySubmissionMediaPromotion.count({
        where: { sourceMediaId: fixture.primaryMediaId },
      }),
    ).toBe(1);
    expect(
      await database.mediaAsset.count({
        where: { promotion: { sourceMediaId: fixture.primaryMediaId } },
      }),
    ).toBe(1);
    expect(await database.publication.count()).toBe(publicationCountBefore);
    await expect(
      page.getByRole("button", { name: "Promote to Media Library" }),
    ).toHaveCount(0);
    await context.close();
  });

  test("restriction blocks new use, surfaces existing use, and restoration requires higher authority", async ({
    browser,
  }) => {
    const promotion =
      await database.publicStorySubmissionMediaPromotion.findUniqueOrThrow({
        where: { sourceMediaId: fixture.primaryMediaId },
        select: { mediaAssetId: true },
      });
    await database.mediaUsage.create({
      data: {
        mediaAssetId: promotion.mediaAssetId,
        usageType: "WEBSITE_PUBLICATION",
        subjectType: "PUBLICATION",
        subjectId: randomUUID(),
      },
    });
    const reviewerContext = await browser.newContext({
      storageState: reviewer.state,
    });
    const reviewerPage = await reviewerContext.newPage();
    await openMedia(reviewerPage, fixture, fixture.primaryMediaId);
    const restrictionForm = reviewerPage
      .locator("form")
      .filter({ hasText: "Restrict media" });
    await restrictionForm.getByLabel("Reason").selectOption("PRIVACY_CONCERN");
    await restrictionForm
      .getByLabel("Confidential note")
      .fill("Synthetic confidential review note");
    await restrictionForm
      .getByRole("button", { name: "Restrict media" })
      .click();
    await expect(reviewerPage.getByRole("status")).toContainText(
      "Media restriction recorded",
    );
    await expect(reviewerPage.locator("body")).toContainText(
      "Media is restricted",
    );
    await expect(reviewerPage.locator("body")).toContainText("Existing uses");
    await expect(reviewerPage.locator("body")).toContainText(
      "Website Publication",
    );
    await expect(reviewerPage.locator("body")).toContainText(
      "Restoration requires the higher media restoration capability",
    );
    await expect(reviewerPage.locator("body")).not.toContainText(
      "Synthetic confidential review note",
    );
    await reviewerContext.close();

    const restorerContext = await browser.newContext({
      storageState: restorer.state,
    });
    const restorerPage = await restorerContext.newPage();
    await openMedia(restorerPage, fixture, fixture.primaryMediaId);
    await restorerPage
      .getByRole("button", { name: "Restore eligibility" })
      .click();
    await expect(restorerPage.getByRole("status")).toContainText(
      "Media restriction restored",
    );
    await expect(restorerPage.locator("body")).toContainText(
      "No active restriction",
    );
    expect(
      await database.mediaUsage.count({
        where: { mediaAssetId: promotion.mediaAssetId },
      }),
    ).toBe(1);
    await expectAxe(restorerPage);
    await restorerContext.close();
  });

  test("text-only submissions have a truthful empty media state", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: reviewer.state });
    const page = await context.newPage();
    await page.goto(
      `/admin/communications/submissions/${fixture.textOnlySubmissionId}`,
    );
    await expect(
      page.getByRole("heading", { name: "Media review" }),
    ).toBeVisible();
    await expect(
      page.getByText("No images were attached to this submission."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Review image/ })).toHaveCount(
      0,
    );
    await expectAxe(page);
    await context.close();
  });
});
