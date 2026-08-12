import { expect, test } from "@playwright/test";

test("administrator creates, configures, reloads, and switches an isolated event workspace", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const eventName = `Front Range Systems ${suffix}`;
  const eventId = `front-range-systems-${suffix}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("textbox", { name: "Event name" }).fill(eventName);
  await expect(page.getByRole("textbox", { name: "Event identifier" })).toHaveValue(
    eventId,
  );
  await page.getByLabel("Start date").fill("2027-05-10");
  await page.getByLabel("End date").fill("2027-05-12");
  await page.getByLabel("Timezone").selectOption("America/Denver");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByLabel("0 submissions")).toBeVisible();
  await expect(page.getByText("No tracks configured yet.")).toBeVisible();
  await expect(page.getByText("No rooms configured yet.")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("textbox", { name: "New track name" }).fill("Main stage");
  await page.getByRole("button", { name: "Add track" }).click();
  await page.getByRole("textbox", { name: "Track name main-stage" }).fill("Main program");
  await page.getByRole("textbox", { name: "New room name" }).fill("Ballroom");
  await page.getByRole("button", { name: "Add room" }).click();
  await page.getByRole("textbox", { name: "Room name ballroom" }).fill("Ballroom A");
  await page.getByRole("button", { name: "Save event configuration" }).click();
  await expect(page.getByText("Event configuration saved.")).toBeVisible();

  const createdResponse = await page.request.get("/api/events");
  expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
  const createdPayload = (await createdResponse.json()) as {
    events: Array<{
      id: string;
      name: string;
      startsOn: string;
      endsOn: string;
      timezone: string;
      tracks: Array<{ id: string; name: string }>;
      rooms: Array<{ id: string; name: string }>;
    }>;
  };
  expect(createdPayload.events.find((event) => event.id === eventId)).toMatchObject({
    name: eventName,
    startsOn: "2027-05-10",
    endsOn: "2027-05-12",
    timezone: "America/Denver",
    tracks: [{ id: "main-stage", name: "Main program" }],
    rooms: [{ id: "ballroom", name: "Ballroom A" }],
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await page.getByRole("combobox", { name: "Event" }).click();
  await page
    .getByRole("option", { name: "Pacific Open Data Summit 2026" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Event" }).click();
  await page.getByRole("option", { name: eventName }).click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();

  await page.getByRole("link", { name: /Submissions/ }).click();
  await expect(page.getByText("No submissions yet.")).toBeVisible();
  await page.getByRole("link", { name: "Speakers" }).click();
  await expect(page.getByText("No event speakers yet.")).toBeVisible();
  await expect(page.getByText("No onboarding tasks yet.")).toBeVisible();
  await page.getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByText("No sessions yet.")).toBeVisible();

  const [newProposals, seededProposals, newSessions, newSpeakers] = await Promise.all([
    page.request.get(`/api/events/${eventId}/proposals`),
    page.request.get("/api/events/pacific-open-data-summit-2026/proposals"),
    page.request.get(`/api/events/${eventId}/sessions`),
    page.request.get(`/api/events/${eventId}/onboarding`),
  ]);
  for (const response of [newProposals, seededProposals, newSessions, newSpeakers]) {
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await expect(newProposals.json()).resolves.toMatchObject({ proposals: [] });
  const seeded = (await seededProposals.json()) as { proposals: unknown[] };
  expect(seeded.proposals.length).toBeGreaterThan(0);
  await expect(newSessions.json()).resolves.toMatchObject({ sessions: [] });
  await expect(newSpeakers.json()).resolves.toMatchObject({ speakers: [] });
});
