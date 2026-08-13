import { expect, test } from "@playwright/test";

test("organizer can add, search, filter, and correct an event speaker", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const name = `Directory Speaker ${suffix}`;
  const corrected = `Corrected Speaker ${suffix}`;
  const email = `directory-${suffix}@example.test`;

  await page.goto("/");
  await page.getByRole("link", { name: "Speakers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Speaker directory" })).toBeVisible();

  await page.getByRole("button", { name: "Add speaker" }).click();
  const form = page.getByRole("form", { name: "Add speaker" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Title at this event").fill("Invited Engineer");
  await form.getByLabel("Organization at this event").fill("Harbor Systems");
  await form.getByLabel("Biography").fill("Directory acceptance biography.");
  await form.getByRole("button", { name: "Check and add" }).click();
  await expect(page.getByText(/Speaker added to this event/i)).toBeVisible();

  await page.getByRole("searchbox", { name: "Search speakers" }).fill(email);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText(/1(?: of \d+)? speakers?/)).toBeVisible();
  await page.getByRole("combobox", { name: "Directory filter" }).click();
  await page.getByRole("option", { name: "Ready — no open work" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

  await expect(page.getByText(/Invited Engineer · Harbor Systems/)).toBeVisible();
  await page.getByRole("button", { name: "Edit profile" }).click();
  const edit = page.getByRole("form", { name: "Edit current profile" });
  await edit.getByLabel("Name").fill(corrected);
  await edit.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Event-time details were preserved/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: corrected })).toBeVisible();
});
