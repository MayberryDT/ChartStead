import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "../../worker/auth";
import { createApp } from "../../worker/app";
import type { SubmissionAnswers } from "../../shared/events";

const eventId = "pacific-open-data-summit-2026";
const otherEventId = "ai-engineer-worlds-fair-2026";
const signingSecret = "submitter-dashboard-test-signing-secret";

const alice = {
  id: "submitter-alice",
  name: "Alice Submitter",
  email: "alice.submitter@example.com",
} satisfies AuthenticatedUser;

const bob = {
  id: "submitter-bob",
  name: "Bob Submitter",
  email: "bob.submitter@example.com",
} satisfies AuthenticatedUser;

const organizer = {
  id: "submitter-dashboard-organizer",
  displayName: "Submitter Dashboard Organizer",
  role: "admin" as const,
  eventIds: [eventId, otherEventId],
};

function answers(
  email: string,
  title: string,
  trackId = "platform",
): SubmissionAnswers {
  return {
    title,
    abstract: "A valid abstract for the submitter dashboard test.",
    trackId,
    sessionFormat: "talk",
    speakers: [
      {
        name: "Dashboard Speaker",
        email,
        biography: "A short biography.",
      },
    ],
    supportingLink: "",
  };
}

function submitterApp(user: AuthenticatedUser | null) {
  return createApp({
    resolvePrincipal: async () => null,
    resolveAuthenticatedUser: async () => user,
    emailSender: null,
    signingSecret,
  });
}

const organizerApp = createApp({
  resolvePrincipal: async () => organizer,
  emailSender: null,
  signingSecret,
});

async function submit(
  app: ReturnType<typeof submitterApp>,
  input: { eventId?: string; email?: string; title?: string } = {},
) {
  const response = await app.request(
    `https://chartstead.test/api/events/${input.eventId ?? eventId}/proposals`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formId: "main-cfp",
        formDefinitionVersion: 1,
        answers: answers(
          input.email ?? alice.email,
          input.title ?? "Submitter-owned proposal",
          input.eventId === otherEventId ? "agents" : "platform",
        ),
      }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<{ proposal: { id: string } }>();
}

async function dashboard(app: ReturnType<typeof submitterApp>, id = eventId) {
  return app.request(
    `https://chartstead.test/api/events/${id}/submitter/proposals`,
    undefined,
    env,
  );
}

async function saveDraft(
  app: ReturnType<typeof submitterApp>,
  input: {
    id?: string;
    title?: string;
    expectedUpdatedAt?: string;
    formId?: string;
    formDefinitionVersion?: number;
    answers?: SubmissionAnswers;
  } = {},
) {
  const body = {
    formId: input.formId ?? "main-cfp",
    formDefinitionVersion: input.formDefinitionVersion ?? 1,
    answers: input.answers ?? { title: input.title ?? "Minimal saved draft" },
    ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}),
  };
  return app.request(
    `https://chartstead.test/api/events/${eventId}/submitter/drafts${input.id ? `/${input.id}` : ""}`,
    {
      method: input.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function applyDecision(proposalId: string, outcome: "accepted" | "declined") {
  const planResponse = await organizerApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `submitter-${outcome}-${proposalId}`,
      },
      body: JSON.stringify({
        proposalId,
        outcome,
        idempotencyKey: `submitter-${outcome}-${proposalId}`,
      }),
    },
    env,
  );
  expect(planResponse.status).toBe(201);
  const plan = await planResponse.json<{ id: string; version: number; digest: string }>();
  const apply = await organizerApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `submitter-apply-${proposalId}`,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `submitter-apply-${proposalId}`,
      }),
    },
    env,
  );
  expect(apply.status).toBe(200);
}

