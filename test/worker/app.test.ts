import { env, evictDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createApp } from "../../worker/app";

const demoApp = createApp({
  resolvePrincipal: async () => ({
    id: "demo-admin",
    displayName: "Demo Administrator",
    role: "admin",
    eventIds: [
      "pacific-open-data-summit-2026",
      "ai-engineer-worlds-fair-2026",
    ],
  }),
});

describe("ChartStead Worker", () => {
  it("reports health through the HTTP application", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("protects organizer event data in the production entrypoint", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/events");

    expect(response.status).toBe(401);
  });

  it("selects between event-scoped records through the HTTP application", async () => {
    const listResponse = await demoApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json<{
      events: Array<{ id: string; submissionCount: number }>;
    }>();
    expect(list.events).toEqual([
      expect.objectContaining({
        id: "pacific-open-data-summit-2026",
        submissionCount: 47,
      }),
      expect.objectContaining({
        id: "ai-engineer-worlds-fair-2026",
        submissionCount: 32,
      }),
    ]);

    const selectedResponse = await demoApp.request(
      "https://chartstead.test/api/events/ai-engineer-worlds-fair-2026",
      undefined,
      env,
    );
    expect(selectedResponse.status).toBe(200);
    await expect(selectedResponse.json()).resolves.toMatchObject({
      event: { name: "AI Engineer World's Fair 2026" },
    });
  });

  it("persists seeded event operations across Durable Object eviction", async () => {
    const store = env.EVENT_STORE.getByName("pacific-open-data-summit-2026");

    const listResponse = await demoApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    expect(listResponse.status).toBe(200);

    const first = await store.getEvent();
    await evictDurableObject(store);
    const reloadedStore = env.EVENT_STORE.getByName("pacific-open-data-summit-2026");
    const second = await reloadedStore.getEvent();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "pacific-open-data-summit-2026",
      name: "Pacific Open Data Summit 2026",
      submissionCount: 47,
      tracks: [
        expect.objectContaining({ name: "Platform", proposalCount: 14 }),
        expect.objectContaining({ name: "Program Ops", proposalCount: 12 }),
        expect.objectContaining({ name: "Design Systems", proposalCount: 11 }),
        expect.objectContaining({ name: "Community", proposalCount: 10 }),
      ],
    });
  });
});
