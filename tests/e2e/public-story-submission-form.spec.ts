import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const execFileAsync = promisify(execFile);
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const enabledForRun = process.env.PUBLIC_STORY_SUBMISSIONS_ENABLED === "true";
const baseUrl = "http://127.0.0.1:3100";
const recoveryStorageKey = "habitat.share-your-story.recovery-token";
const fixturePrefix = "c6b4b-browser";
const browserSuiteStartedAt = new Date();

type BrowserFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

async function imageBuffer(format: "jpeg" | "png" | "webp") {
  const image = sharp({
    create: {
      width: 96,
      height: 64,
      channels: 3,
      background: { r: 122, g: 83, b: 54 },
    },
  });
  return image[format]().toBuffer();
}

async function heicBuffer() {
  const result = await execFileAsync(
    "magick",
    ["-size", "96x64", "xc:#7a5336", "HEIC:-"],
    { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 },
  );
  return result.stdout;
}

async function file(
  name: string,
  mimeType: BrowserFile["mimeType"],
  format: "jpeg" | "png" | "webp",
): Promise<BrowserFile> {
  return { name, mimeType, buffer: await imageBuffer(format) };
}

async function diagnostics(page: Page) {
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.startsWith("http") &&
      !url.startsWith(baseUrl) &&
      !url.startsWith("https://fonts.googleapis.com") &&
      !url.startsWith("https://fonts.gstatic.com")
    ) {
      unexpectedRequests.push(url);
    }
    expect(url).not.toMatch(/recoveryToken|uploadAuthorization|sha256|hash=/i);
  });
  return { errors, unexpectedRequests };
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

async function openSharePage(page: Page) {
  const response = await page.goto("/share-your-story");
  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).not.toContain("unsafe-eval");
  await expect(
    page.getByRole("heading", { name: "Share Your Story", level: 1 }),
  ).toBeVisible();
  return response;
}

async function waitForEnabledForm(page: Page) {
  await expect(page.locator("#storyImages")).toBeEnabled({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Your story", level: 2 }),
  ).toBeVisible();
}

async function fillSubmission(
  page: Page,
  email: string,
  options: { publicationInterest?: boolean } = {},
) {
  await page.getByLabel("Name", { exact: true }).fill("C6B4B Browser Example");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Your relationship to Habitat", { exact: true })
    .fill("Community volunteer");
  await page
    .getByLabel("Suggested title", { exact: false })
    .fill("A browser story");
  await page
    .locator("#storyText")
    .fill(
      "This synthetic browser story is long enough to exercise the private intake path without using personal content.",
    );
  if (options.publicationInterest) {
    await page.getByLabel(/open to discussing publication/i).check();
  }
  for (const id of [
    "contactConsent",
    "editorialReviewAcknowledged",
    "sensitiveDataWarningAcknowledged",
    "privacyNoticeAcknowledged",
  ]) {
    await page.locator(`#${id}`).check();
  }
}

async function waitForReady(page: Page, count: number) {
  await expect(page.locator("legend").filter({ hasText: /Ready/ })).toHaveCount(
    count,
    { timeout: 30_000 },
  );
}

async function selectFiles(page: Page, files: BrowserFile[]) {
  await page.locator("#storyImages").setInputFiles(files);
}

async function activeAttemptId(page: Page) {
  const token = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    recoveryStorageKey,
  );
  expect(token).toBeTruthy();
  const response = await page.request.post(
    "/api/public-story-submission/media/attempt",
    {
      headers: {
        Origin: baseUrl,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "same-origin",
      },
      multipart: { recoveryToken: token! },
    },
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { attempt: { attemptId: string } };
  return body.attempt.attemptId;
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({
    session: Object.fromEntries(Object.entries(sessionStorage)),
    local: Object.fromEntries(Object.entries(localStorage)),
    indexedDb: indexedDB.databases
      ? indexedDB.databases().then((items) => items.map((item) => item.name))
      : Promise.resolve([]),
  }));
}

