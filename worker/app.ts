import { Hono, type Context } from "hono";

import {
  canonicalizeCfpDefinition,
  createDefaultCfpDefinition,
  type CfpDefinitionV1,
} from "../shared/cfp-definition";
import { cfpLifecycleError } from "../shared/cfp-lifecycle";
import type {
  CfpPublicLifecycle,
  EventRecord,
  OnboardingFileConstraints,
  EvaluationPlan,
  EvaluationRoundAssignment,
  EvaluationPlanAuditEvent,
  EvaluationRound,
  OnboardingReminderAutomationPolicy,
  OnboardingCompletionRequirement,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerPrincipal,
  OrganizerProposal,
  OrganizerTeamMember,
  OrganizerActivityByActorResponse,
  ProposalAuditEvent,
  ProposalReviewerRecusal,
  ProposalStatus,
  ScorecardCriterionValue,
  ReviewCriterionResult,
  ReviewEvidence,
  ReviewProgressReminderDraft,
  ReviewProgressReminderPreview,
  ReviewProgressReminderResult,
  OutboxMessage,
  ReviewProgressReminderSendResult,
  ReviewProgressResponse,
  ReviewProgressReviewer,
  ReviewReminderDeliveryState,
  ReviewReminderHistoryEntry,
  ReviewResultsResponse,
  PublicEmbedConfigInput,
  PublishedCfpForm,
  ReviewerAssignment,
  ReviewerInvitationPreview,
  SessionPlacementPatch,
  SpeakerDirectoryCreateInput,
  SpeakerCsvColumnMapping,
  SpeakerCsvResolution,
  SubmitterDashboardResponse,
} from "../shared/events";
import {
  fileExtension,
  isPreviewableOnboardingMime,
} from "../shared/onboarding-tasks";
import { parseCourseCheckUxEvent } from "../shared/course-check-ux";
import { COURSE_CHECK_VALIDATION_SCENARIOS } from "../shared/course-check-validation";
import {
  parseSpeakerCsv,
  SpeakerCsvParseError,
} from "../shared/speaker-csv";
import {
  authStatusFromEnv,
  createAuth,
  emptyPrincipalForUser,
  resolveProductionAuthenticatedUser,
  resolveProductionPrincipal,
  type AuthenticatedUser,
} from "./auth";
import {
  createResendSender,
  renderSubmissionConfirmationEmail,
  type CommunicationEmailSender,
  type EmailSender,
} from "./email";
import { flushCommunicationEffects } from "./course-check/communication-delivery";
import { deliverOutboxMessage } from "./outbox";
import {
  collectAssetClaims,
  resolveFileQuestion,
  validateAndNormalizeSubmission,
} from "./cfp-submissions";
import { toPublicProposal, toSubmitterProposal } from "./proposals";
import type {
  AssetUploadStartRequest,
  FilesLibraryExportRequest,
  SubmissionAnswers,
} from "../shared/events";
import {
  ASSET_PURGE_AFTER_MS,
  DraftConflictError,
  EventConfigurationError,
  HEADSHOT_MAX_BYTES,
  HEADSHOT_MIME_TYPES,
  TASK_FILE_MAX_BYTES,
  draftAssetOwnerId,
} from "./event-store";
import {
  enrichPrincipalMemberships,
  findKnownEvent,
  listEventWorkspaces,
  loadEventWorkspace,
  rememberEvent,
} from "./event-catalog";
import { validateEventIdentity } from "./event-store";
import {
  createTokenId,
  signEditToken,
  signPortalToken,
  verifyEditToken,
  verifyPortalToken,
  type SignedEditTokenPayload,
  type SignedPortalTokenPayload,
} from "./signed-links";
import type { AppBindings } from "./types";
import { AIRTABLE_HEALTH_GUIDANCE } from "../shared/airtable";
import {
  assignedTrackIds,
  canAccessEvent,
  canReviewProposal,
  eventRole,
  isEventAdmin,
  scopeEventForPrincipal,
} from "./authz";
import {
  authorizeCourseCheck,
  capabilityForStage,
  isAgentPrincipal,
  parseInitiatingHumanHeader,
  toCourseCheckActor,
} from "./course-check/agent-authz";
import {
  assertPolicyDoesNotWeakenBaseline,
  formatCourseCheckActorLabel,
  mergeCourseCheckPolicy,
  type EventCourseCheckPolicy,
} from "../shared/course-check";
import {
  createApiKey,
  extractBearerToken,
  parseApiKeyGrantBody,
  resolvePrincipalFromApiKey,
  updateApiKeyGrant,
} from "./api-keys";
import { createV1App, type V1AppOptions } from "./api/v1";
import {
  defaultAirtableClientFactory,
  pullAirtableForEvent,
  resolveAirtableConnection,
  type AirtableClientFactory,
  type AirtableCredentialClientFactory,
} from "./airtable/sync";
import {
  executeAirtableEffects,
  reconcileUnknownAirtableEffects,
} from "./airtable/effects";
import { handleMcpRequest } from "./mcp";
import {
  REVIEWER_INVITATION_TTL_MS,
  createInvitationToken,
  effectiveInvitationStatus,
  escapeEmailHtml,
  getReviewerInvitationById,
  getReviewerInvitationByToken,
  insertReviewerInvitation,
  listReviewerInvitations,
  maskEmail,
  projectReviewerInvitation,
  revokeReviewerInvitation,
} from "./reviewer-invitations";
import {
  anonymizeEvaluationProposal,
  evaluationRoundAccessError,
  readEvaluationRoundInput,
} from "./evaluation-plans";


const MAX_PROPOSAL_BODY_BYTES = 64 * 1_024;
const EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const PORTAL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const DEFAULT_FILE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILE_NAME_LENGTH = 120;
const INVALID_EDIT_LINK_ERROR = {
  error: "This edit link is invalid or has expired.",
} as const;
const INVALID_PORTAL_LINK_ERROR = {
  error: "This portal link is invalid or has expired.",
} as const;

function deriveEventTrackChoices(
  definition: CfpDefinitionV1,
  tracks: EventRecord["tracks"],
): CfpDefinitionV1 {
  const trackQuestion = definition.runtime.survey.elements.find(
    (element) => element.name === definition.chartstead.trackQuestionName,
  );
  if (trackQuestion?.type === "dropdown") {
    trackQuestion.choices = tracks.map((track) => ({
      value: track.id,
      text: track.name,
    }));
  }
  return definition;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

class ReviewCriteriaInputError extends Error {}

function normalizeReviewCriterionScores(value: unknown): ReviewCriterionResult[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ReviewCriteriaInputError("Review criteria must be an array.");
  }
  return value.map((entry, index) => {
    const record =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
    if (!record) {
      throw new ReviewCriteriaInputError(`Criterion ${index + 1} must be an object.`);
    }
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : typeof record.criterionId === "string" && record.criterionId.trim()
          ? record.criterionId.trim()
          : "";
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : id;
    const valueNumber = Number(record.value);
    const maxScoreNumber = Number(record.maxScore ?? record.max ?? 5);
    const weightNumber = Number(record.weight ?? 1);
    if (!id || id.length > 80) {
      throw new ReviewCriteriaInputError("Each criterion needs a stable id up to 80 characters.");
    }
    if (!Number.isFinite(valueNumber) || valueNumber < 0) {
      throw new ReviewCriteriaInputError(`Criterion ${id} needs a non-negative numeric value.`);
    }
    if (!Number.isFinite(maxScoreNumber) || maxScoreNumber <= 0) {
      throw new ReviewCriteriaInputError(`Criterion ${id} needs a positive maxScore.`);
    }
    if (valueNumber > maxScoreNumber) {
      throw new ReviewCriteriaInputError(`Criterion ${id} value cannot exceed maxScore.`);
    }
    if (!Number.isFinite(weightNumber) || weightNumber < 0) {
      throw new ReviewCriteriaInputError(`Criterion ${id} needs a non-negative weight.`);
    }
    return {
      id,
      label,
      value: valueNumber,
      maxScore: maxScoreNumber,
      weight: weightNumber,
      weightedScore: valueNumber * weightNumber,
    };
  });
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reviewResultsCsv(results: ReviewResultsResponse): string {
  const criterionHeaders = results.criteria.map((criterion) => `criterion:${criterion.id}`);
  const headers = [
    "proposal_id",
    "title",
    "track_id",
    "track_name",
    "submitted_at",
    "speakers",
    "speaker_emails",
    "review_completion",
    "completed_reviews",
    "total_reviews",
    "recommendation",
    "aggregate_score",
    "reviewers",
    ...criterionHeaders,
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const submission of results.submissions) {
    const criterionValues = results.criteria.map((criterion) => {
      const match = submission.criteria.find((candidate) => candidate.id === criterion.id);
      return match ? match.value : "";
    });
    lines.push(
      [
        submission.proposalId,
        submission.title,
        submission.trackId,
        submission.trackName,
        submission.submittedAt,
        submission.speakers
          .map((speaker) => `${speaker.name} (${speaker.role})`)
          .join("; "),
        submission.speakers.map((speaker) => speaker.email).join("; "),
        submission.completionStatus,
        submission.completedReviewCount,
        submission.totalReviewCount,
        submission.recommendation,
        submission.aggregateScore ?? "",
        submission.reviews
          .map(
            (review) =>
              `${review.reviewerName}:${review.completionStatus}:${review.recommendation}`,
          )
          .join("; "),
        ...criterionValues,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean))]
    : [];
}

function percentComplete(completed: number, assigned: number, recused = 0): number {
  const actionable = Math.max(0, assigned - recused);
  if (actionable === 0) return 100;
  return Math.round((completed / actionable) * 100);
}

function reviewReminderStatus(message: OutboxMessage | null): ReviewReminderDeliveryState {
  if (!message) return "failed";
  if (message.status === "sent") return "sent";
  if (message.status === "failed") {
    return message.nextAttemptAt ? "retryable" : "failed";
  }
  return "queued";
}

function safeIdSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return safe.slice(0, 96) || crypto.randomUUID();
}

