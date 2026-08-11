import type {
  AggregateProgress,
  CourseCheckDelta,
  CourseCheckFinding,
  CourseCheckStage,
  DecisionItem,
  DecisionPlanBody,
  GuaranteedSpeakerPlanBody,
  PlannedParticipation,
  PlannedPortalAccess,
  PlannedSession,
  PlannedSpeaker,
  PlannedTask,
  ProgramOutcome,
} from "../../shared/course-check";
import {
  DEFAULT_AGE_WARNING_HOURS,
  DEFAULT_DECISION_BATCH_LIMIT,
} from "../../shared/course-check";
import type { CoSpeakerInput, OrganizerProposal } from "../../shared/events";
import { buildEvidenceSections } from "./evidence";

export interface ExistingSpeaker {
  id: string;
  name: string;
  email: string;
  biography: string;
}

export interface DecisionPlannerInput {
  proposal: OrganizerProposal;
  outcome: ProgramOutcome;
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>;
  planId: string;
  itemIndex?: number;
}

export interface BatchDecisionPlannerInput {
  planId: string;
  batchGroupId: string;
  selections: Array<{ proposal: OrganizerProposal; outcome: ProgramOutcome }>;
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>;
  ageWarningHours?: number;
  parentPlanId?: string | null;
  linkedPlanIds?: string[];
  splitExplanation?: string | null;
}

