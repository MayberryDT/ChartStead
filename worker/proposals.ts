import { isUploadedAssetAnswer } from "../shared/cfp-definition";
import type {
  CoSpeakerInput,
  EventRecord,
  OrganizerProposal,
  ProposalInput,
  ProposalValidationError,
  PublicProposal,
  SubmitterProposal,
} from "../shared/events";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function normalizeCoSpeakers(value: unknown): CoSpeakerInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    return {
      name: readString(record, "name"),
      email: readString(record, "email"),
      biography: readString(record, "biography"),
      role: readString(record, "role") || "co-speaker",
    };
  });
}

function normalizeSpeakersPanel(source: Record<string, unknown>): {
  speakerName: string;
  speakerEmail: string;
  biography: string;
  coSpeakers: CoSpeakerInput[];
} | null {
  if (!Array.isArray(source.speakers) || source.speakers.length === 0) {
    return null;
  }
  const panels = source.speakers.map((entry) => {
    const record =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    return {
      name: readString(record, "name") || readString(record, "speakerName"),
      email: readString(record, "email") || readString(record, "speakerEmail"),
      biography:
        readString(record, "biography") || readString(record, "bio"),
      role: readString(record, "role") || "co-speaker",
    };
  });
  const [primary, ...rest] = panels;
  return {
    speakerName: primary.name,
    speakerEmail: primary.email,
    biography: primary.biography,
    coSpeakers: rest,
  };
}

export function normalizeProposalInput(body: unknown): ProposalInput {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fromPanel = normalizeSpeakersPanel(source);
  const supportingFileRaw = source.supportingFile;
  const supportingFile =
    supportingFileRaw === null
      ? null
      : isUploadedAssetAnswer(supportingFileRaw)
        ? supportingFileRaw
        : undefined;

  return {
    title: readString(source, "title"),
    abstract: readString(source, "abstract"),
    trackId: readString(source, "trackId"),
    speakerName: fromPanel?.speakerName ?? readString(source, "speakerName"),
    speakerEmail: fromPanel?.speakerEmail ?? readString(source, "speakerEmail"),
    biography: fromPanel?.biography ?? readString(source, "biography"),
    supportingLink: readString(source, "supportingLink"),
    sessionFormat: readString(source, "sessionFormat"),
    workshopDuration: readString(source, "workshopDuration"),
    coSpeakers: fromPanel?.coSpeakers ?? normalizeCoSpeakers(source.coSpeakers),
    supportingFile: supportingFile === undefined ? null : supportingFile,
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
    } else {
      try {
        const url = new URL(supportingLink);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          errors.supportingLink = "Use an http or https link.";
        }
      } catch {
        errors.supportingLink = "Enter a valid URL.";
      }
    }
  }

  for (const [index, speaker] of (input.coSpeakers ?? []).entries()) {
    if (!speaker.name.trim()) {
      errors[`coSpeakers.${index}.name`] = "Enter the co-speaker name.";
    }
    if (!speaker.email.trim() || !EMAIL_RE.test(speaker.email.trim())) {
      errors[`coSpeakers.${index}.email`] = "Enter a valid co-speaker email.";
    }
  }

  if (input.sessionFormat === "workshop" && !input.workshopDuration?.trim()) {
    errors.workshopDuration = "Enter a workshop duration.";
  }

  if (Object.keys(errors).length === 0) return null;
  return {
    errors,
    values: {
      title: input.title,
      abstract: input.abstract,
      trackId: input.trackId,
      speakerName: input.speakerName,
      speakerEmail: input.speakerEmail,
      biography: input.biography,
      supportingLink: input.supportingLink,
      sessionFormat: input.sessionFormat ?? "",
      workshopDuration: input.workshopDuration ?? "",
      coSpeakers: (input.coSpeakers ?? []).map((speaker) => ({
        name: speaker.name,
        email: speaker.email,
        biography: speaker.biography,
      })),
      supportingFile: input.supportingFile ?? null,
    },
  };
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

/** Explicit allowlist for submitter edit sessions — never spread OrganizerProposal. */
export function toSubmitterProposal(
  proposal: OrganizerProposal,
): PublicProposal & { speakerEmail: string } {
  return {
    id: proposal.id,
    eventId: proposal.eventId,
    title: proposal.title,
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    speakerName: proposal.speakerName,
    submittedAt: proposal.submittedAt,
    speakerEmail: proposal.speakerEmail,
  };
}

export function toSubmitterDashboardProposal(
  proposal: OrganizerProposal,
  ownership: { claimed: boolean; claimable: boolean },
): SubmitterProposal {
  const status = proposal.programOutcome
    ? proposal.programOutcome === "accepted"
      ? "accepted"
      : "rejected"
    : proposal.status === "unreviewed"
      ? "submitted"
      : "under_review";

  return {
    id: proposal.id,
    eventId: proposal.eventId,
    title: proposal.title,
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    speakerName: proposal.speakerName,
    submittedAt: proposal.submittedAt,
    status,
    ...ownership,
  };
}
