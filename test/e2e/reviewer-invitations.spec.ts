import { expect, test } from "@playwright/test";

test("organizer sees the truthful reviewer invitation lifecycle", async ({ page }) => {
  const invitation = {
    id: "browser-invitation-1",
    email: "reviewer@example.com",
    trackIds: ["platform"],
    status: "pending",
    deliveryState: "retryable",
    expiresAt: "2026-08-19T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
  };
  const writes: string[] = [];

  await page.route("**/api/events/*/reviewers", async (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          invitation: {
            ...invitation,
            email: "next@example.com",
            deliveryState: "queued",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ reviewers: [], invitations: [invitation] }),
    });
  });

  await page.goto("/e/pacific-open-data-summit-2026/submissions");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Reviewers" })).toBeVisible();
  await expect(page.getByText("Delivery failed — retry available")).toBeVisible();
  await expect(page.getByText("reviewer@example.com")).toBeVisible();

  await page.getByLabel("Reviewer email").fill("next@example.com");
  await page.getByRole("checkbox", { name: "Platform" }).check();
  await page.getByRole("button", { name: "Send reviewer invitation" }).click();
  await expect(page.getByText("Invitation queued for next@example.com.")).toBeVisible();
  expect(writes).toEqual([
    JSON.stringify({ email: "next@example.com", trackIds: ["platform"] }),
  ]);
});

test("reviewer invitation page names the exact queue scope before authentication", async ({ page }) => {
  await page.route("**/api/reviewer-invitations/browser-token", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        invitation: {
          eventId: "pacific-open-data-summit-2026",
          eventName: "Pacific Open Data Summit 2026",
          emailHint: "re••••••@example.com",
          tracks: [{ id: "platform", name: "Platform" }],
          status: "pending",
        },
      }),
    }),
  );
  await page.route("**/api/auth/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "null" }),
  );

  await page.goto(
    "/e/pacific-open-data-summit-2026/reviewer-invitations/browser-token",
  );
  await expect(
    page.getByRole("heading", { name: "Review proposals for Pacific Open Data Summit 2026" }),
  ).toBeVisible();
  await expect(page.getByText("re••••••@example.com")).toBeVisible();
  await expect(page.getByText("Platform")).toBeVisible();
  await expect(page.getByLabel("Sign in with the invited email")).toBeVisible();
});
