import { expect, test } from "@playwright/test";

test("Course Check Demo track is walkthrough-ready from submissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e/pacific-open-data-summit-2026/submissions");

  await expect(
    page.getByRole("heading", { name: /submissions|pacific open data/i }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // Seed fixtures are queryable via API even if the grid virtualizes rows.
  const proposals = await page.request.get(
    "/api/events/pacific-open-data-summit-2026/proposals",
  );
  expect(proposals.ok()).toBe(true);
  const body = (await proposals.json()) as {
    proposals: Array<{ id: string; title: string; trackName: string }>;
  };
  const demo = body.proposals.filter((p) => p.trackName === "Course Check Demo");
  expect(demo.length).toBe(10);
  expect(demo.some((p) => p.id === "SUB-PODS0048")).toBe(true);
  expect(demo.some((p) => /co-facilitators/i.test(p.title))).toBe(true);

  // Desktop shell chrome for organizer Course Check entry.
  await expect(page.getByRole("navigation", { name: "Organizer" })).toBeVisible();
  await expect(page.getByText("Demo Administrator")).toBeVisible();

  // Mobile recovery/status must remain legible.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Organizer" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator("body")).toBeVisible();
});

test("decision review stays truthful before and after commit", async ({ page }) => {
  const proposalsResponse = await page.request.get(
    "/api/events/pacific-open-data-summit-2026/proposals",
  );
  expect(proposalsResponse.ok()).toBe(true);
  const proposals = (await proposalsResponse.json()) as {
    proposals: Array<{ id: string; programOutcome: string | null }>;
  };
  const proposal = proposals.proposals.find((row) => !row.programOutcome);
  expect(proposal).toBeTruthy();

  const key = `cc14-browser-${Date.now()}`;
  const createResponse = await page.request.post(
    "/api/events/pacific-open-data-summit-2026/course-checks/decisions",
    {
      headers: { "idempotency-key": key },
      data: {
        items: [{ proposalId: proposal!.id, outcome: "declined" }],
        idempotencyKey: key,
      },
    },
  );
  expect(createResponse.status()).toBe(201);
  const plan = (await createResponse.json()) as { id: string };

  await page.goto(
    `/e/pacific-open-data-summit-2026/course-checks/${plan.id}`,
  );
  await expect(
    page.getByRole("heading", { name: "Review 1 decline decision" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Will decline/ })).toBeVisible();
  await expect(
    page.getByText("Nothing has changed. No external communication has been sent."),
  ).toBeVisible();
  await expect(page.getByText(/plan reference|mutation history/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Decline 1 submission" }).click();

  await expect(
    page.getByRole("heading", { name: "Decline decision applied" }),
  ).toBeVisible();
  await expect(page.getByText("1 submission was declined.")).toBeVisible();
  await expect(page.getByText("No drafts were prepared.")).toBeVisible();
  await expect(page.getByText("No emails were sent.")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/course-checks/${plan.id}$`),
  );
});

test("batch decision review reports exact scope before and after commit", async ({
  page,
}) => {
  const proposalsResponse = await page.request.get(
    "/api/events/pacific-open-data-summit-2026/proposals",
  );
  const proposals = (await proposalsResponse.json()) as {
    proposals: Array<{ id: string; programOutcome: string | null }>;
  };
  const selected = proposals.proposals.filter((row) => !row.programOutcome).slice(0, 2);
  expect(selected).toHaveLength(2);

  const key = `cc14-browser-batch-${Date.now()}`;
  const createResponse = await page.request.post(
    "/api/events/pacific-open-data-summit-2026/course-checks/decisions",
    {
      headers: { "idempotency-key": key },
      data: {
        items: selected.map((proposal) => ({
          proposalId: proposal.id,
          outcome: "declined",
        })),
        idempotencyKey: key,
      },
    },
  );
  expect(createResponse.status()).toBe(201);
  const plan = (await createResponse.json()) as { id: string };

  await page.goto(
    `/e/pacific-open-data-summit-2026/course-checks/${plan.id}`,
  );
  await expect(
    page.getByRole("heading", { name: "Review 2 decline decisions" }),
  ).toBeVisible();
  await expect(page.getByText("2 submissions will be declined.")).toBeVisible();
  await page.getByRole("button", { name: "Decline 2 submissions" }).click();

  await expect(
    page.getByRole("heading", { name: "Decline decisions applied" }),
  ).toBeVisible();
  await expect(page.getByText("2 submissions were declined.")).toBeVisible();
  await expect(page.getByText("No drafts were prepared.")).toBeVisible();
  await expect(page.getByText("No emails were sent.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/course-checks/${plan.id}$`));
});

test("clean decision fast path preserves keyboard focus, history, and batch selection", async ({
  page,
}) => {
  const proposalsResponse = await page.request.get(
    "/api/events/pacific-open-data-summit-2026/proposals",
  );
  const proposals = (await proposalsResponse.json()) as {
    proposals: Array<{ id: string; programOutcome: string | null }>;
  };
  const proposal = proposals.proposals.find((row) => !row.programOutcome);
  expect(proposal).toBeTruthy();

  const key = `cc15-browser-fast-${Date.now()}`;
  const createResponse = await page.request.post(
    "/api/events/pacific-open-data-summit-2026/course-checks/decisions",
    {
      headers: { "idempotency-key": key },
      data: {
        items: [{ proposalId: proposal!.id, outcome: "declined" }],
        idempotencyKey: key,
      },
    },
  );
  expect(createResponse.status()).toBe(201);
  const durablePlan = (await createResponse.json()) as Record<string, any>;
  const cleanPlan = {
    ...durablePlan,
    body: {
      ...durablePlan.body,
      findings: [],
      evidenceSections: [],
      followUpQueue: [],
      linkedPlanIds: [],
      parentPlanId: null,
      batchGroupId: null,
      items: durablePlan.body.items.map((item: Record<string, any>) => ({
        ...item,
        status: "active",
        findings: [],
      })),
      airtable: {
        configured: false,
        disposition: "removed",
        summary: "No mapped Airtable writes.",
        effects: [],
      },
    },
    decisionReview: {
      ...durablePlan.decisionReview,
      courseCheckSummary: "Course Check found no issues.",
      counts: {
        ...durablePlan.decisionReview.counts,
        needsAction: 0,
        warning: 0,
        skipped: 0,
      },
      issues: [],
      freshness: {
        ...durablePlan.decisionReview.freshness,
        state: "current",
      },
      effectGroups: durablePlan.decisionReview.effectGroups.filter(
        (group: { key: string }) => group.key !== "integration",
      ),
      permittedCommits: durablePlan.decisionReview.permittedCommits.filter(
        (commit: { stageId: string }) => commit.stageId === "apply-decision",
      ),
    },
  };
  await page.addInitScript(
    ({ eventId, proposalId }) => {
      sessionStorage.setItem(
        `chartstead:decision-batch:${eventId}`,
        JSON.stringify([proposalId]),
      );
    },
    {
      eventId: "pacific-open-data-summit-2026",
      proposalId: proposal!.id,
    },
  );
  await page.route(
    `**/api/events/pacific-open-data-summit-2026/course-checks/${durablePlan.id}`,
    async (route) => route.fulfill({ json: cleanPlan }),
  );
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") mutationRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/e/pacific-open-data-summit-2026/course-checks/${durablePlan.id}?q=${proposal!.id}&sort=oldest`,
  );

  const dialog = page.getByRole("dialog", { name: "Review 1 decline decision" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Review 1 decline decision" })).toBeFocused();
  await expect(dialog.getByText("Course Check found no issues.")).toHaveCount(1);
  await expect(dialog.locator("details")).toHaveCount(0);
  await expect(dialog.getByText("0 communication drafts")).toBeVisible();
  await expect(dialog.getByText("0 external effects")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Decline 1 submission" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/submissions\\?q=${proposal!.id}&sort=oldest$`),
  );
  await expect(
    page.getByRole("checkbox", {
      name: `Select ${proposal!.id} for batch decision`,
    }),
  ).toBeChecked();
  expect(mutationRequests).toEqual([]);

  await page.goBack();
  await expect(dialog).toBeVisible();
});