export interface GuaranteedSpeakerPlannerInput {
  planId: string;
  sourceLabel: string;
  title: string;
  format: string;
  trackId: string;
  speakers: Array<{
    name: string;
    email: string;
    biography?: string;
    role?: "primary" | "co";
  }>;
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function plannedSpeakerId(scope: string, index: number): string {
  return `spk_${scope}_${index}`;
}

function plannedParticipationId(scope: string, index: number): string {
  return `prt_${scope}_${index}`;
}

function plannedSessionId(scope: string): string {
  return `ses_${scope}`;
}

function plannedTaskId(scope: string, index: number): string {
  return `tsk_${scope}_${index}`;
}

const DEFAULT_TASKS = [
  { kind: "profile", title: "Complete speaker profile" },
  { kind: "session_details", title: "Confirm session details" },
  { kind: "headshot", title: "Upload headshot" },
] as const;

function resolveSpeakerMatch(
  email: string,
  name: string,
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>,
): {
  match: "create" | "reuse";
  existingSpeakerId: string | null;
  findings: CourseCheckFinding[];
} {
  const matches = existingSpeakersByEmail.get(normalizeEmail(email)) ?? [];
  if (matches.length === 0) {
    return { match: "create", existingSpeakerId: null, findings: [] };
  }
  if (matches.length > 1) {
    return {
      match: "create",
      existingSpeakerId: null,
      findings: [
        {
          id: `identity-ambiguity-${normalizeEmail(email)}`,
          severity: "blocker",
          code: "identity_ambiguity",
          message: `Multiple speaker records share ${email}.`,
          recoveryGuidance:
            "Merge or correct the duplicate speaker identities, then create a new Decision Course Check.",
          entityRef: email,
        },
      ],
    };
  }
  const existing = matches[0]!;
  const nameConflict =
    existing.name.trim().toLowerCase() !== name.trim().toLowerCase() &&
    existing.name.trim().length > 0 &&
    name.trim().length > 0;
  if (nameConflict) {
    return {
      match: "reuse",
      existingSpeakerId: existing.id,
      findings: [
        {
          id: `identity-name-mismatch-${normalizeEmail(email)}`,
          severity: "blocker",
          code: "identity_ambiguity",
          message: `Speaker email ${email} matches existing record "${existing.name}" but this proposal uses "${name}".`,
          recoveryGuidance:
            "Confirm whether these are the same person. Update the speaker identity or proposal name, then create a new Decision Course Check.",
          entityRef: email,
        },
      ],
    };
  }
  return { match: "reuse", existingSpeakerId: existing.id, findings: [] };
}

function buildSpeakerPlans(
  scope: string,
  people: Array<{
    name: string;
    email: string;
    biography: string;
    role: "primary" | "co";
  }>,
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>,
  findingPrefix = "",
): { speakers: PlannedSpeaker[]; findings: CourseCheckFinding[] } {
  const speakers: PlannedSpeaker[] = [];
  const findings: CourseCheckFinding[] = [];
  const seenEmails = new Set<string>();

  people.forEach((person, index) => {
    const email = person.email.trim();
    const name = person.name.trim();
    if (!email || !name) {
      findings.push({
        id: `${findingPrefix}missing-speaker-${index}`,
        severity: "blocker",
        code: "durable_integrity",
        message: "Every speaker needs a name and email before a final outcome can apply.",
        recoveryGuidance:
          "Correct the proposal or guaranteed-speaker input, then create a new Course Check.",
      });
      return;
    }
    const key = normalizeEmail(email);
    if (seenEmails.has(key)) {
      findings.push({
        id: `${findingPrefix}duplicate-email-${key}`,
        severity: "blocker",
        code: "identity_ambiguity",
        message: `Speaker email ${email} appears more than once in this cascade.`,
        recoveryGuidance:
          "Remove the duplicate speaker entry, then create a new Course Check.",
        entityRef: email,
      });
      return;
    }
    seenEmails.add(key);
    const resolved = resolveSpeakerMatch(email, name, existingSpeakersByEmail);
    findings.push(
      ...resolved.findings.map((finding) => ({
        ...finding,
        id: `${findingPrefix}${finding.id}`,
      })),
    );
    speakers.push({
      plannedId: plannedSpeakerId(scope, index),
      role: person.role,
      name,
      email: key,
      biography: person.biography.trim(),
      match: resolved.match,
      existingSpeakerId: resolved.existingSpeakerId,
    });
  });

  return { speakers, findings };
}

function buildParticipations(
  scope: string,
  speakers: PlannedSpeaker[],
  titleSnapshot: string,
): PlannedParticipation[] {
  return speakers.map((speaker, index) => ({
    plannedId: plannedParticipationId(scope, index),
    speakerPlannedId: speaker.plannedId,
    titleSnapshot,
    organizationSnapshot: "",
    role: speaker.role,
  }));
}

function buildTasks(scope: string, speakers: PlannedSpeaker[]): PlannedTask[] {
  const tasks: PlannedTask[] = [];
  let index = 0;
  for (const speaker of speakers) {
    for (const template of DEFAULT_TASKS) {
      tasks.push({
        plannedId: plannedTaskId(scope, index),
        title: template.title,
        kind: template.kind,
        speakerPlannedId: speaker.plannedId,
      });
      index += 1;
    }
  }
  return tasks;
}

function buildPortalAccess(speakers: PlannedSpeaker[]): PlannedPortalAccess[] {
  return speakers.map((speaker) => ({
    speakerPlannedId: speaker.plannedId,
    email: speaker.email,
    intent: "grant" as const,
  }));
}

function softSessionWarnings(
  session: PlannedSession | null,
  findingPrefix = "",
): CourseCheckFinding[] {
  if (!session) return [];
  const findings: CourseCheckFinding[] = [];
  if (!session.roomId || !session.startsAt) {
    findings.push({
      id: `${findingPrefix}session-unplaced`,
      severity: "warning",
      code: "session_unplaced",
      message: "The session will be created unplaced (no room or time yet).",
      recoveryGuidance:
        "Place the session later in the private schedule. This does not block apply.",
    });
  }
  if (!session.startsAt || !session.endsAt) {
    findings.push({
      id: `${findingPrefix}session-tbd-time`,
      severity: "warning",
      code: "session_tbd",
      message: "Session time remains TBD after acceptance.",
      recoveryGuidance: "Set times when the agenda is ready. This does not block apply.",
    });
  }
  findings.push({
    id: `${findingPrefix}readiness-onboarding`,
    severity: "warning",
    code: "readiness_tasks",
    message:
      "Default onboarding tasks will be created; speaker readiness remains incomplete until they finish.",
    recoveryGuidance:
      "Chase tasks from the speaker portal after apply. This does not block apply.",
  });
  return findings;
}

function decisionStages(hasBlockers: boolean): CourseCheckStage[] {
  return [
    {
      id: "apply-decision",
      label: "Apply decision",
      status: hasBlockers ? "blocked" : "ready",
      verb: "Apply decision",
      external: false,
    },
  ];
}

function prefixEntityRef(finding: CourseCheckFinding, proposalId: string): CourseCheckFinding {
  return {
    ...finding,
    entityRef: finding.entityRef ?? proposalId,
  };
}

export function planDecisionItem(input: DecisionPlannerInput): DecisionItem {
  const itemIndex = input.itemIndex ?? 0;
  const scope = `${input.planId}_i${itemIndex}`;
  const itemId = `item_${input.planId}_${itemIndex}`;
  const findingPrefix = `${itemId}:`;
  const { proposal, outcome } = input;
  const findings: CourseCheckFinding[] = [];
  const deltas: CourseCheckDelta[] = [];

  deltas.push({
    entityType: "proposal",
    action: "update",
    summary: `Set final program outcome of ${proposal.id} to ${outcome}.`,
    before: {
      programOutcome: proposal.programOutcome,
      reviewStatus: proposal.status,
    },
    after: {
      programOutcome: outcome,
      reviewStatus: proposal.status,
    },
    proposalId: proposal.id,
  });

  if (proposal.programOutcome === outcome) {
    findings.push({
      id: `${findingPrefix}outcome-already-set`,
      severity: "blocker",
      code: "durable_integrity",
      message: `Proposal ${proposal.id} already has final outcome "${outcome}".`,
      recoveryGuidance:
        "No further decision apply is needed for this outcome. Use compensation later if the program must change.",
      entityRef: proposal.id,
    });
  } else if (proposal.programOutcome) {
    findings.push({
      id: `${findingPrefix}outcome-conflict`,
      severity: "blocker",
      code: "durable_integrity",
      message: `Proposal ${proposal.id} already has final outcome "${proposal.programOutcome}".`,
      recoveryGuidance:
        "Resolve the existing program outcome before applying a different final decision.",
      entityRef: proposal.id,
    });
  }

  let speakers: PlannedSpeaker[] = [];
  let participations: PlannedParticipation[] = [];
  let session: PlannedSession | null = null;
  let tasks: PlannedTask[] = [];
  let portalAccess: PlannedPortalAccess[] = [];

  if (outcome === "accepted") {
    const people: Array<{
      name: string;
      email: string;
      biography: string;
      role: "primary" | "co";
    }> = [
      {
        name: proposal.speakerName,
        email: proposal.speakerEmail,
        biography: proposal.biography,
        role: "primary",
      },
      ...proposal.coSpeakers.map((co: CoSpeakerInput) => ({
        name: co.name,
        email: co.email,
        biography: co.biography,
        role: "co" as const,
      })),
    ];
    const planned = buildSpeakerPlans(
      scope,
      people,
      input.existingSpeakersByEmail,
      findingPrefix,
    );
    speakers = planned.speakers;
    findings.push(...planned.findings.map((f) => prefixEntityRef(f, proposal.id)));
    participations = buildParticipations(scope, speakers, proposal.title);
    session = {
      plannedId: plannedSessionId(scope),
      title: proposal.title,
      format: proposal.sessionFormat || "talk",
      trackId: proposal.trackId,
      roomId: null,
      startsAt: null,
      endsAt: null,
    };
    tasks = buildTasks(scope, speakers);
    portalAccess = buildPortalAccess(speakers);

    for (const speaker of speakers) {
      deltas.push({
        entityType: "speaker",
        action: speaker.match,
        summary:
          speaker.match === "reuse"
            ? `Reuse speaker ${speaker.email} for ${proposal.id}.`
            : `Create speaker ${speaker.name} <${speaker.email}> for ${proposal.id}.`,
        before:
          speaker.match === "reuse"
            ? { speakerId: speaker.existingSpeakerId, email: speaker.email }
            : null,
        after: {
          plannedId: speaker.plannedId,
          name: speaker.name,
          email: speaker.email,
          role: speaker.role,
        },
        proposalId: proposal.id,
      });
    }
    for (const participation of participations) {
      deltas.push({
        entityType: "participation",
        action: "create",
        summary: `Create event participation snapshot for ${participation.role} speaker (${proposal.id}).`,
        before: null,
        after: {
          plannedId: participation.plannedId,
          titleSnapshot: participation.titleSnapshot,
          role: participation.role,
        },
        proposalId: proposal.id,
      });
    }
    deltas.push({
      entityType: "session",
      action: "create",
      summary: `Create one unplaced session "${session.title}" for ${proposal.id}.`,
      before: null,
      after: { ...session },
      proposalId: proposal.id,
    });
    for (const task of tasks) {
      deltas.push({
        entityType: "task",
        action: "create",
        summary: `Create onboarding task "${task.title}" for ${proposal.id}.`,
        before: null,
        after: { ...task },
        proposalId: proposal.id,
      });
    }
    for (const access of portalAccess) {
      deltas.push({
        entityType: "portal_access",
        action: "create",
        summary: `Record portal-access intent for ${access.email} (not delivered).`,
        before: null,
        after: { ...access },
        proposalId: proposal.id,
      });
    }
    findings.push(
      ...softSessionWarnings(session, findingPrefix).map((f) =>
        prefixEntityRef(f, proposal.id),
      ),
    );
  } else {
    findings.push({
      id: `${findingPrefix}decline-no-cascade`,
      severity: "info",
      code: "decline_no_speakers",
      message: `Declining ${proposal.id} sets the final program outcome only. No speakers, sessions, tasks, or messages are created.`,
      entityRef: proposal.id,
    });
  }

  return {
    itemId,
    proposalId: proposal.id,
    outcome,
    proposalRevision: proposal.reviewVersion,
    status: "active",
    deferredAt: null,
    deferredBy: null,
    deferralReason: null,
    speakers,
    participations,
    session,
    tasks,
    portalAccess,
    deltas,
    findings,
  };
}

function aggregateProgress(items: DecisionItem[]): AggregateProgress {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    deferred: items.filter((item) => item.status === "deferred").length,
    applied: items.filter((item) => item.status === "applied").length,
  };
}

