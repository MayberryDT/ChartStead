import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";

test("public CFP submit reaches organizer submissions and survives reload", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const title = `Harbor charts acceptance ${suffix}`;
  const speaker = `Speaker ${suffix}`;

  await page.goto(`/e/${eventId}/cfp`);
  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible();

  await page.getByLabel("Talk title").fill(title);
  await page
    .getByLabel("Abstract")
    .fill("An acceptance-test abstract about open harbor charts.");
  await page.getByLabel("Track").selectOption("platform");
  await page.getByLabel("Speaker name").fill(speaker);
  await page.getByLabel("Speaker email").fill(`${suffix}@example.com`);
  await page.getByLabel("Biography").fill("Speaker biography for acceptance.");
  await page
    .getByLabel("Supporting link")
    .fill("https://example.com/harbor-charts");
  await page.getByRole("button", { name: "Submit proposal" }).click();

  await expect(
    page.getByRole("heading", { name: "Thanks — your proposal is in." }),
  ).toBeVisible();
  const proposalId = (await page.locator(".confirm-meta code").innerText()).trim();
  expect(proposalId).toMatch(/^SUB-[A-Z0-9]+$/);
  await expect(page.getByText(title)).toBeVisible();
  expect(page.url()).toContain(`/e/${eventId}/proposals/${proposalId}`);

  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".inspector-kicker")).toHaveText(proposalId);
  await expect(page.getByText(speaker).first()).toBeVisible();

  await page.reload();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".inspector-kicker")).toHaveText(proposalId);
});
