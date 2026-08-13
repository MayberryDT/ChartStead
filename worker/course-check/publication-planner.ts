import type {
  CalendarOperation,
  CommunicationPlanBody,
  CourseCheckDelta,
  CourseCheckFinding,
  CourseCheckStage,
  PublicationConflictEvidence,
  PublicationExclusion,
  PublicationOperation,
  PublicationPlanBody,
  PublicationSessionChange,
  PublicationSessionDelta,
} from "../../shared/course-check";
import { DEFAULT_AGE_WARNING_HOURS } from "../../shared/course-check";
import type {
  PublicProgramSession,
  PublicProgramSpeaker,
  ScheduleConflict,
} from "../../shared/events";
import {
  assessSessionPublishability,
  selectValidPublicSubset,
  sessionPublicFingerprint,
} from "../../shared/public-program";
import {
  airtableEffectDeltas,
  buildCourseCheckAirtableEvidence,
  emptyCourseCheckAirtableEvidence,
  withAirtableStage,
} from "./airtable-effects";
import { buildEvidenceSections } from "./evidence";

export interface PublicationPlannerInput {
  planId: string;
  operation: PublicationOperation;
  workingFingerprint: string;
  publicRevisionId: string | null;
  publicRevisionVersion: number | null;
  restoreFromRevisionId?: string | null;
  workingSessions: PublicProgramSession[];
  workingSpeakers: PublicProgramSpeaker[];
  currentPublicSessions: PublicProgramSession[];
  currentPublicSpeakers: PublicProgramSpeaker[];
  restoreSnapshot?: {
    sessions: PublicProgramSession[];
    speakers: PublicProgramSpeaker[];
  } | null;
  conflicts: ScheduleConflict[];
  calendarIntents: CalendarOperation[];
  ageWarningHours?: number;
}

function publicationStages(
  operation: PublicationOperation,
  hasBlockers: boolean,
): CourseCheckStage[] {
  const verbs: Record<PublicationOperation, { id: string; label: string; verb: string }> = {
    publish: {
      id: "publish-program",
      label: "Publish program",
      verb: "Publish program",
    },
    unpublish: {
      id: "unpublish-program",
      label: "Unpublish program",
      verb: "Unpublish program",
    },
    restore: {
      id: "restore-program",
      label: "Restore program revision",
      verb: "Restore program revision",
    },
  };
  const stage = verbs[operation];
  return [
    {
      id: stage.id,
      label: stage.label,
      status: hasBlockers ? "blocked" : "ready",
      verb: stage.verb,
      external: true,
    },
  ];
}

function classifySessionDelta(
  before: PublicProgramSession | null,
  after: PublicProgramSession | null,
): { change: PublicationSessionChange; changes: PublicationSessionChange[] } {
  if (!before && after) return { change: "add", changes: ["add"] };
  if (before && !after) return { change: "remove", changes: ["remove"] };
  if (!before || !after) return { change: "unchanged", changes: ["unchanged"] };
  const changes: PublicationSessionChange[] = [];
  if (before.title !== after.title) changes.push("title");
  if (before.description !== after.description) changes.push("description");
  if (before.startsAt !== after.startsAt || before.endsAt !== after.endsAt) {
    changes.push("time");
  }
  if (before.roomId !== after.roomId || before.roomName !== after.roomName) {
    changes.push("room");
  }
  const beforeSpeakers = before.speakers
    .map((s) => `${s.id}:${s.name}:${s.role}`)
    .sort()
    .join("|");
  const afterSpeakers = after.speakers
    .map((s) => `${s.id}:${s.name}:${s.role}`)
    .sort()
    .join("|");
  if (beforeSpeakers !== afterSpeakers) changes.push("speaker");
  if (changes.length === 0) return { change: "unchanged", changes: ["unchanged"] };
  return { change: changes[0]!, changes };
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "unplaced":
      return "fully unplaced (no time or room)";
    case "missing_title":
      return "missing public title";
    case "missing_description":
      return "missing public description";
    case "missing_speaker":
      return "no approved public speaker identity";
    case "private":
      return "marked private";
    case "content_not_approved":
      return "content is not approved";
    default:
      return reason;
  }
}

