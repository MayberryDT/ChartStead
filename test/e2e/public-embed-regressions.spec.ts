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
});
