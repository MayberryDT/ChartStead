import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

test("forms list and builder share organizer shell actions", async ({ page }) => {
  await page.goto(`/e/${eventId}/forms`);
  await expect(page.locator(".shell-toolbar")).toHaveCount(1);
  await expect(page.locator(".builder-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open CFP" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Form" })).toHaveCount(1);

  await page.getByRole("button", { name: "Create Form" }).click();
  await expect(page).toHaveURL(/\/e\/pacific-open-data-summit-2026\/forms\/[^/]+$/);
  await expect(page.locator(".shell-toolbar")).toHaveCount(1);
  await expect(page.locator(".builder-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open CFP" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview & Publish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Basics" })).toBeVisible();
});

test("organizer schedules, publishes, closes, and deliberately reopens a CFP", async ({
  page,
}) => {
  const name = `Lifecycle CFP ${Date.now().toString(36)}`;
  const created = await page.request.post(`/api/events/${eventId}/forms`, {
    data: { name },
  });
  expect(created.status()).toBe(201);
  const { form } = await created.json() as { form: { id: string } };

  await page.goto(`/e/${eventId}/forms/${form.id}`);
  await expect(page.getByLabel("Opening time")).toBeVisible();
  await page.getByLabel("Opening time").fill("2030-06-01T12:00");
  await page.getByLabel("Closing time").fill("2030-06-10T12:00");
  await page.getByRole("button", { name: "Preview & Publish" }).click();
  await page.getByRole("button", { name: "Preview & Publish" }).click();
  await expect(page.getByText("Published version 1.")).toBeVisible();

  await page.goto(`/e/${eventId}/cfp?formId=${form.id}`);
  await expect(page.getByRole("heading", { name: "Submissions open soon" })).toBeVisible();
  await expect(page.getByText(/Jun 1, 2030.*12:00 PM.*PDT/)).toBeVisible();

  await page.goto(`/e/${eventId}/forms/${form.id}`);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Form closed to new submissions.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("Form reopened for submissions.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await page.goto(`/e/${eventId}/cfp?formId=${form.id}`);
  await expect(page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Submit proposal" })).toBeVisible();
  await expect(page.getByText(/Submissions close/)).not.toBeVisible();
});
