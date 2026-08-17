import type {
  CourseCheckPlan,
  EventCourseCheckPolicy,
  ProgramOutcome,
  PublicationOperation,
} from "../shared/course-check";
import type { AirtablePullResult, AirtableSyncState } from "../shared/airtable";
import type { CourseCheckUxEventInput } from "../shared/course-check-ux";
import type {
  AgendaAutoPlaceApplyResponse,
  AgendaAutoPlacePreview,
  AgendaWorkspaceResponse,
  AssetUploadSession,
  CfpDefinitionV1,
  CfpFormResponse,
  CfpPublicLifecycle,
  EvaluationPlan,
  EvaluationPlanAuditEvent,
  EvaluationScorecard,
  EvaluationRoundAssignment,
  EvaluationRoundDistributionPreview,
  EvaluationRoundState,
  EventListResponse,
  EventRecord,
  FilesLibraryExportRequest,
  FilesLibraryResponse,
  OnboardingBoard,
  OnboardingCompletionRequirement,
  OnboardingDeliverableComment,
  OnboardingAutomaticReminderResult,
  OnboardingBulkReminderResult,
  OnboardingReminderDraft,
  OnboardingReminderAutomationPolicy,
  OnboardingTaskBatchResult,
  OrganizerActivityByActorResponse,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerProposal,
  PortalOnboardingTask,
  ProposalReviewResponse,
  ProposalStatus,
  ScorecardCriterionValue,
  ReviewCriterionResult,
  ReviewProgressReminderDraft,
  ReviewProgressReminderPreview,
  ReviewProgressReminderResult,
  ReviewProgressReminderSendResult,
  ReviewProgressResponse,
  ReviewResultsResponse,
  ProposalListResponse,
  ProposalValidationError,
  PublicEmbedConfig,
  PublicEmbedConfigInput,
  PublicEmbedResolveResponse,
  PublicProgramResponse,
  PublicProposal,
  ReviewerAssignment,
  ReviewerInvitation,
  ReviewerInvitationPreview,
  ReviewerRoutingResponse,
  SessionPlacementPatch,
  SessionPlacementResponse,
  SessionContentMutationResponse,
  SessionContentPatch,
  SessionContentWorkspaceResponse,
  SpeakerDirectoryCreateInput,
  SpeakerDirectoryMutation,
  SpeakerSocialLinks,
  SpeakerCsvColumnMapping,
  SpeakerCsvImportApplyResult,
  SpeakerCsvImportPreview,
  SpeakerCsvResolution,
  SpeakerPortalSession,
  SubmissionAnswers,
  SubmitterDraftSession,
  SubmitterEditSession,
  SubmitterDashboardResponse,
  SubmitterProposal,
  SubmitterProposalDraft,
  UploadedAssetAnswer,
} from "../shared/events";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchEvents(): Promise<EventListResponse> {
  const response = await fetch("/api/events");
  const body = await readJson<EventListResponse | { error: string }>(response);
  if (!response.ok || !("events" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load events",
      response.status,
      body,
    );
  }
  return body;
}

export async function createEventWorkspace(input: {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
}): Promise<EventRecord> {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ event: EventRecord } | { error: string }>(response);
  if (!response.ok || !("event" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create event workspace",
      response.status,
      body,
    );
  }
  return body.event;
}

export async function updateEventConfiguration(
  eventId: string,
  input: {
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    tracks: Array<{ id: string; name: string }>;
    rooms: Array<{ id: string; name: string; readiness: "ready" | "pending" }>;
  },
): Promise<EventRecord> {
  const response = await fetch(`/api/events/${eventId}/configuration`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ event: EventRecord } | { error: string }>(response);
  if (!response.ok || !("event" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save event configuration",
      response.status,
      body,
    );
  }
  return body.event;
}

export async function fetchCfp(
  eventId: string,
  formId?: string,
): Promise<CfpFormResponse> {
  const params = formId ? `?formId=${encodeURIComponent(formId)}` : "";
  const response = await fetch(`/api/events/${eventId}/cfp${params}`);
  const body = await readJson<
    | CfpFormResponse
    | {
        error: string;
        status?: string;
        event?: CfpFormResponse["event"];
        formId?: string;
        formName?: string;
      }
  >(response);
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load the call for proposals",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchOrganizerForms(
  eventId: string,
): Promise<OrganizerCfpFormSummary[]> {
  const response = await fetch(`/api/events/${eventId}/forms`);
  const body = await readJson<{ forms: OrganizerCfpFormSummary[] } | { error: string }>(
    response,
  );
  if (!response.ok || !("forms" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load forms",
      response.status,
      body,
    );
  }
  return body.forms;
}

export async function createOrganizerForm(
  eventId: string,
  name: string,
): Promise<OrganizerCfpForm> {
  const response = await fetch(`/api/events/${eventId}/forms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await readJson<{ form: OrganizerCfpForm } | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create form",
      response.status,
      body,
    );
  }
  return body.form;
}

export interface OrganizerFormResponse {
  form: OrganizerCfpForm;
  lifecycle?: CfpPublicLifecycle | null;
  event: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    themeAccent?: string;
  };
}

export async function fetchOrganizerForm(
  eventId: string,
  formId: string,
): Promise<OrganizerFormResponse> {
  const response = await fetch(`/api/events/${eventId}/forms/${formId}`);
  const body = await readJson<OrganizerFormResponse | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load form",
      response.status,
      body,
    );
  }
  return body;
}

export async function saveOrganizerFormDraft(
  eventId: string,
  formId: string,
  input: {
    name?: string;
    draft: CfpDefinitionV1;
    expectedDraftUpdatedAt?: string;
  },
): Promise<OrganizerCfpForm> {
  const response = await fetch(`/api/events/${eventId}/forms/${formId}/draft`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ form: OrganizerCfpForm } | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save draft",
      response.status,
      body,
    );
  }
  return body.form;
}

export async function publishOrganizerForm(
  eventId: string,
  formId: string,
  input?: {
    name?: string;
    draft?: CfpDefinitionV1;
    expectedDraftUpdatedAt?: string;
  },
): Promise<OrganizerCfpForm> {
  const response = await fetch(
    `/api/events/${eventId}/forms/${formId}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input ?? {}),
    },
  );
  const body = await readJson<{ form: OrganizerCfpForm } | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to publish form",
      response.status,
      body,
    );
  }
  return body.form;
}

export async function abandonUpload(
  eventId: string,
  assetId: string,
): Promise<void> {
  const response = await fetch(`/api/events/${eventId}/uploads/${assetId}`, {
    method: "DELETE",
  });
  if (response.status === 404) return;
  if (!response.ok) {
    const body = await readJson<{ error?: string }>(response).catch(
      (): { error?: string } => ({}),
    );
    throw new ApiError(
      body && "error" in body && body.error
        ? body.error
        : "Unable to remove upload",
      response.status,
      body,
    );
  }
}

export async function closeOrganizerForm(
  eventId: string,
  formId: string,
): Promise<OrganizerCfpForm> {
  const response = await fetch(`/api/events/${eventId}/forms/${formId}/close`, {
    method: "POST",
  });
  const body = await readJson<{ form: OrganizerCfpForm } | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to close form",
      response.status,
      body,
    );
  }
  return body.form;
}

