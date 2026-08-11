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
}

export interface EventListResponse {
  events: EventRecord[];
  principal: OrganizerPrincipal;
}

export type ProposalStatus = "unreviewed" | "approve" | "maybe" | "deny";

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
  committeeNote: string;
  privateNote: string;
  reviewVersion: number;
  confirmationEmailStatus: OutboxDeliveryStatus | null;
}

export interface ProposalAuditEvent {
  id: string;
  proposalId: string;
  type: "proposal.review.changed";
  actorId: string;
  actorName: string;
  fromStatus: ProposalStatus;
  toStatus: ProposalStatus;
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

export interface OutboxMessage {
  id: string;
  kind: "submission_confirmation";
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
