import { expect, test } from "@playwright/test";

import type { CourseCheckValidationScenario } from "../../shared/course-check-validation";

const eventId = "pacific-open-data-summit-2026";

test("seeded Course Check validation pack exposes and records all six privacy-safe tasks", async ({
  page,
}) => {
  const scenarioResponse = await page.request.get(
    `/api/events/${eventId}/course-checks/ux-validation-scenarios`,
  );
  expect(scenarioResponse.ok()).toBe(true);
  const pack = (await scenarioResponse.json()) as {
    evidenceClass: string;
    scenarios: CourseCheckValidationScenario[];
  };
  expect(pack.evidenceClass).toBe(
    "seeded_automated_behavior_not_human_usability",
  );
  expect(pack.scenarios.map((scenario) => scenario.id)).toEqual([
    "clean-20",
    "missing-contact",
    "recipient-ambiguity",
    "mixed-eligible-skipped",
    "stale-recheck",
    "outcome-comprehension",
  ]);

  for (const scenario of pack.scenarios) {
    await test.step(scenario.label, async () => {
      const planId = `validation-${scenario.id}`;
      const journeyId = `browser-${scenario.id}`;
      const issues = scenario.fixture.issueClasses.length;
      if (issues > 0) {
        const issueResponse = await page.request.post(
          `/api/events/${eventId}/course-checks/ux-events`,
          {
            headers: { "idempotency-key": `${journeyId}:issues` },
            data: {
              id: `${journeyId}:issues`,
              journeyId,
              planId,
              eventType: "issues_shown",
              actionType:
                scenario.id === "recipient-ambiguity" ? "communication" : "decision",
              stage: scenario.id === "recipient-ambiguity" ? "draft" : "decision",
              issueClass: scenario.fixture.issueClasses[0],
              issueAction: null,
              issueCount: issues,
              affectedCount: issues,
              routeChanges: 0,
              durationMs: null,
              outcome: "shown",
            },
          },
        );
        expect([200, 202]).toContain(issueResponse.status());
      }
      const outcomeResponse = await page.request.post(
        `/api/events/${eventId}/course-checks/ux-events`,
        {
          headers: { "idempotency-key": `${journeyId}:outcome` },
          data: {
            id: `${journeyId}:outcome`,
            journeyId,
            planId,
            eventType:
              scenario.id === "stale-recheck" ? "stale_recheck" : "stage_outcome",
            actionType:
              scenario.id === "recipient-ambiguity" ? "communication" : "decision",
            stage: scenario.id === "recipient-ambiguity" ? "draft" : "decision",
            issueClass: null,
            issueAction: null,
            issueCount: issues,
            affectedCount: scenario.expectedTruth.decisionsChanged,
            routeChanges: 0,
            durationMs: scenario.id === "clean-20" ? 25_000 : null,
            outcome: scenario.id === "stale-recheck" ? "rechecked" : "succeeded",
          },
        },
      );
      expect([200, 202]).toContain(outcomeResponse.status());
      expect(scenario.expectedTruth.externalMessagesSent).toBe(0);
      expect(scenario.evidenceClass).toBe(
        "seeded_automated_behavior_not_human_usability",
      );
    });
  }

  const evidenceResponse = await page.request.get(
    `/api/events/${eventId}/course-checks/ux-evidence`,
  );
  expect(evidenceResponse.ok()).toBe(true);
  const evidence = (await evidenceResponse.json()) as {
    evidenceClass: string;
    uniqueJourneyCount: number;
    records: Array<Record<string, unknown>>;
  };
  expect(evidence.evidenceClass).toBe(
    "seeded_or_product_behavior_not_human_usability",
  );
  expect(evidence.uniqueJourneyCount).toBeGreaterThanOrEqual(6);
  for (const record of evidence.records) {
    expect(record).not.toHaveProperty("email");
    expect(record).not.toHaveProperty("messageBody");
    expect(record).not.toHaveProperty("speakerName");
  }

  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("navigation", { name: "Organizer" })).toBeVisible();
  await expect(page.getByText("Demo Administrator")).toBeVisible();
});
