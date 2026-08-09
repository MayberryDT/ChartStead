import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("ChartStead Worker", () => {
  it("reports health through the HTTP application", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("protects organizer event data in the production entrypoint", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/events/current");

    expect(response.status).toBe(401);
  });

  it("seeds the event exactly once in Durable Object SQLite", async () => {
    const store = env.EVENT_STORE.getByName("pacific-open-data-summit-2026");

    const first = await store.getEvent();
    const second = await store.getEvent();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "pacific-open-data-summit-2026",
      name: "Pacific Open Data Summit 2026",
      tracks: ["Platform", "Program Ops", "Design Systems", "Community"],
      rooms: ["Harbor Hall", "Compass Room", "Chart Room"],
    });
  });
});
