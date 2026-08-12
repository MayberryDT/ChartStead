import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  addQuestion,
  canonicalizeCfpDefinition,
  createDefaultCfpDefinition,
  type CfpDefinitionV1,
  updateQuestion,
  updateSpeakerSettings,
  updateWelcome,
} from "../../shared/cfp-definition";
import type { SubmissionAnswers } from "../../shared/events";
import { createApp, sanitizeUploadFileName } from "../../worker/app";
import type { EmailSender } from "../../worker/email";
import { flushEventOutbox } from "../../worker/outbox";
import { signEditToken } from "../../worker/signed-links";

const signingSecret = "test-signing-secret-for-ticket-03";

function mainCfpAnswers(
  overrides: SubmissionAnswers = {},
): SubmissionAnswers {
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

function createMemorySender(log: Array<{ to: string; subject: string }>): EmailSender {
  return {
    async send(message) {
      log.push({ to: message.to, subject: message.subject });
    },
  };
}

const sent: Array<{ to: string; subject: string }> = [];

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
  emailSender: createMemorySender(sent),
  signingSecret,
});

describe("guided CFP publishing and submitter follow-up", () => {
  it("derives protected track choices from the event when saving a draft", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Protected tracks" }),
      },
      env,
    );
    const created = await create.json<{
      form: { id: string; draft: CfpDefinitionV1 };
    }>();
    const tamperedDraft = updateQuestion(created.form.draft, "trackId", {
      choices: [{ value: "not-a-track", text: "Not a track" }],
    });

    const save = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: tamperedDraft }),
      },
      env,
    );

    expect(save.status).toBe(200);
    const saved = await save.json<{ form: { draft: CfpDefinitionV1 } }>();
    const trackQuestion = saved.form.draft.runtime.survey.elements.find(
      (element) => element.name === "trackId",
    );
    expect(trackQuestion).toMatchObject({
      type: "dropdown",
      choices: [
        { value: "platform", text: "Platform" },
        { value: "program-ops", text: "Program Ops" },
        { value: "design-systems", text: "Design Systems" },
        { value: "community", text: "Community" },
        { value: "course-check-demo", text: "Course Check Demo" },
      ],
    });
  });

  it("creates multiple named forms and keeps draft edits off the live published snapshot until republish", async () => {
    const eventId = "pacific-open-data-summit-2026";

    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Lightning talks" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      form: {
        id: string;
        name: string;
        lifecycleStatus: string;
        draft: CfpDefinitionV1;
      };
    }>();
    expect(created.form).toMatchObject({
      name: "Lightning talks",
      lifecycleStatus: "draft",
    });
    expect(created.form.draft.schemaVersion).toBe(1);
    expect(created.form.draft.runtime.engine).toBe("surveyjs");

    const list = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      undefined,
      env,
    );
    const listed = await list.json<{
      forms: Array<{ id: string; name: string }>;
    }>();
    expect(listed.forms.map((form) => form.name)).toEqual(
      expect.arrayContaining(["Main CFP", "Lightning talks"]),
    );

    let draft = updateWelcome(created.form.draft, { title: "Lightning CFP" });
    draft = updateQuestion(draft, "title", { title: "Lightning title" });

    const save = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(save.status).toBe(200);
    const saved = await save.json<{ form: { draft: CfpDefinitionV1 } }>();
    expect(saved.form.draft.schemaVersion).toBe(1);
    expect(saved.form.draft.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Lightning title" }),
      ]),
    );

    const beforePublishPublic = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    expect(beforePublishPublic.status).toBe(404);

    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: {
        lifecycleStatus: string;
        publishedVersion: number;
        publishedDefinition: CfpDefinitionV1;
      };
    }>();
    expect(published.form.lifecycleStatus).toBe("published");
    expect(published.form.publishedVersion).toBe(1);
    expect(published.form.publishedDefinition.schemaVersion).toBe(1);
    expect(published.form.publishedDefinition.status).toBe("published");
    expect(published.form.publishedDefinition.definitionVersion).toBe(1);
    expect(published.form.publishedDefinition.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Lightning title" }),
      ]),
    );

    const publicOne = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    expect(publicOne.status).toBe(200);
    const publicBody = await publicOne.json<{
      form: {
        definitionVersion: number;
        definition: CfpDefinitionV1;
      };
    }>();
    expect(publicBody.form.definitionVersion).toBe(1);
    expect(publicBody.form.definition.schemaVersion).toBe(1);
    expect(publicBody.form.definition.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Lightning title" }),
      ]),
    );
    const versionOneSnapshot = JSON.stringify(publicBody.form.definition);

    draft = updateQuestion(draft, "title", { title: "Draft-only title" });
    const saveDraftAgain = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(saveDraftAgain.status).toBe(200);

    const publicStillOld = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    const stillOld = await publicStillOld.json<{
      form: {
        definitionVersion: number;
        definition: CfpDefinitionV1;
      };
    }>();
    expect(stillOld.form.definitionVersion).toBe(1);
    expect(JSON.stringify(stillOld.form.definition)).toBe(versionOneSnapshot);
    expect(stillOld.form.definition.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Lightning title" }),
      ]),
    );

    const republish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(republish.status).toBe(200);
    const publicTwo = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    const next = await publicTwo.json<{
      form: {
        definitionVersion: number;
        definition: CfpDefinitionV1;
      };
    }>();
    expect(next.form.definitionVersion).toBe(2);
    expect(next.form.definition.definitionVersion).toBe(2);
    expect(next.form.definition.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Draft-only title" }),
      ]),
    );

    const close = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/close`,
      { method: "POST" },
      env,
    );
    expect(close.status).toBe(200);
    const closedPublic = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    expect(closedPublic.status).toBe(410);
    const closedBody = await closedPublic.json<{
      status: string;
      error: string;
      formId: string;
    }>();
    expect(closedBody).toMatchObject({
      status: "closed",
      formId: created.form.id,
    });
    expect(closedBody.error).toMatch(/closed/i);

    const reopen = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/reopen`,
      { method: "POST" },
      env,
    );
    expect(reopen.status).toBe(200);
    const reopenedPublic = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    expect(reopenedPublic.status).toBe(200);
  });

  it("queues and sends branded confirmation email with delivery state", async () => {
    sent.length = 0;
    const eventId = "ai-engineer-worlds-fair-2026";
    const hostileName = "<script>alert(1)</script>";
    const response = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.10",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Confirmation mail proposal",
            abstract: "Checks outbox delivery state.",
            trackId: "agents",
            speakers: [
              {
                name: hostileName,
                email: "mail-speaker@example.com",
                biography: "A speaker biography.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json<{
      proposal: { id: string };
      confirmationEmailStatus: string;
    }>();
    expect(body.confirmationEmailStatus).toBe("sent");
    expect(sent).toEqual([
      expect.objectContaining({
        to: "mail-speaker@example.com",
        subject: expect.stringContaining("Confirmation mail proposal"),
      }),
    ]);

    const store = env.EVENT_STORE.getByName(eventId);
    const messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages).toEqual([
      expect.objectContaining({
        status: "sent",
        toEmail: "mail-speaker@example.com",
        attemptCount: 1,
      }),
    ]);
    const content = await store.getOutboxBodies(messages[0]!.id);
    expect(content?.html.match(/Edit your proposal/g)).toHaveLength(1);
    expect(content?.html).toContain("ChartStead");
    expect(content?.html).toContain(body.proposal.id);
    expect(content?.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(content?.html).not.toContain("<script>alert(1)</script>");
    expect(content?.text).toContain(body.proposal.id);
    expect(content?.text).toContain("Edit your proposal:");
  });

  it("keeps confirmation email queued when Resend is not configured", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const noResendApp = createApp({
      signingSecret,
      emailSender: null,
    });
    const response = await noResendApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.91",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Queued without Resend",
            abstract: "Must stay queued when transport is missing.",
            speakers: [
              {
                name: "Queue Speaker",
                email: "queue-speaker@example.com",
                biography: "Biography for missing-resend tests.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json<{
      proposal: { id: string };
      confirmationEmailStatus: string;
    }>();
    expect(body.confirmationEmailStatus).toBe("queued");

    const store = env.EVENT_STORE.getByName(eventId);
    const messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages).toEqual([
      expect.objectContaining({
        status: "queued",
        attemptCount: 0,
        toEmail: "queue-speaker@example.com",
      }),
    ]);
  });

  it("rejects stale draft saves with CAS expectedDraftUpdatedAt", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const createdRes = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "CAS Form" }),
      },
      env,
    );
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json<{
      form: { id: string; draftUpdatedAt: string; draft: CfpDefinitionV1 };
    }>();
    const formId = created.form.id;
    const t0 = created.form.draftUpdatedAt;

    let draft = updateWelcome(created.form.draft, {
      title: "First writer",
      body: "A",
    });
    const first = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft,
          expectedDraftUpdatedAt: t0,
        }),
      },
      env,
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json<{ form: { draftUpdatedAt: string } }>();

    const stale = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: updateWelcome(created.form.draft, {
            title: "Stale writer",
            body: "B",
          }),
          expectedDraftUpdatedAt: t0,
        }),
      },
      env,
    );
    expect(stale.status).toBe(409);

    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: updateWelcome(created.form.draft, {
            title: "Published title",
            body: "C",
          }),
          expectedDraftUpdatedAt: firstBody.form.draftUpdatedAt,
        }),
      },
      env,
    );
    expect(publish.status).toBe(200);
  });

  it("reclaims confirmation emails stuck in sending after interruption", async () => {
    const failSender: EmailSender = {
      async send() {
        throw new Error("worker interrupted before ack");
      },
    };
    const reclaimApp = createApp({
      signingSecret,
      emailSender: failSender,
    });
    const eventId = "ai-engineer-worlds-fair-2026";
    const response = await reclaimApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.94",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Interrupted delivery proposal",
            abstract: "Stale sending must be reclaimed.",
            trackId: "agents",
            speakers: [
              {
                name: "Stuck Speaker",
                email: "stuck-sending@example.com",
                biography: "Biography for reclaim tests.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json<{
      proposal: { id: string };
      confirmationEmailStatus: string;
    }>();
    expect(body.confirmationEmailStatus).toBe("failed");
    const store = env.EVENT_STORE.getByName(eventId);
    const messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]?.status).toBe("failed");
    expect(messages[0]?.nextAttemptAt).toBeTruthy();
    const messageId = messages[0]!.id;
    const claimAt = messages[0]!.nextAttemptAt!;

    // Claim for delivery then abandon the in-flight attempt (Worker death).
    const claimed = await store.claimOutboxForDelivery(messageId, claimAt);
    expect(claimed?.status).toBe("sending");
    expect(claimed?.updatedAt).toBe(claimAt);

    const successSender: EmailSender = {
      async send() {
        /* reclaimed delivery succeeds */
      },
    };
    const later = new Date(new Date(claimAt).getTime() + 3 * 60_000);
    const result = await flushEventOutbox({
      store,
      sender: successSender,
      now: later,
      limit: 10,
    });
    expect(result.sent).toBe(1);
    const after = await store.listOutboxMessages(body.proposal.id);
    expect(after[0]?.status).toBe("sent");
  });

  it("retries failed confirmation delivery on the bounded schedule", async () => {
    let attempts = 0;
    const flakySender: EmailSender = {
      async send() {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary provider failure");
        }
      },
    };
    const retryApp = createApp({
      signingSecret,
      emailSender: flakySender,
    });
    const eventId = "ai-engineer-worlds-fair-2026";
    const t0 = Date.now();

    const response = await retryApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.92",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Retry schedule proposal",
            abstract: "Fails twice then succeeds on the third attempt.",
            trackId: "agents",
            speakers: [
              {
                name: "Retry Speaker",
                email: "retry-speaker@example.com",
                biography: "Biography for retry tests.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json<{
      proposal: { id: string };
      confirmationEmailStatus: string;
    }>();
    expect(body.confirmationEmailStatus).toBe("failed");
    expect(attempts).toBe(1);

    const store = env.EVENT_STORE.getByName(eventId);
    let messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({
      status: "failed",
      attemptCount: 1,
    });
    expect(messages[0]!.nextAttemptAt).toBeTruthy();

    const afterOneMinute = new Date(t0 + 60_000 + 1_000);
    await flushEventOutbox({
      store,
      sender: flakySender,
      now: afterOneMinute,
      limit: 10,
    });
    messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({
      status: "failed",
      attemptCount: 2,
    });
    expect(attempts).toBe(2);

    const afterFiveMoreMinutes = new Date(t0 + 60_000 + 5 * 60_000 + 2_000);
    await flushEventOutbox({
      store,
      sender: flakySender,
      now: afterFiveMoreMinutes,
      limit: 10,
    });
    messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({
      status: "sent",
      attemptCount: 3,
      toEmail: "retry-speaker@example.com",
    });
    expect(attempts).toBe(3);
    expect(messages[0]!.nextAttemptAt).toBeNull();
  });

  it("schedules the 12h retry delay before terminal outbox failure", async () => {
    const alwaysFail: EmailSender = {
      async send() {
        throw new Error("provider down");
      },
    };
    const failApp = createApp({
      signingSecret,
      emailSender: alwaysFail,
    });
    const eventId = "ai-engineer-worlds-fair-2026";
    const twelveHoursMs = 12 * 60 * 60_000;

    const response = await failApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.93",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Terminal retry schedule proposal",
            abstract: "Exhausts every bounded retry delay then stays failed.",
            trackId: "agents",
            speakers: [
              {
                name: "Terminal Speaker",
                email: "terminal-retry@example.com",
                biography: "Biography for terminal retry tests.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json<{ proposal: { id: string } }>();
    const store = env.EVENT_STORE.getByName(eventId);

    // Walk attempts 1→4 failures (delays 1m/5m/30m/2h) until the 5th failure can use 12h.
    const advancePastNext = async () => {
      const current = (await store.listOutboxMessages(body.proposal.id))[0]!;
      expect(current.nextAttemptAt).toBeTruthy();
      const now = new Date(new Date(current.nextAttemptAt!).getTime() + 1_000);
      await flushEventOutbox({
        store,
        sender: alwaysFail,
        now,
        limit: 10,
      });
      return now;
    };

    let messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({ status: "failed", attemptCount: 1 });
    expect(messages[0]!.nextAttemptAt).toBeTruthy();

    await advancePastNext(); // 2nd failure → 5m
    await advancePastNext(); // 3rd failure → 30m
    await advancePastNext(); // 4th failure → 2h

    messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({ status: "failed", attemptCount: 4 });
    const nowForFifth = await advancePastNext(); // 5th failure → 12h

    messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({ status: "failed", attemptCount: 5 });
    expect(messages[0]!.nextAttemptAt).toBe(
      new Date(nowForFifth.getTime() + twelveHoursMs).toISOString(),
    );

    await advancePastNext(); // 6th failure → terminal
    messages = await store.listOutboxMessages(body.proposal.id);
    expect(messages[0]).toMatchObject({
      status: "failed",
      attemptCount: 6,
      nextAttemptAt: null,
    });
  });

  it("authorizes signed submitter edit links and rejects invalid, expired, or revoked tokens", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const submit = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.44",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Editable proposal",
            abstract: "Can be edited through a signed link.",
            trackId: "platform",
            sessionFormat: "workshop",
            workshopDuration: "90 minutes",
            speakers: [
              {
                name: "Edit Speaker",
                email: "edit@example.com",
                biography: "Biography for edit tests.",
              },
              {
                name: "Co Speaker",
                email: "co@example.com",
                biography: "Co-speaker biography.",
              },
            ],
            supportingLink: "https://example.com/slides",
          }),
        }),
      },
      env,
    );
    expect(submit.status).toBe(201);
    const created = await submit.json<{ proposal: { id: string } }>();
    const store = env.EVENT_STORE.getByName(eventId);
    const messages = await store.listOutboxMessages(created.proposal.id);
    const bodies = await store.getOutboxBodies(messages[0]!.id);
    const tokenMatch = bodies?.text.match(/\/edit\/([^\s]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = tokenMatch![1]!;

    const organizerDetail = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${created.proposal.id}`,
      undefined,
      env,
    );
    expect(organizerDetail.status).toBe(200);
    const organizerBody = await organizerDetail.json<{
      proposal: { committeeNote: string };
    }>();
    expect(organizerBody.proposal).toHaveProperty("committeeNote");

    const session = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(token)}`,
      undefined,
      env,
    );
    expect(session.status).toBe(200);
    const sessionBody = await session.json<Record<string, unknown>>();
    expect(sessionBody).toMatchObject({
      eventId,
      proposalId: created.proposal.id,
      answers: expect.objectContaining({
        trackId: "platform",
        sessionFormat: "workshop",
        workshopDuration: "90 minutes",
        speakers: expect.any(Array),
      }),
      form: expect.objectContaining({ definitionVersion: 1 }),
      proposal: {
        id: created.proposal.id,
        title: "Editable proposal",
        speakerEmail: "edit@example.com",
      },
    });
    expect(sessionBody).not.toHaveProperty("proposal.committeeNote");
    expect(sessionBody).not.toHaveProperty("proposal.privateNote");
    expect(JSON.stringify(sessionBody)).not.toContain("Committee only");
    expect(JSON.stringify(sessionBody)).not.toContain("committeeNote");
    expect(JSON.stringify(sessionBody)).not.toContain("privateNote");

    const patched = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${created.proposal.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-submitter-token": token,
        },
        body: JSON.stringify({
          answers: mainCfpAnswers({
            title: "Edited proposal title",
            abstract: "Can be edited through a signed link.",
            trackId: "platform",
            sessionFormat: "workshop",
            workshopDuration: "90 minutes",
            speakers: [
              {
                name: "Edit Speaker",
                email: "edit@example.com",
                biography: "Biography for edit tests.",
              },
              {
                name: "Co Speaker",
                email: "co@example.com",
                biography: "Co-speaker biography.",
              },
            ],
            supportingLink: "https://example.com/slides",
          }),
        }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({
      proposal: { id: created.proposal.id, title: "Edited proposal title" },
    });

    const invalid = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=not-a-token`,
      undefined,
      env,
    );
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      error: expect.stringContaining("invalid"),
    });
    const invalidBody = await (
      await demoApp.request(
        `https://chartstead.test/api/events/${eventId}/submitter/edit?token=not-a-token`,
        undefined,
        env,
      )
    ).json<{ proposal?: unknown }>();
    expect(invalidBody).not.toHaveProperty("proposal");

    const malformed = "e30.%%%";
    const malformedGet = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(malformed)}`,
      undefined,
      env,
    );
    expect(malformedGet.status).toBe(401);
    await expect(malformedGet.json()).resolves.toEqual({
      error: "This edit link is invalid or has expired.",
    });

    const malformedPatch = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${created.proposal.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-submitter-token": malformed,
        },
        body: JSON.stringify({
          answers: mainCfpAnswers({
            title: "Should not apply",
          }),
        }),
      },
      env,
    );
    expect(malformedPatch.status).toBe(401);
    await expect(malformedPatch.json()).resolves.toEqual({
      error: "This edit link is invalid or has expired.",
    });

    const expiredToken = await signEditToken(signingSecret, {
      v: 1,
      eventId,
      proposalId: created.proposal.id,
      tokenId: "expired-token",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    await store.createEditToken({
      tokenId: "expired-token",
      proposalId: created.proposal.id,
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });
    const expired = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(expiredToken)}`,
      undefined,
      env,
    );
    expect(expired.status).toBe(401);

    const revocableTokenId = "revoke-me";
    const revocable = await signEditToken(signingSecret, {
      v: 1,
      eventId,
      proposalId: created.proposal.id,
      tokenId: revocableTokenId,
      exp: Math.floor(Date.now() / 1000) + 3_600,
    });
    await store.createEditToken({
      tokenId: revocableTokenId,
      proposalId: created.proposal.id,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await store.revokeEditToken(revocableTokenId);
    const revoked = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(revocable)}`,
      undefined,
      env,
    );
    expect(revoked.status).toBe(401);
  });

  it("rejects submission when signing secret is missing without creating a proposal", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const noSecretApp = createApp({ signingSecret: "", emailSender: null });
    const store = env.EVENT_STORE.getByName(eventId);
    const before = await store.listProposals();

    const response = await noSecretApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.77",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "No secret proposal",
            abstract: "Must not persist without a signing secret.",
            speakers: [
              {
                name: "No Secret",
                email: "nosecret@example.com",
                biography: "Biography for missing-secret tests.",
              },
            ],
          }),
        }),
      },
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Proposal editing is temporarily unavailable. Try again later.",
    });
    const after = await store.listProposals();
    expect(after).toHaveLength(before.length);
  });

  it("accepts upload replacement with limits and recoverable failure", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const uploadStartBody = {
      formId: "main-cfp",
      formDefinitionVersion: 1,
      questionName: "supportingFile",
      fileName: "notes.pdf",
      mime: "application/pdf",
      sizeBytes: 12,
    };
    const start = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(uploadStartBody),
      },
    );
    expect(start.status).toBe(200);
    const started = await start.json<{
      upload: { assetId: string; uploadUrl: string; maxBytes: number };
    }>();
    expect(started.upload.maxBytes).toBeGreaterThan(0);

    const put = await SELF.fetch(
      `https://chartstead.test${started.upload.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "content-length": "12",
        },
        body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      },
    );
    expect(put.status).toBe(200);
    const completed = await put.json<{
      asset: { assetId: string; status: string; name: string };
    }>();
    expect(completed.asset).toMatchObject({
      assetId: started.upload.assetId,
      status: "complete",
      name: "notes.pdf",
    });

    const tooLargeStart = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...uploadStartBody,
          fileName: "huge.pdf",
          sizeBytes: 20 * 1024 * 1024,
        }),
      },
    );
    expect(tooLargeStart.status).toBe(400);

    const retryStart = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...uploadStartBody,
          fileName: "retry.pdf",
          sizeBytes: 4,
        }),
      },
    );
    const retry = await retryStart.json<{
      upload: { assetId: string; uploadUrl: string };
    }>();
    const wrongLength = await SELF.fetch(
      `https://chartstead.test${retry.upload.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "content-length": "999",
        },
        body: new Uint8Array([9, 9, 9, 9]),
      },
    );
    expect(wrongLength.status).toBe(400);

    const recovered = await SELF.fetch(
      `https://chartstead.test${retry.upload.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "content-length": "4",
        },
        body: new Uint8Array([9, 9, 9, 9]),
      },
    );
    expect(recovered.status).toBe(200);

    const failThenRetryStart = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...uploadStartBody,
          fileName: "failed-retry.pdf",
          sizeBytes: 3,
        }),
      },
    );
    expect(failThenRetryStart.status).toBe(200);
    const failThenRetry = await failThenRetryStart.json<{
      upload: { assetId: string; uploadUrl: string };
    }>();
    const store = env.EVENT_STORE.getByName(eventId);
    await store.failAsset(failThenRetry.upload.assetId);
    const afterFail = await store.getAsset(failThenRetry.upload.assetId);
    expect(afterFail?.status).toBe("failed");
    const retriedAfterFail = await SELF.fetch(
      `https://chartstead.test${failThenRetry.upload.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "content-length": "3",
        },
        body: new Uint8Array([1, 2, 3]),
      },
    );
    expect(retriedAfterFail.status).toBe(200);
    const retriedAsset = await retriedAfterFail.json<{
      asset: { assetId: string; status: string };
    }>();
    expect(retriedAsset.asset).toMatchObject({
      assetId: failThenRetry.upload.assetId,
      status: "complete",
    });
  });

  it("binds uploads to form version and question policy with claim integrity", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.seedIfEmpty(
      (await store.getEvent()) ??
        ({
          id: eventId,
          name: "Pacific",
          startsOn: "2026-01-01",
          endsOn: "2026-01-02",
          submissionCount: 0,
          unreviewedCount: 0,
          tracks: [{ id: "platform", name: "Platform", proposalCount: 0 }],
          rooms: [],
        } as never),
    );

    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Upload integrity CFP" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      form: { id: string; draft: CfpDefinitionV1 };
    }>();
    let draft = addQuestion(created.form.draft, {
      type: "chartstead-file",
      name: "slides",
      title: "Slides",
      maxFileBytes: 1024,
      acceptMimeTypes: ["application/pdf"],
    });
    draft = updateSpeakerSettings(draft, {
      collectBiography: true,
    });
    // Nested speaker file field for question-name resolution.
    const speakers = draft.runtime.survey.elements.find(
      (element) => element.name === "speakers" && element.type === "paneldynamic",
    );
    if (speakers && speakers.type === "paneldynamic") {
      speakers.templateElements.push({
        type: "chartstead-file",
        name: "headshot",
        title: "Headshot",
        maxFileBytes: 2048,
        acceptMimeTypes: ["image/png", "image/jpeg"],
      });
      draft = {
        ...draft,
        chartstead: {
          ...draft.chartstead,
          uploadQuestionNames: [
            ...draft.chartstead.uploadQuestionNames,
            "speakers.headshot",
          ],
        },
      };
    }

    const save = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(save.status).toBe(200);
    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: { id: string; publishedVersion: number };
    }>();
    const formId = published.form.id;
    const formDefinitionVersion = published.form.publishedVersion;

    async function startUpload(body: Record<string, unknown>, ip = "203.0.113.40") {
      return SELF.fetch(`https://chartstead.test/api/events/${eventId}/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify(body),
      });
    }

    async function putBytes(
      uploadUrl: string,
      bytes: Uint8Array,
      headers: Record<string, string>,
    ) {
      return SELF.fetch(`https://chartstead.test${uploadUrl}`, {
        method: "PUT",
        headers,
        body: bytes as unknown as BodyInit,
      });
    }

    const baseStart = {
      formId,
      formDefinitionVersion,
      questionName: "supportingFile",
      fileName: "notes.pdf",
      mime: "application/pdf",
      sizeBytes: 4,
    };

    const disallowedMimeStart = await startUpload({
      ...baseStart,
      questionName: "slides",
      mime: "application/zip",
      fileName: "pack.zip",
    });
    expect(disallowedMimeStart.status).toBe(400);

    const questionOversizeStart = await startUpload({
      ...baseStart,
      questionName: "slides",
      sizeBytes: 2048,
    });
    expect(questionOversizeStart.status).toBe(400);

    const okStart = await startUpload(baseStart);
    expect(okStart.status).toBe(200);
    const okSession = await okStart.json<{
      upload: { assetId: string; uploadUrl: string; objectKey: string };
    }>();

    const missingLengthBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    });
    const missingLength = await SELF.fetch(
      new Request(`https://chartstead.test${okSession.upload.uploadUrl}`, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: missingLengthBody,
        // @ts-expect-error undici streaming body without Content-Length
        duplex: "half",
      }),
    );
    expect(missingLength.status).toBe(400);

    const wrongMime = await putBytes(
      okSession.upload.uploadUrl,
      new Uint8Array([1, 2, 3, 4]),
      { "content-type": "image/png", "content-length": "4" },
    );
    expect(wrongMime.status).toBe(400);

    const wrongLength = await putBytes(
      okSession.upload.uploadUrl,
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      { "content-type": "application/pdf", "content-length": "8" },
    );
    expect(wrongLength.status).toBe(400);

    const completePut = await putBytes(
      okSession.upload.uploadUrl,
      new Uint8Array([1, 2, 3, 4]),
      { "content-type": "application/pdf", "content-length": "4" },
    );
    expect(completePut.status).toBe(200);
    const completeAsset = await completePut.json<{
      asset: {
        assetId: string;
        objectKey: string;
        name: string;
        mime: string;
        size: number;
        status: string;
      };
    }>();

    const overwriteComplete = await putBytes(
      okSession.upload.uploadUrl,
      new Uint8Array([9, 9, 9, 9]),
      { "content-type": "application/pdf", "content-length": "4" },
    );
    expect(overwriteComplete.status).toBe(400);

    const answersWithAsset = mainCfpAnswers({
      title: "Upload claim proposal",
      speakers: [
        {
          name: "Upload Speaker",
          email: "upload-claim@example.com",
          biography: "Biography for upload claim tests.",
        },
      ],
      supportingFile: {
        assetId: completeAsset.asset.assetId,
        objectKey: completeAsset.asset.objectKey,
        name: completeAsset.asset.name,
        mime: completeAsset.asset.mime,
        size: completeAsset.asset.size,
        status: "complete" as const,
      },
    });

    const firstSubmit = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.41",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: answersWithAsset,
        }),
      },
      env,
    );
    expect(firstSubmit.status).toBe(201);

    const reusedCompleteAssetForAnotherProposal = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.42",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: mainCfpAnswers({
            title: "Reuse stolen asset",
            speakers: [
              {
                name: "Thief",
                email: "thief@example.com",
                biography: "Should not claim another proposal asset.",
              },
            ],
            supportingFile: answersWithAsset.supportingFile,
          }),
        }),
      },
      env,
    );
    expect(reusedCompleteAssetForAnotherProposal.status).toBe(400);

    const fabricatedAssetSubmission = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.43",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: mainCfpAnswers({
            title: "Fabricated asset",
            speakers: [
              {
                name: "Fake",
                email: "fake@example.com",
                biography: "Fabricated upload answer.",
              },
            ],
            supportingFile: {
              assetId: "asset-does-not-exist",
              objectKey: `${eventId}/asset-does-not-exist/notes.pdf`,
              name: "notes.pdf",
              mime: "application/pdf",
              size: 4,
              status: "complete",
            },
          }),
        }),
      },
      env,
    );
    expect(fabricatedAssetSubmission.status).toBe(400);

    const slidesStart = await startUpload({
      ...baseStart,
      questionName: "slides",
      fileName: "deck.pdf",
      sizeBytes: 3,
    });
    expect(slidesStart.status).toBe(200);
    const slidesSession = await slidesStart.json<{
      upload: { assetId: string; uploadUrl: string; objectKey: string };
    }>();
    const slidesPut = await putBytes(
      slidesSession.upload.uploadUrl,
      new Uint8Array([1, 2, 3]),
      { "content-type": "application/pdf", "content-length": "3" },
    );
    expect(slidesPut.status).toBe(200);
    const slidesAsset = await slidesPut.json<{
      asset: {
        assetId: string;
        objectKey: string;
        name: string;
        mime: string;
        size: number;
      };
    }>();

    const wrongQuestionAssetSubmission = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.44",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: mainCfpAnswers({
            title: "Wrong question asset",
            speakers: [
              {
                name: "Wrong Q",
                email: "wrongq@example.com",
                biography: "Asset bound to slides, used as supportingFile.",
              },
            ],
            supportingFile: {
              assetId: slidesAsset.asset.assetId,
              objectKey: slidesAsset.asset.objectKey,
              name: slidesAsset.asset.name,
              mime: slidesAsset.asset.mime,
              size: slidesAsset.asset.size,
              status: "complete",
            },
          }),
        }),
      },
      env,
    );
    expect(wrongQuestionAssetSubmission.status).toBe(400);

    const v1AssetStart = await startUpload({
      ...baseStart,
      fileName: "v1.pdf",
      sizeBytes: 2,
    });
    const v1Session = await v1AssetStart.json<{
      upload: { assetId: string; uploadUrl: string; objectKey: string };
    }>();
    await putBytes(v1Session.upload.uploadUrl, new Uint8Array([7, 8]), {
      "content-type": "application/pdf",
      "content-length": "2",
    });
    const v1Asset = {
      assetId: v1Session.upload.assetId,
      objectKey: v1Session.upload.objectKey,
      name: "v1.pdf",
      mime: "application/pdf",
      size: 2,
      status: "complete" as const,
    };

    draft = updateQuestion(draft, "title", { title: "Version two title" });
    const saveV2 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(saveV2.status).toBe(200);
    const publishV2 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/publish`,
      { method: "POST" },
      env,
    );
    expect(publishV2.status).toBe(200);
    const publishedV2 = await publishV2.json<{
      form: { publishedVersion: number };
    }>();
    expect(publishedV2.form.publishedVersion).toBeGreaterThan(formDefinitionVersion);

    const wrongFormVersionAssetSubmission = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.45",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion: publishedV2.form.publishedVersion,
          answers: mainCfpAnswers({
            title: "Wrong form version asset",
            speakers: [
              {
                name: "Version",
                email: "version@example.com",
                biography: "Asset from older form version.",
              },
            ],
            supportingFile: v1Asset,
          }),
        }),
      },
      env,
    );
    expect(wrongFormVersionAssetSubmission.status).toBe(400);

    const rateIp = "203.0.113.99";
    let rateLimitedUploadStart: Response | null = null;
    for (let i = 0; i < 41; i += 1) {
      const response = await startUpload(
        {
          formId,
          formDefinitionVersion: publishedV2.form.publishedVersion,
          questionName: "supportingFile",
          fileName: `rate-${i}.pdf`,
          mime: "application/pdf",
          sizeBytes: 1,
        },
        rateIp,
      );
      if (response.status === 429) {
        rateLimitedUploadStart = response;
        break;
      }
    }
    expect(rateLimitedUploadStart?.status).toBe(429);
    expect(rateLimitedUploadStart?.headers.get("retry-after")).toBeTruthy();
  });

  it("publishes conditional workshop fields in the canonical runtime definition", async () => {
    const eventId = "ai-engineer-worlds-fair-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Conditional CFP" }),
      },
      env,
    );
    const created = await create.json<{ form: { id: string; draft: CfpDefinitionV1 } }>();
    expect(created.form.draft.schemaVersion).toBe(1);
    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: {
        publishedDefinition: CfpDefinitionV1;
      };
    }>();
    expect(published.form.publishedDefinition.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "workshopDuration",
          visibleIf: '{sessionFormat} = "workshop"',
        }),
        expect.objectContaining({
          name: "speakers",
          type: "paneldynamic",
          panelAddText: "Add co-speaker",
        }),
      ]),
    );
  });

  it("validates and persists answers against the exact published definition", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Definition authority CFP" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      form: { id: string; draft: CfpDefinitionV1 };
    }>();

    let draft = updateSpeakerSettings(created.form.draft, {
      collectBiography: false,
    });
    draft = addQuestion(draft, {
      type: "text",
      name: "customAudience",
      title: "Intended audience",
      maxLength: 200,
    });

    const save = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(save.status).toBe(200);

    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: { publishedVersion: number };
    }>();
    const formId = created.form.id;
    const formDefinitionVersion = published.form.publishedVersion;

    const baseAnswers: SubmissionAnswers = {
      title: "Definition-driven proposal",
      abstract: "Validated only by the published definition.",
      trackId: "platform",
      sessionFormat: "talk",
      speakers: [{ name: "Def Speaker", email: "def@example.com" }],
      customAudience: "Platform teams",
      supportingLink: "",
    };

    const submitWithoutBiography = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.201",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: baseAnswers,
        }),
      },
      env,
    );
    expect(submitWithoutBiography.status).toBe(201);
    const createdProposal = await submitWithoutBiography.json<{
      proposal: { id: string };
    }>();

    const organizerDetail = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${createdProposal.proposal.id}`,
      undefined,
      env,
    );
    expect(organizerDetail.status).toBe(200);
    const saved = await organizerDetail.json<{
      proposal: { answers: SubmissionAnswers; biography: string };
    }>();
    expect(saved.proposal.answers).toMatchObject({
      title: "Definition-driven proposal",
      customAudience: "Platform teams",
      sessionFormat: "talk",
    });
    expect(saved.proposal.answers).not.toHaveProperty("workshopDuration");
    expect(saved.proposal.biography).toBe("");

    const missingVisibleWorkshopDuration = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.202",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: {
            ...baseAnswers,
            title: "Workshop missing duration",
            sessionFormat: "workshop",
          },
        }),
      },
      env,
    );
    expect(missingVisibleWorkshopDuration.status).toBe(400);
    await expect(missingVisibleWorkshopDuration.json()).resolves.toMatchObject({
      errors: { workshopDuration: expect.any(String) },
    });

    const hiddenWorkshopDurationOmitted = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.203",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: {
            ...baseAnswers,
            title: "Talk without workshop duration",
            sessionFormat: "talk",
          },
        }),
      },
      env,
    );
    expect(hiddenWorkshopDurationOmitted.status).toBe(201);

    const wrongVersion = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.204",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion: 999,
          answers: baseAnswers,
        }),
      },
      env,
    );
    expect(wrongVersion.status).toBe(409);

    const wrongForm = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.205",
        },
        body: JSON.stringify({
          formId: "does-not-exist",
          formDefinitionVersion: 1,
          answers: baseAnswers,
        }),
      },
      env,
    );
    expect(wrongForm.status).toBe(409);

    const unknownKey = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.206",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion,
          answers: {
            ...baseAnswers,
            title: "Unknown key submission",
            notInDefinition: "drift",
          },
        }),
      },
      env,
    );
    expect(unknownKey.status).toBe(400);
    await expect(unknownKey.json()).resolves.toMatchObject({
      errors: { notInDefinition: expect.any(String) },
    });
  });

  it("edit revalidates against the proposal frozen form version and round-trips custom answers", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Frozen edit CFP" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      form: { id: string; draft: CfpDefinitionV1 };
    }>();

    let draft = updateSpeakerSettings(created.form.draft, {
      collectBiography: false,
    });
    draft = addQuestion(draft, {
      type: "text",
      name: "customAudience",
      title: "Intended audience",
      maxLength: 200,
    });

    const saveV1 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(saveV1.status).toBe(200);

    const publishV1 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publishV1.status).toBe(200);
    const publishedV1 = await publishV1.json<{
      form: { publishedVersion: number };
    }>();
    const formId = created.form.id;
    const frozenVersion = publishedV1.form.publishedVersion;

    const baseAnswers: SubmissionAnswers = {
      title: "Frozen-version proposal",
      abstract: "Submitted against version one.",
      trackId: "platform",
      sessionFormat: "talk",
      speakers: [{ name: "Frozen Speaker", email: "frozen@example.com" }],
      customAudience: "Platform teams",
      supportingLink: "",
    };

    const submit = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.220",
        },
        body: JSON.stringify({
          formId,
          formDefinitionVersion: frozenVersion,
          answers: baseAnswers,
        }),
      },
      env,
    );
    expect(submit.status).toBe(201);
    const submitted = await submit.json<{ proposal: { id: string } }>();

    const store = env.EVENT_STORE.getByName(eventId);
    const messages = await store.listOutboxMessages(submitted.proposal.id);
    const bodies = await store.getOutboxBodies(messages[0]!.id);
    const tokenMatch = bodies?.text.match(/\/edit\/([^\s]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = tokenMatch![1]!;

    // Republish a stricter version (biography required). Edits must stay on v1.
    draft = updateSpeakerSettings(draft, { collectBiography: true });
    draft = updateQuestion(draft, "customAudience", {
      title: "Intended audience (v2)",
    });
    const saveV2 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      },
      env,
    );
    expect(saveV2.status).toBe(200);
    const publishV2 = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${formId}/publish`,
      { method: "POST" },
      env,
    );
    expect(publishV2.status).toBe(200);
    const publishedV2 = await publishV2.json<{
      form: { publishedVersion: number };
    }>();
    expect(publishedV2.form.publishedVersion).toBeGreaterThan(frozenVersion);

    const editedAnswers: SubmissionAnswers = {
      ...baseAnswers,
      title: "Edited against frozen version",
      customAudience: "Security teams",
    };

    const patched = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${submitted.proposal.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-submitter-token": token,
        },
        body: JSON.stringify({ answers: editedAnswers }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({
      proposal: {
        id: submitted.proposal.id,
        title: "Edited against frozen version",
      },
    });

    const detail = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${submitted.proposal.id}`,
      undefined,
      env,
    );
    expect(detail.status).toBe(200);
    const saved = await detail.json<{
      proposal: {
        formDefinitionVersion: number;
        answers: SubmissionAnswers;
        biography: string;
      };
    }>();
    expect(saved.proposal.formDefinitionVersion).toBe(frozenVersion);
    expect(saved.proposal.answers).toMatchObject({
      title: "Edited against frozen version",
      customAudience: "Security teams",
      sessionFormat: "talk",
    });
    expect(saved.proposal.answers.speakers).toEqual([
      { name: "Frozen Speaker", email: "frozen@example.com" },
    ]);
    expect(saved.proposal.biography).toBe("");
    expect(saved.proposal.answers).not.toHaveProperty("notInDefinition");
  });

  it("strips unknown definition keys on draft save and publish", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Restricted envelope form" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{ form: { id: string; draft: CfpDefinitionV1 } }>();

    const poisoned = {
      ...created.form.draft,
      calculatedValues: [{ name: "evil", expression: "1+1" }],
      triggers: [{ type: "complete" }],
      runtime: {
        ...created.form.draft.runtime,
        survey: {
          ...created.form.draft.runtime.survey,
          calculatedValues: [{ name: "x", expression: "{title}" }],
          triggers: [{ type: "runexpression", expression: "steal()" }],
          elements: created.form.draft.runtime.survey.elements.map((element) => {
            if (element.name !== "title" || element.type !== "text") return element;
            return {
              ...element,
              validators: [{ type: "expression", expression: "1==1", text: "nope" }],
              visibleIf: "steal() == true",
              defaultValueExpression: "bad()",
            };
          }),
        },
      },
    };

    const save = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: poisoned }),
      },
      env,
    );
    // Unsupported visibleIf is rejected (not stored).
    expect(save.status).toBe(400);
    await expect(save.json()).resolves.toMatchObject({
      error: expect.stringContaining("unsupported condition"),
    });

    const stripOnly = {
      ...created.form.draft,
      calculatedValues: [{ name: "evil", expression: "1+1" }],
      runtime: {
        ...created.form.draft.runtime,
        survey: {
          ...created.form.draft.runtime.survey,
          calculatedValues: [{ name: "x", expression: "{title}" }],
          triggers: [{ type: "runexpression", expression: "steal()" }],
          elements: created.form.draft.runtime.survey.elements.map((element) => {
            if (element.name !== "title" || element.type !== "text") return element;
            return {
              ...element,
              validators: [{ type: "expression", expression: "1==1", text: "nope" }],
              defaultValueExpression: "bad()",
              clearIfInvisible: "onHidden",
            };
          }),
        },
      },
    };

    const saveStripped = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: stripOnly }),
      },
      env,
    );
    expect(saveStripped.status).toBe(200);
    const saved = await saveStripped.json<{ form: { draft: Record<string, unknown> } }>();
    const draftJson = JSON.stringify(saved.form.draft);
    expect(draftJson).not.toContain("calculatedValues");
    expect(draftJson).not.toContain("triggers");
    expect(draftJson).not.toContain("defaultValueExpression");
    expect(draftJson).not.toContain("clearIfInvisible");
    expect(draftJson).not.toContain("expression");

    const title = (
      saved.form.draft.runtime as {
        survey: { elements: Array<Record<string, unknown>> };
      }
    ).survey.elements.find((element) => element.name === "title");
    expect(title).toBeDefined();
    expect(title).not.toHaveProperty("validators");
    expect(title).not.toHaveProperty("defaultValueExpression");

    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: { publishedDefinition: Record<string, unknown> };
    }>();
    const publishedJson = JSON.stringify(published.form.publishedDefinition);
    expect(publishedJson).not.toContain("calculatedValues");
    expect(publishedJson).not.toContain("triggers");
    expect(publishedJson).not.toContain("defaultValueExpression");

    const publicForm = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/cfp?formId=${created.form.id}`,
    );
    expect(publicForm.status).toBe(200);
    const publicBody = await publicForm.json<{ form: { definition: unknown } }>();
    expect(JSON.stringify(publicBody.form.definition)).not.toContain("calculatedValues");
  });

  it("sanitizes upload objectKey file names against path traversal", async () => {
    expect(sanitizeUploadFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadFileName("a/b\\c..pdf")).toBe("cpdf");
    expect(sanitizeUploadFileName("notes.pdf")).toBe("notes.pdf");

    const eventId = "pacific-open-data-summit-2026";
    const start = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          questionName: "supportingFile",
          fileName: "../../evil/../notes.pdf",
          mime: "application/pdf",
          sizeBytes: 4,
        }),
      },
    );
    expect(start.status).toBe(200);
    const started = await start.json<{
      upload: { assetId: string; objectKey: string };
    }>();
    expect(started.upload.objectKey).toBe(
      `${eventId}/${started.upload.assetId}/notes.pdf`,
    );
    expect(started.upload.objectKey).not.toContain("..");
    expect(started.upload.objectKey.split("/")).toHaveLength(3);
  });

  it("rejects oversized submitter PATCH bodies", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const created = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.201",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "PATCH size bound",
            speakers: [
              {
                name: "Patch Size",
                email: "patch-size@example.com",
                biography: "Biography for PATCH size tests.",
              },
            ],
          }),
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const body = await created.json<{ proposal: { id: string } }>();
    const store = env.EVENT_STORE.getByName(eventId);
    const tokenId = "patch-size-token";
    const token = await signEditToken(signingSecret, {
      v: 1,
      eventId,
      proposalId: body.proposal.id,
      tokenId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await store.createEditToken({
      tokenId,
      proposalId: body.proposal.id,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const oversized = "x".repeat(70 * 1024);
    const patched = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${body.proposal.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-submitter-token": token,
        },
        body: JSON.stringify({
          answers: mainCfpAnswers({
            title: "too big",
            abstract: oversized,
          }),
        }),
      },
      env,
    );
    expect(patched.status).toBe(413);
    await expect(patched.json()).resolves.toEqual({
      error: "Proposal request is too large.",
    });
  });

  it("refuses upload start when the form is closed", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const create = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Close then upload" }),
      },
      env,
    );
    const created = await create.json<{ form: { id: string; draft: CfpDefinitionV1 } }>();
    await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: created.form.draft }),
      },
      env,
    );
    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{ form: { publishedVersion: number } }>();

    const close = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/close`,
      { method: "POST" },
      env,
    );
    expect(close.status).toBe(200);

    const start = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: created.form.id,
          formDefinitionVersion: published.form.publishedVersion,
          questionName: "supportingFile",
          fileName: "after-close.pdf",
          mime: "application/pdf",
          sizeBytes: 4,
        }),
      },
    );
    expect(start.status).toBe(409);
    await expect(start.json()).resolves.toEqual({
      error: "This call for proposals is closed.",
    });
  });

  it("claimAssets conditional update rejects already-claimed assets on create", async () => {
    const eventId = "pacific-open-data-summit-2026";
    const start = await SELF.fetch(
      `https://chartstead.test/api/events/${eventId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          questionName: "supportingFile",
          fileName: "claim-once.pdf",
          mime: "application/pdf",
          sizeBytes: 4,
        }),
      },
    );
    expect(start.status).toBe(200);
    const session = await start.json<{
      upload: { assetId: string; objectKey: string; uploadUrl: string };
    }>();
    const put = await SELF.fetch(
      `https://chartstead.test${session.upload.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "content-length": "4",
        },
        body: new Uint8Array([1, 2, 3, 4]),
      },
    );
    expect(put.status).toBe(200);
    const asset = await put.json<{
      asset: {
        assetId: string;
        objectKey: string;
        name: string;
        mime: string;
        size: number;
        status: "complete";
      };
    }>();

    const answers = mainCfpAnswers({
      title: "First claimer",
      speakers: [
        {
          name: "Claim One",
          email: "claim-one@example.com",
          biography: "Biography for claim tests.",
        },
      ],
      supportingFile: {
        assetId: asset.asset.assetId,
        objectKey: asset.asset.objectKey,
        name: asset.asset.name,
        mime: asset.asset.mime,
        size: asset.asset.size,
        status: "complete",
      },
    });

    const first = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.202",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers,
        }),
      },
      env,
    );
    expect(first.status).toBe(201);

    const second = await demoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.203",
        },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: mainCfpAnswers({
            title: "Second claimer",
            speakers: [
              {
                name: "Claim Two",
                email: "claim-two@example.com",
                biography: "Biography for second claim tests.",
              },
            ],
            supportingFile: {
              assetId: asset.asset.assetId,
              objectKey: asset.asset.objectKey,
              name: asset.asset.name,
              mime: asset.asset.mime,
              size: asset.asset.size,
              status: "complete",
            },
          }),
        }),
      },
      env,
    );
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toMatchObject({
      errors: expect.objectContaining({
        supportingFile: expect.stringContaining("Upload a valid file"),
      }),
    });
  });

  it("freezes published form name after draft rename and returns distinct seed accents", async () => {
    const pacificId = "pacific-open-data-summit-2026";
    const aiId = "ai-engineer-worlds-fair-2026";

    const eventsResponse = await demoApp.request(
      "https://chartstead.test/api/events",
      undefined,
      env,
    );
    expect(eventsResponse.status).toBe(200);
    const eventsBody = await eventsResponse.json<{
      events: Array<{ id: string; themeAccent?: string }>;
    }>();
    const accents = new Map(
      eventsBody.events.map((event) => [event.id, event.themeAccent]),
    );
    expect(accents.get(pacificId)).toBe("#2f5d98");
    expect(accents.get(aiId)).toBe("#081d3a");
    expect(accents.get(pacificId)).not.toBe(accents.get(aiId));

    const create = await demoApp.request(
      `https://chartstead.test/api/events/${pacificId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Lightning talks" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      form: { id: string; name: string; draft: CfpDefinitionV1 };
    }>();

    const publish = await demoApp.request(
      `https://chartstead.test/api/events/${pacificId}/forms/${created.form.id}/publish`,
      { method: "POST" },
      env,
    );
    expect(publish.status).toBe(200);
    const published = await publish.json<{
      form: { publishedVersion: number };
    }>();

    const rename = await demoApp.request(
      `https://chartstead.test/api/events/${pacificId}/forms/${created.form.id}/draft`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Renamed draft",
          draft: created.form.draft,
        }),
      },
      env,
    );
    expect(rename.status).toBe(200);
    const renamed = await rename.json<{ form: { name: string } }>();
    expect(renamed.form.name).toBe("Renamed draft");

    const store = env.EVENT_STORE.getByName(pacificId);
    const versionOne = await store.getFormVersion(
      created.form.id,
      published.form.publishedVersion,
    );
    const currentDraft = await store.getForm(created.form.id);
    expect(versionOne?.name).toBe("Lightning talks");
    expect(currentDraft?.name).toBe("Renamed draft");

    const publicResponse = await SELF.fetch(
      `https://chartstead.test/api/events/${pacificId}/cfp?formId=${created.form.id}`,
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json<{
      form: { name: string };
      event: { themeAccent?: string };
    }>();
    expect(publicBody.form.name).toBe("Lightning talks");
    expect(publicBody.event.themeAccent).toBe("#2f5d98");
  });
});

