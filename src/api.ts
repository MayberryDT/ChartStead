import type {
  CourseCheckPlan,
  ProgramOutcome,
  PublicationOperation,
} from "../shared/course-check";
import type { AirtablePullResult, AirtableSyncState } from "../shared/airtable";
import type {
  AgendaWorkspaceResponse,
  AssetUploadSession,
  CfpDefinitionV1,
  CfpFormResponse,
  EventListResponse,
  OnboardingBoard,
  OnboardingCompletionRequirement,
  OnboardingReminderDraft,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerProposal,
  PortalOnboardingTask,
  ProposalReviewResponse,
  ProposalStatus,
  ProposalListResponse,
  ProposalValidationError,
  PublicProgramResponse,
  PublicProposal,
  ReviewerAssignment,
  SessionPlacementPatch,
  SessionPlacementResponse,
  SpeakerPortalSession,
  SubmissionAnswers,
  SubmitterEditSession,
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
  event: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
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
): Promise<PublicProposal> {
  const response = await fetch(`/api/events/${eventId}/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      formId: form.id,
      formDefinitionVersion: form.definitionVersion,
      answers,
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
    sort?: "newest" | "oldest" | "title-asc" | "speaker-asc";
  } = {},
): Promise<OrganizerProposal[]> {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("q", options.query.trim());
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.track) params.set("track", options.track);
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

export async function fetchOrganizerProposal(
  eventId: string,
  proposalId: string,
): Promise<ProposalReviewResponse> {
  const response = await fetch(
    `/api/events/${eventId}/organizer/proposals/${proposalId}`,
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

export async function updateProposalReview(
  eventId: string,
  proposalId: string,
  input: {
    expectedVersion: number;
    status?: ProposalStatus;
    committeeNote?: string;
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

export async function fetchReviewerAssignments(
  eventId: string,
): Promise<ReviewerAssignment[]> {
  const response = await fetch(`/api/events/${eventId}/reviewers`);
  const body = await readJson<{ reviewers: ReviewerAssignment[] } | { error: string }>(
    response,
  );
  if (!response.ok || !("reviewers" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load reviewer routing",
      response.status,
      body,
    );
  }
  return body.reviewers;
}

export async function grantReviewerTracks(
  eventId: string,
  input: { email: string; trackIds: string[] },
): Promise<ReviewerAssignment> {
  const response = await fetch(`/api/events/${eventId}/reviewers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ reviewer: ReviewerAssignment } | { error: string }>(
    response,
  );
  if (!response.ok || !("reviewer" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to save reviewer routing",
      response.status,
      body,
    );
  }
  return body.reviewer;
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
    CourseCheckPlan | { error: string; recoveryGuidance?: string }
  >(response);
  if (!response.ok || !("id" in body)) {
    const message =
      "error" in body
        ? body.recoveryGuidance
          ? `${body.error} ${body.recoveryGuidance}`
          : body.error
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

export function publicProgramCalendarUrl(
  eventId: string,
  sessionId: string,
  revisionId?: string,
): string {
  const params = revisionId ? `?revision=${encodeURIComponent(revisionId)}` : "";
  return `/api/events/${eventId}/program/sessions/${encodeURIComponent(sessionId)}/calendar.ics${params}`;
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
