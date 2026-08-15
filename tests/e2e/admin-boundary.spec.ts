import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("@smoke unauthenticated administration requests end at the sign-in boundary", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/sign-in\?next=%2Fadmin$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin sign in" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
