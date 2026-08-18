import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { testAuthSecret } from "../../playwright.config";

type Fixture =
  "campaign-contributor" | "campaign-reviewer" | "campaign-approver" | "denied";
type Persona = { state: Awaited<ReturnType<BrowserContext["storageState"]>> };

async function establishFixture(page: Page, fixture: Fixture) {
  const response = await page.request.post("/api/test-auth/session", {
    headers: { "x-test-auth-secret": testAuthSecret },
    data: { fixture },
  });
  expect(response.status()).toBe(200);
}

async function persona(browser: Browser, fixture: Fixture): Promise<Persona> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await establishFixture(page, fixture);
  const state = await context.storageState();
  await context.close();
  return { state };
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

async function captureBreakpoints(page: Page, name: string) {
  for (const [label, width, height] of [
    ["375", 375, 812],
    ["768", 768, 1024],
    ["1440", 1440, 1100],
    ["1920", 1920, 1200],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `output/playwright/c2-${name}-${label}.png`,
      fullPage: true,
    });
    await expectNoOverflow(page);
  }
}

test.describe("Campaigns C2 admin and public experience", () => {
  test("completes admin workflow, outbound handoffs, successor, and public presentation", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const contributor = await persona(browser, "campaign-contributor");
    const reviewer = await persona(browser, "campaign-reviewer");
    const approver = await persona(browser, "campaign-approver");
    const contributorContext = await browser.newContext({
      storageState: contributor.state,
    });
    const contributorPage = await contributorContext.newPage();
    await contributorPage.goto("/admin/campaigns/new");
    await expect(
      contributorPage.getByRole("heading", { name: "Create a Campaign" }),
    ).toBeVisible();
    await expectAxe(contributorPage);
    await contributorPage.getByLabel("Campaign title").fill("Community Build");
    await contributorPage
      .getByLabel("Summary")
      .fill("A shared effort to make safe homes and welcoming neighborhoods.");
    await contributorPage
      .getByLabel("Public Campaign body")
      .fill("This campaign brings community support around a shared purpose.");
    await contributorPage
      .getByLabel("Goal statement")
      .fill("Support the next phase of community work.");
    await contributorPage.getByLabel("Goal amount in dollars").fill("25000.00");
    await contributorPage
      .getByLabel("Progress amount in dollars")
      .fill("30000.00");
    await contributorPage.getByLabel("Fact label").fill("Projects");
    await contributorPage.getByLabel("Fact value").fill("2");
    await contributorPage.getByRole("button", { name: "Add fact" }).click();
    await contributorPage.getByLabel("Action type").selectOption("DONATE");
    await contributorPage
      .getByLabel("Action label")
      .fill("Give through DonorView");
    await contributorPage
      .getByLabel("Action HTTPS destination")
      .fill("https://giving.example.org/community-build");
    await contributorPage.getByRole("button", { name: "Add action" }).click();
    await contributorPage
      .getByRole("button", { name: "Create Campaign draft" })
      .click();
    await expect(contributorPage).toHaveURL(/\/admin\/campaigns\/[0-9a-f-]+$/);
    const campaignUrl = new URL(contributorPage.url());
    await expect(
      contributorPage.getByRole("heading", { name: "Community Build" }),
    ).toBeVisible();
    await contributorPage
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(contributorPage.getByText("IN REVIEW")).toBeVisible();
    await contributorContext.close();

    const reviewerContext = await browser.newContext({
      storageState: reviewer.state,
    });
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(campaignUrl.pathname);
    await expect(
      reviewerPage.getByRole("button", { name: "Send for approval" }),
    ).toBeVisible();
    await reviewerPage
      .getByRole("button", { name: "Send for approval" })
      .click();
    await expect(reviewerPage.getByText("PENDING APPROVAL")).toBeVisible();
    await reviewerContext.close();

    const approverContext = await browser.newContext({
      storageState: approver.state,
    });
    const approverPage = await approverContext.newPage();
    await approverPage.goto(campaignUrl.pathname);
    await approverPage
      .getByRole("button", { name: "Approve exact revision" })
      .click();
    await expect(
      approverPage.getByText("APPROVED", { exact: true }),
    ).toBeVisible();
    await approverPage
      .getByLabel("Canonical public URL slug")
      .fill("community-build");
    await approverPage
      .getByRole("button", { name: "Release public snapshot" })
      .click();
    await expect(
      approverPage.getByText("PUBLISHED", { exact: true }),
    ).toBeVisible();
    await approverContext.close();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const consoleErrors: string[] = [];
    publicPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    publicPage.on("pageerror", (error) => consoleErrors.push(error.message));
    await publicPage.goto("/campaigns");
    await expect(
      publicPage.getByRole("heading", { name: "Campaigns", exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("link", { name: "Community Build" }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("heading", { name: "Current Campaigns" }),
    ).toBeVisible();
    await expectAxe(publicPage);
    await publicPage.goto("/campaigns/community-build");
    await expect(
      publicPage.getByRole("heading", { name: "Community Build" }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("$30,000.00 of $25,000.00 goal", { exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("link", { name: /Give through DonorView/ }),
    ).toHaveAttribute("href", "https://giving.example.org/community-build");
    await expect(publicPage.locator("body")).not.toContainText(
      "Editorial workflow",
    );
    await expect(publicPage.locator("body")).not.toContainText("contentHash");
    await expectAxe(publicPage);
    await captureBreakpoints(publicPage, "campaign-detail");
    expect(consoleErrors).toEqual([]);
    await publicContext.close();

    const successorContext = await browser.newContext({
      storageState: contributor.state,
    });
    const successorPage = await successorContext.newPage();
    await successorPage.goto(campaignUrl.pathname);
    await successorPage
      .getByLabel("Campaign title")
      .fill("Community Build Completed");
    await successorPage.getByLabel("Campaign status").selectOption("COMPLETED");
    await successorPage
      .getByRole("button", { name: "Save new Campaign revision" })
      .click();
    await expect(
      successorPage.getByText("DRAFT", { exact: true }),
    ).toBeVisible();
    await successorPage
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(
      successorPage.getByText("IN REVIEW", { exact: true }),
    ).toBeVisible();
    await successorContext.close();
    const successorPublicContext = await browser.newContext();
    const successorPublicPage = await successorPublicContext.newPage();
    await successorPublicPage.goto("/campaigns/community-build");
    await expect(
      successorPublicPage.getByRole("heading", { name: "Community Build" }),
    ).toBeVisible();
    expect(
      (
        await successorPublicPage.request.get(
          "/campaigns/community-build-completed",
        )
      ).status(),
    ).toBe(404);
    await successorPublicContext.close();
  });

  test("denies Campaign administration without a Campaign capability", async ({
    browser,
  }) => {
    const denied = await persona(browser, "denied");
    const context = await browser.newContext({ storageState: denied.state });
    const page = await context.newPage();
    await page.goto("/admin/campaigns");
    await expect(page).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await expectAxe(page);
    await context.close();
  });
});
