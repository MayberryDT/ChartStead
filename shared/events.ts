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
}

export interface OrganizerPrincipal {
  id: string;
  displayName: string;
  role: "admin";
  eventIds: string[];
}

export interface EventListResponse {
  events: EventRecord[];
  principal: OrganizerPrincipal;
}

export type ProposalStatus = "unreviewed" | "approve" | "maybe" | "deny";

export interface ProposalInput {
  title: string;
  abstract: string;
  trackId: string;
  speakerName: string;
  speakerEmail: string;
  biography: string;
  supportingLink: string;
}

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
  abstract: string;
  speakerEmail: string;
  biography: string;
  supportingLink: string;
  status: ProposalStatus;
  committeeNote: string;
  privateNote: string;
}

export interface PublishedCfpForm {
  id: string;
  status: "published";
  definitionVersion: number;
  definition: Record<string, unknown>;
  publishedAt: string;
}

export interface CfpFormResponse {
  event: Pick<EventRecord, "id" | "name" | "startsOn" | "endsOn">;
  form: PublishedCfpForm;
}

export interface ProposalValidationError {
  errors: Partial<Record<keyof ProposalInput, string>>;
  values: ProposalInput;
}

export interface ProposalListResponse {
  proposals: OrganizerProposal[];
}