function reaggregateDecisionBody(
  planId: string,
  items: DecisionItem[],
  extras: {
    followUpQueue: DecisionPlanBody["followUpQueue"];
    softWarningOverrides: DecisionPlanBody["softWarningOverrides"];
    ageWarningHours: number;
    linkedPlanIds: string[];
    parentPlanId: string | null;
    batchGroupId: string | null;
    splitExplanation: string | null;
  },
): DecisionPlanBody {
  const active = items.filter((item) => item.status === "active");
  const primary = active[0] ?? items[0]!;
  const deltas = active.flatMap((item) => item.deltas);
  const findings = [
    ...active.flatMap((item) => item.findings),
    {
      id: "no-implicit-communication",
      severity: "info" as const,
      code: "no_implicit_communication",
      message:
        "Applying this decision does not draft, queue, or send speaker email, calendar invites, public-program changes, or integration writes.",
    },
  ];
  if (extras.followUpQueue.length > 0) {
    findings.push({
      id: "follow-up-queue",
      severity: "info",
      code: "deferred_follow_up",
      message: `${extras.followUpQueue.length} item(s) deferred to the follow-up queue and excluded from this apply scope.`,
    });
  }
  const speakers = active.flatMap((item) => item.speakers);
  const participations = active.flatMap((item) => item.participations);
  const tasks = active.flatMap((item) => item.tasks);
  const portalAccess = active.flatMap((item) => item.portalAccess);
  // Single-item body keeps session; multi-item apply walks items directly.
  const session = active.length === 1 ? active[0]!.session : null;
  const hasBlockers = findings.some((finding) => finding.severity === "blocker");
  const stages = decisionStages(hasBlockers);
  return {
    actionType: "decision",
    proposalId: primary.proposalId,
    outcome: primary.outcome,
    proposalRevision: primary.proposalRevision,
    speakers,
    participations,
    session,
    tasks,
    portalAccess,
    deltas,
    findings,
    stages,
    items,
    followUpQueue: extras.followUpQueue,
    evidenceSections: buildEvidenceSections({ findings, deltas }),
    softWarningOverrides: extras.softWarningOverrides,
    aggregateProgress: aggregateProgress(items),
    linkedPlanIds: extras.linkedPlanIds,
    parentPlanId: extras.parentPlanId,
    batchGroupId: extras.batchGroupId,
    splitExplanation: extras.splitExplanation,
    ageWarningHours: extras.ageWarningHours,
    ageWarning: null,
  };
}

