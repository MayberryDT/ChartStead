import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

async function expectNoCriticalViolations(
  page: import("@playwright/test").Page,
  label: string,
) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(critical, `${label}: ${JSON.stringify(critical, null, 2)}`).toEqual([]);
}

test.describe("automated accessibility smoke", () => {
  test("public CFP", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/e/${eventId}/cfp`);
    await expect(
      page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
    ).toBeVisible({ timeout: 30_000 });
    await expectNoCriticalViolations(page, "public CFP");
  });

  test("submissions queue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/e/${eventId}/submissions`);
    await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("Search title, speaker, or ID").fill("SUB-PODS0001");
    await page.getByRole("link", { name: "SUB-PODS0001" }).click();
    await expect(page.locator(".inspector-kicker")).toHaveText("SUB-PODS0001");
    await expectNoCriticalViolations(page, "submissions + inspector");
  });

  test("agenda workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/e/${eventId}/agenda`);
    await expect(page.getByRole("heading", { name: /agenda/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    const move = page.getByRole("button", { name: /move session/i });
    if (await move.first().isVisible().catch(() => false)) {
      await move.first().click();
    }
    await expectNoCriticalViolations(page, "agenda");
  });

  test("public program and embed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Ensure a revision exists for a11y on real content.
    await page.request.post(`/api/events/${eventId}/program/publish-test`);
    await page.goto(`/e/${eventId}/program`);
    await expect(
      page.getByRole("heading", { name: /Pacific Open Data Summit 2026/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expectNoCriticalViolations(page, "public program");

    await page.goto(`/e/${eventId}/program/embed`);
    await expect(page.locator("body")).toBeVisible();
    await expectNoCriticalViolations(page, "program embed");
  });

  test("speaker portal invalid token (safe error)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/e/${eventId}/portal/not-a-valid-token`);
    await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/invalid|expired|unavailable|access/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expectNoCriticalViolations(page, "portal error");
  });
});

test.describe("mobile public and speaker surfaces", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("CFP, program, and portal error remain usable", async ({ page }) => {
    await page.goto(`/e/${eventId}/cfp`);
    await expect(
      page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Talk title")).toBeVisible();

    await page.request.post(`/api/events/${eventId}/program/publish-test`);
    await page.goto(`/e/${eventId}/program`);
    await expect(
      page.getByRole("heading", { name: /Pacific Open Data Summit 2026/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(`/e/${eventId}/portal/bad-token`);
    await expect(page.getByText(/invalid|expired|unavailable|access/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
