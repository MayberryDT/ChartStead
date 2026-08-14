import type {
  CfpDefinitionV1,
  CfpLifecycleStatus,
  UploadedAssetAnswer,
} from "./cfp-definition";

export type {
  CfpCondition,
  CfpDefinitionV1,
  CfpLifecycleStatus,
  RestrictedQuestion,
  RestrictedSurveyElement,
  SurveyChoice,
  UploadedAssetAnswer,
} from "./cfp-definition";

export interface TrackRecord {
  id: string;
  name: string;
  proposalCount: number;
}

export interface RoomRecord {
  id: string;
  name: string;
  readiness: "ready" | "pending";
}

export interface EventRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
  submissionCount: number;
  unreviewedCount: number;
  tracks: TrackRecord[];
  rooms: RoomRecord[];
  themeAccent?: string;
}

export interface OrganizerPrincipal {
  id: string;
  displayName: string;
  role: "admin" | "reviewer";
  eventIds: string[];
  rolesByEvent?: Record<string, "admin" | "reviewer">;
  trackIdsByEvent?: Record<string, string[]>;
  /**
   * Agents are distinct principals (not silent human impersonations).
   * Omit or `human` for organizer sessions.
   */
  principalKind?: "human" | "agent";
  /** Stable agent grant id when principalKind is agent. */
  agentId?: string;
  /**
   * propose_only (default) | delegated_execution | autonomous_policy.
   * Connecting an agent never implies autonomous consequential authority.
   */
  agentMode?: import("./agent-api").AgentOperatingMode;
  /** Expanded per-event Course Check scopes (never stores bare `all`). */
  courseCheckScopesByEvent?: Record<
    string,
    import("./agent-api").CourseCheckScope[]
  >;
  /** Optional human who requested this agent turn (request provenance). */
  initiatingHuman?: { id: string; displayName: string } | null;
}

export interface EventListResponse {
  events: EventRecord[];
  principal: OrganizerPrincipal;
}

export type ProposalStatus = "unreviewed" | "approve" | "maybe" | "deny";

/** Final program outcome — separate from reversible review disposition. */
export type ProgramOutcome = "accepted" | "declined";

/** JSON-shaped answer bag (interface form keeps DO RPC types finite). */
export interface SubmissionAnswers {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | UploadedAssetAnswer
    | SubmissionAnswers
    | Array<string | number | boolean | null | UploadedAssetAnswer | SubmissionAnswers>;
}

export interface CoSpeakerInput {
  name: string;
  email: string;
  biography: string;
  /** Submission-time role context, for example “co-speaker” or a custom CFP role answer. */
  role?: string;
}

export interface ProposalInput {
  title: string;
  abstract: string;
  trackId: string;
  speakerName: string;
  speakerEmail: string;
  biography: string;
  supportingLink: string;
  sessionFormat?: string;
  workshopDuration?: string;
  coSpeakers?: CoSpeakerInput[];
  supportingFile?: UploadedAssetAnswer | null;
}

export interface ProposalSubmissionRequest {
  formId: string;
  formDefinitionVersion: number;
  answers: SubmissionAnswers;
  /** Optional authenticated draft to consume exactly once during final submission. */
  draftId?: string;
}

export interface ProposalDraftSaveRequest {
  formId: string;
  formDefinitionVersion: number;
  answers: SubmissionAnswers;
  expectedUpdatedAt?: string;
}

export interface ProposalEditRequest {
  answers: SubmissionAnswers;
}

/** @deprecated Prefer ProposalSubmissionRequest; kept for transitional call sites. */
export interface ProposalSubmission extends ProposalInput {
  formId: string;
  formDefinitionVersion: number;
}

export interface PublicProposal {
  id: string;
  eventId: string;
  title: string;
  trackId: string;
  trackName: string;
  speakerName: string;
  submittedAt: string;
}

export type SubmitterProposalStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "rejected";

export interface SubmitterProposal {
  id: string;
  eventId: string;
  title: string;
  trackId: string;
  trackName: string;
  speakerName: string;
  submittedAt: string;
  status: SubmitterProposalStatus;
  claimed: boolean;
  claimable: boolean;
}

export interface SubmitterProposalDraft {
  id: string;
  eventId: string;
  title: string;
  formId: string;
  formName: string;
  formDefinitionVersion: number;
  latestFormDefinitionVersion: number | null;
  formVersionStale: boolean;
  lifecycle: CfpPublicLifecycle;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitterDashboardResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
  proposals: SubmitterProposal[];
  drafts: SubmitterProposalDraft[];
}

