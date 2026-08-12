import { env, evictDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type {
  EventRecord,
  PublishedCfpForm,
  SubmissionAnswers,
} from "../../shared/events";
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
  signingSecret: "test-worker-signing-secret-32chars!!",
});

function mainCfpAnswers(overrides: SubmissionAnswers = {}): SubmissionAnswers {
  return {
    title: "Main CFP proposal",
    abstract: "A valid abstract for the main form.",
    trackId: "platform",
    sessionFormat: "talk",
    speakers: [
      {
        name: "Main Speaker",
        email: "main@example.com",
        biography: "A short biography.",
      },
    ],
    supportingLink: "",
    ...overrides,
  };
}

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
        submissionCount: 57,
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
          schemaVersion: 1,
          runtime: {
            engine: "surveyjs",
            survey: {
              elements: expect.arrayContaining([
                expect.objectContaining({ name: "title", type: "text" }),
                expect.objectContaining({ name: "trackId", type: "dropdown" }),
                expect.objectContaining({ name: "speakers", type: "paneldynamic" }),
              ]),
            },
          },
        },
      },
    });
  });

  it("keeps published form versions as immutable snapshots", async () => {
    const store = env.EVENT_STORE.getByName("form-version-snapshot-test");
    const baseDefinition = {
      schemaVersion: 1 as const,
      definitionId: "main-cfp",
      definitionVersion: 1,
      eventId: "form-version-snapshot-test",
      status: "published" as const,
      opensAt: null,
      closesAt: null,
      runtime: {
        engine: "surveyjs" as const,
        engineMajor: 2 as const,
        survey: {
          showTitle: false as const,
          showQuestionNumbers: "off" as const,
          checkErrorsMode: "onComplete" as const,
          textUpdateMode: "onTyping" as const,
          questionErrorLocation: "bottom" as const,
          completeText: "Submit proposal",
          requiredMark: "*" as const,
          elements: [
            {
              type: "text" as const,
              name: "title",
              title: "Version one",
              isRequired: true,
            },
          ],
        },
      },
      chartstead: {
        template: "standard-cfp" as const,
        protectedNames: ["title", "abstract", "trackId", "speakers"],
        proposalTitleName: "title" as const,
        trackQuestionName: "trackId" as const,
        speakerPanelName: "speakers" as const,
        uploadQuestionNames: [] as string[],
      },
    };
    const versionOne: PublishedCfpForm = {
      id: "main-cfp",
      name: "Main CFP",
      status: "published",
      definitionVersion: 1,
      definition: baseDefinition,
      publishedAt: "2026-08-01T00:00:00.000Z",
    };
    const versionTwo: PublishedCfpForm = {
      ...versionOne,
      definitionVersion: 2,
      definition: {
        ...baseDefinition,
        definitionVersion: 2,
        runtime: {
          ...baseDefinition.runtime,
          survey: {
            ...baseDefinition.runtime.survey,
            elements: [
              {
                type: "text",
                name: "title",
                title: "Version two",
                isRequired: true,
              },
            ],
          },
        },
      },
      publishedAt: "2026-08-02T00:00:00.000Z",
    };

    await store.seedPublishedFormIfEmpty(versionOne);
    await store.seedPublishedFormIfEmpty(versionTwo);
    await store.seedPublishedFormIfEmpty({
      ...versionOne,
      definition: {
        ...baseDefinition,
        runtime: {
          ...baseDefinition.runtime,
          survey: {
            ...baseDefinition.runtime.survey,
            elements: [
              {
                type: "text",
                name: "title",
                title: "Mutated version one",
                isRequired: true,
              },
            ],
          },
        },
      },
    });

    await expect(store.getFormVersion("main-cfp", 1)).resolves.toMatchObject({
      definitionVersion: 1,
      definition: {
        runtime: {
          survey: {
            elements: [expect.objectContaining({ title: "Version one" })],
          },
        },
      },
    });
    await expect(store.getPublishedForm()).resolves.toMatchObject({
      definitionVersion: 2,
      definition: {
        runtime: {
          survey: {
            elements: [expect.objectContaining({ title: "Version two" })],
          },
        },
      },
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
    const created = await store.createProposal({
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers: mainCfpAnswers({
        title: "Existing operational proposal",
        abstract: "This proposal predates demo row seeding.",
        speakers: [
          {
            name: "Existing Speaker",
            email: "existing@example.com",
            biography: "Existing biography.",
          },
        ],
      }),
      normalized: {
        title: "Existing operational proposal",
        abstract: "This proposal predates demo row seeding.",
        trackId: "platform",
        speakerName: "Existing Speaker",
        speakerEmail: "existing@example.com",
        biography: "Existing biography.",
        supportingLink: "",
        sessionFormat: "talk",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected proposal create");
    const operational = created.proposal;

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
    const answers = mainCfpAnswers({
      title: "Open charts for harbor operations",
      abstract: "A talk about making open data useful on the waterfront.",
      speakers: [
        {
          name: "Ada Harbor",
          email: "ada@example.com",
          biography: "Harbor systems engineer and open data advocate.",
        },
      ],
      supportingLink: "https://example.com/ada-harbor",
    });
    const payload = {
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers,
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
      title: answers.title,
      speakerName: "Ada Harbor",
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
      title: answers.title,
      speakerName: "Ada Harbor",
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
        speakerEmail: "ada@example.com",
        committeeNote: "",
        answers: expect.objectContaining({
          title: answers.title,
          supportingLink: answers.supportingLink,
        }),
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
        title: answers.title,
        speakerName: "Ada Harbor",
        speakerEmail: "ada@example.com",
        biography: "Harbor systems engineer and open data advocate.",
        supportingLink: answers.supportingLink,
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
        title: answers.title,
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
          answers: mainCfpAnswers({
            title: "Stale form proposal",
            abstract: "A valid abstract from a stale form.",
            speakers: [
              {
                name: "Stale Speaker",
                email: "stale@example.com",
                biography: "A valid biography.",
              },
            ],
          }),
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
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: {
            title: "",
            abstract: "Kept abstract",
            trackId: "not-a-track",
            sessionFormat: "talk",
            speakers: [
              {
                name: "Kept speaker",
                email: "not-an-email",
                biography: "",
              },
            ],
            supportingLink: "ftp://bad.example",
          },
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      values: {
        title: "",
        abstract: "Kept abstract",
        trackId: "not-a-track",
        speakers: [
          {
            name: "Kept speaker",
            email: "not-an-email",
            biography: "",
          },
        ],
        supportingLink: "ftp://bad.example",
      },
      errors: {
        title: expect.any(String),
        trackId: expect.any(String),
        "speakers.0.email": expect.any(String),
        "speakers.0.biography": expect.any(String),
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
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "x".repeat(161),
            abstract: "Valid abstract",
            speakers: [
              {
                name: "Valid Speaker",
                email: "valid@example.com",
                biography: "Valid biography",
              },
            ],
          }),
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
      answers: mainCfpAnswers({
        title: "Rate limit test",
        abstract: "A valid abstract for rate limiting.",
        trackId: "agents",
        speakers: [
          {
            name: "Rate Limited Speaker",
            email: "rate@example.com",
            biography: "A valid biography.",
          },
        ],
      }),
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