test.describe("C6B-4B public Share Your Story browser validation", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.afterAll(async () => {
    await database.publicStorySubmission.deleteMany({
      where: { submitterEmail: { startsWith: fixturePrefix } },
    });
    await database.publicStorySubmissionAttempt.deleteMany({
      where: { createdAt: { gte: browserSuiteStartedAt } },
    });
    await database.publicStoryIntakeRateLimitBucket.deleteMany({
      where: { createdAt: { gte: browserSuiteStartedAt } },
    });
    await database.$disconnect();
  });

  test("validates the disabled-by-default route, privacy boundary, CSP, and responsive shell", async ({
    page,
  }) => {
    test.skip(enabledForRun, "This assertion runs in the disabled build.");
    const browserDiagnostics = await diagnostics(page);
    await openSharePage(page);
    await expect(
      page.getByRole("heading", {
        name: "Share Your Story is not accepting submissions right now.",
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.locator("#storyImages")).toHaveCount(0);
    await expect(
      page.getByText(/confidential administrative inbox/i),
    ).toHaveCount(0);
    await expectAxe(page);
    await captureResponsive(page, "disabled");
    expect(browserDiagnostics.errors).toEqual([]);
    expect(browserDiagnostics.unexpectedRequests).toEqual([]);
  });

  test("renders enabled form and reuses one active recovery attempt", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    const browserDiagnostics = await diagnostics(page);
    await openSharePage(page);
    await waitForEnabledForm(page);
    const before = await database.publicStorySubmissionAttempt.count({
      where: { status: "ACTIVE" },
    });
    const firstAttempt = await activeAttemptId(page);
    await page.reload();
    await waitForEnabledForm(page);
    const secondAttempt = await activeAttemptId(page);
    const after = await database.publicStorySubmissionAttempt.count({
      where: { status: "ACTIVE" },
    });
    expect(secondAttempt).toBe(firstAttempt);
    expect(after).toBe(before);
    await expect(
      page.getByText(/current privacy notice/i).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /privacy/i })).toHaveCount(0);
    await expectAxe(page);
    await captureResponsive(page, "enabled-empty");
    expect(browserDiagnostics.errors).toEqual([]);
    expect(browserDiagnostics.unexpectedRequests).toEqual([]);
  });

  test("supports required acknowledgments, optional publication interest, and text-only submission", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    const browserDiagnostics = await diagnostics(page);
    await openSharePage(page);
    await waitForEnabledForm(page);
    const email = `${fixturePrefix}-text-${Date.now()}@example.org`;
    const storyCountBefore = await database.story.count();
    const publicationCountBefore = await database.publication.count();
    const mediaAssetCountBefore = await database.mediaAsset.count();
    await fillSubmission(page, email, { publicationInterest: true });
    await expect(page.getByLabel(/not publication consent/i)).toBeVisible();
    await expect(page.getByLabel("Add images", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send my story" }),
    ).toBeEnabled();
    await page.waitForTimeout(1_100);
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(
      page.getByText("Your story has been received for confidential review."),
    ).toBeVisible({ timeout: 30_000 });
    const submission = await database.publicStorySubmission.findFirstOrThrow({
      where: { submitterEmail: email },
      include: { submissionMedia: true },
    });
    expect(submission.contactConsent).toBe(true);
    expect(submission.editorialReviewAcknowledged).toBe(true);
    expect(submission.sensitiveDataWarningAcknowledged).toBe(true);
    expect(submission.privacyNoticeVersion).toBe("public-story-v1");
    expect(submission.publicationInterest).toBe(true);
    expect(submission.rightsDeclarationAccepted).toBeNull();
    expect(submission.submitterLikenessConsentAccepted).toBeNull();
    expect(submission.submissionMedia).toHaveLength(0);
    expect(await database.story.count()).toBe(storyCountBefore);
    expect(await database.publication.count()).toBe(publicationCountBefore);
    expect(await database.mediaAsset.count()).toBe(mediaAssetCountBefore);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Share Your Story", level: 1 }),
    ).toBeVisible();
    expect(
      await database.publicStorySubmission.count({
        where: { submitterEmail: email },
      }),
    ).toBe(1);
    await expectAxe(page);
    expect(browserDiagnostics.errors).toEqual([]);
    expect(browserDiagnostics.unexpectedRequests).toEqual([]);
  });

  test("keeps validation field-associated, focused, and generic", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    await fillSubmission(
      page,
      `${fixturePrefix}-validation-${Date.now()}@example.org`,
    );
    await page
      .locator("#storyText")
      .evaluate((element) => element.removeAttribute("minlength"));
    await page.locator("#storyText").fill("Too short");
    await page.getByRole("button", { name: "Send my story" }).click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "couldn’t receive" });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link")).toHaveAttribute(
      "href",
      "#storyText",
    );
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      /@example\.org$/,
    );
    await expect(page).not.toHaveTitle(/Too short|C6B4B/);
    await expectAxe(page);
  });

  test("rejects honeypot submissions with safe feedback", async ({ page }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    const email = `${fixturePrefix}-honeypot-${Date.now()}@example.org`;
    await fillSubmission(page, email);
    await page.locator('input[name="honeypot"]').fill("bot");
    await page.getByRole("button", { name: "Send my story" }).click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "couldn’t receive" });
    await expect(summary).toBeFocused();
    await expect(summary).not.toContainText(
      /token|hash|secret|stack|prisma|sharp/i,
    );
    expect(
      await database.publicStorySubmission.count({
        where: { submitterEmail: email },
      }),
    ).toBe(0);
    await expectAxe(page);
  });

  test("uploads JPEG, PNG, WebP, and HEIC through the real browser pipeline", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    const browserDiagnostics = await diagnostics(page);
    await openSharePage(page);
    await waitForEnabledForm(page);
    const processing = page.waitForResponse(
      async (response) =>
        response.url().includes("/api/public-story-submission/media/process") &&
        response.request().method() === "POST",
    );
    await page.route(
      "**/api/public-story-submission/media/process",
      async (route) => {
        const response = await route.fetch();
        await page.waitForTimeout(750);
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    const processingUi = expect(
      page.getByText(/Image 1: Processing/),
    ).toBeVisible({ timeout: 30_000 });
    await selectFiles(page, [
      await file("browser-jpeg.jpg", "image/jpeg", "jpeg"),
      await file("browser-png.png", "image/png", "png"),
      await file("browser-webp.webp", "image/webp", "webp"),
      {
        name: "browser-heic.heic",
        mimeType: "image/heic",
        buffer: await heicBuffer(),
      },
    ]);
    await processing;
    await processingUi;
    await waitForReady(page, 4);
    await expect(page.getByText(/Suggested lead/)).toBeVisible();
    await expect(
      page.locator("legend").filter({ hasText: /Ready/ }),
    ).toHaveCount(4);
    await expectAxe(page);
    await captureResponsive(page, "ready-multi");
    expect(browserDiagnostics.errors).toEqual([]);
    expect(browserDiagnostics.unexpectedRequests).toEqual([]);
  });

  test("shows safe rejection and partial-failure states without losing valid images", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    await selectFiles(page, [
      await file("partial-valid.jpg", "image/jpeg", "jpeg"),
      {
        name: "partial-corrupt.png",
        mimeType: "image/png",
        buffer: Buffer.from("not-an-image"),
      },
    ]);
    await waitForReady(page, 1);
    await expect(
      page.locator("legend").filter({ hasText: /Rejected/ }),
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(
      page.getByRole("alert").filter({
        hasText: /file type|couldn’t read|process/i,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Send my story" }),
    ).toBeDisabled();
    await expect(
      page.getByText(/Sharp|libheif|WASM|stack|storage/i),
    ).toHaveCount(0);
    await expectAxe(page);
    await captureResponsive(page, "rejected-partial");
  });

  test("validates file limits, unsupported and mismatched formats, and duplicate feedback", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    await selectFiles(page, [
      {
        name: "unsupported.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("text"),
      },
    ]);
    await expect(
      page.getByRole("alert").filter({ hasText: "file type isn’t supported" }),
    ).toBeVisible();
    await selectFiles(page, [
      {
        name: "mismatch.jpg",
        mimeType: "image/jpeg",
        buffer: await imageBuffer("png"),
      },
    ]);
    await expect(
      page.getByRole("alert").filter({
        hasText: /match its image type|read this image/i,
      }),
    ).toBeVisible({ timeout: 30_000 });
    const jpeg = await file("duplicate.jpg", "image/jpeg", "jpeg");
    await selectFiles(page, [jpeg]);
    await waitForReady(page, 1);
    await selectFiles(page, [jpeg]);
    await expect(
      page.getByRole("alert").filter({ hasText: "already been added" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator("legend").filter({ hasText: /Ready/ }),
    ).toHaveCount(1);
    await selectFiles(page, [
      {
        name: "oversized.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1),
      },
    ]);
    await expect(
      page.getByRole("alert").filter({ hasText: "larger than 10 MB" }),
    ).toBeVisible({ timeout: 30_000 });
    await expectAxe(page);
  });

  test("persists metadata, independent sensitivity declarations, order, removal, and recovery", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    await selectFiles(page, [
      await file("metadata-a.jpg", "image/jpeg", "jpeg"),
      await file("metadata-b.png", "image/png", "png"),
    ]);
    await waitForReady(page, 2);
    const descriptions = page.getByLabel("Private description");
    const credits = page.getByLabel(/Suggested photo credit/);
    await descriptions.nth(0).fill("A private browser description");
    await descriptions.nth(0).blur();
    await expect
      .poll(
        async () =>
          (
            await database.publicStorySubmissionMedia.findFirst({
              where: { originalFilename: "metadata-a.jpg" },
              orderBy: { createdAt: "desc" },
            })
          )?.description,
      )
      .toBe("A private browser description");
    await credits.nth(0).fill("C6B4B browser credit");
    await credits.nth(0).blur();
    await expect
      .poll(
        async () =>
          (
            await database.publicStorySubmissionMedia.findFirst({
              where: { originalFilename: "metadata-a.jpg" },
              orderBy: { createdAt: "desc" },
            })
          )?.suggestedPhotoCredit,
      )
      .toBe("C6B4B browser credit");
    const firstImage = page.getByRole("group", { name: /Image 1:/ });
    for (const [label, field] of [
      ["This image involves a minor.", "involvesMinor"],
      [
        "This image involves a homeowner or applicant.",
        "involvesHomeownerOrApplicant",
      ],
      [
        "This image includes another identifiable person.",
        "involvesOtherIdentifiablePerson",
      ],
      ["This image depicts a private residence.", "depictsPrivateResidence"],
      [
        "This image includes sensitive personal circumstances.",
        "containsSensitivePersonalCircumstances",
      ],
    ] as const) {
      await firstImage.getByLabel(label).check();
      await expect
        .poll(
          async () =>
            (
              await database.publicStorySubmissionMedia.findFirst({
                where: { originalFilename: "metadata-a.jpg" },
                orderBy: { createdAt: "desc" },
              })
            )?.[field],
        )
        .toBe(true);
    }
    await page.getByRole("button", { name: "Move later" }).first().click();
    await expect(page.getByText(/Suggested lead/)).toHaveCount(1);
    await expect(page.getByLabel("Private description").nth(1)).toHaveValue(
      "A private browser description",
    );
    await page.reload();
    await waitForEnabledForm(page);
    await waitForReady(page, 2);
    await expect(page.getByLabel("Private description").nth(1)).toHaveValue(
      "A private browser description",
    );
    await expect(page.getByLabel(/Suggested photo credit/).nth(1)).toHaveValue(
      "C6B4B browser credit",
    );
    await expect(page.getByText(/Suggested lead/)).toHaveCount(1);
    const mediaBeforeRemove =
      await database.publicStorySubmissionMedia.findMany({
        where: {
          originalFilename: { in: ["metadata-a.jpg", "metadata-b.png"] },
        },
        orderBy: { ordinal: "asc" },
      });
    expect(mediaBeforeRemove).toHaveLength(2);
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(
      page.locator("legend").filter({ hasText: /Ready/ }),
    ).toHaveCount(1);
    await page.reload();
    await waitForEnabledForm(page);
    await waitForReady(page, 1);
    const removed = await database.publicStorySubmissionMedia.findFirstOrThrow({
      where: { originalFilename: "metadata-b.png" },
      orderBy: { createdAt: "desc" },
    });
    expect(removed.technicalStatus).toBe("REMOVED");
    await expectAxe(page);
  });

  test("keeps image rights as a final gate, permits optional likeness consent, and submits one private image", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    const email = `${fixturePrefix}-image-${Date.now()}@example.org`;
    await openSharePage(page);
    await waitForEnabledForm(page);
    await fillSubmission(page, email);
    await selectFiles(page, [
      await file("final-image.webp", "image/webp", "webp"),
    ]);
    await waitForReady(page, 1);
    await expect(
      page.getByRole("button", { name: "Send my story" }),
    ).toBeDisabled();
    await page.getByLabel(/right to submit these images/i).check();
    await page
      .getByLabel(/permission for Habitat to discuss my likeness/i)
      .check();
    await expect(
      page.getByRole("button", { name: "Send my story" }),
    ).toBeEnabled();
    await page.waitForTimeout(1_100);
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(
      page.getByText("Your story has been received for confidential review."),
    ).toBeVisible({ timeout: 30_000 });
    const submission = await database.publicStorySubmission.findFirstOrThrow({
      where: { submitterEmail: email },
      include: { submissionMedia: true },
    });
    expect(submission.rightsDeclarationAccepted).toBe(true);
    expect(submission.submitterLikenessConsentAccepted).toBe(true);
    expect(submission.submissionMedia).toHaveLength(1);
    expect(submission.submissionMedia[0]?.technicalStatus).toBe("READY");
    expect(await database.story.count()).toBeGreaterThanOrEqual(0);
    expect(
      await database.mediaAsset.count({
        where: { createdAt: { gte: submission.createdAt } },
      }),
    ).toBe(0);
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(
      page.getByText("Your story has been received for confidential review."),
    ).toBeVisible();
    expect(
      await database.publicStorySubmission.count({
        where: { submitterEmail: email },
      }),
    ).toBe(1);
    await expectAxe(page);
  });

  test("recovers only opaque media state and safely expires an old attempt", async ({
    page,
  }) => {
    test.skip(!enabledForRun, "This assertion runs in the enabled build.");
    await openSharePage(page);
    await waitForEnabledForm(page);
    await page
      .locator("#storyText")
      .fill("Confidential text must never enter browser storage.");
    await selectFiles(page, [await file("recovery.jpg", "image/jpeg", "jpeg")]);
    await waitForReady(page, 1);
    const attemptId = await activeAttemptId(page);
    const rawToken = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      recoveryStorageKey,
    );
    const snapshot = await storageSnapshot(page);
    const serialized = JSON.stringify(snapshot);
    expect(Object.keys(snapshot.session)).toEqual([recoveryStorageKey]);
    expect(serialized).not.toContain("Confidential text");
    expect(serialized).not.toContain("submitterEmail");
    expect(serialized).not.toContain("uploadAuthorization");
    expect(serialized).not.toContain("originalSha256");
    await page.reload();
    await waitForEnabledForm(page);
    await expect(page.getByText(/Image 1: Ready/)).toBeVisible();
    expect(await activeAttemptId(page)).toBe(attemptId);
    const attempt =
      await database.publicStorySubmissionAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
    await database.publicStorySubmissionAttempt.update({
      where: { id: attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await page.reload();
    await waitForEnabledForm(page);
    expect(await activeAttemptId(page)).not.toBe(attemptId);
    const expiredResponse = await page.request.post(
      "/api/public-story-submission/media/issue",
      {
        headers: {
          Origin: baseUrl,
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "same-origin",
        },
        multipart: {
          recoveryToken: rawToken!,
          expectedAttemptVersion: String(attempt.version),
          declaredMimeType: "image/jpeg",
          originalFilename: "expired.jpg",
          description: "",
          suggestedPhotoCredit: "",
          involvesMinor: "false",
          involvesHomeownerOrApplicant: "false",
          involvesOtherIdentifiablePerson: "false",
          depictsPrivateResidence: "false",
          containsSensitivePersonalCircumstances: "false",
        },
      },
    );
    expect(expiredResponse.ok()).toBe(false);
    expect((await expiredResponse.text()).toLowerCase()).not.toMatch(
      /hash|stack|storage|prisma/,
    );
    await expectAxe(page);
  });
});

test.afterAll(async () => {
  await database.$disconnect();
});