export async function reopenOrganizerForm(
  eventId: string,
  formId: string,
): Promise<OrganizerCfpForm> {
  const response = await fetch(`/api/events/${eventId}/forms/${formId}/reopen`, {
    method: "POST",
  });
  const body = await readJson<{ form: OrganizerCfpForm } | { error: string }>(
    response,
  );
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to reopen form",
      response.status,
      body,
    );
  }
  return body.form;
}

export async function submitProposal(
  eventId: string,
  answers: SubmissionAnswers,
  form: Pick<CfpFormResponse["form"], "id" | "definitionVersion">,
  draftId?: string,
): Promise<PublicProposal> {
  const response = await fetch(`/api/events/${eventId}/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      formId: form.id,
      formDefinitionVersion: form.definitionVersion,
      answers,
      ...(draftId ? { draftId } : {}),
    }),
  });
  const body = await readJson<
    { proposal: PublicProposal } | ProposalValidationError | { error: string }
  >(response);
  if (response.status === 400 && body && "errors" in body) {
    throw new ApiError("Validation failed", 400, body);
  }
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to submit proposal",
      response.status,
      body,
    );
  }
  return body.proposal;
}

export async function saveProposalDraft(
  eventId: string,
  input: {
    formId: string;
    formDefinitionVersion: number;
    answers: SubmissionAnswers;
    expectedUpdatedAt?: string;
  },
  draftId?: string,
): Promise<SubmitterProposalDraft> {
  const response = await fetch(
    draftId
      ? `/api/events/${eventId}/submitter/drafts/${draftId}`
      : `/api/events/${eventId}/submitter/drafts`,
    {
      method: draftId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    | { draft: SubmitterProposalDraft }
    | ProposalValidationError
    | { error: string }
  >(response);
  if (response.status === 400 && body && "errors" in body) {
    throw new ApiError("Validation failed", 400, body);
  }
  if (!response.ok || !("draft" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save draft",
      response.status,
      body,
    );
  }
  return body.draft;
}

export async function fetchSubmitterDraft(
  eventId: string,
  draftId: string,
): Promise<SubmitterDraftSession> {
  const response = await fetch(`/api/events/${eventId}/submitter/drafts/${draftId}`);
  const body = await readJson<SubmitterDraftSession | { error: string }>(response);
  if (!response.ok || !("draft" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load draft",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchSubmitterDashboard(
  eventId: string,
): Promise<SubmitterDashboardResponse> {
  const response = await fetch(`/api/events/${eventId}/submitter/proposals`);
  const body = await readJson<SubmitterDashboardResponse | { error: string }>(response);
  if (!response.ok || !("proposals" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load your proposals",
      response.status,
      body,
    );
  }
  return body;
}

export async function claimSubmitterProposal(
  eventId: string,
  proposalId: string,
): Promise<SubmitterProposal> {
  const response = await fetch(
    `/api/events/${eventId}/submitter/proposals/${proposalId}/claim`,
    { method: "POST" },
  );
  const body = await readJson<{ proposal: SubmitterProposal } | { error: string }>(
    response,
  );
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to claim proposal",
      response.status,
      body,
    );
  }
  return body.proposal;
}

export async function fetchPublicProposal(
  eventId: string,
  proposalId: string,
): Promise<PublicProposal> {
  const response = await fetch(
    `/api/events/${eventId}/proposals/${proposalId}`,
  );
  const body = await readJson<{ proposal: PublicProposal } | { error: string }>(
    response,
  );
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Proposal not found",
      response.status,
      body,
    );
  }
  return body.proposal;
}

export async function fetchProposals(
  eventId: string,
  options: {
    query?: string;
    status?: ProposalStatus | "all";
    track?: string;
    roundId?: string;
    sort?:
      | "newest"
      | "oldest"
      | "title-asc"
      | "title-desc"
      | "track-asc"
      | "track-desc"
      | "status-asc"
      | "status-desc"
      | "speaker-asc"
      | "aggregate-asc"
      | "aggregate-desc";
  } = {},
): Promise<OrganizerProposal[]> {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("q", options.query.trim());
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.track) params.set("track", options.track);
  if (options.roundId) params.set("roundId", options.roundId);
  if (options.sort && options.sort !== "newest") params.set("sort", options.sort);
  const suffix = params.size ? `?${params}` : "";
  const response = await fetch(`/api/events/${eventId}/proposals${suffix}`);
  const body = await readJson<ProposalListResponse | { error: string }>(
    response,
  );
  if (!response.ok || !("proposals" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load proposals",
      response.status,
      body,
    );
  }
  return body.proposals;
}

export async function fetchReviewResults(eventId: string): Promise<ReviewResultsResponse> {
  const response = await fetch(`/api/events/${eventId}/review-results`);
  const body = await readJson<ReviewResultsResponse | { error: string }>(response);
  if (!response.ok || !("submissions" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load review results",
      response.status,
      body,
    );
  }
  return body;
}

export function reviewResultsCsvUrl(eventId: string): string {
  return `/api/events/${eventId}/review-results.csv`;
}

export async function fetchOrganizerProposal(
  eventId: string,
  proposalId: string,
  roundId?: string,
): Promise<ProposalReviewResponse> {
  const params = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
  const response = await fetch(
    `/api/events/${eventId}/organizer/proposals/${proposalId}${params}`,
  );
  const body = await readJson<ProposalReviewResponse | { error: string }>(response);
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load proposal",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchOrganizerActivityByActor(
  eventId: string,
  actorId?: string | null,
  options?: { limit?: number; before?: string | null },
): Promise<OrganizerActivityByActorResponse> {
  const params = new URLSearchParams();
  if (actorId) params.set("actorId", actorId);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);
  const query = params.toString();
  const response = await fetch(
    `/api/events/${eventId}/organizer/activity${query ? `?${query}` : ""}`,
  );
  const body = await readJson<OrganizerActivityByActorResponse | { error: string }>(
    response,
  );
  if (!response.ok || !("actors" in body) || !("entries" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load team activity",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateProposalReview(
  eventId: string,
  proposalId: string,
  input: {
    expectedVersion: number;
    status?: ProposalStatus;
    committeeNote?: string;
    roundId?: string;
    criteria?: ReviewCriterionResult[];
    scorecardValues?: Record<string, ScorecardCriterionValue>;
  },
): Promise<ProposalReviewResponse> {
  const response = await fetch(
    `/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<ProposalReviewResponse | { error: string }>(response);
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save review",
      response.status,
      body,
    );
  }
  return body;
}

export async function recuseProposalReview(
  eventId: string,
  proposalId: string,
  input: { roundId: string; reason?: string },
): Promise<ProposalReviewResponse> {
  const response = await fetch(
    `/api/events/${eventId}/organizer/proposals/${proposalId}/recusal`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<ProposalReviewResponse | { error: string }>(response);
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to record recusal",
      response.status,
      body,
    );
  }
  return body;
}

export interface EvaluationPlanResponse {
  plan: EvaluationPlan | null;
  auditEvents: EvaluationPlanAuditEvent[];
}

export type EvaluationPlanRoundInput = {
  id?: string;
  name: string;
  state?: EvaluationRoundState;
  startsOn: string;
  endsOn: string;
  scorecardRef: string;
  scorecard?: EvaluationScorecard;
  reviewerPool: string[];
  anonymization: "none" | "blind";
};