describe("authenticated submitter dashboard", () => {
  it("requires an account, attaches authenticated submissions, and exposes no organizer role", async () => {
    const anonymous = submitterApp(null);
    const unauthorized = await dashboard(anonymous);
    expect(unauthorized.status).toBe(401);

    const aliceApp = submitterApp(alice);
    const created = await submit(aliceApp, { title: "Alice owned proposal" });
    const response = await dashboard(aliceApp);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: alice,
      proposals: [
        {
          id: created.proposal.id,
          title: "Alice owned proposal",
          status: "submitted",
          claimed: true,
          claimable: false,
        },
      ],
    });

    const organizerData = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    expect(organizerData.status).toBe(401);
  });

  it("projects review and final outcomes without committee-only fields", async () => {
    const aliceApp = submitterApp(alice);
    const created = await submit(aliceApp, { title: "Decision projection proposal" });

    const organizerProposal = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${created.proposal.id}`,
      undefined,
      env,
    );
    const before = await organizerProposal.json<{ proposal: { reviewVersion: number } }>();
    const review = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${created.proposal.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "approve",
          committeeNote: "Organizers only.",
          expectedVersion: before.proposal.reviewVersion,
        }),
      },
      env,
    );
    expect(review.status).toBe(200);

    const underReview = await dashboard(aliceApp);
    const underReviewBody = await underReview.json<{
      proposals: Array<Record<string, unknown>>;
    }>();
    const underReviewProposal = underReviewBody.proposals.find(
      (proposal) => proposal.id === created.proposal.id,
    );
    expect(underReviewProposal).toMatchObject({ status: "under_review" });
    expect(underReviewProposal).not.toHaveProperty("committeeNote");
    expect(underReviewProposal).not.toHaveProperty("privateNote");

    await applyDecision(created.proposal.id, "accepted");

    const declined = await submit(aliceApp, { title: "Rejected projection proposal" });
    await applyDecision(declined.proposal.id, "declined");

    const accepted = await dashboard(aliceApp);
    const acceptedBody = await accepted.json<{
      proposals: Array<{ id: string; status: string }>;
    }>();
    expect(acceptedBody.proposals.find((proposal) => proposal.id === created.proposal.id)).toMatchObject({
      status: "accepted",
    });
    expect(acceptedBody.proposals.find((proposal) => proposal.id === declined.proposal.id)).toMatchObject({
      status: "rejected",
    });
  });

  it("lets the matching email claim accountless submissions and isolates users and events", async () => {
    const anonymous = submitterApp(null);
    const legacy = await submit(anonymous, {
      email: alice.email,
      title: "Accountless proposal to claim",
    });
    const aliceApp = submitterApp(alice);
    const bobApp = submitterApp(bob);

    const listing = await dashboard(aliceApp);
    const listingBody = await listing.json<{
      proposals: Array<{ id: string; claimable: boolean; claimed: boolean }>;
    }>();
    expect(listingBody.proposals.find((proposal) => proposal.id === legacy.proposal.id)).toMatchObject({
      claimable: true,
      claimed: false,
    });

    const wrongClaim = await bobApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${legacy.proposal.id}/claim`,
      { method: "POST" },
      env,
    );
    expect(wrongClaim.status).toBe(404);

    const claimed = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${legacy.proposal.id}/claim`,
      { method: "POST" },
      env,
    );
    expect(claimed.status).toBe(200);
    await expect(claimed.json()).resolves.toMatchObject({
      proposal: { id: legacy.proposal.id, claimed: true, claimable: false },
    });

    const bobDashboard = await dashboard(bobApp);
    await expect(bobDashboard.json()).resolves.toMatchObject({ proposals: [] });

    const otherEvent = await submit(aliceApp, {
      eventId: otherEventId,
      title: "Other event proposal",
    });
    const firstEvent = await dashboard(aliceApp);
    const firstEventBody = await firstEvent.json<{
      proposals: Array<{ id: string }>;
    }>();
    expect(firstEventBody.proposals.some((proposal) => proposal.id === otherEvent.proposal.id)).toBe(false);

    const crossEventClaim = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/proposals/${otherEvent.proposal.id}/claim`,
      { method: "POST" },
      env,
    );
    expect(crossEventClaim.status).toBe(404);
  });

  it("saves, resumes, edits, and submits authenticated drafts exactly once", async () => {
    const aliceApp = submitterApp(alice);
    const minimal = await saveDraft(aliceApp, { title: "Draft only title" });
    expect(minimal.status).toBe(201);
    const minimalBody = await minimal.json<{
      draft: { id: string; title: string; updatedAt: string };
      answers: SubmissionAnswers;
    }>();
    expect(minimalBody).toMatchObject({
      draft: { title: "Draft only title" },
      answers: { title: "Draft only title" },
    });

    const listing = await dashboard(aliceApp);
    const listingBody = await listing.json<{
      drafts: Array<{ id: string; title: string }>;
      proposals: Array<{ id: string }>;
    }>();
    expect(listingBody.drafts).toEqual([
      expect.objectContaining({ id: minimalBody.draft.id, title: "Draft only title" }),
    ]);
    expect(listingBody.proposals.some((proposal) => proposal.id === minimalBody.draft.id)).toBe(false);

    const resumed = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/submitter/drafts/${minimalBody.draft.id}`,
      undefined,
      env,
    );
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toMatchObject({
      draft: { id: minimalBody.draft.id, formDefinitionVersion: 1 },
      answers: { title: "Draft only title" },
    });

    const isolated = await submitterApp(bob).request(
      `https://chartstead.test/api/events/${eventId}/submitter/drafts/${minimalBody.draft.id}`,
      undefined,
      env,
    );
    expect(isolated.status).toBe(404);

    const edited = await saveDraft(aliceApp, {
      id: minimalBody.draft.id,
      expectedUpdatedAt: minimalBody.draft.updatedAt,
      answers: { title: "Edited draft title", sessionFormat: "talk" },
    });
    expect(edited.status).toBe(200);
    const editedBody = await edited.json<{ draft: { updatedAt: string } }>();

    const stale = await saveDraft(aliceApp, {
      id: minimalBody.draft.id,
      expectedUpdatedAt: minimalBody.draft.updatedAt,
      answers: { title: "Stale edit" },
    });
    expect(stale.status).toBe(409);

    const finalAnswers = answers(alice.email, "Edited draft title");
    const submitted = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          draftId: minimalBody.draft.id,
          answers: finalAnswers,
        }),
      },
      env,
    );
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json<{ proposal: { id: string } }>();

    const duplicate = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          draftId: minimalBody.draft.id,
          answers: finalAnswers,
        }),
      },
      env,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      proposal: { id: submittedBody.proposal.id },
    });

    const after = await dashboard(aliceApp);
    const afterBody = await after.json<{
      drafts: Array<{ id: string }>;
      proposals: Array<{ id: string }>;
    }>();
    expect(afterBody.drafts.some((draft) => draft.id === minimalBody.draft.id)).toBe(false);
    expect(afterBody.proposals.filter((proposal) => proposal.id === submittedBody.proposal.id)).toHaveLength(1);
    expect(editedBody.draft.updatedAt).not.toEqual(minimalBody.draft.updatedAt);
  });

  it("keeps draft data readable when final validation fails or the CFP closes", async () => {
    const aliceApp = submitterApp(alice);
    const draft = await saveDraft(aliceApp, { title: "Closure-safe draft" });
    const draftBody = await draft.json<{ draft: { id: string } }>();

    const invalidFinal = await aliceApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: "main-cfp",
          formDefinitionVersion: 1,
          draftId: draftBody.draft.id,
          answers: { title: "Closure-safe draft" },
        }),
      },
      env,
    );
    expect(invalidFinal.status).toBe(400);

    const close = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/main-cfp/close`,
      { method: "POST" },
      env,
    );
    expect(close.status).toBe(200);
    try {
      const closedFinal = await aliceApp.request(
        `https://chartstead.test/api/events/${eventId}/proposals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            formId: "main-cfp",
            formDefinitionVersion: 1,
            draftId: draftBody.draft.id,
            answers: answers(alice.email, "Closure-safe draft"),
          }),
        },
        env,
      );
      expect(closedFinal.status).toBe(409);

      const readable = await aliceApp.request(
        `https://chartstead.test/api/events/${eventId}/submitter/drafts/${draftBody.draft.id}`,
        undefined,
        env,
      );
      expect(readable.status).toBe(200);
      await expect(readable.json()).resolves.toMatchObject({
        draft: { title: "Closure-safe draft", lifecycle: { state: "closed" } },
        answers: { title: "Closure-safe draft" },
      });
    } finally {
      await organizerApp.request(
        `https://chartstead.test/api/events/${eventId}/forms/main-cfp/reopen`,
        { method: "POST" },
        env,
      );
    }
  });

  it("flags saved drafts when organizers publish a newer form version", async () => {
    const aliceApp = submitterApp(alice);
    const createdForm = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Draft Drift CFP" }),
      },
      env,
    );
    expect(createdForm.status).toBe(201);
    const created = await createdForm.json<{ form: { id: string; draftUpdatedAt: string; draft: unknown } }>();
    const firstPublish = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedDraftUpdatedAt: created.form.draftUpdatedAt }),
      },
      env,
    );
    expect(firstPublish.status).toBe(200);
    const first = await firstPublish.json<{ form: { id: string; publishedVersion: number; draftUpdatedAt: string } }>();

    const draft = await saveDraft(aliceApp, {
      formId: first.form.id,
      formDefinitionVersion: first.form.publishedVersion,
      answers: { title: "Versioned draft" },
    });
    expect(draft.status).toBe(201);

    const secondPublish = await organizerApp.request(
      `https://chartstead.test/api/events/${eventId}/forms/${created.form.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedDraftUpdatedAt: first.form.draftUpdatedAt }),
      },
      env,
    );
    expect(secondPublish.status).toBe(200);

    const listing = await dashboard(aliceApp);
    const body = await listing.json<{ drafts: Array<{ title: string; formVersionStale: boolean; latestFormDefinitionVersion: number | null }> }>();
    expect(body.drafts.find((candidate) => candidate.title === "Versioned draft")).toMatchObject({
      formVersionStale: true,
      latestFormDefinitionVersion: 2,
    });
  });

});
