import { env, evictDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { EventRecord, PublishedCfpForm } from "../../shared/events";
import { createApp } from "../../worker/app";
import { createSeedProposals } from "../../worker/seed-proposals";

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
        id: "main-cfp",
        status: "published",
        definitionVersion: 1,
        definition: {
          elements: expect.arrayContaining([
            expect.objectContaining({ name: "title", type: "text" }),
            expect.objectContaining({ name: "trackId", type: "dropdown" }),
            expect.objectContaining({ name: "speakerEmail", type: "text" }),
          ]),
        },
      },
    });
  });

  it("keeps published form versions as immutable snapshots", async () => {
    const store = env.EVENT_STORE.getByName("form-version-snapshot-test");
    const versionOne: PublishedCfpForm = {
      id: "main-cfp",
      status: "published",
      definitionVersion: 1,
      definition: { title: "Version one" },
      publishedAt: "2026-08-01T00:00:00.000Z",
    };
    const versionTwo: PublishedCfpForm = {
      ...versionOne,
      definitionVersion: 2,
      definition: { title: "Version two" },
      publishedAt: "2026-08-02T00:00:00.000Z",
    };

    await store.seedPublishedFormIfEmpty(versionOne);
    await store.seedPublishedFormIfEmpty(versionTwo);
    await store.seedPublishedFormIfEmpty({
      ...versionOne,
      definition: { title: "Mutated version one" },
    });

    await expect(store.getFormVersion("main-cfp", 1)).resolves.toMatchObject({
      definitionVersion: 1,
      definition: { title: "Version one" },
    });
    await expect(store.getPublishedForm()).resolves.toMatchObject({
      definitionVersion: 2,
      definition: { title: "Version two" },
    });
  });

  it("seeds proposal rows that agree with the event summary", async () => {
    const eventId = "ai-engineer-worlds-fair-2026";
    const eventResponse = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    const { event } = await eventResponse.json<{
      event: { submissionCount: number };
    }>();

    const proposalsResponse = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    const { proposals } = await proposalsResponse.json<{
      proposals: Array<{ id: string }>;
    }>();

    expect(proposals).toHaveLength(event.submissionCount);
  });

  it("reconciles persisted event aggregates when proposal rows are first seeded", async () => {
    const store = env.EVENT_STORE.getByName("proposal-reconciliation-test");
    const staleEvent: EventRecord = {
      id: "proposal-reconciliation-test",
      name: "Proposal Reconciliation Test",
      startsOn: "2026-10-01",
      endsOn: "2026-10-02",
      submissionCount: 99,
      unreviewedCount: 77,
      tracks: [{ id: "platform", name: "Platform", proposalCount: 99 }],
      rooms: [],
    };
    const proposalSeedEvent: EventRecord = {
      ...staleEvent,
      submissionCount: 1,
      unreviewedCount: 1,
      tracks: [{ id: "platform", name: "Platform", proposalCount: 1 }],
    };

    await store.seedIfEmpty(staleEvent);
    await store.seedProposalsIfNeeded(createSeedProposals(proposalSeedEvent));

    await expect(store.getEvent()).resolves.toMatchObject({
      submissionCount: 1,
      unreviewedCount: 1,
      tracks: [expect.objectContaining({ id: "platform", proposalCount: 1 })],
    });
  });

  it("does not add demo proposals to a store with operational submissions", async () => {
    const store = env.EVENT_STORE.getByName("legacy-proposal-store-test");
    const event: EventRecord = {
      id: "legacy-proposal-store-test",
      name: "Legacy Proposal Store Test",
      startsOn: "2026-10-01",
      endsOn: "2026-10-02",
      submissionCount: 1,
      unreviewedCount: 1,
      tracks: [{ id: "platform", name: "Platform", proposalCount: 1 }],
      rooms: [],
    };

    await store.seedIfEmpty(event);
    const operational = await store.createProposal(
      {
        title: "Existing operational proposal",
        abstract: "This proposal predates demo row seeding.",
        trackId: "platform",
        speakerName: "Existing Speaker",
        speakerEmail: "existing@example.com",
        biography: "Existing biography.",
        supportingLink: "",
      },
      "main-cfp",
      1,
    );

    await store.seedProposalsIfNeeded(createSeedProposals(event));

    await expect(store.listProposals()).resolves.toEqual([
      expect.objectContaining({ id: operational.id }),
    ]);
    await expect(store.getEvent()).resolves.toMatchObject({
      submissionCount: 2,
      unreviewedCount: 2,
      tracks: [expect.objectContaining({ id: "platform", proposalCount: 2 })],
    });
  });

  it("accepts a public proposal, assigns a stable id, and keeps committee fields private", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const payload = {
      formId: "main-cfp",
      formDefinitionVersion: 1,
      title: "Open charts for harbor operations",
      abstract: "A talk about making open data useful on the waterfront.",
      trackId: "platform",
      speakerName: "Ada Harbor",
      speakerEmail: "ada@example.com",
      biography: "Harbor systems engineer and open data advocate.",
      supportingLink: "https://example.com/ada-harbor",
    };

    const before = await env.EVENT_STORE.getByName(eventId).getEvent();
    const beforeTrack = before?.tracks.find((track) => track.id === "platform");

    const submit = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.10",
        },
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
        abstract?: string;
        biography?: string;
        supportingLink?: string;
        status?: string;
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
    expect(created.proposal).not.toHaveProperty("abstract");
    expect(created.proposal).not.toHaveProperty("biography");
    expect(created.proposal).not.toHaveProperty("supportingLink");
    expect(created.proposal).not.toHaveProperty("status");

    const after = await env.EVENT_STORE.getByName(eventId).getEvent();
    const afterTrack = after?.tracks.find((track) => track.id === "platform");
    expect(after?.submissionCount).toBe((before?.submissionCount ?? 0) + 1);
    expect(after?.unreviewedCount).toBe((before?.unreviewedCount ?? 0) + 1);
    expect(afterTrack?.proposalCount).toBe(
      (beforeTrack?.proposalCount ?? 0) + 1,
    );

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
    expect(publicBody.proposal).not.toHaveProperty("abstract");
    expect(publicBody.proposal).not.toHaveProperty("biography");
    expect(publicBody.proposal).not.toHaveProperty("supportingLink");
    expect(publicBody.proposal).not.toHaveProperty("status");

    const organizerDetail = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${created.proposal.id}`,
      undefined,
      env,
    );
    expect(organizerDetail.status).toBe(200);
    await expect(organizerDetail.json()).resolves.toMatchObject({
      proposal: {
        id: created.proposal.id,
        formId: "main-cfp",
        formDefinitionVersion: 1,
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

    const titleSearch = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?q=Open%20charts`,
      undefined,
      env,
    );
    const titleResults = await titleSearch.json<{
      proposals: Array<{ id: string }>;
    }>();
    expect(titleResults.proposals).toEqual([
      expect.objectContaining({ id: created.proposal.id }),
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

  it("rejects a proposal attributed to an unknown form snapshot", async () => {
    const response = await SELF.fetch(
      "https://chartstead.test/api/events/pacific-open-data-summit-2026/proposals",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.55",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 999,
          title: "Stale form proposal",
          abstract: "A valid abstract from a stale form.",
          trackId: "platform",
          speakerName: "Stale Speaker",
          speakerEmail: "stale@example.com",
          biography: "A valid biography.",
          supportingLink: "",
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("form"),
    });
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

  it("rejects oversized proposal fields and request bodies", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const fieldResponse = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "x".repeat(161),
          abstract: "Valid abstract",
          trackId: "platform",
          speakerName: "Valid Speaker",
          speakerEmail: "valid@example.com",
          biography: "Valid biography",
          supportingLink: "",
        }),
      },
    );
    expect(fieldResponse.status).toBe(400);
    await expect(fieldResponse.json()).resolves.toMatchObject({
      errors: { title: expect.stringContaining("160") },
    });

    const bodyResponse = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(70_000) }),
      },
    );
    expect(bodyResponse.status).toBe(413);

    let pullCount = 0;
    const chunkedBody = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCount += 1;
          if (pullCount <= 2) {
            controller.enqueue(new Uint8Array(40_000));
            return;
          }
          throw new Error("The request body was read past its byte limit.");
        },
      },
      { highWaterMark: 0 },
    );
    const chunkedResponse = await demoApp.request(
      new Request(`https://chartstead.test/api/events/${eventId}/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: chunkedBody,
      }),
      undefined,
      env,
    );
    expect(chunkedResponse.status).toBe(413);
    expect(pullCount).toBe(2);
  });

  it("rate limits repeated valid submissions from one public client", async () => {
    const eventId = "ai-engineer-worlds-fair-2026";
    const headers = {
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.77",
    };
    const payload = {
      formId: "main-cfp",
      formDefinitionVersion: 1,
      title: "Rate limit test",
      abstract: "A valid abstract for rate limiting.",
      trackId: "agents",
      speakerName: "Rate Limited Speaker",
      speakerEmail: "rate@example.com",
      biography: "A valid biography.",
      supportingLink: "",
    };

    for (let index = 0; index < 20; index += 1) {
      const response = await SELF.fetch(
        `https://chartstead.test/api/events/${eventId}/proposals`,
        {
          method: "POST",
          headers: { ...headers, "user-agent": `rotating-agent-${index}` },
          body: JSON.stringify(payload),
        },
      );
      expect(response.status).toBe(201);
    }

    const blocked = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { ...headers, "user-agent": "another-rotating-agent" },
        body: JSON.stringify(payload),
      },
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});
