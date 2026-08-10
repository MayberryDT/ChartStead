import type {
  EventRecord,
  OrganizerProposal,
  ProposalInput,
  ProposalValidationError,
  PublicProposal,
} from "../shared/events";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  else if (title.length > 160) errors.title = "Use 160 characters or fewer.";
  if (!abstract) errors.abstract = "Enter an abstract.";
  else if (abstract.length > 5_000) {
    errors.abstract = "Use 5000 characters or fewer.";
  }
  if (!speakerName) errors.speakerName = "Enter the speaker name.";
  else if (speakerName.length > 120) {
    errors.speakerName = "Use 120 characters or fewer.";
  }
  if (!speakerEmail) {
    errors.speakerEmail = "Enter an email address.";
  } else if (!EMAIL_RE.test(speakerEmail)) {
    errors.speakerEmail = "Enter a valid email address.";
  } else if (speakerEmail.length > 320) {
    errors.speakerEmail = "Use 320 characters or fewer.";
  }
  if (!biography) errors.biography = "Enter a short biography.";
  else if (biography.length > 2_000) {
    errors.biography = "Use 2000 characters or fewer.";
  }
  if (!track) errors.trackId = "Choose a track.";
  if (supportingLink) {
    if (supportingLink.length > 2_048) {
      errors.supportingLink = "Use 2048 characters or fewer.";
      return { errors, values: input };
    }
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
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    speakerName: proposal.speakerName,
    submittedAt: proposal.submittedAt,
  };
}
