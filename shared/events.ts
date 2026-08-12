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
}

export type ProposalAuditEventType =
  | "proposal.review.changed"
  | "course_check.decision.applied"
  | "course_check.communication.drafts_created"
  | "course_check.communication.send_started"
  | "course_check.communication.effect_retry"
  | "course_check.communication.effect_reconciled"
  | "course_check.communication.correction_created";

export interface ProposalAuditEvent {
  id: string;
  proposalId: string;
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
}

export interface ReviewerAssignment {
  id: string;
  name: string;
  email: string;
  trackIds: string[];
}

export type OutboxDeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export type OutboxMessageKind =
  | "submission_confirmation"
  | "onboarding_reminder";

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

export interface OnboardingTaskAsset {
  assetId: string;
  fileName: string;
  mime: string;
  size: number;
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
  readinessFlag: string | null;
  asset: OnboardingTaskAsset | null;
  completedAt: string | null;
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

export interface OnboardingHistoryEntry {
  id: string;
  speakerId: string;
  taskId: string | null;
  type: string;
  summary: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface OnboardingBoardSpeaker {
  speakerId: string;
  name: string;
  email: string;
  proposalId: string | null;
  proposalTitle: string | null;
  role: string;
  openTaskCount: number;
  overdueCount: number;
  nextDueAt: string | null;
  daysUntilNextDue: number | null;
  readinessFlags: string[];
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
  answers: SubmissionAnswers;
  proposal: PublicProposal & {
    speakerEmail: string;
  };
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
}

export interface SessionPlacementPatch {
  roomId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface SessionPlacementResponse {
  session: OrganizerSession;
  conflicts: ScheduleConflict[];
  counts: AgendaWorkspaceResponse["counts"];
  calendarIntentsCreated: CalendarIntentRecord[];
}

/** Public-safe speaker card for the program renderer. Never includes email or tasks. */
export interface PublicProgramSpeaker {
  id: string;
  name: string;
  biography: string;
  headshotAssetId: string | null;
  sessionIds: string[];
}

/** Public-safe session card. Times/rooms may be null → UI shows TBD / pending. */
export interface PublicProgramSession {
  id: string;
  title: string;
  description: string;
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
  day?: string;
  trackId?: string;
  roomId?: string;
  format?: string;
  speakerId?: string;
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
