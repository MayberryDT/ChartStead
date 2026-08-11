import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { AirtableSyncState } from "../../shared/airtable";
import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  OrganizerProposal,
} from "../../shared/events";
import { createMemoryAirtableClient } from "../../worker/airtable/client";
import { AirtableClientError } from "../../worker/airtable/client";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-10-airtable-api-signing-secret";

const adminPrincipal = {
  id: "t10-admin",
  displayName: "API Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "t10-reviewer",
  displayName: "API Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "reviewer" },
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;

const apiKeyPrincipal = {
  id: "t10-api-key-user",
  displayName: "Automation Key",
  role: "admin",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "admin" },
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret,
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret,
});

const anonymousApp = createApp({
  resolvePrincipal: async () => null,
  signingSecret,
});

const bearerApp = createApp({
  resolvePrincipal: async () => null,
  signingSecret,
  resolveApiKeyPrincipal: async (token) =>
    token === "cs_live_test_token_ok" ? apiKeyPrincipal : null,
});

async function seedEvent() {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

describe("Ticket 10 Airtable foundation", () => {
  beforeAll(async () => {
    await seedEvent();
  });

  it("reports unconfigured Airtable sync without breaking the core app", async () => {
    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      { method: "DELETE" },
      env,
    );

    const status = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      undefined,
      env,
    );
    expect(status.status).toBe(200);
    const body = await status.json<{ sync: AirtableSyncState }>();
    expect(body.sync.health).toBe("unconfigured");
    expect(body.sync.configured).toBe(false);
    expect(body.sync.hasAccessToken).toBe(false);
    expect(body.sync.guidance).toMatch(/Settings|optional/i);

    const events = await adminApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    expect(events.status).toBe(200);

    const pull = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable/pull`,
      { method: "POST" },
      env,
    );
    expect(pull.status).toBe(200);
    const pullBody = await pull.json<{
      pull: { health: string; ok: boolean };
      sync: AirtableSyncState;
    }>();
    expect(pullBody.pull.health).toBe("unconfigured");
    expect(pullBody.sync.health).toBe("unconfigured");
  });

  it("connects the demo Airtable sandbox and applies pull-wins title changes", async () => {
    const list = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    const { proposals } = await list.json<{ proposals: OrganizerProposal[] }>();
    const target = proposals[0];
    expect(target).toBeTruthy();
    const originalTitle = target!.title.replace(/ \(from Airtable demo\)$/, "");

    const put = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseId: "appChartSteadDemo",
          accessToken: "pat_demo_sandbox",
        }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const putBody = await put.json<{
      sync: AirtableSyncState;
      pull: { ok: boolean; health: string; changes: unknown[] };
    }>();
    expect(putBody.sync.configured).toBe(true);
    expect(putBody.sync.health).toBe("healthy");
    expect(putBody.pull.ok).toBe(true);
    expect(putBody.pull.changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(putBody)).not.toContain("pat_demo_sandbox");

    const detail = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${target!.id}`,
      undefined,
      env,
    );
    expect(detail.status).toBe(200);
    const body = await detail.json<{ proposal: OrganizerProposal }>();
    expect(body.proposal.title).toBe(`${originalTitle} (from Airtable demo)`);

    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      { method: "DELETE" },
      env,
    );
  });

  it("connects Airtable from Settings credentials and never returns the token", async () => {
    const app = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret,
      airtableCredentialClientFactory: () =>
        createMemoryAirtableClient({ submission: [] }),
    });

    const put = await app.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseId: "appTestBase999",
          accessToken: "pat_test_secret_token",
        }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const putBody = await put.json<{
      sync: AirtableSyncState;
      pull: { health: string; ok: boolean };
    }>();
    expect(putBody.sync.configured).toBe(true);
    expect(putBody.sync.baseId).toBe("appTestBase999");
    expect(putBody.sync.hasAccessToken).toBe(true);
    expect(putBody.pull.ok).toBe(true);
    expect(putBody.pull.health).toBe("healthy");
    expect(JSON.stringify(putBody)).not.toContain("pat_test_secret_token");

    const store = env.EVENT_STORE.getByName(eventId);
    const creds = await store.getAirtableCredentials();
    expect(creds?.accessToken).toBe("pat_test_secret_token");
    expect(creds?.baseId).toBe("appTestBase999");

    const cleared = await app.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      { method: "DELETE" },
      env,
    );
    expect(cleared.status).toBe(200);
    const clearedBody = await cleared.json<{ sync: AirtableSyncState }>();
    expect(clearedBody.sync.configured).toBe(false);
    expect(clearedBody.sync.hasAccessToken).toBe(false);
  });

  it("pulls mapped Airtable fields with Airtable-wins without overwriting committee notes", async () => {
    const list = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    expect(list.status).toBe(200);
    const { proposals } = await list.json<{ proposals: OrganizerProposal[] }>();
    const target = proposals[0];
    expect(target).toBeTruthy();

    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${target.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "approve",
          committeeNote: "Keep me local",
          expectedVersion: target.reviewVersion,
        }),
      },
      env,
    );

    const store = env.EVENT_STORE.getByName(eventId);
    const { pullAirtableForEvent } = await import("../../worker/airtable/sync");
    const result = await pullAirtableForEvent({
      store,
      client: createMemoryAirtableClient({
        submission: [
          {
            id: "recPull1",
            fields: {
              "ChartStead Submission ID": target.id,
              Title: "Title from Airtable pull",
              Abstract: "Abstract from Airtable",
              "Speaker Name": "Airtable Speaker",
            },
          },
        ],
      }),
      baseId: "appTestBase",
    });

    expect(result.ok).toBe(true);
    expect(result.health).toBe("healthy");
    expect(result.changes.some((change) => change.chartsteadId === target.id)).toBe(
      true,
    );

    const detail = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${target.id}`,
      undefined,
      env,
    );
    expect(detail.status).toBe(200);
    const body = await detail.json<{ proposal: OrganizerProposal }>();
    expect(body.proposal.title).toBe("Title from Airtable pull");
    expect(body.proposal.abstract).toBe("Abstract from Airtable");
    expect(body.proposal.speakerName).toBe("Airtable Speaker");
    expect(body.proposal.status).toBe("approve");
    expect(body.proposal.committeeNote).toBe("Keep me local");

    const sync = await store.getAirtableSyncState();
    expect(sync.health).toBe("healthy");
    expect(sync.lastSuccessAt).toBeTruthy();
  });

  it("marks delayed health when Airtable rate-limits and leaves local data intact", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    const before = (await store.listProposals({})) as OrganizerProposal[];
    const titleBefore = before[0]?.title;

    const { pullAirtableForEvent } = await import("../../worker/airtable/sync");
    const result = await pullAirtableForEvent({
      store,
      client: {
        async listTable() {
          throw new AirtableClientError("Airtable rate limited the request.", "rate_limited", 429);
        },
      },
      baseId: "appTestBase",
    });

    expect(result.ok).toBe(false);
    expect(result.health).toBe("delayed");
    expect(result.guidance).toMatch(/rate-limited|usable/i);

    const after = (await store.listProposals({})) as OrganizerProposal[];
    expect(after[0]?.title).toBe(titleBefore);

    const sync = await store.getAirtableSyncState();
    expect(sync.health).toBe("delayed");
  });

  it("forbids reviewers from Airtable admin endpoints", async () => {
    const status = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/integrations/airtable`,
      undefined,
      env,
    );
    expect(status.status).toBe(403);
  });
});

