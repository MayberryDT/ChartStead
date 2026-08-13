import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

test("forms list and builder share organizer shell actions", async ({ page }) => {
  await page.goto(`/e/${eventId}/forms`);
  await expect(page.locator(".shell-toolbar")).toHaveCount(1);
  await expect(page.locator(".builder-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open CFP" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Create form" })).toHaveCount(1);

  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/e\/pacific-open-data-summit-2026\/forms\/[^/]+$/);
  await expect(page.locator(".shell-toolbar")).toHaveCount(1);
  await expect(page.locator(".builder-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "All forms" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open CFP" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
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
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByLabel("Opening time (America/Los_Angeles)").fill("2030-06-01T12:00");
  await page.getByLabel("Closing time (America/Los_Angeles)").fill("2030-06-10T12:00");
  await expect(page.getByText("Opening instant: 2030-06-01T19:00:00.000Z"))
    .toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published version 1.")).toBeVisible();

  await page.goto(`/e/${eventId}/cfp?formId=${form.id}`);
  await expect(page.getByRole("heading", { name: "Submissions open soon" })).toBeVisible();
  await expect(page.getByText(/Jun 1, 2030.*12:00 PM.*PDT/)).toBeVisible();

  await page.goto(`/e/${eventId}/forms/${form.id}`);
  await page.getByRole("button", { name: "Preview & publish" }).click();
  await page.getByRole("button", { name: "Close submissions" }).click();
  await expect(page.getByText("Form closed to new submissions.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen submissions" })).toBeVisible();
  await page.getByRole("button", { name: "Reopen submissions" }).click();
  await expect(page.getByText("Form reopened for submissions.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Preview & publish" }).click();
  await expect(page.getByRole("button", { name: "Close submissions" })).toBeVisible();
  await page.goto(`/e/${eventId}/cfp?formId=${form.id}`);
  await expect(page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Submit proposal" })).toBeVisible();
  await expect(page.getByText(/Submissions close/)).not.toBeVisible();
});
