import { expect, test } from "@playwright/test";

test("demo administrator signs in, selects a persisted event, and keeps shell chrome", async ({
  page,
}) => {
  await page.goto("/");

  // Isolated demo entrypoint authenticates as demo-admin without Google/magic-link.
  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Organizer" })).toBeVisible();
  await expect(page.getByText("Demo Administrator")).toBeVisible();
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.locator(".sidebar .brand-name")).toHaveText("ChartStead");
  // Seed starts at 47; later e2e may add real proposals without reseeding.
  await expect(page.getByLabel(/submissions$/)).toBeVisible();
  await expect(page.getByLabel("4 tracks")).toBeVisible();
  await expect(page.getByLabel("3 rooms")).toBeVisible();

  const events = await page.request.get("/api/events");
  expect(events.ok()).toBe(true);
  const payload = await events.json();
  expect(payload.principal).toMatchObject({
    id: "demo-admin",
    role: "admin",
  });
  expect(payload.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "pacific-open-data-summit-2026" }),
      expect.objectContaining({ id: "ai-engineer-worlds-fair-2026" }),
    ]),
  );

  await page.getByRole("combobox", { name: "Event" }).selectOption(
    "ai-engineer-worlds-fair-2026",
  );
  await expect(
    page.getByRole("heading", { name: "AI Engineer World's Fair 2026" }),
  ).toBeVisible();
  await expect(page.getByLabel(/submissions$/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "AI Engineer World's Fair 2026" }),
  ).toBeVisible();

  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ status: "ok" });
});
