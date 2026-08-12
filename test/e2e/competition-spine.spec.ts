import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

/**
 * Uninterrupted competition path: public CFP → queue → internal review →
 * Course Check accept (API) → agenda → public program publish (test seam) →
 * public/program surfaces. Airtable remains optional/unconfigured.
 */
test("competition spine: CFP through public program with Airtable unconfigured", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const title = `Spine walkthrough ${suffix}`;
  const speaker = `Spine Speaker ${suffix}`;

  // --- Public CFP submit ---
  await page.goto(`/e/${eventId}/cfp`);
  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Talk title").fill(title);
  await page
    .getByLabel("Abstract")
    .fill("Competition spine abstract covering open data harbor charts.");
  const track = page.getByRole("combobox", { name: "Track" });
  await track.focus();
  await track.press("ArrowDown");
  await page.getByRole("option", { name: "Platform", exact: true }).click();
  const format = page.getByRole("combobox", { name: "Session format" });
  await format.focus();
  await format.press("ArrowDown");
  await page.getByRole("option", { name: "Talk", exact: true }).click();
  await page.getByLabel("Speaker name").fill(speaker);
  await page.getByLabel("Speaker email").fill(`spine-${suffix}@example.com`);
  await page.getByLabel("Biography").fill("Speaker biography for spine walkthrough.");
  await page.getByLabel("Supporting link").fill("https://example.com/spine");
  await page.getByRole("button", { name: "Submit proposal" }).click();

  await expect(
    page.getByRole("heading", { name: "Thanks - your proposal is in." }),
  ).toBeVisible({ timeout: 30_000 });
  const proposalId = (await page.locator(".confirm-meta code").innerText()).trim();
  expect(proposalId).toMatch(/^SUB-[A-Z0-9]+$/);

  // --- Organizer queue + internal review ---
  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Committee note").fill(`Spine note ${suffix}`);
  await page.getByRole("button", { name: "Save committee note" }).click();
  await expect(page.getByText("Committee note saved.")).toBeVisible();

  const decisions = page.getByLabel("Internal decision");
  await decisions.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Internal decision changed to Approve/i)).toBeVisible();
  await expect(page.getByText(/No speaker email is sent/i)).toBeVisible();

  // --- Course Check accept via organizer API (same auth as demo UI) ---
  const createKey = `spine-accept-${suffix}`;
  const createRes = await page.request.post(
    `/api/events/${eventId}/course-checks/decisions`,
    {
      data: {
        proposalId,
        outcome: "accepted",
        idempotencyKey: createKey,
      },
      headers: {
        "content-type": "application/json",
        "idempotency-key": createKey,
      },
    },
  );
  expect(createRes.ok(), await createRes.text()).toBeTruthy();
  const plan = (await createRes.json()) as {
    id: string;
    version: number;
    digest: string;
  };

  const applyRes = await page.request.post(
    `/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      data: {
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `${createKey}-apply`,
      },
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${createKey}-apply`,
      },
    },
  );
  expect(applyRes.ok(), await applyRes.text()).toBeTruthy();

  // Sessions exist after accept; place one cleanly if unplaced.
  const agendaRes = await page.request.get(`/api/events/${eventId}/sessions`);
  expect(agendaRes.ok()).toBeTruthy();
  const agenda = (await agendaRes.json()) as {
    sessions: Array<{
      id: string;
      proposalId: string | null;
      roomId: string | null;
      startsAt: string | null;
      placementStatus: string;
    }>;
    unplacedSessions: Array<{ id: string }>;
  };
  const session = agenda.sessions.find((s) => s.proposalId === proposalId);
  expect(session, "accepted proposal should create a session").toBeTruthy();

  if (session && session.placementStatus !== "placed") {
    const place = await page.request.patch(
      `/api/events/${eventId}/sessions/${session.id}`,
      {
        data: {
          roomId: "harbor-hall",
          startsAt: "2026-09-15T10:00:00.000Z",
          endsAt: "2026-09-15T10:45:00.000Z",
        },
        headers: { "content-type": "application/json" },
      },
    );
    expect(place.ok(), await place.text()).toBeTruthy();
  }

  await page.goto(`/e/${eventId}/agenda`);
  await expect(page.getByText(/unplaced|conflict|agenda/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // --- Publish public program (valid-subset test seam) ---
  const publish = await page.request.post(
    `/api/events/${eventId}/program/publish-test`,
  );
  expect(publish.ok(), await publish.text()).toBeTruthy();

  // --- Public surfaces ---
  await page.goto(`/e/${eventId}/program`);
  await expect(
    page.getByRole("heading", { name: /Pacific Open Data Summit 2026/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/committee note/i)).toHaveCount(0);
  await expect(page.getByText(`spine-${suffix}@example.com`)).toHaveCount(0);

  await page.goto(`/e/${eventId}/program/embed`);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByText(/committee note/i)).toHaveCount(0);

  // --- Airtable remains optional ---
  const airtable = await page.request.get(
    `/api/events/${eventId}/integrations/airtable`,
  );
  expect(airtable.ok(), await airtable.text()).toBeTruthy();
  const airtableBody = (await airtable.json()) as {
    sync?: { health?: string };
  };
  expect(airtableBody.sync?.health).toMatch(
    /unconfigured|healthy|pending|delayed|failed/,
  );

  await page.goto(`/e/${eventId}/submissions`);
  await page.getByRole("navigation", { name: "Organizer" }).getByText("Settings").click();
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Airtable sync|Not connected|Airtable/i).first()).toBeVisible();
});

test("seeded volume stays responsive on submissions search", async ({ page }) => {
  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible({
    timeout: 30_000,
  });

  const listStarted = Date.now();
  const list = await page.request.get(`/api/events/${eventId}/proposals`);
  expect(list.ok()).toBeTruthy();
  const body = (await list.json()) as { proposals: unknown[] };
  expect(body.proposals.length).toBeGreaterThanOrEqual(50);
  expect(Date.now() - listStarted).toBeLessThan(3_000);

  const filterStarted = Date.now();
  await page.getByLabel("Search title, speaker, or ID").fill("SUB-PODS0048");
  await expect(
    page.getByRole("link", { name: /SUB-PODS0048|Co-facilitators|co-facilitators/i }).first(),
  ).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - filterStarted).toBeLessThan(5_000);
});