export async function fetchEvaluationPlan(eventId: string): Promise<EvaluationPlanResponse> {
  const response = await fetch(`/api/events/${eventId}/evaluation-plan`);
  const body = await readJson<EvaluationPlanResponse | { error: string }>(response);
  if (!response.ok || !("plan" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load evaluation plan",
      response.status,
      body,
    );
  }
  return body;
}

export async function saveEvaluationPlan(
  eventId: string,
  input: { rounds: EvaluationPlanRoundInput[]; expectedVersion?: number; enabled?: boolean },
): Promise<EvaluationPlanResponse> {
  const response = await fetch(`/api/events/${eventId}/evaluation-plan`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<EvaluationPlanResponse | { error: string }>(response);
  if (!response.ok || !("plan" in body) || !body.plan) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save evaluation plan",
      response.status,
      body,
    );
  }
  return body;
}

export async function setEvaluationPlanEnabled(
  eventId: string,
  input: { enabled: boolean; expectedVersion?: number },
): Promise<EvaluationPlanResponse> {
  const response = await fetch(`/api/events/${eventId}/evaluation-plan`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<EvaluationPlanResponse | { error: string }>(response);
  if (!response.ok || !("plan" in body) || !body.plan) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update evaluation plan",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchEvaluationRoundAssignments(
  eventId: string,
  roundId: string,
): Promise<EvaluationRoundAssignment[]> {
  const response = await fetch(
    `/api/events/${eventId}/evaluation-rounds/${encodeURIComponent(roundId)}/assignments`,
  );
  const body = await readJson<
    { assignments: EvaluationRoundAssignment[] } | { error: string }
  >(response);
  if (!response.ok || !("assignments" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load round assignments",
      response.status,
      body,
    );
  }
  return body.assignments;
}

export async function setEvaluationRoundAssignment(
  eventId: string,
  roundId: string,
  input: { proposalId: string; reviewerId: string; assigned: boolean },
): Promise<EvaluationRoundAssignment[]> {
  const response = await fetch(
    `/api/events/${eventId}/evaluation-rounds/${encodeURIComponent(roundId)}/assignments`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    { assignments: EvaluationRoundAssignment[] } | { error: string }
  >(response);
  if (!response.ok || !("assignments" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update round assignment",
      response.status,
      body,
    );
  }
  return body.assignments;
}

export async function previewEvaluationRoundDistribution(
  eventId: string,
  roundId: string,
  input: {
    trackIds?: string[];
    reviewerIds?: string[];
    maxAssignmentsPerReviewer?: number | null;
  },
): Promise<EvaluationRoundDistributionPreview> {
  const response = await fetch(
    `/api/events/${eventId}/evaluation-rounds/${encodeURIComponent(roundId)}/assignments/preview`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    { preview: EvaluationRoundDistributionPreview } | { error: string }
  >(response);
  if (!response.ok || !("preview" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to preview round distribution",
      response.status,
      body,
    );
  }
  return body.preview;
}

export async function distributeEvaluationRoundAssignments(
  eventId: string,
  roundId: string,
  input: {
    trackIds?: string[];
    reviewerIds?: string[];
    maxAssignmentsPerReviewer?: number | null;
  },
): Promise<{
  preview: EvaluationRoundDistributionPreview;
  assignments: EvaluationRoundAssignment[];
}> {
  const response = await fetch(
    `/api/events/${eventId}/evaluation-rounds/${encodeURIComponent(roundId)}/assignments/distribute`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    | {
        preview: EvaluationRoundDistributionPreview;
        assignments: EvaluationRoundAssignment[];
      }
    | { error: string }
  >(response);
  if (!response.ok || !("assignments" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to distribute round assignments",
      response.status,
      body,
    );
  }
  return { preview: body.preview, assignments: body.assignments };
}

export async function fetchReviewProgress(
  eventId: string,
  roundId?: string | null,
): Promise<ReviewProgressResponse> {
  const params = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
  const response = await fetch(`/api/events/${eventId}/review-progress${params}`);
  const body = await readJson<ReviewProgressResponse | { error: string }>(response);
  if (!response.ok || !("reviewers" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load review progress",
      response.status,
      body,
    );
  }
  return body;
}

export async function previewReviewReminders(
  eventId: string,
  input: { roundId?: string | null; reviewerIds: string[] },
): Promise<ReviewProgressReminderPreview> {
  const response = await fetch(`/api/events/${eventId}/review-progress/reminders/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<ReviewProgressReminderPreview | { error: string }>(response);
  if (!response.ok || !("drafts" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to preview reviewer reminders",
      response.status,
      body,
    );
  }
  return body;
}

export async function sendReviewReminders(
  eventId: string,
  input: {
    roundId?: string | null;
    idempotencyKey: string;
    drafts: Array<Pick<ReviewProgressReminderDraft, "reviewerId" | "subject" | "bodyText">>;
  },
): Promise<ReviewProgressReminderSendResult> {
  const response = await fetch(`/api/events/${eventId}/review-progress/reminders/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<ReviewProgressReminderSendResult | { error: string }>(response);
  if (!response.ok || !("results" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to send reviewer reminders",
      response.status,
      body,
    );
  }
  return body;
}

export async function retryReviewReminder(
  eventId: string,
  outboxId: string,
): Promise<ReviewProgressReminderResult> {
  const response = await fetch(
    `/api/events/${eventId}/review-progress/reminders/${encodeURIComponent(outboxId)}/retry`,
    { method: "POST" },
  );
  const body = await readJson<
    | ({ outboxId: string } & Pick<ReviewProgressReminderResult, "status" | "error">)
    | { error: string }
  >(response);
  if (!response.ok || !("outboxId" in body)) {
    throw new ApiError(
      !("outboxId" in body) ? body.error : "Unable to retry reviewer reminder",
      response.status,
      body,
    );
  }
  return {
    reviewerId: "",
    toEmail: "",
    outboxId: body.outboxId,
    status: body.status,
    error: body.error,
  };
}

export async function fetchReviewerAssignments(
  eventId: string,
): Promise<ReviewerRoutingResponse> {
  const response = await fetch(`/api/events/${eventId}/reviewers`);
  const body = await readJson<ReviewerRoutingResponse | { error: string }>(
    response,
  );
  if (!response.ok || !("reviewers" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load reviewer routing",
      response.status,
      body,
    );
  }
  return { reviewers: body.reviewers, invitations: body.invitations ?? [] };
}

export type ReviewerGrantResult =
  | { kind: "reviewer"; reviewer: ReviewerAssignment }
  | { kind: "invitation"; invitation: ReviewerInvitation };

export async function grantReviewerTracks(
  eventId: string,
  input: { email: string; trackIds: string[] },
): Promise<ReviewerGrantResult> {
  const response = await fetch(`/api/events/${eventId}/reviewers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<
    | { reviewer: ReviewerAssignment }
    | { invitation: ReviewerInvitation }
    | { error: string }
  >(response);
  if (!response.ok || (!("reviewer" in body) && !("invitation" in body))) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save reviewer routing",
      response.status,
      body,
    );
  }
  return "reviewer" in body
    ? { kind: "reviewer", reviewer: body.reviewer }
    : { kind: "invitation", invitation: body.invitation };
}

export async function revokeReviewerInvitation(
  eventId: string,
  invitationId: string,
): Promise<ReviewerInvitation> {
  const response = await fetch(
    `/api/events/${eventId}/reviewer-invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
  const body = await readJson<{ invitation: ReviewerInvitation } | { error: string }>(response);
  if (!response.ok || !("invitation" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to revoke reviewer invitation",
      response.status,
      body,
    );
  }
  return body.invitation;
}

export async function retryReviewerInvitation(
  eventId: string,
  invitationId: string,
): Promise<ReviewerInvitation> {
  const response = await fetch(
    `/api/events/${eventId}/reviewer-invitations/${encodeURIComponent(invitationId)}/retry`,
    { method: "POST" },
  );
  const body = await readJson<{ invitation: ReviewerInvitation } | { error: string }>(response);
  if (!response.ok || !("invitation" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to retry reviewer invitation",
      response.status,
      body,
    );
  }
  return body.invitation;
}

export async function fetchReviewerInvitation(
  token: string,
): Promise<ReviewerInvitationPreview> {
  const response = await fetch(`/api/reviewer-invitations/${encodeURIComponent(token)}`);
  const body = await readJson<
    { invitation: ReviewerInvitationPreview } | { error: string }
  >(response);
  if (!response.ok || !("invitation" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to open reviewer invitation",
      response.status,
      body,
    );
  }
  return body.invitation;
}

export async function acceptReviewerInvitation(
  token: string,
): Promise<{ accepted: true; queuePath: string; trackIds: string[] }> {
  const response = await fetch(
    `/api/reviewer-invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
  const body = await readJson<
    | { accepted: true; queuePath: string; trackIds: string[] }
    | { error: string }
  >(response);
  if (!response.ok || !("accepted" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to accept reviewer invitation",
      response.status,
      body,
    );
  }
  return body;
}

export async function revokeReviewerAccess(
  eventId: string,
  reviewerId: string,
): Promise<void> {
  const response = await fetch(
    `/api/events/${eventId}/reviewers/${encodeURIComponent(reviewerId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body: { error?: string } = await readJson<{ error?: string }>(
      response,
    ).catch(() => ({}));
    throw new ApiError(
      body.error ?? "Unable to remove reviewer access",
      response.status,
      body,
    );
  }
}

export async function updateReviewerTracks(
  eventId: string,
  reviewerId: string,
  trackIds: string[],
): Promise<ReviewerAssignment> {
  const response = await fetch(
    `/api/events/${eventId}/reviewers/${encodeURIComponent(reviewerId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackIds }),
    },
  );
  const body = await readJson<{ reviewer: ReviewerAssignment } | { error: string }>(
    response,
  );
  if (!response.ok || !("reviewer" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update reviewer tracks",
      response.status,
      body,
    );
  }
  return body.reviewer;
}

export async function startUpload(
  eventId: string,
  input: {
    formId: string;
    formDefinitionVersion: number;
    questionName: string;
    fileName: string;
    mime: string;
    sizeBytes: number;
  },
): Promise<AssetUploadSession> {
  const response = await fetch(`/api/events/${eventId}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ upload: AssetUploadSession } | { error: string }>(
    response,
  );
  if (!response.ok || !("upload" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to start upload",
      response.status,
      body,
    );
  }
  return body.upload;
}

export async function completeUpload(
  uploadUrl: string,
  file: File,
): Promise<UploadedAssetAnswer> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "content-length": String(file.size),
    },
    body: file,
  });
  const body = await readJson<{ asset: UploadedAssetAnswer } | { error: string }>(
    response,
  );
  if (!response.ok || !("asset" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Upload failed. Try again.",
      response.status,
      body,
    );
  }
  return body.asset;
}

export async function fetchSubmitterEditSession(
  eventId: string,
  token: string,
): Promise<SubmitterEditSession> {
  const response = await fetch(
    `/api/events/${eventId}/submitter/edit?token=${encodeURIComponent(token)}`,
  );
  const body = await readJson<SubmitterEditSession | { error: string }>(response);
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "This edit link is invalid or has expired.",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchSpeakerPortalSession(
  eventId: string,
  token: string,
): Promise<SpeakerPortalSession> {
  const response = await fetch(
    `/api/events/${eventId}/portal?token=${encodeURIComponent(token)}`,
  );
  const body = await readJson<SpeakerPortalSession | { error: string }>(response);
  if (!response.ok || !("profile" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "This portal link is invalid or has expired.",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateSpeakerPortalProfile(
  eventId: string,
  token: string,
  patch: {
    biography?: string;
    name?: string;
    headshotAssetId?: string | null;
  },
): Promise<SpeakerPortalSession> {
  const response = await fetch(
    `/api/events/${eventId}/portal/profile?token=${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  const body = await readJson<SpeakerPortalSession | { error: string }>(response);
  if (!response.ok || !("profile" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update profile",
      response.status,
      body,
    );
  }
  return body;
}

export async function startPortalUpload(
  eventId: string,
  token: string,
  input: {
    purpose: "headshot" | "task";
    taskId?: string;
    fileName: string;
    mime: string;
    sizeBytes: number;
  },
): Promise<AssetUploadSession> {
  const response = await fetch(
    `/api/events/${eventId}/portal/uploads?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<{ upload: AssetUploadSession } | { error: string }>(
    response,
  );
  if (!response.ok || !("upload" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to start upload",
      response.status,
      body,
    );
  }
  return body.upload;
}

export async function putPortalUpload(
  uploadUrl: string,
  token: string,
  file: File,
): Promise<void> {
  const separator = uploadUrl.includes("?") ? "&" : "?";
  const response = await fetch(
    `${uploadUrl}${separator}token=${encodeURIComponent(token)}`,
    {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "content-length": String(file.size),
      },
      body: file,
    },
  );
  if (!response.ok) {
    const body = await readJson<{ error?: string }>(response).catch(() => ({}));
    throw new ApiError(
      "error" in body && body.error ? body.error : "Upload failed",
      response.status,
      body,
    );
  }
}

export async function completePortalTask(
  eventId: string,
  token: string,
  taskId: string,
  input: { assetId?: string } = {},
): Promise<SpeakerPortalSession> {
  const response = await fetch(
    `/api/events/${eventId}/portal/tasks/${taskId}/complete?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<SpeakerPortalSession | { error: string }>(response);
  if (!response.ok || !("profile" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to complete task",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchOnboardingBoard(eventId: string): Promise<OnboardingBoard> {
  const response = await fetch(`/api/events/${eventId}/onboarding`);
  const body = await readJson<OnboardingBoard | { error: string }>(response);
  if (!response.ok || !("speakers" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load onboarding board",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchOnboardingFilesLibrary(eventId: string): Promise<FilesLibraryResponse> {
  const response = await fetch(`/api/events/${eventId}/onboarding/files`);
  const body = await readJson<FilesLibraryResponse | { error: string }>(response);
  if (!response.ok || !("files" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load files library",
      response.status,
      body,
    );
  }
  return body;
}

export async function exportOnboardingFilesZip(
  eventId: string,
  input: FilesLibraryExportRequest,
): Promise<{ blob: Blob; filename: string; fileCount: number }> {
  const response = await fetch(`/api/events/${eventId}/onboarding/files/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body: { error?: string } = await readJson<{ error?: string }>(response).catch(() => ({}));
    throw new ApiError(body.error ?? "Unable to export files", response.status, body);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "deliverables.zip";
  const count = Number(response.headers.get("x-chartstead-export-file-count") ?? "0");
  return {
    blob: await response.blob(),
    filename,
    fileCount: Number.isFinite(count) ? count : 0,
  };
}

export async function createDirectorySpeaker(
  eventId: string,
  input: SpeakerDirectoryCreateInput,
): Promise<SpeakerDirectoryMutation> {
  const response = await fetch(`/api/events/${eventId}/speakers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<SpeakerDirectoryMutation | { error: string }>(response);
  if (!response.ok || !("speaker" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to add speaker",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateDirectorySpeaker(
  eventId: string,
  speakerId: string,
  patch: {
    name?: string;
    email?: string;
    biography?: string;
    socialLinks?: SpeakerSocialLinks;
    headshotAssetId?: string | null;
  },
): Promise<OnboardingBoard["speakers"][number]> {
  const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson<OnboardingBoard["speakers"][number] | { error: string }>(
    response,
  );
  if (!response.ok || !("speakerId" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update speaker",
      response.status,
      body,
    );
  }
  return body;
}


export async function uploadDirectorySpeakerHeadshot(
  eventId: string,
  speakerId: string,
  file: File,
): Promise<string> {
  const start = await fetch(
    `/api/events/${eventId}/speakers/${speakerId}/headshot-uploads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mime: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    },
  );
  const startBody = await readJson<{ upload: AssetUploadSession } | { error: string }>(start);
  if (!start.ok || !("upload" in startBody)) {
    throw new ApiError(
      "error" in startBody ? startBody.error : "Unable to start headshot upload",
      start.status,
      startBody,
    );
  }
  const upload = await fetch(startBody.upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "content-length": String(file.size),
    },
    body: file,
  });
  if (!upload.ok) {
    throw new ApiError("Unable to upload headshot", upload.status);
  }
  return startBody.upload.assetId;
}

export async function addOrganizerDeliverableComment(
  eventId: string,
  assetId: string,
  bodyText: string,
): Promise<OnboardingDeliverableComment> {
  const response = await fetch(
    `/api/events/${eventId}/onboarding/assets/${assetId}/comments`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: bodyText }),
    },
  );
  const body = await readJson<OnboardingDeliverableComment | { error: string }>(
    response,
  );
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to add deliverable comment",
      response.status,
      body,
    );
  }
  return body;
}

export async function addPortalDeliverableComment(
  eventId: string,
  token: string,
  assetId: string,
  bodyText: string,
): Promise<OnboardingDeliverableComment> {
  const response = await fetch(
    `/api/events/${eventId}/portal/assets/${assetId}/comments?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: bodyText }),
    },
  );
  const body = await readJson<OnboardingDeliverableComment | { error: string }>(
    response,
  );
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to add deliverable comment",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateSpeakerParticipation(
  eventId: string,
  speakerId: string,
  patch: {
    workflowStatus: "invited" | "confirmed" | "preparing" | "ready" | "withdrawn";
    travelPreferences: string;
    logistics: Record<string, string>;
  },
): Promise<OnboardingBoard["speakers"][number]> {
  const response = await fetch(
    `/api/events/${eventId}/speakers/${speakerId}/participation`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  const body = await readJson<OnboardingBoard["speakers"][number] | { error: string }>(
    response,
  );
  if (!response.ok || !("speakerId" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update event participation",
      response.status,
      body,
    );
  }
  return body;
}

export async function previewSpeakerCsvImport(
  eventId: string,
  input: { csvText: string; mapping: SpeakerCsvColumnMapping },
): Promise<SpeakerCsvImportPreview> {
  const response = await fetch(`/api/events/${eventId}/speaker-imports/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<SpeakerCsvImportPreview | { error: string }>(response);
  if (!response.ok || !("rows" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to preview speaker CSV",
      response.status,
      body,
    );
  }
  return body;
}

export async function applySpeakerCsvImport(
  eventId: string,
  input: {
    csvText: string;
    mapping: SpeakerCsvColumnMapping;
    previewDigest: string;
    resolutions: Record<string, SpeakerCsvResolution>;
    idempotencyKey: string;
  },
): Promise<SpeakerCsvImportApplyResult> {
  const response = await fetch(`/api/events/${eventId}/speaker-imports/apply`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<SpeakerCsvImportApplyResult | { error: string }>(
    response,
  );
  if (!response.ok || !("totals" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to apply speaker CSV",
      response.status,
      body,
    );
  }
  return body;
}

export async function createOnboardingTask(
  eventId: string,
  input: {
    speakerId: string;
    title: string;
    instructions: string;
    kind: string;
    completionRequirement: OnboardingCompletionRequirement;
    readinessFlag?: string | null;
    dueAt?: string | null;
  },
): Promise<PortalOnboardingTask> {
  const response = await fetch(`/api/events/${eventId}/onboarding/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ task: PortalOnboardingTask } | { error: string }>(
    response,
  );
  if (!response.ok || !("task" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create task",
      response.status,
      body,
    );
  }
  return body.task;
}

export async function createOnboardingTasks(
  eventId: string,
  input: {
    speakerIds: string[];
    title: string;
    instructions: string;
    kind: string;
    completionRequirement: OnboardingCompletionRequirement;
    readinessFlag?: string | null;
    dueAt?: string | null;
    idempotencyKey: string;
  },
): Promise<OnboardingTaskBatchResult> {
  const response = await fetch(`/api/events/${eventId}/onboarding/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<OnboardingTaskBatchResult | { error: string }>(response);
  if (!response.ok || !("tasks" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to assign tasks",
      response.status,
      body,
    );
  }
  return body;
}

export async function prepareOnboardingReminder(
  eventId: string,
  speakerId: string,
): Promise<OnboardingReminderDraft> {
  const response = await fetch(`/api/events/${eventId}/onboarding/reminders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ speakerId }),
  });
  const body = await readJson<OnboardingReminderDraft | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to prepare reminder",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateOnboardingReminder(
  eventId: string,
  draftId: string,
  patch: { subject?: string; bodyText?: string },
): Promise<OnboardingReminderDraft> {
  const response = await fetch(
    `/api/events/${eventId}/onboarding/reminders/${draftId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  const body = await readJson<OnboardingReminderDraft | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update reminder",
      response.status,
      body,
    );
  }
  return body;
}

export async function discardOnboardingReminder(
  eventId: string,
  draftId: string,
): Promise<OnboardingReminderDraft> {
  const response = await fetch(
    `/api/events/${eventId}/onboarding/reminders/${draftId}/discard`,
    { method: "POST" },
  );
  const body = await readJson<OnboardingReminderDraft | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to discard reminder",
      response.status,
      body,
    );
  }
  return body;
}

export async function sendOnboardingReminder(
  eventId: string,
  draftId: string,
): Promise<OnboardingReminderDraft> {
  const response = await fetch(
    `/api/events/${eventId}/onboarding/reminders/${draftId}/send`,
    { method: "POST" },
  );
  const body = await readJson<OnboardingReminderDraft | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to send reminder",
      response.status,
      body,
    );
  }
  return body;
}