describe("Ticket 10 authenticated HTTP API v1", () => {
  beforeAll(async () => {
    await seedEvent();
  });

  it("rejects unauthenticated v1 access", async () => {
    const response = await anonymousApp.request(
      "https://chartstead.test/api/v1/events",
      undefined,
      env,
    );
    expect(response.status).toBe(401);
  });

  it("authenticates with bearer API keys and returns stable ChartStead identifiers", async () => {
    const denied = await bearerApp.request(
      "https://chartstead.test/api/v1/events",
      {
        headers: { authorization: "Bearer cs_live_wrong" },
      },
      env,
    );
    expect(denied.status).toBe(401);

    const ok = await bearerApp.request(
      "https://chartstead.test/api/v1/events",
      {
        headers: { authorization: "Bearer cs_live_test_token_ok" },
      },
      env,
    );
    expect(ok.status).toBe(200);
    const body = await ok.json<{
      events: Array<{ id: string }>;
      principal: OrganizerPrincipal;
    }>();
    expect(body.principal.id).toBe(apiKeyPrincipal.id);
    expect(body.events.some((event) => event.id === eventId)).toBe(true);
  });

  it("covers vertical-slice resources with role-aware authorization", async () => {
    const headers = { authorization: "Bearer cs_live_test_token_ok" };

    const submissions = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      { headers },
      env,
    );
    expect(submissions.status).toBe(200);
    const submissionBody = await submissions.json<{
      submissions: OrganizerProposal[];
    }>();
    expect(submissionBody.submissions.length).toBeGreaterThan(0);
    expect(submissionBody.submissions[0]?.id).toMatch(/^SUB-/);

    const first = submissionBody.submissions[0]!;
    const one = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/${first.id}`,
      { headers },
      env,
    );
    expect(one.status).toBe(200);
    const oneBody = await one.json<{ submission: OrganizerProposal }>();
    expect(oneBody.submission.id).toBe(first.id);
    // Organizer API may include committee fields for admins; reviewers must not see other tracks.
    expect(oneBody.submission).toHaveProperty("committeeNote");

    const forms = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/forms`,
      { headers },
      env,
    );
    expect(forms.status).toBe(200);
    const formBody = await forms.json<{ forms: Array<{ id: string }> }>();
    expect(formBody.forms.length).toBeGreaterThan(0);

    const speakers = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/speakers`,
      { headers },
      env,
    );
    expect(speakers.status).toBe(200);
    const speakerBody = await speakers.json<{ speakers: Array<{ id: string }> }>();
    expect(Array.isArray(speakerBody.speakers)).toBe(true);

    const sessions = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/sessions`,
      { headers },
      env,
    );
    expect(sessions.status).toBe(200);
    const sessionBody = await sessions.json<AgendaWorkspaceResponse>();
    expect(sessionBody).toHaveProperty("sessions");

    const tasks = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/tasks`,
      { headers },
      env,
    );
    expect(tasks.status).toBe(200);

    const communications = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/communications`,
      { headers },
      env,
    );
    expect(communications.status).toBe(200);

    const program = await bearerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/program`,
      { headers },
      env,
    );
    expect(program.status).toBe(200);
  });

  it("scopes reviewer submission lists to assigned tracks and hides off-track detail", async () => {
    const list = await reviewerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      undefined,
      env,
    );
    expect(list.status).toBe(200);
    const body = await list.json<{ submissions: OrganizerProposal[] }>();
    expect(body.submissions.every((row) => row.trackId === "platform")).toBe(true);

    const adminList = await adminApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      undefined,
      env,
    );
    const all = await adminList.json<{ submissions: OrganizerProposal[] }>();
    const offTrack = all.submissions.find((row) => row.trackId !== "platform");
    if (offTrack) {
      const denied = await reviewerApp.request(
        `https://chartstead.test/api/v1/events/${eventId}/submissions/${offTrack.id}`,
        undefined,
        env,
      );
      expect(denied.status).toBe(404);
    }

    const speakersDenied = await reviewerApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/speakers`,
      undefined,
      env,
    );
    expect(speakersDenied.status).toBe(403);
  });

  it("applies review decisions through the v1 API without leaking public-only shapes", async () => {
    const list = await adminApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      undefined,
      env,
    );
    const body = await list.json<{ submissions: OrganizerProposal[] }>();
    const target = body.submissions.find((row) => row.status === "unreviewed") ?? body.submissions[0];
    expect(target).toBeTruthy();

    const patched = await adminApp.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/${target!.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "maybe",
          committeeNote: "v1 review note",
          expectedVersion: target!.reviewVersion,
        }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    const reviewBody = await patched.json<{ submission: OrganizerProposal }>();
    expect(reviewBody.submission.id).toBe(target!.id);
    expect(reviewBody.submission.status).toBe("maybe");
    expect(reviewBody.submission.committeeNote).toBe("v1 review note");
  });
});