export function planDecisionCascade(input: DecisionPlannerInput): DecisionPlanBody {
  const item = planDecisionItem(input);
  return reaggregateDecisionBody(input.planId, [item], {
    followUpQueue: [],
    softWarningOverrides: [],
    ageWarningHours: DEFAULT_AGE_WARNING_HOURS,
    linkedPlanIds: [],
    parentPlanId: null,
    batchGroupId: input.planId,
    splitExplanation: null,
  });
}

export function planDecisionBatch(input: BatchDecisionPlannerInput): DecisionPlanBody {
  const items = input.selections.map((selection, index) =>
    planDecisionItem({
      proposal: selection.proposal,
      outcome: selection.outcome,
      existingSpeakersByEmail: input.existingSpeakersByEmail,
      planId: input.planId,
      itemIndex: index,
    }),
  );
  // Cross-item email collision within the same batch is a blocker.
  const emails = new Map<string, string>();
  for (const item of items) {
    if (item.status !== "active" || item.outcome !== "accepted") continue;
    for (const speaker of item.speakers) {
      const prior = emails.get(speaker.email);
      if (prior && prior !== item.proposalId) {
        item.findings.push({
          id: `${item.itemId}:batch-email-collision-${speaker.email}`,
          severity: "blocker",
          code: "identity_ambiguity",
          message: `Speaker email ${speaker.email} appears on both ${prior} and ${item.proposalId} in this batch.`,
          recoveryGuidance:
            "Defer one of the colliding proposals, or resolve the shared identity, then revise the Course Check.",
          entityRef: speaker.email,
        });
      } else {
        emails.set(speaker.email, item.proposalId);
      }
    }
  }
  return reaggregateDecisionBody(input.planId, items, {
    followUpQueue: [],
    softWarningOverrides: [],
    ageWarningHours: input.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
    linkedPlanIds: input.linkedPlanIds ?? [],
    parentPlanId: input.parentPlanId ?? null,
    batchGroupId: input.batchGroupId,
    splitExplanation: input.splitExplanation ?? null,
  });
}