function reviewerReminderHistoryFromAudit(
  auditEvents: EvaluationPlanAuditEvent[],
  roundId: string | null,
): ReviewReminderHistoryEntry[] {
  return auditEvents
    .filter(
      (event) =>
        event.action.startsWith("review_reminder.") &&
        (roundId === undefined || (event.roundId ?? null) === roundId),
    )
    .map((event): ReviewReminderHistoryEntry => {
      const detail = event.detail;
      const status =
        detail.status === "sent" ||
        detail.status === "queued" ||
        detail.status === "failed" ||
        detail.status === "retryable"
          ? detail.status
          : "queued";
      return {
        id: event.id,
        roundId: event.roundId ?? null,
        reviewerId: typeof detail.reviewerId === "string" ? detail.reviewerId : "",
        reviewerName:
          typeof detail.reviewerName === "string" ? detail.reviewerName : "Reviewer",
        toEmail: typeof detail.toEmail === "string" ? detail.toEmail : "",
        pendingCount:
          typeof detail.pendingCount === "number" && Number.isFinite(detail.pendingCount)
            ? detail.pendingCount
            : 0,
        outboxId: typeof detail.outboxId === "string" ? detail.outboxId : null,
        status,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    });
}

function chooseReviewProgressRound(
  event: EventRecord,
  plan: EvaluationPlan | null,
  requestedRoundId: string | null,
  nowIso: string,
): {
  round: EvaluationRound | null;
  id: string | null;
  name: string;
  state: EvaluationRound["state"] | "shared";
  startsOn: string | null;
  endsOn: string | null;
} {
  if (!plan?.enabled) {
    return {
      round: null,
      id: null,
      name: "Shared track queue",
      state: "shared",
      startsOn: null,
      endsOn: event.endsOn,
    };
  }
  const today = nowIso.slice(0, 10);
  const round =
    (requestedRoundId
      ? plan.rounds.find((candidate) => candidate.id === requestedRoundId)
      : plan.rounds.find(
          (candidate) =>
            candidate.state === "open" &&
            candidate.startsOn <= today &&
            today <= candidate.endsOn,
        ) ??
        plan.rounds.find((candidate) => candidate.state === "open") ??
        plan.rounds[0]) ?? null;
  if (!round) {
    return {
      round: null,
      id: null,
      name: "Shared track queue",
      state: "shared",
      startsOn: null,
      endsOn: event.endsOn,
    };
  }
  return {
    round,
    id: round.id,
    name: round.name,
    state: round.state,
    startsOn: round.startsOn,
    endsOn: round.endsOn,
  };
}

async function loadReviewerAssignments(
  db: D1Database,
  eventId: string,
): Promise<ReviewerAssignment[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, r.track_id
       FROM event_memberships AS m
       JOIN "user" AS u ON u.id = m.user_id
       LEFT JOIN reviewer_track_assignments AS r
         ON r.event_id = m.event_id AND r.user_id = m.user_id
       WHERE m.event_id = ? AND m.role = 'reviewer'
       ORDER BY u.name COLLATE NOCASE, u.id, r.track_id`,
    )
    .bind(eventId)
    .all<{ id: string; name: string; email: string; track_id: string | null }>();
  const reviewers = new Map<string, ReviewerAssignment>();
  for (const row of rows.results) {
    const reviewer = reviewers.get(row.id) ?? {
      id: row.id,
      name: row.name,
      email: row.email,
      trackIds: [],
    };
    if (row.track_id) reviewer.trackIds.push(row.track_id);
    reviewers.set(row.id, reviewer);
  }
  return [...reviewers.values()];
}

type ReviewProgressProposalListInput = {
  sort?: "oldest";
  trackIds?: string[];
};

type ReviewProgressStore = {
  getEvaluationPlan(): Promise<EvaluationPlan | null> | EvaluationPlan | null;
  listProposals(input?: ReviewProgressProposalListInput):
    | Promise<OrganizerProposal[]>
    | OrganizerProposal[];
  listEvaluationRoundAssignments(
    roundId: string,
  ): Promise<EvaluationRoundAssignment[]> | EvaluationRoundAssignment[];
  listReviewEvidenceForRound(roundId: string | null):
    | Promise<ReviewEvidence[]>
    | ReviewEvidence[];
  listReviewRecusalsForRound(roundId: string):
    | Promise<ProposalReviewerRecusal[]>
    | ProposalReviewerRecusal[];
  listEvaluationPlanAuditEvents():
    | Promise<EvaluationPlanAuditEvent[]>
    | EvaluationPlanAuditEvent[];
};

async function buildReviewProgress(input: {
  event: EventRecord;
  store: ReviewProgressStore;
  reviewers: ReviewerAssignment[];
  requestedRoundId?: string | null;
  nowIso?: string;
}): Promise<ReviewProgressResponse> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const plan = await input.store.getEvaluationPlan();
  const selectedRound = chooseReviewProgressRound(
    input.event,
    plan,
    input.requestedRoundId ?? null,
    nowIso,
  );
  const roundId = selectedRound.id;
  const allReviewers =
    selectedRound.round && selectedRound.round.reviewerPool.length > 0
      ? selectedRound.round.reviewerPool.map((reviewerId) => {
          const known = input.reviewers.find((reviewer) => reviewer.id === reviewerId);
          return known ?? { id: reviewerId, name: reviewerId, email: "", trackIds: [] };
        })
      : input.reviewers;
  const proposals = await input.store.listProposals({ sort: "oldest" });
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const exactAssignments = roundId
    ? await input.store.listEvaluationRoundAssignments(roundId)
    : [];
  const assignmentsByReviewer = new Map<string, Set<string>>();
  if (exactAssignments.length > 0) {
    for (const assignment of exactAssignments) {
      const set = assignmentsByReviewer.get(assignment.reviewerId) ?? new Set<string>();
      set.add(assignment.proposalId);
      assignmentsByReviewer.set(assignment.reviewerId, set);
    }
  } else {
    for (const reviewer of allReviewers) {
      const trackSet = new Set(reviewer.trackIds);
      assignmentsByReviewer.set(
        reviewer.id,
        new Set(
          proposals
            .filter((proposal) => trackSet.has(proposal.trackId))
            .map((proposal) => proposal.id),
        ),
      );
    }
  }
  const evidence = await input.store.listReviewEvidenceForRound(roundId);
  const evidenceByReviewerProposal = new Map(
    evidence.map((review) => [`${review.reviewerId}\u0000${review.proposalId}`, review]),
  );
  const recusalRows = roundId ? await input.store.listReviewRecusalsForRound(roundId) : [];
  const recusals = new Set(
    recusalRows.map((recusal) => `${recusal.reviewerId}\u0000${recusal.proposalId}`),
  );
  const history = reviewerReminderHistoryFromAudit(
    await input.store.listEvaluationPlanAuditEvents(),
    roundId,
  );
  const lastReminderByReviewer = new Map<string, string>();
  for (const entry of history) {
    const current = lastReminderByReviewer.get(entry.reviewerId);
    if (!current || entry.createdAt > current) {
      lastReminderByReviewer.set(entry.reviewerId, entry.createdAt);
    }
  }
  const today = nowIso.slice(0, 10);
  const reviewers = allReviewers.map((reviewer): ReviewProgressReviewer => {
    const assignedIds = [...(assignmentsByReviewer.get(reviewer.id) ?? new Set<string>())]
      .filter((proposalId) => proposalsById.has(proposalId))
      .sort((left, right) => {
        const leftProposal = proposalsById.get(left)!;
        const rightProposal = proposalsById.get(right)!;
        return (
          leftProposal.trackName.localeCompare(rightProposal.trackName) ||
          leftProposal.title.localeCompare(rightProposal.title) ||
          left.localeCompare(right)
        );
      });
    let completedCount = 0;
    let recusedCount = 0;
    let lastCompletedAt: string | null = null;
    const outstandingAssignments = [];
    for (const proposalId of assignedIds) {
      const key = `${reviewer.id}\u0000${proposalId}`;
      const review = evidenceByReviewerProposal.get(key);
      const recused = recusals.has(key);
      if (recused) {
        recusedCount += 1;
        continue;
      }
      if (review?.completionStatus === "complete") {
        completedCount += 1;
        if (review.completedAt && (!lastCompletedAt || review.completedAt > lastCompletedAt)) {
          lastCompletedAt = review.completedAt;
        }
        continue;
      }
      const proposal = proposalsById.get(proposalId)!;
      outstandingAssignments.push({
        proposalId,
        title: proposal.title,
        trackId: proposal.trackId,
        trackName: proposal.trackName,
      });
    }
    const assignedCount = assignedIds.length;
    const outstandingCount = outstandingAssignments.length;
    return {
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      email: reviewer.email,
      trackIds: reviewer.trackIds,
      assignedCount,
      completedCount,
      outstandingCount,
      recusedCount,
      percentComplete: percentComplete(completedCount, assignedCount, recusedCount),
      overdue: Boolean(selectedRound.endsOn && selectedRound.endsOn < today && outstandingCount > 0),
      lastCompletedAt,
      lastReminderAt: lastReminderByReviewer.get(reviewer.id) ?? null,
      outstandingAssignments,
    };
  });
  const assignedCount = reviewers.reduce((sum, reviewer) => sum + reviewer.assignedCount, 0);
  const completedCount = reviewers.reduce((sum, reviewer) => sum + reviewer.completedCount, 0);
  const outstandingCount = reviewers.reduce((sum, reviewer) => sum + reviewer.outstandingCount, 0);
  const recusedCount = reviewers.reduce((sum, reviewer) => sum + reviewer.recusedCount, 0);
  const incompleteReviewers = reviewers.filter((reviewer) => reviewer.outstandingCount > 0);
  const overdueReviewers = incompleteReviewers.filter((reviewer) => reviewer.overdue);
  return {
    eventId: input.event.id,
    generatedAt: nowIso,
    round: {
      roundId,
      roundName: selectedRound.name,
      roundState: selectedRound.state,
      startsOn: selectedRound.startsOn,
      endsOn: selectedRound.endsOn,
      assignedCount,
      completedCount,
      outstandingCount,
      recusedCount,
      percentComplete: percentComplete(completedCount, assignedCount, recusedCount),
      overdueReviewerCount: overdueReviewers.length,
    },
    reviewers,
    incompleteReviewers,
    overdueReviewers,
    history,
  };
}

function defaultReviewReminderDraft(input: {
  event: EventRecord;
  round: ReviewProgressResponse["round"];
  reviewer: ReviewProgressReviewer;
}): ReviewProgressReminderDraft {
  const due = input.round.endsOn ? ` by ${input.round.endsOn}` : "";
  const pendingLines = input.reviewer.outstandingAssignments
    .map((assignment) => `- ${assignment.title} (${assignment.proposalId}, ${assignment.trackName})`)
    .join("\n");
  return {
    reviewerId: input.reviewer.reviewerId,
    reviewerName: input.reviewer.reviewerName,
    toEmail: input.reviewer.email,
    subject: `Reminder: ${input.reviewer.outstandingCount} ${input.event.name} review${input.reviewer.outstandingCount === 1 ? "" : "s"} due`,
    bodyText: `Hi ${input.reviewer.reviewerName},\n\nYou have ${input.reviewer.outstandingCount} outstanding ${input.round.roundName} review${input.reviewer.outstandingCount === 1 ? "" : "s"} for ${input.event.name}${due}.\n\n${pendingLines}\n\nPlease complete only the assignments shown in your review queue. Thanks.`,
    pendingCount: input.reviewer.outstandingCount,
    pendingProposalIds: input.reviewer.outstandingAssignments.map((assignment) => assignment.proposalId),
  };
}

function isDraftConflict(error: unknown): boolean {
  if (error instanceof DraftConflictError) return true;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "draft_conflict"
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    error.message.includes("Draft changed since you last loaded it")
  );
}

async function purgeStaleAssets(
  store: {
    listPurgeableAssets(
      olderThanIso: string,
      limit?: number,
    ): Promise<Array<{ asset_id: string; object_key: string }>> | Array<{
      asset_id: string;
      object_key: string;
    }>;
    deleteAssetRecord(
      assetId: string,
    ): Promise<unknown> | unknown;
  },
  bucket: R2Bucket | undefined,
  now = Date.now(),
): Promise<void> {
  if (!bucket) return;
  const olderThan = new Date(now - ASSET_PURGE_AFTER_MS).toISOString();
  const purgeable = await store.listPurgeableAssets(olderThan, 25);
  for (const asset of purgeable) {
    try {
      await bucket.delete(asset.object_key);
    } catch {
      // best-effort R2 delete; still drop the DB row so we do not retry forever
    }
    await store.deleteAssetRecord(asset.asset_id);
  }
}

/** Basename-only safe key segment; never trust client fileName for path structure. */
export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const stripped = base.replace(/\0/g, "").replace(/\.\./g, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const cleaned = safe.slice(0, MAX_UPLOAD_FILE_NAME_LENGTH).replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned : "file";
}

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
  modifiedAt: string;
};

const ZIP_CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < ZIP_CRC_TABLE.length; i += 1) {
  let c = i;
  for (let bit = 0; bit < 8; bit += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  ZIP_CRC_TABLE[i] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeParts(iso: string): { time: number; date: number } {
  const parsed = new Date(iso);
  const date = Number.isNaN(parsed.getTime()) ? new Date("1980-01-01T00:00:00Z") : parsed;
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function buildStoredZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => ({
    ...entry,
    pathBytes: encoder.encode(entry.path),
    crc: crc32(entry.bytes),
    dos: dosTimeParts(entry.modifiedAt),
  }));
  const localSize = prepared.reduce(
    (total, entry) => total + 30 + entry.pathBytes.byteLength + entry.bytes.byteLength,
    0,
  );
  const centralSize = prepared.reduce(
    (total, entry) => total + 46 + entry.pathBytes.byteLength,
    0,
  );
  const zip = new Uint8Array(localSize + centralSize + 22);
  let offset = 0;
  const centralRecords: Array<{ entry: (typeof prepared)[number]; localOffset: number }> = [];
  for (const entry of prepared) {
    const localOffset = offset;
    writeUint32(zip, offset, 0x04034b50);
    writeUint16(zip, offset + 4, 20);
    writeUint16(zip, offset + 6, 0x0800);
    writeUint16(zip, offset + 8, 0);
    writeUint16(zip, offset + 10, entry.dos.time);
    writeUint16(zip, offset + 12, entry.dos.date);
    writeUint32(zip, offset + 14, entry.crc);
    writeUint32(zip, offset + 18, entry.bytes.byteLength);
    writeUint32(zip, offset + 22, entry.bytes.byteLength);
    writeUint16(zip, offset + 26, entry.pathBytes.byteLength);
    writeUint16(zip, offset + 28, 0);
    offset += 30;
    zip.set(entry.pathBytes, offset);
    offset += entry.pathBytes.byteLength;
    zip.set(entry.bytes, offset);
    offset += entry.bytes.byteLength;
    centralRecords.push({ entry, localOffset });
  }
  const centralOffset = offset;
  for (const { entry, localOffset } of centralRecords) {
    writeUint32(zip, offset, 0x02014b50);
    writeUint16(zip, offset + 4, 20);
    writeUint16(zip, offset + 6, 20);
    writeUint16(zip, offset + 8, 0x0800);
    writeUint16(zip, offset + 10, 0);
    writeUint16(zip, offset + 12, entry.dos.time);
    writeUint16(zip, offset + 14, entry.dos.date);
    writeUint32(zip, offset + 16, entry.crc);
    writeUint32(zip, offset + 20, entry.bytes.byteLength);
    writeUint32(zip, offset + 24, entry.bytes.byteLength);
    writeUint16(zip, offset + 28, entry.pathBytes.byteLength);
    writeUint16(zip, offset + 30, 0);
    writeUint16(zip, offset + 32, 0);
    writeUint16(zip, offset + 34, 0);
    writeUint16(zip, offset + 36, 0);
    writeUint32(zip, offset + 38, 0);
    writeUint32(zip, offset + 42, localOffset);
    offset += 46;
    zip.set(entry.pathBytes, offset);
    offset += entry.pathBytes.byteLength;
  }
  writeUint32(zip, offset, 0x06054b50);
  writeUint16(zip, offset + 8, prepared.length);
  writeUint16(zip, offset + 10, prepared.length);
  writeUint32(zip, offset + 12, centralSize);
  writeUint32(zip, offset + 16, centralOffset);
  writeUint16(zip, offset + 20, 0);
  return zip;
}

function uniqueZipPath(path: string, used: Set<string>): string {
  const normalized = path
    .split("/")
    .map((segment) => sanitizeUploadFileName(segment).replace(/_+/g, "_"))
    .filter(Boolean)
    .join("/");
  const safe = normalized || "file";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const base = dot > safe.lastIndexOf("/") ? safe.slice(0, dot) : safe;
  const extension = dot > safe.lastIndexOf("/") ? safe.slice(dot) : "";
  let index = 2;
  while (used.has(`${base}-${index}${extension}`)) index += 1;
  const next = `${base}-${index}${extension}`;
  used.add(next);
  return next;
}

type EditTokenRow = {
  tokenId: string;
  proposalId: string;
  expiresAt: string;
  revokedAt: string | null;
};

type EditTokenLookup = {
  getEditToken: (tokenId: string) => Promise<EditTokenRow | null>;
};

type PortalTokenRow = {
  tokenId: string;
  speakerId: string;
  expiresAt: string;
  revokedAt: string | null;
};

type PortalTokenLookup = {
  getPortalToken: (tokenId: string) => Promise<PortalTokenRow | null>;
};

async function authorizeSubmitterEdit(input: {
  secret: string | null;
  token: string;
  eventId: string;
  expectedProposalId?: string;
  store: EditTokenLookup;
  nowMs?: number;
}): Promise<{ payload: SignedEditTokenPayload; tokenRow: EditTokenRow } | null> {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.secret || !input.token) return null;

  const payload = await verifyEditToken(input.secret, input.token, nowMs);
  if (!payload || payload.eventId !== input.eventId) return null;
  if (
    input.expectedProposalId !== undefined &&
    payload.proposalId !== input.expectedProposalId
  ) {
    return null;
  }

  const tokenRow = await input.store.getEditToken(payload.tokenId);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    tokenRow.proposalId !== payload.proposalId ||
    Date.parse(tokenRow.expiresAt) <= nowMs
  ) {
    return null;
  }

  return { payload, tokenRow };
}

async function authorizeSpeakerPortal(input: {
  secret: string | null;
  token: string;
  eventId: string;
  store: PortalTokenLookup;
  nowMs?: number;
}): Promise<{ payload: SignedPortalTokenPayload; tokenRow: PortalTokenRow } | null> {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.secret || !input.token) return null;

  const payload = await verifyPortalToken(input.secret, input.token, nowMs);
  if (!payload || payload.eventId !== input.eventId) return null;

  const tokenRow = await input.store.getPortalToken(payload.tokenId);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    tokenRow.speakerId !== payload.speakerId ||
    Date.parse(tokenRow.expiresAt) <= nowMs
  ) {
    return null;
  }

  return { payload, tokenRow };
}

async function readProposalBody(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();

      byteLength += value.byteLength;
      if (byteLength > MAX_PROPOSAL_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

type PrincipalResolver = (
  request: Request,
  env: AppBindings,
) => Promise<OrganizerPrincipal | null>;

type AuthenticatedUserResolver = (
  request: Request,
  env: AppBindings,
) => Promise<AuthenticatedUser | null>;

interface AppOptions {
  resolvePrincipal?: PrincipalResolver;
  resolveAuthenticatedUser?: AuthenticatedUserResolver;
  emailSender?: EmailSender | null;
  communicationEmailSender?: CommunicationEmailSender | null;
  signingSecret?: string;
  airtableClientFactory?: AirtableClientFactory;
  airtableCredentialClientFactory?: AirtableCredentialClientFactory;
  resolveApiKeyPrincipal?: V1AppOptions["resolveApiKeyPrincipal"];
  lifecycleNow?: () => Date;
}

async function loadEvent(
  env: AppBindings,
  seed: EventRecord,
): Promise<EventRecord> {
  const event = await loadEventWorkspace(env, seed.id);
  if (!event) {
    throw new Error(`Event ${seed.id} was not initialized.`);
  }
  return event;
}

async function submissionClientKey(request: Request): Promise<string> {
  const identity = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function findSeed(eventId: string): EventRecord | undefined {
  return findKnownEvent(eventId);
}

function eventTimezone(event: EventRecord): string {
  return event.timezone?.trim() || "UTC";
}

function lifecycleUnavailable(
  lifecycle: CfpPublicLifecycle,
  context: Record<string, unknown> = {},
) {
  return {
    error: cfpLifecycleError(lifecycle) ?? "This call for proposals is unavailable.",
    status: lifecycle.state,
    lifecycle,
    ...context,
  };
}

function draftTitleFromAnswers(
  form: PublishedCfpForm,
  answers: SubmissionAnswers,
): string {
  const raw = answers[form.definition.chartstead.proposalTitleName];
  return typeof raw === "string" ? raw.trim() : "";
}


function publicBaseUrl(request: Request, env: AppBindings): string {
  return env.BETTER_AUTH_URL || new URL(request.url).origin;
}

function signingSecret(env: AppBindings, override?: string): string | null {
  if (override !== undefined) {
    return override.length > 0 ? override : null;
  }
  return env.BETTER_AUTH_SECRET || null;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>();
  const baseResolvePrincipal =
    options.resolvePrincipal ?? resolveProductionPrincipal;
  const resolveAuthenticatedUser =
    options.resolveAuthenticatedUser ?? resolveProductionAuthenticatedUser;
  const airtableFactory =
    options.airtableClientFactory ?? defaultAirtableClientFactory;
  const airtableCredentialFactory = options.airtableCredentialClientFactory;
  const lifecycleNow = options.lifecycleNow ?? (() => new Date());

  /** Session, test hook, or bearer agent/human API key — same principal model. */
  const resolvePrincipal: PrincipalResolver = async (request, env) => {
    const bearer = extractBearerToken(request);
    if (bearer) {
      if (options.resolveApiKeyPrincipal) {
        return options.resolveApiKeyPrincipal(bearer, env);
      }
      if (env.AUTH_DB) {
        return resolvePrincipalFromApiKey(env.AUTH_DB, bearer);
      }
      return null;
    }
    return enrichPrincipalMemberships(
      env?.AUTH_DB,
      await baseResolvePrincipal(request, env),
    );
  };

  const hydrateEvent = async (
    c: { req: { param(name: string): string }; env: AppBindings },
    next: () => Promise<void>,
  ) => {
    await loadEventWorkspace(c.env, c.req.param("eventId"));
    await next();
  };
  app.use("/api/events/:eventId", hydrateEvent);
  app.use("/api/events/:eventId/*", hydrateEvent);

  // Course Check routes register on both the UI app and this v1 sub-app.
  const v1App = createV1App({
    resolvePrincipal: async (request, env) => {
      const bearer = extractBearerToken(request);
      if (bearer && env.AUTH_DB) return resolvePrincipalFromApiKey(env.AUTH_DB, bearer);
      return baseResolvePrincipal(request, env);
    },
    airtableClientFactory: airtableFactory,
    airtableCredentialClientFactory: airtableCredentialFactory,
    resolveApiKeyPrincipal: async (token, env) =>
      (options.resolveApiKeyPrincipal
        ? await options.resolveApiKeyPrincipal(token, env)
        : null) ??
      (env.AUTH_DB ? resolvePrincipalFromApiKey(env.AUTH_DB, token) : null),
  });
  const __courseCheckTargets: Array<{
    app: typeof app;
    base: string;
  }> = [
    { app, base: "/api/events/:eventId/course-checks" },
    { app: v1App, base: "/events/:eventId/course-checks" },
  ];

  function param(c: { req: { param(name: string): string | undefined } }, name: string): string {
    const value = c.req.param(name);
    if (!value) throw new Error(`Missing route param ${name}`);
    return value;
  }


  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/auth-status", (c) => c.json(authStatusFromEnv(c.env)));

  app.get("/api/reviewer-invitations/:token", async (c) => {
    const invitation = await getReviewerInvitationByToken(
      c.env.AUTH_DB,
      c.req.param("token"),
    );
    if (!invitation) {
      return c.json({ error: "Reviewer invitation not found" }, 404);
    }
    const seed = findSeed(invitation.eventId);
    if (!seed) return c.json({ error: "Reviewer invitation not found" }, 404);
    const tracks = invitation.trackIds.flatMap((trackId) => {
      const track = seed.tracks.find((candidate) => candidate.id === trackId);
      return track ? [{ id: track.id, name: track.name }] : [];
    });
    return c.json({
      invitation: {
        eventId: invitation.eventId,
        eventName: seed.name,
        emailHint: maskEmail(invitation.email),
        tracks,
        status: effectiveInvitationStatus(invitation),
      } satisfies ReviewerInvitationPreview,
    });
  });

  app.post("/api/reviewer-invitations/:token/accept", async (c) => {
    const invitation = await getReviewerInvitationByToken(
      c.env.AUTH_DB,
      c.req.param("token"),
    );
    if (!invitation) {
      return c.json({ error: "This reviewer invitation is unavailable." }, 404);
    }
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "Sign in to accept this invitation." }, 401);
    if (user.email.trim().toLowerCase() !== invitation.email) {
      return c.json(
        { error: "This invitation cannot be accepted by the signed-in account." },
        403,
      );
    }
    const status = effectiveInvitationStatus(invitation);
    if (status === "expired" || status === "revoked") {
      return c.json({ error: "This reviewer invitation is no longer available." }, 410);
    }
    if (status === "accepted") {
      if (invitation.acceptedByUserId !== user.id) {
        return c.json({ error: "This reviewer invitation is no longer available." }, 410);
      }
      return c.json({
        accepted: true,
        queuePath: `/e/${invitation.eventId}/submissions`,
        trackIds: invitation.trackIds,
      });
    }

    const membership = await c.env.AUTH_DB.prepare(
      `SELECT role FROM event_memberships
       WHERE event_id = ? AND user_id = ? LIMIT 1`,
    )
      .bind(invitation.eventId, user.id)
      .first<{ role: "admin" | "reviewer" }>();
    if (membership?.role === "admin") {
      return c.json(
        { error: "Event administrators already have access to every track." },
        409,
      );
    }

    const nowIso = new Date().toISOString();
    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role)
         SELECT ?, ?, 'reviewer'
         WHERE EXISTS (
           SELECT 1 FROM reviewer_invitations
           WHERE id = ? AND status = 'pending' AND expires_at > ?
         )
         ON CONFLICT(event_id, user_id) DO NOTHING`,
      ).bind(invitation.eventId, user.id, invitation.id, nowIso),
      c.env.AUTH_DB.prepare(
        `DELETE FROM reviewer_track_assignments
         WHERE event_id = ? AND user_id = ?
           AND EXISTS (
             SELECT 1 FROM reviewer_invitations
             WHERE id = ? AND status = 'pending' AND expires_at > ?
           )`,
      ).bind(invitation.eventId, user.id, invitation.id, nowIso),
      ...invitation.trackIds.map((trackId) =>
        c.env.AUTH_DB.prepare(
          `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
           SELECT ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM reviewer_invitations
             WHERE id = ? AND status = 'pending' AND expires_at > ?
           )
           ON CONFLICT(event_id, user_id, track_id) DO NOTHING`,
        ).bind(invitation.eventId, user.id, trackId, invitation.id, nowIso),
      ),
      c.env.AUTH_DB.prepare(
        `UPDATE reviewer_invitations
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending' AND expires_at > ?`,
      ).bind(user.id, nowIso, nowIso, invitation.id, nowIso),
    ]);
    const acceptedInvitation = await getReviewerInvitationById(
      c.env.AUTH_DB,
      invitation.eventId,
      invitation.id,
    );
    if (
      acceptedInvitation?.status !== "accepted" ||
      acceptedInvitation.acceptedByUserId !== user.id
    ) {
      return c.json({ error: "This reviewer invitation is no longer available." }, 410);
    }

    return c.json({
      accepted: true,
      queuePath: `/e/${invitation.eventId}/submissions`,
      trackIds: invitation.trackIds,
    });
  });

  app.all("/mcp", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || principal.principalKind !== "agent") {
      return new Response(JSON.stringify({ error: "Authorization required. Use Bearer with an agent API key." }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'Bearer realm="chartstead-mcp"',
        },
      });
    }
    const authorization = c.req.header("authorization") ?? "";
    const initiatingHuman = principal.initiatingHuman
      ? `${principal.initiatingHuman.id}|${principal.initiatingHuman.displayName}`
      : c.req.header("x-chartstead-initiating-human") ?? "";
    return handleMcpRequest({
      request: c.req.raw,
      principal,
      requestV1: async (path, init = {}) => v1App.request(
        new Request(`${new URL(c.req.url).origin}${path.startsWith("/") ? path : `/${path}`}`, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init.headers).entries()),
            authorization,
            ...(initiatingHuman ? { "x-chartstead-initiating-human": initiatingHuman } : {}),
          },
        }),
        undefined,
        c.env,
      ),
    });
  });

  app.all("/api/auth/*", async (c) => {
    const auth = createAuth(c.env);
    if (!auth) {
      return c.json(
        { error: "Authentication is not configured for this environment." },
        503,
      );
    }
    return auth.handler(c.req.raw);
  });

  app.post("/api/events", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal) return c.json({ error: "Unauthorized" }, 401);
    const canCreate =
      principal.role === "admin" ||
      Object.values(principal.rolesByEvent ?? {}).includes("admin");
    if (!canCreate) {
      return c.json({ error: "Administrator access required to create an event." }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "Event details are required." }, 400);
    const input = {
      id: typeof body.id === "string" ? body.id.trim() : "",
      name: typeof body.name === "string" ? body.name.trim() : "",
      startsOn: typeof body.startsOn === "string" ? body.startsOn : "",
      endsOn: typeof body.endsOn === "string" ? body.endsOn : "",
      timezone: typeof body.timezone === "string" ? body.timezone.trim() : "",
    };
    try {
      validateEventIdentity(input);
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }

    if (await loadEventWorkspace(c.env, input.id)) {
      return c.json(
        {
          error: `Event identifier “${input.id}” is already in use. Choose a different identifier.`,
        },
        409,
      );
    }

    const event: EventRecord = {
      ...input,
      submissionCount: 0,
      unreviewedCount: 0,
      tracks: [],
      rooms: [],
    };
    await c.env.AUTH_DB.prepare(
      `INSERT INTO event_memberships (event_id, user_id, role)
       VALUES (?, ?, 'admin')
       ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'admin'`,
    )
      .bind(event.id, principal.id)
      .run();
    try {
      const store = c.env.EVENT_STORE.getByName(event.id);
      await store.seedIfEmpty(event);
      const created = await store.getEvent();
      if (!created) throw new Error("Event workspace could not be initialized.");
      rememberEvent(created);
      return c.json({ event: created }, 201);
    } catch (error) {
      await c.env.AUTH_DB.prepare(
        `DELETE FROM event_memberships WHERE event_id = ? AND user_id = ?`,
      )
        .bind(event.id, principal.id)
        .run();
      throw error;
    }
  });

  app.get("/api/events", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal) {
      const user = await resolveAuthenticatedUser(c.req.raw, c.env);
      if (user) {
        return c.json({ events: [], principal: emptyPrincipalForUser(user) });
      }
      return c.json({ error: "Unauthorized" }, 401);
    }

    const visibleEvents = await listEventWorkspaces(c.env, principal);
    const events = await Promise.all(
      visibleEvents.map(async (event) =>
        scopeEventForPrincipal(c.env, await loadEvent(c.env, event), principal),
      ),
    );
    return c.json({ events, principal });
  });

  app.get("/api/events/:eventId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({
      event: await scopeEventForPrincipal(
        c.env,
        await loadEvent(c.env, seed),
        principal,
      ),
      principal,
    });
  });

  app.patch("/api/events/:eventId/configuration", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const event = await loadEventWorkspace(c.env, eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "Event configuration is required." }, 400);

    const tracks = Array.isArray(body.tracks)
      ? body.tracks.map((value) => {
          const track = value as Record<string, unknown>;
          return {
            id: typeof track.id === "string" ? track.id : "",
            name: typeof track.name === "string" ? track.name : "",
          };
        })
      : undefined;
    const rooms: Array<{
      id: string;
      name: string;
      readiness: "ready" | "pending";
    }> | undefined = Array.isArray(body.rooms)
      ? body.rooms.map((value) => {
          const room = value as Record<string, unknown>;
          return {
            id: typeof room.id === "string" ? room.id : "",
            name: typeof room.name === "string" ? room.name : "",
            readiness:
              room.readiness === "ready" || room.readiness === "pending"
                ? room.readiness
                : ("" as "ready"),
          };
        })
      : undefined;

    if (tracks) {
      const removedIds = event.tracks
        .filter((track) => !tracks.some((candidate) => candidate.id === track.id))
        .map((track) => track.id);
      if (removedIds.length > 0) {
        const assignment = await c.env.AUTH_DB.prepare(
          `SELECT track_id FROM reviewer_track_assignments
           WHERE event_id = ? AND track_id IN (${removedIds.map(() => "?").join(", ")})
           LIMIT 1`,
        )
          .bind(eventId, ...removedIds)
          .first<{ track_id: string }>();
        if (assignment) {
          const track = event.tracks.find((candidate) => candidate.id === assignment.track_id);
          return c.json(
            {
              error: `Track “${track?.name ?? assignment.track_id}” is assigned to a reviewer. Remove that assignment before removing the track.`,
            },
            409,
          );
        }
      }
    }

    try {
      const updated = await c.env.EVENT_STORE.getByName(eventId).updateEventConfiguration({
        name: typeof body.name === "string" ? body.name : undefined,
        startsOn: typeof body.startsOn === "string" ? body.startsOn : undefined,
        endsOn: typeof body.endsOn === "string" ? body.endsOn : undefined,
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
        tracks,
        rooms,
      });
      rememberEvent(updated);
      return c.json({ event: updated });
    } catch (error) {
      if (
        error instanceof EventConfigurationError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          (error.code === "invalid_configuration" || error.code === "resource_in_use"))
      ) {
        const code = (error as { code: "invalid_configuration" | "resource_in_use" }).code;
        return c.json(
          { error: errorMessage(error), code },
          code === "resource_in_use" ? 409 : 400,
        );
      }
      throw error;
    }
  });

  app.get("/api/events/:eventId/cfp", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(event.id);
    const formId = c.req.query("formId") ?? undefined;
    const publicEvent = {
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      timezone: eventTimezone(event),
      themeAccent: event.themeAccent,
    };
    let selectedFormId = formId;
    if (!selectedFormId) {
      const forms = (await store.listForms()) as OrganizerCfpFormSummary[];
      selectedFormId =
        forms.find((form) => form.id === "main-cfp" && form.publishedVersion != null)?.id ??
        forms.find((form) => form.publishedVersion != null)?.id;
    }
    const form = selectedFormId
      ? ((await store.getPublishedForm(selectedFormId)) as PublishedCfpForm | null)
      : null;
    if (!form) {
      return c.json({ error: "Published CFP not found" }, 404);
    }
    const lifecycle = await store.getFormLifecycle(
      form.id,
      eventTimezone(event),
      lifecycleNow().toISOString(),
    );
    if (!lifecycle) return c.json({ error: "Published CFP not found" }, 404);
    if (lifecycle.state !== "open") {
      return c.json(
        lifecycleUnavailable(lifecycle, {
          event: publicEvent,
          formId: form.id,
          formName: form.name,
          publishedVersion: form.definitionVersion,
        }),
        lifecycle.state === "scheduled" ? 425 : 410,
      );
    }
    return c.json({
      event: publicEvent,
      form,
      lifecycle,
    });
  });

  app.get("/api/events/:eventId/forms", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    return c.json({ forms: await store.listForms() });
  });

  app.post("/api/events/:eventId/forms", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Untitled CFP";
    const draft = createDefaultCfpDefinition({
      definitionId: "pending",
      eventId,
      trackChoices: event.tracks.map((track) => ({
        value: track.id,
        text: track.name,
      })),
    });
    const store = c.env.EVENT_STORE.getByName(eventId);
    const form = await store.createForm(name, draft);
    return c.json({ form }, 201);
  });

  app.get("/api/events/:eventId/forms/:formId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const form = await store.getForm(formId);
    if (!form) return c.json({ error: "Form not found" }, 404);
    const event = await store.getEvent();
    const organizerEvent = event ?? seed;
    const lifecycle = form.publishedVersion
      ? await store.getFormLifecycle(
          form.id,
          eventTimezone(organizerEvent),
          lifecycleNow().toISOString(),
        )
      : null;
    return c.json({
      form,
      lifecycle,
      event: event
        ? {
            id: event.id,
            name: event.name,
            startsOn: event.startsOn,
            endsOn: event.endsOn,
            timezone: eventTimezone(event),
            themeAccent: event.themeAccent,
          }
        : {
            id: seed.id,
            name: seed.name,
            startsOn: seed.startsOn,
            endsOn: seed.endsOn,
            timezone: eventTimezone(seed),
            themeAccent: seed.themeAccent,
          },
    });
  });

  app.put("/api/events/:eventId/forms/:formId/draft", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      name?: string;
      draft?: unknown;
      expectedDraftUpdatedAt?: string;
    } | null;
    if (!body?.draft) {
      return c.json({ error: "Draft definition is required." }, 400);
    }
    const draftRecord =
      body.draft && typeof body.draft === "object"
        ? (body.draft as Record<string, unknown>)
        : null;
    if (draftRecord?.eventId && draftRecord.eventId !== eventId) {
      return c.json({ error: "Draft event id does not match this event." }, 400);
    }
    if (draftRecord?.definitionId && draftRecord.definitionId !== formId) {
      return c.json({ error: "Draft definition id does not match this form." }, 400);
    }
    const canonical = canonicalizeCfpDefinition({
      ...(draftRecord ?? {}),
      definitionId: formId,
      eventId,
      status: "draft",
    });
    if ("errors" in canonical) {
      return c.json(
        { error: canonical.errors[0], errors: canonical.errors },
        400,
      );
    }
    const draft = deriveEventTrackChoices(canonical, event.tracks);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.saveFormDraft(formId, {
        name: body.name,
        draft,
        expectedDraftUpdatedAt: body.expectedDraftUpdatedAt,
      });
      return c.json({ form });
    } catch (error) {
      if (error instanceof DraftConflictError || isDraftConflict(error)) {
        return c.json({ error: errorMessage(error) }, 409);
      }
      return c.json({ error: "Form not found" }, 404);
    }
  });

  app.post("/api/events/:eventId/forms/:formId/publish", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const existing = (await store.getForm(formId)) as OrganizerCfpForm | null;
    if (!existing) return c.json({ error: "Form not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      name?: string;
      draft?: unknown;
      expectedDraftUpdatedAt?: string;
    } | null;
    const sourceDraft =
      body?.draft && typeof body.draft === "object"
        ? (body.draft as Record<string, unknown>)
        : (existing.draft as unknown as Record<string, unknown>);
    const canonical = canonicalizeCfpDefinition({
      ...sourceDraft,
      definitionId: formId,
      eventId,
      status: "draft",
    });
    if ("errors" in canonical) {
      return c.json(
        { error: canonical.errors[0], errors: canonical.errors },
        400,
      );
    }
    try {
      const form = await store.publishForm(
        formId,
        deriveEventTrackChoices(canonical, event.tracks),
        {
          name: body?.name,
          expectedDraftUpdatedAt: body?.expectedDraftUpdatedAt,
        },
      );
      return c.json({ form });
    } catch (error) {
      if (error instanceof DraftConflictError || isDraftConflict(error)) {
        return c.json({ error: errorMessage(error) }, 409);
      }
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to publish form.",
        },
        400,
      );
    }
  });

  app.post("/api/events/:eventId/forms/:formId/close", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.closeForm(formId);
      return c.json({ form });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to close form.",
        },
        400,
      );
    }
  });

  app.post("/api/events/:eventId/forms/:formId/reopen", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.reopenForm(formId);
      return c.json({ form });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to reopen form.",
        },
        400,
      );
    }
  });

  app.get("/api/events/:eventId/reviewers", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);

    const rows = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email, r.track_id
       FROM event_memberships AS m
       JOIN "user" AS u ON u.id = m.user_id
       LEFT JOIN reviewer_track_assignments AS r
         ON r.event_id = m.event_id AND r.user_id = m.user_id
       WHERE m.event_id = ? AND m.role = 'reviewer'
       ORDER BY u.name COLLATE NOCASE, u.id, r.track_id`,
    )
      .bind(eventId)
      .all<{ id: string; name: string; email: string; track_id: string | null }>();
    const reviewers = new Map<string, ReviewerAssignment>();
    for (const row of rows.results) {
      const reviewer = reviewers.get(row.id) ?? {
        id: row.id,
        name: row.name,
        email: row.email,
        trackIds: [],
      };
      if (row.track_id) reviewer.trackIds.push(row.track_id);
      reviewers.set(row.id, reviewer);
    }
    const invitationRows = await listReviewerInvitations(c.env.AUTH_DB, eventId);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const invitations = await Promise.all(
      invitationRows.map(async (invitation) =>
        projectReviewerInvitation(
          invitation,
          await store.getOutboxMessage(invitation.outboxId),
        ),
      ),
    );
    return c.json({ reviewers: [...reviewers.values()], invitations });
  });

  app.post("/api/events/:eventId/reviewers", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      trackIds?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const trackIds = Array.isArray(body?.trackIds)
      ? [...new Set(body.trackIds.filter((trackId): trackId is string => typeof trackId === "string"))]
      : [];
    if (!email || trackIds.length === 0) {
      return c.json({ error: "Choose a reviewer and at least one track" }, 400);
    }
    if (trackIds.some((trackId) => !seed.tracks.some((track) => track.id === trackId))) {
      return c.json({ error: "One or more tracks do not belong to this event" }, 400);
    }

    const user = await c.env.AUTH_DB.prepare(
      `SELECT id, name, email FROM "user" WHERE lower(email) = ? LIMIT 1`,
    )
      .bind(email)
      .first<{ id: string; name: string; email: string }>();
    if (!user) {
      const now = new Date();
      const invitationId = `reviewer-invitation-${crypto.randomUUID()}`;
      const outboxId = `reviewer-invitation-email-${crypto.randomUUID()}`;
      const { token, tokenHash } = await createInvitationToken();
      const expiresAt = new Date(
        now.getTime() + REVIEWER_INVITATION_TTL_MS,
      ).toISOString();
      const inviteUrl = `${publicBaseUrl(c.req.raw, c.env)}/e/${encodeURIComponent(eventId)}/reviewer-invitations/${encodeURIComponent(token)}`;
      const trackNames = trackIds.map(
        (trackId) => seed.tracks.find((track) => track.id === trackId)!.name,
      );
      const safeEventName = escapeEmailHtml(seed.name);
      const safeTracks = trackNames.map(escapeEmailHtml).join(", ");
      const safeUrl = escapeEmailHtml(inviteUrl);
      const store = c.env.EVENT_STORE.getByName(eventId);
      await store.queueOutboxMessage({
        id: outboxId,
        kind: "reviewer_invitation",
        toEmail: email,
        subject: `Review proposals for ${seed.name}`,
        htmlBody: `<p>You have been invited to review ${safeTracks} for ${safeEventName}.</p><p><a href="${safeUrl}">Accept reviewer invitation</a></p><p>This invitation expires in 7 days.</p>`,
        textBody: `You have been invited to review ${trackNames.join(", ")} for ${seed.name}.\n\nAccept reviewer invitation: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
        proposalId: null,
      });
      await insertReviewerInvitation(c.env.AUTH_DB, {
        id: invitationId,
        eventId,
        email,
        tokenHash,
        trackIds,
        status: "pending",
        outboxId,
        expiresAt,
        acceptedByUserId: null,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      const sender =
        options.emailSender === undefined
          ? createResendSender(c.env)
          : options.emailSender;
      if (sender) {
        await deliverOutboxMessage({ store, sender, messageId: outboxId, now });
      }
      const outbox = await store.getOutboxMessage(outboxId);
      const saved = await getReviewerInvitationById(
        c.env.AUTH_DB,
        eventId,
        invitationId,
      );
      if (!saved) throw new Error("Reviewer invitation was not saved.");
      return c.json(
        { invitation: projectReviewerInvitation(saved, outbox, now) },
        202,
      );
    }
    const membership = await c.env.AUTH_DB.prepare(
      `SELECT role FROM event_memberships WHERE event_id = ? AND user_id = ? LIMIT 1`,
    )
      .bind(eventId, user.id)
      .first<{ role: "admin" | "reviewer" }>();
    if (membership?.role === "admin") {
      return c.json({ error: "Event administrators already have access to every track" }, 409);
    }

    const existingAssignments = await c.env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ?
       ORDER BY track_id`,
    )
      .bind(eventId, user.id)
      .all<{ track_id: string }>();
    const grantedTrackIds = [
      ...new Set([
        ...existingAssignments.results.map((row) => row.track_id),
        ...trackIds,
      ]),
    ];

    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role)
         VALUES (?, ?, 'reviewer')
         ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'reviewer'`,
      ).bind(eventId, user.id),
      ...trackIds.map((trackId) =>
        c.env.AUTH_DB.prepare(
          `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
           VALUES (?, ?, ?)
           ON CONFLICT(event_id, user_id, track_id) DO NOTHING`,
        ).bind(eventId, user.id, trackId),
      ),
    ]);

    return c.json({
      reviewer: {
        id: user.id,
        name: user.name,
        email: user.email,
        trackIds: grantedTrackIds,
      } satisfies ReviewerAssignment,
    });
  });

  app.delete("/api/events/:eventId/reviewers/:reviewerId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const reviewerId = c.req.param("reviewerId");
    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `DELETE FROM reviewer_track_assignments WHERE event_id = ? AND user_id = ?`,
      ).bind(eventId, reviewerId),
      c.env.AUTH_DB.prepare(
        `DELETE FROM event_memberships
         WHERE event_id = ? AND user_id = ? AND role = 'reviewer'`,
      ).bind(eventId, reviewerId),
    ]);
    return c.json({ ok: true });
  });

  app.delete(
    "/api/events/:eventId/reviewer-invitations/:invitationId",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!isEventAdmin(principal, eventId)) {
        return c.json({ error: "Administrator access required" }, 403);
      }
      const invitation = await getReviewerInvitationById(
        c.env.AUTH_DB,
        eventId,
        c.req.param("invitationId"),
      );
      if (!invitation) return c.json({ error: "Reviewer invitation not found" }, 404);
      const changed = await revokeReviewerInvitation(
        c.env.AUTH_DB,
        eventId,
        invitation.id,
        new Date().toISOString(),
      );
      if (!changed && invitation.status === "accepted") {
        return c.json({ error: "Accepted invitations cannot be revoked." }, 409);
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const delivery = await store.getOutboxMessage(invitation.outboxId);
      if (changed && delivery && delivery.status !== "sent") {
        await store.markOutboxFailed(
          invitation.outboxId,
          "Invitation revoked before delivery.",
          new Date().toISOString(),
          null,
        );
      }
      const current = await getReviewerInvitationById(
        c.env.AUTH_DB,
        eventId,
        invitation.id,
      );
      if (!current) throw new Error("Reviewer invitation disappeared.");
      return c.json({
        invitation: projectReviewerInvitation(
          current,
          await store.getOutboxMessage(current.outboxId),
        ),
      });
    },
  );

  app.post(
    "/api/events/:eventId/reviewer-invitations/:invitationId/retry",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!isEventAdmin(principal, eventId)) {
        return c.json({ error: "Administrator access required" }, 403);
      }
      const invitation = await getReviewerInvitationById(
        c.env.AUTH_DB,
        eventId,
        c.req.param("invitationId"),
      );
      if (!invitation) return c.json({ error: "Reviewer invitation not found" }, 404);
      if (effectiveInvitationStatus(invitation) !== "pending") {
        return c.json({ error: "This reviewer invitation cannot be retried." }, 409);
      }
      const sender =
        options.emailSender === undefined
          ? createResendSender(c.env)
          : options.emailSender;
      if (!sender) {
        return c.json({ error: "Email delivery is not configured." }, 503);
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const currentOutbox = await store.getOutboxMessage(invitation.outboxId);
      if (currentOutbox?.status === "failed") {
        await store.retryOutboxMessage(invitation.outboxId, new Date().toISOString());
      }
      await deliverOutboxMessage({
        store,
        sender,
        messageId: invitation.outboxId,
        now: new Date(),
      });
      return c.json({
        invitation: projectReviewerInvitation(
          invitation,
          await store.getOutboxMessage(invitation.outboxId),
        ),
      });
    },
  );

  app.get("/api/events/:eventId/evaluation-plan", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const plan = await store.getEvaluationPlan();
    if (!plan) return c.json({ plan: null, auditEvents: [] });
    if (eventRole(principal, eventId) !== "admin") {
      return c.json({
        plan: {
          ...plan,
          rounds: plan.rounds.filter((round) => round.reviewerPool.includes(principal.id)),
        },
        auditEvents: [],
      });
    }
    return c.json({ plan, auditEvents: await store.listEvaluationPlanAuditEvents() });
  });

  app.put("/api/events/:eventId/evaluation-plan", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      rounds?: unknown;
      expectedVersion?: unknown;
      enabled?: unknown;
    } | null;
    if (!Array.isArray(body?.rounds)) {
      return c.json({ error: "Evaluation plan rounds are required." }, 400);
    }
    try {
      const store = c.env.EVENT_STORE.getByName(eventId);
      const existing = await store.getEvaluationPlan();
      const rounds = body.rounds.map((round) => {
        const id =
          round && typeof round === "object" && typeof (round as { id?: unknown }).id === "string"
            ? (round as { id: string }).id
            : undefined;
        const previous = existing?.rounds.find((candidate) => candidate.id === id);
        return readEvaluationRoundInput(round, previous);
      });
      const plan = await store.saveEvaluationPlan({
        rounds,
        expectedVersion:
          typeof body.expectedVersion === "number" && Number.isInteger(body.expectedVersion)
            ? body.expectedVersion
            : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      return c.json({ plan, auditEvents: await store.listEvaluationPlanAuditEvents() });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  app.patch("/api/events/:eventId/evaluation-plan", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      enabled?: unknown;
      expectedVersion?: unknown;
    } | null;
    if (typeof body?.enabled !== "boolean") {
      return c.json({ error: "Evaluation plan enabled must be true or false." }, 400);
    }
    try {
      const store = c.env.EVENT_STORE.getByName(eventId);
      const plan = await store.setEvaluationPlanEnabled({
        enabled: body.enabled,
        expectedVersion:
          typeof body.expectedVersion === "number" && Number.isInteger(body.expectedVersion)
            ? body.expectedVersion
            : undefined,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      if (!plan) return c.json({ error: "Evaluation plan not found." }, 404);
      return c.json({ plan, auditEvents: await store.listEvaluationPlanAuditEvents() });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  app.get("/api/events/:eventId/evaluation-rounds/:roundId/assignments", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    return c.json({ assignments: await store.listEvaluationRoundAssignments(c.req.param("roundId")) });
  });

  app.patch("/api/events/:eventId/evaluation-rounds/:roundId/assignments", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      proposalId?: unknown;
      reviewerId?: unknown;
      assigned?: unknown;
    } | null;
    const proposalId = typeof body?.proposalId === "string" ? body.proposalId.trim() : "";
    const reviewerId = typeof body?.reviewerId === "string" ? body.reviewerId.trim() : "";
    if (!proposalId || !reviewerId || typeof body?.assigned !== "boolean") {
      return c.json({ error: "Proposal, reviewer, and assignment state are required." }, 400);
    }
    try {
      const store = c.env.EVENT_STORE.getByName(eventId);
      const assignments = await store.setEvaluationRoundAssignment({
        roundId: c.req.param("roundId"),
        proposalId,
        reviewerId,
        assigned: body.assigned,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      return c.json({ assignments, auditEvents: await store.listEvaluationPlanAuditEvents() });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  app.post("/api/events/:eventId/evaluation-rounds/:roundId/assignments/preview", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const maxAssignmentsPerReviewer =
      typeof body.maxAssignmentsPerReviewer === "number" && Number.isInteger(body.maxAssignmentsPerReviewer)
        ? body.maxAssignmentsPerReviewer
        : body.maxAssignmentsPerReviewer == null || body.maxAssignmentsPerReviewer === ""
          ? null
          : Number.NaN;
    try {
      const preview = await c.env.EVENT_STORE.getByName(eventId).previewEvaluationRoundDistribution({
        roundId: c.req.param("roundId"),
        trackIds: readStringList(body.trackIds),
        reviewerIds: readStringList(body.reviewerIds),
        maxAssignmentsPerReviewer,
      });
      return c.json({ preview });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  app.post("/api/events/:eventId/evaluation-rounds/:roundId/assignments/distribute", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const maxAssignmentsPerReviewer =
      typeof body.maxAssignmentsPerReviewer === "number" && Number.isInteger(body.maxAssignmentsPerReviewer)
        ? body.maxAssignmentsPerReviewer
        : body.maxAssignmentsPerReviewer == null || body.maxAssignmentsPerReviewer === ""
          ? null
          : Number.NaN;
    try {
      const store = c.env.EVENT_STORE.getByName(eventId);
      const result = await store.applyEvaluationRoundDistribution({
        roundId: c.req.param("roundId"),
        trackIds: readStringList(body.trackIds),
        reviewerIds: readStringList(body.reviewerIds),
        maxAssignmentsPerReviewer,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      return c.json({ ...result, auditEvents: await store.listEvaluationPlanAuditEvents() });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  app.patch("/api/events/:eventId/reviewers/:reviewerId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { trackIds?: unknown } | null;
    const trackIds = Array.isArray(body?.trackIds)
      ? [...new Set(body.trackIds.filter((trackId): trackId is string => typeof trackId === "string"))]
      : [];
    if (trackIds.length === 0) {
      return c.json({ error: "Choose at least one track" }, 400);
    }
    if (trackIds.some((trackId) => !seed.tracks.some((track) => track.id === trackId))) {
      return c.json({ error: "One or more tracks do not belong to this event" }, 400);
    }

    const reviewerId = c.req.param("reviewerId");
    const reviewer = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email
       FROM event_memberships m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.event_id = ? AND m.user_id = ? AND m.role = 'reviewer'
       LIMIT 1`,
    )
      .bind(eventId, reviewerId)
      .first<{ id: string; name: string; email: string }>();
    if (!reviewer) return c.json({ error: "Reviewer not found" }, 404);

    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `DELETE FROM reviewer_track_assignments WHERE event_id = ? AND user_id = ?`,
      ).bind(eventId, reviewerId),
      ...trackIds.map((trackId) =>
        c.env.AUTH_DB.prepare(
          `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
           VALUES (?, ?, ?)`,
        ).bind(eventId, reviewerId, trackId),
      ),
    ]);

    return c.json({
      reviewer: { ...reviewer, trackIds } satisfies ReviewerAssignment,
    });
  });

  app.get("/api/events/:eventId/review-progress", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const progress = await buildReviewProgress({
      event,
      store,
      reviewers: await loadReviewerAssignments(c.env.AUTH_DB, eventId),
      requestedRoundId: c.req.query("roundId") ?? null,
    });
    return c.json(progress satisfies ReviewProgressResponse);
  });

  app.post("/api/events/:eventId/review-progress/reminders/preview", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = await loadEvent(c.env, seed);
    const progress = await buildReviewProgress({
      event,
      store: c.env.EVENT_STORE.getByName(eventId),
      reviewers: await loadReviewerAssignments(c.env.AUTH_DB, eventId),
      requestedRoundId:
        typeof body.roundId === "string" ? body.roundId : c.req.query("roundId") ?? null,
    });
    const selectedIds = new Set(readStringList(body.reviewerIds));
    const candidates = progress.reviewers.filter(
      (reviewer) =>
        reviewer.outstandingCount > 0 &&
        (selectedIds.size === 0 || selectedIds.has(reviewer.reviewerId)),
    );
    const preview: ReviewProgressReminderPreview = {
      eventId,
      roundId: progress.round.roundId,
      generatedAt: new Date().toISOString(),
      drafts: candidates.map((reviewer) =>
        defaultReviewReminderDraft({ event, round: progress.round, reviewer }),
      ),
    };
    return c.json(preview);
  });

  app.post("/api/events/:eventId/review-progress/reminders/send", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      idempotencyKey?: unknown;
      roundId?: unknown;
      drafts?: unknown;
    } | null;
    const idempotencyKey =
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
    if (!idempotencyKey || drafts.length === 0) {
      return c.json({ error: "Reminder drafts and an idempotency key are required." }, 400);
    }
    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const progress = await buildReviewProgress({
      event,
      store,
      reviewers: await loadReviewerAssignments(c.env.AUTH_DB, eventId),
      requestedRoundId: typeof body?.roundId === "string" ? body.roundId : null,
    });
    const reviewerById = new Map(
      progress.reviewers.map((reviewer) => [reviewer.reviewerId, reviewer]),
    );
    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    const results: ReviewProgressReminderResult[] = [];
    for (const draft of drafts) {
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
        return c.json({ error: "Each reminder draft must be an object." }, 400);
      }
      const raw = draft as Record<string, unknown>;
      const reviewerId = typeof raw.reviewerId === "string" ? raw.reviewerId : "";
      const reviewer = reviewerById.get(reviewerId);
      const subject = typeof raw.subject === "string" ? raw.subject.trim().slice(0, 200) : "";
      const bodyText = typeof raw.bodyText === "string" ? raw.bodyText.trim().slice(0, 20_000) : "";
      if (!reviewer || reviewer.outstandingCount === 0 || !reviewer.email || !subject || !bodyText) {
        return c.json(
          { error: "Every reminder needs a selected incomplete reviewer, email, subject, and body." },
          400,
        );
      }
      const outboxId = `reviewer-reminder-${safeIdSegment(idempotencyKey)}-${safeIdSegment(reviewerId)}`;
      let message = await store.getOutboxMessage(outboxId);
      const created = !message;
      if (!message) {
        const safeBody = escapeEmailHtml(bodyText);
        message = await store.queueOutboxMessage({
          id: outboxId,
          kind: "reviewer_reminder",
          toEmail: reviewer.email,
          subject,
          htmlBody: `<p>${safeBody.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
          textBody: bodyText,
          proposalId: null,
        });
      }
      if (sender && message.status === "queued") {
        await deliverOutboxMessage({
          store,
          sender,
          messageId: outboxId,
          now: new Date(),
        });
        message = await store.getOutboxMessage(outboxId);
      }
      const status = reviewReminderStatus(message);
      if (created) {
        await store.recordReviewProgressAudit({
          roundId: progress.round.roundId,
          action: `review_reminder.${status}`,
          actorId: principal.id,
          actorName: principal.displayName,
          detail: {
            reviewerId,
            reviewerName: reviewer.reviewerName,
            toEmail: reviewer.email,
            pendingCount: reviewer.outstandingCount,
            outboxId,
            status,
          },
        });
      }
      results.push({
        reviewerId,
        toEmail: reviewer.email,
        outboxId,
        status,
        error: message?.error ?? null,
      });
    }
    const result: ReviewProgressReminderSendResult = {
      eventId,
      roundId: progress.round.roundId,
      idempotencyKey,
      results,
      history: reviewerReminderHistoryFromAudit(
        await store.listEvaluationPlanAuditEvents(),
        progress.round.roundId,
      ),
    };
    return c.json(result, 202);
  });

  app.post("/api/events/:eventId/review-progress/reminders/:outboxId/retry", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const outboxId = c.req.param("outboxId");
    const current = await store.getOutboxMessage(outboxId);
    if (!current || current.kind !== "reviewer_reminder") {
      return c.json({ error: "Review reminder not found." }, 404);
    }
    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    if (!sender) {
      return c.json({ error: "Email delivery is not configured." }, 503);
    }
    if (current.status === "failed") {
      await store.retryOutboxMessage(outboxId, new Date().toISOString());
    }
    await deliverOutboxMessage({ store, sender, messageId: outboxId, now: new Date() });
    const message = await store.getOutboxMessage(outboxId);
    const status = reviewReminderStatus(message);
    const auditEvents: EvaluationPlanAuditEvent[] =
      await store.listEvaluationPlanAuditEvents();
    const previousReminder = auditEvents.find(
      (event) =>
        event.action.startsWith("review_reminder.") &&
        event.detail.outboxId === outboxId,
    );
    const previousDetail = previousReminder?.detail ?? {};
    await store.recordReviewProgressAudit({
      roundId: previousReminder?.roundId ?? null,
      action: `review_reminder.retry.${status}`,
      actorId: principal.id,
      actorName: principal.displayName,
      detail: {
        reviewerId:
          typeof previousDetail.reviewerId === "string" ? previousDetail.reviewerId : "",
        reviewerName:
          typeof previousDetail.reviewerName === "string" ? previousDetail.reviewerName : "",
        toEmail:
          typeof previousDetail.toEmail === "string"
            ? previousDetail.toEmail
            : message?.toEmail ?? current.toEmail,
        pendingCount:
          typeof previousDetail.pendingCount === "number" ? previousDetail.pendingCount : 0,
        outboxId,
        status,
      },
    });
    return c.json({
      outboxId,
      status,
      error: message?.error ?? null,
    });
  });

  app.post("/api/events/:eventId/uploads", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }

    const storeForPurge = c.env.EVENT_STORE.getByName(eventId);
    void purgeStaleAssets(storeForPurge, c.env.ASSETS);

    const body = (await c.req.json().catch(() => null)) as
      | Partial<AssetUploadStartRequest>
      | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Upload request must be valid JSON." }, 400);
    }

    const formId = typeof body.formId === "string" ? body.formId.trim() : "";
    const formDefinitionVersion = body.formDefinitionVersion;
    const questionName =
      typeof body.questionName === "string" ? body.questionName.trim() : "";
    const rawFileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "";
    const fileName = rawFileName ? sanitizeUploadFileName(rawFileName) : "";
    const mime =
      typeof body.mime === "string" && body.mime.trim()
        ? body.mime.trim()
        : "";
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
        ? body.sizeBytes
        : Number.NaN;

    if (
      !formId ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion) ||
      !questionName ||
      !fileName ||
      !mime ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      return c.json({ error: "A valid upload start request is required." }, 400);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const lifecycle = await store.getFormLifecycle(
      formId,
      eventTimezone(await store.getEvent() ?? seed),
      lifecycleNow().toISOString(),
    );
    if (!lifecycle || lifecycle.state !== "open") {
      return c.json({
        error:
          lifecycle?.state === "scheduled"
            ? cfpLifecycleError(lifecycle)!
            : "This call for proposals is closed.",
      }, 409);
    }

    const form = (await store.getFormVersion(
      formId,
      formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }

    const question = resolveFileQuestion(form.definition, questionName);
    if (!question) {
      return c.json({ error: "That question does not accept file uploads." }, 400);
    }

    const maxBytes = question.maxFileBytes ?? DEFAULT_FILE_MAX_BYTES;
    const acceptMimeTypes = question.acceptMimeTypes ?? [];
    if (sizeBytes > maxBytes) {
      return c.json(
        {
          error: `Files must be ${maxBytes} bytes or smaller.`,
        },
        400,
      );
    }
    if (acceptMimeTypes.length > 0 && !acceptMimeTypes.includes(mime)) {
      return c.json({ error: "That file type is not allowed." }, 400);
    }

    const quota = await store.consumeUploadStartQuota(
      await submissionClientKey(c.req.raw),
      Date.now(),
    );
    if (!quota.allowed) {
      c.header("retry-after", String(quota.retryAfterSeconds));
      return c.json(
        { error: "Too many uploads started. Try again later." },
        429,
      );
    }

    const assetId = createTokenId();
    const objectKey = `${eventId}/${assetId}/${fileName}`;
    await store.createAsset({
      assetId,
      objectKey,
      fileName,
      mime,
      sizeBytes,
      formId,
      formDefinitionVersion,
      questionName,
      maxBytes,
    });

    return c.json({
      upload: {
        assetId,
        objectKey,
        uploadUrl: `/api/events/${eventId}/uploads/${assetId}`,
        maxBytes,
        acceptMimeTypes,
      },
    });
  });

  app.delete("/api/events/:eventId/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const abandoned = await store.abandonUnclaimedAsset(assetId);
    if (!abandoned) {
      return c.json({ error: "Upload not found or already attached." }, 404);
    }
    if (c.env.ASSETS) {
      try {
        await c.env.ASSETS.delete(abandoned.object_key);
      } catch {
        // best-effort
      }
    }
    await store.deleteAssetRecord(assetId);
    return c.json({ ok: true });
  });

  app.put("/api/events/:eventId/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const asset = await store.getAsset(assetId);
    if (!asset) return c.json({ error: "Upload session not found." }, 404);

    if (
      asset.claimed_proposal_id ||
      (asset.status !== "pending" && asset.status !== "failed")
    ) {
      return c.json({ error: "This upload can no longer be replaced." }, 400);
    }

    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
      return c.json({ error: "Content-Length is required." }, 400);
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return c.json({ error: "Content-Length is invalid." }, 400);
    }
    if (contentLength !== Number(asset.size_bytes)) {
      return c.json(
        { error: "Upload size must match the declared file size." },
        400,
      );
    }
    if (contentLength > Number(asset.max_bytes)) {
      return c.json(
        {
          error: `Files must be ${Number(asset.max_bytes)} bytes or smaller.`,
        },
        400,
      );
    }

    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (contentType !== asset.mime) {
      return c.json({ error: "Content-Type must match the declared file type." }, 400);
    }

    if (!c.req.raw.body) {
      return c.json({ error: "Upload body is required." }, 400);
    }

    try {
      const stored = await c.env.ASSETS.put(asset.object_key, c.req.raw.body, {
        httpMetadata: { contentType: asset.mime },
        customMetadata: {
          assetId,
          eventId,
          fileName: asset.file_name,
        },
      });
      if (!stored || stored.size !== Number(asset.size_bytes)) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort cleanup
        }
        await store.failAsset(assetId);
        return c.json(
          { error: "Upload size did not match the declared file size." },
          400,
        );
      }

      const completed = await store.completeAsset({
        assetId,
        sizeBytes: stored.size,
        mime: asset.mime,
        fileName: asset.file_name,
      });
      if (!completed) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort cleanup of the object just written
        }
        return c.json(
          { error: "This upload can no longer be replaced." },
          409,
        );
      }
      return c.json({ asset: completed });
    } catch {
      await store.failAsset(assetId);
      return c.json(
        { error: "Upload failed. You can retry without restarting the form." },
        502,
      );
    }
  });

  app.post("/api/events/:eventId/proposals", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const declaredLength = Number(c.req.header("content-length") ?? "0");
    if (declaredLength > MAX_PROPOSAL_BODY_BYTES) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    const rawBody = await readProposalBody(c.req.raw);
    if (rawBody === null) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Proposal request must be valid JSON." }, 400);
    }

    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const formId = bodyRecord.formId;
    const formDefinitionVersion = bodyRecord.formDefinitionVersion;
    const answersRaw = bodyRecord.answers;
    const draftId =
      typeof bodyRecord.draftId === "string" ? bodyRecord.draftId.trim() : "";
    if (
      typeof formId !== "string" ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion)
    ) {
      return c.json({ error: "A published form version is required." }, 400);
    }
    if (
      !answersRaw ||
      typeof answersRaw !== "object" ||
      Array.isArray(answersRaw)
    ) {
      return c.json({ error: "Submission answers are required." }, 400);
    }
    const answers = answersRaw as SubmissionAnswers;

    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(event.id);
    const submitter = await resolveAuthenticatedUser(c.req.raw, c.env);
    let draftSubmission: Awaited<ReturnType<typeof store.getSubmitterDraft>> | null = null;
    if (draftId) {
      if (!submitter) {
        return c.json({ error: "Sign in to submit this draft." }, 401);
      }
      draftSubmission = await store.getSubmitterDraft({
        draftId,
        userId: submitter.id,
      });
      if (!draftSubmission) {
        return c.json({ error: "Draft not found." }, 404);
      }
      if (draftSubmission.submittedProposalId) {
        const existing = await store.getProposal(draftSubmission.submittedProposalId);
        if (existing) return c.json({ proposal: toPublicProposal(existing) });
        return c.json(
          { error: "This draft was already submitted. Refresh your dashboard." },
          409,
        );
      }
      if (
        draftSubmission.draft.formId !== formId ||
        draftSubmission.draft.formDefinitionVersion !== formDefinitionVersion
      ) {
        return c.json(
          { error: "Draft form version changed. Reload the draft and try again." },
          409,
        );
      }
    }

    const form = (await store.getFormVersion(
      formId,
      formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }

    const lifecycle = await store.getFormLifecycle(
      formId,
      eventTimezone(event),
      lifecycleNow().toISOString(),
    );
    if (!lifecycle || lifecycle.state !== "open") {
      return c.json(
        lifecycle
          ? lifecycleUnavailable(lifecycle)
          : { error: "This call for proposals is unavailable." },
        409,
      );
    }

    const validated = validateAndNormalizeSubmission(
      form.definition,
      answers,
      event,
    );
    if (!validated.normalized || Object.keys(validated.errors).length > 0) {
      return c.json(
        { errors: validated.errors, values: validated.answers },
        400,
      );
    }

    const secret = signingSecret(c.env, options.signingSecret);
    if (!secret) {
      return c.json(
        {
          error:
            "Proposal editing is temporarily unavailable. Try again later.",
        },
        503,
      );
    }

    const quota = await store.consumeSubmissionQuota(
      await submissionClientKey(c.req.raw),
      Date.now(),
    );
    if (!quota.allowed) {
      c.header("retry-after", String(quota.retryAfterSeconds));
      return c.json(
        { error: "Too many proposals submitted. Try again later." },
        429,
      );
    }

    // Submitter accounts are optional. Accountless submissions retain the
    // signed-edit-link flow; an active authenticated session binds ownership.
    let created;
    try {
      created = await store.createProposal({
        formId: form.id,
        formDefinitionVersion: form.definitionVersion,
        answers: validated.answers,
        normalized: validated.normalized,
        assetClaims: validated.assetClaims,
        submitterUserId: submitter?.id ?? null,
        assetClaimOwnerId: draftId ? draftAssetOwnerId(draftId) : null,
        submittedDraft:
          draftId && submitter ? { id: draftId, userId: submitter.id } : null,
      });
    } catch (error) {
      if (isDraftConflict(error)) {
        return c.json({ error: errorMessage(error), code: "draft_conflict" }, 409);
      }
      throw error;
    }
    if (!created.ok) {
      return c.json(
        { errors: created.errors, values: validated.answers },
        400,
      );
    }
    const proposal = created.proposal;

    const tokenId = createTokenId();
    const exp = Math.floor(Date.now() / 1000) + EDIT_TOKEN_TTL_SECONDS;
    await store.createEditToken({
      tokenId,
      proposalId: proposal.id,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
    const token = await signEditToken(secret, {
      v: 1,
      eventId: event.id,
      proposalId: proposal.id,
      tokenId,
      exp,
    });
    const editUrl = `${publicBaseUrl(c.req.raw, c.env)}/e/${event.id}/edit/${token}`;

    const email = await renderSubmissionConfirmationEmail({
      eventName: event.name,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      speakerName: proposal.speakerName,
      editUrl,
    });
    email.to = proposal.speakerEmail;

    const outboxId = `outbox-${proposal.id}`;
    await store.queueOutboxMessage({
      id: outboxId,
      kind: "submission_confirmation",
      toEmail: proposal.speakerEmail,
      subject: email.subject,
      htmlBody: email.html,
      textBody: email.text,
      proposalId: proposal.id,
    });

    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    if (sender) {
      await deliverOutboxMessage({
        store,
        sender,
        messageId: outboxId,
        now: new Date(),
      });
    }

    const fresh = await store.getProposal(proposal.id);
    return c.json(
      {
        proposal: toPublicProposal(fresh ?? proposal),
        confirmationEmailStatus:
          fresh?.confirmationEmailStatus ?? "queued",
      },
      201,
    );
  });

  app.get("/api/events/:eventId/submitter/proposals", async (c) => {
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "Sign in to view your proposals." }, 401);

    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const response: SubmitterDashboardResponse = {
      user,
      proposals: await store.listSubmitterProposals(user.id, user.email),
      drafts: await store.listSubmitterDrafts(user.id),
    };
    return c.json(response);
  });

  app.get("/api/events/:eventId/submitter/drafts/:draftId", async (c) => {
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "Sign in to resume this draft." }, 401);

    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const session = await store.getSubmitterDraft({
      draftId: c.req.param("draftId"),
      userId: user.id,
    });
    if (!session) return c.json({ error: "Draft not found." }, 404);
    if (session.submittedProposalId) {
      const proposal = await store.getProposal(session.submittedProposalId);
      return c.json(
        {
          error: "This draft was already submitted.",
          proposal: proposal ? toPublicProposal(proposal) : undefined,
        },
        409,
      );
    }
    const form = (await store.getFormVersion(
      session.draft.formId,
      session.draft.formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This draft uses a form version that is no longer available." },
        409,
      );
    }
    return c.json({
      eventId,
      event: {
        id: event.id,
        name: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        timezone: eventTimezone(event),
        themeAccent: event.themeAccent,
      },
      draft: session.draft,
      form,
      lifecycle: session.draft.lifecycle,
      answers: session.answers,
    });
  });

  async function saveSubmitterDraftResponse(
    c: Context<{ Bindings: AppBindings }>,
    draftId?: string,
  ) {
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "Sign in to save a draft." }, 401);
    const eventId = param(c, "eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);

    const declaredLength = Number(c.req.header("content-length") ?? "0");
    if (declaredLength > MAX_PROPOSAL_BODY_BYTES) {
      return c.json({ error: "Draft request is too large." }, 413);
    }
    const rawBody = await readProposalBody(c.req.raw);
    if (rawBody === null) return c.json({ error: "Draft request is too large." }, 413);

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Draft request must be valid JSON." }, 400);
    }
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const formId = bodyRecord.formId;
    const formDefinitionVersion = bodyRecord.formDefinitionVersion;
    const answersRaw = bodyRecord.answers;
    if (
      typeof formId !== "string" ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion) ||
      !answersRaw ||
      typeof answersRaw !== "object" ||
      Array.isArray(answersRaw)
    ) {
      return c.json({ error: "A published form version and answers are required." }, 400);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const form = (await store.getFormVersion(
      formId,
      formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }
    const answers = answersRaw as SubmissionAnswers;
    const title = draftTitleFromAnswers(form, answers);
    if (!title) {
      return c.json(
        {
          error: "Enter a talk title before saving a draft.",
          errors: { [form.definition.chartstead.proposalTitleName]: "Enter a talk title before saving a draft." },
          values: answers,
        },
        400,
      );
    }
    if (title.length > 160) {
      return c.json(
        {
          error: "Use 160 characters or fewer for the title.",
          errors: { [form.definition.chartstead.proposalTitleName]: "Use 160 characters or fewer." },
          values: answers,
        },
        400,
      );
    }

    const expectedUpdatedAt =
      typeof bodyRecord.expectedUpdatedAt === "string"
        ? bodyRecord.expectedUpdatedAt
        : undefined;
    try {
      const saved = await store.saveSubmitterDraft({
        draftId,
        userId: user.id,
        formId: form.id,
        formDefinitionVersion: form.definitionVersion,
        answers,
        title,
        assetClaims: collectAssetClaims(form.definition, answers),
        expectedUpdatedAt,
      });
      if (!saved) return c.json({ error: "Draft not found." }, 404);
      if (!saved.ok) {
        if ("conflict" in saved) {
          return c.json({ error: saved.conflict, code: "draft_conflict" }, 409);
        }
        return c.json({ errors: saved.errors, values: answers }, 400);
      }
      return c.json({ draft: saved.draft, answers: saved.answers }, draftId ? 200 : 201);
    } catch (error) {
      if (isDraftConflict(error)) {
        return c.json({ error: errorMessage(error), code: "draft_conflict" }, 409);
      }
      throw error;
    }
  }

  app.post("/api/events/:eventId/submitter/drafts", (c) =>
    saveSubmitterDraftResponse(c),
  );

  app.patch("/api/events/:eventId/submitter/drafts/:draftId", (c) =>
    saveSubmitterDraftResponse(c, c.req.param("draftId")),
  );

  app.post(
    "/api/events/:eventId/submitter/proposals/:proposalId/claim",
    async (c) => {
      const user = await resolveAuthenticatedUser(c.req.raw, c.env);
      if (!user) return c.json({ error: "Sign in to claim a proposal." }, 401);

      const eventId = c.req.param("eventId");
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const proposal = await c.env.EVENT_STORE.getByName(eventId).claimSubmitterProposal({
        proposalId: c.req.param("proposalId"),
        userId: user.id,
        email: user.email,
      });
      if (!proposal) return c.json({ error: "Proposal not found" }, 404);
      return c.json({ proposal });
    },
  );

  app.get("/api/events/:eventId/proposals", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const query = c.req.query("q") ?? "";
    const requestedStatus = c.req.query("status") ?? "";
    const status = ["unreviewed", "approve", "maybe", "deny"].includes(
      requestedStatus,
    )
      ? (requestedStatus as ProposalStatus)
      : undefined;
    if (requestedStatus && requestedStatus !== "all" && !status) {
      return c.json({ error: "Unknown review status" }, 400);
    }
    const requestedSort = c.req.query("sort") ?? "newest";
    if (
      ![
        "newest",
        "oldest",
        "title-asc",
        "title-desc",
        "track-asc",
        "track-desc",
        "status-asc",
        "status-desc",
        "speaker-asc",
        "aggregate-asc",
        "aggregate-desc",
      ].includes(requestedSort)
    ) {
      return c.json({ error: "Unknown proposal sort" }, 400);
    }
    const requestedTrack = c.req.query("track") ?? "";
    const requestedRoundId = c.req.query("roundId") ?? "";
    const allowedTracks = assignedTrackIds(principal, eventId);
    if (
      requestedTrack &&
      allowedTracks !== null &&
      !allowedTracks.includes(requestedTrack)
    ) {
      return c.json({ error: "That track is outside your review assignment" }, 403);
    }
    const trackIds = requestedTrack
      ? [requestedTrack]
      : (allowedTracks ?? undefined);
    const plan = await store.getEvaluationPlan();
    const advancedRound = plan?.enabled && eventRole(principal, eventId) !== "admin"
      ? requestedRoundId
        ? await store.getEvaluationRoundAccess(requestedRoundId, principal.id)
        : null
      : null;
    if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
      if (!advancedRound) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      if (!advancedRound.allowed) {
        const error = evaluationRoundAccessError(advancedRound);
        return c.json(error.body, error.status);
      }
    }
    const proposalIds = advancedRound?.round
      ? await store.listEvaluationRoundProposalIds(advancedRound.round.id, principal.id)
      : undefined;
    const proposals = await store.listProposals({
      query,
      status,
      trackIds,
      proposalIds,
      sort: requestedSort as
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
        | "aggregate-desc",
      roundId: requestedRoundId || advancedRound?.round?.id,
    });
    const projected = await Promise.all(
      proposals.map(async (proposal) => {
        if (eventRole(principal, eventId) === "admin") {
          return {
            ...proposal,
            reviewerRecusals: await store.listProposalReviewRecusals(proposal.id),
          };
        }
        const recusal = advancedRound?.round
          ? await store.getReviewerRecusal({
              proposalId: proposal.id,
              roundId: advancedRound.round.id,
              reviewerId: principal.id,
            })
          : null;
        const withRecusal = { ...proposal, reviewerRecusal: recusal, reviewerRecusals: [] };
        return advancedRound?.round?.anonymization === "blind"
          ? anonymizeEvaluationProposal(withRecusal)
          : withRecusal;
      }),
    );
    return c.json({
      proposals: projected,
    });
  });

  app.get("/api/events/:eventId/review-results", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Event administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    return c.json(await c.env.EVENT_STORE.getByName(eventId).listReviewResults());
  });

  app.get("/api/events/:eventId/review-results.csv", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Event administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const csv = reviewResultsCsv(
      await c.env.EVENT_STORE.getByName(eventId).listReviewResults(),
    );
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${eventId}-review-results.csv"`,
      },
    });
  });

  // Permanent speaker-facing detail: always public-safe fields (never committee data).
  app.get("/api/events/:eventId/proposals/:proposalId", async (c) => {
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const proposal = await store.getProposal(proposalId);
    if (!proposal) {
      return c.json({ error: "Proposal not found" }, 404);
    }

    return c.json({ proposal: toPublicProposal(proposal) });
  });

  app.get("/api/events/:eventId/organizer/activity", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const isAdmin = eventRole(principal, eventId) === "admin";

    const membershipRows = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email, m.role
       FROM event_memberships AS m
       JOIN "user" AS u ON u.id = m.user_id
       WHERE m.event_id = ? AND m.role IN ('admin', 'reviewer')
       ORDER BY u.name COLLATE NOCASE, u.id`,
    )
      .bind(eventId)
      .all<{ id: string; name: string; email: string; role: "admin" | "reviewer" }>();

    let actors: OrganizerTeamMember[] = membershipRows.results.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      kind: "human" as const,
    }));
    if (!isAdmin) {
      actors = actors.filter((member) => member.id === principal.id);
    } else {
      const agentActors = await store.listAgentActivityActors();
      const knownIds = new Set(actors.map((member) => member.id));
      for (const agent of agentActors) {
        if (knownIds.has(agent.id)) continue;
        actors.push({
          id: agent.id,
          name: agent.name,
          email: "",
          role: "admin",
          kind: "agent",
        });
        knownIds.add(agent.id);
      }
    }

    const actorIdParam = c.req.query("actorId");
    const actorId =
      typeof actorIdParam === "string" && actorIdParam.trim()
        ? actorIdParam.trim()
        : null;

    const limitParam = c.req.query("limit");
    const parsedLimit =
      typeof limitParam === "string" && limitParam.trim()
        ? Number.parseInt(limitParam.trim(), 10)
        : 50;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 50;
    const beforeParam = c.req.query("before");
    const before =
      typeof beforeParam === "string" && beforeParam.trim()
        ? beforeParam.trim()
        : null;

    let actor: OrganizerTeamMember | null = null;
    let entries: OrganizerActivityByActorResponse["entries"] = [];
    let hasMore = false;

    if (actorId) {
      if (!isAdmin && actorId !== principal.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      const activity = await store.listTeamActivityByActor(actorId, {
        limit,
        before,
      });
      entries = activity.entries;
      hasMore = activity.hasMore;
      actor = actors.find((member) => member.id === actorId) ?? null;
      if (!actor && actorId === principal.id) {
        const role = eventRole(principal, eventId);
        if (role === "admin" || role === "reviewer") {
          actor = {
            id: principal.id,
            name: principal.displayName,
            email: "",
            role,
            kind: "human",
          };
        }
      }
      if (!actor) {
        const agentMatch = entries.find((entry) => entry.actorId === actorId);
        if (agentMatch) {
          actor = {
            id: actorId,
            name: agentMatch.actorName,
            email: "",
            role: "admin",
            kind: "agent",
          };
        }
      }
    }

    const body: OrganizerActivityByActorResponse = {
      actorId,
      actor,
      actors,
      entries,
      limit,
      hasMore,
    };
    return c.json(body);
  });

  app.get("/api/events/:eventId/organizer/proposals/:proposalId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const proposal = await store.getProposal(proposalId);
    if (!proposal) {
      return c.json({ error: "Proposal not found" }, 404);
    }
    if (!canReviewProposal(principal, eventId, proposal)) {
      return c.json({ error: "Proposal not found" }, 404);
    }

    const plan = await store.getEvaluationPlan();
    const roundId = c.req.query("roundId") ?? "";
    let round = null;
    if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
      if (!roundId) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      const access = await store.getEvaluationRoundAccess(roundId, principal.id);
      if (!access.allowed) {
        const error = evaluationRoundAccessError(access);
        return c.json(error.body, error.status);
      }
      if (!(await store.listEvaluationRoundProposalIds(roundId, principal.id)).includes(proposalId)) {
        return c.json({ error: "Proposal not found" }, 404);
      }
      round = access.round;
    }

    const isAdmin = eventRole(principal, eventId) === "admin";
    const reviewerRecusal =
      !isAdmin && round
        ? await store.getReviewerRecusal({
            proposalId,
            roundId: round.id,
            reviewerId: principal.id,
          })
        : null;
    const projected = isAdmin
      ? {
          ...proposal,
          reviewerRecusals: await store.listProposalReviewRecusals(proposalId),
        }
      : {
          ...(round?.anonymization === "blind" ? anonymizeEvaluationProposal(proposal) : proposal),
          reviewerRecusal,
          reviewerRecusals: [],
        };
    const auditEvents = (await store.listProposalAuditEvents(proposalId)).filter(
      (audit: ProposalAuditEvent) => isAdmin || audit.actorId === principal.id,
    );
    const scorecard = await store.getProposalScorecardProjection({
      proposalId,
      roundId: round?.id ?? (isAdmin && roundId ? roundId : undefined),
      reviewerId: isAdmin ? undefined : principal.id,
    });
    return c.json({
      proposal: scorecard?.aggregate
        ? { ...projected, scorecardAggregate: scorecard.aggregate }
        : projected,
      auditEvents,
      scorecard,
    });
  });

  app.patch(
    "/api/events/:eventId/organizer/proposals/:proposalId/review",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const proposalId = c.req.param("proposalId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const store = c.env.EVENT_STORE.getByName(eventId);
      const existing = (await store.getProposal(proposalId)) as OrganizerProposal | null;
      if (!existing || !canReviewProposal(principal, eventId, existing)) {
        return c.json({ error: "Proposal not found" }, 404);
      }

      const body = (await c.req.json().catch(() => null)) as {
        status?: unknown;
        committeeNote?: unknown;
        expectedVersion?: unknown;
        roundId?: unknown;
        criteria?: unknown;
        scorecardValues?: unknown;
      } | null;
      if (!body || !Number.isInteger(body.expectedVersion)) {
        return c.json({ error: "An expected review version is required" }, 400);
      }
      const status = body.status;
      if (
        status !== undefined &&
        (typeof status !== "string" ||
          !["unreviewed", "approve", "maybe", "deny"].includes(status))
      ) {
        return c.json({ error: "Unknown review status" }, 400);
      }
      if (
        body.committeeNote !== undefined &&
        typeof body.committeeNote !== "string"
      ) {
        return c.json({ error: "Committee note must be text" }, 400);
      }
      if (
        typeof body.committeeNote === "string" &&
        body.committeeNote.length > 10_000
      ) {
        return c.json({ error: "Committee note must be 10000 characters or fewer" }, 400);
      }
      let criterionScores: ReviewCriterionResult[] | undefined;
      try {
        criterionScores = normalizeReviewCriterionScores(body.criteria);
      } catch (error) {
        if (error instanceof ReviewCriteriaInputError) {
          return c.json({ error: error.message }, 400);
        }
        throw error;
      }
      const scorecardValues =
        body.scorecardValues && typeof body.scorecardValues === "object" && !Array.isArray(body.scorecardValues)
          ? (body.scorecardValues as Record<string, ScorecardCriterionValue>)
          : undefined;
      if (body.scorecardValues !== undefined && !scorecardValues) {
        return c.json({ error: "Scorecard values must be an object." }, 400);
      }
      if (
        status === undefined &&
        body.committeeNote === undefined &&
        criterionScores === undefined &&
        scorecardValues === undefined
      ) {
        return c.json({ error: "A review change is required" }, 400);
      }

      const plan = await store.getEvaluationPlan();
      let roundId: string | undefined;
      let round = null;
      if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
        if (typeof body.roundId !== "string" || !body.roundId) {
          return c.json(
            { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
            403,
          );
        }
        const access = await store.getEvaluationRoundAccess(body.roundId, principal.id);
        if (!access.allowed) {
          const error = evaluationRoundAccessError(access);
          return c.json(error.body, error.status);
        }
        round = access.round;
        roundId = access.round!.id;
        if (!(await store.listEvaluationRoundProposalIds(roundId, principal.id)).includes(proposalId)) {
          return c.json({ error: "Proposal not found" }, 404);
        }
        const recusal = await store.getReviewerRecusal({
          proposalId,
          roundId,
          reviewerId: principal.id,
        });
        if (recusal) {
          return c.json(
            {
              error: "You have recused yourself from this review assignment.",
              code: "reviewer_recused",
            },
            409,
          );
        }
      }
      if (plan?.enabled && eventRole(principal, eventId) === "admin" && typeof body.roundId === "string") {
        round = plan.rounds.find((candidate) => candidate.id === body.roundId) ?? null;
        if (!round) return c.json({ error: "Evaluation round not found." }, 404);
        roundId = round.id;
      }

      const proposal = await store.updateProposalReview({
        proposalId,
        expectedVersion: body.expectedVersion as number,
        status: status as ProposalStatus | undefined,
        committeeNote:
          typeof body.committeeNote === "string"
            ? body.committeeNote.trim()
            : undefined,
        actorId: principal.id,
        actorName: principal.displayName,
        roundId,
        criterionScores,
        scorecardValues,
      });
      if (!proposal) {
        return c.json(
          { error: "This proposal changed since you opened it. Reload and try again." },
          409,
        );
      }
      const isAdmin = eventRole(principal, eventId) === "admin";
      const projected = isAdmin
        ? {
            ...proposal,
            reviewerRecusals: await store.listProposalReviewRecusals(proposalId),
          }
        : round?.anonymization === "blind"
          ? anonymizeEvaluationProposal(proposal)
          : proposal;
      const scorecard = await store.getProposalScorecardProjection({
        proposalId,
        roundId,
        reviewerId: isAdmin ? undefined : principal.id,
      });
      return c.json({
        proposal: scorecard?.aggregate
          ? { ...projected, scorecardAggregate: scorecard.aggregate }
          : projected,
        auditEvents: (await store.listProposalAuditEvents(proposalId)).filter(
          (audit: ProposalAuditEvent) => isAdmin || audit.actorId === principal.id,
        ),
        scorecard,
      });
    },
  );

  app.post(
    "/api/events/:eventId/organizer/proposals/:proposalId/recusal",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const proposalId = c.req.param("proposalId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (eventRole(principal, eventId) === "admin") {
        return c.json({ error: "Reviewer access required.", code: "reviewer_not_assigned" }, 403);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const store = c.env.EVENT_STORE.getByName(eventId);
      const proposal = (await store.getProposal(proposalId)) as OrganizerProposal | null;
      if (!proposal || !canReviewProposal(principal, eventId, proposal)) {
        return c.json({ error: "Proposal not found" }, 404);
      }
      const body = (await c.req.json().catch(() => null)) as {
        roundId?: unknown;
        reason?: unknown;
      } | null;
      if (!body || typeof body.roundId !== "string" || !body.roundId) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      if (body.reason !== undefined && typeof body.reason !== "string") {
        return c.json({ error: "Recusal reason must be text." }, 400);
      }
      if (typeof body.reason === "string" && body.reason.length > 2000) {
        return c.json({ error: "Recusal reason must be 2000 characters or fewer." }, 400);
      }
      const access = await store.getEvaluationRoundAccess(body.roundId, principal.id);
      if (!access.allowed) {
        const error = evaluationRoundAccessError(access);
        return c.json(error.body, error.status);
      }
      if (
        !(await store.listEvaluationRoundProposalIds(access.round!.id, principal.id)).includes(
          proposalId,
        )
      ) {
        return c.json({ error: "Proposal not found" }, 404);
      }
      const recusal = await store.recuseProposalReview({
        proposalId,
        roundId: access.round!.id,
        reviewerId: principal.id,
        reviewerName: principal.displayName,
        reason: body.reason,
      });
      const current = (await store.getProposal(proposalId)) as OrganizerProposal;
      const projected = {
        ...(access.round!.anonymization === "blind" ? anonymizeEvaluationProposal(current) : current),
        reviewerRecusal: recusal,
        reviewerRecusals: [],
      };
      return c.json({
        proposal: projected,
        auditEvents: (await store.listProposalAuditEvents(proposalId)).filter(
          (audit: ProposalAuditEvent) => audit.actorId === principal.id,
        ),
      });
    },
  );

  app.get("/api/events/:eventId/portal", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) {
      return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    }
    return c.json(session);
  });

  app.get("/api/events/:eventId/onboarding/files", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can open the files library." }, 403);
    }
    const library = await c.env.EVENT_STORE.getByName(eventId).getOnboardingFilesLibrary();
    return c.json({ ...library, eventId: event.id });
  });

  app.post("/api/events/:eventId/onboarding/files/export", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can export deliverables." }, 403);
    }
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);

    const body = (await c.req.json().catch(() => ({}))) as FilesLibraryExportRequest | null;
    const requestedAssetIds = new Set(
      Array.isArray(body?.assetIds)
        ? body.assetIds.filter((value): value is string => typeof value === "string" && value.trim() !== "")
        : [],
    );
    const requestedSessionIds = new Set(
      Array.isArray(body?.sessionIds)
        ? body.sessionIds.filter((value): value is string => typeof value === "string" && value.trim() !== "")
        : [],
    );
    if (requestedAssetIds.size === 0 && requestedSessionIds.size === 0) {
      return c.json({ error: "Select at least one file or session to export." }, 400);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const library = await store.getOnboardingFilesLibrary();
    const selected = library.files.filter(
      (file) =>
        requestedAssetIds.has(file.assetId) ||
        (file.session && requestedSessionIds.has(file.session.id)),
    );
    if (selected.length === 0) {
      return c.json({ error: "No selected latest deliverables were found." }, 404);
    }
    if (selected.length > 200) {
      return c.json({ error: "Export up to 200 deliverables at a time." }, 400);
    }

    const usedPaths = new Set<string>();
    const entries: ZipEntry[] = [];
    let totalBytes = 0;
    for (const file of selected) {
      const asset = await store.getAsset(file.assetId);
      if (!asset || asset.status !== "complete" || asset.purpose !== "portal_task") {
        return c.json({ error: `Deliverable ${file.fileName} is no longer exportable.` }, 409);
      }
      const object = await c.env.ASSETS.get(asset.object_key);
      if (!object) {
        return c.json({ error: `Deliverable ${file.fileName} is missing from storage.` }, 502);
      }
      const bytes = new Uint8Array(await object.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (totalBytes > 100 * 1024 * 1024) {
        return c.json({ error: "Export up to 100 MB of deliverables at a time." }, 400);
      }
      entries.push({
        path: uniqueZipPath(file.safeExportPath, usedPaths),
        bytes,
        modifiedAt: file.uploadedAt,
      });
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    const zip = buildStoredZip(entries);
    const timestamp = new Date().toISOString().replace(/[:-]/g, "").replace(/\.\d{3}Z$/, "Z");
    const filename = sanitizeUploadFileName(`${event.id}-deliverables-${timestamp}.zip`);
    const headers = new Headers();
    headers.set("content-type", "application/zip");
    headers.set("cache-control", "private, no-store");
    headers.set("content-disposition", `attachment; filename="${filename}"`);
    headers.set("x-chartstead-export-file-count", String(entries.length));
    return new Response(zip, { status: 200, headers });
  });

  app.patch("/api/events/:eventId/portal/profile", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => null)) as {
      biography?: unknown;
      name?: unknown;
      headshotAssetId?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Profile update must be valid JSON." }, 400);
    }

    const patch: {
      biography?: string;
      name?: string;
      headshotAssetId?: string | null;
    } = {};
    if ("biography" in body) {
      if (typeof body.biography !== "string") {
        return c.json({ error: "Biography must be a string." }, 400);
      }
      patch.biography = body.biography;
    }
    if ("name" in body) {
      if (typeof body.name !== "string") {
        return c.json({ error: "Name must be a string." }, 400);
      }
      patch.name = body.name;
    }
    if ("headshotAssetId" in body) {
      if (body.headshotAssetId !== null && typeof body.headshotAssetId !== "string") {
        return c.json({ error: "Headshot asset id is invalid." }, 400);
      }
      patch.headshotAssetId = body.headshotAssetId;
    }

    const result = await store.updateSpeakerPortalProfile({
      speakerId: authorized.payload.speakerId,
      ...patch,
    });
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    return c.json(session);
  });

  app.post("/api/events/:eventId/portal/uploads", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => null)) as {
      purpose?: unknown;
      taskId?: unknown;
      fileName?: unknown;
      mime?: unknown;
      sizeBytes?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Upload request must be valid JSON." }, 400);
    }

    const purpose = body.purpose === "headshot" || body.purpose === "task" ? body.purpose : null;
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    const rawFileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "";
    const fileName = rawFileName ? sanitizeUploadFileName(rawFileName) : "";
    const mime =
      typeof body.mime === "string" && body.mime.trim() ? body.mime.trim() : "";
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
        ? body.sizeBytes
        : Number.NaN;

    if (!purpose || !fileName || !mime || !Number.isInteger(sizeBytes) || sizeBytes < 0) {
      return c.json({ error: "A valid portal upload start request is required." }, 400);
    }
    if (purpose === "task" && !taskId) {
      return c.json({ error: "Task id is required for task uploads." }, 400);
    }
    let taskConstraints = null as OnboardingFileConstraints | null;
    if (purpose === "task") {
      const session = await store.getSpeakerPortalSession({
        speakerId: authorized.payload.speakerId,
        expiresAt: authorized.tokenRow.expiresAt,
      });
      const task = session?.tasks.find((row) => row.id === taskId);
      if (!task) return c.json({ error: "Task not found." }, 404);
      if (task.completionRequirement !== "file") {
        return c.json({ error: "This task does not accept file uploads." }, 400);
      }
      taskConstraints = task.fileConstraints;
    }

    const maxBytes =
      purpose === "headshot"
        ? HEADSHOT_MAX_BYTES
        : taskConstraints?.maxBytes ?? TASK_FILE_MAX_BYTES;
    const acceptMimeTypes =
      purpose === "headshot"
        ? [...HEADSHOT_MIME_TYPES]
        : taskConstraints?.acceptMimeTypes ?? [];
    const acceptExtensions =
      purpose === "headshot"
        ? [".jpg", ".jpeg", ".png", ".webp"]
        : taskConstraints?.acceptExtensions ?? [];
    if (sizeBytes > maxBytes) {
      return c.json({ error: `Files must be ${maxBytes} bytes or smaller.` }, 400);
    }
    if (acceptMimeTypes.length > 0 && !acceptMimeTypes.includes(mime)) {
      return c.json({ error: `Use one of these file types: ${acceptMimeTypes.join(", ")}.` }, 400);
    }
    if (acceptExtensions.length > 0 && !acceptExtensions.includes(fileExtension(fileName))) {
      return c.json({ error: `Use one of these file extensions: ${acceptExtensions.join(", ")}.` }, 400);
    }

    const assetId = createTokenId();
    const objectKey = `${eventId}/portal/${authorized.payload.speakerId}/${assetId}/${fileName}`;
    await store.createPortalAsset({
      assetId,
      objectKey,
      fileName,
      mime,
      sizeBytes,
      speakerId: authorized.payload.speakerId,
      purpose: purpose === "headshot" ? "portal_headshot" : "portal_task",
      taskId: purpose === "task" ? taskId : undefined,
      maxBytes,
    });

    return c.json({
      upload: {
        assetId,
        objectKey,
        uploadUrl: `/api/events/${eventId}/portal/uploads/${assetId}`,
        maxBytes,
        acceptMimeTypes,
        acceptExtensions,
      },
    });
  });

  app.get("/api/events/:eventId/portal/assets/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.status !== "complete" ||
      asset.owner_speaker_id !== authorized.payload.speakerId ||
      (asset.purpose !== "portal_headshot" && asset.purpose !== "portal_task")
    ) {
      return c.json({ error: "Asset not found." }, 404);
    }

    const object = await c.env.ASSETS.get(asset.object_key);
    if (!object) {
      return c.json({ error: "Asset file is missing." }, 404);
    }
    const headers = new Headers();
    headers.set("content-type", asset.mime || "application/octet-stream");
    headers.set("cache-control", "private, max-age=300");
    if (asset.file_name) {
      headers.set(
        "content-disposition",
        `inline; filename="${sanitizeUploadFileName(asset.file_name)}"`,
      );
    }
    return new Response(object.body, { status: 200, headers });
  });

  app.get("/api/events/:eventId/portal/assets/:assetId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.status !== "complete" ||
      asset.owner_speaker_id !== authorized.payload.speakerId ||
      asset.purpose !== "portal_task"
    ) {
      return c.json({ error: "Deliverable version not found." }, 404);
    }
    return c.json({ comments: store.listDeliverableVersionComments(assetId) });
  });

  app.post("/api/events/:eventId/portal/assets/:assetId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    const body = (await c.req.json().catch(() => null)) as { body?: unknown } | null;
    const result = await store.addDeliverableVersionComment({
      assetId,
      speakerId: authorized.payload.speakerId,
      body: typeof body?.body === "string" ? body.body : "",
      authorId: authorized.payload.speakerId,
      authorName: session.profile.name,
      authorRole: "speaker",
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    const comments = await store.listDeliverableVersionComments(assetId);
    return Response.json(comments[comments.length - 1] ?? result.comment);
  });


  app.put("/api/events/:eventId/portal/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.owner_speaker_id !== authorized.payload.speakerId ||
      (asset.purpose !== "portal_headshot" && asset.purpose !== "portal_task")
    ) {
      return c.json({ error: "Upload session not found." }, 404);
    }
    if (
      asset.claimed_proposal_id ||
      (asset.status !== "pending" && asset.status !== "failed")
    ) {
      return c.json({ error: "This upload can no longer be replaced." }, 400);
    }

    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
      return c.json({ error: "Content-Length is required." }, 400);
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return c.json({ error: "Content-Length is invalid." }, 400);
    }
    if (contentLength !== Number(asset.size_bytes)) {
      return c.json(
        { error: "Upload size must match the declared file size." },
        400,
      );
    }
    if (contentLength > Number(asset.max_bytes)) {
      return c.json(
        { error: `Files must be ${Number(asset.max_bytes)} bytes or smaller.` },
        400,
      );
    }
    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (contentType !== asset.mime) {
      return c.json({ error: "Content-Type must match the declared file type." }, 400);
    }
    if (!c.req.raw.body) {
      return c.json({ error: "Upload body is required." }, 400);
    }

    try {
      const stored = await c.env.ASSETS.put(asset.object_key, c.req.raw.body, {
        httpMetadata: { contentType: asset.mime },
        customMetadata: {
          assetId,
          eventId,
          fileName: asset.file_name,
          speakerId: authorized.payload.speakerId,
        },
      });
      if (!stored || stored.size !== Number(asset.size_bytes)) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort
        }
        await store.failAsset(assetId);
        return c.json(
          { error: "Upload size did not match the declared file size." },
          400,
        );
      }
      const completed = await store.completeAsset({
        assetId,
        sizeBytes: stored.size,
        mime: asset.mime,
        fileName: asset.file_name,
      });
      if (!completed) {
        return c.json({ error: "This upload can no longer be replaced." }, 409);
      }
      return c.json({ asset: completed });
    } catch {
      await store.failAsset(assetId);
      return c.json(
        { error: "Upload failed. You can retry without restarting." },
        502,
      );
    }
  });

  app.post("/api/events/:eventId/portal/tasks/:taskId/complete", async (c) => {
    const eventId = c.req.param("eventId");
    const taskId = c.req.param("taskId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => ({}))) as {
      assetId?: unknown;
    };
    const assetId =
      typeof body.assetId === "string" && body.assetId.trim()
        ? body.assetId.trim()
        : null;

    const result = await store.completePortalTask({
      speakerId: authorized.payload.speakerId,
      taskId,
      assetId,
    });
    if (!result.ok) {
      const status = result.status === 404 ? 404 : 400;
      return c.json({ error: result.error }, status);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    return c.json(session);
  });

  app.get("/api/events/:eventId/onboarding", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can open onboarding." }, 403);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const board = await store.getOnboardingBoard();
    return c.json({ ...board, eventId: event.id });
  });

  app.get("/api/events/:eventId/onboarding/assets/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can access deliverables." }, 403);
    }
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);

    const asset = await c.env.EVENT_STORE.getByName(eventId).getAsset(assetId);
    if (!asset || asset.status !== "complete" || asset.purpose !== "portal_task") {
      return c.json({ error: "Deliverable not found." }, 404);
    }
    const object = await c.env.ASSETS.get(asset.object_key);
    if (!object) return c.json({ error: "Deliverable file is missing." }, 404);

    const requestedDisposition = c.req.query("disposition");
    const disposition =
      requestedDisposition === "inline" && isPreviewableOnboardingMime(asset.mime)
        ? "inline"
        : "attachment";
    const headers = new Headers();
    headers.set("content-type", asset.mime || "application/octet-stream");
    headers.set("cache-control", "private, no-store");
    headers.set(
      "content-disposition",
      `${disposition}; filename="${sanitizeUploadFileName(asset.file_name)}"`,
    );
    return new Response(object.body, { status: 200, headers });
  });

  app.get("/api/events/:eventId/onboarding/assets/:assetId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can access deliverable comments." }, 403);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const asset = await store.getAsset(assetId);
    if (!asset || asset.status !== "complete" || asset.purpose !== "portal_task") {
      return c.json({ error: "Deliverable version not found." }, 404);
    }
    return c.json({ comments: store.listDeliverableVersionComments(assetId) });
  });

  app.post("/api/events/:eventId/onboarding/assets/:assetId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can add deliverable comments." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as { body?: unknown } | null;
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = await store.addDeliverableVersionComment({
      assetId,
      body: typeof body?.body === "string" ? body.body : "",
      authorId: principal.id,
      authorName: principal.displayName,
      authorRole: "organizer",
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    const comments = await store.listDeliverableVersionComments(assetId);
    return Response.json(comments[comments.length - 1] ?? result.comment);
  });


  app.post("/api/events/:eventId/speakers", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speakers." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as Partial<SpeakerDirectoryCreateInput> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Speaker request must be valid JSON." }, 400);
    }
    const result = await c.env.EVENT_STORE.getByName(eventId).createDirectorySpeaker({
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      biography: typeof body.biography === "string" ? body.biography : "",
      titleSnapshot: typeof body.titleSnapshot === "string" ? body.titleSnapshot : "",
      organizationSnapshot:
        typeof body.organizationSnapshot === "string" ? body.organizationSnapshot : "",
      role: typeof body.role === "string" ? body.role : "invited",
      reuseSpeakerId:
        typeof body.reuseSpeakerId === "string" ? body.reuseSpeakerId : undefined,
      createNewIdentity: body.createNewIdentity === true,
      actorId: principal.id,
      actorName: principal.displayName,
    });
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
          ...(result.matches ? { matches: result.matches } : {}),
        },
        result.status,
      );
    }
    return c.json(result.value, result.value.reused ? 200 : 201);
  });

  app.patch("/api/events/:eventId/speakers/:speakerId", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speakers." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
      email?: unknown;
      biography?: unknown;
      socialLinks?: unknown;
      headshotAssetId?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Speaker update must be valid JSON." }, 400);
    }
    if (
      "headshotAssetId" in body &&
      body.headshotAssetId !== null &&
      typeof body.headshotAssetId !== "string"
    ) {
      return c.json({ error: "Headshot asset id is invalid." }, 400);
    }
    const result = await c.env.EVENT_STORE.getByName(eventId).updateDirectorySpeaker({
      speakerId: c.req.param("speakerId"),
      name: typeof body.name === "string" ? body.name : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      biography: typeof body.biography === "string" ? body.biography : undefined,
      socialLinks: "socialLinks" in body ? body.socialLinks : undefined,
      headshotAssetId:
        "headshotAssetId" in body
          ? body.headshotAssetId === null || typeof body.headshotAssetId === "string"
            ? body.headshotAssetId
            : undefined
          : undefined,
      actorId: principal.id,
      actorName: principal.displayName,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(result.speaker);
  });

  app.post("/api/events/:eventId/speakers/:speakerId/headshot-uploads", async (c) => {
    const eventId = c.req.param("eventId");
    const speakerId = c.req.param("speakerId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speakers." }, 403);
    }
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const speaker = (await store.getOnboardingBoard()).speakers.find(
      (row) => row.speakerId === speakerId,
    );
    if (!speaker) return c.json({ error: "Speaker not found." }, 404);

    const body = (await c.req.json().catch(() => null)) as {
      fileName?: unknown;
      mime?: unknown;
      sizeBytes?: unknown;
    } | null;
    const rawFileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const fileName = rawFileName ? sanitizeUploadFileName(rawFileName) : "";
    const mime = typeof body?.mime === "string" ? body.mime.trim() : "";
    const sizeBytes = typeof body?.sizeBytes === "number" ? body.sizeBytes : Number.NaN;
    if (!fileName || !mime || !Number.isInteger(sizeBytes) || sizeBytes < 0) {
      return c.json({ error: "A valid headshot upload start request is required." }, 400);
    }
    if (sizeBytes > HEADSHOT_MAX_BYTES) {
      return c.json({ error: `Files must be ${HEADSHOT_MAX_BYTES} bytes or smaller.` }, 400);
    }
    if (!HEADSHOT_MIME_TYPES.includes(mime as (typeof HEADSHOT_MIME_TYPES)[number])) {
      return c.json({ error: "That file type is not allowed." }, 400);
    }

    const assetId = createTokenId();
    const objectKey = `${eventId}/portal/${speakerId}/${assetId}/${fileName}`;
    await store.createPortalAsset({
      assetId,
      objectKey,
      fileName,
      mime,
      sizeBytes,
      speakerId,
      purpose: "portal_headshot",
      maxBytes: HEADSHOT_MAX_BYTES,
    });
    return c.json({
      upload: {
        assetId,
        objectKey,
        uploadUrl: `/api/events/${eventId}/speakers/${speakerId}/headshot-uploads/${assetId}`,
        maxBytes: HEADSHOT_MAX_BYTES,
        acceptMimeTypes: [...HEADSHOT_MIME_TYPES],
      },
    });
  });

  app.put("/api/events/:eventId/speakers/:speakerId/headshot-uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const speakerId = c.req.param("speakerId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speakers." }, 403);
    }
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.owner_speaker_id !== speakerId ||
      asset.purpose !== "portal_headshot"
    ) {
      return c.json({ error: "Upload session not found." }, 404);
    }
    if (asset.claimed_proposal_id || (asset.status !== "pending" && asset.status !== "failed")) {
      return c.json({ error: "This upload can no longer be replaced." }, 400);
    }
    const contentLength = Number(c.req.header("content-length") ?? Number.NaN);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return c.json({ error: "Content-Length is required." }, 400);
    }
    if (contentLength !== Number(asset.size_bytes)) {
      return c.json({ error: "Upload size must match the declared file size." }, 400);
    }
    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (contentType !== asset.mime) {
      return c.json({ error: "Content-Type must match the declared file type." }, 400);
    }
    if (!c.req.raw.body) return c.json({ error: "Upload body is required." }, 400);

    try {
      const stored = await c.env.ASSETS.put(asset.object_key, c.req.raw.body, {
        httpMetadata: { contentType: asset.mime },
        customMetadata: { assetId, eventId, fileName: asset.file_name, speakerId },
      });
      if (!stored || stored.size !== Number(asset.size_bytes)) {
        await c.env.ASSETS.delete(asset.object_key).catch(() => undefined);
        await store.failAsset(assetId);
        return c.json({ error: "Upload size did not match the declared file size." }, 400);
      }
      const completed = await store.completeAsset({
        assetId,
        sizeBytes: stored.size,
        mime: asset.mime,
        fileName: asset.file_name,
      });
      if (!completed) return c.json({ error: "This upload can no longer be replaced." }, 409);
      return c.json({ asset: completed });
    } catch {
      await store.failAsset(assetId);
      return c.json({ error: "Upload failed. You can retry without restarting." }, 502);
    }
  });




  app.get("/api/events/:eventId/speakers/:speakerId/headshot", async (c) => {
    const eventId = c.req.param("eventId");
    const speakerId = c.req.param("speakerId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speakers." }, 403);
    }
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);
    const assetId = c.req.query("asset") ?? "";
    const asset = await c.env.EVENT_STORE.getByName(eventId).getAsset(assetId);
    if (
      !asset ||
      asset.status !== "complete" ||
      asset.owner_speaker_id !== speakerId ||
      asset.purpose !== "portal_headshot"
    ) {
      return c.json({ error: "Asset not found." }, 404);
    }
    const object = await c.env.ASSETS.get(asset.object_key);
    if (!object) return c.json({ error: "Asset file is missing." }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": asset.mime,
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="${sanitizeUploadFileName(asset.file_name)}"`,
      },
    });
  });


  app.patch("/api/events/:eventId/speakers/:speakerId/participation", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can manage speaker participation." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      workflowStatus?: unknown;
      travelPreferences?: unknown;
      logistics?: unknown;
    } | null;
    const workflowStatus = body?.workflowStatus;
    if (
      workflowStatus !== "invited" &&
      workflowStatus !== "confirmed" &&
      workflowStatus !== "preparing" &&
      workflowStatus !== "ready" &&
      workflowStatus !== "withdrawn"
    ) {
      return c.json({ error: "A valid workflowStatus is required." }, 400);
    }
    if (!body || typeof body.travelPreferences !== "string") {
      return c.json({ error: "travelPreferences is required." }, 400);
    }
    if (
      !body ||
      !body.logistics ||
      typeof body.logistics !== "object" ||
      Array.isArray(body.logistics)
    ) {
      return c.json({ error: "logistics must be an object of field labels and values." }, 400);
    }
    const logistics = Object.fromEntries(
      Object.entries(body.logistics as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    if (Object.keys(logistics).length !== Object.keys(body.logistics).length) {
      return c.json({ error: "Each logistics value must be text." }, 400);
    }

    const result = await c.env.EVENT_STORE.getByName(eventId).updateParticipationWorkflow({
      speakerId: c.req.param("speakerId"),
      workflowStatus,
      travelPreferences: body.travelPreferences,
      logistics,
      actorId: principal.id,
      actorName: principal.displayName,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(result.speaker);
  });

  function speakerCsvMapping(value: unknown): SpeakerCsvColumnMapping | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.name !== "string" ||
      typeof row.email !== "string" ||
      typeof row.title !== "string" ||
      typeof row.organization !== "string"
    ) {
      return null;
    }
    return {
      name: row.name,
      email: row.email,
      biography: typeof row.biography === "string" ? row.biography : null,
      title: row.title,
      organization: row.organization,
    };
  }

  app.post("/api/events/:eventId/speaker-imports/preview", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can import speakers." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      csvText?: unknown;
      mapping?: unknown;
    } | null;
    const mapping = speakerCsvMapping(body?.mapping);
    if (!body || typeof body.csvText !== "string" || !mapping) {
      return c.json({ error: "CSV text and a complete column mapping are required." }, 400);
    }
    try {
      const parsed = parseSpeakerCsv(body.csvText, mapping);
      const preview = await c.env.EVENT_STORE.getByName(eventId).previewSpeakerCsvImport({
        ...parsed,
        mapping,
      });
      return c.json(preview);
    } catch (error) {
      if (error instanceof SpeakerCsvParseError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/events/:eventId/speaker-imports/apply", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can import speakers." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      csvText?: unknown;
      mapping?: unknown;
      previewDigest?: unknown;
      idempotencyKey?: unknown;
      resolutions?: unknown;
    } | null;
    const mapping = speakerCsvMapping(body?.mapping);
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      c.req.header("idempotency-key")?.trim() ||
      "";
    if (
      !body ||
      typeof body.csvText !== "string" ||
      !mapping ||
      typeof body.previewDigest !== "string" ||
      !idempotencyKey ||
      !body.resolutions ||
      typeof body.resolutions !== "object"
    ) {
      return c.json(
        { error: "CSV text, mapping, preview digest, resolutions, and idempotency key are required." },
        400,
      );
    }
    const resolutions: Record<string, SpeakerCsvResolution> = {};
    for (const [rowNumber, value] of Object.entries(
      body.resolutions as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const resolution = value as Record<string, unknown>;
      if (
        resolution.action !== "create" &&
        resolution.action !== "reuse" &&
        resolution.action !== "update" &&
        resolution.action !== "skip"
      ) {
        continue;
      }
      resolutions[rowNumber] = {
        action: resolution.action,
        speakerId:
          typeof resolution.speakerId === "string"
            ? resolution.speakerId
            : undefined,
      };
    }
    try {
      const parsed = parseSpeakerCsv(body.csvText, mapping);
      const result = await c.env.EVENT_STORE.getByName(eventId).applySpeakerCsvImport({
        ...parsed,
        mapping,
        previewDigest: body.previewDigest,
        resolutions,
        idempotencyKey,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      if (!result.ok) return c.json({ error: result.error }, result.status);
      return c.json(result.result, result.created ? 201 : 200);
    } catch (error) {
      if (error instanceof SpeakerCsvParseError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/api/events/:eventId/speaker-imports", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can view speaker imports." }, 403);
    }
    const imports = await c.env.EVENT_STORE.getByName(eventId).listSpeakerImports();
    return c.json({ imports });
  });

  app.post("/api/events/:eventId/onboarding/tasks", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can create tasks." }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as {
      speakerId?: unknown;
      speakerIds?: unknown;
      title?: unknown;
      instructions?: unknown;
      kind?: unknown;
      completionRequirement?: unknown;
      readinessFlag?: unknown;
      dueAt?: unknown;
      idempotencyKey?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Task request must be valid JSON." }, 400);
    }

    const speakerIds = Array.isArray(body.speakerIds)
      ? body.speakerIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : typeof body.speakerId === "string" && body.speakerId.trim()
        ? [body.speakerId.trim()]
        : [];
    const title = typeof body.title === "string" ? body.title : "";
    const instructions = typeof body.instructions === "string" ? body.instructions : "";
    const kind = typeof body.kind === "string" ? body.kind : "custom";
    const completionRequirement = (
      body.completionRequirement === "manual" ||
      body.completionRequirement === "file" ||
      body.completionRequirement === "ack"
        ? body.completionRequirement
        : null
    ) as OnboardingCompletionRequirement | null;
    const readinessFlag =
      typeof body.readinessFlag === "string" && body.readinessFlag.trim()
        ? body.readinessFlag.trim()
        : null;
    const dueAt =
      typeof body.dueAt === "string" && body.dueAt.trim() ? body.dueAt.trim() : null;

    const idempotencyKey =
      (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      c.req.header("idempotency-key")?.trim() ||
      (speakerIds.length === 1 ? crypto.randomUUID() : "");
    if (speakerIds.length === 0 || !completionRequirement || !idempotencyKey) {
      return c.json(
        { error: "speakerIds, completionRequirement, and idempotencyKey are required." },
        400,
      );
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const created = await store.createOnboardingTasks({
      speakerIds,
      title,
      instructions,
      kind,
      completionRequirement,
      readinessFlag,
      dueAt,
      createdBy: principal.id,
      idempotencyKey,
    });
    if (!created.ok) {
      return c.json({ error: created.error }, 400);
    }
    return c.json(
      { ...created.result, task: created.result.tasks[0] },
      created.created ? 201 : 200,
    );
  });

  app.post("/api/events/:eventId/onboarding/reminders", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can prepare reminders." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      speakerId?: unknown;
    } | null;
    const speakerId =
      body && typeof body.speakerId === "string" ? body.speakerId.trim() : "";
    if (!speakerId) return c.json({ error: "speakerId is required." }, 400);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const draft = await store.prepareOnboardingReminder({
      speakerId,
      actorId: principal.id,
      actorName: principal.displayName,
    });
    if ("error" in draft) return c.json({ error: draft.error }, 400);
    return c.json(draft, 201);
  });

  app.get("/api/events/:eventId/onboarding/reminders/policy", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can view reminder policy." }, 403);
    }
    const policy = await c.env.EVENT_STORE.getByName(eventId).getOnboardingReminderPolicy();
    return c.json({ policy });
  });

  app.put("/api/events/:eventId/onboarding/reminders/policy", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can change reminder policy." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      policy?: Partial<OnboardingReminderAutomationPolicy>;
    } | null;
    const policy = await c.env.EVENT_STORE.getByName(eventId).setOnboardingReminderPolicy({
      policy: body?.policy ?? {},
      actorId: principal.id,
      actorName: principal.displayName,
    });
    return c.json({ policy });
  });

  app.post("/api/events/:eventId/onboarding/reminders/bulk", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can prepare bulk reminders." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      speakerIds?: unknown;
      mode?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const speakerIds = Array.isArray(body?.speakerIds)
      ? body.speakerIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const mode = body?.mode === "send" ? "send" : "draft";
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      c.req.header("idempotency-key")?.trim() ||
      "";
    const result = await c.env.EVENT_STORE.getByName(eventId).prepareBulkOnboardingReminders({
      speakerIds,
      mode,
      actorId: principal.id,
      actorName: principal.displayName,
      idempotencyKey,
    });
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json(result, result.counts.prepared + result.counts.queued > 0 ? 201 : 200);
  });

  app.post("/api/events/:eventId/onboarding/reminders/process-due", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can process due reminders." }, 403);
    }
    const result = await c.env.EVENT_STORE.getByName(eventId).processAutomaticOnboardingReminders({
      actorId: principal.id,
      actorName: principal.displayName,
    });
    return c.json(result);
  });

  app.patch("/api/events/:eventId/onboarding/reminders/:draftId", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can edit reminders." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      subject?: unknown;
      bodyText?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Draft update must be valid JSON." }, 400);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const updated = await store.updateReminderDraft({
      id: draftId,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      bodyText: typeof body.bodyText === "string" ? body.bodyText : undefined,
    });
    if ("error" in updated) return c.json({ error: updated.error }, 400);
    return c.json(updated);
  });

  app.post("/api/events/:eventId/onboarding/reminders/:draftId/discard", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can discard reminders." }, 403);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const discarded = await store.discardReminderDraft(draftId);
    if ("error" in discarded) return c.json({ error: discarded.error }, 400);
    return c.json(discarded);
  });

  app.post("/api/events/:eventId/onboarding/reminders/:draftId/send", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can send reminders." }, 403);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const queued = await store.queueReminderSend(draftId);
    if ("error" in queued) return c.json({ error: queued.error }, 400);

    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    if (!sender) {
      await store.markOutboxFailed(
        queued.outboxId,
        "Email delivery is not configured.",
        new Date().toISOString(),
        null,
      );
      const failed = await store.getReminderDraft(draftId);
      return c.json(failed ?? queued.draft);
    }

    await deliverOutboxMessage({
      store,
      sender,
      messageId: queued.outboxId,
      now: new Date(),
    });
    const after = await store.getReminderDraft(draftId);
    return c.json(after ?? queued.draft);
  });

  app.get("/api/events/:eventId/submitter/edit", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSubmitterEdit({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const proposal = await store.getProposal(authorized.payload.proposalId);
    if (!proposal) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const form = (await store.getFormVersion(
      proposal.formId,
      proposal.formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const event = await store.getEvent();
    const lifecycle = await store.getFormLifecycle(
      proposal.formId,
      eventTimezone(event ?? seed),
      lifecycleNow().toISOString(),
    );
    if (!lifecycle || lifecycle.state !== "open") {
      return c.json(
        lifecycle
          ? lifecycleUnavailable(lifecycle)
          : { error: "This call for proposals is unavailable." },
        lifecycle?.state === "closed" ? 410 : 409,
      );
    }

    return c.json({
      eventId,
      proposalId: proposal.id,
      expiresAt: authorized.tokenRow.expiresAt,
      form,
      lifecycle,
      answers: proposal.answers,
      proposal: toSubmitterProposal(proposal),
    });
  });

  app.patch("/api/events/:eventId/submitter/proposals/:proposalId", async (c) => {
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const token =
      c.req.header("x-submitter-token") ||
      c.req.query("token") ||
      "";
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSubmitterEdit({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      expectedProposalId: proposalId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const event = await store.getEvent();
    if (!event) return c.json({ error: "Event not found" }, 404);

    const existing = await store.getProposal(proposalId);
    if (!existing) return c.json(INVALID_EDIT_LINK_ERROR, 401);

    const lifecycle = await store.getFormLifecycle(
      existing.formId,
      eventTimezone(event),
      lifecycleNow().toISOString(),
    );
    if (!lifecycle || lifecycle.state !== "open") {
      return c.json(
        lifecycle
          ? lifecycleUnavailable(lifecycle)
          : { error: "This call for proposals is unavailable." },
        409,
      );
    }

    const declaredLength = Number(c.req.header("content-length") ?? "0");
    if (declaredLength > MAX_PROPOSAL_BODY_BYTES) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    const rawBody = await readProposalBody(c.req.raw);
    if (rawBody === null) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Proposal request must be valid JSON." }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "Proposal request must be valid JSON." }, 400);
    }
    const bodyRecord = body as Record<string, unknown>;
    const answersRaw = bodyRecord.answers;
    if (
      !answersRaw ||
      typeof answersRaw !== "object" ||
      Array.isArray(answersRaw)
    ) {
      return c.json({ error: "Submission answers are required." }, 400);
    }

    const form = (await store.getFormVersion(
      existing.formId,
      existing.formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }

    const validated = validateAndNormalizeSubmission(
      form.definition,
      answersRaw as SubmissionAnswers,
      event,
    );
    if (!validated.normalized || Object.keys(validated.errors).length > 0) {
      return c.json(
        { errors: validated.errors, values: validated.answers },
        400,
      );
    }

    const updated = await store.updateProposal({
      proposalId,
      answers: validated.answers,
      normalized: validated.normalized,
      assetClaims: validated.assetClaims,
    });
    if (!updated.ok) {
      return c.json(
        { errors: updated.errors, values: validated.answers },
        400,
      );
    }
    return c.json({ proposal: toPublicProposal(updated.proposal) });
  });

  app.post(
    "/api/events/:eventId/submitter/tokens/:tokenId/revoke",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const tokenId = c.req.param("tokenId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!isEventAdmin(principal, eventId)) {
        return c.json({ error: "Administrator access required" }, 403);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const store = c.env.EVENT_STORE.getByName(eventId);
      await store.revokeEditToken(tokenId);
      return c.json({ ok: true });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/decisions`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "propose_decision");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      proposalId?: unknown;
      outcome?: unknown;
      items?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    const items: Array<{ proposalId: string; outcome: "accepted" | "declined" }> = [];
    if (Array.isArray(body?.items)) {
      for (const raw of body.items) {
        const row = raw as { proposalId?: unknown; outcome?: unknown };
        if (typeof row.proposalId !== "string" || !row.proposalId.trim()) {
          return c.json({ error: "Each item requires proposalId" }, 400);
        }
        if (row.outcome !== "accepted" && row.outcome !== "declined") {
          return c.json({ error: "Each item outcome must be accepted or declined" }, 400);
        }
        items.push({ proposalId: row.proposalId.trim(), outcome: row.outcome });
      }
    } else if (typeof body?.proposalId === "string" && body.proposalId.trim()) {
      if (body.outcome !== "accepted" && body.outcome !== "declined") {
        return c.json({ error: "outcome must be accepted or declined" }, 400);
      }
      items.push({ proposalId: body.proposalId.trim(), outcome: body.outcome });
    } else {
      return c.json({ error: "proposalId or items[] is required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    for (const item of items) {
      const proposal = await store.getProposal(item.proposalId);
      if (!proposal) return c.json({ error: `Proposal ${item.proposalId} not found` }, 404);
    }
    try {
      const result = (await store.createDecisionCourseCheck({
        items,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as {
        plan: import("../shared/course-check").CourseCheckPlan;
        created: boolean;
        linkedPlans?: import("../shared/course-check").CourseCheckPlan[];
      };
      const projectionPolicy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
      const projectionOptions = courseCheckProjectionOptions(
        principal!,
        eventId,
        projectionPolicy,
      );
      const projectedPlan = (await store.projectCourseCheckPlan(
        result.plan,
        projectionOptions,
      )) as import("../shared/course-check").CourseCheckPlan | null;
      if (!projectedPlan) {
        return c.json({ error: "Course Check not found" }, 404);
      }
      if (result.linkedPlans && result.linkedPlans.length > 0) {
        const linkedPlans = (
          await Promise.all(
            result.linkedPlans.map(
              async (plan) =>
                (await store.projectCourseCheckPlan(
                  plan,
                  projectionOptions,
                )) as import("../shared/course-check").CourseCheckPlan | null,
            ),
          )
        ).filter(
          (plan): plan is import("../shared/course-check").CourseCheckPlan =>
            Boolean(plan),
        );
        return c.json(
          { ...projectedPlan, linkedPlans },
          result.created ? 201 : 200,
        );
      }
      return c.json(projectedPlan, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Unable to create Decision Course Check",
        },
        400,
      );
    }
  });

  function courseCheckProjectionOptions(
    principal: OrganizerPrincipal,
    eventId: string,
    policy?: EventCourseCheckPolicy | null,
  ) {
    const role = eventRole(principal, eventId);
    const canViewCommunicationEvidence =
      role === "admin" ||
      authorizeCourseCheck(principal, eventId, "propose_communication") === null ||
      authorizeCourseCheck(principal, eventId, "send") === null;
    const projectionRole =
      role === "admin" || isAgentPrincipal(principal)
        ? role === "admin"
          ? ("admin" as const)
          : ("agent" as const)
        : role === "reviewer"
          ? ("reviewer" as const)
          : ("none" as const);
    const knownStageIds = [
      "apply-decision",
      "apply-guaranteed-speaker",
      "create-drafts",
      "send-messages",
      "publish-program",
      "unpublish-program",
      "restore-program",
      "write-airtable",
    ];
    const permittedStageIds = knownStageIds.filter(
      (stageId) =>
        authorizeCourseCheck(
          principal,
          eventId,
          capabilityForStage(stageId),
          policy,
        ) === null,
    );
    return {
      role: projectionRole,
      trackIds: assignedTrackIds(principal, eventId),
      canViewCommunicationEvidence,
      canViewFullDecisionEvidence: role === "admin" || isAgentPrincipal(principal),
      permittedStageIds,
      canDeferItems:
        authorizeCourseCheck(principal, eventId, "defer", policy) === null,
      canStartDraftPreparation:
        authorizeCourseCheck(
          principal,
          eventId,
          "propose_communication",
          policy,
        ) === null,
      viewerActorId: principal.id,
      policy: policy ?? undefined,
      canViewTechnicalEvidence:
        role === "admin" || isAgentPrincipal(principal),
    };
  }

  async function projectCourseCheckResponsePlan(
    store: ReturnType<AppBindings["EVENT_STORE"]["getByName"]>,
    plan: import("../shared/course-check").CourseCheckPlan,
    principal: OrganizerPrincipal,
    eventId: string,
  ) {
    const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    return (await store.projectCourseCheckPlan(
      plan,
      courseCheckProjectionOptions(principal, eventId, policy),
    )) as import("../shared/course-check").CourseCheckPlan | null;
  }

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.get(
    `${__ccBase}/policy`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      {
        const denial = authorizeCourseCheck(principal, eventId, "read");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const policy = (await c.env.EVENT_STORE.getByName(eventId).getCourseCheckPolicy()) as EventCourseCheckPolicy;
      return c.json({ policy });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.put(
    `${__ccBase}/policy`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!isEventAdmin(principal, eventId)) {
        return c.json(
          {
            error: "Administrator access is required to change Course Check policy.",
            code: "missing_authority",
          },
          403,
        );
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        policy?: Partial<EventCourseCheckPolicy>;
      } | null;
      const merged = mergeCourseCheckPolicy(body?.policy ?? null);
      const safe = assertPolicyDoesNotWeakenBaseline(merged);
      if (!safe.ok) {
        return c.json({ error: safe.error, code: "policy_weakens_baseline" }, 400);
      }
      const policy = (await c.env.EVENT_STORE.getByName(eventId).setCourseCheckPolicy(
        merged,
      )) as EventCourseCheckPolicy;
      return c.json({ policy });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
    `${__ccBase}/ux-events`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      const denial = authorizeCourseCheck(principal, eventId, "read");
      if (denial) return c.json(denial.body, denial.status);
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const parsed = parseCourseCheckUxEvent(
        await c.req.json().catch(() => null),
      );
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const headerKey = c.req.header("idempotency-key");
      if (headerKey && headerKey !== parsed.event.id) {
        return c.json(
          { error: "The idempotency key must match the event id." },
          400,
        );
      }
      const result = await c.env.EVENT_STORE.getByName(
        eventId,
      ).recordCourseCheckUxEvent(parsed.event);
      return c.json(
        { accepted: true, duplicate: !result.created },
        result.created ? 202 : 200,
      );
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.get(
    `${__ccBase}/ux-evidence`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!isEventAdmin(principal, eventId)) {
        return c.json(
          { error: "Administrator access is required to export UX evidence." },
          403,
        );
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const evidence = await c.env.EVENT_STORE.getByName(
        eventId,
      ).getCourseCheckUxEvidence();
      return c.json(evidence);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.get(
    `${__ccBase}/ux-validation-scenarios`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!isEventAdmin(principal, eventId)) {
        return c.json(
          { error: "Administrator access is required to use validation fixtures." },
          403,
        );
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      return c.json({
        evidenceClass: "seeded_automated_behavior_not_human_usability",
        scenarios: COURSE_CHECK_VALIDATION_SCENARIOS,
      });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.get(`${__ccBase}`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    {
      const denial = authorizeCourseCheck(principal, eventId, "read");
      if (denial) return c.json(denial.body, denial.status);
    }
    if (!principal) return c.json({ error: "Unauthorized" }, 401);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    const options = courseCheckProjectionOptions(principal, eventId, policy);
    const listed = (await store.listCourseCheckPlans()) as import("../shared/course-check").CourseCheckPlan[];
    const plans = (
      await Promise.all(
        listed.map(async (plan) => store.projectCourseCheckPlan(plan, options)),
      )
    ).filter(Boolean);
    return c.json({ plans });
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/communications`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "propose_communication");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      decisionPlanId?: unknown;
      proposalIds?: unknown;
      sessionIds?: unknown;
      speakerIds?: unknown;
      taskIds?: unknown;
      templateKind?: unknown;
      subject?: unknown;
      bodyText?: unknown;
      bodyHtml?: unknown;
      portalInvitation?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    try {
      const store = c.env.EVENT_STORE.getByName(eventId);
      const result = (await store.createCommunicationCourseCheck({
        decisionPlanId:
          typeof body?.decisionPlanId === "string" ? body.decisionPlanId.trim() : undefined,
        proposalIds: asStringArray(body?.proposalIds),
        sessionIds: asStringArray(body?.sessionIds),
        speakerIds: asStringArray(body?.speakerIds),
        taskIds: asStringArray(body?.taskIds),
        templateKind:
          body?.templateKind === "acceptance" ||
          body?.templateKind === "decline" ||
          body?.templateKind === "custom"
            ? body.templateKind
            : undefined,
        subject: typeof body?.subject === "string" ? body.subject : undefined,
        bodyText: typeof body?.bodyText === "string" ? body.bodyText : undefined,
        bodyHtml: typeof body?.bodyHtml === "string" ? body.bodyHtml : undefined,
        portalInvitation: body?.portalInvitation === true,
        portalBaseUrl: new URL(c.req.url).origin,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as { plan: import("../shared/course-check").CourseCheckPlan; created: boolean };
      const projected = await projectCourseCheckResponsePlan(
        store,
        result.plan,
        principal!,
        eventId,
      );
      if (!projected) return c.json({ error: "Course Check not found" }, 404);
      return c.json(projected, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to create Communication Course Check",
        },
        400,
      );
    }
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/revise`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "revise");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      subject?: unknown;
      bodyText?: unknown;
      bodyHtml?: unknown;
      recipientSelection?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error: "planVersion, digest, and idempotencyKey are required to revise a Course Check.",
        },
        400,
      );
    }
    const recipientSelection = Array.isArray(body.recipientSelection)
      ? body.recipientSelection
          .map((row) => {
            const item = row as { recipientId?: unknown; selected?: unknown };
            if (typeof item.recipientId !== "string") return null;
            return {
              recipientId: item.recipientId,
              selected: Boolean(item.selected),
            };
          })
          .filter((row): row is { recipientId: string; selected: boolean } => Boolean(row))
      : undefined;
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = (await store.reviseCommunicationCourseCheck({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      bodyText: typeof body.bodyText === "string" ? body.bodyText : undefined,
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : undefined,
      recipientSelection,
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    const projected = await projectCourseCheckResponsePlan(
      store,
      result.plan,
      principal!,
      eventId,
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected, result.created ? 201 : 200);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/create-drafts`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "create_drafts");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      stageId?: unknown;
      idempotencyKey?: unknown;
      reason?: unknown;
      softWarningOverrides?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, and idempotencyKey are required to create communication drafts.",
        },
        400,
      );
    }
    const softWarningOverrides = Array.isArray(body.softWarningOverrides)
      ? body.softWarningOverrides
          .map((row) => {
            const item = row as { findingId?: unknown; reason?: unknown };
            if (typeof item.findingId !== "string") return null;
            return {
              findingId: item.findingId,
              reason: typeof item.reason === "string" ? item.reason : null,
            };
          })
          .filter((row): row is { findingId: string; reason: string | null } => Boolean(row))
      : undefined;
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = (await store.createCommunicationDrafts({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      stageId: typeof body.stageId === "string" ? body.stageId : "create-drafts",
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      reason: typeof body.reason === "string" ? body.reason : null,
      softWarningOverrides,
    })) as
      | {
          ok: true;
          plan: import("../shared/course-check").CourseCheckPlan;
          created: boolean;
          endorsed?: boolean;
        }
      | {
          ok: false;
          status: 400 | 403 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
          findings?: import("../shared/course-check").CourseCheckFinding[];
          changedInputs?: string[];
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
          findings: result.findings,
          changedInputs: result.changedInputs,
        },
        result.status,
      );
    }
    const projected = await projectCourseCheckResponsePlan(
      store,
      result.plan,
      principal!,
      eventId,
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected, result.created && !result.endorsed ? 201 : 200);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/send`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const sendPolicy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    {
      const denial = authorizeCourseCheck(principal, eventId, "send", sendPolicy);
      if (denial) return c.json(denial.body, denial.status);
    }
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      stageId?: unknown;
      idempotencyKey?: unknown;
      reason?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, and idempotencyKey are required to send communication.",
        },
        400,
      );
    }
    const result = (await store.startCommunicationSend({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      stageId: typeof body.stageId === "string" ? body.stageId : "send-messages",
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      reason: typeof body.reason === "string" ? body.reason : null,
    })) as
      | {
          ok: true;
          plan: import("../shared/course-check").CourseCheckPlan;
          created: boolean;
        }
      | {
          ok: false;
          status: 400 | 403 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
          changedInputs?: string[];
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
          changedInputs: result.changedInputs,
        },
        result.status,
      );
    }
    if (result.created && options.communicationEmailSender) {
      await flushCommunicationEffects({
        store,
        sender: options.communicationEmailSender,
        now: new Date(),
        limit: 50,
      });
      const delivered = await store.getCourseCheckPlan(planId);
      if (delivered) {
        const projected = await projectCourseCheckResponsePlan(
          store,
          delivered,
          principal!,
          eventId,
        );
        if (!projected) return c.json({ error: "Course Check not found" }, 404);
        return c.json(projected, 202);
      }
    }
    const projected = await projectCourseCheckResponsePlan(
      store,
      result.plan,
      principal!,
      eventId,
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected, result.created ? 202 : 200);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/effects/:effectId/retry`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "retry");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (!idempotencyKey) {
        return c.json({ error: "idempotencyKey is required" }, 400);
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const result = (await store.retryCommunicationEffect({
        planId: param(c, "planId"),
        effectId: param(c, "effectId"),
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 409;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      if (result.created && options.communicationEmailSender) {
        await flushCommunicationEffects({
          store,
          sender: options.communicationEmailSender,
          now: new Date(),
          limit: 50,
        });
        const delivered = await store.getCourseCheckPlan(param(c, "planId"));
        if (delivered) {
          const projected = await projectCourseCheckResponsePlan(
            store,
            delivered,
            principal!,
            eventId,
          );
          if (!projected) return c.json({ error: "Course Check not found" }, 404);
          return c.json(projected);
        }
      }
      const projected = await projectCourseCheckResponsePlan(
        store,
        result.plan,
        principal!,
        eventId,
      );
      if (!projected) return c.json({ error: "Course Check not found" }, 404);
      return c.json(projected);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/effects/:effectId/reconcile`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "reconcile");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        outcome?: unknown;
        providerReference?: unknown;
        note?: unknown;
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (
        !body ||
        (body.outcome !== "delivered" && body.outcome !== "not_delivered") ||
        typeof body.note !== "string" ||
        !idempotencyKey
      ) {
        return c.json(
          { error: "outcome, note, and idempotencyKey are required" },
          400,
        );
      }
      const result = (await c.env.EVENT_STORE.getByName(eventId).reconcileCommunicationEffect({
        planId: param(c, "planId"),
        effectId: param(c, "effectId"),
        outcome: body.outcome,
        providerReference:
          typeof body.providerReference === "string" ? body.providerReference : null,
        note: body.note,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 409;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const projected = await projectCourseCheckResponsePlan(
        store,
        result.plan,
        principal!,
        eventId,
      );
      if (!projected) return c.json({ error: "Course Check not found" }, 404);
      return c.json(projected);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/effects/:effectId/correction`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "compensate");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        reason?: unknown;
        subject?: unknown;
        bodyText?: unknown;
        bodyHtml?: unknown;
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (
        !body ||
        typeof body.reason !== "string" ||
        typeof body.subject !== "string" ||
        typeof body.bodyText !== "string" ||
        !idempotencyKey
      ) {
        return c.json(
          { error: "reason, subject, bodyText, and idempotencyKey are required" },
          400,
        );
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const result = (await store.createCommunicationCorrection({
        planId: param(c, "planId"),
        effectId: param(c, "effectId"),
        reason: body.reason,
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : undefined,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 409;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      const projected = await projectCourseCheckResponsePlan(
        store,
        result.plan,
        principal!,
        eventId,
      );
      if (!projected) return c.json({ error: "Course Check not found" }, 404);
      return c.json(projected, result.created ? 201 : 200);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/defer`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "defer");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      itemIds?: unknown;
      reason?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !Array.isArray(body.itemIds) ||
      typeof body.reason !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, itemIds, reason, and idempotencyKey are required to defer items.",
        },
        400,
      );
    }
    const itemIds = body.itemIds.filter((id): id is string => typeof id === "string");
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = (await store.deferCourseCheckItems({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      itemIds,
      reason: body.reason,
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    const projected = await store.projectCourseCheckPlan(
      result.plan,
      courseCheckProjectionOptions(principal!, eventId, policy),
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected, result.created ? 201 : 200);
  });


  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/defer`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "defer");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      itemIds?: unknown;
      reason?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !Array.isArray(body.itemIds) ||
      typeof body.reason !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, itemIds, reason, and idempotencyKey are required to defer items.",
        },
        400,
      );
    }
    const itemIds = body.itemIds.filter((id): id is string => typeof id === "string");
    const result = (await c.env.EVENT_STORE.getByName(eventId).deferCourseCheckItems({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      itemIds,
      reason: body.reason,
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    return c.json(result.plan, result.created ? 201 : 200);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/guaranteed-speakers`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "propose_decision");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      sourceLabel?: unknown;
      title?: unknown;
      format?: unknown;
      trackId?: unknown;
      speakers?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return c.json({ error: "title is required" }, 400);
    }
    if (typeof body.trackId !== "string" || !body.trackId.trim()) {
      return c.json({ error: "trackId is required" }, 400);
    }
    if (!Array.isArray(body.speakers) || body.speakers.length === 0) {
      return c.json({ error: "At least one speaker is required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const speakers: Array<{
      name: string;
      email: string;
      biography?: string;
      role?: "primary" | "co";
    }> = body.speakers.map((speaker) => {
      const row = speaker as {
        name?: unknown;
        email?: unknown;
        biography?: unknown;
        role?: unknown;
      };
      return {
        name: typeof row.name === "string" ? row.name : "",
        email: typeof row.email === "string" ? row.email : "",
        biography: typeof row.biography === "string" ? row.biography : "",
        role:
          row.role === "primary" || row.role === "co" ? row.role : undefined,
      };
    });
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = (await store.createGuaranteedSpeakerCourseCheck({
      sourceLabel:
        typeof body.sourceLabel === "string" ? body.sourceLabel : "Guaranteed speaker",
      title: body.title,
      format: typeof body.format === "string" ? body.format : "talk",
      trackId: body.trackId,
      speakers,
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
    })) as { plan: import("../shared/course-check").CourseCheckPlan; created: boolean };
    return c.json(result.plan, result.created ? 201 : 200);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.get(`${__ccBase}/:planId`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    {
      const denial = authorizeCourseCheck(principal, eventId, "read");
      if (denial) return c.json(denial.body, denial.status);
    }
    if (!principal) return c.json({ error: "Unauthorized" }, 401);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const plan = await store.getCourseCheckPlan(planId);
    if (!plan) return c.json({ error: "Course Check not found" }, 404);
    const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    const projected = await store.projectCourseCheckPlan(
      plan,
      courseCheckProjectionOptions(principal, eventId, policy),
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
    `${__ccBase}/:planId/privacy-erase`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      const planId = param(c, "planId");
      if (!isEventAdmin(principal, eventId)) {
        return c.json(
          {
            error: "Administrator access is required for privacy erasure.",
            code: "missing_authority",
          },
          403,
        );
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        reason?: unknown;
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      const reason = typeof body?.reason === "string" ? body.reason : "";
      if (!idempotencyKey) {
        return c.json({ error: "idempotencyKey is required." }, 400);
      }
      const result = (await c.env.EVENT_STORE.getByName(eventId).eraseCourseCheckPersonalPayloads({
        planId,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
        reason,
        idempotencyKey,
      })) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            result: import("../shared/course-check").PrivacyErasureResult;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 404;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      return c.json({ plan: result.plan, erasure: result.result }, result.created ? 200 : 200);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/:planId/apply`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const planId = param(c, "planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // Stage capability re-checked below from body.stageId (revocation-safe).
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      stageId?: unknown;
      idempotencyKey?: unknown;
      reason?: unknown;
      softWarningOverrides?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      typeof body.stageId !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, stageId, and idempotencyKey are required to apply a Course Check.",
        },
        400,
      );
    }
    const softWarningOverrides = Array.isArray(body.softWarningOverrides)
      ? body.softWarningOverrides
          .map((row) => {
            const item = row as { findingId?: unknown; reason?: unknown };
            if (typeof item.findingId !== "string") return null;
            return {
              findingId: item.findingId,
              reason: typeof item.reason === "string" ? item.reason : null,
            };
          })
          .filter((row): row is { findingId: string; reason: string | null } => Boolean(row))
      : undefined;
    const store = c.env.EVENT_STORE.getByName(eventId);
    const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
    {
      const denial = authorizeCourseCheck(
        principal,
        eventId,
        capabilityForStage(body.stageId),
        policy,
      );
      if (denial) return c.json(denial.body, denial.status);
    }
    const result = (await store.applyCourseCheck({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      stageId: body.stageId,
      idempotencyKey,
      actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      reason: typeof body.reason === "string" ? body.reason : null,
      softWarningOverrides,
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 403 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
          findings?: import("../shared/course-check").CourseCheckFinding[];
          changedInputs?: string[];
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
          findings: result.findings,
          changedInputs: result.changedInputs,
        },
        result.status,
      );
    }

    const secret = signingSecret(c.env, options.signingSecret);
    if (secret) {
      const grants = await store.listPortalTokensForPlan(planId);
      const exp = Math.floor(Date.now() / 1000) + PORTAL_TOKEN_TTL_SECONDS;
      for (const grant of grants) {
        if (grant.signedToken || grant.revokedAt) continue;
        const token = await signPortalToken(secret, {
          v: 1,
          kind: "portal",
          eventId,
          speakerId: grant.speakerId,
          tokenId: grant.tokenId,
          exp,
        });
        await store.setPortalTokenSignature({
          tokenId: grant.tokenId,
          signedToken: token,
          expiresAt: new Date(exp * 1000).toISOString(),
        });
      }
    }

    const projected = await store.projectCourseCheckPlan(
      result.plan,
      courseCheckProjectionOptions(principal!, eventId, policy),
    );
    if (!projected) return c.json({ error: "Course Check not found" }, 404);
    return c.json(projected);
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/airtable/disposition`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      const planId = param(c, "planId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "integration_plan");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        planVersion?: unknown;
        digest?: unknown;
        disposition?: unknown;
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (
        !body ||
        !Number.isInteger(body.planVersion) ||
        typeof body.digest !== "string" ||
        (body.disposition !== "deferred" && body.disposition !== "removed") ||
        !idempotencyKey
      ) {
        return c.json(
          {
            error:
              "planVersion, digest, disposition, and idempotencyKey are required.",
          },
          400,
        );
      }
      const result = await c.env.EVENT_STORE.getByName(
        eventId,
      ).setAirtableStageDisposition({
        planId,
        planVersion: body.planVersion as number,
        digest: body.digest,
        disposition: body.disposition,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      }) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 409;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      return c.json(result.plan);
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/airtable/execute`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      const planId = param(c, "planId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        planVersion?: unknown;
        digest?: unknown;
        stageId?: unknown;
        idempotencyKey?: unknown;
        reason?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (
        !body ||
        !Number.isInteger(body.planVersion) ||
        typeof body.digest !== "string" ||
        !idempotencyKey
      ) {
        return c.json(
          { error: "planVersion, digest, and idempotencyKey are required." },
          400,
        );
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const policy = (await store.getCourseCheckPolicy()) as EventCourseCheckPolicy;
      {
        const denial = authorizeCourseCheck(
          principal,
          eventId,
          "integration_execute",
          policy,
        );
        if (denial) return c.json(denial.body, denial.status);
      }
      const plan = (await store.getCourseCheckPlan(planId)) as
        | import("../shared/course-check").CourseCheckPlan
        | null;
      if (!plan) return c.json({ error: "Course Check not found" }, 404);
      if (plan.version !== body.planVersion || plan.digest !== body.digest) {
        return c.json(
          {
            error: "This Course Check changed since you loaded it.",
            code: "plan_version_mismatch",
          },
          409,
        );
      }
      if (!plan.receipt || plan.body.airtable.disposition !== "active") {
        return c.json(
          {
            error: "The Write to Airtable stage is not ready.",
            code: "airtable_stage_not_ready",
          },
          409,
        );
      }
      const connection = await resolveAirtableConnection({
        store,
        env: c.env,
        clientFactory: airtableFactory,
        credentialClientFactory: airtableCredentialFactory,
      });
      if (!connection) {
        const projected = await projectCourseCheckResponsePlan(
          store,
          plan,
          principal!,
          eventId,
        );
        if (!projected) return c.json({ error: "Course Check not found" }, 404);
        return c.json({
          plan: projected,
          effects: plan.body.airtable.effects,
          degraded: true,
          guidance: AIRTABLE_HEALTH_GUIDANCE.unconfigured,
        });
      }
      const result = await executeAirtableEffects({
        store,
        client: connection.client,
        planId,
        planVersion: body.planVersion as number,
        digest: body.digest,
        stageId: typeof body.stageId === "string" ? body.stageId : "write-airtable",
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
        reason: typeof body.reason === "string" ? body.reason : null,
      });
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      const projected = await projectCourseCheckResponsePlan(
        store,
        result.plan,
        principal!,
        eventId,
      );
      if (!projected) return c.json({ error: "Course Check not found" }, 404);
      return c.json({ ...result, plan: projected, degraded: false });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/airtable/reconcile`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      const planId = param(c, "planId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "reconcile");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        planVersion?: unknown;
        digest?: unknown;
        idempotencyKey?: unknown;
      } | null;
      if (
        !body ||
        !Number.isInteger(body.planVersion) ||
        typeof body.digest !== "string" ||
        typeof body.idempotencyKey !== "string" ||
        !body.idempotencyKey.trim()
      ) {
        return c.json(
          { error: "planVersion, digest, and idempotencyKey are required." },
          400,
        );
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const plan = await (store as unknown as {
        getCourseCheckPlan(id: string): Promise<import("../shared/course-check").CourseCheckPlan | null>;
      }).getCourseCheckPlan(planId);
      if (!plan) return c.json({ error: "Course Check not found" }, 404);
      if (plan.version !== body.planVersion || plan.digest !== body.digest) {
        return c.json(
          { error: "This Course Check changed since you loaded it.", code: "plan_version_mismatch" },
          409,
        );
      }
      const connection = await resolveAirtableConnection({
        store,
        env: c.env,
        clientFactory: airtableFactory,
        credentialClientFactory: airtableCredentialFactory,
      });
      if (!connection) {
        return c.json({
          plan,
          effects: plan.body.airtable.effects,
          degraded: true,
          guidance: AIRTABLE_HEALTH_GUIDANCE.unconfigured,
        });
      }
      const result = await reconcileUnknownAirtableEffects({
        store,
        client: connection.client,
        planId,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      });
      return c.json({ ...result, degraded: false });
    },
  );

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(
      `${__ccBase}/:planId/airtable/effects/:effectId/compensations`,
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = param(c, "eventId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      {
        const denial = authorizeCourseCheck(principal, eventId, "compensate");
        if (denial) return c.json(denial.body, denial.status);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        planVersion?: unknown;
        digest?: unknown;
        reason?: unknown;
        idempotencyKey?: unknown;
      } | null;
      if (
        !body ||
        !Number.isInteger(body.planVersion) ||
        typeof body.digest !== "string" ||
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        typeof body.idempotencyKey !== "string" ||
        !body.idempotencyKey.trim()
      ) {
        return c.json(
          { error: "planVersion, digest, reason, and idempotencyKey are required." },
          400,
        );
      }
      const store = c.env.EVENT_STORE.getByName(eventId);
      const compensationStore = store as unknown as {
        getCourseCheckPlan(id: string): Promise<import("../shared/course-check").CourseCheckPlan | null>;
        createAirtableCompensation(args: Record<string, unknown>): Promise<{
          plan: import("../shared/course-check").CourseCheckPlan;
          effect: import("../shared/airtable").AirtableEffect;
          created: boolean;
        }>;
      };
      const plan = await compensationStore.getCourseCheckPlan(param(c, "planId"));
      if (!plan) return c.json({ error: "Course Check not found" }, 404);
      if (plan.version !== body.planVersion || plan.digest !== body.digest) {
        return c.json(
          { error: "This Course Check changed since you loaded it.", code: "plan_version_mismatch" },
          409,
        );
      }
      try {
        const result = await compensationStore.createAirtableCompensation({
          planId: plan.id,
          effectId: param(c, "effectId"),
          reason: body.reason,
          idempotencyKey: body.idempotencyKey,
          actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
        });
        return c.json(result, result.created ? 201 : 200);
      } catch (error) {
        return c.json({ error: errorMessage(error), code: "compensation_unavailable" }, 409);
      }
    },
  );

  app.get("/api/events/:eventId/program", async (c) => {
    const eventId = param(c, "eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const revisionId = c.req.query("revision") ?? undefined;
    const program = await c.env.EVENT_STORE.getByName(eventId).getPublicProgram(
      revisionId,
    );
    if (!program) {
      return c.json({ error: "Public program not found" }, 404);
    }
    return c.json(program);
  });

  app.get("/api/events/:eventId/embed-configs", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    return c.json({
      configs: await c.env.EVENT_STORE.getByName(eventId).listPublicEmbedConfigs(),
    });
  });

  app.post("/api/events/:eventId/embed-configs", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as PublicEmbedConfigInput | null;
    if (!body) return c.json({ error: "Embed configuration is required." }, 400);
    const result = await c.env.EVENT_STORE.getByName(eventId).savePublicEmbedConfig(body);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return new Response(JSON.stringify(result.config), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  });

  app.patch("/api/events/:eventId/embed-configs/:embedId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const embedId = param(c, "embedId");
    const prior = await c.env.EVENT_STORE.getByName(eventId).getPublicEmbedConfig(embedId, {
      includeDisabled: true,
    });
    if (!prior) return c.json({ error: "Embed configuration not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Partial<PublicEmbedConfigInput> | null;
    if (!body) return c.json({ error: "Embed configuration patch is required." }, 400);
    const result = await c.env.EVENT_STORE.getByName(eventId).savePublicEmbedConfig({
      id: embedId,
      name: typeof body.name === "string" ? body.name : prior.name,
      widget: body.widget ?? prior.widget,
      theme: body.theme ?? prior.theme,
      filters: body.filters ?? prior.filters,
      fields: body.fields ?? prior.fields,
      revisionId: body.revisionId === undefined ? prior.revisionId : body.revisionId,
      disabled: body.disabled === undefined ? prior.disabled : body.disabled,
    });
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json(result.config);
  });

  app.get("/api/events/:eventId/public-embeds/:embedId", async (c) => {
    const eventId = param(c, "eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const resolved = await c.env.EVENT_STORE.getByName(eventId).resolvePublicEmbed(
      param(c, "embedId"),
    );
    if (!resolved) return c.json({ error: "Embed not found" }, 404);
    return c.json(resolved);
  });

  app.get("/api/events/:eventId/public-embeds/:embedId/feed.json", async (c) => {
    const eventId = param(c, "eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const resolved = await c.env.EVENT_STORE.getByName(eventId).resolvePublicEmbed(
      param(c, "embedId"),
    );
    if (!resolved) return c.json({ error: "Embed not found" }, 404);
    return c.json(resolved.program);
  });

  app.get("/api/events/:eventId/program/calendar.ics", async (c) => {
    const eventId = param(c, "eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const sessionIds = (c.req.query("sessionIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const revisionId = c.req.query("revision") ?? undefined;
    const result = await c.env.EVENT_STORE.getByName(eventId).getPublicProgramCalendarIcs(
      sessionIds,
      revisionId,
    );
    if (!result.ok) {
      return c.json(
        { error: result.status === 400 ? "At least one session is required" : "Session not found" },
        result.status,
      );
    }
    return new Response(result.ics, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "private, max-age=300",
      },
    });
  });



  app.get("/api/events/:eventId/program/assets/:assetId", async (c) => {
    const eventId = param(c, "eventId");
    const assetId = param(c, "assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) return c.json({ error: "File uploads are not configured." }, 503);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const revisionId = c.req.query("revision") ?? undefined;
    if (!(await store.isPublicProgramHeadshot(assetId, revisionId))) {
      return c.json({ error: "Asset not found." }, 404);
    }
    const asset = await store.getAsset(assetId);
    if (!asset || asset.status !== "complete" || asset.purpose !== "portal_headshot") {
      return c.json({ error: "Asset not found." }, 404);
    }
    const object = await c.env.ASSETS.get(asset.object_key);
    if (!object) return c.json({ error: "Asset file is missing." }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": asset.mime,
        "cache-control": "public, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${sanitizeUploadFileName(asset.file_name)}"`,
      },
    });
  });


  app.get("/api/events/:eventId/program/sessions/:sessionId/calendar.ics", async (c) => {
    const eventId = param(c, "eventId");
    const sessionId = param(c, "sessionId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const revisionId = c.req.query("revision") ?? undefined;
    const result = await c.env.EVENT_STORE.getByName(eventId).getPublicProgramSessionIcs(
      sessionId,
      revisionId,
    );
    if (!result.ok) {
      return c.json({ error: "Session not found" }, 404);
    }
    return new Response(result.ics, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        // inline so webcal/https open in calendar apps; filename kept for Save As
        "content-disposition": `inline; filename="${result.filename}"`,
        "cache-control": "public, max-age=300",
      },
    });
  });

  for (const { app: __ccApp, base: __ccBase } of __courseCheckTargets) __ccApp.post(`${__ccBase}/publications`, async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    {
      const denial = authorizeCourseCheck(principal, eventId, "propose_publication");
      if (denial) return c.json(denial.body, denial.status);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      operation?: unknown;
      restoreRevisionId?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    const operation = body?.operation;
    if (
      operation !== "publish" &&
      operation !== "unpublish" &&
      operation !== "restore"
    ) {
      return c.json(
        { error: "operation must be publish, unpublish, or restore" },
        400,
      );
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    if (
      operation === "restore" &&
      (typeof body?.restoreRevisionId !== "string" || !body.restoreRevisionId.trim())
    ) {
      return c.json({ error: "restoreRevisionId is required for restore" }, 400);
    }
    try {
      const result = (await c.env.EVENT_STORE.getByName(
        eventId,
      ).createPublicationCourseCheck({
        operation,
        restoreRevisionId:
          typeof body?.restoreRevisionId === "string"
            ? body.restoreRevisionId.trim()
            : undefined,
        idempotencyKey,
        actor: toCourseCheckActor(principal!, parseInitiatingHumanHeader(c.req.raw)),
      })) as {
        plan: import("../shared/course-check").CourseCheckPlan;
        created: boolean;
      };
      return c.json(result.plan, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to create Publication Course Check",
        },
        400,
      );
    }
  });

  /** Legacy test seam — still valid-subset publish without Course Check ceremony. */
  app.post("/api/events/:eventId/program/publish-test", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const program = await c.env.EVENT_STORE.getByName(
      eventId,
    ).publishPublicProgramRevisionForTest();
    return c.json(program, 201);
  });

  app.get("/api/events/:eventId/sessions", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const agenda = await c.env.EVENT_STORE.getByName(eventId).getAgendaWorkspace();
    return c.json(agenda);
  });

  app.post("/api/events/:eventId/agenda/auto-place/preview", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) return c.json({ error: "Unauthorized" }, 401);
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as { selectedSessionIds?: unknown; includeManual?: unknown } | null;
    if (!body || typeof body !== "object") return c.json({ error: "JSON body is required." }, 400);
    const selectedSessionIds = body.selectedSessionIds;
    if (selectedSessionIds !== undefined && (!Array.isArray(selectedSessionIds) || selectedSessionIds.some((id) => typeof id !== "string"))) {
      return c.json({ error: "selectedSessionIds must be an array of session IDs." }, 400);
    }
    if (body.includeManual !== undefined && typeof body.includeManual !== "boolean") {
      return c.json({ error: "includeManual must be a boolean." }, 400);
    }
    const preview = await c.env.EVENT_STORE.getByName(eventId).previewAutoPlace({
      selectedSessionIds: selectedSessionIds as string[] | undefined,
      includeManual: body.includeManual as boolean | undefined,
      actorId: principal!.id,
      actorName: principal!.displayName,
    });
    return c.json(preview, 201);
  });

  app.post("/api/events/:eventId/agenda/auto-place/apply", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) return c.json({ error: "Unauthorized" }, 401);
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as { previewId?: unknown; previewDigest?: unknown; agendaVersion?: unknown; idempotencyKey?: unknown } | null;
    const idempotencyKey = (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) || c.req.header("idempotency-key")?.trim() || "";
    if (!body || typeof body.previewId !== "string" || typeof body.previewDigest !== "string" || !Number.isInteger(body.agendaVersion) || !idempotencyKey) {
      return c.json({ error: "previewId, previewDigest, agendaVersion, and idempotencyKey are required." }, 400);
    }
    const result = await c.env.EVENT_STORE.getByName(eventId).applyAutoPlace({
      previewId: body.previewId,
      previewDigest: body.previewDigest,
      agendaVersion: body.agendaVersion as number,
      idempotencyKey,
      actorId: principal!.id,
      actorName: principal!.displayName,
    });
    if (!result.ok) return c.json({ error: result.error, ...(result.code ? { code: result.code } : {}), ...(result.currentVersion === undefined ? {} : { currentVersion: result.currentVersion }) }, result.status);
    return c.json(result.result);
  });


  app.get("/api/events/:eventId/session-content", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const workspace = await c.env.EVENT_STORE.getByName(
      eventId,
    ).getSessionContentWorkspace();
    return c.json(workspace);
  });

  app.patch("/api/events/:eventId/session-content/:sessionId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const sessionId = param(c, "sessionId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      expectedVersion?: unknown;
      title?: unknown;
      abstract?: unknown;
      publicContent?: unknown;
      status?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "JSON body is required." }, 400);
    }
    if (typeof body.expectedVersion !== "number") {
      return c.json({ error: "expectedVersion must be a number." }, 400);
    }
    for (const field of ["title", "abstract", "publicContent"] as const) {
      if (body[field] !== undefined && typeof body[field] !== "string") {
        return c.json({ error: `${field} must be a string.` }, 400);
      }
    }
    if (
      body.status !== undefined &&
      body.status !== "draft" &&
      body.status !== "needs-changes" &&
      body.status !== "approved"
    ) {
      return c.json({ error: "status must be draft, needs-changes, or approved." }, 400);
    }
    await loadEvent(c.env, seed);
    const result = (await c.env.EVENT_STORE.getByName(eventId).updateSessionContent(
      sessionId,
      {
        expectedVersion: body.expectedVersion,
        title: body.title as string | undefined,
        abstract: body.abstract as string | undefined,
        publicContent: body.publicContent as string | undefined,
        status: body.status,
      },
      { id: principal!.id, name: principal!.displayName },
    )) as
      | { ok: true; result: import("../shared/events").SessionContentMutationResponse }
      | { ok: false; status: 400 | 404 | 409; code: string; error: string };
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json(result.result);
  });

  app.post("/api/events/:eventId/session-content/:sessionId/restore", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const sessionId = param(c, "sessionId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      expectedVersion?: unknown;
      restoreVersion?: unknown;
    } | null;
    if (
      !body ||
      typeof body.expectedVersion !== "number" ||
      typeof body.restoreVersion !== "number"
    ) {
      return c.json(
        { error: "expectedVersion and restoreVersion must be numbers." },
        400,
      );
    }
    await loadEvent(c.env, seed);
    const result = (await c.env.EVENT_STORE.getByName(eventId).restoreSessionContent(
      sessionId,
      body.expectedVersion,
      body.restoreVersion,
      { id: principal!.id, name: principal!.displayName },
    )) as
      | { ok: true; result: import("../shared/events").SessionContentMutationResponse }
      | { ok: false; status: 400 | 404 | 409; code: string; error: string };
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json(result.result);
  });

  app.patch("/api/events/:eventId/sessions/:sessionId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    const sessionId = param(c, "sessionId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as SessionPlacementPatch | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "JSON body is required." }, 400);
    }
    const patch: SessionPlacementPatch = {};
    if ("roomId" in body) {
      if (body.roomId !== null && typeof body.roomId !== "string") {
        return c.json({ error: "roomId must be a string or null." }, 400);
      }
      patch.roomId = body.roomId;
    }
    if ("startsAt" in body) {
      if (body.startsAt !== null && typeof body.startsAt !== "string") {
        return c.json({ error: "startsAt must be a string or null." }, 400);
      }
      patch.startsAt = body.startsAt;
    }
    if ("endsAt" in body) {
      if (body.endsAt !== null && typeof body.endsAt !== "string") {
        return c.json({ error: "endsAt must be a string or null." }, 400);
      }
      patch.endsAt = body.endsAt;
    }
    if ("expectedAgendaVersion" in body) {
      if (typeof body.expectedAgendaVersion !== "number") {
        return c.json({ error: "expectedAgendaVersion must be a number." }, 400);
      }
      patch.expectedAgendaVersion = body.expectedAgendaVersion;
    }
    const result = (await c.env.EVENT_STORE.getByName(eventId).updateSessionPlacement(
      sessionId,
      patch,
    )) as
      | { ok: true; result: import("../shared/events").SessionPlacementResponse }
      | { ok: false; status: 400 | 404 | 409; error: string; code?: string; currentVersion?: number };
    if (!result.ok) {
      return c.json({ error: result.error, ...(result.code ? { code: result.code } : {}), ...(result.currentVersion === undefined ? {} : { currentVersion: result.currentVersion }) }, result.status);
    }
    return c.json(result.result);
  });

  app.get("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const sync = await store.getAirtableSyncState();
    return c.json({ sync });
  });

  app.put("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      baseId?: unknown;
      accessToken?: unknown;
    } | null;
    if (!body || typeof body.baseId !== "string") {
      return c.json({ error: "baseId is required." }, 400);
    }
    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken : "";
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      await store.saveAirtableConnection({
        baseId: body.baseId,
        accessToken,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unable to save connection." },
        400,
      );
    }

    const connection = await resolveAirtableConnection({
      store,
      env: c.env,
      clientFactory: airtableFactory,
      credentialClientFactory: airtableCredentialFactory,
    });
    const result = await pullAirtableForEvent({
      store,
      client: connection?.client ?? null,
      baseId: connection?.baseId ?? null,
    });
    return c.json({
      sync: await store.getAirtableSyncState(),
      pull: result,
    });
  });

  app.delete("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const sync = await store.clearAirtableConnection();
    return c.json({ sync });
  });

  app.post("/api/events/:eventId/integrations/airtable/pull", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = param(c, "eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const connection = await resolveAirtableConnection({
      store,
      env: c.env,
      clientFactory: airtableFactory,
      credentialClientFactory: airtableCredentialFactory,
    });
    const result = await pullAirtableForEvent({
      store,
      client: connection?.client ?? null,
      baseId: connection?.baseId ?? null,
    });
    return c.json({ pull: result, sync: await store.getAirtableSyncState() });
  });

  // Mount v1 after Course Check dual routes so agent paths hit parent handlers first.
  app.route("/api/v1", v1App);

  return app;
}
