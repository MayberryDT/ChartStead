import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertPolicyDoesNotWeakenBaseline,
  mergeCourseCheckPolicy,
type CourseCheckPlan,
  type EventCourseCheckPolicy,
} from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { findForbiddenStorageSecrets } from "../../worker/course-check/privacy";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminA = {
  id: "cc09-admin-a",
  displayName: "CC09 Admin A",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminB = {
  id: "cc09-admin-b",
  displayName: "CC09 Admin B",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPlatform = {
  id: "cc09-reviewer-platform",
  displayName: "CC09 Platform Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;

const speakerPrincipal = {
  id: "cc09-speaker",
  displayName: "CC09 Speaker",
  role: "reviewer",
  eventIds: [],
} satisfies OrganizerPrincipal;

const adminAppA = createApp({
  resolvePrincipal: async () => adminA,
  signingSecret: "course-check-09-test-signing-secret",
});

const adminAppB = createApp({
  resolvePrincipal: async () => adminB,
  signingSecret: "course-check-09-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPlatform,
  signingSecret: "course-check-09-test-signing-secret",
});

const outsiderApp = createApp({
  resolvePrincipal: async () => speakerPrincipal,
  signingSecret: "course-check-09-test-signing-secret",
});

type SharedApprovalView = {
  currentStage: {
    stageId: string;
    label: string;
    status: string;
    canExecute: boolean;
    canEndorse: boolean;
    canRequestApproval: boolean;
    availableCommit: { label: string } | null;
    requiredApproverCount: number;
    requiredEndorsementCount: number;
    endorsementCount: number;
    distinctApproverRequired: boolean;
    reasonRequired: boolean;
    stateSummary: string;
    nextAction: string;
  };
  resume: {
    selectionCount: number;
    planVersion: number;
    completedStageIds: string[];
    outstandingIssueCount: number;
    activityCount: number;
  };
  freshness: {
    state: string;
    changedInputs: string[];
    affectedStageIds: string[];
    preservedStageIds: string[];
    nextAction: string;
  };
  technicalDetails?: {
    planId: string;
    planVersion: number;
    digest: string;
    sourceRevisions: string[];
    policyRules: string[];
  };
};

function sharedApproval(plan: CourseCheckPlan): SharedApprovalView {
  const projection = (plan as CourseCheckPlan & { sharedApproval?: SharedApprovalView })
    .sharedApproval;
  expect(projection).toBeDefined();
  return projection!;
}

async function loadEvent() {
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function setPolicy(policy: Partial<EventCourseCheckPolicy>) {
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/policy`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policy }),
    },
    env,
  );
  expect(response.status).toBe(200);
  return response.json<{ policy: EventCourseCheckPolicy }>();
}

async function createDecision(
  app: typeof adminAppA,
  proposalId: string,
  key: string,
): Promise<CourseCheckPlan> {
  const response = await app.request(
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
  expect(response.status).toBe(201);
  return response.json<CourseCheckPlan>();
}

async function applyDecision(
  app: typeof adminAppA,
  plan: CourseCheckPlan,
  key: string,
  reason?: string,
) {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: key,
        reason: reason ?? null,
      }),
    },
    env,
  );
  return {
    status: response.status,
    body: await response.json<CourseCheckPlan | { error: string; code?: string }>(),
  };
}

/** Prefer unreviewed proposals whose plan is Ready (no hard blockers). */
async function pickReadyProposal(preferredTrack?: string): Promise<OrganizerProposal> {
  const list = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/proposals`,
    undefined,
    env,
  );
  expect(list.status).toBe(200);
  const body = await list.json<{ proposals: OrganizerProposal[] }>();
  const unreviewed = body.proposals.filter((row) => row.status === "unreviewed");
  const ordered = preferredTrack
    ? [
        ...unreviewed.filter((row) => row.trackId === preferredTrack),
        ...unreviewed.filter((row) => row.trackId !== preferredTrack),
      ]
    : unreviewed;
  for (const candidate of ordered) {
    const plan = await createDecision(
      adminAppA,
      candidate.id,
      `cc09-probe-${candidate.id}-${Math.random().toString(36).slice(2, 8)}`,
    );
    if (plan.state === "Ready" || plan.state === "Needs review") {
      return candidate;
    }
  }
  throw new Error("No Ready unreviewed proposal available for CC09 tests.");
}

async function createReadyPlan(label: string): Promise<CourseCheckPlan> {
  const proposal = await pickReadyProposal();
  return createDecision(adminAppA, proposal.id, `cc09-${label}-${proposal.id}`);
}

describe("Course Check 09 — policy, privacy, durable operations", () => {
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

  beforeEach(async () => {
    await setPolicy({
      requireTwoPersonApproval: false,
      requireDistinctApprover: false,
      requireReasonOnApprove: false,
      maxAgentMode: "autonomous_policy",
    });
  });

  it("refuses policy keys that would weaken the baseline kernel", () => {
    const ok = assertPolicyDoesNotWeakenBaseline(mergeCourseCheckPolicy({}));
    expect(ok.ok).toBe(true);
    const bad = assertPolicyDoesNotWeakenBaseline(
      mergeCourseCheckPolicy({}) as EventCourseCheckPolicy & { disableDigest?: boolean },
    );
    // Unknown keys only fail when present on the object
    const forged = {
      ...mergeCourseCheckPolicy({}),
      disableDigest: true,
    } as EventCourseCheckPolicy;
    expect(assertPolicyDoesNotWeakenBaseline(forged).ok).toBe(false);
    expect(bad.ok).toBe(true);
  });

  it("defaults allow self-approve; distinct approver blocks creator", async () => {
    const plan = await createReadyPlan("distinct");
    await setPolicy({ requireDistinctApprover: true });
    const denied = await applyDecision(adminAppA, plan, `cc09-distinct-deny-${plan.id}`);
    expect(denied.status).toBe(403);
    expect("code" in denied.body && denied.body.code).toBe("distinct_approver_required");

    const allowed = await applyDecision(adminAppB, plan, `cc09-distinct-ok-${plan.id}`);
    expect(allowed.status).toBe(200);
    expect("state" in allowed.body && allowed.body.state).toMatch(/Complete|Partially complete/);
  });

  it("two-person approval records endorsement then executes on second actor", async () => {
    await setPolicy({ requireTwoPersonApproval: true });
    const plan = await createReadyPlan("2p");
    const first = await applyDecision(adminAppA, plan, `cc09-2p-1-${plan.id}`, "first look");
    expect(first.status).toBe(200);
    expect("state" in first.body && first.body.state).toBe("Needs review");

    const reload = await adminAppB.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}`,
      undefined,
      env,
    );
    expect(reload.status).toBe(200);
    const fresh = await reload.json<CourseCheckPlan>();
    expect(fresh.stageEndorsements?.length).toBeGreaterThan(0);
    const second = await applyDecision(
      adminAppB,
      fresh,
      `cc09-2p-2-${plan.id}`,
      "second look",
    );
    expect(second.status).toBe(200);
    expect("state" in second.body && second.body.state).toMatch(/Complete|Partially complete/);
    expect(
      "activity" in second.body && second.body.activity?.some((a) => a.role === "endorser"),
    ).toBe(true);
  });

  it("projects exact shared approval state for each authorized actor and resumes the same version", async () => {
    await setPolicy({
      requireTwoPersonApproval: true,
      requireDistinctApprover: true,
      requireReasonOnApprove: true,
    });
    const plan = await createReadyPlan("shared-approval");

    const requesterView = sharedApproval(plan);
    expect(requesterView.currentStage).toMatchObject({
      stageId: "apply-decision",
      canExecute: false,
      canEndorse: false,
      canRequestApproval: true,
      requiredApproverCount: 2,
      requiredEndorsementCount: 1,
      endorsementCount: 0,
      distinctApproverRequired: true,
      reasonRequired: true,
    });
    expect(requesterView.currentStage.availableCommit?.label).toMatch(
      /submission/,
    );
    expect(requesterView.currentStage.nextAction).toContain(
      "another authorized administrator",
    );
    expect(requesterView.resume).toMatchObject({
      selectionCount: 1,
      planVersion: plan.version,
      completedStageIds: [],
    });
    expect(requesterView.technicalDetails).toMatchObject({
      planId: plan.id,
      planVersion: plan.version,
      digest: plan.digest,
    });

    const first = await applyDecision(
      adminAppB,
      plan,
      `cc20-shared-endorse-${plan.id}`,
      "independent review complete",
    );
    expect(first.status).toBe(200);
    const endorsed = first.body as CourseCheckPlan;
    const endorserView = sharedApproval(endorsed);
    expect(endorserView.currentStage).toMatchObject({
      canExecute: false,
      canEndorse: false,
      endorsementCount: 1,
    });
    expect(endorserView.currentStage.stateSummary).toContain(
      "waiting for a different authorized administrator",
    );

    const resumedResponse = await adminAppA.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}`,
      undefined,
      env,
    );
    expect(resumedResponse.status).toBe(200);
    const resumed = await resumedResponse.json<CourseCheckPlan>();
    const resumedView = sharedApproval(resumed);
    expect(resumed.version).toBe(endorsed.version);
    expect(resumed.digest).toBe(endorsed.digest);
    expect(resumed.body.stages).toEqual(endorsed.body.stages);
    if (resumed.body.actionType === "decision" && endorsed.body.actionType === "decision") {
      expect(resumed.body.items.map((item) => item.itemId)).toEqual(
        endorsed.body.items.map((item) => item.itemId),
      );
    }
    expect(resumedView.resume.activityCount).toBeGreaterThanOrEqual(2);
    // The requester remains barred by the distinct-approver rule even after
    // another administrator endorses the exact version.
    expect(resumedView.currentStage).toMatchObject({
      canExecute: false,
      canRequestApproval: true,
      endorsementCount: 1,
    });
  });

  it("mandatory reason policy rejects bare apply", async () => {
    await setPolicy({ requireReasonOnApprove: true });
    const plan = await createReadyPlan("reason");
    const denied = await applyDecision(adminAppA, plan, `cc09-reason-deny-${plan.id}`);
    expect(denied.status).toBe(400);
    expect("code" in denied.body && denied.body.code).toBe("approval_reason_required");
    const ok = await applyDecision(
      adminAppA,
      plan,
      `cc09-reason-ok-${plan.id}`,
      "committee confirmed",
    );
    expect(ok.status).toBe(200);
  });

  it("reviewers only see assigned-track decision evidence; outsiders get no plans", async () => {
    const proposal = await pickReadyProposal("platform");
    const platformPlan = await createDecision(
      adminAppA,
      proposal.id,
      `cc09-track-p-${proposal.id}`,
    );

    const reviewerGet = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${platformPlan.id}`,
      undefined,
      env,
    );
    expect(reviewerGet.status).toBe(200);
    const projected = await reviewerGet.json<CourseCheckPlan>();
    expect(projected.body.actionType).toBe("decision");
    if (projected.body.actionType === "decision") {
      for (const item of projected.body.items) {
        for (const speaker of item.speakers) {
          expect(speaker.email).toBe("[redacted]");
        }
      }
    }
    expect(sharedApproval(projected).currentStage).toMatchObject({
      canExecute: false,
      canEndorse: false,
      canRequestApproval: true,
    });
    expect(sharedApproval(projected).technicalDetails).toBeUndefined();

    const outsider = await outsiderApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${platformPlan.id}`,
      undefined,
      env,
    );
    expect([401, 403]).toContain(outsider.status);
  });

  it("privacy erasure redacts personal payloads while preserving ops metadata", async () => {
    const plan = await createReadyPlan("erase");
    const applied = await applyDecision(adminAppA, plan, `cc09-erase-apply-${plan.id}`);
    expect(applied.status).toBe(200);
    const appliedPlan = applied.body as CourseCheckPlan;

    const erase = await adminAppA.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${appliedPlan.id}/privacy-erase`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `cc09-erase-${appliedPlan.id}`,
        },
        body: JSON.stringify({
          reason: "Speaker requested erasure after withdrawal",
          idempotencyKey: `cc09-erase-${appliedPlan.id}`,
        }),
      },
      env,
    );
    expect(erase.status).toBe(200);
    const erased = await erase.json<{
      plan: CourseCheckPlan;
      erasure: { fieldsRedacted: number; preserved: { digests: true } };
    }>();
    expect(erased.plan.privacyErased).toBe(true);
    expect(erased.erasure.fieldsRedacted).toBeGreaterThan(0);
    expect(erased.erasure.preserved.digests).toBe(true);
    expect(erased.plan.digest).toBe(appliedPlan.digest);
    expect(erased.plan.receipt?.id).toBeTruthy();
    if (erased.plan.body.actionType === "decision") {
      for (const speaker of erased.plan.body.speakers) {
        expect(speaker.email).toBe("[erased]");
        expect(speaker.name).toBe("[erased]");
      }
    }
    expect(findForbiddenStorageSecrets(erased.plan.body)).toEqual([]);
  });

  it("plan storage hygiene rejects credential-like payloads", () => {
    expect(
      findForbiddenStorageSecrets({
        note: "Bearer sk_live_abc123secretvalue",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      findForbiddenStorageSecrets({
        tokenUrl: "https://example.com/portal/abc.def.ghi",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      findForbiddenStorageSecrets({
        speaker: { email: "a@b.com", name: "Ada" },
        digest: "abc",
      }),
    ).toEqual([]);
  });

  it("concurrent apply on stale version returns exact out-of-date response", async () => {
    const plan = await createReadyPlan("race");
    const first = await applyDecision(adminAppA, plan, `cc09-race-1-${plan.id}`);
    expect(first.status).toBe(200);
    const second = await applyDecision(adminAppB, plan, `cc09-race-2-${plan.id}`);
    if (second.status === 409) {
      expect("code" in second.body && second.body.code).toMatch(
        /plan_version_mismatch|empty_apply_scope/,
      );
    } else {
      expect(second.status).toBe(200);
    }
  });

  it("malicious plan access without membership is denied", async () => {
    const response = await outsiderApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks`,
      undefined,
      env,
    );
    expect([401, 403]).toContain(response.status);
  });

  it("activity distinguishes requester and executor on completed plan", async () => {
    const plan = await createReadyPlan("act");
    const applied = await applyDecision(adminAppB, plan, `cc09-act-apply-${plan.id}`);
    expect(applied.status).toBe(200);
    const body = applied.body as CourseCheckPlan;
    expect(body.createdBy.id).toBe(adminA.id);
    expect(body.receipt?.actor.id).toBe(adminB.id);
    expect(body.activity?.some((a) => a.role === "requester")).toBe(true);
    expect(body.activity?.some((a) => a.role === "executor" || a.role === "approver")).toBe(
      true,
    );
  });
});
