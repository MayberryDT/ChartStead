import type {
  CourseCheckDelta,
  CourseCheckFinding,
  CourseCheckStage,
  DecisionPlanBody,
  GuaranteedSpeakerPlanBody,
  PlannedParticipation,
  PlannedPortalAccess,
  PlannedSession,
  PlannedSpeaker,
  PlannedTask,
  ProgramOutcome,
} from "../../shared/course-check";
import type { CoSpeakerInput, OrganizerProposal } from "../../shared/events";

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

function plannedSpeakerId(planId: string, index: number): string {
  return `spk_${planId}_${index}`;
}

function plannedParticipationId(planId: string, index: number): string {
  return `prt_${planId}_${index}`;
}

function plannedSessionId(planId: string): string {
  return `ses_${planId}`;
}

function plannedTaskId(planId: string, index: number): string {
  return `tsk_${planId}_${index}`;
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
  planId: string,
  people: Array<{
    name: string;
    email: string;
    biography: string;
    role: "primary" | "co";
  }>,
  existingSpeakersByEmail: Map<string, ExistingSpeaker[]>,
): { speakers: PlannedSpeaker[]; findings: CourseCheckFinding[] } {
  const speakers: PlannedSpeaker[] = [];
  const findings: CourseCheckFinding[] = [];
  const seenEmails = new Set<string>();

  people.forEach((person, index) => {
    const email = person.email.trim();
    const name = person.name.trim();
    if (!email || !name) {
      findings.push({
        id: `missing-speaker-${index}`,
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
        id: `duplicate-email-${key}`,
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
    findings.push(...resolved.findings);
    speakers.push({
      plannedId: plannedSpeakerId(planId, index),
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
  planId: string,
  speakers: PlannedSpeaker[],
  titleSnapshot: string,
): PlannedParticipation[] {
  return speakers.map((speaker, index) => ({
    plannedId: plannedParticipationId(planId, index),
    speakerPlannedId: speaker.plannedId,
    titleSnapshot,
    organizationSnapshot: "",
    role: speaker.role,
  }));
}

function buildTasks(planId: string, speakers: PlannedSpeaker[]): PlannedTask[] {
  const tasks: PlannedTask[] = [];
  let index = 0;
  for (const speaker of speakers) {
    for (const template of DEFAULT_TASKS) {
      tasks.push({
        plannedId: plannedTaskId(planId, index),
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

function softSessionWarnings(session: PlannedSession | null): CourseCheckFinding[] {
  if (!session) return [];
  const findings: CourseCheckFinding[] = [];
  if (!session.roomId || !session.startsAt) {
    findings.push({
      id: "session-unplaced",
      severity: "warning",
      code: "session_unplaced",
      message: "The session will be created unplaced (no room or time yet).",
      recoveryGuidance: "Place the session later in the private schedule. This does not block apply.",
    });
  }
  if (!session.startsAt || !session.endsAt) {
    findings.push({
      id: "session-tbd-time",
      severity: "warning",
      code: "session_tbd",
      message: "Session time remains TBD after acceptance.",
      recoveryGuidance: "Set times when the agenda is ready. This does not block apply.",
    });
  }
  findings.push({
    id: "readiness-onboarding",
    severity: "warning",
    code: "readiness_tasks",
    message: "Default onboarding tasks will be created; speaker readiness remains incomplete until they finish.",
    recoveryGuidance: "Chase tasks from the speaker portal after apply. This does not block apply.",
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
    },
  ];
}

export function planDecisionCascade(input: DecisionPlannerInput): DecisionPlanBody {
  const { proposal, outcome, planId } = input;
  const findings: CourseCheckFinding[] = [];
  const deltas: CourseCheckDelta[] = [];

  deltas.push({
    entityType: "proposal",
    action: "update",
    summary: `Set final program outcome to ${outcome}.`,
    before: {
      programOutcome: proposal.programOutcome,
      reviewStatus: proposal.status,
    },
    after: {
      programOutcome: outcome,
      reviewStatus: proposal.status,
    },
  });

  if (proposal.programOutcome === outcome) {
    findings.push({
      id: "outcome-already-set",
      severity: "blocker",
      code: "durable_integrity",
      message: `This proposal already has final outcome "${outcome}".`,
      recoveryGuidance:
        "No further decision apply is needed for this outcome. Use compensation later if the program must change.",
      entityRef: proposal.id,
    });
  } else if (proposal.programOutcome) {
    findings.push({
      id: "outcome-conflict",
      severity: "blocker",
      code: "durable_integrity",
      message: `This proposal already has final outcome "${proposal.programOutcome}".`,
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
      planId,
      people,
      input.existingSpeakersByEmail,
    );
    speakers = planned.speakers;
    findings.push(...planned.findings);
    participations = buildParticipations(planId, speakers, proposal.title);
    session = {
      plannedId: plannedSessionId(planId),
      title: proposal.title,
      format: proposal.sessionFormat || "talk",
      trackId: proposal.trackId,
      roomId: null,
      startsAt: null,
      endsAt: null,
    };
    tasks = buildTasks(planId, speakers);
    portalAccess = buildPortalAccess(speakers);

    for (const speaker of speakers) {
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
        after: {
          plannedId: participation.plannedId,
          titleSnapshot: participation.titleSnapshot,
          role: participation.role,
        },
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
  } else {
    findings.push({
      id: "decline-no-cascade",
      severity: "info",
      code: "decline_no_speakers",
      message:
        "Declining sets the final program outcome only. No speakers, sessions, tasks, or messages are created.",
    });
  }

  findings.push({
    id: "no-implicit-communication",
    severity: "info",
    code: "no_implicit_communication",
    message:
      "Applying this decision does not draft, queue, or send speaker email, calendar invites, public-program changes, or integration writes.",
  });

  const hasBlockers = findings.some((finding) => finding.severity === "blocker");
  return {
    actionType: "decision",
    proposalId: proposal.id,
    outcome,
    proposalRevision: proposal.reviewVersion,
    speakers,
    participations,
    session,
    tasks,
    portalAccess,
    deltas,
    findings,
    stages: decisionStages(hasBlockers),
  };
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
  };
}

export function hasBlockerFindings(findings: CourseCheckFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocker");
}
