import type {
  EventRecord,
  OrganizerProposal,
  ProposalInput,
  ProposalValidationError,
  PublicProposal,
} from "../shared/events";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyProposalInput(): ProposalInput {
  return {
    title: "",
    abstract: "",
    trackId: "",
    speakerName: "",
    speakerEmail: "",
    biography: "",
    supportingLink: "",
  };
}

export function normalizeProposalInput(body: unknown): ProposalInput {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const read = (key: keyof ProposalInput) => {
    const value = source[key];
    return typeof value === "string" ? value : "";
  };
  return {
    title: read("title"),
    abstract: read("abstract"),
    trackId: read("trackId"),
    speakerName: read("speakerName"),
    speakerEmail: read("speakerEmail"),
    biography: read("biography"),
    supportingLink: read("supportingLink"),
  };
}

export function validateProposalInput(
  input: ProposalInput,
  event: EventRecord,
): ProposalValidationError | null {
  const errors: ProposalValidationError["errors"] = {};
  const title = input.title.trim();
  const abstract = input.abstract.trim();
  const speakerName = input.speakerName.trim();
  const speakerEmail = input.speakerEmail.trim();
  const biography = input.biography.trim();
  const supportingLink = input.supportingLink.trim();
  const track = event.tracks.find((candidate) => candidate.id === input.trackId);

  if (!title) errors.title = "Enter a talk title.";
  if (!abstract) errors.abstract = "Enter an abstract.";
  if (!speakerName) errors.speakerName = "Enter the speaker name.";
  if (!speakerEmail) {
    errors.speakerEmail = "Enter an email address.";
  } else if (!EMAIL_RE.test(speakerEmail)) {
    errors.speakerEmail = "Enter a valid email address.";
  }
  if (!biography) errors.biography = "Enter a short biography.";
  if (!track) errors.trackId = "Choose a track.";
  if (supportingLink) {
    try {
      const url = new URL(supportingLink);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.supportingLink = "Use an http or https link.";
      }
    } catch {
      errors.supportingLink = "Enter a valid URL.";
    }
  }

  if (Object.keys(errors).length === 0) return null;
  return { errors, values: input };
}

export function createStableProposalId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return `SUB-${token}`;
}

export function toPublicProposal(proposal: OrganizerProposal): PublicProposal {
  return {
    id: proposal.id,
    eventId: proposal.eventId,
    title: proposal.title,
    abstract: proposal.abstract,
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    speakerName: proposal.speakerName,
    biography: proposal.biography,
    supportingLink: proposal.supportingLink,
    status: proposal.status,
    submittedAt: proposal.submittedAt,
  };
}
