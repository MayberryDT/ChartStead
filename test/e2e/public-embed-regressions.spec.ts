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
    const inspector = await page.getByRole("complementary", { name: /Session details:/ }).boundingBox();
    const main = await page.locator(".itinerary-main").boundingBox();
    expect(inspector).not.toBeNull();
    expect(main).not.toBeNull();
    expect(main!.x + main!.width).toBeLessThanOrEqual(inspector!.x + 1);
  });

  test("speakers list is a card-only directory with a compact aligned header", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/fixtures/embeds/speakers-list");
    await expect(page.getByRole("complementary", { name: /Speaker profile:/ })).toHaveCount(0);
    await expect(page.getByText("View profile")).toHaveCount(0);
    await expect(page.locator(".program-header").getByText("SPEAKERS LIST")).toHaveCount(0);
    await expect(page.getByText("15 speakers")).toHaveCount(0);
    const filters = await page.locator(".speaker-directory-filters").boundingBox();
    const search = await page.locator(".speaker-directory-search").boundingBox();
    expect(filters).not.toBeNull();
    expect(search).not.toBeNull();
    expect(filters!.height).toBeLessThanOrEqual(60);
    expect(search!.y).toBeGreaterThanOrEqual(filters!.y);
  });

  test("speaker directory is materially denser than the portrait gallery", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/fixtures/embeds/speakers-list");
    const directoryAvatar = await page.locator(".program-speaker-list-entry .program-speaker-avatar").first().boundingBox();
    const directoryRow = await page.locator(".program-speaker-list-entry").first().boundingBox();
    const directoryColumns = await page.locator(".program-speaker-directory").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    const directoryRadius = await page.locator(".program-speaker-list-entry .program-speaker-avatar").first().evaluate((node) => Number.parseFloat(getComputedStyle(node).borderRadius));

    await page.goto("/e/pacific-open-data-summit-2026/program/embed?widget=speaker-gallery&fixture=signal-rail");
    const galleryAvatar = await page.locator(".signal-gallery-grid .program-speaker-avatar").first().boundingBox();
    const galleryCard = await page.locator(".signal-gallery-grid .program-speaker-gallery-card").first().boundingBox();
    const galleryInspector = page.locator(".signal-speaker-intro .program-speaker-avatar");
    const galleryInspectorRadius = await galleryInspector.evaluate((node) => Number.parseFloat(getComputedStyle(node).borderRadius));
    const galleryInspectorBackground = await galleryInspector.evaluate((node) => getComputedStyle(node).backgroundColor);

    expect(directoryAvatar).not.toBeNull();
    expect(directoryRow).not.toBeNull();
    expect(galleryAvatar).not.toBeNull();
    expect(galleryCard).not.toBeNull();
    expect(directoryColumns).toBe(3);
    expect(directoryAvatar!.width).toBeGreaterThanOrEqual(92);
    expect(directoryAvatar!.width).toBeLessThanOrEqual(100);
    expect(directoryRadius).toBeLessThanOrEqual(12);
    expect(galleryInspectorRadius).toBeGreaterThanOrEqual(50);
    expect(galleryInspectorBackground).toBe("rgba(0, 0, 0, 0)");
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
    await expect(page.locator(".sessions-total")).toHaveCount(0);
    await expect(page.locator(".program-filters").getByRole("button", { name: /My schedule/ })).toBeVisible();
  });

  test("agenda inspector reserves space instead of covering session rows", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/fixtures/agenda-embed");
    await page.getByRole("button", { name: "Open Public Infrastructure for Everyone session details" }).click();
    const inspector = await page.getByRole("complementary", { name: /Session details:/ }).boundingBox();
    const row = await page.locator(".agenda-row").first().boundingBox();
    expect(inspector).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row!.x + row!.width).toBeLessThanOrEqual(inspector!.x + 1);
  });
});
