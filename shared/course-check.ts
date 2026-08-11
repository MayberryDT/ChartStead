/** Course Check v1 contract — decision, publication, communication drafts, batch workspace. */

export type ProgramOutcome = "accepted" | "declined";

export type CourseCheckActionType =
  | "decision"
  | "guaranteed_speaker"
  | "publication"
  | "communication";

export type PublicationOperation = "publish" | "unpublish" | "restore";

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
  | "complete"
  | "out_of_date";

export type CourseCheckEvidenceKind =
  | "irreversible"
  | "people"
  | "public"
  | "operational"
  | "integration"
  | "internal";

export type DecisionItemStatus = "active" | "deferred" | "applied";

export interface CourseCheckFinding {
  id: string;
  severity: CourseCheckFindingSeverity;
  code: string;
  message: string;
  recoveryGuidance?: string;
  entityRef?: string;
  /** Soft warnings may be overridden; material external ones require a reason. */
  materialExternal?: boolean;
}

export interface CourseCheckDelta {
  entityType:
    | "proposal"
    | "speaker"
    | "participation"
    | "session"
    | "task"
    | "portal_access"
    | "public_revision"
    | "public_session"
    | "communication_plan"
    | "message_draft"
    | "recipient";
  action:
    | "create"
    | "update"
    | "reuse"
    | "none"
    | "remove"
    | "include"
    | "exclude"
    | "freeze";
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  proposalId?: string;
  sessionId?: string;
}

