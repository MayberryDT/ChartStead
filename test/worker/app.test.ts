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

  it("persists operational event data across Durable Object eviction without reseeding", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const store = env.EVENT_STORE.getByName(eventId);

    const seedResponse = await demoApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    expect(seedResponse.status).toBe(200);

    await store.patchCounts(99, 7);
    const mutated = await store.getEvent();
    expect(mutated).toMatchObject({
      id: eventId,
      submissionCount: 99,
      unreviewedCount: 7,
    });

    await evictDurableObject(store);

    const reloadedStore = env.EVENT_STORE.getByName(eventId);
    const afterEviction = await reloadedStore.getEvent();
    expect(afterEviction).toMatchObject({
      id: eventId,
      submissionCount: 99,
      unreviewedCount: 7,
    });
    expect(afterEviction?.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Platform", proposalCount: 14 }),
      ]),
    );

    const listAfterSeedCall = await demoApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    const body = await listAfterSeedCall.json<{
      events: Array<{ id: string; submissionCount: number; unreviewedCount: number }>;
    }>();
    const pacific = body.events.find((event) => event.id === eventId);
    expect(pacific).toMatchObject({
      submissionCount: 99,
      unreviewedCount: 7,
    });
  });
});