export interface OrganizerProposal extends PublicProposal {
  formId: string;
  formDefinitionVersion: number;
  answers: SubmissionAnswers;
  abstract: string;
  speakerEmail: string;
  biography: string;
  supportingLink: string;
  sessionFormat: string;
  workshopDuration: string;
  coSpeakers: CoSpeakerInput[];
  supportingFile: UploadedAssetAnswer | null;
  status: ProposalStatus;
  /** Final accepted/declined program state; null until a Decision Course Check applies. */
  programOutcome: ProgramOutcome | null;
  committeeNote: string;
  privateNote: string;
  reviewVersion: number;
  confirmationEmailStatus: OutboxDeliveryStatus | null;
  /** Aggregate for the currently selected scorecard round, when requested. */
  scorecardAggregate: ScorecardAggregate | null;
  /** Present for the current reviewer/round only; null for normal reviewer work. */
  reviewerRecusal: ProposalReviewerRecusal | null;
  /** Organizer-only visibility for reassignment; reviewer responses only include their own recusal. */
  reviewerRecusals: ProposalReviewerRecusal[];

}
export interface ProposalReviewerRecusal {
  id: string;
  proposalId: string;
  roundId: string;
  reviewerId: string;
  reviewerName: string;
  /** Private to organizers and the recusing reviewer. */
  reason: string;
  createdAt: string;
}


export type ProposalAuditEventType =
  | "proposal.review.changed"
  | "proposal.review.recused"
  | "course_check.decision.applied"
  | "course_check.communication.drafts_created"
  | "course_check.communication.send_started"
  | "course_check.communication.effect_retry"
  | "course_check.communication.effect_reconciled"
  | "course_check.communication.correction_created";

export interface ProposalAuditEvent {
  id: string;
  proposalId: string;
  roundId?: string | null;
  type: ProposalAuditEventType;
  actorId: string;
  actorName: string;
  fromStatus: ProposalStatus | string;
  toStatus: ProposalStatus | string;
  committeeNoteChanged: boolean;
  createdAt: string;
}

export interface ProposalReviewResponse {
  proposal: OrganizerProposal;
  auditEvents: ProposalAuditEvent[];
  scorecard: ProposalScorecardReviewProjection | null;
}

export type ScorecardCriterionType = "numeric" | "dropdown" | "text";
export type ScorecardCriterionValue = string | number | null;

export interface ScorecardDropdownOption {
  id: string;
  label: string;
  score: number | null;
}

export interface EvaluationScorecardCriterion {
  id: string;
  type: ScorecardCriterionType;
  label: string;
  guidance: string;
  required: boolean;
  weight: number | null;
  maxScore: number | null;
  options: ScorecardDropdownOption[];
}

export interface EvaluationScorecard {
  criteria: EvaluationScorecardCriterion[];
  calculationDescription: string;
}

export interface ScorecardAggregate {
  roundId: string;
  scorecardRef: string;
  responseCount: number;
  completedResponseCount: number;
  aggregateScore: number | null;
  calculatedAt: string | null;
}

export interface ProposalScorecardReviewProjection {
  round: EvaluationRound | null;
  reviewerResponse: ReviewEvidence | null;
  reviews: ReviewEvidence[];
  aggregate: ScorecardAggregate | null;
  calculationDescription: string | null;
}

export type ReviewCompletionStatus = "not_started" | "incomplete" | "complete";

export interface ReviewCriterionResult {
  id: string;
  label: string;
  value: number;
  maxScore: number;
  weight: number;
  weightedScore: number;
}

export interface ReviewEvidence {
  proposalId: string;
  roundId: string | null;
  reviewerId: string;
  reviewerName: string;
  recommendation: ProposalStatus;
  completionStatus: ReviewCompletionStatus;
  aggregateScore: number | null;
  criteria: ReviewCriterionResult[];
  completedAt: string | null;
  updatedAt: string;
  values: Record<string, ScorecardCriterionValue>;
}

export interface ReviewResultsCriterion {
  id: string;
  label: string;
  maxScore: number;
  weight: number;
  type: ScorecardCriterionType;
  guidance: string;
  required: boolean;
  options: ScorecardDropdownOption[];
}

export interface ReviewResultsSpeaker {
  name: string;
  email: string;
  role: string;
}