export interface CourseCheckStage {
  id: string;
  label: string;
  status: CourseCheckStageStatus;
  verb: string;
  /** External-bound stages age-warn; internal apply does not hard-block on age. */
  external?: boolean;
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

export interface CourseCheckEvidenceSection {
  kind: CourseCheckEvidenceKind;
  title: string;
  /** Clean low-risk sections default collapsed; risk expands. */
  defaultExpanded: boolean;
  summary: string;
  findingIds: string[];
  deltaIndexes: number[];
}

export interface SoftWarningOverride {
  findingId: string;
  reason: string | null;
  actor: CourseCheckActor;
  at: string;
}

export interface DecisionItem {
  itemId: string;
  proposalId: string;
  outcome: ProgramOutcome;
  proposalRevision: number;
  status: DecisionItemStatus;
  deferredAt?: string | null;
  deferredBy?: CourseCheckActor | null;
  deferralReason?: string | null;
  speakers: PlannedSpeaker[];
  participations: PlannedParticipation[];
  session: PlannedSession | null;
  tasks: PlannedTask[];
  portalAccess: PlannedPortalAccess[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
}

export interface FollowUpQueueItem {
  id: string;
  proposalId: string;
  outcome: ProgramOutcome;
  reason: string;
  sourcePlanId: string;
  sourceVersion: number;
  deferredAt: string;
  deferredBy: CourseCheckActor;
  status: "open" | "resolved";
}

export interface PlanMutationRecord {
  id: string;
  planId: string;
  fromVersion: number;
  toVersion: number;
  kind:
    | "create"
    | "defer"
    | "refresh"
    | "split"
    | "override"
    | "apply"
    | "revise"
    | "create_drafts"
    | "link";
  actor: CourseCheckActor;
  at: string;
  summary: string;
}

export interface AggregateProgress {
  total: number;
  active: number;
  deferred: number;
  applied: number;
}

export interface DecisionPlanBody {
  actionType: "decision";
  /** Primary/first active item — retained for single-proposal callers. */
  proposalId: string;
  outcome: ProgramOutcome;
  proposalRevision: number;
  /** Aggregated active-item cascade for apply. */
  speakers: PlannedSpeaker[];
  participations: PlannedParticipation[];
  session: PlannedSession | null;
  tasks: PlannedTask[];
  portalAccess: PlannedPortalAccess[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  /** Batch items (length >= 1). Single decisions are one-item batches. */
  items: DecisionItem[];
  followUpQueue: FollowUpQueueItem[];
  evidenceSections: CourseCheckEvidenceSection[];
  softWarningOverrides: SoftWarningOverride[];
  aggregateProgress: AggregateProgress;
  linkedPlanIds: string[];
  parentPlanId: string | null;
  batchGroupId: string | null;
  splitExplanation: string | null;
  ageWarningHours: number;
  ageWarning?: {
    active: boolean;
    ageHours: number;
    message: string;
  } | null;
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
  evidenceSections: CourseCheckEvidenceSection[];
  softWarningOverrides: SoftWarningOverride[];
  ageWarningHours: number;
  ageWarning?: {
    active: boolean;
    ageHours: number;
    message: string;
  } | null;
}

export type PublicationSessionChange =
  | "add"
  | "remove"
  | "time"
  | "room"
  | "speaker"
  | "visibility"
  | "title"
  | "description"
  | "unchanged";

export interface PublicationSessionDelta {
  sessionId: string;
  title: string;
  change: PublicationSessionChange;
  changes: PublicationSessionChange[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface PublicationExclusion {
  sessionId: string;
  title: string;
  reasons: string[];
}

export interface PublicationConflictEvidence {
  conflictId: string;
  kind: string;
  summary: string;
  sessionIds: string[];
  sessionTitles: string[];
}

export interface PublicationPlanBody {
  actionType: "publication";
  operation: PublicationOperation;
  workingFingerprint: string;
  publicRevisionId: string | null;
  publicRevisionVersion: number | null;
  restoreFromRevisionId: string | null;
  /** Frozen snapshot that becomes the new current public revision on apply. */
  proposedSnapshot: {
    sessions: Array<Record<string, unknown>>;
    speakers: Array<Record<string, unknown>>;
  };
  sessionDeltas: PublicationSessionDelta[];
  includedSessionIds: string[];
  excludedSessions: PublicationExclusion[];
  conflicts: PublicationConflictEvidence[];
  calendarConsequences: Array<{
    sessionId: string;
    kind: "create" | "update" | "cancel";
    uid: string;
    sequence: number;
  }>;
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  evidenceSections: CourseCheckEvidenceSection[];
  softWarningOverrides: SoftWarningOverride[];
  linkedPlanIds: string[];
  parentPlanId: string | null;
  ageWarningHours: number;
  ageWarning?: {
    active: boolean;
    ageHours: number;
    message: string;
  } | null;
}

export type CommunicationTemplateKind = "acceptance" | "decline" | "custom";

export type RecipientInclusion =
  | "include"
  | "exclude"
  | "missing"
  | "duplicate"
  | "shared";

export type RecipientDeliverability = "ok" | "missing" | "invalid";

export type CommunicationDraftStatus = "planned" | "frozen";

export type CommunicationStageState =
  | "not_started"
  | "ready"
  | "complete"
  | "out_of_date";

export type CommunicationPurpose =
  | "calendar_update"
  | "speaker_notification"
  | "decision"
  | "custom";

export interface PriorCommunicationEvidence {
  id: string;
  kind: string;
  status: string;
  toEmail: string;
  subject: string;
  createdAt: string;
  sentAt: string | null;
  proposalId: string | null;
}

export interface CommunicationRecipient {
  recipientId: string;
  address: string;
  name: string;
  role: "primary" | "co" | "speaker";
  speakerId: string | null;
  inclusion: RecipientInclusion;
  inclusionReason: string;
  deliverability: RecipientDeliverability;
  selected: boolean;
  priorCommunications: PriorCommunicationEvidence[];
}

export interface CommunicationRecipientGroup {
  groupId: string;
  proposalId: string | null;
  sessionId: string | null;
  label: string;
  outcome: ProgramOutcome | null;
  recipients: CommunicationRecipient[];
}

export interface FrozenCommunicationDraft {
  draftId: string;
  groupId: string;
  proposalId: string | null;
  sessionId: string | null;
  toEmail: string;
  recipientName: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachmentRefs: string[];
  calendarIntent: {
    uid: string | null;
    sequence: number | null;
    operation: "none" | "create" | "update" | "cancel";
  } | null;
  status: CommunicationDraftStatus;
  frozenAt: string | null;
  frozenPlanVersion: number | null;
}

export interface CommunicationPlanSource {
  kind: "linked_decision" | "selection" | "publication";
  decisionPlanId: string | null;
  decisionPlanVersion: number | null;
  decisionPlanDigest: string | null;
  selection: {
    proposalIds: string[];
    sessionIds: string[];
    speakerIds: string[];
    taskIds: string[];
  } | null;
}

/** Full communication plan (CC-03). Publication may create a linked stub with empty groups. */
export interface CommunicationPlanBody {
  actionType: "communication";
  source: CommunicationPlanSource;
  purpose: CommunicationPurpose;
  templateKind: CommunicationTemplateKind;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  recipientGroups: CommunicationRecipientGroup[];
  /** @deprecated Prefer recipientGroups; kept empty for older stub readers. */
  recipients: CommunicationRecipient[];
  drafts: FrozenCommunicationDraft[];
  calendarOps: Array<{
    sessionId: string;
    kind: "create" | "update" | "cancel";
    uid: string;
    sequence: number;
  }>;
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  evidenceSections: CourseCheckEvidenceSection[];
  softWarningOverrides: SoftWarningOverride[];
  /** Independent stage visibility — never inherits decision/publication approval. */
  stageVisibility: {
    decision: CommunicationStageState;
    draft: CommunicationStageState;
    send: CommunicationStageState;
    delivery: CommunicationStageState;
  };
  linkedPlanIds: string[];
  parentPlanId: string | null;
  batchGroupId: string | null;
  splitExplanation: string | null;
  relevantRevisions: {
    proposalIds: string[];
    proposalRevisions: Record<string, number>;
    speakerEmails: string[];
    contentFingerprint: string;
  };
  ageWarningHours: number;
  ageWarning?: {
    active: boolean;
    ageHours: number;
    message: string;
  } | null;
  /** True when private recipient/draft fields were redacted for the caller. */
  redacted?: boolean;
}

export type CourseCheckPlanBody =
  | DecisionPlanBody
  | GuaranteedSpeakerPlanBody
  | PublicationPlanBody
  | CommunicationPlanBody;

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

export interface CourseCheckPlanVersion {
  planId: string;
  version: number;
  digest: string;
  state: CourseCheckPlanState;
  body: CourseCheckPlanBody;
  createdAt: string;
  createdBy: CourseCheckActor;
  mutationKind: PlanMutationRecord["kind"];
  summary: string;
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
  /** Immutable prior versions (newest first, excludes current). */
  versions?: CourseCheckPlanVersion[];
  mutations?: PlanMutationRecord[];
}

export interface CreateDecisionCourseCheckRequest {
  /** Single-proposal shorthand. */
  proposalId?: string;
  outcome?: ProgramOutcome;
  /** Batch selections. */
  items?: Array<{
    proposalId: string;
    outcome: ProgramOutcome;
  }>;
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

export interface CreatePublicationCourseCheckRequest {
  operation: PublicationOperation;
  /** Required when operation is restore. */
  restoreRevisionId?: string;
  idempotencyKey: string;
}

export interface CreateCommunicationCourseCheckRequest {
  /** Create from a completed Decision Course Check (no approval transfer). */
  decisionPlanId?: string;
  /** Direct selection entry points. */
  proposalIds?: string[];
  sessionIds?: string[];
  speakerIds?: string[];
  taskIds?: string[];
  templateKind?: CommunicationTemplateKind;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  idempotencyKey: string;
}

export interface ReviseCommunicationCourseCheckRequest {
  planVersion: number;
  digest: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  /** Toggle recipient selection by recipientId. */
  recipientSelection?: Array<{
    recipientId: string;
    selected: boolean;
  }>;
  idempotencyKey: string;
}

export interface CreateCommunicationDraftsRequest {
  planVersion: number;
  digest: string;
  stageId: "create-drafts";
  idempotencyKey: string;
  softWarningOverrides?: Array<{
    findingId: string;
    reason?: string | null;
  }>;
}

export interface ApplyCourseCheckRequest {
  planVersion: number;
  digest: string;
  stageId: string;
  idempotencyKey: string;
  softWarningOverrides?: Array<{
    findingId: string;
    reason?: string | null;
  }>;
}

export interface DeferCourseCheckItemsRequest {
  planVersion: number;
  digest: string;
  itemIds: string[];
  reason: string;
  idempotencyKey: string;
}

export interface CourseCheckErrorBody {
  error: string;
  code?: string;
  recoveryGuidance?: string;
  findings?: CourseCheckFinding[];
  changedInputs?: string[];
}

/** Default safe transactional batch size before linked-plan split. */
export const DEFAULT_DECISION_BATCH_LIMIT = 25;

/** Default age warning for unchanged external stages (hours). */
export const DEFAULT_AGE_WARNING_HOURS = 24;

export const EVIDENCE_SECTION_ORDER: CourseCheckEvidenceKind[] = [
  "irreversible",
  "people",
  "public",
  "operational",
  "integration",
  "internal",
];

export const EVIDENCE_SECTION_TITLES: Record<CourseCheckEvidenceKind, string> = {
  irreversible: "Irreversible effects",
  people: "People affected",
  public: "Public consequences",
  operational: "Operational warnings",
  integration: "Integration effects",
  internal: "Internal record details",
};