export function planPublication(input: PublicationPlannerInput): PublicationPlanBody {
  const findings: CourseCheckFinding[] = [];
  const deltas: CourseCheckDelta[] = [];
  const exclusions: PublicationExclusion[] = [];
  let proposedSessions: PublicProgramSession[] = [];
  let proposedSpeakers: PublicProgramSpeaker[] = [];

  if (input.operation === "unpublish") {
    proposedSessions = [];
    proposedSpeakers = [];
    findings.push({
      id: "unpublish-empty",
      severity: "info",
      code: "program_unpublish",
      message:
        "Unpublish creates a new empty current public revision. Prior revisions remain in history.",
    });
  } else if (input.operation === "restore") {
    if (!input.restoreSnapshot || !input.restoreFromRevisionId) {
      findings.push({
        id: "restore-missing-revision",
        severity: "blocker",
        code: "durable_integrity",
        message: "Restore requires an existing public revision to copy.",
        recoveryGuidance: "Pick a prior revision id, then create a new restore Course Check.",
      });
    } else {
      proposedSessions = input.restoreSnapshot.sessions;
      proposedSpeakers = input.restoreSnapshot.speakers;
      findings.push({
        id: "restore-from-revision",
        severity: "info",
        code: "program_restore",
        message: `Restore will create a new current revision from ${input.restoreFromRevisionId}. History is not deleted.`,
      });
    }
  } else {
    for (const session of input.workingSessions) {
      const assessment = assessSessionPublishability(session);
      if (!assessment.publishable) {
        exclusions.push({
          sessionId: session.id,
          title: session.title,
          reasons: assessment.reasons.map(reasonLabel),
        });
        findings.push({
          id: `excluded-${session.id}`,
          severity: "info",
          code: "session_excluded_from_public",
          message: `"${session.title}" stays internal: ${assessment.reasons.map(reasonLabel).join("; ")}.`,
          entityRef: session.id,
        });
      }
    }
    const subset = selectValidPublicSubset(
      input.workingSessions,
      input.workingSpeakers,
      Object.fromEntries(
        input.workingSessions.map((session) => [session.id, session.contentStatus ?? "draft"]),
      ),
    );
    proposedSessions = subset.sessions;
    proposedSpeakers = subset.speakers;

    for (const session of proposedSessions) {
      if (!session.startsAt || !session.endsAt || !session.roomId) {
        findings.push({
          id: `tbd-${session.id}`,
          severity: "info",
          code: "program_tbd_fields",
          message: `"${session.title}" will publish with TBD time and/or room.`,
          entityRef: session.id,
        });
      }
    }
  }

  const beforeById = new Map(
    input.currentPublicSessions.map((session) => [session.id, session] as const),
  );
  const afterById = new Map(proposedSessions.map((session) => [session.id, session] as const));
  const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const sessionDeltas: PublicationSessionDelta[] = [];

  for (const sessionId of allIds) {
    const before = beforeById.get(sessionId) ?? null;
    const after = afterById.get(sessionId) ?? null;
    const classified = classifySessionDelta(before, after);
    if (classified.change === "unchanged") continue;
    const title = after?.title ?? before?.title ?? sessionId;
    sessionDeltas.push({
      sessionId,
      title,
      change: classified.change,
      changes: classified.changes,
      before: before ? sessionPublicFingerprint(before) : null,
      after: after ? sessionPublicFingerprint(after) : null,
    });
    const action =
      classified.change === "add"
        ? "create"
        : classified.change === "remove"
          ? "remove"
          : "update";
    deltas.push({
      entityType: "public_session",
      action,
      summary: `Public session ${classified.changes.join(", ")}: ${title}`,
      before: before ? sessionPublicFingerprint(before) : null,
      after: after ? sessionPublicFingerprint(after) : null,
      sessionId,
    });
  }

  deltas.unshift({
    entityType: "public_revision",
    action: "create",
    summary:
      input.operation === "publish"
        ? `Create new public revision with ${proposedSessions.length} session(s).`
        : input.operation === "unpublish"
          ? "Create new empty public revision (unpublish)."
          : `Create new public revision restored from ${input.restoreFromRevisionId ?? "prior"}.`,
    before: input.publicRevisionId
      ? {
          revisionId: input.publicRevisionId,
          version: input.publicRevisionVersion,
          sessionCount: input.currentPublicSessions.length,
        }
      : null,
    after: {
      sessionCount: proposedSessions.length,
      speakerCount: proposedSpeakers.length,
      operation: input.operation,
    },
  });

  const includedIds = new Set(proposedSessions.map((session) => session.id));
  const materialConflicts: PublicationConflictEvidence[] = [];
  for (const conflict of input.conflicts) {
    const touchesIncluded = conflict.sessionIds.some((id) => includedIds.has(id));
    if (!touchesIncluded && input.operation === "publish") continue;
    if (input.operation !== "publish") continue;
    materialConflicts.push({
      conflictId: conflict.id,
      kind: conflict.kind,
      summary: conflict.summary,
      sessionIds: [...conflict.sessionIds],
      sessionTitles: [...conflict.sessionTitles],
    });
    findings.push({
      id: `conflict-${conflict.id}`,
      severity: "warning",
      code: "schedule_conflict_publish",
      message: `Publishing with known conflict: ${conflict.summary}`,
      recoveryGuidance:
        "Resolve the conflict, exclude an affected session, or provide an override reason to publish deliberately.",
      entityRef: conflict.sessionIds.join(","),
      materialExternal: true,
    });
  }

  const calendarConsequences = input.calendarIntents.filter((intent) =>
    input.operation === "publish" ? includedIds.has(intent.sessionId) : true,
  );
  if (calendarConsequences.length > 0) {
    findings.push({
      id: "linked-calendar-communication",
      severity: "info",
      code: "linked_communication_no_delivery",
      message: `${calendarConsequences.length} calendar consequence(s) will open a linked Communication Course Check without sending.`,
    });
    deltas.push({
      entityType: "communication_plan",
      action: "create",
      summary: `Create linked Communication Course Check for ${calendarConsequences.length} calendar operation(s) (no delivery).`,
      before: null,
      after: { calendarOps: calendarConsequences.length },
    });
    for (const op of calendarConsequences) {
      deltas.push({
        entityType: "calendar_invite",
        action: op.kind === "cancel" ? "cancel" : op.kind,
        summary: `Calendar ${op.kind} for “${op.title}” (uid ${op.uid}, seq ${op.sequence})${
          op.locationPending ? " · location pending" : ""
        }.`,
        sessionId: op.sessionId,
        after: {
          uid: op.uid,
          sequence: op.sequence,
          kind: op.kind,
          locationPending: op.locationPending,
          reversibility: op.reversibility,
        },
      });
    }
  } else {
    findings.push({
      id: "no-implicit-communication",
      severity: "info",
      code: "no_implicit_communication",
      message:
        "Publishing does not send speaker email or calendar invites. Linked communication stays separate.",
    });
  }

  findings.push({
    id: "privacy-filter",
    severity: "info",
    code: "program_privacy_filter",
    message:
      "Public payload excludes committee notes, onboarding tasks, portal tokens, and speaker emails.",
  });

  if (
    input.operation === "publish" &&
    proposedSessions.length === 0 &&
    input.workingSessions.length > 0
  ) {
    findings.push({
      id: "empty-valid-subset",
      severity: "warning",
      code: "program_empty_subset",
      message:
        "No sessions meet the default publishable subset. Publishing will create an empty public program.",
      materialExternal: true,
      recoveryGuidance:
        "Add public title/description/speakers and place or partially place sessions, or override with a reason.",
    });
  }

  const airtable = buildCourseCheckAirtableEvidence({
    planId: input.planId,
    resources: proposedSessions.map((session) => ({
      kind: "session" as const,
      chartsteadId: session.id,
      values: {
        title: session.title,
        format: session.format,
        trackId: session.trackId,
        roomId: session.roomId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
    })),
  });
  deltas.push(...airtableEffectDeltas(airtable));
  const hasBlockers = findings.some((finding) => finding.severity === "blocker");
  return {
    actionType: "publication",
    operation: input.operation,
    workingFingerprint: input.workingFingerprint,
    publicRevisionId: input.publicRevisionId,
    publicRevisionVersion: input.publicRevisionVersion,
    restoreFromRevisionId: input.restoreFromRevisionId ?? null,
    proposedSnapshot: {
      sessions: proposedSessions as unknown as Array<Record<string, unknown>>,
      speakers: proposedSpeakers as unknown as Array<Record<string, unknown>>,
    },
    sessionDeltas,
    includedSessionIds: proposedSessions.map((session) => session.id),
    excludedSessions: exclusions,
    conflicts: materialConflicts,
    calendarConsequences,
    deltas,
    findings,
    stages: withAirtableStage(
      publicationStages(input.operation, hasBlockers),
      airtable,
    ),
    airtable,
    evidenceSections: buildEvidenceSections({ findings, deltas }),
    softWarningOverrides: [],
    linkedPlanIds: [],
    parentPlanId: null,
    ageWarningHours: input.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
    ageWarning: null,
  };
}

export function publicationBodyDigestPayload(body: PublicationPlanBody): unknown {
  return {
    actionType: body.actionType,
    operation: body.operation,
    workingFingerprint: body.workingFingerprint,
    publicRevisionId: body.publicRevisionId,
    publicRevisionVersion: body.publicRevisionVersion,
    restoreFromRevisionId: body.restoreFromRevisionId,
    proposedSnapshot: body.proposedSnapshot,
    sessionDeltas: body.sessionDeltas,
    includedSessionIds: body.includedSessionIds,
    excludedSessions: body.excludedSessions,
    conflicts: body.conflicts,
    calendarConsequences: body.calendarConsequences,
    stages: body.stages,
    softWarningOverrides: body.softWarningOverrides,
    linkedPlanIds: body.linkedPlanIds,
    parentPlanId: body.parentPlanId,
    airtable: body.airtable,
  };
}

export function planCommunicationStub(input: {
  planId: string;
  parentPlanId: string;
  calendarOps: CalendarOperation[];
  ageWarningHours?: number;
}): CommunicationPlanBody {
  const findings: CourseCheckFinding[] = [
    {
      id: "comm-stub-no-delivery",
      severity: "info",
      code: "no_implicit_delivery",
      message:
        "This linked Communication Course Check holds calendar consequences from publication. Create drafts and send remain separate; nothing was delivered.",
    },
    {
      id: "calendar-delivery-separate",
      severity: "info",
      code: "calendar_delivery_separate",
      message:
        "Calendar delivery is separately approved from decision application and public-program release.",
    },
  ];
  const recipientGroups =
    input.calendarOps.length === 0
      ? []
      : input.calendarOps.map((op, index) => ({
          groupId: `grp_cal_${input.planId.slice(0, 8)}_${index}`,
          proposalId: null,
          sessionId: op.sessionId,
          label: op.title,
          outcome: null,
          recipients: op.recipients.map((recipient, recipientIndex) => ({
            recipientId: `rcp_cal_${input.planId.slice(0, 8)}_${index}_${recipientIndex}`,
            address: recipient.email,
            name: recipient.name,
            role: "speaker" as const,
            speakerId: null,
            inclusion: "include" as const,
            inclusionReason: `${recipient.name} is a session participant and should receive the calendar ${op.kind}.`,
            deliverability: "ok" as const,
            selected: true,
            priorCommunications: [],
          })),
        }));
  const deltas: CourseCheckDelta[] = input.calendarOps.map((op) => ({
    entityType: "calendar_invite",
    action: op.kind === "cancel" ? "cancel" : op.kind,
    summary: `Calendar ${op.kind} for “${op.title}” (uid ${op.uid}, seq ${op.sequence})${
      op.locationPending ? " · location pending" : ""
    }.`,
    before: op.previous,
    after: {
      sessionId: op.sessionId,
      kind: op.kind,
      uid: op.uid,
      sequence: op.sequence,
      startsAt: op.startsAt,
      endsAt: op.endsAt,
      roomId: op.roomId,
      roomName: op.roomName,
      locationPending: op.locationPending,
      timePending: op.timePending,
      recipients: op.recipients,
      reversibility: op.reversibility,
    },
    sessionId: op.sessionId,
  }));
  const selectedCount = recipientGroups.reduce(
    (sum, group) => sum + group.recipients.filter((row) => row.selected).length,
    0,
  );
  if (selectedCount === 0 && input.calendarOps.length > 0) {
    findings.push({
      id: "cal-no-recipients",
      severity: "blocker",
      code: "no_deliverable_recipients",
      message: "Calendar operations have no deliverable participant addresses.",
      recoveryGuidance: "Add speaker emails before creating calendar drafts.",
    });
  }
  const airtable = emptyCourseCheckAirtableEvidence();
  const hasBlockers = findings.some((finding) => finding.severity === "blocker");
  return {
    actionType: "communication",
    source: {
      kind: "publication",
      decisionPlanId: null,
      decisionPlanVersion: null,
      decisionPlanDigest: null,
      selection: null,
    },
    purpose: "calendar_update",
    templateKind: "custom",
    subject: "Program calendar update",
    bodyText:
      "Your session schedule has been updated. The attached calendar invite reflects the current plan. Nothing has been sent until Send messages is approved.",
    bodyHtml:
      "<p>Your session schedule has been updated. The attached calendar invite reflects the current plan. Nothing has been sent until Send messages is approved.</p>",
    parentPlanId: input.parentPlanId,
    calendarOps: input.calendarOps,
    drafts: [],
    effects: [],
    deliverySummary: {
      total: 0,
      queued: 0,
      sending: 0,
      succeeded: 0,
      retryScheduled: 0,
      failed: 0,
      unknown: 0,
    },
    recipients: [],
    recipientGroups,
    deltas,
    findings,
    stages: [
      {
        id: "create-drafts",
        label: "Create drafts",
        status: hasBlockers ? "blocked" : "ready",
        verb: "Create drafts",
        external: false,
      },
      {
        id: "send-messages",
        label: "Send messages",
        status: "pending",
        verb: "Send messages",
        external: true,
      },
    ],
    airtable,
    evidenceSections: buildEvidenceSections({ findings, deltas }),
    softWarningOverrides: [],
    stageVisibility: {
      decision: "not_started",
      draft: "ready",
      send: "not_started",
      delivery: "not_started",
    },
    linkedPlanIds: [input.parentPlanId],
    compensation: null,
    batchGroupId: null,
    splitExplanation: null,
    relevantRevisions: {
      proposalIds: [],
      proposalRevisions: {},
      speakerEmails: [
        ...new Set(
          input.calendarOps.flatMap((op) =>
            op.recipients.map((recipient) => recipient.email.toLowerCase()),
          ),
        ),
      ],
      contentFingerprint: `publication-calendar:${input.calendarOps
        .map((op) => `${op.sessionId}:${op.kind}:${op.uid}:${op.sequence}`)
        .join("|")}`,
    },
    ageWarningHours: input.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
    ageWarning: null,
  };
}

/** Digest for publication-linked communication stubs (full drafts use communication-planner). */
export function publicationCommunicationDigestPayload(
  body: CommunicationPlanBody,
): unknown {
  return {
    actionType: body.actionType,
    source: body.source,
    purpose: body.purpose,
    parentPlanId: body.parentPlanId,
    calendarOps: body.calendarOps,
    drafts: body.drafts,
    recipientGroups: body.recipientGroups,
    stages: body.stages.map((stage) => ({ id: stage.id, status: stage.status })),
    linkedPlanIds: body.linkedPlanIds,
  };
}

export function hasBlockerFindings(findings: CourseCheckFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocker");
}