export interface ReviewResultsSubmission {
  proposalId: string;
  title: string;
  trackId: string;
  trackName: string;
  submittedAt: string;
  speakers: ReviewResultsSpeaker[];
  recommendation: ProposalStatus;
  completionStatus: ReviewCompletionStatus;
  completedReviewCount: number;
  totalReviewCount: number;
  aggregateScore: number | null;
  criteria: ReviewCriterionResult[];
  reviews: ReviewEvidence[];
}

export interface ReviewResultsResponse {
  eventId: string;
  generatedAt: string;
  criteria: ReviewResultsCriterion[];
  submissions: ReviewResultsSubmission[];
}

export type ReviewReminderDeliveryState =
  | "queued"
  | "sent"
  | "failed"
  | "retryable";

export interface ReviewProgressRoundSummary {
  roundId: string | null;
  roundName: string;
  roundState: EvaluationRoundState | "shared";
  startsOn: string | null;
  endsOn: string | null;
  assignedCount: number;
  completedCount: number;
  outstandingCount: number;
  recusedCount: number;
  percentComplete: number;
  overdueReviewerCount: number;
}

export interface ReviewProgressAssignmentRef {
  proposalId: string;
  title: string;
  trackId: string;
  trackName: string;
}

export interface ReviewProgressReviewer {
  reviewerId: string;
  reviewerName: string;
  email: string;
  trackIds: string[];
  assignedCount: number;
  completedCount: number;
  outstandingCount: number;
  recusedCount: number;
  percentComplete: number;
  overdue: boolean;
  lastCompletedAt: string | null;
  lastReminderAt: string | null;
  outstandingAssignments: ReviewProgressAssignmentRef[];
}

export interface ReviewReminderHistoryEntry {
  id: string;
  roundId: string | null;
  reviewerId: string;
  reviewerName: string;
  toEmail: string;
  pendingCount: number;
  outboxId: string | null;
  status: ReviewReminderDeliveryState;
  actorName: string;
  createdAt: string;
}

export interface ReviewProgressResponse {
  eventId: string;
  generatedAt: string;
  round: ReviewProgressRoundSummary;
  reviewers: ReviewProgressReviewer[];
  incompleteReviewers: ReviewProgressReviewer[];
  overdueReviewers: ReviewProgressReviewer[];
  history: ReviewReminderHistoryEntry[];
}

export interface ReviewProgressReminderDraft {
  reviewerId: string;
  reviewerName: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  pendingCount: number;
  pendingProposalIds: string[];
}

export interface ReviewProgressReminderPreview {
  eventId: string;
  roundId: string | null;
  generatedAt: string;
  drafts: ReviewProgressReminderDraft[];
}

export interface ReviewProgressReminderResult {
  reviewerId: string;
  toEmail: string;
  outboxId: string;
  status: ReviewReminderDeliveryState;
  error: string | null;
}

export interface ReviewProgressReminderSendResult {
  eventId: string;
  roundId: string | null;
  idempotencyKey: string;
  results: ReviewProgressReminderResult[];
  history: ReviewReminderHistoryEntry[];
}

export interface ReviewerAssignment {
  id: string;
  name: string;
  email: string;
  trackIds: string[];
}

export type ReviewerInvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";

export type ReviewerInvitationDeliveryState =
  | "queued"
  | "delivered"
  | "failed"
  | "retryable";