export function deferDecisionItems(input: {
  body: DecisionPlanBody;
  itemIds: string[];
  reason: string;
  actor: { id: string; displayName: string };
  at: string;
  planId: string;
  planVersion: number;
}): DecisionPlanBody {
  const deferredIds = new Set(input.itemIds);
  const followUpQueue = [...input.body.followUpQueue];
  const items = input.body.items.map((item) => {
    if (!deferredIds.has(item.itemId) || item.status !== "active") return item;
    followUpQueue.push({
      id: `fu_${item.itemId}_${input.planVersion + 1}`,
      proposalId: item.proposalId,
      outcome: item.outcome,
      reason: input.reason,
      sourcePlanId: input.planId,
      sourceVersion: input.planVersion + 1,
      deferredAt: input.at,
      deferredBy: input.actor,
      status: "open",
    });
    return {
      ...item,
      status: "deferred" as const,
      deferredAt: input.at,
      deferredBy: input.actor,
      deferralReason: input.reason,
    };
  });
  return reaggregateDecisionBody(input.planId, items, {
    followUpQueue,
    softWarningOverrides: input.body.softWarningOverrides,
    ageWarningHours: input.body.ageWarningHours,
    linkedPlanIds: input.body.linkedPlanIds,
    parentPlanId: input.body.parentPlanId,
    batchGroupId: input.body.batchGroupId,
    splitExplanation: input.body.splitExplanation,
  });
}

export function markDecisionItemsApplied(body: DecisionPlanBody): DecisionPlanBody {
  const items = body.items.map((item) =>
    item.status === "active" ? { ...item, status: "applied" as const } : item,
  );
  return reaggregateDecisionBody("applied", items, {
    followUpQueue: body.followUpQueue,
    softWarningOverrides: body.softWarningOverrides,
    ageWarningHours: body.ageWarningHours,
    linkedPlanIds: body.linkedPlanIds,
    parentPlanId: body.parentPlanId,
    batchGroupId: body.batchGroupId,
    splitExplanation: body.splitExplanation,
  });
}

export function splitSelectionsIfNeeded<T>(
  selections: T[],
  limit = DEFAULT_DECISION_BATCH_LIMIT,
): T[][] {
  if (selections.length <= limit) return [selections];
  const chunks: T[][] = [];
  for (let i = 0; i < selections.length; i += limit) {
    chunks.push(selections.slice(i, i + limit));
  }
  return chunks;
}

