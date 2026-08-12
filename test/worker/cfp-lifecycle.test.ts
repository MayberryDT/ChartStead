import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CfpDefinitionV1 } from "../../shared/cfp-definition";
import type { OrganizerCfpForm, SubmissionAnswers } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-21-signing-secret-long-enough";
let nowMs = Date.parse("2030-06-01T18:00:00.000Z");

const admin = {
  id: "ticket-21-admin",
  displayName: "Lifecycle Administrator",
  role: "admin" as const,
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "admin" as const },
};

const app = createApp({
  resolvePrincipal: async () => admin,
  signingSecret,
  lifecycleNow: () => new Date(nowMs),
});

function answers(title: string): SubmissionAnswers {
  return {
    title,
    abstract: "An exact-boundary lifecycle acceptance proposal.",
    trackId: "platform",
    sessionFormat: "talk",
    speakers: [
      {
        name: "Boundary Speaker",
        email: "boundary.speaker@example.test",
        biography: "Lifecycle acceptance biography.",
      },
    ],
    supportingLink: "",
  };
}

async function createForm(name: string): Promise<OrganizerCfpForm> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/forms`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json<{ form: OrganizerCfpForm }>()).form;
}

async function publishSchedule(
  form: OrganizerCfpForm,
  opensAt: string | null,
  closesAt: string | null,
): Promise<OrganizerCfpForm> {
  const draft: CfpDefinitionV1 = { ...form.draft, opensAt, closesAt };
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/forms/${form.id}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft }),
    },
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json<{ form: OrganizerCfpForm }>()).form;
}

describe("Ticket 21 CFP opening and closing lifecycle", () => {
  beforeAll(async () => {
    const response = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("keeps scheduled draft settings private until publish and exposes the event timezone", async () => {
    nowMs = Date.parse("2030-06-01T18:00:00.000Z");
    const form = await publishSchedule(
      await createForm("Ticket 21 draft boundary"),
      null,
      null,
    );
    const opensAt = "2030-06-01T19:00:00.000Z";
    const closesAt = "2030-06-01T20:00:00.000Z";
    const draft = { ...form.draft, opensAt, closesAt };

    const save = await app.request(
      `https://chartstead.test/api/events/${eventId}/forms/${form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(save.status).toBe(200);

    const stillLive = await app.request(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${form.id}`,
      undefined,
      env,
    );
    expect(stillLive.status).toBe(200);
    await expect(stillLive.json()).resolves.toMatchObject({
      lifecycle: { state: "open", opensAt: null, closesAt: null },
    });

    const organizer = await app.request(
      `https://chartstead.test/api/events/${eventId}/forms/${form.id}`,
      undefined,
      env,
    );
    await expect(organizer.json()).resolves.toMatchObject({
      event: { timezone: "America/Los_Angeles" },
      form: {
        draft: { opensAt, closesAt },
        publishedDefinition: { opensAt: null, closesAt: null },
      },
    });

    const publish = await app.request(
      `https://chartstead.test/api/events/${eventId}/forms/${form.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(publish.status).toBe(200);

    const scheduled = await app.request(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${form.id}`,
      undefined,
      env,
    );
    expect(scheduled.status).toBe(425);
    await expect(scheduled.json()).resolves.toMatchObject({
      status: "scheduled",
      error: `This call for proposals opens at ${opensAt}.`,
      lifecycle: {
        state: "scheduled",
        deadlineAt: opensAt,
        opensAt,
        closesAt,
        timezone: "America/Los_Angeles",
        evaluatedAt: "2030-06-01T18:00:00.000Z",
      },
    });
  });

  it("enforces exact open and close instants against stale and direct HTTP writes", async () => {
    const opensAt = "2030-06-01T19:00:00.000Z";
    const closesAt = "2030-06-01T20:00:00.000Z";
    const form = await publishSchedule(
      await createForm("Ticket 21 exact instant"),
      opensAt,
      closesAt,
    );
    const publicUrl = `https://chartstead.test/api/events/${eventId}/cfp?formId=${form.id}`;

    nowMs = Date.parse(opensAt) - 1;
    expect((await app.request(publicUrl, undefined, env)).status).toBe(425);
    const preOpenDirectPost = await app.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.120",
        },
        body: JSON.stringify({
          formId: form.id,
          formDefinitionVersion: form.publishedVersion,
          answers: answers("Pre-open bypass attempt"),
        }),
      },
      env,
    );
    expect(preOpenDirectPost.status).toBe(409);
    await expect(preOpenDirectPost.json()).resolves.toMatchObject({
      status: "scheduled",
      lifecycle: { state: "scheduled", opensAt },
    });

    nowMs = Date.parse(opensAt);
    const exactOpen = await app.request(publicUrl, undefined, env);
    expect(exactOpen.status).toBe(200);
    await expect(exactOpen.json()).resolves.toMatchObject({
      lifecycle: {
        state: "open",
        deadlineAt: closesAt,
        evaluatedAt: opensAt,
      },
    });

    nowMs = Date.parse(closesAt) - 1;
    const stalePage = await app.request(publicUrl, undefined, env);
    expect(stalePage.status).toBe(200);
    const stale = await stalePage.json<{ form: { definitionVersion: number } }>();
    const submitted = await app.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.121",
        },
        body: JSON.stringify({
          formId: form.id,
          formDefinitionVersion: stale.form.definitionVersion,
          answers: answers("Just before close"),
        }),
      },
      env,
    );
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json<{ proposal: { id: string } }>();
    const store = env.EVENT_STORE.getByName(eventId);
    const outbox = await store.listOutboxMessages(submittedBody.proposal.id);
    const bodies = await store.getOutboxBodies(outbox[0]!.id);
    const token = bodies?.text.match(/\/edit\/([^\s]+)/)?.[1];
    expect(token).toBeTruthy();

    nowMs = Date.parse(closesAt);
    const exactClose = await app.request(publicUrl, undefined, env);
    expect(exactClose.status).toBe(410);
    await expect(exactClose.json()).resolves.toMatchObject({
      status: "closed",
      error: `This call for proposals closed at ${closesAt}.`,
      lifecycle: { state: "closed", evaluatedAt: closesAt },
    });

    const staleDirectPost = await app.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.122",
        },
        body: JSON.stringify({
          formId: form.id,
          formDefinitionVersion: stale.form.definitionVersion,
          answers: answers("Stale page bypass attempt"),
        }),
      },
      env,
    );
    expect(staleDirectPost.status).toBe(409);
    await expect(staleDirectPost.json()).resolves.toMatchObject({
      error: `This call for proposals closed at ${closesAt}.`,
      lifecycle: { state: "closed", closesAt },
    });

    const editSession = await app.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(token!)}`,
      undefined,
      env,
    );
    expect(editSession.status).toBe(410);
    await expect(editSession.json()).resolves.toMatchObject({
      error: `This call for proposals closed at ${closesAt}.`,
      lifecycle: { state: "closed" },
    });

    const editWrite = await app.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${submittedBody.proposal.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-submitter-token": token!,
        },
        body: JSON.stringify({ answers: answers("Closed edit bypass attempt") }),
      },
      env,
    );
    expect(editWrite.status).toBe(409);
  });

  it("persists deliberate reopen and close overrides across Durable Object eviction", async () => {
    const closesAt = "2030-06-01T20:00:00.000Z";
    nowMs = Date.parse(closesAt) + 60_000;
    const form = await publishSchedule(
      await createForm("Ticket 21 deliberate override"),
      null,
      closesAt,
    );
    const publicUrl = `https://chartstead.test/api/events/${eventId}/cfp?formId=${form.id}`;
    expect((await app.request(publicUrl, undefined, env)).status).toBe(410);

    const reopen = await app.request(
      `https://chartstead.test/api/events/${eventId}/forms/${form.id}/reopen`,
      { method: "POST" },
      env,
    );
    expect(reopen.status).toBe(200);
    expect((await app.request(publicUrl, undefined, env)).status).toBe(200);

    await evictDurableObject(env.EVENT_STORE.getByName(eventId));
    expect((await app.request(publicUrl, undefined, env)).status).toBe(200);

    const close = await app.request(
      `https://chartstead.test/api/events/${eventId}/forms/${form.id}/close`,
      { method: "POST" },
      env,
    );
    expect(close.status).toBe(200);
    await evictDurableObject(env.EVENT_STORE.getByName(eventId));
    expect((await app.request(publicUrl, undefined, env)).status).toBe(410);
  });

  it("rejects malformed or reversed schedules before saving them", async () => {
    const form = await createForm("Ticket 21 invalid schedule");
    for (const draft of [
      { ...form.draft, opensAt: "not-an-instant", closesAt: null },
      {
        ...form.draft,
        opensAt: "2030-06-01T20:00:00.000Z",
        closesAt: "2030-06-01T20:00:00.000Z",
      },
    ]) {
      const response = await app.request(
        `https://chartstead.test/api/events/${eventId}/forms/${form.id}/draft`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft }),
        },
        env,
      );
      expect(response.status).toBe(400);
    }
  });
});
