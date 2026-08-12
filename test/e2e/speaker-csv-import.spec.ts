import { expect, test } from "@playwright/test";

test("organizer previews and applies a speaker CSV into the live directory", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const name = `CSV Speaker ${suffix}`;
  const email = `csv-${suffix}@example.test`;

  await page.goto("/");
  await page.getByRole("link", { name: "Speakers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Speaker directory" })).toBeVisible();

  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByLabel("CSV file").setInputFiles({
    name: "new-speakers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Full Name,Email Address,Bio,Job Title,Company",
        `${name},${email},Imported through acceptance,Engineer,Harbor Systems`,
      ].join("\n"),
    ),
  });

  await expect(page.getByRole("combobox", { name: "Name column" })).toHaveValue(
    "Full Name",
  );
  await expect(page.getByRole("combobox", { name: "Email column" })).toHaveValue(
    "Email Address",
  );
  await expect(page.getByRole("combobox", { name: "Title column" })).toHaveValue(
    "Job Title",
  );
  await expect(
    page.getByRole("combobox", { name: "Organization column" }),
  ).toHaveValue("Company");

  await page.getByRole("button", { name: "Preview 1 row" }).click();
  const preview = page.getByRole("table", { name: "Speaker import preview" });
  await expect(preview.getByText(name)).toBeVisible();
  await expect(preview.getByText("create", { exact: true })).toBeVisible();
  await expect(preview.getByLabel("Action for CSV row 2")).toHaveValue("create");

  await page.getByRole("button", { name: "Apply 1 changes" }).click();
  await expect(page.getByRole("status")).toContainText("1 created");

  await page.getByRole("searchbox", { name: "Search speakers" }).fill(email);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "Speakers", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search speakers" }).fill(email);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
});
