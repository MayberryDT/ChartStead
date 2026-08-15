import { expect, test } from "@playwright/test";

test.describe("public embed regression geometry", () => {
  test("itinerary cards never intersect after the session inspector opens", async ({ page }) => {
    await page.setViewportSize({ width: 1873, height: 923 });
    await page.goto("/fixtures/itinerary-embed");
    await page.getByRole("button", { name: "View Open Data for Smarter Cities details" }).click();

    const intersections = await page.locator(".itinerary-card").evaluateAll((nodes) => {
      const boxes = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      let count = 0;
      for (let first = 0; first < boxes.length; first += 1) {
        for (let second = first + 1; second < boxes.length; second += 1) {
          const a = boxes[first]!;
          const b = boxes[second]!;
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) count += 1;
        }
      }
      return count;
    });

    expect(intersections).toBe(0);
  });

  test("speakers list keeps a full-height desktop inspector beside the directory", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/fixtures/embeds/speakers-list");
    const inspector = page.getByRole("complementary", { name: /Speaker profile:/ });
    const box = await inspector.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.height).toBeGreaterThanOrEqual(970);
  });

  test("speaker directory is materially denser than the portrait gallery", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/fixtures/embeds/speakers-list");
    const directoryAvatar = await page.locator(".program-speaker-list-entry .program-speaker-avatar").first().boundingBox();
    const directoryRow = await page.locator(".program-speaker-list-entry").first().boundingBox();

    await page.goto("/e/pacific-open-data-summit-2026/program/embed?widget=speaker-gallery&fixture=signal-rail");
    const galleryAvatar = await page.locator(".signal-gallery-grid .program-speaker-avatar").first().boundingBox();
    const galleryCard = await page.locator(".signal-gallery-grid .program-speaker-gallery-card").first().boundingBox();

    expect(directoryAvatar).not.toBeNull();
    expect(directoryRow).not.toBeNull();
    expect(galleryAvatar).not.toBeNull();
    expect(galleryCard).not.toBeNull();
    expect(directoryAvatar!.width).toBeGreaterThanOrEqual(68);
    expect(directoryAvatar!.width).toBeLessThanOrEqual(84);
    expect(galleryAvatar!.width).toBeGreaterThanOrEqual(110);
    expect(directoryRow!.height).toBeLessThan(galleryCard!.height * 0.8);
  });

  test("sessions inspector reserves space and leaves schedule controls visible", async ({ page }) => {
    await page.setViewportSize({ width: 1873, height: 923 });
    await page.goto("/demo/embeds/sessions-list");
    await page.getByRole("button", { name: "Open Public Infrastructure for Everyone session details" }).click();

    const inspector = await page.getByRole("complementary", { name: /Session details:/ }).boundingBox();
    const row = await page.locator(".atlas-session-row").first().boundingBox();
    expect(inspector).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row!.x + row!.width).toBeLessThanOrEqual(inspector!.x + 1);
    await expect(page.getByText("10 sessions", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /My schedule/ })).toBeVisible();
  });

  test("speakers list inspector uses the full narrow viewport like the gallery", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fixtures/embeds/speakers-list");
    const inspector = await page.getByRole("complementary", { name: /Speaker profile:/ }).boundingBox();
    expect(inspector).not.toBeNull();
    expect(inspector!.x).toBeLessThanOrEqual(1);
    expect(inspector!.width).toBeGreaterThanOrEqual(389);
  });
});
