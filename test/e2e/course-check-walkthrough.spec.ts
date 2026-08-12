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
