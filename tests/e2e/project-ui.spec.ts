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
  "project-contributor" | "project-editor" | "project-manager" | "denied";
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
      path: `output/playwright/p2-${name}-${label}.png`,
      fullPage: true,
    });
    await expectNoOverflow(page);
  }
}

test.describe("Projects P2 administrative and public UI", () => {
  test("supports the protected workflow and projection-only public experience", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const contributor = await persona(browser, "project-contributor");
    const editor = await persona(browser, "project-editor");
    const manager = await persona(browser, "project-manager");

    const contributorContext = await browser.newContext({
      storageState: contributor.state,
    });
    const contributorPage = await contributorContext.newPage();
    const consoleErrors: string[] = [];
    contributorPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    contributorPage.on("pageerror", (error) =>
      consoleErrors.push(error.message),
    );
    await contributorPage.goto("/admin/projects/new");
    await expect(
      contributorPage.getByRole("heading", { name: "Create a Project" }),
    ).toBeVisible();
    await expectAxe(contributorPage);
    await contributorPage.getByLabel("Project title").fill("Cedar Grove Home");
    await contributorPage
      .getByLabel("Summary or deck")
      .fill("A safe, accessible home for a Fayette County family.");
    await contributorPage.getByLabel("Community or city").fill("Lexington");
    await contributorPage.getByLabel("County").fill("Fayette County");
    await contributorPage.getByLabel("Public area").fill("North Lexington");
    await contributorPage
      .getByLabel("Restricted Project body")
      .fill(
        "This public project update describes the work without private household details.",
      );
    await contributorPage.getByLabel("Fact label").fill("Homes");
    await contributorPage.getByLabel("Fact value").fill("1");
    await contributorPage.getByRole("button", { name: "Add fact" }).click();
    await contributorPage
      .getByRole("button", { name: "Create Project draft" })
      .click();
    await expect(contributorPage).toHaveURL(/\/admin\/projects\/[0-9a-f-]+$/);
    const projectUrl = new URL(contributorPage.url());
    await expect(
      contributorPage.getByRole("heading", { name: "Cedar Grove Home" }),
    ).toBeVisible();
    await contributorPage
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(contributorPage.getByText("IN REVIEW")).toBeVisible();
    await contributorContext.close();

    const editorContext = await browser.newContext({
      storageState: editor.state,
    });
    const editorPage = await editorContext.newPage();
    await editorPage.goto(projectUrl.pathname);
    await expect(editorPage.getByText("IN REVIEW")).toBeVisible();
    await expectAxe(editorPage);
    await editorPage.getByRole("button", { name: "Send for approval" }).click();
    await expect(editorPage.getByText("PENDING APPROVAL")).toBeVisible();
    await editorContext.close();

    const managerContext = await browser.newContext({
      storageState: manager.state,
    });
    const managerPage = await managerContext.newPage();
    await managerPage.goto(projectUrl.pathname);
    await managerPage
      .getByRole("button", { name: "Approve exact revision" })
      .click();
    await expect(
      managerPage.getByText("APPROVED", { exact: true }),
    ).toBeVisible();
    await managerPage
      .getByLabel("Canonical public URL slug")
      .fill("cedar-grove-home");
    await managerPage
      .getByRole("button", { name: "Release public snapshot" })
      .click();
    await expect(managerPage.getByText("PUBLISHED")).toBeVisible();
    await managerContext.close();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/projects");
    await expect(
      publicPage.getByRole("heading", { name: "Projects", exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("link", { name: "Cedar Grove Home" }),
    ).toBeVisible();
    await expectAxe(publicPage);
    await publicPage.goto("/projects/cedar-grove-home");
    await expect(
      publicPage.getByRole("heading", { name: "Cedar Grove Home" }),
    ).toBeVisible();
    await expect(publicPage.getByText("North Lexington")).toBeVisible();
    await expect(publicPage.locator("body")).not.toContainText(
      "Editorial workflow",
    );
    await expect(publicPage.locator("body")).not.toContainText("contentHash");
    await expectAxe(publicPage);
    await captureBreakpoints(publicPage, "cedar-grove-detail");
    expect(consoleErrors).toEqual([]);
    await publicContext.close();
  });

  test("does not grant Project administration to a denied session", async ({
    browser,
  }) => {
    const denied = await persona(browser, "denied");
    const context = await browser.newContext({ storageState: denied.state });
    const page = await context.newPage();
    await page.goto("/admin/projects");
    await expect(page).toHaveURL(/\/admin\/access-denied$/);
    await expect(
      page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await expectAxe(page);
    await context.close();
  });
});
