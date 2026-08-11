import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  OnboardingBoard,
  OnboardingReminderDraft,
  OrganizerPrincipal,
  OrganizerProposal,
  SpeakerPortalSession,
} from "../../shared/events";
import type { EmailSender } from "../../worker/email";
import { createApp } from "../../worker/app";
import { signPortalToken } from "../../worker/signed-links";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-06-onboarding-signing-secret";

const adminPrincipal = {
  id: "t06-admin",
  displayName: "Onboarding Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "t06-reviewer",
  displayName: "Track Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "reviewer" },
  trackIdsByEvent: { [eventId]: ["open-data"] },
} satisfies OrganizerPrincipal;

function createMemorySender(
  log: Array<{ to: string; subject: string; text: string }>,
  failTimes = 0,
): EmailSender {
  let failuresLeft = failTimes;
  return {
    async send(message) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("Simulated delivery failure");
      }
      log.push({
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

const sent: Array<{ to: string; subject: string; text: string }> = [];

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret,
  emailSender: createMemorySender(sent),
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret,
  emailSender: createMemorySender(sent),
});

async function loadEvent() {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function getProposal(proposalId: string): Promise<OrganizerProposal> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposal: OrganizerProposal }>();
  return body.proposal;
}

async function acceptProposal(proposalId: string, key: string): Promise<CourseCheckPlan> {
  const create = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        proposalId,
        outcome: "accepted",
        idempotencyKey: key,
      }),
    },
    env,
  );
  expect(create.status).toBe(201);
  const plan = await create.json<CourseCheckPlan>();
  const apply = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${key}-apply`,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `${key}-apply`,
      }),
    },
    env,
  );
  expect(apply.status).toBe(200);
  return apply.json<CourseCheckPlan>();
}

async function portalTokenFor(grant: {
  speakerId: string;
  tokenId: string;
  signedToken?: string | null;
}): Promise<string> {
  return (
    grant.signedToken ??
    (await signPortalToken(signingSecret, {
      v: 1,
      kind: "portal",
      eventId,
      speakerId: grant.speakerId,
      tokenId: grant.tokenId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }))
  );
}

async function openPortal(token: string) {
  return adminApp.request(
    `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(token)}`,
    undefined,
    env,
  );
}

async function acceptAndGrant(proposalId: string, key: string) {
  await acceptProposal(proposalId, key);
  const store = env.EVENT_STORE.getByName(eventId);
  const cascade = await store.getAcceptanceCascade(proposalId);
  const grant = cascade.portalTokens[0]!;
  const token = await portalTokenFor(grant);
  return { store, cascade, grant, token };
}

describe("Ticket 06 onboarding and assisted chasing", () => {
  beforeAll(async () => {
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" INTEGER NOT NULL DEFAULT 0,
        "image" TEXT,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "event_memberships" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'reviewer')),
        PRIMARY KEY ("event_id", "user_id")
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "reviewer_track_assignments" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "track_id" TEXT NOT NULL,
        PRIMARY KEY ("event_id", "user_id", "track_id")
      )`),
    ]);
    await loadEvent();
  });

  it("lets a speaker edit biography and headshot from the portal", async () => {
    const proposalId = "SUB-PODS0040";
    const { token, grant } = await acceptAndGrant(proposalId, `onb-profile-${proposalId}`);

    const patch = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/profile?token=${encodeURIComponent(token)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          biography: "Updated bio for the public program.",
          name: "Portal Speaker Forty",
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const afterPatch = await patch.json<SpeakerPortalSession>();
    expect(afterPatch.profile.biography).toBe("Updated bio for the public program.");
    expect(afterPatch.profile.name).toBe("Portal Speaker Forty");
    expect(afterPatch.profile.id).toBe(grant.speakerId);

    const start = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/uploads?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "headshot",
          fileName: "headshot.png",
          mime: "image/png",
          sizeBytes: 12,
        }),
      },
      env,
    );
    expect(start.status).toBe(200);
    const started = await start.json<{
      upload: { assetId: string; uploadUrl: string; maxBytes: number };
    }>();
    expect(started.upload.assetId).toBeTruthy();
    expect(started.upload.maxBytes).toBeGreaterThan(0);

    const bytes = new Uint8Array(12).fill(7);
    const put = await adminApp.request(
      `https://chartstead.test${started.upload.uploadUrl}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          "content-length": String(bytes.byteLength),
        },
        body: bytes,
      },
      env,
    );
    expect(put.status).toBe(200);

    const attach = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/profile?token=${encodeURIComponent(token)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headshotAssetId: started.upload.assetId }),
      },
      env,
    );
    expect(attach.status).toBe(200);
    const withShot = await attach.json<SpeakerPortalSession>();
    expect(withShot.profile.headshotAssetId).toBe(started.upload.assetId);
    expect(withShot.profile.headshotFileName).toBe("headshot.png");

    const reload = await (await openPortal(token)).json<SpeakerPortalSession>();
    expect(reload.profile.biography).toBe("Updated bio for the public program.");
    expect(reload.profile.headshotAssetId).toBe(started.upload.assetId);
  });

  it("completes file tasks with replace, keeps completed history, and blocks co-speaker isolation", async () => {
    const proposalId = "SUB-PODS0041";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Onboarding Co",
        email: "onb-co-41@example.test",
        biography: "Co-speaker bio.",
      },
    ]);
    await acceptProposal(proposalId, `onb-tasks-${proposalId}`);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const primary = cascade.participations.find((row) => row.role === "primary")!;
    const co = cascade.participations.find((row) => row.role === "co")!;
    const primaryGrant = cascade.portalTokens.find((row) => row.speakerId === primary.speakerId)!;
    const coGrant = cascade.portalTokens.find((row) => row.speakerId === co.speakerId)!;
    const primaryToken = await portalTokenFor(primaryGrant);
    const coToken = await portalTokenFor(coGrant);

    const primarySession = await (
      await openPortal(primaryToken)
    ).json<SpeakerPortalSession>();
    const headshotTask = primarySession.tasks.find((task) => task.kind === "headshot");
    expect(headshotTask).toBeTruthy();
    expect(headshotTask!.status).toBe("open");
    expect(headshotTask!.completionRequirement).toBe("file");

    async function uploadTaskFile(token: string, taskId: string, name: string) {
      const start = await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/portal/uploads?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            purpose: "task",
            taskId,
            fileName: name,
            mime: "image/jpeg",
            sizeBytes: 8,
          }),
        },
        env,
      );
      expect(start.status).toBe(200);
      const body = await start.json<{ upload: { assetId: string; uploadUrl: string } }>();
      const bytes = new Uint8Array(8).fill(3);
      const put = await adminApp.request(
        `https://chartstead.test${body.upload.uploadUrl}?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "image/jpeg",
            "content-length": "8",
          },
          body: bytes,
        },
        env,
      );
      expect(put.status).toBe(200);
      return body.upload.assetId;
    }

    const firstAsset = await uploadTaskFile(primaryToken, headshotTask!.id, "shot-a.jpg");
    const complete = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/tasks/${headshotTask!.id}/complete?token=${encodeURIComponent(primaryToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: firstAsset }),
      },
      env,
    );
    expect(complete.status).toBe(200);
    const completedSession = await complete.json<SpeakerPortalSession>();
    const completedTask = completedSession.tasks.find((task) => task.id === headshotTask!.id)!;
    expect(completedTask.status).toBe("completed");
    expect(completedTask.asset?.assetId).toBe(firstAsset);
    expect(completedSession.tasks.filter((task) => task.status === "open").length).toBeLessThan(
      primarySession.tasks.filter((task) => task.status === "open").length,
    );
    expect(completedSession.tasks.some((task) => task.status === "completed")).toBe(true);

    const replacement = await uploadTaskFile(primaryToken, headshotTask!.id, "shot-b.jpg");
    const replace = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/tasks/${headshotTask!.id}/complete?token=${encodeURIComponent(primaryToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: replacement }),
      },
      env,
    );
    expect(replace.status).toBe(200);
    const replaced = await replace.json<SpeakerPortalSession>();
    expect(replaced.tasks.find((task) => task.id === headshotTask!.id)?.asset?.assetId).toBe(
      replacement,
    );
    expect(replaced.tasks.find((task) => task.id === headshotTask!.id)?.asset?.fileName).toBe(
      "shot-b.jpg",
    );

    const coSteal = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/tasks/${headshotTask!.id}/complete?token=${encodeURIComponent(coToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: replacement }),
      },
      env,
    );
    expect(coSteal.status).toBe(404);

    const coProfile = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/profile?token=${encodeURIComponent(coToken)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headshotAssetId: firstAsset }),
      },
      env,
    );
    expect(coProfile.status).toBe(400);

    const coSession = await (await openPortal(coToken)).json<SpeakerPortalSession>();
    expect(coSession.tasks.every((task) => task.speakerId === co.speakerId)).toBe(true);
    expect(coSession.tasks.some((task) => task.id === headshotTask!.id)).toBe(false);
  });

  it("lets organizers create tasks and readiness flags without changing proposal decision state", async () => {
    const proposalId = "SUB-PODS0042";
    const before = await getProposal(proposalId);
    const { cascade, grant } = await acceptAndGrant(proposalId, `onb-org-${proposalId}`);
    const afterAccept = await getProposal(proposalId);
    expect(afterAccept.programOutcome).toBe("accepted");
    expect(afterAccept.status).toBe(before.status);

    const create = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: grant.speakerId,
          title: "Confirm employer approval",
          instructions: "Upload written approval from your employer.",
          kind: "employer_approval",
          completionRequirement: "file",
          readinessFlag: "employer_approval",
          dueAt: "2026-08-01T00:00:00.000Z",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      task: { id: string; title: string; readinessFlag: string | null };
    }>();
    expect(created.task.title).toBe("Confirm employer approval");
    expect(created.task.readinessFlag).toBe("employer_approval");

    const coTask = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: grant.speakerId,
          title: "Collect co-speaker details",
          instructions: "Confirm co-speaker contact and bio.",
          kind: "co_speaker_details",
          completionRequirement: "manual",
          readinessFlag: "co_speaker_details",
          dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      },
      env,
    );
    expect(coTask.status).toBe(201);

    const afterTasks = await getProposal(proposalId);
    expect(afterTasks.programOutcome).toBe("accepted");
    expect(afterTasks.status).toBe(afterAccept.status);
    expect(afterTasks.reviewVersion).toBe(afterAccept.reviewVersion);

    const board = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding`,
      undefined,
      env,
    );
    expect(board.status).toBe(200);
    const body = await board.json<OnboardingBoard>();
    const row = body.speakers.find((speaker) => speaker.speakerId === grant.speakerId);
    expect(row).toBeTruthy();
    expect(row!.openTaskCount).toBeGreaterThanOrEqual(cascade.tasks.length);
    expect(row!.overdueCount).toBeGreaterThanOrEqual(1);
    expect(row!.readinessFlags).toEqual(
      expect.arrayContaining(["employer_approval", "co_speaker_details"]),
    );
    expect(row!.missingWork.some((item) => item.title.includes("employer"))).toBe(true);
    expect(typeof row!.daysUntilNextDue === "number" || row!.daysUntilNextDue === null).toBe(
      true,
    );
    expect(row!.daysUntilNextDue !== null && row!.daysUntilNextDue! < 0).toBe(true);

    const reviewerDenied = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: grant.speakerId,
          title: "Should fail",
          instructions: "nope",
          kind: "custom",
          completionRequirement: "manual",
        }),
      },
      env,
    );
    expect(reviewerDenied.status).toBe(403);
  });

  it("prepares editable reminder drafts that never send until explicit send, retaining failures", async () => {
    sent.length = 0;
    const proposalId = "SUB-PODS0043";
    const { grant, token } = await acceptAndGrant(proposalId, `onb-remind-${proposalId}`);

    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: grant.speakerId,
          title: "Upload slides",
          instructions: "Final slide deck PDF.",
          kind: "slides",
          completionRequirement: "file",
          dueAt: "2026-07-15T00:00:00.000Z",
        }),
      },
      env,
    );

    const prepare = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speakerId: grant.speakerId }),
      },
      env,
    );
    expect(prepare.status).toBe(201);
    const draft = await prepare.json<OnboardingReminderDraft>();
    expect(draft.status).toBe("draft");
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.bodyText).toMatch(/Upload slides|missing|due|outstanding/i);
    expect(draft.missingTaskIds.length).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);

    const store = env.EVENT_STORE.getByName(eventId);
    const dueBeforeSend = await store.listDueOutboxMessageIds(new Date().toISOString(), 50);
    expect(dueBeforeSend.some((id: string) => id.includes(draft.id))).toBe(false);

    const edit = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders/${draft.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Friendly nudge about your onboarding",
          bodyText: "Please finish the overdue slide upload this week.\n\nThanks!",
        }),
      },
      env,
    );
    expect(edit.status).toBe(200);
    const edited = await edit.json<OnboardingReminderDraft>();
    expect(edited.subject).toBe("Friendly nudge about your onboarding");
    expect(edited.status).toBe("draft");
    expect(sent).toHaveLength(0);

    const discardPrep = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speakerId: grant.speakerId }),
      },
      env,
    );
    const discardDraft = await discardPrep.json<OnboardingReminderDraft>();
    const discarded = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders/${discardDraft.id}/discard`,
      { method: "POST" },
      env,
    );
    expect(discarded.status).toBe(200);
    const discardedBody = await discarded.json<OnboardingReminderDraft>();
    expect(discardedBody.status).toBe("discarded");
    expect(sent).toHaveLength(0);

    const failLog: Array<{ to: string; subject: string; text: string }> = [];
    const failApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret,
      emailSender: createMemorySender(failLog, 1),
    });
    const failSend = await failApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders/${edited.id}/send`,
      { method: "POST" },
      env,
    );
    expect(failSend.status).toBe(200);
    const failedDraft = await failSend.json<OnboardingReminderDraft>();
    expect(failedDraft.status).toBe("failed");
    expect(failedDraft.outboxId).toBeTruthy();
    expect(failedDraft.lastError).toMatch(/fail/i);
    expect(failLog).toHaveLength(0);

    const boardAfterFail = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/onboarding`,
        undefined,
        env,
      )
    ).json<OnboardingBoard>();
    const rowAfterFail = boardAfterFail.speakers.find(
      (speaker) => speaker.speakerId === grant.speakerId,
    )!;
    expect(rowAfterFail.lastContactAt).toBeTruthy();
    expect(rowAfterFail.lastContactStatus).toBe("failed");
    expect(
      rowAfterFail.history.some(
        (entry) => entry.type === "reminder_send_failed" || entry.type === "reminder_sent",
      ),
    ).toBe(true);

    const retryApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret,
      emailSender: createMemorySender(sent),
    });
    // explicit re-prepare + send success path
    const prepare2 = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speakerId: grant.speakerId }),
      },
      env,
    );
    const draft2 = await prepare2.json<OnboardingReminderDraft>();
    const sendOk = await retryApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/reminders/${draft2.id}/send`,
      { method: "POST" },
      env,
    );
    expect(sendOk.status).toBe(200);
    const sentDraft = await sendOk.json<OnboardingReminderDraft>();
    expect(sentDraft.status).toBe("sent");
    expect(sent.some((message) => message.subject.length > 0)).toBe(true);
    expect(sent.some((message) => message.to.includes("@"))).toBe(true);

    const boardAfterSend = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/onboarding`,
        undefined,
        env,
      )
    ).json<OnboardingBoard>();
    const rowAfterSend = boardAfterSend.speakers.find(
      (speaker) => speaker.speakerId === grant.speakerId,
    )!;
    expect(rowAfterSend.lastContactStatus).toBe("sent");
    expect(rowAfterSend.history.some((entry) => entry.type === "reminder_sent")).toBe(true);

    // portal still has no private organizer history leakage
    const portal = await (await openPortal(token)).json<SpeakerPortalSession>();
    const leaked = JSON.stringify(portal);
    expect(leaked).not.toMatch(/reminder_send|lastError|committee|privateNote|digest/i);
  });

  it("prioritizes overdue speakers on the organizer board and rejects invalid portal tokens", async () => {
    const proposalId = "SUB-PODS0044";
    const { grant } = await acceptAndGrant(proposalId, `onb-prio-${proposalId}`);

    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: grant.speakerId,
          title: "Very overdue packet",
          instructions: "Finish ASAP",
          kind: "custom",
          completionRequirement: "manual",
          dueAt: "2020-01-01T00:00:00.000Z",
        }),
      },
      env,
    );

    const board = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/onboarding`,
        undefined,
        env,
      )
    ).json<OnboardingBoard>();
    expect(board.speakers[0]!.speakerId).toBe(grant.speakerId);
    expect(board.speakers[0]!.overdueCount).toBeGreaterThanOrEqual(1);

    const bad = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/profile?token=not-valid`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ biography: "nope" }),
      },
      env,
    );
    expect(bad.status).toBe(401);
    await expect(bad.json()).resolves.toEqual({
      error: "This portal link is invalid or has expired.",
    });
  });

  it("completes manual portal tasks and records history without exposing other speakers", async () => {
    const proposalId = "SUB-PODS0045";
    const { grant, token, cascade } = await acceptAndGrant(
      proposalId,
      `onb-manual-${proposalId}`,
    );
    const session = await (await openPortal(token)).json<SpeakerPortalSession>();
    const manual = session.tasks.find((task) => task.kind === "profile");
    expect(manual).toBeTruthy();

    const complete = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/portal/tasks/${manual!.id}/complete?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(complete.status).toBe(200);
    const after = await complete.json<SpeakerPortalSession>();
    expect(after.tasks.find((task) => task.id === manual!.id)?.status).toBe("completed");

    const otherSpeaker = cascade.speakers.find((row) => row.id !== grant.speakerId);
    if (otherSpeaker) {
      const board = await (
        await adminApp.request(
          `https://chartstead.test/api/events/${eventId}/onboarding`,
          undefined,
          env,
        )
      ).json<OnboardingBoard>();
      const mine = board.speakers.find((row) => row.speakerId === grant.speakerId)!;
      expect(mine.history.every((entry) => entry.speakerId === grant.speakerId)).toBe(true);
    }
  });
});
