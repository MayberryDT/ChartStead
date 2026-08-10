import type {
  CfpFormResponse,
  EventListResponse,
  OrganizerProposal,
  ProposalInput,
  ProposalListResponse,
  ProposalValidationError,
  PublicProposal,
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

export async function fetchCfp(eventId: string): Promise<CfpFormResponse> {
  const response = await fetch(`/api/events/${eventId}/cfp`);
  const body = await readJson<CfpFormResponse | { error: string }>(response);
  if (!response.ok || !("form" in body)) {
    throw new ApiError(
      "error" in body ? body.error : "Unable to load the call for proposals",
      response.status,
      body,
    );
  }
  return body;
}

export async function submitProposal(
  eventId: string,
  input: ProposalInput,
): Promise<PublicProposal> {
  const response = await fetch(`/api/events/${eventId}/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
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
  query = "",
): Promise<OrganizerProposal[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
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
