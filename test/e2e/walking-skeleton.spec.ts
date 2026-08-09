import { expect, test } from "@playwright/test";

test("demo administrator selects a persisted event in the organizer shell", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Organizer" })).toBeVisible();

  await page.getByRole("combobox", { name: "Event" }).selectOption(
    "ai-engineer-worlds-fair-2026",
  );
  await expect(
    page.getByRole("heading", { name: "AI Engineer World's Fair 2026" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "AI Engineer World's Fair 2026" }),
  ).toBeVisible();

  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ status: "ok" });
});