export function planGuaranteedSpeaker(
  input: GuaranteedSpeakerPlannerInput,
): GuaranteedSpeakerPlanBody {
  const findings: CourseCheckFinding[] = [];
  const deltas: CourseCheckDelta[] = [];
  const people = input.speakers.map((speaker, index) => ({
    name: speaker.name,
    email: speaker.email,
    biography: speaker.biography ?? "",
    role: speaker.role ?? (index === 0 ? ("primary" as const) : ("co" as const)),
  }));
  const planned = buildSpeakerPlans(
    input.planId,
    people,
    input.existingSpeakersByEmail,
  );
  findings.push(...planned.findings);
  if (planned.speakers.length === 0) {
    findings.push({
      id: "guaranteed-no-speakers",
      severity: "blocker",
      code: "durable_integrity",
      message: "Guaranteed speaker creation requires at least one speaker.",
      recoveryGuidance: "Provide speaker name and email, then create a new Course Check.",
    });
  }
  const participations = buildParticipations(
    input.planId,
    planned.speakers,
    input.title.trim(),
  );
  const session: PlannedSession = {
    plannedId: plannedSessionId(input.planId),
    title: input.title.trim(),
    format: input.format.trim() || "talk",
    trackId: input.trackId,
    roomId: null,
    startsAt: null,
    endsAt: null,
  };
  const tasks = buildTasks(input.planId, planned.speakers);
  const portalAccess = buildPortalAccess(planned.speakers);

  for (const speaker of planned.speakers) {
    deltas.push({
      entityType: "speaker",
      action: speaker.match,
      summary:
        speaker.match === "reuse"
          ? `Reuse speaker ${speaker.email}.`
          : `Create speaker ${speaker.name} <${speaker.email}>.`,
      before:
        speaker.match === "reuse"
          ? { speakerId: speaker.existingSpeakerId, email: speaker.email }
          : null,
      after: {
        plannedId: speaker.plannedId,
        name: speaker.name,
        email: speaker.email,
        role: speaker.role,
      },
    });
  }
  for (const participation of participations) {
    deltas.push({
      entityType: "participation",
      action: "create",
      summary: `Create event participation snapshot for ${participation.role} speaker.`,
      before: null,
      after: { ...participation },
    });
  }
  deltas.push({
    entityType: "session",
    action: "create",
    summary: `Create one unplaced session "${session.title}".`,
    before: null,
    after: { ...session },
  });
  for (const task of tasks) {
    deltas.push({
      entityType: "task",
      action: "create",
      summary: `Create onboarding task "${task.title}".`,
      before: null,
      after: { ...task },
    });
  }
  for (const access of portalAccess) {
    deltas.push({
      entityType: "portal_access",
      action: "create",
      summary: `Record portal-access intent for ${access.email} (not delivered).`,
      before: null,
      after: { ...access },
    });
  }
  findings.push(...softSessionWarnings(session));
  findings.push({
    id: "no-implicit-communication",
    severity: "info",
    code: "no_implicit_communication",
    message:
      "Applying this decision does not draft, queue, or send speaker email, calendar invites, public-program changes, or integration writes.",
  });

  const hasBlockers = findings.some((finding) => finding.severity === "blocker");
  return {
    actionType: "guaranteed_speaker",
    sourceLabel: input.sourceLabel.trim() || "Guaranteed speaker",
    speakers: planned.speakers,
    participations,
    session,
    tasks,
    portalAccess,
    deltas,
    findings,
    stages: decisionStages(hasBlockers),
    relevantRevisions: {
      speakerEmails: planned.speakers.map((speaker) => speaker.email),
    },
    evidenceSections: buildEvidenceSections({ findings, deltas }),
    softWarningOverrides: [],
    ageWarningHours: DEFAULT_AGE_WARNING_HOURS,
    ageWarning: null,
  };
}

export function hasBlockerFindings(findings: CourseCheckFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocker");
}

export function decisionBodyDigestPayload(body: DecisionPlanBody): unknown {
  return {
    actionType: body.actionType,
    items: body.items.map((item) => ({
      itemId: item.itemId,
      proposalId: item.proposalId,
      outcome: item.outcome,
      proposalRevision: item.proposalRevision,
      status: item.status,
      speakers: item.speakers,
      participations: item.participations,
      session: item.session,
      tasks: item.tasks,
      portalAccess: item.portalAccess,
      deltas: item.deltas,
      findings: item.findings,
      deferralReason: item.deferralReason ?? null,
    })),
    followUpQueue: body.followUpQueue,
    stages: body.stages,
    softWarningOverrides: body.softWarningOverrides,
    linkedPlanIds: body.linkedPlanIds,
    parentPlanId: body.parentPlanId,
    batchGroupId: body.batchGroupId,
    splitExplanation: body.splitExplanation,
  };
}
