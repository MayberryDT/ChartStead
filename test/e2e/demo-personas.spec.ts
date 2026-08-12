import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

test("evaluator entry switches among organizer, scoped reviewer, and signed-link speaker", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Choose an evaluator journey" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Track reviewer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accepted speaker" })).toBeVisible();

  await page.getByRole("button", { name: "Enter as organizer" }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${eventId}/submissions`));
  const organizer = await page.request.get("/api/events");
  expect(organizer.ok()).toBe(true);
  expect((await organizer.json()).principal).toMatchObject({
    id: "demo-admin",
    role: "admin",
  });

  await page.goto("/demo");
  await page.getByRole("button", { name: "Enter as track reviewer" }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${eventId}/submissions\\?track=platform`));
  const reviewer = await page.request.get("/api/events");
  expect(reviewer.ok()).toBe(true);
  expect((await reviewer.json()).principal).toMatchObject({
    id: "demo-track-reviewer",
    role: "reviewer",
    trackIdsByEvent: { [eventId]: ["platform"] },
  });
  const queue = await page.request.get(`/api/events/${eventId}/proposals`);
  const proposals = (await queue.json()).proposals as Array<{ trackId: string }>;
  expect(proposals.length).toBeGreaterThan(0);
  expect(new Set(proposals.map((proposal) => proposal.trackId))).toEqual(
    new Set(["platform"]),
  );

  const detailPath = `/api/events/${eventId}/organizer/proposals/SUB-PODS0001`;
  const detail = await (await page.request.get(detailPath)).json();
  const saved = await page.request.patch(`${detailPath}/review`, {
    data: {
      status: "maybe",
      committeeNote: "Keep in the platform-track comparison set.",
      expectedVersion: detail.proposal.reviewVersion,
    },
  });
  expect(saved.ok()).toBe(true);
  expect((await (await page.request.get(detailPath)).json()).proposal).toMatchObject({
    status: "maybe",
    committeeNote: "Keep in the platform-track comparison set.",
  });

  await page.goto("/demo");
  await page.getByRole("button", { name: "Enter as accepted speaker" }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${eventId}/portal/`));
  await expect(page.getByRole("heading", { name: "Pacific Open Data Summit 2026" })).toBeVisible();
  await expect(page.getByText(/Welcome, Maya Chen/)).toBeVisible();
  await expect(
    page.getByLabel("Portal summary").getByText("Building trustworthy public-data platforms"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();

  const unauthorized = await page.request.get("/api/events");
  expect(unauthorized.status()).toBe(401);

  await page.goto("/demo");
  await page.getByRole("button", { name: "Reset evaluator data" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Reviewer and speaker demo data restored.",
  );
});