export interface ReviewerInvitation {
  id: string;
  email: string;
  trackIds: string[];
  status: ReviewerInvitationStatus;
  deliveryState: ReviewerInvitationDeliveryState;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface ReviewerRoutingResponse {
  reviewers: ReviewerAssignment[];
  invitations: ReviewerInvitation[];
}

export type EvaluationRoundState = "draft" | "open" | "closed";
export type EvaluationAnonymization = "none" | "blind";

/** Optional event-scoped review configuration. Omitted plans use the shared track queue. */
export interface EvaluationRoundAssignment {
  roundId: string;
  proposalId: string;
  reviewerId: string;
  createdAt: string;
}

export interface EvaluationRoundAssignmentSummary {
  reviewerId: string;
  proposalIds: string[];
  count: number;
}

export interface EvaluationRoundDistributionPreview {
  roundId: string;
  trackIds: string[];
  reviewerIds: string[];
  maxAssignmentsPerReviewer: number | null;
  totalCandidates: number;
  assignments: EvaluationRoundAssignmentSummary[];
  unassignedProposalIds: string[];
}

export interface EvaluationRound {
  id: string;
  name: string;
  order: number;
  state: EvaluationRoundState;
  startsOn: string;
  endsOn: string;
  scorecardRef: string;
  scorecard: EvaluationScorecard;
  anonymization: EvaluationAnonymization;
  /** Compatibility/readability alias for clients that prefer a boolean setting. */
  anonymized: boolean;
  reviewerPool: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationPlan {
  eventId: string;
  enabled: boolean;
  version: number;
  rounds: EvaluationRound[];
  updatedAt: string;
}

export type EvaluationRoundAccessReason =
  | "allowed"
  | "plan_disabled"
  | "round_not_found"
  | "reviewer_not_assigned"
  | "round_not_open"
  | "outside_date_window";

export interface EvaluationRoundAccess {
  allowed: boolean;
  reason: EvaluationRoundAccessReason;
  round: EvaluationRound | null;
}

export interface EvaluationPlanAuditEvent {
  id: string;
  roundId: string | null;
  action: string;
  actorId: string;
  actorName: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewerInvitationPreview {
  eventId: string;
  eventName: string;
  emailHint: string;
  tracks: Array<{ id: string; name: string }>;
  status: ReviewerInvitationStatus;
}

export type OutboxDeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export type OutboxMessageKind =
  | "submission_confirmation"
  | "onboarding_reminder"
  | "reviewer_invitation"
  | "reviewer_reminder";

export interface OutboxMessage {
  id: string;
  kind: OutboxMessageKind | string;
  toEmail: string;
  subject: string;
  status: OutboxDeliveryStatus;
  proposalId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
}

export type OnboardingTaskStatus = "open" | "completed";

export type OnboardingCompletionRequirement = "manual" | "file" | "ack";

export type OnboardingDeliverableCommentAuthorRole = "organizer" | "speaker";

export interface OnboardingDeliverableComment {
  id: string;
  assetId: string;
  body: string;
  author: {
    id: string;
    name: string;
    role: OnboardingDeliverableCommentAuthorRole;
  };
  createdAt: string;
}

export interface OnboardingTaskAssetVersion {
  assetId: string;
  version: number;
  isLatest: boolean;
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string | null;
  comments: OnboardingDeliverableComment[];
}

export interface OnboardingTaskAsset {
  assetId: string;
  version: number;
  isLatest: boolean;
  versions: OnboardingTaskAssetVersion[];
  comments: OnboardingDeliverableComment[];
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string | null;
}

export interface OnboardingFileConstraints {
  maxBytes: number;
  acceptMimeTypes: string[];
  acceptExtensions: string[];
}

export interface PortalOnboardingTask {
  id: string;
  title: string;
  kind: string;
  status: OnboardingTaskStatus | string;
  speakerId: string;
  dueAt: string | null;
  instructions: string;
  completionRequirement: OnboardingCompletionRequirement | string;
  fileConstraints: OnboardingFileConstraints | null;
  readinessFlag: string | null;
  asset: OnboardingTaskAsset | null;
  completedAt: string | null;
}

export interface OnboardingTaskBatchResult {
  idempotencyKey: string;
  tasks: PortalOnboardingTask[];
}

export type ReminderDraftStatus =
  | "draft"
  | "discarded"
  | "queued"
  | "sent"
  | "failed";

export interface OnboardingReminderDraft {
  id: string;
  speakerId: string;
  proposalId: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  status: ReminderDraftStatus;
  missingTaskIds: string[];
  outboxId: string | null;
  lastError: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface OnboardingReminderRecipientResult {
  speakerId: string;
  speakerName: string;
  email: string;
  status:
    | "prepared"
    | "queued"
    | "sent"
    | "failed"
    | "retry_scheduled"
    | "skipped";
  reason: string;
  taskIds: string[];
  taskSummaries: Array<{
    taskId: string;
    title: string;
    dueAt: string | null;
  }>;
  draftId: string | null;
  outboxId: string | null;
  lastError: string | null;
}

export interface OnboardingBulkReminderResult {
  idempotencyKey: string;
  mode: "draft" | "send";
  processedAt: string;
  counts: {
    selected: number;
    prepared: number;
    queued: number;
    sent: number;
    failed: number;
    retryScheduled: number;
    skipped: number;
  };
  recipients: OnboardingReminderRecipientResult[];
}

export interface OnboardingReminderAutomationPolicy {
  enabled: boolean;
  mode: "draft" | "send";
  dueWindowDays: number;
  suppressWithinHours: number;
  unattendedSendAuthorized: boolean;
  updatedAt: string | null;
  updatedById: string | null;
  updatedByName: string | null;
}

export interface OnboardingAutomaticReminderResult extends OnboardingBulkReminderResult {
  policy: OnboardingReminderAutomationPolicy;
}


export interface OnboardingHistoryEntry {
  id: string;
  speakerId: string;
  taskId: string | null;
  assetId: string | null;
  type: string;
  summary: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

/** Organizer-controlled event workflow; this never changes the reusable speaker identity. */
export type SpeakerWorkflowStatus =
  | "invited"
  | "confirmed"
  | "preparing"
  | "ready"
  | "withdrawn";

export interface OrganizerTaskAttachment {
  assetId: string;
  version: number;
  isLatest: boolean;
  versions: OnboardingTaskAssetVersion[];
  comments: OnboardingDeliverableComment[];
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  previewable: boolean;
  fileType: string;
  dueState: FilesLibraryDueState;
  uploader: {
    id: string;
    name: string;
    email: string;
  };
  task: {
    id: string;
    title: string;
    status: OnboardingTaskStatus | string;
    dueAt: string | null;
    completedAt: string | null;
  };
  speaker: {
    id: string;
    name: string;
    email: string;
  };
  session: {
    id: string;
    title: string;
    format: string;
    roomId: string | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
}

export type FilesLibraryDueState = "on-time" | "late" | "no-due-date";

export interface FilesLibraryItem extends OrganizerTaskAttachment {
  currentVersion: number;
  versionCount: number;
  safeExportPath: string;
}

export interface FilesLibraryResponse {
  eventId: string;
  generatedAt: string;
  files: FilesLibraryItem[];
  filters: {
    speakers: Array<{ id: string; name: string }>;
    sessions: Array<{ id: string; title: string }>;
    taskStatuses: string[];
    fileTypes: string[];
    dueStates: FilesLibraryDueState[];
  };
}

export interface FilesLibraryExportRequest {
  assetIds?: string[];
  sessionIds?: string[];
}

export interface OnboardingBoardSpeaker {
  speakerId: string;
  name: string;
  email: string;
  biography: string;
  socialLinks?: SpeakerSocialLinks;
  headshotAssetId?: string | null;
  headshotFileName?: string | null;
  participationId: string;
  titleSnapshot: string;
  organizationSnapshot: string;
  proposalId: string | null;
  proposalTitle: string | null;
  role: string;
  /** Event participation state, independent of onboarding task readiness. */
  workflowStatus: SpeakerWorkflowStatus;
  /** Event-specific travel needs supplied or recorded for this event. */
  travelPreferences: string;
  /** Organizer-defined event logistics fields such as arrival time or hotel nights. */
  logistics: Record<string, string>;
  openTaskCount: number;
  overdueCount: number;
  nextDueAt: string | null;
  daysUntilNextDue: number | null;
  readinessFlags: string[];
  taskAttachments?: OrganizerTaskAttachment[];
  missingWork: Array<{
    taskId: string;
    title: string;
    dueAt: string | null;
    daysUntilDue: number | null;
    readinessFlag: string | null;
  }>;
  lastContactAt: string | null;
  lastContactStatus: string | null;
  history: OnboardingHistoryEntry[];
}

export interface SpeakerDirectoryIdentityMatch {
  speakerId: string;
  name: string;
  email: string;
  signal: "email" | "name";
}

export interface SpeakerDirectoryCreateInput {
  name: string;
  email: string;
  biography?: string;
  socialLinks?: SpeakerSocialLinks;
  titleSnapshot: string;
  organizationSnapshot: string;
  role?: string;
  reuseSpeakerId?: string;
  createNewIdentity?: boolean;
}

export interface SpeakerSocialLinks {
  linkedin: string;
  x: string;
  github: string;
  website: string;
}

export interface SpeakerDirectoryMutation {
  speaker: OnboardingBoardSpeaker;
  reused: boolean;
  /** Session linkage remains an explicit guaranteed-speaker Course Check. */
  sessionLinkage: "course_check_required";
}

export interface SpeakerCsvColumnMapping {
  name: string;
  email: string;
  biography: string | null;
  title: string;
  organization: string;
}

export interface SpeakerCsvMappedRow {
  rowNumber: number;
  values: SpeakerDirectoryCreateInput;
  parseFeedback: string[];
}

export type SpeakerCsvPreviewOutcome =
  | "create"
  | "reuse"
  | "update"
  | "skip"
  | "invalid";

export interface SpeakerCsvPreviewRow {
  rowNumber: number;
  values: SpeakerDirectoryCreateInput;
  outcome: SpeakerCsvPreviewOutcome;
  feedback: string[];
  matches: SpeakerDirectoryIdentityMatch[];
  selectedSpeakerId: string | null;
}

export interface SpeakerCsvImportPreview {
  digest: string;
  headers: string[];
  mapping: SpeakerCsvColumnMapping;
  rows: SpeakerCsvPreviewRow[];
  totals: Record<SpeakerCsvPreviewOutcome, number>;
}

export type SpeakerCsvResolution = {
  action: "create" | "reuse" | "update" | "skip";
  speakerId?: string;
};

export interface SpeakerCsvImportApplyResult {
  id: string;
  idempotencyKey: string;
  previewDigest: string;
  appliedAt: string;
  actorId: string;
  actorName: string;
  totals: {
    created: number;
    reused: number;
    updated: number;
    skipped: number;
    invalid: number;
  };
  rows: Array<{
    rowNumber: number;
    outcome: "created" | "reused" | "updated" | "skipped";
    speakerId: string | null;
  }>;
}

export interface OnboardingBoard {
  eventId: string;
  speakers: OnboardingBoardSpeaker[];
  drafts: OnboardingReminderDraft[];
}

export interface PublishedCfpForm {
  id: string;
  name: string;
  status: "published";
  definitionVersion: number;
  definition: CfpDefinitionV1;
  publishedAt: string;
}

export interface OrganizerCfpForm {
  id: string;
  name: string;
  lifecycleStatus: CfpLifecycleStatus;
  draft: CfpDefinitionV1;
  draftUpdatedAt: string;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedDefinition: CfpDefinitionV1 | null;
}

export interface OrganizerCfpFormSummary {
  id: string;
  name: string;
  lifecycleStatus: CfpLifecycleStatus;
  draftUpdatedAt: string;
  publishedVersion: number | null;
  publishedAt: string | null;
}

export interface CfpFormResponse {
  event: Pick<EventRecord, "id" | "name" | "startsOn" | "endsOn"> & {
    themeAccent?: string;
  };
  form: PublishedCfpForm;
  lifecycle: CfpPublicLifecycle;
}

export type CfpPublicLifecycleState = "scheduled" | "open" | "closed";

export interface CfpPublicLifecycle {
  state: CfpPublicLifecycleState;
  reason:
    | "scheduled_open"
    | "scheduled_close"
    | "manual_close"
    | "manual_reopen"
    | "open";
  opensAt: string | null;
  closesAt: string | null;
  deadlineAt: string | null;
  timezone: string;
  evaluatedAt: string;
}

export interface ProposalValidationError {
  errors: Partial<Record<string, string>>;
  values: SubmissionAnswers;
}

export interface ProposalListResponse {
  proposals: OrganizerProposal[];
}

export interface SubmitterEditSession {
  eventId: string;
  proposalId: string;
  expiresAt: string;
  form: PublishedCfpForm;
  lifecycle: CfpPublicLifecycle;
  answers: SubmissionAnswers;
  proposal: PublicProposal & {
    speakerEmail: string;
  };
}

export interface SubmitterDraftSession {
  eventId: string;
  event: CfpFormResponse["event"];
  draft: SubmitterProposalDraft;
  form: PublishedCfpForm;
  lifecycle: CfpPublicLifecycle;
  answers: SubmissionAnswers;
}

/** Speaker-facing delivery status — independent of proposal/program outcome. */
export type PortalMessageStatus =
  | "draft"
  | "queued"
  | "sent"
  | "delivered"
  | "failed";

export type PortalMessageKind = "message" | "calendar_invite";

export interface PortalMessageCalendar {
  operation: "create" | "update" | "cancel";
  uid: string;
  sequence: number;
  locationPending: boolean;
  location: string | null;
}

/** Safe speaker-visible message/calendar invite row (no plan digests or findings). */
export interface PortalMessage {
  id: string;
  subject: string;
  status: PortalMessageStatus;
  kind: PortalMessageKind;
  createdAt: string;
  updatedAt: string;
  calendar: PortalMessageCalendar | null;
}

/** Safe speaker-facing portal payload — never includes committee/Course Check evidence. */
export interface SpeakerPortalSession {
  eventId: string;
  eventName: string;
  expiresAt: string;
  acceptanceState: ProgramOutcome | null;
  profile: {
    id: string;
    name: string;
    email: string;
    biography: string;
    socialLinks?: SpeakerSocialLinks;
    headshotAssetId: string | null;
    headshotFileName: string | null;
  };
  participation: {
    id: string;
    speakerId: string;
    role: "primary" | "co" | string;
    titleAtEvent: string;
    organizationAtEvent: string;
  };
  proposal: {
    id: string;
    title: string;
    trackName: string;
    programOutcome: ProgramOutcome | null;
  } | null;
  session: {
    id: string;
    title: string;
    format: string;
    trackId: string;
    roomId: string | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  /** Independent message + calendar invite delivery state for this speaker. */
  messages: PortalMessage[];
  tasks: PortalOnboardingTask[];
  nextDeadline: string | null;
}

export type SessionPlacementStatus = "unplaced" | "partial" | "placed";

export type SessionContentStatus = "draft" | "needs-changes" | "approved";

export type SessionContentField = "title" | "abstract" | "publicContent" | "status";

export interface SessionContentSnapshot {
  title: string;
  abstract: string;
  publicContent: string;
  status: SessionContentStatus;
}

export interface SessionContentHistoryEntry extends SessionContentSnapshot {
  id: string;
  sessionId: string;
  version: number;
  changedFields: SessionContentField[];
  previous: SessionContentSnapshot | null;
  actorId: string;
  actorName: string;
  createdAt: string;
  changeKind: "initial" | "edit" | "status" | "restore";
}

export type ScheduleConflictKind = "speaker_double_book" | "room_overlap";

export type ScheduleConflictAction =
  | "move_time"
  | "move_room"
  | "keep_placement"
  | "open_speaker_schedule";

export interface SessionSpeakerRef {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface OrganizerSession {
  id: string;
  proposalId: string | null;
  courseCheckPlanId: string;
  title: string;
  /** Current organizer-owned content snapshot. Optional for older API consumers. */
  abstract?: string;
  publicContent?: string;
  contentStatus?: SessionContentStatus;
  contentVersion?: number;
  contentUpdatedAt?: string;
  contentUpdatedBy?: { id: string; name: string } | null;
  format: string;
  trackId: string;
  trackName: string;
  roomId: string | null;
  roomName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  placementStatus: SessionPlacementStatus;
  speakers: SessionSpeakerRef[];
  calendarUid: string;
  calendarSequence: number;
  calendarInviteRecorded: boolean;
  createdAt: string;
}

export interface SessionContentRecord extends OrganizerSession {
  abstract: string;
  publicContent: string;
  contentStatus: SessionContentStatus;
  contentVersion: number;
  contentUpdatedAt: string;
  contentUpdatedBy: { id: string; name: string } | null;
  contentHistory: SessionContentHistoryEntry[];
}

export interface SessionContentWorkspaceResponse {
  eventId: string;
  sessions: SessionContentRecord[];
}

export interface SessionContentPatch {
  expectedVersion: number;
  title?: string;
  abstract?: string;
  publicContent?: string;
  status?: SessionContentStatus;
}

export interface SessionContentMutationResponse {
  session: SessionContentRecord;
}

export interface ScheduleConflict {
  id: string;
  kind: ScheduleConflictKind;
  summary: string;
  sessionIds: [string, string];
  sessionTitles: [string, string];
  speakerId?: string;
  speakerName?: string;
  roomId?: string;
  roomName?: string;
  startsAt: string;
  endsAt: string;
  actions: ScheduleConflictAction[];
}

export interface CalendarIntentRecord {
  id: string;
  sessionId: string;
  kind: "create" | "update" | "cancel";
  uid: string;
  sequence: number;
  roomId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: "pending";
  createdAt: string;
}

export interface AgendaWorkspaceResponse {
  eventId: string;
  version: number;
  sessions: OrganizerSession[];
  unplacedSessions: OrganizerSession[];
  conflicts: ScheduleConflict[];
  counts: {
    unplaced: number;
    partial: number;
    placed: number;
    conflicts: number;
  };
  calendarIntents: CalendarIntentRecord[];
  auditEvents?: AgendaAuditEvent[];
}

export type AgendaAuditEventType = "manual_placement" | "auto_place.applied";

export interface AgendaAuditEvent {
  id: string;
  type: AgendaAuditEventType;
  actorId: string;
  actorName: string;
  sessionIds: string[];
  summary: string;
  createdAt: string;
}

export interface SessionPlacementPatch {
  roomId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  expectedAgendaVersion?: number;
}

export interface SessionPlacementResponse {
  session: OrganizerSession;
  conflicts: ScheduleConflict[];
  counts: AgendaWorkspaceResponse["counts"];
  calendarIntentsCreated: CalendarIntentRecord[];
}

export interface AgendaAutoPlaceProposal {
  sessionId: string;
  title: string;
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  reason: string;
}

export interface AgendaAutoPlaceLeftover {
  sessionId: string;
  title: string;
  placementStatus: SessionPlacementStatus;
  reason: string;
}

export interface AgendaAutoPlacePreview {
  previewId: string;
  previewDigest: string;
  agendaVersion: number;
  selectedSessionIds: string[];
  includeManual: boolean;
  proposals: AgendaAutoPlaceProposal[];
  leftovers: AgendaAutoPlaceLeftover[];
  conflicts: ScheduleConflict[];
  assumptions: string[];
  manualPlacementPreserved: string[];
  createdAt: string;
}

export interface AgendaAutoPlaceApplyResponse {
  previewDigest: string;
  agendaVersion: number;
  appliedSessionIds: string[];
  unchangedSessionIds: string[];
  audit: AgendaAuditEvent;
  agenda: AgendaWorkspaceResponse;
  idempotent: boolean;
}

/** Public-safe speaker card for the program renderer. Never includes email or tasks. */
export interface PublicProgramSpeaker {
  id: string;
  name: string;
  title?: string;
  company?: string;
  biography: string;
  socialLinks?: SpeakerSocialLinks;
  headshotAssetId: string | null;
  headshotUrl?: string | null;
  sessionIds: string[];
}

/** Public-safe session card. Times/rooms may be null → UI shows TBD / pending. */
export interface PublicProgramSession {
  id: string;
  title: string;
  description: string;
  /** Internal working-snapshot field; public responses strip it. */
  contentStatus?: SessionContentStatus;
  format: string;
  trackId: string;
  trackName: string;
  roomId: string | null;
  roomName: string | null;
  roomPending: boolean;
  startsAt: string | null;
  endsAt: string | null;
  day: string | null;
  calendarUid: string;
  calendarSequence: number;
  speakers: Array<{
    id: string;
    name: string;
    title?: string;
    company?: string;
    role: string;
  }>;
}

export interface PublicProgramRevisionMeta {
  id: string;
  version: number;
  publishedAt: string;
  isCurrent: boolean;
}

export interface PublicProgramEventSlice {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  timezone?: string;
  themeAccent: string;
  tracks: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string; readiness: "ready" | "pending" }>;
}

export interface PublicProgramResponse {
  event: PublicProgramEventSlice;
  revision: PublicProgramRevisionMeta;
  sessions: PublicProgramSession[];
  speakers: PublicProgramSpeaker[];
  revisions: PublicProgramRevisionMeta[];
}

export interface PublicProgramFilters {
  query?: string;
  day?: string;
  trackId?: string;
  roomId?: string;
  format?: string;
  speakerId?: string;
  role?: string;
}

export type PublicEmbedWidget =
  | "sessions"
  | "speakers"
  | "agenda"
  | "itinerary"
  | "speaker-gallery";

export type PublicEmbedTheme = "light" | "dark" | "minimal";

export interface PublicEmbedFieldVisibility {
  title: boolean;
  dateTime: boolean;
  room: boolean;
  track: boolean;
  speakers: boolean;
  description: boolean;
  format: boolean;
  headshots: boolean;
  biography: boolean;
}

export interface PublicEmbedConfigInput {
  name: string;
  widget: PublicEmbedWidget;
  theme: PublicEmbedTheme;
  filters: PublicProgramFilters;
  fields: PublicEmbedFieldVisibility;
  revisionId?: string | null;
  disabled?: boolean;
}

export interface PublicEmbedConfig extends PublicEmbedConfigInput {
  id: string;
  eventId: string;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
  embedCode: string;
  feedUrl: string;
  disabled: boolean;
}

export interface PublicEmbedResolveResponse {
  config: PublicEmbedConfig;
  program: PublicProgramResponse;
}

export interface AssetUploadStartRequest {
  formId: string;
  formDefinitionVersion: number;
  questionName: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
}

export interface AssetUploadSession {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  maxBytes: number;
  acceptMimeTypes: string[];
}
