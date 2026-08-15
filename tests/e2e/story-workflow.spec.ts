import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { testAuthSecret } from "../../playwright.config";

type StoryFixture =
  "platform-admin" | "story-contributor" | "story-editor" | "story-manager";

async function establishFixture(
  page: import("@playwright/test").Page,
  fixture: StoryFixture,
) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

test("@smoke Story draft workflow crosses contributor, reviewer, and approver boundaries", async ({
  browser,
}) => {
  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await establishFixture(contributor, "story-contributor");
  await contributor.goto("/admin/communications/stories/new");
  await expect(
    contributor.getByRole("heading", { name: "Create Story draft" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page: contributor }).analyze()).violations,
  ).toEqual([]);
  await contributor.getByLabel("Story title").fill("A private Story workflow");
  await contributor.getByLabel("Excerpt").fill("A concise private excerpt.");
  await contributor
    .getByLabel("Story body")
    .fill("A private structured draft body.");
  await contributor.getByRole("button", { name: "Create Story draft" }).click();
  await expect(contributor).toHaveURL(
    /\/admin\/communications\/stories\/[0-9a-f-]+$/,
  );
  const storyUrl = contributor.url();
  await contributor.getByRole("button", { name: "Submit for review" }).click();

  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  await establishFixture(reviewer, "story-editor");
  await reviewer.goto(storyUrl);
  await expect(reviewer.getByText("IN REVIEW")).toBeVisible();
  await reviewer.getByRole("button", { name: "Send for approval" }).click();

  const approverContext = await browser.newContext();
  const approver = await approverContext.newPage();
  await establishFixture(approver, "story-manager");
  await approver.goto(storyUrl);
  await expect(approver.getByText("PENDING APPROVAL")).toBeVisible();
  await approver
    .getByRole("button", { name: "Approve exact revision" })
    .click();
  await expect(approver.getByText("APPROVED", { exact: true })).toBeVisible();
  await approver
    .getByLabel("Canonical URL slug")
    .fill("a-private-story-workflow");
  await approver
    .getByRole("button", { name: "Release immutable public snapshot" })
    .click();
  await expect(approver.getByText("PUBLISHED", { exact: true })).toBeVisible();

  const publicReaderContext = await browser.newContext();
  const publicReader = await publicReaderContext.newPage();
  await publicReader.goto("/stories/a-private-story-workflow");
  await expect(
    publicReader.getByRole("heading", { name: "A private Story workflow" }),
  ).toBeVisible();
  await expect(
    publicReader.getByText("A private structured draft body."),
  ).toBeVisible();
  await expect(
    publicReader.getByRole("link", { name: "Share this Story" }),
  ).toHaveAttribute("href", /mailto:/);
  expect(
    (await new AxeBuilder({ page: publicReader }).analyze()).violations,
  ).toEqual([]);

  await contributorContext.close();
  await reviewerContext.close();
  await approverContext.close();
  await publicReaderContext.close();
});

test("@smoke an administrator without Story capabilities cannot create a Story", async ({
  page,
}) => {
  await establishFixture(page, "platform-admin");
  await page.goto("/admin/communications/stories/new");
  await expect(page).toHaveURL(/\/admin\/access-denied$/);
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
});
