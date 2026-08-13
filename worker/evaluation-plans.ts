import { isUploadedAssetAnswer } from "../shared/cfp-definition";

import type {
  EvaluationAnonymization,
  EvaluationScorecard,
  EvaluationRound,
  EvaluationRoundAccess,
  EvaluationRoundAccessReason,
  EvaluationRoundState,
  OrganizerProposal,
  SubmissionAnswers,
} from "../shared/events";

export interface EvaluationRoundWriteInput {
  id?: string;
  name: string;
  order?: number;
  state?: EvaluationRoundState;
  startsOn: string;
  endsOn: string;
  scorecardRef: string;
  scorecard?: EvaluationScorecard;
  reviewerPool: string[];
  anonymization?: EvaluationAnonymization;
  anonymized?: boolean;
}

/** Accept the stable API shape plus the short aliases used by older clients. */
export function readEvaluationRoundInput(
  value: unknown,
  existing?: EvaluationRound,
): EvaluationRoundWriteInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Evaluation round must be an object.");
  }
  const body = value as Record<string, unknown>;
  const stringValue = (key: string, fallback = ""): string =>
    typeof body[key] === "string" ? body[key] as string : fallback;
  const reviewerPoolValue = body.reviewerPool ?? body.reviewerIds;
  const reviewerPool = Array.isArray(reviewerPoolValue)
    ? reviewerPoolValue.filter((id): id is string => typeof id === "string")
    : (existing?.reviewerPool ?? []);
  const anonymizationValue = body.anonymization;
  const anonymization: EvaluationAnonymization =
    anonymizationValue === "blind" || body.anonymized === true
      ? "blind"
      : anonymizationValue === "none" || body.anonymized === false
        ? "none"
        : (existing?.anonymization ?? "none");
  const state =
    body.state === "draft" || body.state === "open" || body.state === "closed"
      ? body.state
      : existing?.state;

  return {
    id: stringValue("id", existing?.id),
    name: stringValue("name", existing?.name),
    order:
      typeof body.order === "number" && Number.isInteger(body.order)
        ? body.order
        : existing?.order,
    state,
    startsOn: stringValue("startsOn", existing?.startsOn),
    endsOn: stringValue("endsOn", existing?.endsOn),
    scorecardRef: stringValue("scorecardRef", existing?.scorecardRef),
    scorecard:
      body.scorecard && typeof body.scorecard === "object" && !Array.isArray(body.scorecard)
        ? (body.scorecard as EvaluationScorecard)
        : existing?.scorecard,
    reviewerPool: [...new Set(reviewerPool.map((id) => id.trim()).filter(Boolean))],
    anonymization,
    anonymized: anonymization === "blind",
  };
}

export function evaluationRoundAccessError(access: EvaluationRoundAccess): {
  status: 403 | 404;
  body: { error: string; code: EvaluationRoundAccessReason };
} {
  if (access.reason === "round_not_found" || access.reason === "plan_disabled") {
    return {
      status: 404,
      body: { error: "Evaluation round not found.", code: access.reason },
    };
  }
  const message =
    access.reason === "reviewer_not_assigned"
      ? "You are not assigned to this evaluation round."
      : access.reason === "round_not_open"
        ? "This evaluation round is not open."
        : "This evaluation round is outside its review window.";
  return { status: 403, body: { error: message, code: access.reason } };
}

function anonymizeAnswers(value: SubmissionAnswers): SubmissionAnswers {
  const result: SubmissionAnswers = {};
  for (const [key, child] of Object.entries(value)) {
    if (/email|biograph|speaker|author|headshot|attachment|file/i.test(key)) continue;
    if (isUploadedAssetAnswer(child)) continue;
    if (Array.isArray(child)) {
      const safeItems = child
        .filter((item) => !isUploadedAssetAnswer(item))
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? anonymizeAnswers(item as SubmissionAnswers)
            : item,
        ) as SubmissionAnswers[string];
      result[key] = safeItems;
    } else if (child && typeof child === "object") {
      result[key] = anonymizeAnswers(child as SubmissionAnswers);
    } else {
      result[key] = child;
    }
  }
  return result;
}

/** Strip submitter identity from reviewer-facing advanced-round projections. */
export function anonymizeEvaluationProposal(
  proposal: OrganizerProposal,
): OrganizerProposal {
  return {
    ...proposal,
    speakerName: "Anonymous submission",
    speakerEmail: "",
    biography: "",
    coSpeakers: [],
    answers: anonymizeAnswers(proposal.answers),
    supportingFile: null,
    privateNote: "",
    reviewerRecusals: [],
  };
}
