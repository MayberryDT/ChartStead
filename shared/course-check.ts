/** Course Check v1 contract — decision cascade tracer. */

export type ProgramOutcome = "accepted" | "declined";

export type CourseCheckActionType = "decision" | "guaranteed_speaker";

export type CourseCheckPlanState =
  | "Draft"
  | "Needs review"
  | "Ready"
  | "In progress"
  | "Partially complete"
  | "Needs attention"
  | "Complete"
  | "Superseded"
  | "Out of date";

export type CourseCheckFindingSeverity = "blocker" | "warning" | "info";

export type CourseCheckStageStatus =
  | "pending"
  | "ready"
  | "blocked"
  | "approved"
  | "complete";

export interface CourseCheckFinding {
  id: string;
  severity: CourseCheckFindingSeverity;
  code: string;
  message: string;
  recoveryGuidance?: string;
  entityRef?: string;
}

export interface CourseCheckDelta {
  entityType:
    | "proposal"
    | "speaker"
    | "participation"
    | "session"
    | "task"
    | "portal_access";
  action: "create" | "update" | "reuse" | "none";
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface CourseCheckStage {
  id: string;
  label: string;
  status: CourseCheckStageStatus;
  verb: string;
}

export interface PlannedSpeaker {
  plannedId: string;
  role: "primary" | "co";
  name: string;
  email: string;
  biography: string;
  match: "create" | "reuse";
  existingSpeakerId: string | null;
}

export interface PlannedParticipation {
  plannedId: string;
  speakerPlannedId: string;
  titleSnapshot: string;
  organizationSnapshot: string;
  role: "primary" | "co";
}

export interface PlannedSession {
  plannedId: string;
  title: string;
  format: string;
  trackId: string;
  roomId: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface PlannedTask {
  plannedId: string;
  title: string;
  kind: string;
  speakerPlannedId: string;
}

export interface PlannedPortalAccess {
  speakerPlannedId: string;
  email: string;
  intent: "grant";
}

export interface DecisionPlanBody {
  actionType: "decision";
  proposalId: string;
  outcome: ProgramOutcome;
  proposalRevision: number;
  speakers: PlannedSpeaker[];
  participations: PlannedParticipation[];
  session: PlannedSession | null;
  tasks: PlannedTask[];
  portalAccess: PlannedPortalAccess[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
}

export interface GuaranteedSpeakerPlanBody {
  actionType: "guaranteed_speaker";
  sourceLabel: string;
  speakers: PlannedSpeaker[];
  participations: PlannedParticipation[];
  session: PlannedSession;
  tasks: PlannedTask[];
  portalAccess: PlannedPortalAccess[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  relevantRevisions: {
    speakerEmails: string[];
  };
}

export type CourseCheckPlanBody = DecisionPlanBody | GuaranteedSpeakerPlanBody;

export interface CourseCheckActor {
  id: string;
  displayName: string;
}

export interface CourseCheckApproval {
  stageId: string;
  planVersion: number;
  digest: string;
  actor: CourseCheckActor;
  approvedAt: string;
}

export interface CourseCheckReceipt {
  id: string;
  planId: string;
  planVersion: number;
  digest: string;
  stageId: string;
  appliedAt: string;
  actor: CourseCheckActor;
}

export interface CourseCheckPlan {
  id: string;
  eventId: string;
  actionType: CourseCheckActionType;
  state: CourseCheckPlanState;
  version: number;
  digest: string;
  createdAt: string;
  updatedAt: string;
  createdBy: CourseCheckActor;
  body: CourseCheckPlanBody;
  approval: CourseCheckApproval | null;
  receipt: CourseCheckReceipt | null;
}

export interface CreateDecisionCourseCheckRequest {
  proposalId: string;
  outcome: ProgramOutcome;
  idempotencyKey: string;
}

export interface CreateGuaranteedSpeakerCourseCheckRequest {
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
  idempotencyKey: string;
}

export interface ApplyCourseCheckRequest {
  planVersion: number;
  digest: string;
  stageId: string;
  idempotencyKey: string;
}

export interface CourseCheckErrorBody {
  error: string;
  code?: string;
  recoveryGuidance?: string;
  findings?: CourseCheckFinding[];
  changedInputs?: string[];
}
