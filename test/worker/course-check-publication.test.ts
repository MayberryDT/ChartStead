import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan, PublicationPlanBody } from "../../shared/course-check";
import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  OrganizerProposal,
  PublicProgramResponse,
  SessionPlacementResponse,
} from "../../shared/events";
import { assertPublicProgramPayloadIsSafe } from "../../shared/public-program";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "course-check-06-publication-signing-secret";

const adminPrincipal = {
  id: "cc06-admin",
  displayName: "Publication Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret,
});

const publicApp = createApp({
  resolvePrincipal: async () => null,
  signingSecret,
});

async function loadEvent() {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function listProposals(): Promise<OrganizerProposal[]> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/proposals`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposals: OrganizerProposal[] }>();
  return body.proposals;
}

async function acceptProposal(proposalId: string, key: string): Promise<void> {
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
}

async function getAgenda(): Promise<AgendaWorkspaceResponse> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/sessions`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<AgendaWorkspaceResponse>();
}

async function placeSession(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<SessionPlacementResponse> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
  expect(response.status).toBe(200);
  return response.json<SessionPlacementResponse>();
}

async function createPublication(input: {
  operation: "publish" | "unpublish" | "restore";
  restoreRevisionId?: string;
  key: string;
}): Promise<{ status: number; plan: CourseCheckPlan | { error: string; code?: string } }> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/publications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.key,
      },
      body: JSON.stringify({
        operation: input.operation,
        restoreRevisionId: input.restoreRevisionId,
        idempotencyKey: input.key,
      }),
    },
    env,
  );
  return {
    status: response.status,
    plan: await response.json(),
  };
}

async function applyPublication(
  plan: CourseCheckPlan,
  key: string,
  overrides?: Array<{ findingId: string; reason?: string | null }>,
): Promise<{ status: number; body: CourseCheckPlan | { error: string; code?: string } }> {
  const stageId = plan.body.stages[0]?.id ?? "publish-program";
  const response = await adminApp.request(
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
        stageId,
        idempotencyKey: key,
        softWarningOverrides: overrides,
      }),
    },
    env,
  );
  return { status: response.status, body: await response.json() };
}

