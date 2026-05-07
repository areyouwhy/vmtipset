import { test, expect } from "@playwright/test";

test("landing page renders the headline", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /la copa\s*del mundo/i }),
  ).toBeVisible();
});