describe("canonicalizeCfpDefinition", () => {
  it("strips survey calculatedValues and non-email validators", () => {
    const base = createDefaultCfpDefinition({
      definitionId: "canon-test",
      eventId: "pacific-open-data-summit-2026",
      trackChoices: [{ value: "platform", text: "Platform" }],
    });
    const result = canonicalizeCfpDefinition({
      ...base,
      calculatedValues: [{ name: "x", expression: "1" }],
      runtime: {
        ...base.runtime,
        survey: {
          ...base.runtime.survey,
          calculatedValues: [{ name: "y", expression: "2" }],
          elements: base.runtime.survey.elements.map((element) =>
            element.name === "title"
              ? {
                  ...element,
                  validators: [{ type: "expression", expression: "true", text: "x" }],
                  defaultValueExpression: "nope",
                }
              : element,
          ),
        },
      },
    });
    expect("errors" in result).toBe(false);
    if ("errors" in result) return;
    expect(JSON.stringify(result)).not.toContain("calculatedValues");
    expect(JSON.stringify(result)).not.toContain("defaultValueExpression");
    const title = result.runtime.survey.elements.find((el) => el.name === "title");
    expect(title).not.toHaveProperty("validators");
  });

  it("rejects arbitrary visibleIf expressions", () => {
    const base = createDefaultCfpDefinition({
      definitionId: "canon-test",
      eventId: "pacific-open-data-summit-2026",
      trackChoices: [{ value: "platform", text: "Platform" }],
    });
    const result = canonicalizeCfpDefinition({
      ...base,
      runtime: {
        ...base.runtime,
        survey: {
          ...base.runtime.survey,
          elements: base.runtime.survey.elements.map((element) =>
            element.name === "title"
              ? { ...element, visibleIf: "function(){return true}" }
              : element,
          ),
        },
      },
    });
    expect(result).toMatchObject({
      errors: [expect.stringContaining("unsupported condition")],
    });
  });
});