async function fetchProgram(): Promise<PublicProgramResponse> {
  const response = await publicApp.request(
    `https://chartstead.test/api/events/${eventId}/program`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<PublicProgramResponse>();
}

function asPublication(plan: CourseCheckPlan): PublicationPlanBody {
  expect(plan.body.actionType).toBe("publication");
  return plan.body as PublicationPlanBody;
}

function materialOverrides(plan: CourseCheckPlan): Array<{ findingId: string; reason: string }> {
  return plan.body.findings
    .filter((finding) => finding.severity === "warning" && finding.materialExternal)
    .map((finding) => ({
      findingId: finding.id,
      reason: "Accepted known issue for test publish",
    }));
}

describe("Course Check 06 program publication", () => {
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
    ]);
    await loadEvent();
  });

  it("opens Publish program Course Check without changing public state", async () => {
    const proposals = await listProposals();
    const first = proposals.find((item) => item.programOutcome == null && item.status !== "deny");
    expect(first).toBeTruthy();
    await acceptProposal(first!.id, `cc06-accept-${first!.id}`);

    const agenda = await getAgenda();
    const session = agenda.sessions.find((row) => row.proposalId === first!.id);
    expect(session).toBeTruthy();
    await placeSession(session!.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-07T15:00:00.000Z",
      endsAt: "2026-10-07T15:45:00.000Z",
    });

    const before = await fetchProgram();
    const beforeId = before.revision.id;

    const created = await createPublication({
      operation: "publish",
      key: `cc06-create-${first!.id}`,
    });
    expect(created.status).toBe(201);
    expect("id" in created.plan).toBe(true);
    if (!("id" in created.plan)) return;
    const body = asPublication(created.plan);
    expect(body.operation).toBe("publish");
    expect(body.stages[0]?.verb).toBe("Publish program");
    expect(body.includedSessionIds).toContain(session!.id);

    const after = await fetchProgram();
    expect(after.revision.id).toBe(beforeId);
  });

  it("excludes fully unplaced sessions from the default valid subset while allowing TBD", async () => {
    const proposals = await listProposals();
    const candidates = proposals.filter(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const [a, b] = candidates;
    await acceptProposal(a!.id, `cc06-subset-a-${a!.id}`);
    await acceptProposal(b!.id, `cc06-subset-b-${b!.id}`);
    const agenda = await getAgenda();
    const sessionA = agenda.sessions.find((row) => row.proposalId === a!.id)!;
    const sessionB = agenda.sessions.find((row) => row.proposalId === b!.id)!;
    await placeSession(sessionA.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
    });
    // sessionB stays fully unplaced

    const created = await createPublication({
      operation: "publish",
      key: `cc06-subset-${a!.id}-${b!.id}`,
    });
    expect(created.status).toBe(201);
    if (!("id" in created.plan)) return;
    const body = asPublication(created.plan);
    expect(body.includedSessionIds).toContain(sessionA.id);
    expect(body.includedSessionIds).not.toContain(sessionB.id);
    expect(body.excludedSessions.some((row) => row.sessionId === sessionB.id)).toBe(true);
  });

  it("requires override reasons for material schedule conflicts before publish", async () => {
    const proposals = await listProposals();
    const open = proposals.filter(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    expect(open.length).toBeGreaterThanOrEqual(2);
    const [a, b] = open;
    await acceptProposal(a!.id, `cc06-conflict-a-${a!.id}`);
    await acceptProposal(b!.id, `cc06-conflict-b-${b!.id}`);
    const agenda = await getAgenda();
    const sessionA = agenda.sessions.find((row) => row.proposalId === a!.id)!;
    const sessionB = agenda.sessions.find((row) => row.proposalId === b!.id)!;
    const placement = {
      roomId: "harbor-hall",
      startsAt: "2026-10-08T15:00:00.000Z",
      endsAt: "2026-10-08T15:45:00.000Z",
    };
    await placeSession(sessionA.id, placement);
    await placeSession(sessionB.id, placement);

    const created = await createPublication({
      operation: "publish",
      key: `cc06-conflict-${a!.id}-${b!.id}`,
    });
    expect(created.status).toBe(201);
    if (!("id" in created.plan)) return;
    const body = asPublication(created.plan);
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(
      body.findings.some(
        (finding) => finding.materialExternal && finding.code === "schedule_conflict_publish",
      ),
    ).toBe(true);

    const blocked = await applyPublication(created.plan, `cc06-conflict-apply-block`);
    expect(blocked.status).toBe(400);
    if ("code" in blocked.body) {
      expect(blocked.body.code).toBe("override_reason_required");
    }

    const applied = await applyPublication(
      created.plan,
      `cc06-conflict-apply-ok`,
      materialOverrides(created.plan),
    );
    expect(applied.status).toBe(200);
    if (!("id" in applied.body)) return;
    expect(applied.body.state).toBe("Complete");
    expect(applied.body.approval?.stageId).toBe("publish-program");
  });

  it("publishes atomically, keeps privacy, and serves feed/ICS from the new current revision", async () => {
    const proposals = await listProposals();
    const open = proposals.find(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    expect(open).toBeTruthy();
    await acceptProposal(open!.id, `cc06-pub-${open!.id}`);
    const agenda = await getAgenda();
    const session = agenda.sessions.find((row) => row.proposalId === open!.id)!;
    await placeSession(session.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-08T17:00:00.000Z",
      endsAt: "2026-10-08T17:45:00.000Z",
    });

    const before = await fetchProgram();
    const created = await createPublication({
      operation: "publish",
      key: `cc06-publish-${open!.id}`,
    });
    expect(created.status).toBe(201);
    if (!("id" in created.plan)) return;

    const applied = await applyPublication(
      created.plan,
      `cc06-publish-apply-${open!.id}`,
      materialOverrides(created.plan),
    );
    expect(applied.status).toBe(200);
    if (!("id" in applied.body)) return;
    expect(applied.body.receipt).toBeTruthy();

    const after = await fetchProgram();
    expect(after.revision.id).not.toBe(before.revision.id);
    expect(after.revision.isCurrent).toBe(true);
    expect(after.sessions.some((row) => row.id === session.id)).toBe(true);
    expect(assertPublicProgramPayloadIsSafe(after)).toEqual([]);
    expect(JSON.stringify(after)).not.toMatch(/committeeNote|onboarding|portalToken|"email"/);

    const ics = await publicApp.request(
      `https://chartstead.test/api/events/${eventId}/program/sessions/${session.id}/calendar.ics`,
      undefined,
      env,
    );
    expect(ics.status).toBe(200);
    expect(ics.headers.get("cache-control") ?? "").toContain("max-age=300");
    const text = await ics.text();
    expect(text).toContain(`UID:${session.calendarUid || `cal_${session.id}`}`);
  });

  it("marks publication plans out of date when the working schedule changes", async () => {
    const proposals = await listProposals();
    const open = proposals.find(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    expect(open).toBeTruthy();
    await acceptProposal(open!.id, `cc06-stale-${open!.id}`);
    const agenda = await getAgenda();
    const session = agenda.sessions.find((row) => row.proposalId === open!.id)!;
    await placeSession(session.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-09T15:00:00.000Z",
      endsAt: "2026-10-09T15:45:00.000Z",
    });

    const created = await createPublication({
      operation: "publish",
      key: `cc06-stale-create-${open!.id}`,
    });
    expect(created.status).toBe(201);
    if (!("id" in created.plan)) return;

    await placeSession(session.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-09T16:00:00.000Z",
      endsAt: "2026-10-09T16:45:00.000Z",
    });

    const reloaded = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${created.plan.id}`,
      undefined,
      env,
    );
    expect(reloaded.status).toBe(200);
    const plan = await reloaded.json<CourseCheckPlan>();
    expect(plan.state).toBe("Out of date");

    const apply = await applyPublication(created.plan, `cc06-stale-apply-${open!.id}`);
    expect(apply.status).toBe(409);
    if ("code" in apply.body) {
      expect(apply.body.code).toBe("relevant_input_changed");
    }
  });

  it("unpublish and restore create new reviewed public revisions", async () => {
    const before = await fetchProgram();
    expect(before.sessions.length).toBeGreaterThan(0);
    const priorId = before.revision.id;

    const unpub = await createPublication({
      operation: "unpublish",
      key: `cc06-unpublish-${priorId}`,
    });
    expect(unpub.status).toBe(201);
    if (!("id" in unpub.plan)) return;
    const unpubApplied = await applyPublication(
      unpub.plan,
      `cc06-unpublish-apply-${priorId}`,
      materialOverrides(unpub.plan),
    );
    expect(unpubApplied.status).toBe(200);

    const empty = await fetchProgram();
    expect(empty.revision.id).not.toBe(priorId);
    expect(empty.sessions).toEqual([]);
    expect(empty.revisions.some((row) => row.id === priorId)).toBe(true);

    const restore = await createPublication({
      operation: "restore",
      restoreRevisionId: priorId,
      key: `cc06-restore-${priorId}`,
    });
    expect(restore.status).toBe(201);
    if (!("id" in restore.plan)) return;
    const restoreApplied = await applyPublication(
      restore.plan,
      `cc06-restore-apply-${priorId}`,
      materialOverrides(restore.plan),
    );
    expect(restoreApplied.status).toBe(200);

    const restored = await fetchProgram();
    expect(restored.revision.id).not.toBe(priorId);
    expect(restored.revision.id).not.toBe(empty.revision.id);
    expect(restored.sessions.length).toBe(before.sessions.length);
    expect(restored.revisions.some((row) => row.id === priorId)).toBe(true);
  });

  it("creates linked communication stubs without delivery on calendar consequences", async () => {
    const proposals = await listProposals();
    let agenda = await getAgenda();
    // Prefer an already-accepted session from earlier suite tests; otherwise accept one.
    let session = agenda.sessions[0];
    let proposalId = session?.proposalId ?? null;
    if (!session || !proposalId) {
      const open = proposals.find(
        (item) => item.programOutcome == null && item.status !== "deny",
      );
      expect(open).toBeTruthy();
      proposalId = open!.id;
      await acceptProposal(proposalId, `cc06-link-${proposalId}-${crypto.randomUUID()}`);
      agenda = await getAgenda();
      session = agenda.sessions.find((row) => row.proposalId === proposalId)!;
    }
    expect(session).toBeTruthy();
    // Fully scheduled placement records a pending calendar create intent.
    await placeSession(session.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-10T15:00:00.000Z",
      endsAt: "2026-10-10T15:45:00.000Z",
    });

    const afterPlace = await getAgenda();
    expect(afterPlace.calendarIntents.length).toBeGreaterThan(0);

    const created = await createPublication({
      operation: "publish",
      key: `cc06-link-create-${proposalId}-${crypto.randomUUID()}`,
    });
    expect(created.status).toBe(201);
    if (!("id" in created.plan)) return;
    const body = asPublication(created.plan);
    expect(body.calendarConsequences.length).toBeGreaterThan(0);

    const applied = await applyPublication(
      created.plan,
      `cc06-link-apply-${proposalId}-${crypto.randomUUID()}`,
      materialOverrides(created.plan),
    );
    expect(applied.status).toBe(200);
    if (!("id" in applied.body)) return;
    const appliedBody = asPublication(applied.body);
    expect(appliedBody.linkedPlanIds.length).toBeGreaterThan(0);
    const linkedId = appliedBody.linkedPlanIds[0]!;
    const linked = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${linkedId}`,
      undefined,
      env,
    );
    expect(linked.status).toBe(200);
    const linkedPlan = await linked.json<CourseCheckPlan>();
    expect(linkedPlan.actionType).toBe("communication");
    expect(linkedPlan.receipt).toBeNull();
    expect(linkedPlan.body.actionType).toBe("communication");
    if (linkedPlan.body.actionType === "communication") {
      expect(linkedPlan.body.drafts).toEqual([]);
      expect(
        linkedPlan.body.findings.some((f) => f.code === "no_implicit_delivery"),
      ).toBe(true);
    }
  });
});
