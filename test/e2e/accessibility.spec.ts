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
  test("Course Check realistic-volume review stays accessible and responsive", async ({
    page,
  }) => {
    const proposalsResponse = await page.request.get(
      `/api/events/${eventId}/proposals`,
    );
    expect(proposalsResponse.ok()).toBe(true);
    const proposals = (await proposalsResponse.json()) as {
      proposals: Array<{ id: string; programOutcome: string | null }>;
    };
    const selected = proposals.proposals.filter((proposal) => !proposal.programOutcome).slice(0, 28);
    expect(selected).toHaveLength(28);
    const blocker = selected.find((proposal) => proposal.id === "SUB-PODS0050");
    expect(blocker).toBeTruthy();
    const ordered = [blocker!, ...selected.filter((proposal) => proposal !== blocker)];
    const key = `cc23-volume-${Date.now()}`;
    const startedAt = Date.now();
    const createResponse = await page.request.post(
      `/api/events/${eventId}/course-checks/decisions`,
      {
        headers: { "idempotency-key": key },
        data: {
          items: ordered.map((proposal, index) => ({
            proposalId: proposal.id,
            outcome: index === 0 ? "accepted" : "declined",
          })),
          idempotencyKey: key,
        },
      },
    );
    expect(createResponse.status()).toBe(201);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    const created = (await createResponse.json()) as {
      id: string;
      body: {
        aggregateProgress: { total: number; active: number; deferred: number; applied: number };
        linkedPlanIds: string[];
        splitExplanation: string | null;
      };
      decisionReview: {
        title: string;
        primaryActionLabel: string;
        counts: { selected: number };
      };
      linkedPlans: Array<{
        id: string;
        body: {
          aggregateProgress: { total: number; active: number; deferred: number; applied: number };
          linkedPlanIds: string[];
          splitExplanation: string | null;
        };
        decisionReview: { counts: { selected: number } };
      }>;
    };
    expect(created.decisionReview.counts.selected).toBe(25);
    expect(created.body.aggregateProgress).toEqual({
      total: 25,
      active: 25,
      deferred: 0,
      applied: 0,
    });
    expect(created.body.splitExplanation).toContain("part 1 of 2");
    expect(created.linkedPlans).toHaveLength(1);
    expect(created.linkedPlans[0]?.decisionReview.counts.selected).toBe(3);
    expect(created.linkedPlans[0]?.body.aggregateProgress).toEqual({
      total: 3,
      active: 3,
      deferred: 0,
      applied: 0,
    });
    expect(created.linkedPlans[0]?.body.linkedPlanIds).toEqual([created.id]);
    expect(created.linkedPlans[0]?.body.splitExplanation).toContain("part 2 of 2");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/e/${eventId}/course-checks/${created.id}`);
    await expect(
      page.getByRole("heading", { name: created.decisionReview.title }),
    ).toBeVisible({ timeout: 30_000 });
    const selectedRegion = page.getByRole("region", { name: "Selected submissions" });
    await expect(selectedRegion.getByRole("row")).toHaveCount(26);
    const readyFilter = selectedRegion.getByRole("button", { name: "Ready" });
    await readyFilter.focus();
    await page.keyboard.press("Enter");
    await expect(readyFilter).toHaveAttribute("aria-pressed", "true");
    await expect(selectedRegion.getByRole("row")).toHaveCount(25);
    const allFilter = selectedRegion.getByRole("button", { name: "All" });
    await allFilter.focus();
    await page.keyboard.press("Space");
    await expect(selectedRegion.getByRole("row")).toHaveCount(26);
    const acknowledgement = page.getByRole("button", { name: "Acknowledge this note" });
    await acknowledgement.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".course-check-action-result", { hasText: /^Acknowledged:/ })).toBeFocused();
    await expectNoCriticalViolations(page, "Course Check desktop realistic volume");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Needs action" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What will happen" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: created.decisionReview.primaryActionLabel }),
    ).toBeVisible();
    const pageHasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(pageHasNoHorizontalOverflow).toBe(true);
    const denseTableIsBounded = await page.locator(".decision-table-wrap").evaluate(
      (element) => element.clientWidth <= element.scrollWidth,
    );
    expect(denseTableIsBounded).toBe(true);
    await expectNoCriticalViolations(page, "Course Check mobile realistic volume");

    const primaryAction = page.getByRole("button", {
      name: created.decisionReview.primaryActionLabel,
    });
    await primaryAction.focus();
    await page.keyboard.press("Enter");
    const persistentResult = page.getByRole("region", { name: "Decision results" });
    await expect(persistentResult).toBeVisible();
    await expect(persistentResult.getByRole("heading", { name: "Results" })).toBeFocused();
    await expect(persistentResult.getByText("24 processed")).toBeVisible();
    await expect(persistentResult.getByText("1 unchanged")).toBeVisible();
  });

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