export async function prepareBulkOnboardingReminders(
  eventId: string,
  input: {
    speakerIds: string[];
    mode: "draft" | "send";
    idempotencyKey: string;
  },
): Promise<OnboardingBulkReminderResult> {
  const response = await fetch(`/api/events/${eventId}/onboarding/reminders/bulk`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<OnboardingBulkReminderResult | { error: string }>(response);
  if (!response.ok || !("recipients" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to prepare bulk reminders",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchOnboardingReminderPolicy(
  eventId: string,
): Promise<OnboardingReminderAutomationPolicy> {
  const response = await fetch(`/api/events/${eventId}/onboarding/reminders/policy`);
  const body = await readJson<{ policy: OnboardingReminderAutomationPolicy } | { error: string }>(
    response,
  );
  if (!response.ok || !("policy" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load reminder policy",
      response.status,
      body,
    );
  }
  return body.policy;
}

export async function updateOnboardingReminderPolicy(
  eventId: string,
  policy: Partial<OnboardingReminderAutomationPolicy>,
): Promise<OnboardingReminderAutomationPolicy> {
  const response = await fetch(`/api/events/${eventId}/onboarding/reminders/policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy }),
  });
  const body = await readJson<{ policy: OnboardingReminderAutomationPolicy } | { error: string }>(
    response,
  );
  if (!response.ok || !("policy" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update reminder policy",
      response.status,
      body,
    );
  }
  return body.policy;
}

export async function processDueOnboardingReminders(
  eventId: string,
): Promise<OnboardingAutomaticReminderResult> {
  const response = await fetch(
    `/api/events/${eventId}/onboarding/reminders/process-due`,
    { method: "POST" },
  );
  const body = await readJson<OnboardingAutomaticReminderResult | { error: string }>(
    response,
  );
  if (!response.ok || !("recipients" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to process due reminders",
      response.status,
      body,
    );
  }
  return body;
}

export async function createDecisionCourseCheck(
  eventId: string,
  input: {
    proposalId?: string;
    outcome?: ProgramOutcome;
    items?: Array<{ proposalId: string; outcome: ProgramOutcome }>;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan & { linkedPlans?: CourseCheckPlan[] }> {
  const response = await fetch(`/api/events/${eventId}/course-checks/decisions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<
    (CourseCheckPlan & { linkedPlans?: CourseCheckPlan[] }) | { error: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create Decision Course Check",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchCourseCheckPolicy(
  eventId: string,
): Promise<EventCourseCheckPolicy> {
  const response = await fetch(`/api/events/${eventId}/course-checks/policy`);
  const body = await readJson<{ policy: EventCourseCheckPolicy } | { error: string }>(
    response,
  );
  if (!response.ok || !("policy" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load Course Check policy",
      response.status,
      body,
    );
  }
  return body.policy;
}

export async function updateCourseCheckPolicy(
  eventId: string,
  policy: Partial<EventCourseCheckPolicy>,
): Promise<EventCourseCheckPolicy> {
  const response = await fetch(`/api/events/${eventId}/course-checks/policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy }),
  });
  const body = await readJson<{ policy: EventCourseCheckPolicy } | { error: string }>(
    response,
  );
  if (!response.ok || !("policy" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update Course Check policy",
      response.status,
      body,
    );
  }
  return body.policy;
}

export async function fetchCourseCheckPlans(
  eventId: string,
): Promise<CourseCheckPlan[]> {
  const response = await fetch(`/api/events/${eventId}/course-checks`);
  const body = await readJson<{ plans: CourseCheckPlan[] } | { error: string }>(
    response,
  );
  if (!response.ok || !("plans" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to list Course Checks",
      response.status,
      body,
    );
  }
  return body.plans;
}

export async function fetchCourseCheckPlan(
  eventId: string,
  planId: string,
): Promise<CourseCheckPlan> {
  const response = await fetch(`/api/events/${eventId}/course-checks/${planId}`);
  const body = await readJson<CourseCheckPlan | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Course Check not found",
      response.status,
      body,
    );
  }
  return body;
}

/** Best-effort, privacy-safe UX evidence. Callers deliberately ignore failures. */
export async function emitCourseCheckUxEvent(
  eventId: string,
  event: CourseCheckUxEventInput,
  keepalive = false,
): Promise<void> {
  const response = await fetch(
    `/api/events/${encodeURIComponent(eventId)}/course-checks/ux-events`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": event.id,
      },
      body: JSON.stringify(event),
      keepalive,
    },
  );
  if (!response.ok) {
    throw new ApiError("UX evidence was not accepted", response.status);
  }
}

export async function deferCourseCheckItems(
  eventId: string,
  planId: string,
  input: {
    planVersion: number;
    digest: string;
    itemIds: string[];
    reason: string;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/${planId}/defer`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    CourseCheckPlan | { error: string; recoveryGuidance?: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    const message =
      "error" in body
        ? body.recoveryGuidance
          ? `${body.error} ${body.recoveryGuidance}`
          : body.error
        : "Unable to defer Course Check items";
    throw new ApiError(message, response.status, body);
  }
  return body;
}

export async function createCommunicationCourseCheck(
  eventId: string,
  input: {
    decisionPlanId?: string;
    proposalIds?: string[];
    sessionIds?: string[];
    speakerIds?: string[];
    taskIds?: string[];
    templateKind?: "acceptance" | "decline" | "custom";
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    portalInvitation?: boolean;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/communications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<CourseCheckPlan | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create Communication Course Check",
      response.status,
      body,
    );
  }
  return body;
}

export async function reviseCommunicationCourseCheck(
  eventId: string,
  planId: string,
  input: {
    planVersion: number;
    digest: string;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    recipientSelection?: Array<{ recipientId: string; selected: boolean }>;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/${planId}/revise`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    CourseCheckPlan | { error: string; recoveryGuidance?: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    const message =
      "error" in body
        ? body.recoveryGuidance
          ? `${body.error} ${body.recoveryGuidance}`
          : body.error
        : "Unable to revise Communication Course Check";
    throw new ApiError(message, response.status, body);
  }
  return body;
}

export async function createCommunicationDrafts(
  eventId: string,
  planId: string,
  input: {
    planVersion: number;
    digest: string;
    stageId?: "create-drafts";
    idempotencyKey: string;
    softWarningOverrides?: Array<{ findingId: string; reason?: string | null }>;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/${planId}/create-drafts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        ...input,
        stageId: input.stageId ?? "create-drafts",
      }),
    },
  );
  const body = await readJson<
    CourseCheckPlan | { error: string; recoveryGuidance?: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    const message =
      "error" in body
        ? body.recoveryGuidance
          ? `${body.error} ${body.recoveryGuidance}`
          : body.error
        : "Unable to create communication drafts";
    throw new ApiError(message, response.status, body);
  }
  return body;
}

async function updateCommunicationEffect(
  eventId: string,
  path: string,
  input: Record<string, unknown> & { idempotencyKey: string },
  fallback: string,
): Promise<CourseCheckPlan> {
  const response = await fetch(`/api/events/${eventId}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<
    CourseCheckPlan | { error: string; recoveryGuidance?: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    const message =
      "error" in body
        ? body.recoveryGuidance
          ? `${body.error} ${body.recoveryGuidance}`
          : body.error
        : fallback;
    throw new ApiError(message, response.status, body);
  }
  return body;
}

export async function sendCommunication(
  eventId: string,
  planId: string,
  input: {
    planVersion: number;
    digest: string;
    stageId?: "send-messages";
    idempotencyKey: string;
    reason?: string | null;
  },
): Promise<CourseCheckPlan> {
  return updateCommunicationEffect(
    eventId,
    `course-checks/${planId}/send`,
    { ...input, stageId: input.stageId ?? "send-messages" },
    "Unable to start communication delivery",
  );
}

export async function retryCommunicationEffect(
  eventId: string,
  planId: string,
  effectId: string,
  idempotencyKey: string,
): Promise<CourseCheckPlan> {
  return updateCommunicationEffect(
    eventId,
    `course-checks/${planId}/effects/${effectId}/retry`,
    { idempotencyKey },
    "Unable to retry communication delivery",
  );
}

export async function reconcileCommunicationEffect(
  eventId: string,
  planId: string,
  effectId: string,
  input: {
    outcome: "delivered" | "not_delivered";
    note: string;
    providerReference?: string;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  return updateCommunicationEffect(
    eventId,
    `course-checks/${planId}/effects/${effectId}/reconcile`,
    input,
    "Unable to reconcile communication delivery",
  );
}

export async function createCommunicationCorrection(
  eventId: string,
  planId: string,
  effectId: string,
  input: {
    reason: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  return updateCommunicationEffect(
    eventId,
    `course-checks/${planId}/effects/${effectId}/correction`,
    input,
    "Unable to create a communication correction",
  );
}

export async function createPublicationCourseCheck(
  eventId: string,
  input: {
    operation: PublicationOperation;
    restoreRevisionId?: string;
    idempotencyKey: string;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(`/api/events/${eventId}/course-checks/publications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readJson<CourseCheckPlan | { error: string }>(response);
  if (!response.ok || !("id" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create Publication Course Check",
      response.status,
      body,
    );
  }
  return body;
}

export async function applyCourseCheckPlan(
  eventId: string,
  planId: string,
  input: {
    planVersion: number;
    digest: string;
    stageId: string;
    idempotencyKey: string;
    reason?: string | null;
    softWarningOverrides?: Array<{ findingId: string; reason?: string | null }>;
  },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/${planId}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  const body = await readJson<
    | CourseCheckPlan
    | {
        error: string;
        recoveryGuidance?: string;
        changedInputs?: string[];
        code?: string;
      }
  >(response);
  if (!response.ok || !("id" in body)) {
    const err = body as {
      error?: string;
      recoveryGuidance?: string;
      changedInputs?: string[];
    };
    const changed =
      err.changedInputs && err.changedInputs.length > 0
        ? ` Changed inputs: ${err.changedInputs.join("; ")}.`
        : "";
    const message =
      err.error != null
        ? err.recoveryGuidance
          ? `${err.error} ${err.recoveryGuidance}${changed}`
          : `${err.error}${changed}`
        : "Unable to apply Course Check";
    throw new ApiError(message, response.status, body);
  }
  return body;
}

async function mutateCourseCheckAirtable(
  eventId: string,
  plan: CourseCheckPlan,
  action: "execute" | "reconcile" | "disposition",
  input: { idempotencyKey: string; disposition?: "deferred" | "removed" },
): Promise<CourseCheckPlan> {
  const response = await fetch(
    `/api/events/${eventId}/course-checks/${plan.id}/airtable/${action}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        ...input,
      }),
    },
  );
  const body = await readJson<
    CourseCheckPlan | { plan: CourseCheckPlan; error?: string; guidance?: string }
  >(response);
  if (!response.ok) {
    throw new ApiError(
      "error" in body && body.error ? body.error : "Unable to update Airtable stage",
      response.status,
      body,
    );
  }
  return "plan" in body ? body.plan : body;
}

export const executeCourseCheckAirtable = (
  eventId: string,
  plan: CourseCheckPlan,
  idempotencyKey: string,
) => mutateCourseCheckAirtable(eventId, plan, "execute", { idempotencyKey });

export const reconcileCourseCheckAirtable = (
  eventId: string,
  plan: CourseCheckPlan,
  idempotencyKey: string,
) => mutateCourseCheckAirtable(eventId, plan, "reconcile", { idempotencyKey });

export const setCourseCheckAirtableDisposition = (
  eventId: string,
  plan: CourseCheckPlan,
  disposition: "deferred" | "removed",
  idempotencyKey: string,
) => mutateCourseCheckAirtable(eventId, plan, "disposition", { disposition, idempotencyKey });

export async function fetchAgenda(eventId: string): Promise<AgendaWorkspaceResponse> {
  const response = await fetch(`/api/events/${eventId}/sessions`);
  const body = await readJson<AgendaWorkspaceResponse | { error: string }>(response);
  if (!response.ok || !("sessions" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load agenda",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchSessionContentWorkspace(
  eventId: string,
): Promise<SessionContentWorkspaceResponse> {
  const response = await fetch(`/api/events/${eventId}/session-content`);
  const body = await readJson<SessionContentWorkspaceResponse | { error: string }>(response);
  if (!response.ok || !("sessions" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load session content",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateSessionContent(
  eventId: string,
  sessionId: string,
  patch: SessionContentPatch,
): Promise<SessionContentMutationResponse> {
  const response = await fetch(`/api/events/${eventId}/session-content/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson<SessionContentMutationResponse | { error: string }>(response);
  if (!response.ok || !("session" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save session content",
      response.status,
      body,
    );
  }
  return body;
}

export async function restoreSessionContent(
  eventId: string,
  sessionId: string,
  input: { expectedVersion: number; restoreVersion: number },
): Promise<SessionContentMutationResponse> {
  const response = await fetch(`/api/events/${eventId}/session-content/${sessionId}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<SessionContentMutationResponse | { error: string }>(response);
  if (!response.ok || !("session" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to restore session content",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchPublicProgram(
  eventId: string,
  revisionId?: string,
): Promise<PublicProgramResponse> {
  const params = revisionId ? `?revision=${encodeURIComponent(revisionId)}` : "";
  const response = await fetch(`/api/events/${eventId}/program${params}`);
  const body = await readJson<PublicProgramResponse | { error: string }>(response);
  if (!response.ok || !("sessions" in body) || !("revision" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load the public program",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchPublicEmbedConfigs(eventId: string): Promise<PublicEmbedConfig[]> {
  const response = await fetch(`/api/events/${eventId}/embed-configs`);
  const body = await readJson<{ configs: PublicEmbedConfig[] } | { error: string }>(response);
  if (!response.ok || !("configs" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load embed configurations",
      response.status,
      body,
    );
  }
  return body.configs;
}

export async function createPublicEmbedConfig(
  eventId: string,
  input: PublicEmbedConfigInput,
): Promise<PublicEmbedConfig> {
  const response = await fetch(`/api/events/${eventId}/embed-configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<PublicEmbedConfig | { error: string }>(response);
  if (!response.ok || !("embedCode" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save embed configuration",
      response.status,
      body,
    );
  }
  return body;
}

export async function updatePublicEmbedConfig(
  eventId: string,
  embedId: string,
  input: Partial<PublicEmbedConfigInput>,
): Promise<PublicEmbedConfig> {
  const response = await fetch(`/api/events/${eventId}/embed-configs/${embedId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<PublicEmbedConfig | { error: string }>(response);
  if (!response.ok || !("embedCode" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update embed configuration",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchPublicEmbed(
  eventId: string,
  embedId: string,
): Promise<PublicEmbedResolveResponse> {
  const response = await fetch(`/api/events/${eventId}/public-embeds/${embedId}`);
  const body = await readJson<PublicEmbedResolveResponse | { error: string }>(response);
  if (!response.ok || !("program" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load public embed",
      response.status,
      body,
    );
  }
  return body;
}

export function publicProgramCalendarUrl(
  eventId: string,
  sessionId: string,
  revisionId?: string,
): string {
  const params = revisionId ? `?revision=${encodeURIComponent(revisionId)}` : "";
  return `/api/events/${eventId}/program/sessions/${encodeURIComponent(sessionId)}/calendar.ics${params}`;
}

export function publicProgramCalendarExportUrl(
  eventId: string,
  sessionIds: string[],
  revisionId: string,
): string {
  const params = new URLSearchParams({
    sessionIds: sessionIds.join(","),
    revision: revisionId,
  });
  return `/api/events/${eventId}/program/calendar.ics?${params.toString()}`;
}

export async function updateSessionPlacement(
  eventId: string,
  sessionId: string,
  patch: SessionPlacementPatch,
): Promise<SessionPlacementResponse> {
  const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson<SessionPlacementResponse | { error: string }>(response);
  if (!response.ok || !("session" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update session placement",
      response.status,
      body,
    );
  }
  return body;
}

export async function previewAgendaAutoPlace(
  eventId: string,
  input: { selectedSessionIds?: string[]; includeManual?: boolean },
): Promise<AgendaAutoPlacePreview> {
  const response = await fetch(`/api/events/${eventId}/agenda/auto-place/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<AgendaAutoPlacePreview | { error: string }>(response);
  if (!response.ok || !("previewId" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to preview auto-place",
      response.status,
      body,
    );
  }
  return body;
}

export async function applyAgendaAutoPlace(
  eventId: string,
  input: {
    previewId: string;
    previewDigest: string;
    agendaVersion: number;
    idempotencyKey: string;
  },
): Promise<AgendaAutoPlaceApplyResponse> {
  const response = await fetch(`/api/events/${eventId}/agenda/auto-place/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<AgendaAutoPlaceApplyResponse | { error: string }>(response);
  if (!response.ok || !("agenda" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to apply auto-place",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateSubmitterProposal(
  eventId: string,
  proposalId: string,
  token: string,
  answers: SubmissionAnswers,
): Promise<PublicProposal> {
  const response = await fetch(
    `/api/events/${eventId}/submitter/proposals/${proposalId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-submitter-token": token,
      },
      body: JSON.stringify({ answers }),
    },
  );
  const body = await readJson<
    { proposal: PublicProposal } | ProposalValidationError | { error: string }
  >(response);
  if (response.status === 400 && body && "errors" in body) {
    throw new ApiError("Validation failed", 400, body);
  }
  if (!response.ok || !("proposal" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update proposal",
      response.status,
      body,
    );
  }
  return body.proposal;
}

export type AgentOperatingMode =
  | "propose_only"
  | "delegated_execution"
  | "autonomous_policy";

export type CourseCheckScopeGrant =
  | "all"
  | "decisions"
  | "drafts"
  | "sends"
  | "calendars"
  | "publication"
  | "integrations"
  | "retries"
  | "reconciliation"
  | "compensation";

export interface EventApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  principalKind: "human" | "agent";
  agentMode: AgentOperatingMode | null;
  courseCheckScopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedEventApiKey extends EventApiKeySummary {
  token: string;
  courseCheckScopesByEvent?: Record<string, string[]>;
}

export async function listEventApiKeys(
  eventId: string,
): Promise<{ apiKeys: EventApiKeySummary[] }> {
  const response = await fetch(`/api/v1/events/${eventId}/api-keys`);
  const body = await readJson<{ apiKeys: EventApiKeySummary[] } | { error: string }>(
    response,
  );
  if (!response.ok || !("apiKeys" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load API keys",
      response.status,
      body,
    );
  }
  return body;
}

export async function createEventApiKey(
  eventId: string,
  input: {
    name: string;
    principalKind?: "human" | "agent";
    agentMode?: AgentOperatingMode;
    courseCheckScopes?: CourseCheckScopeGrant[];
  },
): Promise<{ apiKey: CreatedEventApiKey }> {
  const response = await fetch(`/api/v1/events/${eventId}/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ apiKey: CreatedEventApiKey } | { error: string }>(
    response,
  );
  if (!response.ok || !("apiKey" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to create API key",
      response.status,
      body,
    );
  }
  return body;
}

export async function updateEventApiKey(
  eventId: string,
  keyId: string,
  input: {
    agentMode?: AgentOperatingMode;
    courseCheckScopes?: CourseCheckScopeGrant[];
    revoke?: boolean;
  },
): Promise<{
  apiKey: {
    id: string;
    revoked: boolean;
    agentMode: AgentOperatingMode | null;
    courseCheckScopes: string[];
  };
}> {
  const response = await fetch(`/api/v1/events/${eventId}/api-keys/${keyId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<
    | {
        apiKey: {
          id: string;
          revoked: boolean;
          agentMode: AgentOperatingMode | null;
          courseCheckScopes: string[];
        };
      }
    | { error: string }
  >(response);
  if (!response.ok || !("apiKey" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to update API key",
      response.status,
      body,
    );
  }
  return body;
}

export async function fetchAirtableSync(
  eventId: string,
): Promise<{ sync: AirtableSyncState }> {
  const response = await fetch(`/api/events/${eventId}/integrations/airtable`);
  const body = await readJson<{ sync: AirtableSyncState } | { error: string }>(
    response,
  );
  if (!response.ok || !("sync" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load Airtable sync status",
      response.status,
      body,
    );
  }
  return body;
}

export async function connectAirtableSync(
  eventId: string,
  input: { baseId: string; accessToken: string },
): Promise<{ pull: AirtablePullResult; sync: AirtableSyncState }> {
  const response = await fetch(`/api/events/${eventId}/integrations/airtable`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<
    | { pull: AirtablePullResult; sync: AirtableSyncState }
    | { error: string }
  >(response);
  if (!response.ok || !("sync" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to connect Airtable",
      response.status,
      body,
    );
  }
  return body;
}

export async function disconnectAirtableSync(
  eventId: string,
): Promise<{ sync: AirtableSyncState }> {
  const response = await fetch(`/api/events/${eventId}/integrations/airtable`, {
    method: "DELETE",
  });
  const body = await readJson<{ sync: AirtableSyncState } | { error: string }>(
    response,
  );
  if (!response.ok || !("sync" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to disconnect Airtable",
      response.status,
      body,
    );
  }
  return body;
}

export async function pullAirtableSync(eventId: string): Promise<{
  pull: AirtablePullResult;
  sync: AirtableSyncState;
}> {
  const response = await fetch(
    `/api/events/${eventId}/integrations/airtable/pull`,
    { method: "POST" },
  );
  const body = await readJson<
    | { pull: AirtablePullResult; sync: AirtableSyncState }
    | { error: string }
  >(response);
  if (!response.ok || !("sync" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to pull Airtable changes",
      response.status,
      body,
    );
  }
  return body;
}
