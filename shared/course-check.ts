import type { CourseCheckAirtableEvidence } from "./airtable";
import type {
  CourseCheckIssueAction,
  CourseCheckRevalidationSummary,
} from "./course-check-actions";

/** Course Check v1 contract — decision, publication, communication drafts, batch workspace. */

import type { CommunicationReviewProjection } from "./course-check-communication-results";
export type * from "./course-check-communication-results";

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
  | "out_of_date"
  | "deferred"
  | "removed";

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
    | "recipient"
    | "calendar_invite"
    | "airtable_record";
  action:
    | "create"
    | "update"
    | "reuse"
    | "none"
    | "remove"
    | "include"
    | "exclude"
    | "freeze"
    | "cancel";
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  proposalId?: string;
  sessionId?: string;
}

/** One planned calendar delivery operation with stable UID lifecycle. */
export interface CalendarOperation {
  sessionId: string;
  kind: "create" | "update" | "cancel";
  uid: string;
  sequence: number;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  roomName: string | null;
  locationPending: boolean;
  timePending: boolean;
  recipients: Array<{ email: string; name: string }>;
  previous: {
    startsAt: string | null;
    endsAt: string | null;
    roomId: string | null;
    roomName: string | null;
  } | null;
  /** Calendar invites are not recalled; corrections are compensating updates/cancels. */
  reversibility: "compensating_update_or_cancel";
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
    | "link"
    | "airtable_defer"
    | "airtable_remove"
    | "airtable_execute"
    | "airtable_reconcile"
    | "airtable_compensate"
    | "send"
    | "retry"
    | "reconcile"
    | "compensate";
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
  airtable: CourseCheckAirtableEvidence;
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
  airtable: CourseCheckAirtableEvidence;
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
  calendarConsequences: CalendarOperation[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  airtable: CourseCheckAirtableEvidence;
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
  | "in_progress"
  | "partially_complete"
  | "needs_attention"
  | "complete"
  | "out_of_date";

export type CommunicationEffectStatus =
  | "queued"
  | "sending"
  | "retry_scheduled"
  | "succeeded"
  | "permanent_failure"
  | "exhausted"
  | "unknown";

export interface CommunicationEffect {
  effectId: string;
  planId: string;
  planVersion: number;
  draftId: string;
  payloadIdentity: string;
  toEmail: string;
  status: CommunicationEffectStatus;
  providerReference: string | null;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  succeededAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationDeliverySummary {
  total: number;
  queued: number;
  sending: number;
  succeeded: number;
  retryScheduled: number;
  failed: number;
  unknown: number;
}

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

export interface FrozenCalendarIntent {
  uid: string;
  sequence: number;
  operation: "none" | "create" | "update" | "cancel";
  sessionId: string | null;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationPending: boolean;
  timePending: boolean;
  method: "REQUEST" | "CANCEL" | null;
  /** Frozen ICS body attached at draft freeze; never regenerated on retry. */
  ics: string | null;
  reversibility: "compensating_update_or_cancel" | null;
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
  calendarIntent: FrozenCalendarIntent | null;
  status: CommunicationDraftStatus;
  frozenAt: string | null;
  frozenPlanVersion: number | null;
}

export interface CommunicationPlanSource {
  kind: "linked_decision" | "selection" | "publication" | "compensation";
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
  effects: CommunicationEffect[];
  deliverySummary: CommunicationDeliverySummary;
  calendarOps: CalendarOperation[];
  deltas: CourseCheckDelta[];
  findings: CourseCheckFinding[];
  stages: CourseCheckStage[];
  airtable: CourseCheckAirtableEvidence;
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
  /** A correction is a new reviewed plan linked to an immutable sent effect. */
  compensation: {
    originalPlanId: string;
    originalEffectId: string;
    reason: string;
  } | null;
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
  /** Distinct agent vs human principal — agents never silently impersonate users. */
  kind?: "human" | "agent";
  agentId?: string;
  agentMode?: import("./agent-api").AgentOperatingMode;
  /** Optional human request provenance when an agent acts. */
  initiatingHuman?: { id: string; displayName: string } | null;
}

/** Organizer-facing actor line — agents never look like silent human impersonation. */
export function formatCourseCheckActorLabel(
  actor: Pick<
    CourseCheckActor,
    "displayName" | "kind" | "initiatingHuman"
  > | null | undefined,
): string {
  if (!actor) return "Unknown";
  const name = actor.displayName.trim() || "Unknown";
  if (actor.kind === "agent") {
    const human = actor.initiatingHuman?.displayName?.trim();
    if (human) return `${name} (agent on behalf of ${human})`;
    return `${name} (agent)`;
  }
  return name;
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

export type DecisionReviewEffectState = "pending" | "applied" | "unchanged";

export type DecisionReviewIssueClass =
  | "needs_action"
  | "check"
  | "details"
  | "could_not_check";

export interface DecisionReviewAffectedItem {
  itemId: string;
  proposalId: string;
}

export interface DecisionReviewIssue {
  severity: CourseCheckFindingSeverity;
  classification: DecisionReviewIssueClass;
  label: "Needs action" | "Check" | "Details" | "Could not check";
  summary: string;
  /** Plain-language description of the affected object(s). */
  affectedObjectLabel: string;
  /** What happens when the organizer leaves the issue unchanged. */
  consequence: string;
  /** Whether the issue blocks one item, one effect, or the permitted commit. */
  scope: string;
  nextStep: string | null;
  /** Consequence-specific safe alternative; ticket 17 may add direct repair actions. */
  safeAlternativeLabel: string | null;
  affectedItemCount: number;
  affectedItems: DecisionReviewAffectedItem[];
  actions: CourseCheckIssueAction[];
}

export type DecisionReviewItemFilter =
  | "needs_action"
  | "check"
  | "ready"
  | "skipped";

export interface DecisionReviewItemProjection {
  itemId: string;
  proposalId: string;
  proposalLabel: string;
  proposedDecision: "Will accept" | "Will decline" | "Accepted" | "Declined";
  speakerContext: string;
  decisionReadiness: "Needs action" | "Ready" | "Applied" | "Skipped";
  draftReadiness: "Not prepared" | "Check" | "Could not check" | "Skipped";
  batchOutcome: "Will process" | "Processed" | "Will stay unchanged" | "Unchanged";
  filter: DecisionReviewItemFilter;
}

export interface DecisionReviewEffectGroup {
  key:
    | "decisions"
    | "records"
    | "unchanged"
    | "drafts"
    | "external_communication"
    | "integration";
  title: string;
  state: DecisionReviewEffectState;
  count: number;
  summary: string;
}

export interface DecisionReviewPermittedCommit {
  stageId: string;
  label: string;
  effectSummary: string;
  /** Item deferrals that must occur before this existing kernel stage is ready. */
  requiresDeferredItemIds?: string[];
}

export interface DecisionReviewPartialExecution {
  eligibleCount: number;
  skippedCount: number;
  canExecute: boolean;
  requiredDeferredItemIds: string[];
  primaryActionLabel: string | null;
  skippedOutcomeLabel: "Leave decision unchanged";
}

export interface DecisionReviewGeneratedRecords {
  speakersCreated: number;
  speakersReused: number;
  participationsCreated: number;
  sessionsCreated: number;
  tasksCreated: number;
  portalAccessCreated: number;
  totalCreated: number;
}

export interface DecisionReviewAppliedResult {
  title: string;
  summary: string;
  decisions: { accepted: number; declined: number; total: number };
  generatedRecords: DecisionReviewGeneratedRecords;
  unchangedCount: number;
  drafts: {
    state: "not_prepared" | "planned" | "prepared";
    count: number;
    label: string;
  };
  externalCommunication: { emailsSent: number; label: string };
  outcomeCounts: {
    processed: number;
    failed: number;
    warned: number;
    skipped: number;
    unchanged: number;
  };
  appliedAt: string;
  appliedBy: string;
}

/**
 * Organizer-facing adapter over the durable decision plan. The underlying plan
 * remains the approval/idempotency authority; this projection contains only
 * live business scope, consequences, permitted commits, and truthful results.
 */
export interface DecisionReviewProjection {
  kind: "decision_review";
  phase: "proposed" | "applied";
  title: string;
  courseCheckSummary: string;
  counts: {
    selected: number;
    ready: number;
    eligible: number;
    needsAction: number;
    warning: number;
    skipped: number;
  };
  issues: DecisionReviewIssue[];
  items: DecisionReviewItemProjection[];
  revalidation: CourseCheckRevalidationSummary;
  effectGroups: DecisionReviewEffectGroup[];
  permittedCommits: DecisionReviewPermittedCommit[];
  partialExecution: DecisionReviewPartialExecution;
  canDeferItems: boolean;
  canStartDraftPreparation: boolean;
  freshness: {
    state: "current" | "age_warning" | "out_of_date";
    label: string;
    checkedAt: string;
  };
  preCommitBoundary: string | null;
  primaryActionLabel: string | null;
  result: DecisionReviewAppliedResult | null;
}

export type ExternalEffectReviewFamily =
  | "publication"
  | "communication"
  | "integration";

export type ExternalEffectReviewPhase =
  | "proposed"
  | "in_progress"
  | "partially_complete"
  | "needs_attention"
  | "complete";

export type ExternalEffectReviewState =
  | "pending"
  | "in_progress"
  | "applied"
  | "unchanged"
  | "succeeded"
  | "failed"
  | "unknown"
  | "compensated";

export interface ExternalEffectReviewAction {
  id: string;
  label: string;
  kind: "repair" | "exclude" | "override" | "retry" | "reconcile" | "compensate";
  target:
    | { type: "route"; href: string }
    | {
        type: "command";
        command:
          | "exclude_publication_sessions"
          | "record_reasoned_override"
          | "retry_delivery"
          | "reconcile_delivery"
          | "create_delivery_correction"
          | "reconcile_airtable";
        entityIds: string[];
      };
  resultingEffectSummary: string;
}

export interface ExternalEffectReviewIssue {
  classification: DecisionReviewIssueClass;
  label: "Needs action" | "Check" | "Details" | "Could not check";
  summary: string;
  affectedObjectLabel: string;
  consequence: string;
  actions: ExternalEffectReviewAction[];
}

export interface ExternalEffectReviewGroup {
  key:
    | "publication"
    | "exclusions"
    | "calendar"
    | "airtable"
    | "delivery"
    | "compensation";
  title: string;
  state: ExternalEffectReviewState;
  count: number;
  summary: string;
  /** Organizer-language operation detail, safe for the projected viewer. */
  details: string[];
  /** Provider identifiers and protocol detail, permission-gated by the API projection. */
  providerDetails: string[];
}

export interface ExternalEffectReviewCommit {
  stageId: string;
  label: string;
  effectSummary: string;
}

export interface ExternalEffectReviewIntegrationAction {
  action: "execute" | "deferred" | "removed" | "reconcile";
  label: string;
  effectSummary: string;
}

export interface ExternalEffectReviewResult {
  state: Exclude<ExternalEffectReviewPhase, "proposed">;
  summary: string;
  processed: number;
  succeeded: number;
  failed: number;
  unknown: number;
  compensated: number;
}

/**
 * Viewer-specific business adapter for externally visible effects. Execution
 * remains governed by the durable stage, approval, digest, and effect kernels.
 */
export interface ExternalEffectReviewProjection {
  kind: "external_effect_review";
  family: ExternalEffectReviewFamily;
  phase: ExternalEffectReviewPhase;
  title: string;
  summary: string;
  attentionCount: number;
  issues: ExternalEffectReviewIssue[];
  effectGroups: ExternalEffectReviewGroup[];
  permittedActions: ExternalEffectReviewCommit[];
  integrationActions: ExternalEffectReviewIntegrationAction[];
  primaryActionLabel: string | null;
  result: ExternalEffectReviewResult | null;
}

export interface CourseCheckSharedApprovalProjection {
  kind: "shared_approval";
  currentStage: {
    stageId: string;
    label: string;
    status: CourseCheckStageStatus;
    canExecute: boolean;
    canEndorse: boolean;
    /** A read-authorized viewer can hand the exact review to an authorized actor. */
    canRequestApproval: boolean;
    availableCommit: {
      stageId: string;
      label: string;
      effectSummary: string;
    } | null;
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
    state: "current" | "age_warning" | "out_of_date";
    changedInputs: string[];
    affectedStageIds: string[];
    preservedStageIds: string[];
    nextAction: string;
  };
  /** Only projected to principals allowed to inspect operational internals. */
  technicalDetails?: {
    planId: string;
    planVersion: number;
    digest: string;
    sourceRevisions: string[];
    policyRules: string[];
  };
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
  /** Authenticated viewer-specific business projection for decision reviews. */
  decisionReview?: DecisionReviewProjection;
  /** Authenticated viewer-specific publication, delivery, and integration review. */
  externalReview?: ExternalEffectReviewProjection;
  /** Viewer-specific stage authority, resumption, freshness, and audit adapter. */
  sharedApproval?: CourseCheckSharedApprovalProjection;
  /** Authenticated viewer-specific communication status, result, and Outbox handoff. */
  communicationReview?: CommunicationReviewProjection;
  /** Immutable prior versions (newest first, excludes current). */
  versions?: CourseCheckPlanVersion[];
  mutations?: PlanMutationRecord[];
  /** Stage endorsements awaiting a second person (two-person policy). */
  stageEndorsements?: CourseCheckStageEndorsement[];
  /** Normalized activity distinguishing requester/approver/executor/agent. */
  activity?: CourseCheckActivityEntry[];
  /** True when personal payloads were privacy-erased in storage. */
  privacyErased?: boolean;
  privacyErasedAt?: string | null;
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
  /** Optional stage approval reason (required when event policy mandates it). */
  reason?: string | null;
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

/** Optional stricter event policy — can only tighten, never weaken the kernel. */
export interface EventCourseCheckPolicy {
  /** Second distinct actor must endorse before stage execution. Default false. */
  requireTwoPersonApproval: boolean;
  /** Stage executor cannot be the plan creator. Default false. */
  requireDistinctApprover: boolean;
  /** Require a non-empty reason on every stage execution (beyond material-external). Default false. */
  requireReasonOnApprove: boolean;
  /** Ceiling for agent operating mode. Default autonomous_policy (no extra ceiling). */
  maxAgentMode: import("./agent-api").AgentOperatingMode;
}

export const DEFAULT_COURSE_CHECK_POLICY: EventCourseCheckPolicy = {
  requireTwoPersonApproval: false,
  requireDistinctApprover: false,
  requireReasonOnApprove: false,
  maxAgentMode: "autonomous_policy",
};

const AGENT_MODE_RANK: Record<import("./agent-api").AgentOperatingMode, number> = {
  propose_only: 0,
  delegated_execution: 1,
  autonomous_policy: 2,
};

export function agentModeRank(
  mode: import("./agent-api").AgentOperatingMode,
): number {
  return AGENT_MODE_RANK[mode] ?? 0;
}

export function mergeCourseCheckPolicy(
  partial: Partial<EventCourseCheckPolicy> | null | undefined,
): EventCourseCheckPolicy {
  const base = { ...DEFAULT_COURSE_CHECK_POLICY };
  if (!partial || typeof partial !== "object") return base;
  if (typeof partial.requireTwoPersonApproval === "boolean") {
    base.requireTwoPersonApproval = partial.requireTwoPersonApproval;
  }
  if (typeof partial.requireDistinctApprover === "boolean") {
    base.requireDistinctApprover = partial.requireDistinctApprover;
  }
  if (typeof partial.requireReasonOnApprove === "boolean") {
    base.requireReasonOnApprove = partial.requireReasonOnApprove;
  }
  if (
    partial.maxAgentMode === "propose_only" ||
    partial.maxAgentMode === "delegated_execution" ||
    partial.maxAgentMode === "autonomous_policy"
  ) {
    base.maxAgentMode = partial.maxAgentMode;
  }
  return base;
}

/** Policy never disables digest, authz, freshness, or break-glass (none exist). */
export function assertPolicyDoesNotWeakenBaseline(
  policy: EventCourseCheckPolicy,
): { ok: true } | { ok: false; error: string } {
  const keys = Object.keys(policy as object);
  const allowed = new Set([
    "requireTwoPersonApproval",
    "requireDistinctApprover",
    "requireReasonOnApprove",
    "maxAgentMode",
  ]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        error: `Unknown policy key "${key}" cannot weaken baseline Course Check protections.`,
      };
    }
  }
  return { ok: true };
}

/** Prior stage endorsement used for two-person approval. */
export interface CourseCheckStageEndorsement {
  stageId: string;
  planVersion: number;
  digest: string;
  actor: CourseCheckActor;
  endorsedAt: string;
  reason: string | null;
}

export type CourseCheckActivityRole =
  | "requester"
  | "endorser"
  | "approver"
  | "executor"
  | "agent"
  | "system";

export interface CourseCheckActivityEntry {
  id: string;
  at: string;
  role: CourseCheckActivityRole;
  kind: string;
  summary: string;
  actor: CourseCheckActor | null;
  planId: string;
  planVersion?: number;
  effectId?: string;
  outcome?: string | null;
}

export interface PrivacyErasureResult {
  planId: string;
  erasedAt: string;
  erasedBy: CourseCheckActor;
  fieldsRedacted: number;
  preserved: {
    planId: true;
    digests: true;
    approvals: true;
    receipts: true;
    effectIds: true;
    outcomes: true;
    compensationLinks: true;
  };
}

export interface PrivacyErasureRequest {
  reason: string;
  idempotencyKey: string;
}

export function linkedPlanIdsFromBody(body: CourseCheckPlanBody): string[] {
  if (
    body.actionType === "decision" ||
    body.actionType === "publication" ||
    body.actionType === "communication"
  ) {
    return body.linkedPlanIds ?? [];
  }
  return [];
}

export function parentPlanIdFromBody(body: CourseCheckPlanBody): string | null {
  if (
    body.actionType === "decision" ||
    body.actionType === "publication" ||
    body.actionType === "communication"
  ) {
    return body.parentPlanId ?? null;
  }
  return null;
}

export function buildCourseCheckActivity(plan: CourseCheckPlan): CourseCheckActivityEntry[] {
  const entries: CourseCheckActivityEntry[] = [];
  entries.push({
    id: `${plan.id}:request`,
    at: plan.createdAt,
    role: plan.createdBy.kind === "agent" ? "agent" : "requester",
    kind: "create",
    summary: `Requested ${plan.actionType} Course Check`,
    actor: plan.createdBy,
    planId: plan.id,
    planVersion: 1,
  });
  for (const endorsement of plan.stageEndorsements ?? []) {
    entries.push({
      id: `${plan.id}:endorse:${endorsement.stageId}:${endorsement.endorsedAt}`,
      at: endorsement.endorsedAt,
      role: "endorser",
      kind: "endorse",
      summary: `Endorsed stage ${endorsement.stageId}`,
      actor: endorsement.actor,
      planId: plan.id,
      planVersion: endorsement.planVersion,
    });
  }
  if (plan.approval) {
    entries.push({
      id: `${plan.id}:approve:${plan.approval.stageId}:${plan.approval.approvedAt}`,
      at: plan.approval.approvedAt,
      role: plan.approval.actor.kind === "agent" ? "agent" : "approver",
      kind: "approve",
      summary: `Approved stage ${plan.approval.stageId}`,
      actor: plan.approval.actor,
      planId: plan.id,
      planVersion: plan.approval.planVersion,
    });
  }
  if (plan.receipt) {
    entries.push({
      id: `${plan.id}:execute:${plan.receipt.id}`,
      at: plan.receipt.appliedAt,
      role: plan.receipt.actor.kind === "agent" ? "agent" : "executor",
      kind: "execute",
      summary: `Executed stage ${plan.receipt.stageId}`,
      actor: plan.receipt.actor,
      planId: plan.id,
      planVersion: plan.receipt.planVersion,
      outcome: plan.state,
    });
  }
  for (const mutation of plan.mutations ?? []) {
    if (mutation.kind === "create" || mutation.kind === "apply") continue;
    entries.push({
      id: mutation.id,
      at: mutation.at,
      role: mutation.actor.kind === "agent" ? "agent" : "executor",
      kind: mutation.kind,
      summary: mutation.summary,
      actor: mutation.actor,
      planId: plan.id,
      planVersion: mutation.toVersion,
    });
  }
  if (plan.body.actionType === "communication") {
    for (const effect of plan.body.effects) {
      entries.push({
        id: `${plan.id}:effect:${effect.effectId}:${effect.status}`,
        at: effect.updatedAt || effect.createdAt,
        role: "system",
        kind: "effect_outcome",
        summary: `Effect ${effect.effectId.slice(0, 8)} → ${effect.status}`,
        actor: null,
        planId: plan.id,
        effectId: effect.effectId,
        outcome: effect.status,
      });
    }
    if (plan.body.compensation) {
      entries.push({
        id: `${plan.id}:compensation`,
        at: plan.updatedAt,
        role: "system",
        kind: "compensation",
        summary: `Compensation for effect ${plan.body.compensation.originalEffectId.slice(0, 8)}: ${plan.body.compensation.reason}`,
        actor: null,
        planId: plan.id,
        effectId: plan.body.compensation.originalEffectId,
        outcome: plan.body.compensation.reason,
      });
    }
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));
  return entries;
}
