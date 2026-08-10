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

  it("exposes a public CFP form without organizer authentication", async () => {
    const response = await SELF.fetch(
      "https://chartstead.test/api/events/pacific-open-data-summit-2026/cfp",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      event: {
        id: "pacific-open-data-summit-2026",
        name: "Pacific Open Data Summit 2026",
      },
      form: {
        status: "published",
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: "platform", name: "Platform" }),
        ]),
      },
    });
  });

  it("accepts a public proposal, assigns a stable id, and keeps committee fields private", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const payload = {
      title: "Open charts for harbor operations",
      abstract: "A talk about making open data useful on the waterfront.",
      trackId: "platform",
      speakerName: "Ada Harbor",
      speakerEmail: "ada@example.com",
      biography: "Harbor systems engineer and open data advocate.",
      supportingLink: "https://example.com/ada-harbor",
    };

    const submit = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(submit.status).toBe(201);
    const created = await submit.json<{
      proposal: {
        id: string;
        title: string;
        speakerName: string;
        trackId: string;
        committeeNote?: string;
        privateNote?: string;
        speakerEmail?: string;
      };
    }>();
    expect(created.proposal.id).toMatch(/^SUB-[A-Z0-9]+$/);
    expect(created.proposal).toMatchObject({
      title: payload.title,
      speakerName: payload.speakerName,
      trackId: "platform",
    });
    expect(created.proposal).not.toHaveProperty("committeeNote");
    expect(created.proposal).not.toHaveProperty("privateNote");
    expect(created.proposal).not.toHaveProperty("speakerEmail");

    const publicDetail = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals/${created.proposal.id}`,
    );
    expect(publicDetail.status).toBe(200);
    const publicBody = await publicDetail.json<{
      proposal: Record<string, unknown>;
    }>();
    expect(publicBody.proposal).toMatchObject({
      id: created.proposal.id,
      title: payload.title,
      speakerName: payload.speakerName,
    });
    expect(publicBody.proposal).not.toHaveProperty("committeeNote");
    expect(publicBody.proposal).not.toHaveProperty("speakerEmail");

    const organizerDetail = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${created.proposal.id}`,
      undefined,
      env,
    );
    expect(organizerDetail.status).toBe(200);
    await expect(organizerDetail.json()).resolves.toMatchObject({
      proposal: {
        id: created.proposal.id,
        speakerEmail: payload.speakerEmail,
        committeeNote: "",
      },
    });

    const unauthorizedList = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
    );
    expect(unauthorizedList.status).toBe(401);

    const list = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?q=${created.proposal.id}`,
      undefined,
      env,
    );
    expect(list.status).toBe(200);
    const listed = await list.json<{
      proposals: Array<Record<string, unknown>>;
    }>();
    expect(listed.proposals).toEqual([
      expect.objectContaining({
        id: created.proposal.id,
        title: payload.title,
        speakerName: payload.speakerName,
        speakerEmail: payload.speakerEmail,
        biography: payload.biography,
        supportingLink: payload.supportingLink,
        status: "unreviewed",
        committeeNote: "",
      }),
    ]);

    await evictDurableObject(env.EVENT_STORE.getByName(eventId));

    const afterReload = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?q=Ada%20Harbor`,
      undefined,
      env,
    );
    const reloaded = await afterReload.json<{
      proposals: Array<{ id: string; title: string }>;
    }>();
    expect(reloaded.proposals).toEqual([
      expect.objectContaining({
        id: created.proposal.id,
        title: payload.title,
      }),
    ]);
  });

  it("returns field errors and preserves values for invalid public submissions", async () => {
    const response = await SELF.fetch(
      "https://chartstead.test/api/events/pacific-open-data-summit-2026/proposals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "",
          abstract: "Kept abstract",
          trackId: "not-a-track",
          speakerName: "Kept speaker",
          speakerEmail: "not-an-email",
          biography: "",
          supportingLink: "ftp://bad.example",
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      values: {
        title: "",
        abstract: "Kept abstract",
        trackId: "not-a-track",
        speakerName: "Kept speaker",
        speakerEmail: "not-an-email",
        biography: "",
        supportingLink: "ftp://bad.example",
      },
      errors: {
        title: expect.any(String),
        trackId: expect.any(String),
        speakerEmail: expect.any(String),
        biography: expect.any(String),
        supportingLink: expect.any(String),
      },
    });
  });
});
