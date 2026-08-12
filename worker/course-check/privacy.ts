import type {
  CommunicationPlanBody,
  CourseCheckPlanBody,
  DecisionPlanBody,
  GuaranteedSpeakerPlanBody,
  PublicationPlanBody,
} from "../../shared/course-check";

const REDACTED = "[erased]";

/** Patterns that must never appear in stored plan/audit JSON. */
const FORBIDDEN_STORAGE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\bsk_live_[A-Za-z0-9]+/i,
  /\bsk_test_[A-Za-z0-9]+/i,
  /\bre[A-Za-z0-9]{20,}/i, // Resend-ish
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /[?&]token=[A-Za-z0-9\-._~%]+/i,
  /\/portal\/[A-Za-z0-9\-._~]+/i,
];

export function findForbiddenStorageSecrets(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  const hits: string[] = [];
  for (const pattern of FORBIDDEN_STORAGE_PATTERNS) {
    if (pattern.test(text)) hits.push(pattern.source);
  }
  return hits;
}

export function assertSafePlanStorage(payload: unknown): void {
  const hits = findForbiddenStorageSecrets(payload);
  if (hits.length > 0) {
    throw new Error(
      `Plan storage refused: payload matches forbidden secret/signed-link patterns (${hits.join(", ")}).`,
    );
  }
}

function eraseDecisionBody(body: DecisionPlanBody): {
  body: DecisionPlanBody;
  count: number;
} {
  let count = 0;
  const erase = (value: string) => {
    if (value && value !== REDACTED) count += 1;
    return REDACTED;
  };
  const next: DecisionPlanBody = {
    ...body,
    speakers: body.speakers.map((speaker) => ({
      ...speaker,
      name: erase(speaker.name),
      email: erase(speaker.email),
      biography: erase(speaker.biography),
    })),
    portalAccess: body.portalAccess.map((access) => ({
      ...access,
      email: erase(access.email),
    })),
    items: body.items.map((item) => ({
      ...item,
      speakers: item.speakers.map((speaker) => ({
        ...speaker,
        name: erase(speaker.name),
        email: erase(speaker.email),
        biography: erase(speaker.biography),
      })),
      portalAccess: item.portalAccess.map((access) => ({
        ...access,
        email: erase(access.email),
      })),
      participations: item.participations.map((part) => ({
        ...part,
        titleSnapshot: erase(part.titleSnapshot),
        organizationSnapshot: erase(part.organizationSnapshot),
      })),
    })),
    participations: body.participations.map((part) => ({
      ...part,
      titleSnapshot: erase(part.titleSnapshot),
      organizationSnapshot: erase(part.organizationSnapshot),
    })),
  };
  return { count, body: next };
}

function eraseGuaranteedBody(body: GuaranteedSpeakerPlanBody): {
  body: GuaranteedSpeakerPlanBody;
  count: number;
} {
  let count = 0;
  const erase = (value: string) => {
    if (value && value !== REDACTED) count += 1;
    return REDACTED;
  };
  const next: GuaranteedSpeakerPlanBody = {
    ...body,
    speakers: body.speakers.map((speaker) => ({
      ...speaker,
      name: erase(speaker.name),
      email: erase(speaker.email),
      biography: erase(speaker.biography),
    })),
    portalAccess: body.portalAccess.map((access) => ({
      ...access,
      email: erase(access.email),
    })),
    participations: body.participations.map((part) => ({
      ...part,
      titleSnapshot: erase(part.titleSnapshot),
      organizationSnapshot: erase(part.organizationSnapshot),
    })),
  };
  return { count, body: next };
}

function eraseCommunicationBody(body: CommunicationPlanBody): {
  body: CommunicationPlanBody;
  count: number;
} {
  let count = 0;
  const erase = (value: string | null | undefined) => {
    if (value && value !== REDACTED) count += 1;
    return REDACTED;
  };
  const next: CommunicationPlanBody = {
    ...body,
    redacted: true,
    subject: erase(body.subject),
    bodyText: erase(body.bodyText),
    bodyHtml: erase(body.bodyHtml),
    recipientGroups: body.recipientGroups.map((group) => ({
      ...group,
      recipients: group.recipients.map((recipient) => ({
        ...recipient,
        address: erase(recipient.address),
        name: erase(recipient.name),
        inclusionReason: "Personal payload erased for privacy.",
        priorCommunications: recipient.priorCommunications.map((prior) => ({
          ...prior,
          toEmail: erase(prior.toEmail),
          subject: erase(prior.subject),
        })),
      })),
    })),
    drafts: body.drafts.map((draft) => ({
      ...draft,
      toEmail: erase(draft.toEmail),
      recipientName: erase(draft.recipientName),
      subject: erase(draft.subject),
      bodyText: erase(draft.bodyText),
      bodyHtml: erase(draft.bodyHtml),
      calendarIntent: draft.calendarIntent
        ? {
            ...draft.calendarIntent,
            ics: draft.calendarIntent.ics ? erase(draft.calendarIntent.ics) : null,
          }
        : null,
    })),
    effects: body.effects.map((effect) => ({
      ...effect,
      toEmail: erase(effect.toEmail),
      lastError: effect.lastError ? erase(effect.lastError) : null,
    })),
  };
  return { count, body: next };
}

function erasePublicationBody(body: PublicationPlanBody): {
  body: PublicationPlanBody;
  count: number;
} {
  let count = 0;
  const erase = (value: string) => {
    if (value && value !== REDACTED) count += 1;
    return REDACTED;
  };
  const next: PublicationPlanBody = {
    ...body,
    calendarConsequences: body.calendarConsequences.map((op) => ({
      ...op,
      recipients: op.recipients.map((recipient) => ({
        ...recipient,
        email: erase(recipient.email),
        name: erase(recipient.name),
      })),
    })),
  };
  return { count, body: next };
}

/**
 * Redact personal plan/message payloads while preserving stable operational
 * references, authorization, outcome, and compensation history.
 */
export function erasePersonalPlanPayloads(body: CourseCheckPlanBody): {
  body: CourseCheckPlanBody;
  fieldsRedacted: number;
} {
  if (body.actionType === "decision") {
    const result = eraseDecisionBody(body);
    return { body: result.body, fieldsRedacted: result.count };
  }
  if (body.actionType === "guaranteed_speaker") {
    const result = eraseGuaranteedBody(body);
    return { body: result.body, fieldsRedacted: result.count };
  }
  if (body.actionType === "communication") {
    const result = eraseCommunicationBody(body);
    return { body: result.body, fieldsRedacted: result.count };
  }
  const result = erasePublicationBody(body);
  return { body: result.body, fieldsRedacted: result.count };
}
