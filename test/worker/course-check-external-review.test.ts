import { describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import { projectCourseCheckForViewer } from "../../worker/course-check/projection";

const actor = { id: "admin-1", displayName: "Ada Admin", kind: "human" as const };

function publicationPlan(): CourseCheckPlan {
  return {
    id: "publication-1",
    eventId: "event-1",
    actionType: "publication",
    state: "Needs review",
    version: 1,
    digest: "digest-publication",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
    createdBy: actor,
    approval: null,
    receipt: null,
    body: {
      actionType: "publication",
      operation: "publish",
      workingFingerprint: "working-1",
      publicRevisionId: null,
      publicRevisionVersion: null,
      restoreFromRevisionId: null,
      proposedSnapshot: { sessions: [], speakers: [] },
      sessionDeltas: [],
      includedSessionIds: ["session-1", "session-2"],
      excludedSessions: [
        { sessionId: "session-3", title: "Unplaced session", reasons: ["Room is TBD"] },
      ],
      conflicts: [
        {
          conflictId: "conflict-1",
          kind: "speaker_overlap",
          summary: "A speaker is scheduled twice",
          sessionIds: ["session-1", "session-2"],
          sessionTitles: ["First", "Second"],
        },
      ],
      calendarConsequences: [
        {
          sessionId: "session-1",
          kind: "update",
          uid: "private-stable-uid@example.test",
          sequence: 4,
          title: "First",
          startsAt: "2026-09-01T10:00:00.000Z",
          endsAt: "2026-09-01T11:00:00.000Z",
          roomId: "room-1",
          roomName: "Auditorium",
          locationPending: false,
          timePending: false,
          recipients: [{ email: "speaker@example.test", name: "Speaker" }],
          previous: {
            startsAt: "2026-09-01T09:00:00.000Z",
            endsAt: "2026-09-01T10:00:00.000Z",
            roomId: "room-1",
            roomName: "Auditorium",
          },
          reversibility: "compensating_update_or_cancel",
        },
      ],
      deltas: [],
      findings: [
        {
          id: "conflict-1",
          severity: "warning",
          code: "schedule_conflict_publish",
          message: "Publishing with known speaker overlap.",
          recoveryGuidance: "Resolve, exclude, or provide a reasoned override.",
          entityRef: "session-1,session-2",
          materialExternal: true,
        },
        {
          id: "tbd-1",
          severity: "info",
          code: "session_tbd",
          message: "One included session still has a TBD location.",
          entityRef: "session-1",
        },
      ],
      stages: [
        { id: "publish-program", label: "Publish", status: "ready", verb: "Publish program", external: true },
        { id: "write-airtable", label: "Airtable", status: "ready", verb: "Write to Airtable", external: true },
      ],
      airtable: {
        configured: false,
        disposition: "active",
        summary: "2 session records are ready; Airtable is unavailable.",
        effects: [
          {
            id: "airtable-1",
            planId: "publication-1",
            planVersion: 1,
            kind: "session",
            chartsteadId: "session-1",
            tableName: "Sessions",
            operation: "update",
            fields: { title: "First" },
            beforeFields: { title: "Old first" },
            providerRecordId: "rec-1",
            state: "unknown",
            attemptCount: 1,
            lastError: "Provider timed out",
            nextAttemptAt: null,
            compensatesEffectId: null,
          },
        ],
      },
      evidenceSections: [],
      softWarningOverrides: [],
      linkedPlanIds: [],
      parentPlanId: null,
      ageWarningHours: 24,
      ageWarning: null,
    },
  };
}

function communicationPlan(): CourseCheckPlan {
  return {
    id: "communication-1",
    eventId: "event-1",
    actionType: "communication",
    state: "Needs attention",
    version: 3,
    digest: "digest-communication",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:10:00.000Z",
    createdBy: actor,
    approval: null,
    receipt: null,
    body: {
      actionType: "communication",
      source: { kind: "selection", decisionPlanId: null, decisionPlanVersion: null, decisionPlanDigest: null, selection: null },
      purpose: "calendar_update",
      templateKind: "custom",
      subject: "Schedule update",
      bodyText: "Update",
      bodyHtml: "<p>Update</p>",
      recipientGroups: [],
      recipients: [],
      drafts: [],
      effects: [
        {
          effectId: "effect-failed",
          planId: "communication-1",
          planVersion: 3,
          draftId: "draft-1",
          payloadIdentity: "payload-1",
          toEmail: "failed@example.test",
          status: "permanent_failure",
          providerReference: null,
          attemptCount: 1,
          lastError: "Mailbox rejected",
          nextAttemptAt: null,
          lastAttemptAt: "2026-08-12T10:05:00.000Z",
          succeededAt: null,
          createdAt: "2026-08-12T10:00:00.000Z",
          updatedAt: "2026-08-12T10:05:00.000Z",
        },
        {
          effectId: "effect-unknown",
          planId: "communication-1",
          planVersion: 3,
          draftId: "draft-2",
          payloadIdentity: "payload-2",
          toEmail: "unknown@example.test",
          status: "unknown",
          providerReference: "provider-2",
          attemptCount: 1,
          lastError: "Provider outcome unknown",
          nextAttemptAt: null,
          lastAttemptAt: "2026-08-12T10:05:00.000Z",
          succeededAt: null,
          createdAt: "2026-08-12T10:00:00.000Z",
          updatedAt: "2026-08-12T10:05:00.000Z",
        },
      ],
      deliverySummary: { total: 2, queued: 0, sending: 0, succeeded: 0, retryScheduled: 0, failed: 1, unknown: 1 },
      calendarOps: [],
      deltas: [],
      findings: [],
      stages: [
        { id: "send-messages", label: "Send", status: "complete", verb: "Send messages", external: true },
      ],
      airtable: { configured: false, disposition: "removed", summary: "No Airtable stage.", effects: [] },
      evidenceSections: [],
      softWarningOverrides: [],
      stageVisibility: { decision: "not_started", draft: "complete", send: "complete", delivery: "needs_attention" },
      linkedPlanIds: [],
      parentPlanId: null,
      compensation: null,
      batchGroupId: null,
      splitExplanation: null,
      relevantRevisions: { proposalIds: [], proposalRevisions: {}, speakerEmails: [], contentFingerprint: "message-1" },
      ageWarningHours: 24,
      ageWarning: null,
    },
  };
}

const adminProjection = {
  role: "admin" as const,
  trackIds: [],
  canViewCommunicationEvidence: true,
  canViewFullDecisionEvidence: true,
  permittedStageIds: ["publish-program", "write-airtable", "send-messages"],
};

describe("unified external-effect review projection", () => {
  it("names attendee publication, exceptions, calendar operations, and optional Airtable actions in business language", () => {
    const projected = projectCourseCheckForViewer(publicationPlan(), adminProjection);
    const review = projected?.externalReview;

    expect(review).toMatchObject({
      kind: "external_effect_review",
      family: "publication",
      title: "Publish 2 sessions to the attendee program",
      attentionCount: 3,
      primaryActionLabel: "Publish 2 sessions to the attendee program",
    });
    expect(review?.effectGroups.map((group) => [group.key, group.count, group.state])).toEqual(
      expect.arrayContaining([
        ["publication", 2, "pending"],
        ["exclusions", 1, "unchanged"],
        ["calendar", 1, "pending"],
        ["airtable", 1, "unknown"],
      ]),
    );
    expect(review?.issues.map((issue) => issue.label)).toEqual(
      expect.arrayContaining(["Check", "Details", "Could not check"]),
    );
    expect(review?.issues.flatMap((issue) => issue.actions).map((action) => action.label)).toEqual(
      expect.arrayContaining(["Open affected session", "Exclude affected sessions", "Record reasoned override"]),
    );
    expect(review?.permittedActions.map((action) => action.stageId)).toEqual([
      "publish-program",
      "write-airtable",
    ]);
    expect(review?.integrationActions.map((action) => action.label)).toEqual(
      expect.arrayContaining(["Write 1 record to Airtable", "Defer Airtable", "Remove Airtable stage", "Reconcile unknown writes"]),
    );
    expect(review?.effectGroups.find((group) => group.key === "calendar")?.details[0]).toContain("Update First");
    expect(review?.effectGroups.find((group) => group.key === "calendar")?.providerDetails[0]).toContain("private-stable-uid@example.test");
  });

  it("removes mutating actions for a read-only projection without changing review truth", () => {
    const projected = projectCourseCheckForViewer(publicationPlan(), {
      ...adminProjection,
      role: "reviewer",
      permittedStageIds: [],
      canViewCommunicationEvidence: false,
      canViewFullDecisionEvidence: false,
    });

    expect(projected?.externalReview?.title).toBe("Publish 2 sessions to the attendee program");
    expect(projected?.externalReview?.permittedActions).toEqual([]);
    expect(projected?.externalReview?.integrationActions).toEqual([]);
    expect(projected?.externalReview?.effectGroups.find((group) => group.key === "calendar")?.providerDetails).toEqual([]);
  });

  it("reports partial delivery and safe recovery without calling unknown outcomes complete", () => {
    const projected = projectCourseCheckForViewer(communicationPlan(), adminProjection);
    const review = projected?.externalReview;

    expect(review).toMatchObject({
      family: "communication",
      phase: "needs_attention",
      title: "Recover delivery for 2 people",
      attentionCount: 2,
      primaryActionLabel: null,
      result: {
        state: "needs_attention",
        summary: "0 of 2 deliveries succeeded; 1 failed and 1 has an unknown outcome.",
      },
    });
    expect(review?.issues.map((issue) => issue.summary)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("failed@example.test"),
        expect.stringContaining("unknown@example.test"),
      ]),
    );
    expect(review?.issues.flatMap((issue) => issue.actions).map((action) => action.label)).toEqual(
      expect.arrayContaining(["Retry this address", "Reconcile provider outcome", "Create reviewed correction"]),
    );
  });

  it("collapses clean publication groups and reports the durable attendee result exactly", () => {
    const clean = publicationPlan();
    clean.state = "Complete";
    clean.body.findings = [];
    if (clean.body.actionType !== "publication") throw new Error("Expected publication");
    clean.body.excludedSessions = [];
    clean.body.conflicts = [];
    clean.body.calendarConsequences = [];
    clean.body.airtable = {
      configured: false,
      disposition: "removed",
      summary: "No Airtable write was required.",
      effects: [],
    };
    clean.receipt = {
      id: "receipt-publication",
      planId: clean.id,
      planVersion: 1,
      digest: clean.digest,
      stageId: "publish-program",
      appliedAt: "2026-08-12T10:20:00.000Z",
      actor,
    };

    const review = projectCourseCheckForViewer(clean, adminProjection)?.externalReview;

    expect(review?.attentionCount).toBe(0);
    expect(review?.effectGroups.map((group) => group.key)).toEqual(["publication"]);
    expect(review?.permittedActions).toEqual([]);
    expect(review?.result).toMatchObject({
      state: "complete",
      summary: "2 sessions were published to the attendee program. No Airtable write was required.",
      processed: 2,
      succeeded: 2,
      failed: 0,
      unknown: 0,
      compensated: 0,
    });
  });

  it("keeps a correction separate from its immutable successful delivery", () => {
    const correction = communicationPlan();
    if (correction.body.actionType !== "communication") throw new Error("Expected communication");
    correction.state = "Complete";
    correction.body.effects = [
      {
        ...correction.body.effects[0]!,
        effectId: "correction-effect",
        toEmail: "corrected@example.test",
        status: "succeeded",
        providerReference: "provider-correction",
        succeededAt: "2026-08-12T10:15:00.000Z",
        lastError: null,
      },
    ];
    correction.body.deliverySummary = {
      total: 1,
      queued: 0,
      sending: 0,
      succeeded: 1,
      retryScheduled: 0,
      failed: 0,
      unknown: 0,
    };
    correction.body.compensation = {
      originalPlanId: "original-plan",
      originalEffectId: "original-effect",
      reason: "Corrected the room name",
    };

    const review = projectCourseCheckForViewer(correction, adminProjection)?.externalReview;

    expect(review?.effectGroups.find((group) => group.key === "compensation")).toMatchObject({
      state: "compensated",
      count: 1,
      summary: expect.stringContaining("original-effect remains immutable"),
    });
    expect(review?.result).toMatchObject({
      state: "complete",
      succeeded: 1,
      failed: 0,
      unknown: 0,
    });
    expect(review?.result?.summary).toBe(
      "1 of 1 deliveries succeeded; 0 failed and 0 have an unknown outcome.",
    );
  });
});
