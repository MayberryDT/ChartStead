import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const eventId = "pacific-open-data-summit-2026";
const fixturePdf = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/tiny-notes.pdf",
);

async function selectDropdownOption(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
) {
  const field = page.getByRole("combobox", { name: label });
  const dropdown = field.locator("xpath=../..");
  const selectedValue = dropdown.locator(
    ".sd-dropdown__hint-suffix span:last-child",
  );
  const clearButton = dropdown.getByRole("button", { name: "Clear" });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await field.focus();
    await field.press("ArrowDown");
    if (
      (await selectedValue.isVisible()) &&
      (await selectedValue.textContent()) === option
    ) {
      await field.press("Enter", { delay: 100 });
    } else {
      const listOption = page.getByRole("option", {
        name: option,
        exact: true,
      });
      await expect(listOption).toBeVisible();
      await listOption.click();
    }

    if (await clearButton.isVisible()) {
      return;
    }
    await field.press("Escape");
  }

  await expect(clearButton).toBeVisible();
}

test("guided CFP workshop path reaches organizer detail with full answers", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const title = `Harbor workshop charts ${suffix}`;
  const speaker = `Speaker ${suffix}`;
  const coSpeaker = `Co Speaker ${suffix}`;
  const duration = "90 minutes";
  const fileName = "tiny-notes.pdf";

  await page.goto(`/e/${eventId}/cfp`);
  await expect(
    page.getByRole("heading", { name: "Pacific Open Data Summit 2026" }),
  ).toBeVisible();

  await page.getByLabel("Talk title").fill(title);
  await page
    .getByLabel("Abstract")
    .fill("An acceptance-test abstract about open harbor charts.");
  await selectDropdownOption(page, "Track", "Platform");
  await selectDropdownOption(page, "Session format", "Workshop");
  await expect(page.getByLabel("Workshop duration")).toBeVisible();
  await page.getByLabel("Workshop duration").fill(duration);

  await page.getByRole("button", { name: "Add co-speaker" }).click();
  const speakerNames = page.getByLabel("Speaker name");
  const speakerEmails = page.getByLabel("Speaker email");
  const biographies = page.getByLabel("Biography");
  await expect(speakerNames).toHaveCount(2);

  await speakerNames.nth(0).fill(speaker);
  await speakerEmails.nth(0).fill(`${suffix}@example.com`);
  await biographies.nth(0).fill("Speaker biography for acceptance.");

  await speakerNames.nth(1).fill(coSpeaker);
  await speakerEmails.nth(1).fill(`co-${suffix}@example.com`);
  await biographies.nth(1).fill("Co-speaker biography for acceptance.");

  await page
    .getByLabel("Supporting link")
    .fill("https://example.com/harbor-charts");

  const pdfBytes = await import("node:fs/promises").then((fs) =>
    fs.readFile(fixturePdf),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });
  await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Replace file" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/application\/pdf/i)).toBeVisible();

  await page.getByRole("button", { name: "Submit proposal" }).click();

  await expect(
    page.getByRole("heading", { name: "Thanks - your proposal is in." }),
  ).toBeVisible();
  const proposalId = (await page.locator(".confirm-meta code").innerText()).trim();
  expect(proposalId).toMatch(/^SUB-[A-Z0-9]+$/);
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText("Platform")).toBeVisible();
  expect(page.url()).toContain(`/e/${eventId}/proposals/${proposalId}`);

  await page.reload();
  await expect(page.locator(".confirm-meta code")).toHaveText(proposalId);

  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".inspector-kicker")).toHaveText(proposalId);

  const inspector = page.getByLabel("Proposal detail");
  await expect(inspector.getByText("Platform").first()).toBeVisible();
  await expect(inspector.getByText("Workshop", { exact: true })).toBeVisible();
  await expect(inspector.getByText(duration)).toBeVisible();
  await expect(inspector.getByText(speaker).first()).toBeVisible();
  await expect(inspector.getByText(coSpeaker)).toBeVisible();
  await expect(inspector.getByText(`co-${suffix}@example.com`)).toBeVisible();
  await expect(inspector.getByText(fileName)).toBeVisible();
  await expect(inspector.getByText(/application\/pdf/i)).toBeVisible();
});

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
  await selectDropdownOption(page, "Track", "Platform");
  await selectDropdownOption(page, "Session format", "Talk");
  await page.getByLabel("Speaker name").fill(speaker);
  await page.getByLabel("Speaker email").fill(`${suffix}@example.com`);
  await page.getByLabel("Biography").fill("Speaker biography for acceptance.");
  await page
    .getByLabel("Supporting link")
    .fill("https://example.com/harbor-charts");
  await page.getByRole("button", { name: "Submit proposal" }).click();

  await expect(
    page.getByRole("heading", { name: "Thanks - your proposal is in." }),
  ).toBeVisible();
  const proposalId = (await page.locator(".confirm-meta code").innerText()).trim();
  expect(proposalId).toMatch(/^SUB-[A-Z0-9]+$/);
  await expect(page.getByText(title)).toBeVisible();
  expect(page.url()).toContain(`/e/${eventId}/proposals/${proposalId}`);

  await page.reload();
  await expect(page.locator(".confirm-meta code")).toHaveText(proposalId);

  await page.goto(`/e/${eventId}/submissions`);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".inspector-kicker")).toHaveText(proposalId);
  await expect(page.getByText(speaker).first()).toBeVisible();

  await page.getByLabel("Search title, speaker, or ID").fill(title);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Search title, speaker, or ID").fill(speaker);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.reload();
  await page.getByLabel("Search title, speaker, or ID").fill(proposalId);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".inspector-kicker")).toHaveText(proposalId);
});

test("submissions event switch updates the permanent route", async ({ page }) => {
  await page.goto(`/e/${eventId}/submissions`);

  await page
    .getByRole("combobox", { name: "Event" })
    .selectOption("ai-engineer-worlds-fair-2026");
  await expect(page).toHaveURL(/\/e\/ai-engineer-worlds-fair-2026\/submissions$/);

  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Event" }),
  ).toHaveValue("ai-engineer-worlds-fair-2026");
});
