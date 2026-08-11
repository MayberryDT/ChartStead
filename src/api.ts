import type {
  AssetUploadSession,
  CfpDefinitionV1,
  CfpFormResponse,
  EventListResponse,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerProposal,
  ProposalReviewResponse,
  ProposalStatus,
  ProposalListResponse,
  ProposalValidationError,
  PublicProposal,
  ReviewerAssignment,
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
