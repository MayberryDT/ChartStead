import { DurableObject } from "cloudflare:workers";

import {
  createDefaultCfpDefinition,
  type CfpDefinitionV1,
  type UploadedAssetAnswer,
} from "../shared/cfp-definition";
import type {
  CourseCheckActionType,
  CourseCheckActor,
  CourseCheckPlan,
  CourseCheckPlanBody,
  CourseCheckPlanState,
  CourseCheckPlanVersion,
  CourseCheckReceipt,
  DecisionPlanBody,
  PlanMutationRecord,
  ProgramOutcome,
} from "../shared/course-check";
import {
  DEFAULT_AGE_WARNING_HOURS,
  DEFAULT_DECISION_BATCH_LIMIT,
} from "../shared/course-check";
import type {
  AirtablePullChange,
  AirtableSyncState,
} from "../shared/airtable";
import { AIRTABLE_HEALTH_GUIDANCE } from "../shared/airtable";
import { applyPullWinsToLocalRecord } from "../shared/airtable-field-map";
import type {
  AgendaWorkspaceResponse,
  CalendarIntentRecord,
  CoSpeakerInput,
  EventRecord,
  OnboardingBoard,
  OnboardingBoardSpeaker,
  OnboardingCompletionRequirement,
  OnboardingHistoryEntry,
  OnboardingReminderDraft,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerProposal,
  OrganizerSession,
  OutboxDeliveryStatus,
  OutboxMessage,
  OutboxMessageKind,
  PortalOnboardingTask,
  ProposalAuditEvent,
  ProposalInput,
  ProposalStatus,
  PublicProgramEventSlice,
  PublicProgramResponse,
  PublicProgramRevisionMeta,
  PublicProgramSession,
  PublicProgramSpeaker,
  PublishedCfpForm,
  ReminderDraftStatus,
  SessionPlacementPatch,
  SessionPlacementResponse,
  SpeakerPortalSession,
  SubmissionAnswers,
} from "../shared/events";
import { buildSessionIcs } from "../shared/public-program";
import {
  detectScheduleConflicts,
  placementStatus,
} from "../shared/schedule-conflicts";
import type { AssetClaimInput } from "./cfp-submissions";
import {
  decisionBodyDigestPayload,
  deferDecisionItems,
  hasBlockerFindings,
  markDecisionItemsApplied,
  planDecisionBatch,
  planDecisionCascade,
  planGuaranteedSpeaker,
  splitSelectionsIfNeeded,
  type ExistingSpeaker,
} from "./course-check/decision-planner";
import { digestPayload } from "./course-check/digest";
import { computeAgeWarning } from "./course-check/evidence";
import { createStableProposalId } from "./proposals";
import type { AppBindings } from "./types";

const DEFAULT_THEME_ACCENT = "#2f5d98";
const THEME_ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeThemeAccent(value: unknown): string {
  if (typeof value === "string" && THEME_ACCENT_PATTERN.test(value)) {
    return value.toLowerCase();
  }
  return DEFAULT_THEME_ACCENT;
}

interface EventRow {
  [key: string]: string | number;
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  submission_count: number;
  unreviewed_count: number;
  tracks_json: string;
  rooms_json: string;
  theme_accent: string;
}

interface ProposalRow {
  [key: string]: string | number;
  id: string;
  form_id: string;
  form_definition_version: number;
  answers_json: string;
  title: string;
  abstract: string;
  track_id: string;
  track_name: string;
  speaker_name: string;
  speaker_email: string;
  biography: string;
  supporting_link: string;
  session_format: string;
  workshop_duration: string;
  co_speakers_json: string;
  supporting_file_json: string;
  status: string;
  program_outcome: string;
  committee_note: string;
  private_note: string;
  review_version: number;
  submitted_at: string;
  confirmation_email_status: string;
}

interface CourseCheckPlanRow {
  [key: string]: string | number | null;
  id: string;
  action_type: string;
  state: string;
  version: number;
  digest: string;
  body_json: string;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  created_by_name: string;
  approval_json: string | null;
  receipt_id: string | null;
}

interface SpeakerRow {
  [key: string]: string | null;
  id: string;
  name: string;
  email: string;
  biography: string;
  headshot_asset_id: string | null;
  created_at: string;
}

interface OnboardingTaskRow {
  [key: string]: string | null;
  id: string;
  speaker_id: string;
  session_id: string | null;
  proposal_id: string | null;
  course_check_plan_id: string;
  title: string;
  kind: string;
  status: string;
  due_at: string | null;
  created_at: string;
  instructions: string;
  completion_requirement: string;
  readiness_flag: string | null;
  asset_id: string | null;
  completed_at: string | null;
  created_by: string;
}

interface ReminderDraftRow {
  [key: string]: string | null;
  id: string;
  speaker_id: string;
  proposal_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: string;
  missing_task_ids_json: string;
  outbox_id: string | null;
  last_error: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

interface OnboardingHistoryRow {
  [key: string]: string | null;
  id: string;
  speaker_id: string;
  task_id: string | null;
  type: string;
  summary: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

const HEADSHOT_MAX_BYTES = 5 * 1024 * 1024;
const TASK_FILE_MAX_BYTES = 25 * 1024 * 1024;
const HEADSHOT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function defaultCompletionRequirement(kind: string): OnboardingCompletionRequirement {
  if (kind === "headshot" || kind === "slides" || kind === "employer_approval") {
    return "file";
  }
  return "manual";
}

function daysUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return null;
  return Math.floor((due - nowMs) / (24 * 60 * 60 * 1000));
}

function mapPortalTask(
  row: OnboardingTaskRow,
  asset: {
    asset_id: string;
    file_name: string;
    mime: string;
    size_bytes: number;
  } | null,
): PortalOnboardingTask {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    speakerId: row.speaker_id,
    dueAt: row.due_at,
    instructions: row.instructions ?? "",
    completionRequirement:
      row.completion_requirement || defaultCompletionRequirement(row.kind),
    readinessFlag: row.readiness_flag,
    asset: asset
      ? {
          assetId: asset.asset_id,
          fileName: asset.file_name,
          mime: asset.mime,
          size: Number(asset.size_bytes),
        }
      : null,
    completedAt: row.completed_at,
  };
}

function mapReminderDraft(row: ReminderDraftRow): OnboardingReminderDraft {
  let missingTaskIds: string[] = [];
  try {
    missingTaskIds = JSON.parse(row.missing_task_ids_json || "[]") as string[];
  } catch {
    missingTaskIds = [];
  }
  return {
    id: row.id,
    speakerId: row.speaker_id,
    proposalId: row.proposal_id,
    toEmail: row.to_email,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    status: row.status as ReminderDraftStatus,
    missingTaskIds,
    outboxId: row.outbox_id,
    lastError: row.last_error,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  };
}

function mapOnboardingHistory(row: OnboardingHistoryRow): OnboardingHistoryEntry {
  return {
    id: row.id,
    speakerId: row.speaker_id,
    taskId: row.task_id,
    type: row.type,
    summary: row.summary,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export {
  HEADSHOT_MAX_BYTES,
  TASK_FILE_MAX_BYTES,
  HEADSHOT_MIME_TYPES,
  defaultCompletionRequirement,
};

export interface AcceptanceCascadeSnapshot {
  speakers: Array<{ id: string; name: string; email: string; biography: string }>;
  participations: Array<{
    id: string;
    speakerId: string;
    proposalId: string | null;
    titleSnapshot: string;
    organizationSnapshot: string;
    role: string;
  }>;
  sessions: Array<{
    id: string;
    proposalId: string | null;
    title: string;
    format: string;
    trackId: string;
  }>;
  tasks: Array<{ id: string; title: string; kind: string; speakerId: string }>;
  portalAccessIntents: Array<{
    id: string;
    speakerId: string;
    email: string;
    intent: string;
  }>;
  portalTokens: Array<{
    tokenId: string;
    speakerId: string;
    expiresAt: string;
    revokedAt: string | null;
    signedToken: string | null;
  }>;
  messagesQueued: number;
  calendarEffects: number;
  publicRevisions: number;
}

interface PortalTokenRow {
  [key: string]: string | null;
  token_id: string;
  speaker_id: string;
  proposal_id: string | null;
  course_check_plan_id: string;
  expires_at: string;
  revoked_at: string | null;
  signed_token: string | null;
  created_at: string;
}

interface CfpFormRow {
  [key: string]: string | number | null;
  id: string;
  name: string;
  lifecycle_status: string;
  draft_json: string;
  draft_updated_at: string;
  published_version: number | null;
  published_at: string | null;
}

interface CfpVersionRow {
  [key: string]: string | number;
  id: string;
  status: string;
  definition_version: number;
  definition_json: string;
  published_at: string;
  name: string;
}

interface OutboxRow {
  [key: string]: string | number | null;
  id: string;
  kind: string;
  to_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  status: string;
  proposal_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
}

interface EditTokenRow {
  [key: string]: string | number | null;
  token_id: string;
  proposal_id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface AssetRow {
  [key: string]: string | number | null;
  asset_id: string;
  object_key: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  status: string;
  created_at: string;
  form_id: string;
  form_definition_version: number;
  question_name: string;
  max_bytes: number;
  claimed_proposal_id: string | null;
  owner_speaker_id: string | null;
  purpose: string;
}

interface RateLimitRow {
  [key: string]: string | number;
  window_started_at: number;
  attempt_count: number;
}

interface ProposalCountRow {
  [key: string]: string | number;
  track_id: string;
  proposal_count: number;
}

interface AuditEventRow {
  [key: string]: string | number;
  id: string;
  proposal_id: string;
  type: string;
  actor_id: string;
  actor_name: string;
  from_status: string;
  to_status: string;
  committee_note_changed: number;
  created_at: string;
}

const SUBMISSION_LIMIT = 20;
const UPLOAD_START_LIMIT = 40;
const SUBMISSION_WINDOW_MS = 10 * 60 * 1_000;

function mapProposal(row: ProposalRow, eventId: string): OrganizerProposal {
  let coSpeakers: CoSpeakerInput[] = [];
  try {
    coSpeakers = JSON.parse(row.co_speakers_json || "[]") as CoSpeakerInput[];
  } catch {
    coSpeakers = [];
  }
  let supportingFile: UploadedAssetAnswer | null = null;
  if (row.supporting_file_json) {
    try {
      supportingFile = JSON.parse(row.supporting_file_json) as UploadedAssetAnswer;
    } catch {
      supportingFile = null;
    }
  }
  let answers: SubmissionAnswers = {};
  try {
    answers = JSON.parse(row.answers_json || "{}") as SubmissionAnswers;
  } catch {
    answers = {};
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    answers = {};
  }
  // Backfill answers from normalized columns when answers_json is empty (legacy rows).
  if (Object.keys(answers).length === 0 && row.title) {
    answers = {
      title: row.title,
      abstract: row.abstract,
      trackId: row.track_id,
      sessionFormat: row.session_format || "",
      workshopDuration: row.workshop_duration || "",
      speakers: [
        {
          name: row.speaker_name,
          email: row.speaker_email,
          biography: row.biography,
        },
        ...coSpeakers.map((speaker) => ({
          name: speaker.name,
          email: speaker.email,
          biography: speaker.biography,
        })),
      ],
      supportingLink: row.supporting_link || "",
      ...(supportingFile ? { supportingFile } : {}),
    };
  }
  const emailStatus = row.confirmation_email_status;
  return {
    id: row.id,
    eventId,
    formId: row.form_id,
    formDefinitionVersion: row.form_definition_version,
    answers,
    title: row.title,
    abstract: row.abstract,
    trackId: row.track_id,
    trackName: row.track_name,
    speakerName: row.speaker_name,
    speakerEmail: row.speaker_email,
    biography: row.biography,
    supportingLink: row.supporting_link,
    sessionFormat: row.session_format || "",
    workshopDuration: row.workshop_duration || "",
    coSpeakers,
    supportingFile,
    status: row.status as ProposalStatus,
    programOutcome:
      row.program_outcome === "accepted" || row.program_outcome === "declined"
        ? row.program_outcome
        : null,
    committeeNote: row.committee_note,
    privateNote: row.private_note,
    reviewVersion: Number(row.review_version ?? 0),
    submittedAt: row.submitted_at,
    confirmationEmailStatus:
      emailStatus === "queued" ||
      emailStatus === "sending" ||
      emailStatus === "sent" ||
      emailStatus === "failed"
        ? emailStatus
        : null,
  };
}

function normalizeCourseCheckBody(body: CourseCheckPlanBody): CourseCheckPlanBody {
  if (body.actionType === "guaranteed_speaker") {
    return {
      ...body,
      evidenceSections: body.evidenceSections ?? [],
      softWarningOverrides: body.softWarningOverrides ?? [],
      ageWarningHours: body.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
      ageWarning: body.ageWarning ?? null,
    };
  }
  const decision = body as DecisionPlanBody;
  if (decision.items && decision.items.length > 0) {
    return {
      ...decision,
      followUpQueue: decision.followUpQueue ?? [],
      evidenceSections: decision.evidenceSections ?? [],
      softWarningOverrides: decision.softWarningOverrides ?? [],
      aggregateProgress: decision.aggregateProgress ?? {
        total: decision.items.length,
        active: decision.items.filter((item) => item.status === "active").length,
        deferred: decision.items.filter((item) => item.status === "deferred").length,
        applied: decision.items.filter((item) => item.status === "applied").length,
      },
      linkedPlanIds: decision.linkedPlanIds ?? [],
      parentPlanId: decision.parentPlanId ?? null,
      batchGroupId: decision.batchGroupId ?? null,
      splitExplanation: decision.splitExplanation ?? null,
      ageWarningHours: decision.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
      ageWarning: decision.ageWarning ?? null,
    };
  }
  // Legacy single-decision bodies without items.
  return {
    ...decision,
    items: [
      {
        itemId: `item_legacy_${decision.proposalId}`,
        proposalId: decision.proposalId,
        outcome: decision.outcome,
        proposalRevision: decision.proposalRevision,
        status: "active",
        deferredAt: null,
        deferredBy: null,
        deferralReason: null,
        speakers: decision.speakers,
        participations: decision.participations,
        session: decision.session,
        tasks: decision.tasks,
        portalAccess: decision.portalAccess,
        deltas: decision.deltas,
        findings: decision.findings,
      },
    ],
    followUpQueue: [],
    evidenceSections: decision.evidenceSections ?? [],
    softWarningOverrides: decision.softWarningOverrides ?? [],
    aggregateProgress: {
      total: 1,
      active: 1,
      deferred: 0,
      applied: 0,
    },
    linkedPlanIds: [],
    parentPlanId: null,
    batchGroupId: null,
    splitExplanation: null,
    ageWarningHours: DEFAULT_AGE_WARNING_HOURS,
    ageWarning: null,
  };
}

function mapCourseCheckPlan(row: CourseCheckPlanRow, eventId: string): CourseCheckPlan {
  let receipt: CourseCheckReceipt | null = null;
  let approval: CourseCheckPlan["approval"] = null;
  if (row.approval_json) {
    try {
      approval = JSON.parse(row.approval_json) as CourseCheckPlan["approval"];
    } catch {
      approval = null;
    }
  }
  return {
    id: row.id,
    eventId,
    actionType: row.action_type as CourseCheckActionType,
    state: row.state as CourseCheckPlanState,
    version: Number(row.version),
    digest: row.digest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: {
      id: row.created_by_id,
      displayName: row.created_by_name,
    },
    body: normalizeCourseCheckBody(JSON.parse(row.body_json) as CourseCheckPlanBody),
    approval,
    receipt,
  };
}

function mapAuditEvent(row: AuditEventRow): ProposalAuditEvent {
  const type =
    row.type === "course_check.decision.applied"
      ? "course_check.decision.applied"
      : "proposal.review.changed";
  return {
    id: row.id,
    proposalId: row.proposal_id,
    type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    fromStatus: row.from_status as ProposalStatus,
    toStatus: row.to_status as ProposalStatus,
    committeeNoteChanged: Boolean(row.committee_note_changed),
    createdAt: row.created_at,
  };
}

function mapForm(
  row: CfpFormRow,
  publishedDefinition: CfpDefinitionV1 | null,
): OrganizerCfpForm {
  return {
    id: row.id,
    name: row.name,
    lifecycleStatus: row.lifecycle_status as OrganizerCfpForm["lifecycleStatus"],
    draft: JSON.parse(row.draft_json) as CfpDefinitionV1,
    draftUpdatedAt: row.draft_updated_at,
    publishedVersion: row.published_version,
    publishedAt: row.published_at,
    publishedDefinition,
  };
}

function mapOutbox(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    kind: row.kind,
    toEmail: row.to_email,
    subject: row.subject,
    status: row.status as OutboxDeliveryStatus,
    proposalId: row.proposal_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    attemptCount: Number(row.attempt_count ?? 0),
    nextAttemptAt: row.next_attempt_at,
  };
}

const OUTBOX_SELECT = `id, kind, to_email, subject, html_body, text_body, status,
  proposal_id, error, created_at, updated_at, sent_at, attempt_count, next_attempt_at`;

export class EventStore extends DurableObject<AppBindings> {
  constructor(ctx: DurableObjectState, env: AppBindings) {
    super(ctx, env);

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          starts_on TEXT NOT NULL,
          ends_on TEXT NOT NULL,
          submission_count INTEGER NOT NULL DEFAULT 0,
          unreviewed_count INTEGER NOT NULL DEFAULT 0,
          tracks_json TEXT NOT NULL,
          rooms_json TEXT NOT NULL,
          theme_accent TEXT NOT NULL DEFAULT '#2f5d98'
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY,
          form_id TEXT NOT NULL DEFAULT 'main-cfp',
          form_definition_version INTEGER NOT NULL DEFAULT 1,
          answers_json TEXT NOT NULL DEFAULT '{}',
          title TEXT NOT NULL,
          abstract TEXT NOT NULL,
          track_id TEXT NOT NULL,
          track_name TEXT NOT NULL,
          speaker_name TEXT NOT NULL,
          speaker_email TEXT NOT NULL,
          biography TEXT NOT NULL,
          supporting_link TEXT NOT NULL DEFAULT '',
          session_format TEXT NOT NULL DEFAULT '',
          workshop_duration TEXT NOT NULL DEFAULT '',
          co_speakers_json TEXT NOT NULL DEFAULT '[]',
          supporting_file_json TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'unreviewed',
          committee_note TEXT NOT NULL DEFAULT '',
          private_note TEXT NOT NULL DEFAULT '',
          review_version INTEGER NOT NULL DEFAULT 0,
          submitted_at TEXT NOT NULL,
          confirmation_email_status TEXT NOT NULL DEFAULT ''
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL,
          type TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          from_status TEXT NOT NULL,
          to_status TEXT NOT NULL,
          committee_note_changed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS audit_events_proposal_created_idx
        ON audit_events (proposal_id, created_at DESC)
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS cfp_forms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          lifecycle_status TEXT NOT NULL,
          draft_json TEXT NOT NULL,
          draft_updated_at TEXT NOT NULL,
          published_version INTEGER,
          published_at TEXT
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS cfp_form_versions (
          id TEXT NOT NULL,
          status TEXT NOT NULL,
          definition_version INTEGER NOT NULL,
          definition_json TEXT NOT NULL,
          published_at TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (id, definition_version)
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS outbox_messages (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          html_body TEXT NOT NULL,
          text_body TEXT NOT NULL,
          status TEXT NOT NULL,
          proposal_id TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sent_at TEXT
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS edit_tokens (
          token_id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS assets (
          asset_id TEXT PRIMARY KEY,
          object_key TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          form_id TEXT NOT NULL DEFAULT '',
          form_definition_version INTEGER NOT NULL DEFAULT 0,
          question_name TEXT NOT NULL DEFAULT '',
          max_bytes INTEGER NOT NULL DEFAULT 0,
          claimed_proposal_id TEXT
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS submission_rate_limits (
          client_key TEXT PRIMARY KEY,
          window_started_at INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS seed_markers (
          name TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS speakers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          biography TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS event_participations (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          title_snapshot TEXT NOT NULL,
          organization_snapshot TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          format TEXT NOT NULL DEFAULT '',
          track_id TEXT NOT NULL DEFAULT '',
          room_id TEXT,
          starts_at TEXT,
          ends_at TEXT,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS calendar_intents (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          uid TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          room_id TEXT,
          starts_at TEXT,
          ends_at TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS onboarding_tasks (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          session_id TEXT,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          due_at TEXT,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS portal_access_intents (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          email TEXT NOT NULL,
          intent TEXT NOT NULL,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS portal_tokens (
          token_id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          signed_token TEXT,
          created_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_plans (
          id TEXT PRIMARY KEY,
          action_type TEXT NOT NULL,
          state TEXT NOT NULL,
          version INTEGER NOT NULL,
          digest TEXT NOT NULL,
          body_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          approval_json TEXT,
          receipt_id TEXT
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_idempotency (
          command TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          receipt_id TEXT,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (command, idempotency_key)
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_receipts (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          plan_version INTEGER NOT NULL,
          digest TEXT NOT NULL,
          stage_id TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_plan_versions (
          plan_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          digest TEXT NOT NULL,
          state TEXT NOT NULL,
          body_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          mutation_kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          PRIMARY KEY (plan_id, version)
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_mutations (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          from_version INTEGER NOT NULL,
          to_version INTEGER NOT NULL,
          kind TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          at TEXT NOT NULL,
          summary TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS course_check_follow_ups (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          proposal_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason TEXT NOT NULL,
          source_version INTEGER NOT NULL,
          deferred_at TEXT NOT NULL,
          deferred_by_id TEXT NOT NULL,
          deferred_by_name TEXT NOT NULL,
          status TEXT NOT NULL
        )
      `);

      this.ensureColumn("events", "submission_count", "INTEGER NOT NULL DEFAULT 0");
      this.ensureColumn(
        "events",
        "course_check_age_warning_hours",
        `INTEGER NOT NULL DEFAULT ${DEFAULT_AGE_WARNING_HOURS}`,
      );
      this.ensureColumn(
        "events",
        "course_check_batch_limit",
        `INTEGER NOT NULL DEFAULT ${DEFAULT_DECISION_BATCH_LIMIT}`,
      );
      this.ensureColumn("events", "unreviewed_count", "INTEGER NOT NULL DEFAULT 0");
      this.ensureColumn(
        "events",
        "theme_accent",
        "TEXT NOT NULL DEFAULT '#2f5d98'",
      );
      this.ensureColumn("cfp_form_versions", "name", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("proposals", "form_id", "TEXT NOT NULL DEFAULT 'main-cfp'");
      this.ensureColumn(
        "proposals",
        "form_definition_version",
        "INTEGER NOT NULL DEFAULT 1",
      );
      this.ensureColumn("proposals", "answers_json", "TEXT NOT NULL DEFAULT '{}'");
      this.ensureColumn("proposals", "session_format", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("proposals", "workshop_duration", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("proposals", "co_speakers_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("proposals", "supporting_file_json", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn(
        "proposals",
        "confirmation_email_status",
        "TEXT NOT NULL DEFAULT ''",
      );
      this.ensureColumn(
        "proposals",
        "review_version",
        "INTEGER NOT NULL DEFAULT 0",
      );
      this.ensureColumn("assets", "form_id", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn(
        "assets",
        "form_definition_version",
        "INTEGER NOT NULL DEFAULT 0",
      );
      this.ensureColumn("assets", "question_name", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("assets", "max_bytes", "INTEGER NOT NULL DEFAULT 0");
      this.ensureColumn("assets", "claimed_proposal_id", "TEXT");
      this.ensureColumn(
        "outbox_messages",
        "attempt_count",
        "INTEGER NOT NULL DEFAULT 0",
      );
      this.ensureColumn("outbox_messages", "next_attempt_at", "TEXT");
      this.ensureColumn("proposals", "program_outcome", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("onboarding_tasks", "due_at", "TEXT");
      this.ensureColumn("portal_tokens", "signed_token", "TEXT");
      this.ensureColumn("sessions", "calendar_uid", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn(
        "sessions",
        "calendar_sequence",
        "INTEGER NOT NULL DEFAULT 0",
      );
      this.ensureColumn(
        "sessions",
        "calendar_invite_recorded",
        "INTEGER NOT NULL DEFAULT 0",
      );
      this.backfillSessionCalendarUids();
      this.ensureColumn("speakers", "headshot_asset_id", "TEXT");
      this.ensureColumn(
        "onboarding_tasks",
        "instructions",
        "TEXT NOT NULL DEFAULT ''",
      );
      this.ensureColumn(
        "onboarding_tasks",
        "completion_requirement",
        "TEXT NOT NULL DEFAULT 'manual'",
      );
      this.ensureColumn("onboarding_tasks", "readiness_flag", "TEXT");
      this.ensureColumn("onboarding_tasks", "asset_id", "TEXT");
      this.ensureColumn("onboarding_tasks", "completed_at", "TEXT");
      this.ensureColumn(
        "onboarding_tasks",
        "created_by",
        "TEXT NOT NULL DEFAULT 'system'",
      );
      this.ensureColumn("assets", "owner_speaker_id", "TEXT");
      this.ensureColumn(
        "assets",
        "purpose",
        "TEXT NOT NULL DEFAULT 'cfp'",
      );
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS reminder_drafts (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          proposal_id TEXT,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          body_text TEXT NOT NULL,
          body_html TEXT NOT NULL,
          status TEXT NOT NULL,
          missing_task_ids_json TEXT NOT NULL DEFAULT '[]',
          outbox_id TEXT,
          last_error TEXT,
          created_by_id TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sent_at TEXT
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS onboarding_history (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          task_id TEXT,
          type TEXT NOT NULL,
          summary TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS onboarding_history_speaker_created_idx
        ON onboarding_history (speaker_id, created_at DESC)
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS public_program_revisions (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          is_current INTEGER NOT NULL DEFAULT 0,
          published_at TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'working'
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS public_program_revisions_current_idx
        ON public_program_revisions (is_current, version DESC)
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS airtable_sync_state (
          id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
          health TEXT NOT NULL,
          configured INTEGER NOT NULL DEFAULT 0,
          last_pull_at TEXT,
          last_success_at TEXT,
          last_error TEXT,
          guidance TEXT,
          pending_change_count INTEGER NOT NULL DEFAULT 0,
          base_id TEXT,
          access_token TEXT
        )
      `);
      this.ensureColumn("airtable_sync_state", "access_token", "TEXT");
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS airtable_record_links (
          chartstead_kind TEXT NOT NULL,
          chartstead_id TEXT NOT NULL,
          airtable_record_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (chartstead_kind, chartstead_id)
        )
      `);
    });
  }

  private ensureColumn(table: string, name: string, ddl: string): void {
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>(`PRAGMA table_info(${table})`)
      .toArray();
    if (!columns.some((column) => column.name === name)) {
      this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }

  /** Insert seed once. Never overwrite persisted operational rows. */
  seedIfEmpty(event: EventRecord): void {
    const themeAccent = normalizeThemeAccent(event.themeAccent);
    this.ctx.storage.sql.exec(
      `INSERT INTO events
        (id, name, starts_on, ends_on, submission_count, unreviewed_count, tracks_json, rooms_json, theme_accent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      event.id,
      event.name,
      event.startsOn,
      event.endsOn,
      event.submissionCount,
      event.unreviewedCount,
      JSON.stringify(event.tracks),
      JSON.stringify(event.rooms),
      themeAccent,
    );
    // Theme accent is seed identity (not operator-editable); keep it aligned with seed.
    this.ctx.storage.sql.exec(
      `UPDATE events SET theme_accent = ? WHERE id = ?`,
      themeAccent,
      event.id,
    );
  }

  seedPublishedFormIfEmpty(form: PublishedCfpForm): void {
    const now = form.publishedAt;
    const event = this.getEvent();
    const formName = form.name || "Main CFP";
    const draft =
      form.definition.schemaVersion === 1
        ? {
            ...JSON.parse(JSON.stringify(form.definition)) as CfpDefinitionV1,
            status: "draft" as const,
            definitionVersion: 0,
          }
        : createDefaultCfpDefinition({
            definitionId: form.id,
            eventId: event?.id ?? form.definition.eventId,
            trackChoices: (event?.tracks ?? []).map((track) => ({
              value: track.id,
              text: track.name,
            })),
          });

    // Ticket 02 left flat SurveyJS JSON in some local DOs. Replace that legacy
    // seed so public CFP always gets the Ticket 03 envelope (runtime.survey).
    const existingVersion = this.ctx.storage.sql
      .exec<{ definition_json: string }>(
        `SELECT definition_json FROM cfp_form_versions
         WHERE id = ? AND definition_version = ?
         LIMIT 1`,
        form.id,
        form.definitionVersion,
      )
      .toArray()[0];
    if (existingVersion) {
      let legacy = false;
      try {
        const parsed = JSON.parse(existingVersion.definition_json) as {
          schemaVersion?: unknown;
          runtime?: { survey?: unknown };
        };
        legacy =
          parsed.schemaVersion !== 1 ||
          !parsed.runtime ||
          typeof parsed.runtime !== "object" ||
          !parsed.runtime.survey;
      } catch {
        legacy = true;
      }
      if (legacy && form.definition.schemaVersion === 1) {
        this.ctx.storage.sql.exec(
          `UPDATE cfp_form_versions
           SET definition_json = ?, name = ?, status = ?, published_at = ?
           WHERE id = ? AND definition_version = ?`,
          JSON.stringify(form.definition),
          formName,
          form.status,
          form.publishedAt,
          form.id,
          form.definitionVersion,
        );
        this.ctx.storage.sql.exec(
          `UPDATE cfp_forms
           SET name = ?,
               lifecycle_status = 'published',
               draft_json = ?,
               draft_updated_at = ?,
               published_version = ?,
               published_at = ?
           WHERE id = ?`,
          formName,
          JSON.stringify(draft),
          now,
          form.definitionVersion,
          form.publishedAt,
          form.id,
        );
        return;
      }
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO cfp_forms
        (id, name, lifecycle_status, draft_json, draft_updated_at, published_version, published_at)
       VALUES (?, ?, 'published', ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      form.id,
      formName,
      JSON.stringify(draft),
      now,
      form.definitionVersion,
      form.publishedAt,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO cfp_form_versions
        (id, status, definition_version, definition_json, published_at, name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, definition_version) DO NOTHING`,
      form.id,
      form.status,
      form.definitionVersion,
      JSON.stringify(form.definition),
      form.publishedAt,
      formName,
    );
    // Backfill version name for rows created before the name column existed.
    this.ctx.storage.sql.exec(
      `UPDATE cfp_form_versions
       SET name = ?
       WHERE id = ? AND definition_version = ? AND (name IS NULL OR name = '')`,
      formName,
      form.id,
      form.definitionVersion,
    );
    // Advance the live pointer when a higher published snapshot is seeded.
    this.ctx.storage.sql.exec(
      `UPDATE cfp_forms
       SET published_version = ?,
           published_at = ?,
           lifecycle_status = 'published'
       WHERE id = ?
         AND (published_version IS NULL OR published_version < ?)`,
      form.definitionVersion,
      form.publishedAt,
      form.id,
      form.definitionVersion,
    );
  }

  seedProposalsIfNeeded(proposals: OrganizerProposal[]): void {
    const marker = this.ctx.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM seed_markers WHERE name = 'proposals-v1'",
      )
      .toArray()[0];
    if (marker) return;

    const existingProposalCount =
      this.ctx.storage.sql
        .exec<{ total: number }>("SELECT COUNT(*) AS total FROM proposals")
        .toArray()[0]?.total ?? 0;

    this.ctx.storage.transactionSync(() => {
      if (existingProposalCount > 0) {
        const eventRow = this.ctx.storage.sql
          .exec<{ tracks_json: string }>("SELECT tracks_json FROM events LIMIT 1")
          .toArray()[0];
        if (eventRow) {
          const operationalCounts = new Map(
            this.ctx.storage.sql
              .exec<ProposalCountRow>(
                `SELECT track_id, COUNT(*) AS proposal_count
                 FROM proposals
                 GROUP BY track_id`,
              )
              .toArray()
              .map((row) => [row.track_id, row.proposal_count]),
          );
          const seedCounts = new Map<string, number>();
          for (const proposal of proposals) {
            seedCounts.set(
              proposal.trackId,
              (seedCounts.get(proposal.trackId) ?? 0) + 1,
            );
          }
          const tracks = (
            JSON.parse(eventRow.tracks_json) as EventRecord["tracks"]
          ).map((track) => ({
            ...track,
            proposalCount:
              (seedCounts.get(track.id) ?? 0) +
              (operationalCounts.get(track.id) ?? 0),
          }));
          this.ctx.storage.sql.exec(
            "UPDATE events SET tracks_json = ?",
            JSON.stringify(tracks),
          );
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO seed_markers (name, applied_at)
           VALUES ('proposals-v1', ?)`,
          new Date().toISOString(),
        );
        return;
      }

      for (const proposal of proposals) {
        this.ctx.storage.sql.exec(
          `INSERT INTO proposals (
            id, form_id, form_definition_version, answers_json, title, abstract,
            track_id, track_name, speaker_name, speaker_email,
            biography, supporting_link, session_format, workshop_duration,
            co_speakers_json, supporting_file_json, status, committee_note,
            private_note, review_version, submitted_at, confirmation_email_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
          proposal.id,
          proposal.formId,
          proposal.formDefinitionVersion,
          JSON.stringify(proposal.answers ?? {}),
          proposal.title,
          proposal.abstract,
          proposal.trackId,
          proposal.trackName,
          proposal.speakerName,
          proposal.speakerEmail,
          proposal.biography,
          proposal.supportingLink,
          proposal.sessionFormat ?? "",
          proposal.workshopDuration ?? "",
          JSON.stringify(proposal.coSpeakers ?? []),
          proposal.supportingFile ? JSON.stringify(proposal.supportingFile) : "",
          proposal.status,
           proposal.committeeNote,
           proposal.privateNote,
           proposal.reviewVersion ?? 0,
           proposal.submittedAt,
          proposal.confirmationEmailStatus ?? "",
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO seed_markers (name, applied_at)
         VALUES ('proposals-v1', ?)`,
        new Date().toISOString(),
      );

      const eventRow = this.ctx.storage.sql
        .exec<{ tracks_json: string }>("SELECT tracks_json FROM events LIMIT 1")
        .toArray()[0];
      if (eventRow) {
        const counts = this.ctx.storage.sql
          .exec<ProposalCountRow>(
            `SELECT track_id, COUNT(*) AS proposal_count
             FROM proposals
             GROUP BY track_id`,
          )
          .toArray();
        const countByTrack = new Map(
          counts.map((row) => [row.track_id, row.proposal_count]),
        );
        const tracks = (
          JSON.parse(eventRow.tracks_json) as EventRecord["tracks"]
        ).map((track) => ({
          ...track,
          proposalCount: countByTrack.get(track.id) ?? 0,
        }));
        const totals = this.ctx.storage.sql
          .exec<{ total: number; unreviewed: number }>(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'unreviewed' THEN 1 ELSE 0 END) AS unreviewed
             FROM proposals`,
          )
          .toArray()[0];
        this.ctx.storage.sql.exec(
          `UPDATE events
           SET submission_count = ?, unreviewed_count = ?, tracks_json = ?`,
          totals?.total ?? 0,
          totals?.unreviewed ?? 0,
          JSON.stringify(tracks),
        );
      }
    });
  }

  listForms(): OrganizerCfpFormSummary[] {
    return this.ctx.storage.sql
      .exec<CfpFormRow>(
        `SELECT id, name, lifecycle_status, draft_json, draft_updated_at,
                published_version, published_at
         FROM cfp_forms
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        lifecycleStatus: row.lifecycle_status as OrganizerCfpFormSummary["lifecycleStatus"],
        draftUpdatedAt: row.draft_updated_at,
        publishedVersion: row.published_version,
        publishedAt: row.published_at,
      }));
  }

  getForm(formId: string): OrganizerCfpForm | null {
    const row = this.ctx.storage.sql
      .exec<CfpFormRow>(
        `SELECT id, name, lifecycle_status, draft_json, draft_updated_at,
                published_version, published_at
         FROM cfp_forms
         WHERE id = ?
         LIMIT 1`,
        formId,
      )
      .toArray()[0];
    if (!row) return null;
    let publishedDefinition: CfpDefinitionV1 | null = null;
    if (row.published_version != null) {
      const version = this.getFormVersion(formId, row.published_version);
      publishedDefinition = version?.definition ?? null;
    }
    return mapForm(row, publishedDefinition);
  }

  createForm(name: string, draft: CfpDefinitionV1): OrganizerCfpForm {
    const id = createFormId(name);
    const now = new Date().toISOString();
    const stamped: CfpDefinitionV1 = {
      ...JSON.parse(JSON.stringify(draft)) as CfpDefinitionV1,
      definitionId: id,
      status: "draft",
      definitionVersion: 0,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO cfp_forms
        (id, name, lifecycle_status, draft_json, draft_updated_at, published_version, published_at)
       VALUES (?, ?, 'draft', ?, ?, NULL, NULL)`,
      id,
      name.trim(),
      JSON.stringify(stamped),
      now,
    );
    const created = this.getForm(id);
    if (!created) throw new Error(`Form ${id} was not persisted.`);
    return created;
  }

  saveFormDraft(
    formId: string,
    input: {
      name?: string;
      draft: CfpDefinitionV1;
      expectedDraftUpdatedAt?: string;
    },
  ): OrganizerCfpForm {
    const existing = this.getForm(formId);
    if (!existing) throw new Error(`Form ${formId} not found.`);
    if (
      input.expectedDraftUpdatedAt != null &&
      existing.draftUpdatedAt !== input.expectedDraftUpdatedAt
    ) {
      throw new DraftConflictError(
        "Draft changed since you last loaded it. Reload and try again.",
      );
    }
    const now = new Date().toISOString();
    const stamped: CfpDefinitionV1 = {
      ...JSON.parse(JSON.stringify(input.draft)) as CfpDefinitionV1,
      definitionId: formId,
      status: "draft",
    };
    const updated = this.ctx.storage.transactionSync(() => {
      if (input.expectedDraftUpdatedAt != null) {
        const result = this.ctx.storage.sql.exec(
          `UPDATE cfp_forms
           SET name = ?, draft_json = ?, draft_updated_at = ?
           WHERE id = ? AND draft_updated_at = ?`,
          (input.name ?? existing.name).trim(),
          JSON.stringify(stamped),
          now,
          formId,
          input.expectedDraftUpdatedAt,
        );
        if (result.rowsWritten === 0) {
          throw new DraftConflictError(
            "Draft changed since you last loaded it. Reload and try again.",
          );
        }
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE cfp_forms
           SET name = ?, draft_json = ?, draft_updated_at = ?
           WHERE id = ?`,
          (input.name ?? existing.name).trim(),
          JSON.stringify(stamped),
          now,
          formId,
        );
      }
      return this.getForm(formId);
    });
    if (!updated) throw new Error(`Form ${formId} was not updated.`);
    return updated;
  }

  publishForm(
    formId: string,
    definition: CfpDefinitionV1,
    options?: { name?: string; expectedDraftUpdatedAt?: string },
  ): OrganizerCfpForm {
    const existing = this.getForm(formId);
    if (!existing) throw new Error(`Form ${formId} not found.`);
    if (
      options?.expectedDraftUpdatedAt != null &&
      existing.draftUpdatedAt !== options.expectedDraftUpdatedAt
    ) {
      throw new DraftConflictError(
        "Draft changed since you last loaded it. Reload and try again.",
      );
    }
    const nextVersion = (existing.publishedVersion ?? 0) + 1;
    const now = new Date().toISOString();
    const publishedName = (options?.name ?? existing.name).trim() || formId;
    const draftEnvelope: CfpDefinitionV1 = {
      ...JSON.parse(JSON.stringify(definition)) as CfpDefinitionV1,
      definitionId: formId,
      status: "draft",
      definitionVersion: nextVersion,
    };
    const publishedEnvelope: CfpDefinitionV1 = {
      ...JSON.parse(JSON.stringify(definition)) as CfpDefinitionV1,
      definitionId: formId,
      status: "published",
      definitionVersion: nextVersion,
    };
    this.ctx.storage.transactionSync(() => {
      if (options?.expectedDraftUpdatedAt != null) {
        const cas = this.ctx.storage.sql.exec(
          `UPDATE cfp_forms
           SET name = ?,
               draft_json = ?,
               lifecycle_status = 'published',
               published_version = ?,
               published_at = ?,
               draft_updated_at = ?
           WHERE id = ? AND draft_updated_at = ?`,
          publishedName,
          JSON.stringify(draftEnvelope),
          nextVersion,
          now,
          now,
          formId,
          options.expectedDraftUpdatedAt,
        );
        if (cas.rowsWritten === 0) {
          throw new DraftConflictError(
            "Draft changed since you last loaded it. Reload and try again.",
          );
        }
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE cfp_forms
           SET name = ?,
               draft_json = ?,
               lifecycle_status = 'published',
               published_version = ?,
               published_at = ?,
               draft_updated_at = ?
           WHERE id = ?`,
          publishedName,
          JSON.stringify(draftEnvelope),
          nextVersion,
          now,
          now,
          formId,
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO cfp_form_versions
          (id, status, definition_version, definition_json, published_at, name)
         VALUES (?, 'published', ?, ?, ?, ?)`,
        formId,
        nextVersion,
        JSON.stringify(publishedEnvelope),
        now,
        publishedName,
      );
    });
    const published = this.getForm(formId);
    if (!published) throw new Error(`Form ${formId} was not published.`);
    return published;
  }

  closeForm(formId: string): OrganizerCfpForm {
    const existing = this.getForm(formId);
    if (!existing) throw new Error(`Form ${formId} not found.`);
    if (existing.publishedVersion == null) {
      throw new Error("Publish the form before closing it.");
    }
    this.ctx.storage.sql.exec(
      `UPDATE cfp_forms
       SET lifecycle_status = 'closed', draft_updated_at = ?
       WHERE id = ?`,
      new Date().toISOString(),
      formId,
    );
    const closed = this.getForm(formId);
    if (!closed) throw new Error(`Form ${formId} was not closed.`);
    return closed;
  }

  reopenForm(formId: string): OrganizerCfpForm {
    const existing = this.getForm(formId);
    if (!existing) throw new Error(`Form ${formId} not found.`);
    if (existing.publishedVersion == null) {
      throw new Error("Publish the form before reopening it.");
    }
    this.ctx.storage.sql.exec(
      `UPDATE cfp_forms
       SET lifecycle_status = 'published', draft_updated_at = ?
       WHERE id = ?`,
      new Date().toISOString(),
      formId,
    );
    const reopened = this.getForm(formId);
    if (!reopened) throw new Error(`Form ${formId} was not reopened.`);
    return reopened;
  }

  getPublishedForm(formId?: string): PublishedCfpForm | null {
    if (formId) {
      const form = this.getForm(formId);
      if (!form || form.lifecycleStatus === "draft" || form.publishedVersion == null) {
        return null;
      }
      if (form.lifecycleStatus === "closed") {
        return null;
      }
      return this.getFormVersion(formId, form.publishedVersion);
    }

    const row = this.ctx.storage.sql
      .exec<CfpFormRow>(
        `SELECT id, name, lifecycle_status, draft_json, draft_updated_at,
                published_version, published_at
         FROM cfp_forms
         WHERE lifecycle_status = 'published' AND published_version IS NOT NULL
         ORDER BY CASE WHEN id = 'main-cfp' THEN 0 ELSE 1 END, published_at DESC
         LIMIT 1`,
      )
      .toArray()[0];
    if (!row || row.published_version == null) {
      // Legacy fallback for tests that only seed versions.
      const legacy = this.ctx.storage.sql
        .exec<CfpVersionRow>(
          `SELECT id, status, definition_version, definition_json, published_at, name
           FROM cfp_form_versions
           WHERE status = 'published'
           ORDER BY definition_version DESC
           LIMIT 1`,
        )
        .toArray()[0];
      if (!legacy) return null;
      return {
        id: legacy.id,
        name: (legacy.name && String(legacy.name).trim()) || legacy.id,
        status: "published",
        definitionVersion: legacy.definition_version,
        definition: JSON.parse(legacy.definition_json) as CfpDefinitionV1,
        publishedAt: legacy.published_at,
      };
    }
    return this.getFormVersion(row.id, row.published_version);
  }

  getFormVersion(
    formId: string,
    definitionVersion: number,
  ): PublishedCfpForm | null {
    const row = this.ctx.storage.sql
      .exec<CfpVersionRow>(
        `SELECT id, status, definition_version, definition_json, published_at, name
         FROM cfp_form_versions
         WHERE id = ? AND definition_version = ? AND status = 'published'
         LIMIT 1`,
        formId,
        definitionVersion,
      )
      .toArray()[0];
    if (!row) return null;
    const versionName =
      typeof row.name === "string" && row.name.trim().length > 0
        ? row.name.trim()
        : row.id;
    return {
      id: row.id,
      name: versionName,
      status: "published",
      definitionVersion: row.definition_version,
      definition: JSON.parse(row.definition_json) as CfpDefinitionV1,
      publishedAt: row.published_at,
    };
  }

  isFormOpenForSubmission(formId: string): boolean {
    const form = this.getForm(formId);
    if (form) return form.lifecycleStatus === "published";
    // Legacy stores that only seeded version rows stay open.
    const legacy = this.ctx.storage.sql
      .exec<{ id: string }>(
        `SELECT id FROM cfp_form_versions
         WHERE id = ? AND status = 'published'
         LIMIT 1`,
        formId,
      )
      .toArray()[0];
    return Boolean(legacy);
  }

  private consumeRateQuota(
    clientKey: string,
    nowMs: number,
    limit: number,
  ): { allowed: boolean; retryAfterSeconds: number } {
    this.ctx.storage.sql.exec(
      `DELETE FROM submission_rate_limits
       WHERE window_started_at <= ?`,
      nowMs - SUBMISSION_WINDOW_MS,
    );
    const row = this.ctx.storage.sql
      .exec<RateLimitRow>(
        `SELECT window_started_at, attempt_count
         FROM submission_rate_limits
         WHERE client_key = ?`,
        clientKey,
      )
      .toArray()[0];

    if (!row || nowMs - row.window_started_at >= SUBMISSION_WINDOW_MS) {
      this.ctx.storage.sql.exec(
        `INSERT INTO submission_rate_limits
          (client_key, window_started_at, attempt_count)
         VALUES (?, ?, 1)
         ON CONFLICT(client_key) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           attempt_count = 1`,
        clientKey,
        nowMs,
      );
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (SUBMISSION_WINDOW_MS - (nowMs - row.window_started_at)) / 1_000,
      ),
    );
    if (row.attempt_count >= limit) {
      return { allowed: false, retryAfterSeconds };
    }

    this.ctx.storage.sql.exec(
      `UPDATE submission_rate_limits
       SET attempt_count = attempt_count + 1
       WHERE client_key = ?`,
      clientKey,
    );
    return { allowed: true, retryAfterSeconds };
  }

  consumeSubmissionQuota(
    clientKey: string,
    nowMs: number,
  ): { allowed: boolean; retryAfterSeconds: number } {
    return this.consumeRateQuota(clientKey, nowMs, SUBMISSION_LIMIT);
  }

  consumeUploadStartQuota(
    clientKey: string,
    nowMs: number,
  ): { allowed: boolean; retryAfterSeconds: number } {
    return this.consumeRateQuota(`upload:${clientKey}`, nowMs, UPLOAD_START_LIMIT);
  }

  /** Test/support seam: mutate operational counters without touching seed identity. */
  patchCounts(submissionCount: number, unreviewedCount: number): void {
    this.ctx.storage.sql.exec(
      `UPDATE events
       SET submission_count = ?, unreviewed_count = ?
       WHERE id = (SELECT id FROM events LIMIT 1)`,
      submissionCount,
      unreviewedCount,
    );
  }

  getEvent(): EventRecord | null {
    const row = this.ctx.storage.sql
      .exec<EventRow>(
        `SELECT id, name, starts_on, ends_on, submission_count,
                unreviewed_count, tracks_json, rooms_json, theme_accent
         FROM events
         LIMIT 1`,
      )
      .toArray()[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      submissionCount: row.submission_count,
      unreviewedCount: row.unreviewed_count,
      tracks: JSON.parse(row.tracks_json) as EventRecord["tracks"],
      rooms: JSON.parse(row.rooms_json) as EventRecord["rooms"],
      themeAccent: normalizeThemeAccent(row.theme_accent),
    };
  }

  createProposal(input: {
    formId: string;
    formDefinitionVersion: number;
    answers: SubmissionAnswers;
    normalized: ProposalInput;
    assetClaims?: AssetClaimInput[];
  }): ProposalWriteResult {
    const event = this.getEvent();
    if (!event) {
      throw new Error("Event is not initialized.");
    }
    const { normalized, formId, formDefinitionVersion, answers } = input;
    const track = event.tracks.find(
      (candidate) => candidate.id === normalized.trackId,
    );
    if (!track) {
      throw new Error(`Unknown track ${normalized.trackId}`);
    }

    let id = createStableProposalId();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = this.ctx.storage.sql
        .exec<{ id: string }>("SELECT id FROM proposals WHERE id = ?", id)
        .toArray()[0];
      if (!existing) break;
      id = createStableProposalId();
    }

    const submittedAt = new Date().toISOString();
    const tracks = event.tracks.map((candidate) =>
      candidate.id === track.id
        ? { ...candidate, proposalCount: candidate.proposalCount + 1 }
        : candidate,
    );

    let claimErrors: Record<string, string> | null = null;
    this.ctx.storage.transactionSync(() => {
      claimErrors = this.claimAssets({
        claims: input.assetClaims ?? [],
        proposalId: id,
        formId,
        formDefinitionVersion,
        mode: "create",
      });
      if (claimErrors) return;

      this.ctx.storage.sql.exec(
        `INSERT INTO proposals (
          id, form_id, form_definition_version, answers_json, title, abstract,
          track_id, track_name, speaker_name, speaker_email,
          biography, supporting_link, session_format, workshop_duration,
          co_speakers_json, supporting_file_json, status, committee_note,
          private_note, review_version, submitted_at, confirmation_email_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', '', '', 0, ?, '')`,
        id,
        formId,
        formDefinitionVersion,
        JSON.stringify(answers ?? {}),
        normalized.title.trim(),
        normalized.abstract.trim(),
        track.id,
        track.name,
        normalized.speakerName.trim(),
        normalized.speakerEmail.trim(),
        normalized.biography.trim(),
        normalized.supportingLink.trim(),
        (normalized.sessionFormat ?? "").trim(),
        (normalized.workshopDuration ?? "").trim(),
        JSON.stringify(normalized.coSpeakers ?? []),
        normalized.supportingFile ? JSON.stringify(normalized.supportingFile) : "",
        submittedAt,
      );
      this.ctx.storage.sql.exec(
        `UPDATE events
         SET submission_count = submission_count + 1,
             unreviewed_count = unreviewed_count + 1,
             tracks_json = ?
         WHERE id = ?`,
        JSON.stringify(tracks),
        event.id,
      );
    });

    if (claimErrors) {
      return { ok: false, errors: claimErrors };
    }

    const created = this.getProposal(id);
    if (!created) {
      throw new Error(`Proposal ${id} was not persisted.`);
    }
    return { ok: true, proposal: created };
  }

  updateProposal(input: {
    proposalId: string;
    answers: SubmissionAnswers;
    normalized: ProposalInput;
    assetClaims?: AssetClaimInput[];
  }): ProposalWriteResult {
    const event = this.getEvent();
    if (!event) throw new Error("Event is not initialized.");
    const existing = this.getProposal(input.proposalId);
    if (!existing) throw new Error(`Proposal ${input.proposalId} not found.`);
    const track = event.tracks.find(
      (candidate) => candidate.id === input.normalized.trackId,
    );
    if (!track) throw new Error(`Unknown track ${input.normalized.trackId}`);

    const trackChanged = existing.trackId !== track.id;
    let claimErrors: Record<string, string> | null = null;
    this.ctx.storage.transactionSync(() => {
      claimErrors = this.claimAssets({
        claims: input.assetClaims ?? [],
        proposalId: input.proposalId,
        formId: existing.formId,
        formDefinitionVersion: existing.formDefinitionVersion,
        mode: "update",
      });
      if (claimErrors) return;

      this.ctx.storage.sql.exec(
        `UPDATE proposals
         SET answers_json = ?, title = ?, abstract = ?, track_id = ?, track_name = ?,
             speaker_name = ?, speaker_email = ?, biography = ?,
             supporting_link = ?, session_format = ?, workshop_duration = ?,
             co_speakers_json = ?, supporting_file_json = ?
         WHERE id = ?`,
        JSON.stringify(input.answers ?? {}),
        input.normalized.title.trim(),
        input.normalized.abstract.trim(),
        track.id,
        track.name,
        input.normalized.speakerName.trim(),
        input.normalized.speakerEmail.trim(),
        input.normalized.biography.trim(),
        input.normalized.supportingLink.trim(),
        (input.normalized.sessionFormat ?? "").trim(),
        (input.normalized.workshopDuration ?? "").trim(),
        JSON.stringify(input.normalized.coSpeakers ?? []),
        input.normalized.supportingFile
          ? JSON.stringify(input.normalized.supportingFile)
          : "",
        input.proposalId,
      );
      if (trackChanged) {
        const tracks = event.tracks.map((candidate) => {
          if (candidate.id === existing.trackId) {
            return {
              ...candidate,
              proposalCount: Math.max(0, candidate.proposalCount - 1),
            };
          }
          if (candidate.id === track.id) {
            return { ...candidate, proposalCount: candidate.proposalCount + 1 };
          }
          return candidate;
        });
        this.ctx.storage.sql.exec(
          "UPDATE events SET tracks_json = ? WHERE id = ?",
          JSON.stringify(tracks),
          event.id,
        );
      }
    });

    if (claimErrors) {
      return { ok: false, errors: claimErrors };
    }

    const updated = this.getProposal(input.proposalId);
    if (!updated) throw new Error(`Proposal ${input.proposalId} was not updated.`);
    return { ok: true, proposal: updated };
  }

  getProposal(proposalId: string): OrganizerProposal | null {
    const event = this.getEvent();
    if (!event) return null;
    const row = this.ctx.storage.sql
      .exec<ProposalRow>(
        `SELECT id, form_id, form_definition_version, answers_json, title, abstract,
                track_id, track_name, speaker_name, speaker_email, biography,
                supporting_link, session_format, workshop_duration, co_speakers_json,
                supporting_file_json, status, program_outcome, committee_note, private_note,
                review_version, submitted_at, confirmation_email_status
         FROM proposals
         WHERE id = ?`,
        proposalId,
      )
      .toArray()[0];
    return row ? mapProposal(row, event.id) : null;
  }

  listProposals(input: string | {
    query?: string;
    status?: ProposalStatus;
    trackIds?: string[];
    sort?: "newest" | "oldest" | "title-asc" | "speaker-asc";
  } = ""): OrganizerProposal[] {
    const event = this.getEvent();
    if (!event) return [];
    const rows = this.ctx.storage.sql
      .exec<ProposalRow>(
        `SELECT id, form_id, form_definition_version, answers_json, title, abstract,
                track_id, track_name, speaker_name, speaker_email,
                biography, supporting_link, session_format, workshop_duration,
                co_speakers_json, supporting_file_json, status, program_outcome,
                committee_note, private_note, review_version, submitted_at,
                confirmation_email_status
         FROM proposals
         ORDER BY submitted_at DESC, id DESC`,
      )
      .toArray();
    const options = typeof input === "string" ? { query: input } : input;
    const needle = (options.query ?? "").trim().toLowerCase();
    let proposals = rows.map((row) => mapProposal(row, event.id));
    if (options.trackIds) {
      const allowedTracks = new Set(options.trackIds);
      proposals = proposals.filter((proposal) => allowedTracks.has(proposal.trackId));
    }
    if (options.status) {
      proposals = proposals.filter((proposal) => proposal.status === options.status);
    }
    if (needle) proposals = proposals.filter((proposal) => {
      const hay = [
        proposal.title,
        proposal.speakerName,
        proposal.id,
        proposal.trackName,
        proposal.speakerEmail,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    if (options.sort === "oldest") {
      proposals.sort((left, right) =>
        left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id),
      );
    } else if (options.sort === "title-asc") {
      proposals.sort((left, right) =>
        left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
      );
    } else if (options.sort === "speaker-asc") {
      proposals.sort((left, right) =>
        left.speakerName.localeCompare(right.speakerName) || left.id.localeCompare(right.id),
      );
    }
    return proposals;
  }

  updateProposalReview(input: {
    proposalId: string;
    expectedVersion: number;
    status?: ProposalStatus;
    committeeNote?: string;
    actorId: string;
    actorName: string;
  }): OrganizerProposal | null {
    const existing = this.getProposal(input.proposalId);
    if (!existing) throw new Error(`Proposal ${input.proposalId} not found.`);
    if (existing.reviewVersion !== input.expectedVersion) {
      return null;
    }

    const nextStatus = input.status ?? existing.status;
    const nextNote = input.committeeNote ?? existing.committeeNote;
    const committeeNoteChanged = nextNote !== existing.committeeNote;
    const statusChanged = nextStatus !== existing.status;
    if (!committeeNoteChanged && !statusChanged) return existing;

    const event = this.getEvent();
    if (!event) throw new Error("Event is not initialized.");
    const unreviewedDelta =
      existing.status === "unreviewed" && nextStatus !== "unreviewed"
        ? -1
        : existing.status !== "unreviewed" && nextStatus === "unreviewed"
          ? 1
          : 0;
    const now = new Date().toISOString();
    const auditId = crypto.randomUUID();

    let conflicted = false;
    this.ctx.storage.transactionSync(() => {
      const current = this.ctx.storage.sql
        .exec<{ review_version: number }>(
          "SELECT review_version FROM proposals WHERE id = ?",
          input.proposalId,
        )
        .toArray()[0];
      if (!current || current.review_version !== input.expectedVersion) {
        conflicted = true;
        return;
      }
      this.ctx.storage.sql.exec(
        `UPDATE proposals
         SET status = ?, committee_note = ?, review_version = review_version + 1
         WHERE id = ?`,
        nextStatus,
        nextNote,
        input.proposalId,
      );
      if (unreviewedDelta !== 0) {
        this.ctx.storage.sql.exec(
          `UPDATE events
           SET unreviewed_count = MAX(0, unreviewed_count + ?)
           WHERE id = ?`,
          unreviewedDelta,
          event.id,
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO audit_events
          (id, proposal_id, type, actor_id, actor_name, from_status, to_status,
           committee_note_changed, created_at)
         VALUES (?, ?, 'proposal.review.changed', ?, ?, ?, ?, ?, ?)`,
        auditId,
        input.proposalId,
        input.actorId,
        input.actorName,
        existing.status,
        nextStatus,
        committeeNoteChanged ? 1 : 0,
        now,
      );
    });
    if (conflicted) return null;

    const updated = this.getProposal(input.proposalId);
    if (!updated) throw new Error(`Proposal ${input.proposalId} was not updated.`);
    return updated;
  }

  listProposalAuditEvents(proposalId: string): ProposalAuditEvent[] {
    return this.ctx.storage.sql
      .exec<AuditEventRow>(
        `SELECT id, proposal_id, type, actor_id, actor_name, from_status,
                to_status, committee_note_changed, created_at
         FROM audit_events
         WHERE proposal_id = ?
         ORDER BY created_at DESC, id DESC`,
        proposalId,
      )
      .toArray()
      .map(mapAuditEvent);
  }

  queueOutboxMessage(input: {
    id: string;
    kind: OutboxMessageKind;
    toEmail: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    proposalId: string | null;
  }): OutboxMessage {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO outbox_messages
        (id, kind, to_email, subject, html_body, text_body, status, proposal_id,
         error, created_at, updated_at, sent_at, attempt_count, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, ?, ?, NULL, 0, NULL)`,
      input.id,
      input.kind,
      input.toEmail,
      input.subject,
      input.htmlBody,
      input.textBody,
      input.proposalId,
      now,
      now,
    );
    if (input.kind === "submission_confirmation" && input.proposalId) {
      this.ctx.storage.sql.exec(
        `UPDATE proposals
         SET confirmation_email_status = 'queued'
         WHERE id = ?`,
        input.proposalId,
      );
    }
    const message = this.getOutboxMessage(input.id);
    if (!message) throw new Error("Outbox message was not queued.");
    return message;
  }

  getOutboxMessage(id: string): OutboxMessage | null {
    const row = this.ctx.storage.sql
      .exec<OutboxRow>(
        `SELECT ${OUTBOX_SELECT}
         FROM outbox_messages
         WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ? mapOutbox(row) : null;
  }

  listOutboxMessages(proposalId?: string): OutboxMessage[] {
    const rows = proposalId
      ? this.ctx.storage.sql
          .exec<OutboxRow>(
            `SELECT ${OUTBOX_SELECT}
             FROM outbox_messages
             WHERE proposal_id = ?
             ORDER BY created_at DESC`,
            proposalId,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<OutboxRow>(
            `SELECT ${OUTBOX_SELECT}
             FROM outbox_messages
             ORDER BY created_at DESC`,
          )
          .toArray();
    return rows.map(mapOutbox);
  }

  listDueOutboxMessageIds(nowIso: string, limit: number): string[] {
    const staleSendingBefore = new Date(
      new Date(nowIso).getTime() - STALE_SENDING_MS,
    ).toISOString();
    const rows = this.ctx.storage.sql
      .exec<{ id: string }>(
        `SELECT id
         FROM outbox_messages
         WHERE status = 'queued'
            OR (
              status = 'failed'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
            )
            OR (
              status = 'sending'
              AND updated_at <= ?
            )
         ORDER BY created_at ASC
         LIMIT ?`,
        nowIso,
        staleSendingBefore,
        limit,
      )
      .toArray();
    return rows.map((row) => row.id);
  }

  /**
   * Transactionally claim a due outbox row for delivery.
   * Increments attempt_count and sets status to sending.
   * Stale `sending` rows (worker interrupted mid-delivery) are reclaimed
   * without incrementing attempt_count again.
   */
  claimOutboxForDelivery(id: string, nowIso: string): OutboxMessage | null {
    return this.ctx.storage.transactionSync(() => {
      const message = this.getOutboxMessage(id);
      if (!message) return null;

      const staleSendingBefore = new Date(
        new Date(nowIso).getTime() - STALE_SENDING_MS,
      ).toISOString();
      const dueQueued = message.status === "queued";
      const dueFailed =
        message.status === "failed" &&
        message.nextAttemptAt !== null &&
        message.nextAttemptAt <= nowIso;
      const staleSending =
        message.status === "sending" && message.updatedAt <= staleSendingBefore;
      if (!dueQueued && !dueFailed && !staleSending) return null;

      if (staleSending) {
        this.ctx.storage.sql.exec(
          `UPDATE outbox_messages
           SET status = 'sending',
               updated_at = ?,
               error = NULL,
               next_attempt_at = NULL
           WHERE id = ? AND status = 'sending'`,
          nowIso,
          id,
        );
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE outbox_messages
           SET status = 'sending',
               attempt_count = attempt_count + 1,
               updated_at = ?,
               error = NULL,
               next_attempt_at = NULL
           WHERE id = ?`,
          nowIso,
          id,
        );
      }
      if (message.kind === "submission_confirmation" && message.proposalId) {
        this.ctx.storage.sql.exec(
          `UPDATE proposals SET confirmation_email_status = 'sending' WHERE id = ?`,
          message.proposalId,
        );
      }
      return this.getOutboxMessage(id);
    });
  }

  markOutboxSent(id: string, nowIso = new Date().toISOString()): OutboxMessage {
    const message = this.getOutboxMessage(id);
    if (!message) throw new Error(`Outbox message ${id} not found.`);
    this.ctx.storage.sql.exec(
      `UPDATE outbox_messages
       SET status = 'sent', updated_at = ?, sent_at = ?, error = NULL,
           next_attempt_at = NULL
       WHERE id = ?`,
      nowIso,
      nowIso,
      id,
    );
    if (message.kind === "submission_confirmation" && message.proposalId) {
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET confirmation_email_status = 'sent' WHERE id = ?`,
        message.proposalId,
      );
    }
    if (message.kind === "onboarding_reminder") {
      this.syncReminderDraftFromOutbox(id, "sent", null, nowIso);
    }
    return this.getOutboxMessage(id)!;
  }

  markOutboxFailed(
    id: string,
    error: string,
    nowIso = new Date().toISOString(),
    nextAttemptAt: string | null = null,
  ): OutboxMessage {
    const message = this.getOutboxMessage(id);
    if (!message) throw new Error(`Outbox message ${id} not found.`);
    this.ctx.storage.sql.exec(
      `UPDATE outbox_messages
       SET status = 'failed', updated_at = ?, error = ?, next_attempt_at = ?
       WHERE id = ?`,
      nowIso,
      error,
      nextAttemptAt,
      id,
    );
    if (message.kind === "submission_confirmation" && message.proposalId) {
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET confirmation_email_status = 'failed' WHERE id = ?`,
        message.proposalId,
      );
    }
    if (message.kind === "onboarding_reminder") {
      this.syncReminderDraftFromOutbox(id, "failed", error, nowIso);
    }
    return this.getOutboxMessage(id)!;
  }

  private syncReminderDraftFromOutbox(
    outboxId: string,
    status: "sent" | "failed",
    error: string | null,
    nowIso: string,
  ): void {
    const draft = this.ctx.storage.sql
      .exec<ReminderDraftRow>(
        `SELECT id, speaker_id, proposal_id, to_email, subject, body_text, body_html,
                status, missing_task_ids_json, outbox_id, last_error, created_by_id,
                created_by_name, created_at, updated_at, sent_at
         FROM reminder_drafts WHERE outbox_id = ?`,
        outboxId,
      )
      .toArray()[0];
    if (!draft) return;
    this.ctx.storage.sql.exec(
      `UPDATE reminder_drafts
       SET status = ?, last_error = ?, updated_at = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
       WHERE id = ?`,
      status,
      error,
      nowIso,
      status,
      nowIso,
      draft.id,
    );
    this.appendOnboardingHistory({
      speakerId: draft.speaker_id,
      taskId: null,
      type: status === "sent" ? "reminder_sent" : "reminder_send_failed",
      summary:
        status === "sent"
          ? `Reminder sent: ${draft.subject}`
          : `Reminder failed: ${error ?? "delivery error"}`,
      actorId: draft.created_by_id,
      actorName: draft.created_by_name,
    });
  }

  getOutboxBodies(id: string): { html: string; text: string } | null {
    const row = this.ctx.storage.sql
      .exec<{ html_body: string; text_body: string }>(
        `SELECT html_body, text_body FROM outbox_messages WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ? { html: row.html_body, text: row.text_body } : null;
  }

  createEditToken(input: {
    tokenId: string;
    proposalId: string;
    expiresAt: string;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO edit_tokens (token_id, proposal_id, expires_at, revoked_at, created_at)
       VALUES (?, ?, ?, NULL, ?)`,
      input.tokenId,
      input.proposalId,
      input.expiresAt,
      new Date().toISOString(),
    );
  }

  getEditToken(tokenId: string): {
    tokenId: string;
    proposalId: string;
    expiresAt: string;
    revokedAt: string | null;
  } | null {
    const row = this.ctx.storage.sql
      .exec<EditTokenRow>(
        `SELECT token_id, proposal_id, expires_at, revoked_at, created_at
         FROM edit_tokens
         WHERE token_id = ?`,
        tokenId,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      tokenId: row.token_id,
      proposalId: row.proposal_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  revokeEditToken(tokenId: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE edit_tokens
       SET revoked_at = ?
       WHERE token_id = ? AND revoked_at IS NULL`,
      new Date().toISOString(),
      tokenId,
    );
  }

  createPortalToken(input: {
    tokenId: string;
    speakerId: string;
    proposalId: string | null;
    courseCheckPlanId: string;
    expiresAt: string;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO portal_tokens
        (token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      input.tokenId,
      input.speakerId,
      input.proposalId,
      input.courseCheckPlanId,
      input.expiresAt,
      new Date().toISOString(),
    );
  }

  getPortalToken(tokenId: string): {
    tokenId: string;
    speakerId: string;
    proposalId: string | null;
    courseCheckPlanId: string;
    expiresAt: string;
    revokedAt: string | null;
    signedToken: string | null;
  } | null {
    const row = this.ctx.storage.sql
      .exec<PortalTokenRow>(
        `SELECT token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at
         FROM portal_tokens
         WHERE token_id = ?`,
        tokenId,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      tokenId: row.token_id,
      speakerId: row.speaker_id,
      proposalId: row.proposal_id,
      courseCheckPlanId: row.course_check_plan_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      signedToken: row.signed_token,
    };
  }

  listPortalTokensForPlan(planId: string): Array<{
    tokenId: string;
    speakerId: string;
    expiresAt: string;
    revokedAt: string | null;
    signedToken: string | null;
  }> {
    return this.ctx.storage.sql
      .exec<PortalTokenRow>(
        `SELECT token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at
         FROM portal_tokens
         WHERE course_check_plan_id = ?`,
        planId,
      )
      .toArray()
      .map((row) => ({
        tokenId: row.token_id,
        speakerId: row.speaker_id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        signedToken: row.signed_token,
      }));
  }

  setPortalTokenSignature(input: {
    tokenId: string;
    signedToken: string;
    expiresAt: string;
  }): void {
    this.ctx.storage.sql.exec(
      `UPDATE portal_tokens
       SET signed_token = ?, expires_at = ?
       WHERE token_id = ? AND revoked_at IS NULL`,
      input.signedToken,
      input.expiresAt,
      input.tokenId,
    );
  }

  revokePortalToken(tokenId: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE portal_tokens
       SET revoked_at = ?
       WHERE token_id = ? AND revoked_at IS NULL`,
      new Date().toISOString(),
      tokenId,
    );
  }

  private getSpeakerRow(speakerId: string): SpeakerRow | null {
    return (
      this.ctx.storage.sql
        .exec<SpeakerRow>(
          `SELECT id, name, email, biography, headshot_asset_id, created_at
           FROM speakers WHERE id = ?`,
          speakerId,
        )
        .toArray()[0] ?? null
    );
  }

  private listOnboardingTaskRows(speakerId?: string): OnboardingTaskRow[] {
    if (speakerId) {
      return this.ctx.storage.sql
        .exec<OnboardingTaskRow>(
          `SELECT id, speaker_id, session_id, proposal_id, course_check_plan_id, title, kind,
                  status, due_at, created_at, instructions, completion_requirement,
                  readiness_flag, asset_id, completed_at, created_by
           FROM onboarding_tasks
           WHERE speaker_id = ?
           ORDER BY
             CASE status WHEN 'open' THEN 0 ELSE 1 END,
             due_at IS NULL,
             due_at ASC,
             created_at ASC`,
          speakerId,
        )
        .toArray();
    }
    return this.ctx.storage.sql
      .exec<OnboardingTaskRow>(
        `SELECT id, speaker_id, session_id, proposal_id, course_check_plan_id, title, kind,
                status, due_at, created_at, instructions, completion_requirement,
                readiness_flag, asset_id, completed_at, created_by
         FROM onboarding_tasks
         ORDER BY
           CASE status WHEN 'open' THEN 0 ELSE 1 END,
           due_at IS NULL,
           due_at ASC,
           created_at ASC`,
      )
      .toArray();
  }

  private getTaskAsset(assetId: string | null): {
    asset_id: string;
    file_name: string;
    mime: string;
    size_bytes: number;
  } | null {
    if (!assetId) return null;
    const row = this.getAsset(assetId);
    if (!row || row.status !== "complete") return null;
    return {
      asset_id: row.asset_id,
      file_name: row.file_name,
      mime: row.mime,
      size_bytes: Number(row.size_bytes),
    };
  }

  private mapTasksForSpeaker(speakerId: string): PortalOnboardingTask[] {
    return this.listOnboardingTaskRows(speakerId).map((row) =>
      mapPortalTask(row, this.getTaskAsset(row.asset_id)),
    );
  }

  appendOnboardingHistory(input: {
    speakerId: string;
    taskId: string | null;
    type: string;
    summary: string;
    actorId: string;
    actorName: string;
  }): OnboardingHistoryEntry {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO onboarding_history
        (id, speaker_id, task_id, type, summary, actor_id, actor_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.speakerId,
      input.taskId,
      input.type,
      input.summary,
      input.actorId,
      input.actorName,
      createdAt,
    );
    return {
      id,
      speakerId: input.speakerId,
      taskId: input.taskId,
      type: input.type,
      summary: input.summary,
      actorId: input.actorId,
      actorName: input.actorName,
      createdAt,
    };
  }

  getSpeakerPortalSession(input: {
    speakerId: string;
    expiresAt: string;
  }): SpeakerPortalSession | null {
    const event = this.getEvent();
    if (!event) return null;

    const speaker = this.getSpeakerRow(input.speakerId);
    if (!speaker) return null;

    const participation = this.ctx.storage.sql
      .exec<{
        id: string;
        speaker_id: string;
        proposal_id: string | null;
        title_snapshot: string;
        organization_snapshot: string;
        role: string;
        course_check_plan_id: string;
      }>(
        `SELECT id, speaker_id, proposal_id, title_snapshot, organization_snapshot, role, course_check_plan_id
         FROM event_participations
         WHERE speaker_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        input.speakerId,
      )
      .toArray()[0];
    if (!participation) return null;

    let proposal: SpeakerPortalSession["proposal"] = null;
    let acceptanceState: ProgramOutcome | null = null;
    if (participation.proposal_id) {
      const proposalRow = this.ctx.storage.sql
        .exec<{
          id: string;
          title: string;
          track_name: string;
          program_outcome: string;
        }>(
          `SELECT id, title, track_name, program_outcome FROM proposals WHERE id = ?`,
          participation.proposal_id,
        )
        .toArray()[0];
      if (!proposalRow) return null;
      const outcome =
        proposalRow.program_outcome === "accepted" ||
        proposalRow.program_outcome === "declined"
          ? proposalRow.program_outcome
          : null;
      acceptanceState = outcome;
      proposal = {
        id: proposalRow.id,
        title: proposalRow.title,
        trackName: proposalRow.track_name,
        programOutcome: outcome,
      };
      if (outcome !== "accepted") return null;
    } else {
      acceptanceState = "accepted";
    }

    const sessionRow = this.ctx.storage.sql
      .exec<{
        id: string;
        title: string;
        format: string;
        track_id: string;
        room_id: string | null;
        starts_at: string | null;
        ends_at: string | null;
      }>(
        participation.proposal_id
          ? `SELECT id, title, format, track_id, room_id, starts_at, ends_at
             FROM sessions WHERE proposal_id = ? LIMIT 1`
          : `SELECT id, title, format, track_id, room_id, starts_at, ends_at
             FROM sessions WHERE course_check_plan_id = ? LIMIT 1`,
        participation.proposal_id ?? participation.course_check_plan_id,
      )
      .toArray()[0];

    const tasks = this.mapTasksForSpeaker(input.speakerId);
    const openDeadlines = tasks
      .filter((task) => task.status === "open" && task.dueAt)
      .map((task) => task.dueAt as string)
      .sort();

    const headshot = this.getTaskAsset(speaker.headshot_asset_id);

    return {
      eventId: event.id,
      eventName: event.name,
      expiresAt: input.expiresAt,
      acceptanceState,
      profile: {
        id: speaker.id,
        name: speaker.name,
        email: speaker.email,
        biography: speaker.biography,
        headshotAssetId: speaker.headshot_asset_id,
        headshotFileName: headshot?.file_name ?? null,
      },
      participation: {
        id: participation.id,
        speakerId: participation.speaker_id,
        role: participation.role,
        titleAtEvent: participation.title_snapshot,
        organizationAtEvent: participation.organization_snapshot,
      },
      proposal,
      session: sessionRow
        ? {
            id: sessionRow.id,
            title: sessionRow.title,
            format: sessionRow.format,
            trackId: sessionRow.track_id,
            roomId: sessionRow.room_id,
            startsAt: sessionRow.starts_at,
            endsAt: sessionRow.ends_at,
          }
        : null,
      tasks,
      nextDeadline: openDeadlines[0] ?? null,
    };
  }

  updateSpeakerPortalProfile(input: {
    speakerId: string;
    biography?: string;
    name?: string;
    headshotAssetId?: string | null;
  }): { ok: true } | { ok: false; error: string } {
    const speaker = this.getSpeakerRow(input.speakerId);
    if (!speaker) return { ok: false, error: "Speaker not found." };

    let headshotAssetId = speaker.headshot_asset_id;
    if (input.headshotAssetId !== undefined) {
      if (input.headshotAssetId === null) {
        headshotAssetId = null;
      } else {
        const asset = this.getAsset(input.headshotAssetId);
        if (
          !asset ||
          asset.status !== "complete" ||
          asset.owner_speaker_id !== input.speakerId ||
          asset.purpose !== "portal_headshot"
        ) {
          return { ok: false, error: "That headshot upload is not available." };
        }
        this.ctx.storage.sql.exec(
          `UPDATE assets
           SET claimed_proposal_id = COALESCE(claimed_proposal_id, ?)
           WHERE asset_id = ?`,
          `portal:${input.speakerId}`,
          asset.asset_id,
        );
        headshotAssetId = asset.asset_id;
      }
    }

    const name =
      input.name !== undefined ? input.name.trim() : speaker.name;
    const biography =
      input.biography !== undefined ? input.biography.trim() : speaker.biography;
    if (!name) return { ok: false, error: "Name is required." };
    if (name.length > 200) return { ok: false, error: "Use 200 characters or fewer for name." };
    if (biography.length > 2_000) {
      return { ok: false, error: "Use 2000 characters or fewer for biography." };
    }

    this.ctx.storage.sql.exec(
      `UPDATE speakers
       SET name = ?, biography = ?, headshot_asset_id = ?
       WHERE id = ?`,
      name,
      biography,
      headshotAssetId,
      input.speakerId,
    );
    this.appendOnboardingHistory({
      speakerId: input.speakerId,
      taskId: null,
      type: "profile_updated",
      summary: "Speaker updated profile fields from the portal.",
      actorId: input.speakerId,
      actorName: name,
    });
    return { ok: true };
  }

  createPortalAsset(input: {
    assetId: string;
    objectKey: string;
    fileName: string;
    mime: string;
    sizeBytes: number;
    speakerId: string;
    purpose: "portal_headshot" | "portal_task";
    taskId?: string;
    maxBytes: number;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO assets
        (asset_id, object_key, file_name, mime, size_bytes, status, created_at,
         form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id,
         owner_speaker_id, purpose)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 'portal', 0, ?, ?, NULL, ?, ?)`,
      input.assetId,
      input.objectKey,
      input.fileName,
      input.mime,
      input.sizeBytes,
      new Date().toISOString(),
      input.taskId ? `task:${input.taskId}` : input.purpose,
      input.maxBytes,
      input.speakerId,
      input.purpose,
    );
  }

  completePortalTask(input: {
    speakerId: string;
    taskId: string;
    assetId?: string | null;
  }): { ok: true } | { ok: false; error: string; status?: number } {
    const row = this.listOnboardingTaskRows(input.speakerId).find(
      (task) => task.id === input.taskId,
    );
    if (!row || row.speaker_id !== input.speakerId) {
      return { ok: false, error: "Task not found.", status: 404 };
    }

    const requirement =
      row.completion_requirement || defaultCompletionRequirement(row.kind);
    let assetId = row.asset_id;

    if (requirement === "file") {
      if (!input.assetId) {
        return { ok: false, error: "Upload a file to complete this task.", status: 400 };
      }
      const asset = this.getAsset(input.assetId);
      if (
        !asset ||
        asset.status !== "complete" ||
        asset.owner_speaker_id !== input.speakerId ||
        asset.purpose !== "portal_task"
      ) {
        return { ok: false, error: "That file upload is not available.", status: 400 };
      }
      if (asset.question_name !== `task:${input.taskId}` && asset.question_name !== "portal_task") {
        // allow purpose portal_task with matching task question
        if (!asset.question_name.startsWith("task:")) {
          return { ok: false, error: "That file upload is not available.", status: 400 };
        }
        if (asset.question_name !== `task:${input.taskId}`) {
          return { ok: false, error: "That file belongs to a different task.", status: 400 };
        }
      }
      this.ctx.storage.sql.exec(
        `UPDATE assets
         SET claimed_proposal_id = COALESCE(claimed_proposal_id, ?)
         WHERE asset_id = ?`,
        `portal-task:${input.taskId}`,
        asset.asset_id,
      );
      assetId = asset.asset_id;
    } else if (input.assetId) {
      return {
        ok: false,
        error: "This task does not accept a file attachment.",
        status: 400,
      };
    }

    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_tasks
       SET status = 'completed', asset_id = ?, completed_at = ?
       WHERE id = ? AND speaker_id = ?`,
      assetId,
      now,
      input.taskId,
      input.speakerId,
    );
    this.appendOnboardingHistory({
      speakerId: input.speakerId,
      taskId: input.taskId,
      type: "task_completed",
      summary: `Completed task: ${row.title}`,
      actorId: input.speakerId,
      actorName: this.getSpeakerRow(input.speakerId)?.name ?? "Speaker",
    });
    return { ok: true };
  }

  createOnboardingTask(input: {
    speakerId: string;
    title: string;
    instructions: string;
    kind: string;
    completionRequirement: OnboardingCompletionRequirement;
    readinessFlag?: string | null;
    dueAt?: string | null;
    createdBy: string;
  }): PortalOnboardingTask | { error: string } {
    const speaker = this.getSpeakerRow(input.speakerId);
    if (!speaker) return { error: "Speaker not found." };

    const participation = this.ctx.storage.sql
      .exec<{
        proposal_id: string | null;
        course_check_plan_id: string;
      }>(
        `SELECT proposal_id, course_check_plan_id
         FROM event_participations
         WHERE speaker_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        input.speakerId,
      )
      .toArray()[0];
    if (!participation) return { error: "Speaker is not part of this event." };

    const session = this.ctx.storage.sql
      .exec<{ id: string }>(
        participation.proposal_id
          ? `SELECT id FROM sessions WHERE proposal_id = ? LIMIT 1`
          : `SELECT id FROM sessions WHERE course_check_plan_id = ? LIMIT 1`,
        participation.proposal_id ?? participation.course_check_plan_id,
      )
      .toArray()[0];

    const id = `tsk_org_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const now = new Date().toISOString();
    const title = input.title.trim();
    const instructions = input.instructions.trim();
    const kind = input.kind.trim() || "custom";
    if (!title) return { error: "Task title is required." };
    if (title.length > 200) return { error: "Use 200 characters or fewer for the title." };

    this.ctx.storage.sql.exec(
      `INSERT INTO onboarding_tasks
        (id, speaker_id, session_id, proposal_id, course_check_plan_id, title, kind,
         status, due_at, created_at, instructions, completion_requirement, readiness_flag,
         asset_id, completed_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      id,
      input.speakerId,
      session?.id ?? null,
      participation.proposal_id,
      participation.course_check_plan_id,
      title,
      kind,
      input.dueAt ?? null,
      now,
      instructions,
      input.completionRequirement,
      input.readinessFlag ?? null,
      input.createdBy,
    );
    this.appendOnboardingHistory({
      speakerId: input.speakerId,
      taskId: id,
      type: "task_created",
      summary: `Organizer created task: ${title}`,
      actorId: input.createdBy,
      actorName: input.createdBy,
    });
    const created = this.listOnboardingTaskRows(input.speakerId).find((row) => row.id === id)!;
    return mapPortalTask(created, null);
  }

  getOnboardingBoard(nowMs = Date.now()): OnboardingBoard {
    const event = this.getEvent();
    if (!event) {
      return { eventId: "", speakers: [], drafts: [] };
    }

    const participations = this.ctx.storage.sql
      .exec<{
        id: string;
        speaker_id: string;
        proposal_id: string | null;
        role: string;
      }>(
        `SELECT id, speaker_id, proposal_id, role
         FROM event_participations
         ORDER BY created_at DESC`,
      )
      .toArray();

    const seen = new Set<string>();
    const speakers: OnboardingBoardSpeaker[] = [];

    for (const participation of participations) {
      if (seen.has(participation.speaker_id)) continue;
      seen.add(participation.speaker_id);
      const speaker = this.getSpeakerRow(participation.speaker_id);
      if (!speaker) continue;

      let proposalTitle: string | null = null;
      if (participation.proposal_id) {
        const proposal = this.ctx.storage.sql
          .exec<{ title: string; program_outcome: string }>(
            `SELECT title, program_outcome FROM proposals WHERE id = ?`,
            participation.proposal_id,
          )
          .toArray()[0];
        if (!proposal || proposal.program_outcome !== "accepted") continue;
        proposalTitle = proposal.title;
      }

      const tasks = this.mapTasksForSpeaker(participation.speaker_id);
      const openTasks = tasks.filter((task) => task.status === "open");
      const missingWork = openTasks.map((task) => ({
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        daysUntilDue: daysUntil(task.dueAt, nowMs),
        readinessFlag: task.readinessFlag,
      }));
      const overdueCount = missingWork.filter(
        (item) => item.daysUntilDue !== null && item.daysUntilDue < 0,
      ).length;
      const nextDueAt =
        openTasks
          .map((task) => task.dueAt)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null;
      const readinessFlags = [
        ...new Set(
          openTasks
            .map((task) => task.readinessFlag)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const history = this.ctx.storage.sql
        .exec<OnboardingHistoryRow>(
          `SELECT id, speaker_id, task_id, type, summary, actor_id, actor_name, created_at
           FROM onboarding_history
           WHERE speaker_id = ?
           ORDER BY created_at DESC
           LIMIT 20`,
          participation.speaker_id,
        )
        .toArray()
        .map(mapOnboardingHistory);

      const lastContact = history.find(
        (entry) =>
          entry.type === "reminder_sent" ||
          entry.type === "reminder_send_failed" ||
          entry.type === "reminder_queued",
      );

      speakers.push({
        speakerId: speaker.id,
        name: speaker.name,
        email: speaker.email,
        proposalId: participation.proposal_id,
        proposalTitle,
        role: participation.role,
        openTaskCount: openTasks.length,
        overdueCount,
        nextDueAt,
        daysUntilNextDue: daysUntil(nextDueAt, nowMs),
        readinessFlags,
        missingWork,
        lastContactAt: lastContact?.createdAt ?? null,
        lastContactStatus: lastContact
          ? lastContact.type === "reminder_sent"
            ? "sent"
            : lastContact.type === "reminder_send_failed"
              ? "failed"
              : "queued"
          : null,
        history,
      });
    }

    speakers.sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      const aDue = a.daysUntilNextDue ?? Number.POSITIVE_INFINITY;
      const bDue = b.daysUntilNextDue ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.name.localeCompare(b.name);
    });

    const drafts = this.ctx.storage.sql
      .exec<ReminderDraftRow>(
        `SELECT id, speaker_id, proposal_id, to_email, subject, body_text, body_html,
                status, missing_task_ids_json, outbox_id, last_error, created_by_id,
                created_by_name, created_at, updated_at, sent_at
         FROM reminder_drafts
         ORDER BY updated_at DESC
         LIMIT 50`,
      )
      .toArray()
      .map(mapReminderDraft);

    return { eventId: event.id, speakers, drafts };
  }

  prepareOnboardingReminder(input: {
    speakerId: string;
    actorId: string;
    actorName: string;
    nowMs?: number;
  }): OnboardingReminderDraft | { error: string } {
    const event = this.getEvent();
    if (!event) return { error: "Event not found." };
    const speaker = this.getSpeakerRow(input.speakerId);
    if (!speaker) return { error: "Speaker not found." };

    const participation = this.ctx.storage.sql
      .exec<{ proposal_id: string | null }>(
        `SELECT proposal_id FROM event_participations
         WHERE speaker_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        input.speakerId,
      )
      .toArray()[0];
    if (!participation) return { error: "Speaker is not part of this event." };

    const nowMs = input.nowMs ?? Date.now();
    const openTasks = this.mapTasksForSpeaker(input.speakerId).filter(
      (task) => task.status === "open",
    );

    const lines = openTasks.map((task) => {
      const dueLabel = task.dueAt
        ? (() => {
            const days = daysUntil(task.dueAt, nowMs);
            if (days === null) return `due ${task.dueAt}`;
            if (days < 0) return `${Math.abs(days)} day(s) overdue`;
            if (days === 0) return "due today";
            return `due in ${days} day(s)`;
          })()
        : "no due date";
      return `- ${task.title} (${dueLabel})`;
    });

    const subject =
      openTasks.length > 0
        ? `Reminder: finish your ${event.name} speaker onboarding`
        : `Quick check-in about ${event.name}`;
    const bodyText = [
      `Hi ${speaker.name},`,
      "",
      ...(openTasks.length > 0
        ? [
            `This is a friendly reminder about outstanding onboarding work for ${event.name}:`,
            "",
            ...lines,
            "",
            "Please complete these items in your speaker portal when you can.",
          ]
        : [
            `Checking in about ${event.name}.`,
            "",
            "We do not see open onboarding tasks on your side right now. Reply if anything is blocking you or if you need help from the organizers.",
          ]),
      "",
      "Thank you,",
      input.actorName,
    ].join("\n");
    const bodyHtml = bodyText
      .split("\n")
      .map((line) =>
        line.startsWith("- ")
          ? `<li>${escapeHtml(line.slice(2))}</li>`
          : line
            ? `<p>${escapeHtml(line)}</p>`
            : "",
      )
      .join("");

    const id = `rem_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO reminder_drafts
        (id, speaker_id, proposal_id, to_email, subject, body_text, body_html, status,
         missing_task_ids_json, outbox_id, last_error, created_by_id, created_by_name,
         created_at, updated_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?, ?, ?, ?, NULL)`,
      id,
      input.speakerId,
      participation.proposal_id,
      speaker.email,
      subject,
      bodyText,
      `<div>${bodyHtml}</div>`,
      JSON.stringify(openTasks.map((task) => task.id)),
      input.actorId,
      input.actorName,
      now,
      now,
    );
    this.appendOnboardingHistory({
      speakerId: input.speakerId,
      taskId: null,
      type: "reminder_draft_created",
      summary: `Prepared reminder draft covering ${openTasks.length} open task(s).`,
      actorId: input.actorId,
      actorName: input.actorName,
    });
    return this.getReminderDraft(id)!;
  }

  getReminderDraft(id: string): OnboardingReminderDraft | null {
    const row = this.ctx.storage.sql
      .exec<ReminderDraftRow>(
        `SELECT id, speaker_id, proposal_id, to_email, subject, body_text, body_html,
                status, missing_task_ids_json, outbox_id, last_error, created_by_id,
                created_by_name, created_at, updated_at, sent_at
         FROM reminder_drafts WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ? mapReminderDraft(row) : null;
  }

  updateReminderDraft(input: {
    id: string;
    subject?: string;
    bodyText?: string;
  }): OnboardingReminderDraft | { error: string } {
    const current = this.getReminderDraft(input.id);
    if (!current) return { error: "Draft not found." };
    if (current.status !== "draft") {
      return { error: "Only editable drafts can be changed." };
    }
    const subject = (input.subject ?? current.subject).trim();
    const bodyText = (input.bodyText ?? current.bodyText).trim();
    if (!subject) return { error: "Subject is required." };
    if (!bodyText) return { error: "Message body is required." };
    const bodyHtml = bodyText
      .split("\n")
      .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ""))
      .join("");
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE reminder_drafts
       SET subject = ?, body_text = ?, body_html = ?, updated_at = ?
       WHERE id = ?`,
      subject,
      bodyText,
      bodyHtml,
      now,
      input.id,
    );
    return this.getReminderDraft(input.id)!;
  }

  discardReminderDraft(id: string): OnboardingReminderDraft | { error: string } {
    const current = this.getReminderDraft(id);
    if (!current) return { error: "Draft not found." };
    if (current.status !== "draft") {
      return { error: "Only open drafts can be discarded." };
    }
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE reminder_drafts SET status = 'discarded', updated_at = ? WHERE id = ?`,
      now,
      id,
    );
    this.appendOnboardingHistory({
      speakerId: current.speakerId,
      taskId: null,
      type: "reminder_discarded",
      summary: `Discarded reminder draft: ${current.subject}`,
      actorId: current.createdById,
      actorName: current.createdByName,
    });
    return this.getReminderDraft(id)!;
  }

  /**
   * Queue an explicit send. Creating/editing a draft never calls this.
   * Returns the draft after queueing; caller should deliver the outbox message.
   */
  queueReminderSend(id: string):
    | { draft: OnboardingReminderDraft; outboxId: string }
    | { error: string } {
    const current = this.getReminderDraft(id);
    if (!current) return { error: "Draft not found." };
    if (current.status !== "draft" && current.status !== "failed") {
      return { error: "Only draft or failed reminders can be sent." };
    }

    const outboxId = `outbox-reminder-${id}`;
    const existing = this.getOutboxMessage(outboxId);
    if (!existing) {
      this.queueOutboxMessage({
        id: outboxId,
        kind: "onboarding_reminder",
        toEmail: current.toEmail,
        subject: current.subject,
        htmlBody: current.bodyHtml,
        textBody: current.bodyText,
        proposalId: current.proposalId,
      });
    } else if (existing.status === "sent") {
      return { error: "This reminder was already sent." };
    } else {
      // refresh bodies for retry
      this.ctx.storage.sql.exec(
        `UPDATE outbox_messages
         SET subject = ?, html_body = ?, text_body = ?, status = 'queued',
             error = NULL, next_attempt_at = NULL, updated_at = ?
         WHERE id = ?`,
        current.subject,
        current.bodyHtml,
        current.bodyText,
        new Date().toISOString(),
        outboxId,
      );
    }

    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE reminder_drafts
       SET status = 'queued', outbox_id = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
      outboxId,
      now,
      id,
    );
    this.appendOnboardingHistory({
      speakerId: current.speakerId,
      taskId: null,
      type: "reminder_queued",
      summary: `Queued reminder for send: ${current.subject}`,
      actorId: current.createdById,
      actorName: current.createdByName,
    });
    return { draft: this.getReminderDraft(id)!, outboxId };
  }

  updateSessionForTest(
    sessionId: string,
    patch: {
      title?: string;
      roomId?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
    },
  ): void {
    const current = this.ctx.storage.sql
      .exec<{
        title: string;
        room_id: string | null;
        starts_at: string | null;
        ends_at: string | null;
      }>(
        `SELECT title, room_id, starts_at, ends_at FROM sessions WHERE id = ?`,
        sessionId,
      )
      .toArray()[0];
    if (!current) throw new Error(`Session ${sessionId} not found`);
    this.ctx.storage.sql.exec(
      `UPDATE sessions
       SET title = ?, room_id = ?, starts_at = ?, ends_at = ?
       WHERE id = ?`,
      patch.title ?? current.title,
      patch.roomId === undefined ? current.room_id : patch.roomId,
      patch.startsAt === undefined ? current.starts_at : patch.startsAt,
      patch.endsAt === undefined ? current.ends_at : patch.endsAt,
      sessionId,
    );
  }

  private backfillSessionCalendarUids(): void {
    const rows = this.ctx.storage.sql
      .exec<{ id: string; calendar_uid: string }>(
        `SELECT id, calendar_uid FROM sessions`,
      )
      .toArray();
    for (const row of rows) {
      if (row.calendar_uid) continue;
      this.ctx.storage.sql.exec(
        `UPDATE sessions SET calendar_uid = ? WHERE id = ?`,
        `cal_${row.id}`,
        row.id,
      );
    }
  }

  private roomNameMap(): Map<string, string> {
    const event = this.ctx.storage.sql
      .exec<{ rooms_json: string }>(`SELECT rooms_json FROM events LIMIT 1`)
      .toArray()[0];
    const rooms = event
      ? (JSON.parse(event.rooms_json) as Array<{ id: string; name: string }>)
      : [];
    return new Map(rooms.map((room) => [room.id, room.name]));
  }

  private trackNameMap(): Map<string, string> {
    const event = this.ctx.storage.sql
      .exec<{ tracks_json: string }>(`SELECT tracks_json FROM events LIMIT 1`)
      .toArray()[0];
    const tracks = event
      ? (JSON.parse(event.tracks_json) as Array<{ id: string; name: string }>)
      : [];
    return new Map(tracks.map((track) => [track.id, track.name]));
  }

  private listSessionSpeakers(
    session: {
      proposal_id: string | null;
      course_check_plan_id: string;
    },
  ): Array<{ id: string; name: string; email: string; role: string }> {
    const rows = this.ctx.storage.sql
      .exec<{
        id: string;
        name: string;
        email: string;
        role: string;
      }>(
        `SELECT s.id AS id, s.name AS name, s.email AS email, p.role AS role
         FROM event_participations p
         JOIN speakers s ON s.id = p.speaker_id
         WHERE (
           (? IS NOT NULL AND p.proposal_id = ?)
           OR (? IS NULL AND p.course_check_plan_id = ?)
         )
         ORDER BY CASE p.role WHEN 'primary' THEN 0 ELSE 1 END, s.name ASC`,
        session.proposal_id,
        session.proposal_id,
        session.proposal_id,
        session.course_check_plan_id,
      )
      .toArray();
    return rows;
  }

  private toOrganizerSession(row: {
    id: string;
    proposal_id: string | null;
    course_check_plan_id: string;
    title: string;
    format: string;
    track_id: string;
    room_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
    calendar_uid: string;
    calendar_sequence: number;
    calendar_invite_recorded: number;
  }): OrganizerSession {
    const rooms = this.roomNameMap();
    const tracks = this.trackNameMap();
    const speakers = this.listSessionSpeakers(row);
    return {
      id: row.id,
      proposalId: row.proposal_id,
      courseCheckPlanId: row.course_check_plan_id,
      title: row.title,
      format: row.format,
      trackId: row.track_id,
      trackName: tracks.get(row.track_id) ?? row.track_id,
      roomId: row.room_id,
      roomName: row.room_id ? (rooms.get(row.room_id) ?? row.room_id) : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      placementStatus: placementStatus({
        roomId: row.room_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      }),
      speakers,
      calendarUid: row.calendar_uid || `cal_${row.id}`,
      calendarSequence: Number(row.calendar_sequence) || 0,
      calendarInviteRecorded: Number(row.calendar_invite_recorded) === 1,
      createdAt: row.created_at,
    };
  }

  private loadSessionRows() {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        proposal_id: string | null;
        course_check_plan_id: string;
        title: string;
        format: string;
        track_id: string;
        room_id: string | null;
        starts_at: string | null;
        ends_at: string | null;
        created_at: string;
        calendar_uid: string;
        calendar_sequence: number;
        calendar_invite_recorded: number;
      }>(
        `SELECT id, proposal_id, course_check_plan_id, title, format, track_id,
                room_id, starts_at, ends_at, created_at,
                COALESCE(calendar_uid, '') AS calendar_uid,
                COALESCE(calendar_sequence, 0) AS calendar_sequence,
                COALESCE(calendar_invite_recorded, 0) AS calendar_invite_recorded
         FROM sessions
         ORDER BY created_at ASC, title ASC`,
      )
      .toArray();
  }

  private listCalendarIntentRecords(): CalendarIntentRecord[] {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        session_id: string;
        kind: string;
        uid: string;
        sequence: number;
        room_id: string | null;
        starts_at: string | null;
        ends_at: string | null;
        status: string;
        created_at: string;
      }>(
        `SELECT id, session_id, kind, uid, sequence, room_id, starts_at, ends_at,
                status, created_at
         FROM calendar_intents
         ORDER BY created_at ASC`,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        kind: row.kind as CalendarIntentRecord["kind"],
        uid: row.uid,
        sequence: Number(row.sequence),
        roomId: row.room_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: "pending" as const,
        createdAt: row.created_at,
      }));
  }

  private agendaCounts(sessions: OrganizerSession[]) {
    let unplaced = 0;
    let partial = 0;
    let placed = 0;
    for (const session of sessions) {
      if (session.placementStatus === "unplaced") unplaced += 1;
      else if (session.placementStatus === "partial") partial += 1;
      else placed += 1;
    }
    return { unplaced, partial, placed };
  }

  private computeConflicts(sessions: OrganizerSession[]) {
    return detectScheduleConflicts(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        roomId: session.roomId,
        roomName: session.roomName,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        speakers: session.speakers.map((speaker) => ({
          id: speaker.id,
          name: speaker.name,
        })),
      })),
    );
  }

  getAgendaWorkspace(): AgendaWorkspaceResponse {
    this.backfillSessionCalendarUids();
    const sessions = this.loadSessionRows().map((row) =>
      this.toOrganizerSession(row),
    );
    const conflicts = this.computeConflicts(sessions);
    const baseCounts = this.agendaCounts(sessions);
    const event = this.ctx.storage.sql
      .exec<{ id: string }>(`SELECT id FROM events LIMIT 1`)
      .toArray()[0];
    return {
      eventId: event?.id ?? "",
      sessions,
      unplacedSessions: sessions.filter(
        (session) => session.placementStatus !== "placed",
      ),
      conflicts,
      counts: {
        ...baseCounts,
        conflicts: conflicts.length,
      },
      calendarIntents: this.listCalendarIntentRecords(),
    };
  }

  updateSessionPlacement(
    sessionId: string,
    patch: SessionPlacementPatch,
  ):
    | { ok: true; result: SessionPlacementResponse }
    | { ok: false; status: 400 | 404; error: string } {
    this.backfillSessionCalendarUids();
    const current = this.loadSessionRows().find((row) => row.id === sessionId);
    if (!current) {
      return { ok: false, status: 404, error: "Session not found" };
    }

    if (
      patch.roomId === undefined &&
      patch.startsAt === undefined &&
      patch.endsAt === undefined
    ) {
      return {
        ok: false,
        status: 400,
        error: "At least one of roomId, startsAt, or endsAt is required.",
      };
    }

    if (patch.roomId !== undefined && patch.roomId !== null) {
      const rooms = this.roomNameMap();
      if (!rooms.has(patch.roomId)) {
        return { ok: false, status: 400, error: "Unknown room." };
      }
    }

    for (const key of ["startsAt", "endsAt"] as const) {
      const value = patch[key];
      if (value === undefined || value === null) continue;
      if (Number.isNaN(Date.parse(value))) {
        return {
          ok: false,
          status: 400,
          error: `${key} must be a valid ISO timestamp or null.`,
        };
      }
    }

    const nextRoomId =
      patch.roomId === undefined ? current.room_id : patch.roomId;
    const nextStartsAt =
      patch.startsAt === undefined ? current.starts_at : patch.startsAt;
    const nextEndsAt =
      patch.endsAt === undefined ? current.ends_at : patch.endsAt;

    if (nextStartsAt && nextEndsAt && Date.parse(nextStartsAt) >= Date.parse(nextEndsAt)) {
      return {
        ok: false,
        status: 400,
        error: "startsAt must be earlier than endsAt.",
      };
    }

    const scheduleChanged =
      nextRoomId !== current.room_id ||
      nextStartsAt !== current.starts_at ||
      nextEndsAt !== current.ends_at;

    const now = new Date().toISOString();
    const calendarUid = current.calendar_uid || `cal_${current.id}`;
    let calendarSequence = Number(current.calendar_sequence) || 0;
    let calendarInviteRecorded = Number(current.calendar_invite_recorded) === 1;
    const createdIntents: CalendarIntentRecord[] = [];

    const fullyScheduled = Boolean(nextRoomId && nextStartsAt && nextEndsAt);

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE sessions
         SET room_id = ?, starts_at = ?, ends_at = ?, calendar_uid = ?
         WHERE id = ?`,
        nextRoomId,
        nextStartsAt,
        nextEndsAt,
        calendarUid,
        sessionId,
      );

      if (scheduleChanged && fullyScheduled) {
        if (!calendarInviteRecorded) {
          calendarSequence = 0;
          const intent: CalendarIntentRecord = {
            id: `cint_${sessionId}_create_${now}`,
            sessionId,
            kind: "create",
            uid: calendarUid,
            sequence: calendarSequence,
            roomId: nextRoomId,
            startsAt: nextStartsAt,
            endsAt: nextEndsAt,
            status: "pending",
            createdAt: now,
          };
          this.ctx.storage.sql.exec(
            `INSERT INTO calendar_intents
              (id, session_id, kind, uid, sequence, room_id, starts_at, ends_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            intent.id,
            intent.sessionId,
            intent.kind,
            intent.uid,
            intent.sequence,
            intent.roomId,
            intent.startsAt,
            intent.endsAt,
            intent.createdAt,
          );
          this.ctx.storage.sql.exec(
            `UPDATE sessions
             SET calendar_sequence = ?, calendar_invite_recorded = 1
             WHERE id = ?`,
            calendarSequence,
            sessionId,
          );
          calendarInviteRecorded = true;
          createdIntents.push(intent);
        } else {
          calendarSequence += 1;
          const intent: CalendarIntentRecord = {
            id: `cint_${sessionId}_update_${calendarSequence}_${now}`,
            sessionId,
            kind: "update",
            uid: calendarUid,
            sequence: calendarSequence,
            roomId: nextRoomId,
            startsAt: nextStartsAt,
            endsAt: nextEndsAt,
            status: "pending",
            createdAt: now,
          };
          this.ctx.storage.sql.exec(
            `INSERT INTO calendar_intents
              (id, session_id, kind, uid, sequence, room_id, starts_at, ends_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            intent.id,
            intent.sessionId,
            intent.kind,
            intent.uid,
            intent.sequence,
            intent.roomId,
            intent.startsAt,
            intent.endsAt,
            intent.createdAt,
          );
          this.ctx.storage.sql.exec(
            `UPDATE sessions SET calendar_sequence = ? WHERE id = ?`,
            calendarSequence,
            sessionId,
          );
          createdIntents.push(intent);
        }
      }
    });

    const agenda = this.getAgendaWorkspace();
    const session = agenda.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return { ok: false, status: 404, error: "Session not found after update" };
    }
    return {
      ok: true,
      result: {
        session,
        conflicts: agenda.conflicts,
        counts: agenda.counts,
        calendarIntentsCreated: createdIntents,
      },
    };
  }

  markSessionCalendarInvitedForTest(sessionId: string): void {
    const row = this.loadSessionRows().find((item) => item.id === sessionId);
    if (!row) throw new Error(`Session ${sessionId} not found`);
    const uid = row.calendar_uid || `cal_${sessionId}`;
    this.ctx.storage.sql.exec(
      `UPDATE sessions
       SET calendar_uid = ?, calendar_invite_recorded = 1, calendar_sequence = ?
       WHERE id = ?`,
      uid,
      Number(row.calendar_sequence) || 0,
      sessionId,
    );
  }

  private listPublicProgramRevisionMeta(): PublicProgramRevisionMeta[] {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        version: number;
        is_current: number;
        published_at: string;
      }>(
        `SELECT id, version, is_current, published_at
         FROM public_program_revisions
         ORDER BY version DESC`,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        version: Number(row.version),
        publishedAt: row.published_at,
        isCurrent: Number(row.is_current) === 1,
      }));
  }

  private toPublicEventSlice(event: EventRecord): PublicProgramEventSlice {
    return {
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      themeAccent: normalizeThemeAccent(event.themeAccent),
      tracks: event.tracks.map((track) => ({ id: track.id, name: track.name })),
      rooms: event.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        readiness: room.readiness,
      })),
    };
  }

  private proposalAbstractMap(): Map<string, string> {
    const rows = this.ctx.storage.sql
      .exec<{ id: string; abstract: string }>(
        `SELECT id, abstract FROM proposals`,
      )
      .toArray();
    return new Map(rows.map((row) => [row.id, row.abstract ?? ""]));
  }

  private listPublicSessionSpeakers(session: {
    proposal_id: string | null;
    course_check_plan_id: string;
  }): Array<{
    id: string;
    name: string;
    role: string;
    biography: string;
    headshotAssetId: string | null;
  }> {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        name: string;
        role: string;
        biography: string;
        headshot_asset_id: string | null;
      }>(
        `SELECT s.id AS id,
                s.name AS name,
                p.role AS role,
                COALESCE(s.biography, '') AS biography,
                s.headshot_asset_id AS headshot_asset_id
         FROM event_participations p
         JOIN speakers s ON s.id = p.speaker_id
         WHERE (
           (? IS NOT NULL AND p.proposal_id = ?)
           OR (? IS NULL AND p.course_check_plan_id = ?)
         )
         ORDER BY CASE p.role WHEN 'primary' THEN 0 ELSE 1 END, s.name ASC`,
        session.proposal_id,
        session.proposal_id,
        session.proposal_id,
        session.course_check_plan_id,
      )
      .toArray()
      .filter((row) => row.name.trim().length > 0)
      .map((row) => ({
        id: row.id,
        name: row.name.trim(),
        role: row.role,
        biography: (row.biography ?? "").trim(),
        headshotAssetId: row.headshot_asset_id ?? null,
      }));
  }

  /** Build the publishable public subset from current working program state. */
  buildPublicProgramSnapshotFromWorking(): {
    sessions: PublicProgramSession[];
    speakers: PublicProgramSpeaker[];
  } {
    this.backfillSessionCalendarUids();
    const event = this.getEvent();
    const rooms = event?.rooms ?? [];
    const roomPending = new Map(
      rooms.map((room) => [room.id, room.readiness === "pending"] as const),
    );
    const abstracts = this.proposalAbstractMap();
    const tracks = this.trackNameMap();
    const roomNames = this.roomNameMap();
    const speakerAcc = new Map<string, PublicProgramSpeaker>();
    const sessions: PublicProgramSession[] = [];

    for (const row of this.loadSessionRows()) {
      const speakers = this.listPublicSessionSpeakers(row);
      if (speakers.length === 0) continue;
      const description = row.proposal_id
        ? (abstracts.get(row.proposal_id) ?? "").trim()
        : "";
      const roomId = row.room_id;
      const session: PublicProgramSession = {
        id: row.id,
        title: row.title,
        description,
        format: row.format || "talk",
        trackId: row.track_id,
        trackName: tracks.get(row.track_id) ?? row.track_id,
        roomId,
        roomName: roomId ? (roomNames.get(roomId) ?? roomId) : null,
        roomPending: !roomId || roomPending.get(roomId) === true,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        day: row.starts_at ? row.starts_at.slice(0, 10) : null,
        calendarUid: row.calendar_uid || `cal_${row.id}`,
        calendarSequence: Number(row.calendar_sequence) || 0,
        speakers: speakers.map((speaker) => ({
          id: speaker.id,
          name: speaker.name,
          role: speaker.role,
        })),
      };
      sessions.push(session);
      for (const speaker of speakers) {
        const existing = speakerAcc.get(speaker.id);
        if (existing) {
          if (!existing.sessionIds.includes(session.id)) {
            existing.sessionIds.push(session.id);
          }
          if (!existing.biography && speaker.biography) {
            existing.biography = speaker.biography;
          }
          if (!existing.headshotAssetId && speaker.headshotAssetId) {
            existing.headshotAssetId = speaker.headshotAssetId;
          }
        } else {
          speakerAcc.set(speaker.id, {
            id: speaker.id,
            name: speaker.name,
            biography: speaker.biography,
            headshotAssetId: speaker.headshotAssetId,
            sessionIds: [session.id],
          });
        }
      }
    }

    sessions.sort((a, b) => {
      if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
      if (a.startsAt) return -1;
      if (b.startsAt) return 1;
      return a.title.localeCompare(b.title);
    });

    return {
      sessions,
      speakers: Array.from(speakerAcc.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  publishPublicProgramRevisionFromWorking(source = "working"): PublicProgramResponse {
    const event = this.getEvent();
    if (!event) throw new Error("Event is not initialized.");
    const snapshot = this.buildPublicProgramSnapshotFromWorking();
    const now = new Date().toISOString();
    const maxVersion = this.ctx.storage.sql
      .exec<{ max_version: number }>(
        `SELECT COALESCE(MAX(version), 0) AS max_version FROM public_program_revisions`,
      )
      .toArray()[0]?.max_version;
    const version = Number(maxVersion ?? 0) + 1;
    const id = `pubrev_${event.id}_${version}`;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE public_program_revisions SET is_current = 0 WHERE is_current = 1`,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO public_program_revisions
          (id, version, is_current, published_at, snapshot_json, source)
         VALUES (?, ?, 1, ?, ?, ?)`,
        id,
        version,
        now,
        JSON.stringify(snapshot),
        source,
      );
    });
    const result = this.getPublicProgram();
    if (!result) throw new Error("Failed to load published public program.");
    return result;
  }

  /** Test/admin seam until Course Check 06 owns publication transitions. */
  publishPublicProgramRevisionForTest(): PublicProgramResponse {
    return this.publishPublicProgramRevisionFromWorking("test");
  }

  seedPublicProgramDemoIfEmpty(): void {
    const existing = this.ctx.storage.sql
      .exec<{ total: number }>(
        `SELECT COUNT(*) AS total FROM public_program_revisions`,
      )
      .toArray()[0]?.total;
    if (Number(existing ?? 0) > 0) return;
    const event = this.getEvent();
    if (!event) return;

    const day1 = event.startsOn;
    const day2 = event.endsOn;
    const trackA = event.tracks[0];
    const trackB = event.tracks[1] ?? event.tracks[0];
    const roomA = event.rooms[0];
    const roomB = event.rooms[1] ?? event.rooms[0];
    if (!trackA || !roomA) return;

    const sessions: PublicProgramSession[] = [
      {
        id: "demo-ses-keynote",
        title: "Opening keynote: charts that hold",
        description:
          "A walkthrough of how organizers keep program truth steady from first proposal to public agenda.",
        format: "keynote",
        trackId: trackA.id,
        trackName: trackA.name,
        roomId: roomA.id,
        roomName: roomA.name,
        roomPending: roomA.readiness === "pending",
        startsAt: `${day1}T15:00:00.000Z`,
        endsAt: `${day1}T15:45:00.000Z`,
        day: day1,
        calendarUid: "cal_demo-ses-keynote",
        calendarSequence: 0,
        speakers: [{ id: "demo-sp-ada", name: "Ada Lovelace", role: "primary" }],
      },
      {
        id: "demo-ses-ops",
        title: "Program ops that survive change",
        description:
          "Practical patterns for rooms, TBD slots, and speaker readiness without leaking committee work.",
        format: "talk",
        trackId: trackB.id,
        trackName: trackB.name,
        roomId: roomB.id,
        roomName: roomB.name,
        roomPending: roomB.readiness === "pending",
        startsAt: `${day1}T16:00:00.000Z`,
        endsAt: `${day1}T16:45:00.000Z`,
        day: day1,
        calendarUid: "cal_demo-ses-ops",
        calendarSequence: 0,
        speakers: [
          { id: "demo-sp-grace", name: "Grace Hopper", role: "primary" },
          { id: "demo-sp-ada", name: "Ada Lovelace", role: "co" },
        ],
      },
      {
        id: "demo-ses-workshop",
        title: "Hands-on schedule repair",
        description:
          "Workshop session held with time still settling — public pages show TBD without hiding the talk.",
        format: "workshop",
        trackId: trackA.id,
        trackName: trackA.name,
        roomId: null,
        roomName: null,
        roomPending: true,
        startsAt: null,
        endsAt: null,
        day: null,
        calendarUid: "cal_demo-ses-workshop",
        calendarSequence: 0,
        speakers: [{ id: "demo-sp-katherine", name: "Katherine Johnson", role: "primary" }],
      },
      {
        id: "demo-ses-day2",
        title: "Closing circle",
        description: "What we learned shipping a public program people can trust.",
        format: "talk",
        trackId: trackB.id,
        trackName: trackB.name,
        roomId: roomA.id,
        roomName: roomA.name,
        roomPending: roomA.readiness === "pending",
        startsAt: `${day2}T17:00:00.000Z`,
        endsAt: `${day2}T17:40:00.000Z`,
        day: day2,
        calendarUid: "cal_demo-ses-day2",
        calendarSequence: 0,
        speakers: [{ id: "demo-sp-grace", name: "Grace Hopper", role: "primary" }],
      },
    ];

    const speakers: PublicProgramSpeaker[] = [
      {
        id: "demo-sp-ada",
        name: "Ada Lovelace",
        biography:
          "Writes analytical engines for conference operations and keeps the public story honest.",
        headshotAssetId: null,
        sessionIds: ["demo-ses-keynote", "demo-ses-ops"],
      },
      {
        id: "demo-sp-grace",
        name: "Grace Hopper",
        biography:
          "Debugs schedules the way she debugged compilers — patiently, and with receipts.",
        headshotAssetId: null,
        sessionIds: ["demo-ses-ops", "demo-ses-day2"],
      },
      {
        id: "demo-sp-katherine",
        name: "Katherine Johnson",
        biography: "Turns incomplete placement into clear public TBD states.",
        headshotAssetId: null,
        sessionIds: ["demo-ses-workshop"],
      },
    ];

    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO public_program_revisions
        (id, version, is_current, published_at, snapshot_json, source)
       VALUES (?, 1, 1, ?, ?, 'seed')`,
      `pubrev_${event.id}_seed`,
      now,
      JSON.stringify({ sessions, speakers }),
    );
  }

  getPublicProgram(revisionId?: string): PublicProgramResponse | null {
    const event = this.getEvent();
    if (!event) return null;
    this.seedPublicProgramDemoIfEmpty();

    const row = revisionId
      ? this.ctx.storage.sql
          .exec<{
            id: string;
            version: number;
            is_current: number;
            published_at: string;
            snapshot_json: string;
          }>(
            `SELECT id, version, is_current, published_at, snapshot_json
             FROM public_program_revisions
             WHERE id = ?
             LIMIT 1`,
            revisionId,
          )
          .toArray()[0]
      : this.ctx.storage.sql
          .exec<{
            id: string;
            version: number;
            is_current: number;
            published_at: string;
            snapshot_json: string;
          }>(
            `SELECT id, version, is_current, published_at, snapshot_json
             FROM public_program_revisions
             WHERE is_current = 1
             ORDER BY version DESC
             LIMIT 1`,
          )
          .toArray()[0];

    if (!row) return null;

    let snapshot: {
      sessions?: PublicProgramSession[];
      speakers?: PublicProgramSpeaker[];
    };
    try {
      snapshot = JSON.parse(row.snapshot_json) as {
        sessions?: PublicProgramSession[];
        speakers?: PublicProgramSpeaker[];
      };
    } catch {
      return null;
    }

    const revision: PublicProgramRevisionMeta = {
      id: row.id,
      version: Number(row.version),
      publishedAt: row.published_at,
      isCurrent: Number(row.is_current) === 1,
    };

    return {
      event: this.toPublicEventSlice(event),
      revision,
      sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
      speakers: Array.isArray(snapshot.speakers) ? snapshot.speakers : [],
      revisions: this.listPublicProgramRevisionMeta(),
    };
  }

  getPublicProgramSessionIcs(
    sessionId: string,
    revisionId?: string,
  ): { ok: true; ics: string; filename: string } | { ok: false; status: 404 } {
    const program = this.getPublicProgram(revisionId);
    if (!program) return { ok: false, status: 404 };
    const session = program.sessions.find((item) => item.id === sessionId);
    if (!session) return { ok: false, status: 404 };
    const location =
      session.roomName ??
      (session.roomPending ? "Location pending" : "");
    const ics = buildSessionIcs({
      uid: session.calendarUid,
      sequence: session.calendarSequence,
      title: session.title,
      description: session.description,
      location,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      eventName: program.event.name,
    });
    return {
      ok: true,
      ics,
      filename: `${session.id}.ics`,
    };
  }

  isPublicProgramHeadshot(assetId: string): boolean {
    const program = this.getPublicProgram();
    if (!program) return false;
    return program.speakers.some((speaker) => speaker.headshotAssetId === assetId);
  }

  updateSpeakerProfileForTest(
    speakerId: string,
    patch: { biography?: string; name?: string },
  ): void {
    const current = this.ctx.storage.sql
      .exec<SpeakerRow>(
        `SELECT id, name, email, biography, headshot_asset_id, created_at FROM speakers WHERE id = ?`,
        speakerId,
      )
      .toArray()[0];
    if (!current) throw new Error(`Speaker ${speakerId} not found`);
    this.ctx.storage.sql.exec(
      `UPDATE speakers SET name = ?, biography = ? WHERE id = ?`,
      patch.name ?? current.name,
      patch.biography ?? current.biography,
      speakerId,
    );
  }

  updateParticipationSnapshotForTest(
    participationId: string,
    patch: { titleAtEvent?: string; organizationAtEvent?: string },
  ): void {
    const current = this.ctx.storage.sql
      .exec<{ title_snapshot: string; organization_snapshot: string }>(
        `SELECT title_snapshot, organization_snapshot FROM event_participations WHERE id = ?`,
        participationId,
      )
      .toArray()[0];
    if (!current) throw new Error(`Participation ${participationId} not found`);
    this.ctx.storage.sql.exec(
      `UPDATE event_participations
       SET title_snapshot = ?, organization_snapshot = ?
       WHERE id = ?`,
      patch.titleAtEvent ?? current.title_snapshot,
      patch.organizationAtEvent ?? current.organization_snapshot,
      participationId,
    );
  }

  /** Removes cascade records and revokes portal tokens for a proposal (compensation stub). */
  compensateAcceptanceForTest(proposalId: string): void {
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE portal_tokens SET revoked_at = ? WHERE proposal_id = ? AND revoked_at IS NULL`,
        now,
        proposalId,
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM onboarding_tasks WHERE proposal_id = ?`,
        proposalId,
      );
      this.ctx.storage.sql.exec(`DELETE FROM sessions WHERE proposal_id = ?`, proposalId);
      this.ctx.storage.sql.exec(
        `DELETE FROM event_participations WHERE proposal_id = ?`,
        proposalId,
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM portal_access_intents WHERE proposal_id = ?`,
        proposalId,
      );
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET program_outcome = '' WHERE id = ?`,
        proposalId,
      );
    });
  }

  createAsset(input: {
    assetId: string;
    objectKey: string;
    fileName: string;
    mime: string;
    sizeBytes: number;
    formId: string;
    formDefinitionVersion: number;
    questionName: string;
    maxBytes: number;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO assets
        (asset_id, object_key, file_name, mime, size_bytes, status, created_at,
         form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL)`,
      input.assetId,
      input.objectKey,
      input.fileName,
      input.mime,
      input.sizeBytes,
      new Date().toISOString(),
      input.formId,
      input.formDefinitionVersion,
      input.questionName,
      input.maxBytes,
    );
  }

  completeAsset(input: {
    assetId: string;
    sizeBytes: number;
    mime: string;
    fileName: string;
  }): UploadedAssetAnswer | null {
    const updated = this.ctx.storage.sql.exec(
      `UPDATE assets
       SET status = 'complete', size_bytes = ?, mime = ?, file_name = ?
       WHERE asset_id = ?
         AND status IN ('pending', 'failed')
         AND claimed_proposal_id IS NULL`,
      input.sizeBytes,
      input.mime,
      input.fileName,
      input.assetId,
    );
    if (updated.rowsWritten === 0) {
      return null;
    }
    const row = this.getAsset(input.assetId);
    if (!row) return null;
    return {
      assetId: row.asset_id,
      objectKey: row.object_key,
      name: input.fileName,
      mime: input.mime,
      size: input.sizeBytes,
      status: "complete",
    };
  }

  getAsset(assetId: string): AssetRow | null {
    return (
      this.ctx.storage.sql
        .exec<AssetRow>(
          `SELECT asset_id, object_key, file_name, mime, size_bytes, status, created_at,
                  form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id,
                  owner_speaker_id, purpose
           FROM assets WHERE asset_id = ?`,
          assetId,
        )
        .toArray()[0] ?? null
    );
  }

  failAsset(assetId: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE assets SET status = 'failed' WHERE asset_id = ?`,
      assetId,
    );
  }

  /**
   * Mark an unclaimed asset abandoned so it can be purged from R2.
   * Claimed assets are left alone (still attached to a proposal).
   */
  abandonUnclaimedAsset(assetId: string): AssetRow | null {
    const row = this.getAsset(assetId);
    if (!row || row.claimed_proposal_id) return null;
    this.ctx.storage.sql.exec(
      `UPDATE assets SET status = 'abandoned' WHERE asset_id = ? AND claimed_proposal_id IS NULL`,
      assetId,
    );
    return this.getAsset(assetId);
  }

  /**
   * Assets safe to delete from R2 + DB: abandoned, failed, or long-unclaimed
   * complete/pending uploads older than the cutoff.
   */
  listPurgeableAssets(olderThanIso: string, limit = 50): AssetRow[] {
    return this.ctx.storage.sql
      .exec<AssetRow>(
        `SELECT asset_id, object_key, file_name, mime, size_bytes, status, created_at,
                form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id,
                owner_speaker_id, purpose
         FROM assets
         WHERE claimed_proposal_id IS NULL
           AND created_at <= ?
           AND status IN ('abandoned', 'failed', 'pending', 'complete')
         ORDER BY created_at ASC
         LIMIT ?`,
        olderThanIso,
        limit,
      )
      .toArray();
  }

  deleteAssetRecord(assetId: string): AssetRow | null {
    const row = this.getAsset(assetId);
    if (!row || row.claimed_proposal_id) return null;
    this.ctx.storage.sql.exec(`DELETE FROM assets WHERE asset_id = ?`, assetId);
    return row;
  }

  private claimAssets(input: {
    claims: AssetClaimInput[];
    proposalId: string;
    formId: string;
    formDefinitionVersion: number;
    mode: "create" | "update";
  }): Record<string, string> | null {
    const errors: Record<string, string> = {};
    const claimedIds = new Set<string>();
    for (const claim of input.claims) {
      if (claimedIds.has(claim.answer.assetId)) {
        errors[claim.path] = `Upload a valid file for ${claim.path}.`;
        continue;
      }
      claimedIds.add(claim.answer.assetId);

      const row = this.getAsset(claim.answer.assetId);
      if (
        !row ||
        row.status !== "complete" ||
        row.object_key !== claim.answer.objectKey ||
        row.file_name !== claim.answer.name ||
        row.mime !== claim.answer.mime ||
        Number(row.size_bytes) !== claim.answer.size ||
        row.form_id !== input.formId ||
        Number(row.form_definition_version) !== input.formDefinitionVersion ||
        row.question_name !== claim.questionName
      ) {
        errors[claim.path] = `Upload a valid file for ${claim.path}.`;
        continue;
      }

      const claimedBy = row.claimed_proposal_id;
      if (input.mode === "create") {
        if (claimedBy) {
          errors[claim.path] = `Upload a valid file for ${claim.path}.`;
        }
      } else if (claimedBy && claimedBy !== input.proposalId) {
        errors[claim.path] = `Upload a valid file for ${claim.path}.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return errors;
    }

    if (input.mode === "update") {
      this.ctx.storage.sql.exec(
        `UPDATE assets
         SET claimed_proposal_id = NULL,
             status = CASE
               WHEN status = 'complete' THEN 'abandoned'
               ELSE status
             END
         WHERE claimed_proposal_id = ?`,
        input.proposalId,
      );
    }

    for (const claim of input.claims) {
      const updated = this.ctx.storage.sql.exec(
        `UPDATE assets
         SET claimed_proposal_id = ?,
             status = 'complete'
         WHERE asset_id = ?
           AND status IN ('complete', 'abandoned')
           AND (claimed_proposal_id IS NULL OR claimed_proposal_id = ?)`,
        input.proposalId,
        claim.answer.assetId,
        input.proposalId,
      );
      // Throw so transactionSync rolls back any partial claim writes.
      if (updated.rowsWritten === 0) {
        throw new Error(
          `Asset claim failed for ${claim.answer.assetId} on proposal ${input.proposalId}.`,
        );
      }
    }
    return null;
  }

  private eventIdOrThrow(): string {
    const event = this.getEvent();
    if (!event) throw new Error("Event is not initialized.");
    return event.id;
  }

  private listExistingSpeakersByEmail(): Map<string, ExistingSpeaker[]> {
    const rows = this.ctx.storage.sql
      .exec<SpeakerRow>(`SELECT id, name, email, biography, headshot_asset_id, created_at FROM speakers`)
      .toArray();
    const map = new Map<string, ExistingSpeaker[]>();
    for (const row of rows) {
      const email = row.email.toLowerCase();
      const list = map.get(email) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        email: row.email,
        biography: row.biography,
      });
      map.set(email, list);
    }
    return map;
  }

  private loadCourseCheckPlanRow(planId: string): CourseCheckPlanRow | null {
    return (
      this.ctx.storage.sql
        .exec<CourseCheckPlanRow>(
          `SELECT id, action_type, state, version, digest, body_json, created_at,
                  updated_at, created_by_id, created_by_name, approval_json, receipt_id
           FROM course_check_plans
           WHERE id = ?`,
          planId,
        )
        .toArray()[0] ?? null
    );
  }

  private attachReceipt(plan: CourseCheckPlan, receiptId: string | null): CourseCheckPlan {
    if (!receiptId) return plan;
    const row = this.ctx.storage.sql
      .exec<{
        id: string;
        plan_id: string;
        plan_version: number;
        digest: string;
        stage_id: string;
        applied_at: string;
        actor_id: string;
        actor_name: string;
      }>(
        `SELECT id, plan_id, plan_version, digest, stage_id, applied_at, actor_id, actor_name
         FROM course_check_receipts
         WHERE id = ?`,
        receiptId,
      )
      .toArray()[0];
    if (!row) return plan;
    return {
      ...plan,
      receipt: {
        id: row.id,
        planId: row.plan_id,
        planVersion: Number(row.plan_version),
        digest: row.digest,
        stageId: row.stage_id,
        appliedAt: row.applied_at,
        actor: { id: row.actor_id, displayName: row.actor_name },
      },
    };
  }

  private courseCheckSettings(): {
    ageWarningHours: number;
    batchLimit: number;
  } {
    const row = this.ctx.storage.sql
      .exec<{
        course_check_age_warning_hours: number | null;
        course_check_batch_limit: number | null;
      }>(
        `SELECT course_check_age_warning_hours, course_check_batch_limit FROM events LIMIT 1`,
      )
      .toArray()[0];
    return {
      ageWarningHours: Number(
        row?.course_check_age_warning_hours ?? DEFAULT_AGE_WARNING_HOURS,
      ),
      batchLimit: Number(row?.course_check_batch_limit ?? DEFAULT_DECISION_BATCH_LIMIT),
    };
  }

  private listPlanVersions(planId: string): CourseCheckPlanVersion[] {
    return this.ctx.storage.sql
      .exec<{
        plan_id: string;
        version: number;
        digest: string;
        state: string;
        body_json: string;
        created_at: string;
        created_by_id: string;
        created_by_name: string;
        mutation_kind: string;
        summary: string;
      }>(
        `SELECT plan_id, version, digest, state, body_json, created_at,
                created_by_id, created_by_name, mutation_kind, summary
         FROM course_check_plan_versions
         WHERE plan_id = ?
         ORDER BY version DESC`,
        planId,
      )
      .toArray()
      .map((row) => ({
        planId: row.plan_id,
        version: Number(row.version),
        digest: row.digest,
        state: row.state as CourseCheckPlanState,
        body: normalizeCourseCheckBody(JSON.parse(row.body_json) as CourseCheckPlanBody),
        createdAt: row.created_at,
        createdBy: { id: row.created_by_id, displayName: row.created_by_name },
        mutationKind: row.mutation_kind as PlanMutationRecord["kind"],
        summary: row.summary,
      }));
  }

  private listPlanMutations(planId: string): PlanMutationRecord[] {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        plan_id: string;
        from_version: number;
        to_version: number;
        kind: string;
        actor_id: string;
        actor_name: string;
        at: string;
        summary: string;
      }>(
        `SELECT id, plan_id, from_version, to_version, kind, actor_id, actor_name, at, summary
         FROM course_check_mutations
         WHERE plan_id = ?
         ORDER BY to_version DESC, at DESC`,
        planId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        planId: row.plan_id,
        fromVersion: Number(row.from_version),
        toVersion: Number(row.to_version),
        kind: row.kind as PlanMutationRecord["kind"],
        actor: { id: row.actor_id, displayName: row.actor_name },
        at: row.at,
        summary: row.summary,
      }));
  }

  private recordPlanVersion(input: {
    planId: string;
    version: number;
    digest: string;
    state: CourseCheckPlanState;
    body: CourseCheckPlanBody;
    actor: CourseCheckActor;
    at: string;
    mutationKind: PlanMutationRecord["kind"];
    summary: string;
    fromVersion: number;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO course_check_plan_versions
        (plan_id, version, digest, state, body_json, created_at, created_by_id,
         created_by_name, mutation_kind, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(plan_id, version) DO UPDATE SET
         digest = excluded.digest,
         state = excluded.state,
         body_json = excluded.body_json,
         mutation_kind = excluded.mutation_kind,
         summary = excluded.summary`,
      input.planId,
      input.version,
      input.digest,
      input.state,
      JSON.stringify(input.body),
      input.at,
      input.actor.id,
      input.actor.displayName,
      input.mutationKind,
      input.summary,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO course_check_mutations
        (id, plan_id, from_version, to_version, kind, actor_id, actor_name, at, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.planId,
      input.fromVersion,
      input.version,
      input.mutationKind,
      input.actor.id,
      input.actor.displayName,
      input.at,
      input.summary,
    );
  }

  private enrichPlan(plan: CourseCheckPlan): CourseCheckPlan {
    const body = plan.body;
    const ageWarning = computeAgeWarning({
      createdAt: plan.createdAt,
      ageWarningHours: body.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
      stages: body.stages,
    });
    let nextBody = body;
    if (ageWarning) {
      nextBody = { ...body, ageWarning };
    }

    // Stage-scoped freshness: mark dependent stages out of date when relevant inputs change.
    let state = plan.state;
    if (
      plan.state !== "Complete" &&
      plan.state !== "Superseded" &&
      nextBody.actionType === "decision"
    ) {
      const changed = this.detectDecisionStaleInputs(nextBody);
      if (changed.length > 0) {
        state = "Out of date";
        nextBody = {
          ...nextBody,
          stages: nextBody.stages.map((stage) =>
            stage.id === "apply-decision"
              ? { ...stage, status: "out_of_date" as const }
              : stage,
          ),
          findings: [
            ...nextBody.findings.filter((f) => f.code !== "relevant_input_changed"),
            {
              id: "relevant-input-changed",
              severity: "blocker",
              code: "relevant_input_changed",
              message: `Relevant inputs changed: ${changed.join(", ")}.`,
              recoveryGuidance:
                "Create a new Decision Course Check from the current proposal revisions, or defer the changed items.",
            },
          ],
        };
      }
    }

    return {
      ...plan,
      state,
      body: nextBody,
      versions: this.listPlanVersions(plan.id).filter((v) => v.version !== plan.version),
      mutations: this.listPlanMutations(plan.id),
    };
  }

  private detectDecisionStaleInputs(body: DecisionPlanBody): string[] {
    const changed: string[] = [];
    for (const item of body.items) {
      if (item.status !== "active") continue;
      const proposal = this.getProposal(item.proposalId);
      if (!proposal) {
        changed.push(`${item.proposalId}:missing`);
        continue;
      }
      if (proposal.reviewVersion !== item.proposalRevision) {
        changed.push(`${item.proposalId}:reviewVersion`);
      }
    }
    return changed;
  }

  getCourseCheckPlan(planId: string): CourseCheckPlan | null {
    const eventId = this.eventIdOrThrow();
    const row = this.loadCourseCheckPlanRow(planId);
    if (!row) return null;
    const plan = this.attachReceipt(mapCourseCheckPlan(row, eventId), row.receipt_id);
    return this.enrichPlan(plan);
  }

  listCourseCheckPlans(): CourseCheckPlan[] {
    const eventId = this.eventIdOrThrow();
    return this.ctx.storage.sql
      .exec<CourseCheckPlanRow>(
        `SELECT id, action_type, state, version, digest, body_json, created_at,
                updated_at, created_by_id, created_by_name, approval_json, receipt_id
         FROM course_check_plans
         ORDER BY created_at DESC, id DESC`,
      )
      .toArray()
      .map((row) =>
        this.enrichPlan(this.attachReceipt(mapCourseCheckPlan(row, eventId), row.receipt_id)),
      );
  }

  private readIdempotency(
    command: string,
    key: string,
  ): { planId: string; receiptId: string | null; responseJson: string } | null {
    const row = this.ctx.storage.sql
      .exec<{
        plan_id: string;
        receipt_id: string | null;
        response_json: string;
      }>(
        `SELECT plan_id, receipt_id, response_json
         FROM course_check_idempotency
         WHERE command = ? AND idempotency_key = ?`,
        command,
        key,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      planId: row.plan_id,
      receiptId: row.receipt_id,
      responseJson: row.response_json,
    };
  }

  private writeIdempotency(input: {
    command: string;
    key: string;
    planId: string;
    receiptId?: string | null;
    response: CourseCheckPlan;
  }): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO course_check_idempotency
        (command, idempotency_key, plan_id, receipt_id, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(command, idempotency_key) DO NOTHING`,
      input.command,
      input.key,
      input.planId,
      input.receiptId ?? null,
      JSON.stringify(input.response),
      new Date().toISOString(),
    );
  }

  async createDecisionCourseCheck(input: {
    proposalId?: string;
    outcome?: ProgramOutcome;
    items?: Array<{ proposalId: string; outcome: ProgramOutcome }>;
    idempotencyKey: string;
    actor: CourseCheckActor;
  }): Promise<
    | { plan: CourseCheckPlan; created: boolean; linkedPlans?: CourseCheckPlan[] }
  > {
    const existing = this.readIdempotency("create-decision", input.idempotencyKey);
    if (existing) {
      const plan = this.getCourseCheckPlan(existing.planId);
      if (!plan) throw new Error("Idempotent decision plan is missing.");
      return { plan, created: false };
    }

    const selections =
      input.items && input.items.length > 0
        ? input.items
        : input.proposalId && input.outcome
          ? [{ proposalId: input.proposalId, outcome: input.outcome }]
          : [];
    if (selections.length === 0) {
      throw new Error("At least one proposal decision is required.");
    }

    const resolved = selections.map((selection) => {
      const proposal = this.getProposal(selection.proposalId);
      if (!proposal) throw new Error(`Proposal ${selection.proposalId} not found.`);
      return { proposal, outcome: selection.outcome };
    });

    const settings = this.courseCheckSettings();
    const chunks = splitSelectionsIfNeeded(resolved, settings.batchLimit);
    const batchGroupId = crypto.randomUUID();
    const now = new Date().toISOString();
    const speakersByEmail = this.listExistingSpeakersByEmail();
    const createdPlans: CourseCheckPlan[] = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex]!;
      const planId = crypto.randomUUID();
      const splitExplanation =
        chunks.length > 1
          ? `Batch exceeded the safe limit of ${settings.batchLimit} decisions. Split into ${chunks.length} linked exact plans (part ${chunkIndex + 1} of ${chunks.length}).`
          : null;
      const body = planDecisionBatch({
        planId,
        batchGroupId,
        selections: chunk,
        existingSpeakersByEmail: speakersByEmail,
        ageWarningHours: settings.ageWarningHours,
        parentPlanId: null,
        linkedPlanIds: [],
        splitExplanation,
      });
      const digest = await digestPayload(decisionBodyDigestPayload(body));
      const state: CourseCheckPlanState = hasBlockerFindings(body.findings)
        ? "Needs attention"
        : "Ready";
      this.ctx.storage.sql.exec(
        `INSERT INTO course_check_plans
          (id, action_type, state, version, digest, body_json, created_at, updated_at,
           created_by_id, created_by_name, approval_json, receipt_id)
         VALUES (?, 'decision', ?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        planId,
        state,
        digest,
        JSON.stringify(body),
        now,
        now,
        input.actor.id,
        input.actor.displayName,
      );
      this.recordPlanVersion({
        planId,
        version: 1,
        digest,
        state,
        body,
        actor: input.actor,
        at: now,
        mutationKind: chunks.length > 1 ? "split" : "create",
        summary:
          chunks.length > 1
            ? `Created linked batch plan part ${chunkIndex + 1}/${chunks.length} with ${chunk.length} decision(s).`
            : `Created Decision Course Check with ${chunk.length} decision(s).`,
        fromVersion: 0,
      });
      const plan = this.getCourseCheckPlan(planId);
      if (!plan) throw new Error("Decision Course Check was not persisted.");
      createdPlans.push(plan);
    }

    // Wire linkedPlanIds across the split set.
    if (createdPlans.length > 1) {
      const allIds = createdPlans.map((plan) => plan.id);
      for (const plan of createdPlans) {
        if (plan.body.actionType !== "decision") continue;
        const nextBody: DecisionPlanBody = {
          ...plan.body,
          linkedPlanIds: allIds.filter((id) => id !== plan.id),
        };
        const digest = await digestPayload(decisionBodyDigestPayload(nextBody));
        this.ctx.storage.sql.exec(
          `UPDATE course_check_plans SET body_json = ?, digest = ?, updated_at = ? WHERE id = ?`,
          JSON.stringify(nextBody),
          digest,
          now,
          plan.id,
        );
      }
    }

    const primary = this.getCourseCheckPlan(createdPlans[0]!.id);
    if (!primary) throw new Error("Primary Decision Course Check is missing.");
    const linkedPlans = createdPlans
      .slice(1)
      .map((plan) => this.getCourseCheckPlan(plan.id))
      .filter((plan): plan is CourseCheckPlan => Boolean(plan));
    this.writeIdempotency({
      command: "create-decision",
      key: input.idempotencyKey,
      planId: primary.id,
      response: primary,
    });
    return {
      plan: primary,
      created: true,
      linkedPlans: linkedPlans.length > 0 ? linkedPlans : undefined,
    };
  }

  async deferCourseCheckItems(input: {
    planId: string;
    planVersion: number;
    digest: string;
    itemIds: string[];
    reason: string;
    idempotencyKey: string;
    actor: CourseCheckActor;
  }): Promise<
    | { ok: true; plan: CourseCheckPlan; created: boolean }
    | {
        ok: false;
        status: 400 | 409;
        code: string;
        error: string;
        recoveryGuidance: string;
      }
  > {
    const existing = this.readIdempotency("defer", input.idempotencyKey);
    if (existing) {
      const plan = this.getCourseCheckPlan(existing.planId);
      if (!plan) throw new Error("Idempotent defer plan is missing.");
      return { ok: true, plan, created: false };
    }

    const row = this.loadCourseCheckPlanRow(input.planId);
    if (!row) {
      return {
        ok: false,
        status: 400,
        code: "plan_not_found",
        error: "Course Check plan not found.",
        recoveryGuidance: "Create a new Course Check from the current records.",
      };
    }
    const plan = mapCourseCheckPlan(row, this.eventIdOrThrow());
    if (plan.receipt || plan.state === "Complete") {
      return {
        ok: false,
        status: 409,
        code: "plan_already_applied",
        error: "This Course Check was already applied.",
        recoveryGuidance: "Open the follow-up queue or create a new Course Check.",
      };
    }
    if (plan.version !== input.planVersion || plan.digest !== input.digest) {
      return {
        ok: false,
        status: 409,
        code: "plan_version_mismatch",
        error: "This Course Check changed since you loaded it.",
        recoveryGuidance: "Reload the Course Check and review the latest plan version.",
      };
    }
    if (plan.body.actionType !== "decision") {
      return {
        ok: false,
        status: 400,
        code: "unsupported_action",
        error: "Only Decision Course Checks support deferral.",
        recoveryGuidance: "Use a Decision Course Check batch to defer items.",
      };
    }
    if (!input.itemIds.length || !input.reason.trim()) {
      return {
        ok: false,
        status: 400,
        code: "invalid_deferral",
        error: "Deferral requires itemIds and a reason.",
        recoveryGuidance: "Select blocked items and provide a short deferral reason.",
      };
    }
    const known = new Set(plan.body.items.map((item) => item.itemId));
    if (input.itemIds.some((id) => !known.has(id))) {
      return {
        ok: false,
        status: 400,
        code: "unknown_item",
        error: "One or more deferred items are not in this plan.",
        recoveryGuidance: "Reload the Course Check and defer from the current items.",
      };
    }

    const now = new Date().toISOString();
    const nextBody = deferDecisionItems({
      body: plan.body,
      itemIds: input.itemIds,
      reason: input.reason.trim(),
      actor: input.actor,
      at: now,
      planId: plan.id,
      planVersion: plan.version,
    });
    const nextVersion = plan.version + 1;
    const digest = await digestPayload(decisionBodyDigestPayload(nextBody));
    const state: CourseCheckPlanState = hasBlockerFindings(nextBody.findings)
      ? "Needs attention"
      : nextBody.aggregateProgress.active === 0
        ? "Needs review"
        : "Ready";

    // Preserve prior version immutably; never overwrite reviewed evidence.
    this.recordPlanVersion({
      planId: plan.id,
      version: plan.version,
      digest: plan.digest,
      state: plan.state,
      body: plan.body,
      actor: plan.createdBy,
      at: plan.updatedAt,
      mutationKind: "create",
      summary: `Historical snapshot of version ${plan.version}.`,
      fromVersion: Math.max(0, plan.version - 1),
    });

    this.ctx.storage.sql.exec(
      `UPDATE course_check_plans
       SET version = ?, digest = ?, body_json = ?, state = ?, updated_at = ?, approval_json = NULL
       WHERE id = ?`,
      nextVersion,
      digest,
      JSON.stringify(nextBody),
      state,
      now,
      plan.id,
    );
    this.recordPlanVersion({
      planId: plan.id,
      version: nextVersion,
      digest,
      state,
      body: nextBody,
      actor: input.actor,
      at: now,
      mutationKind: "defer",
      summary: `Deferred ${input.itemIds.length} item(s): ${input.reason.trim()}`,
      fromVersion: plan.version,
    });

    for (const item of nextBody.followUpQueue) {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO course_check_follow_ups
          (id, plan_id, proposal_id, outcome, reason, source_version, deferred_at,
           deferred_by_id, deferred_by_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        plan.id,
        item.proposalId,
        item.outcome,
        item.reason,
        item.sourceVersion,
        item.deferredAt,
        item.deferredBy.id,
        item.deferredBy.displayName,
        item.status,
      );
    }

    const updated = this.getCourseCheckPlan(plan.id);
    if (!updated) throw new Error("Deferred Course Check is missing.");
    this.writeIdempotency({
      command: "defer",
      key: input.idempotencyKey,
      planId: plan.id,
      response: updated,
    });
    return { ok: true, plan: updated, created: true };
  }

  async createGuaranteedSpeakerCourseCheck(input: {
    sourceLabel: string;
    title: string;
    format: string;
    trackId: string;
    speakers: Array<{
      name: string;
      email: string;
      biography?: string;
      role?: "primary" | "co";
    }>;
    idempotencyKey: string;
    actor: CourseCheckActor;
  }): Promise<{ plan: CourseCheckPlan; created: boolean }> {
    const existing = this.readIdempotency("create-guaranteed", input.idempotencyKey);
    if (existing) {
      const plan = this.getCourseCheckPlan(existing.planId);
      if (!plan) throw new Error("Idempotent guaranteed plan is missing.");
      return { plan, created: false };
    }

    const planId = crypto.randomUUID();
    const body = planGuaranteedSpeaker({
      planId,
      sourceLabel: input.sourceLabel,
      title: input.title,
      format: input.format,
      trackId: input.trackId,
      speakers: input.speakers,
      existingSpeakersByEmail: this.listExistingSpeakersByEmail(),
    });
    const digest = await digestPayload(body);
    const now = new Date().toISOString();
    const state: CourseCheckPlanState = hasBlockerFindings(body.findings)
      ? "Needs attention"
      : "Ready";
    this.ctx.storage.sql.exec(
      `INSERT INTO course_check_plans
        (id, action_type, state, version, digest, body_json, created_at, updated_at,
         created_by_id, created_by_name, approval_json, receipt_id)
       VALUES (?, 'guaranteed_speaker', ?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      planId,
      state,
      digest,
      JSON.stringify(body),
      now,
      now,
      input.actor.id,
      input.actor.displayName,
    );
    const plan = this.getCourseCheckPlan(planId);
    if (!plan) throw new Error("Guaranteed-speaker Course Check was not persisted.");
    this.writeIdempotency({
      command: "create-guaranteed",
      key: input.idempotencyKey,
      planId,
      response: plan,
    });
    return { plan, created: true };
  }

  async applyCourseCheck(input: {
    planId: string;
    planVersion: number;
    digest: string;
    stageId: string;
    idempotencyKey: string;
    actor: CourseCheckActor;
    softWarningOverrides?: Array<{ findingId: string; reason?: string | null }>;
  }): Promise<
    | { ok: true; plan: CourseCheckPlan; created: boolean }
    | {
        ok: false;
        status: 409 | 400;
        code: string;
        error: string;
        recoveryGuidance: string;
        findings?: CourseCheckPlanBody["findings"];
        changedInputs?: string[];
      }
  > {
    const existing = this.readIdempotency("apply", input.idempotencyKey);
    if (existing) {
      const plan = this.getCourseCheckPlan(existing.planId);
      if (!plan) throw new Error("Idempotent apply receipt plan is missing.");
      return { ok: true, plan, created: false };
    }

    const row = this.loadCourseCheckPlanRow(input.planId);
    if (!row) {
      return {
        ok: false,
        status: 400,
        code: "plan_not_found",
        error: "Course Check plan not found.",
        recoveryGuidance: "Create a new Course Check from the current records.",
      };
    }
    const plan = this.attachReceipt(
      mapCourseCheckPlan(row, this.eventIdOrThrow()),
      row.receipt_id,
    );
    if (plan.receipt) {
      return { ok: true, plan, created: false };
    }
    if (plan.version !== input.planVersion || plan.digest !== input.digest) {
      return {
        ok: false,
        status: 409,
        code: "plan_version_mismatch",
        error: "This Course Check changed since you loaded it.",
        recoveryGuidance: "Reload the Course Check and review the latest plan version.",
      };
    }
    if (input.stageId !== "apply-decision") {
      return {
        ok: false,
        status: 400,
        code: "unknown_stage",
        error: "Unknown Course Check stage.",
        recoveryGuidance: "Use the Apply decision stage for this plan.",
      };
    }

    if (plan.body.actionType === "decision") {
      const changed = this.detectDecisionStaleInputs(plan.body);
      if (changed.length > 0) {
        return {
          ok: false,
          status: 409,
          code: "relevant_input_changed",
          error: "Relevant proposal inputs changed after this plan was created.",
          recoveryGuidance:
            "Create a new Decision Course Check from the current proposal revisions.",
          changedInputs: changed,
        };
      }
      if (plan.body.aggregateProgress.active === 0) {
        return {
          ok: false,
          status: 409,
          code: "empty_apply_scope",
          error: "No active decisions remain in this plan.",
          recoveryGuidance: "Resolve follow-up queue items or create a new Course Check.",
        };
      }
    }

    // Soft-warning overrides: internal apply is reason-free; material external requires reason.
    const overrides = input.softWarningOverrides ?? [];
    for (const override of overrides) {
      const finding = plan.body.findings.find((row) => row.id === override.findingId);
      if (!finding || finding.severity !== "warning") continue;
      if (finding.materialExternal && !override.reason?.trim()) {
        return {
          ok: false,
          status: 400,
          code: "override_reason_required",
          error: `A short reason is required to override material warning "${finding.message}".`,
          recoveryGuidance:
            "Provide a reason when overriding material external-boundary warnings.",
          findings: plan.body.findings,
        };
      }
    }

    if (hasBlockerFindings(plan.body.findings)) {
      const blocker = plan.body.findings.find((finding) => finding.severity === "blocker");
      return {
        ok: false,
        status: 409,
        code: blocker?.code ?? "blocked",
        error: blocker?.message ?? "This Course Check has blocking findings.",
        recoveryGuidance:
          blocker?.recoveryGuidance ??
          "Resolve or defer the blocking findings, then apply the remaining exact scope.",
        findings: plan.body.findings,
      };
    }

    const receiptId = crypto.randomUUID();
    const now = new Date().toISOString();
    const approval = {
      stageId: input.stageId,
      planVersion: plan.version,
      digest: plan.digest,
      actor: input.actor,
      approvedAt: now,
    };

    let appliedPlan: CourseCheckPlan | null = null;
    try {
      this.ctx.storage.transactionSync(() => {
        this.applyCascadeRecords(plan, now);
        let nextBody = plan.body;
        if (plan.body.actionType === "decision") {
          nextBody = markDecisionItemsApplied(plan.body);
          if (overrides.length > 0) {
            nextBody = {
              ...nextBody,
              softWarningOverrides: [
                ...nextBody.softWarningOverrides,
                ...overrides.map((override) => ({
                  findingId: override.findingId,
                  reason: override.reason?.trim() || null,
                  actor: input.actor,
                  at: now,
                })),
              ],
            };
          }
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO course_check_receipts
            (id, plan_id, plan_version, digest, stage_id, applied_at, actor_id, actor_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          receiptId,
          plan.id,
          plan.version,
          plan.digest,
          input.stageId,
          now,
          input.actor.id,
          input.actor.displayName,
        );
        const finalState: CourseCheckPlanState =
          plan.body.actionType === "decision" &&
          (plan.body.aggregateProgress.deferred > 0 ||
            nextBody.actionType === "decision" &&
              nextBody.followUpQueue.some((item) => item.status === "open"))
            ? "Partially complete"
            : "Complete";
        this.ctx.storage.sql.exec(
          `UPDATE course_check_plans
           SET state = ?,
               body_json = ?,
               updated_at = ?,
               approval_json = ?,
               receipt_id = ?
           WHERE id = ?`,
          finalState,
          JSON.stringify(nextBody),
          now,
          JSON.stringify(approval),
          receiptId,
          plan.id,
        );
        this.recordPlanVersion({
          planId: plan.id,
          version: plan.version,
          digest: plan.digest,
          state: finalState,
          body: nextBody,
          actor: input.actor,
          at: now,
          mutationKind: "apply",
          summary: `Applied ${input.stageId} for plan version ${plan.version}.`,
          fromVersion: plan.version,
        });
        const proposalId =
          plan.body.actionType === "decision" ? plan.body.proposalId : "";
        const outcomeLabel =
          plan.body.actionType === "decision"
            ? `${plan.body.aggregateProgress.active} decision(s)`
            : "guaranteed_speaker";
        this.ctx.storage.sql.exec(
          `INSERT INTO audit_events
            (id, proposal_id, type, actor_id, actor_name, from_status, to_status,
             committee_note_changed, created_at)
           VALUES (?, ?, 'course_check.decision.applied', ?, ?, ?, ?, 0, ?)`,
          crypto.randomUUID(),
          proposalId || plan.id,
          input.actor.id,
          input.actor.displayName,
          plan.state,
          outcomeLabel,
          now,
        );
        appliedPlan = this.attachReceipt(
          mapCourseCheckPlan(
            {
              ...row,
              state: finalState,
              body_json: JSON.stringify(nextBody),
              updated_at: now,
              approval_json: JSON.stringify(approval),
              receipt_id: receiptId,
            },
            this.eventIdOrThrow(),
          ),
          receiptId,
        );
        this.writeIdempotency({
          command: "apply",
          key: input.idempotencyKey,
          planId: plan.id,
          receiptId,
          response: appliedPlan,
        });
      });
    } catch (error) {
      return {
        ok: false,
        status: 409,
        code: "durable_integrity",
        error:
          error instanceof Error
            ? error.message
            : "Applying this Course Check violated durable integrity.",
        recoveryGuidance:
          "Resolve the conflicting records, then create a new Course Check from current state.",
      };
    }

    const applied = appliedPlan ?? this.getCourseCheckPlan(plan.id);
    if (!applied) throw new Error("Applied Course Check is missing.");
    return { ok: true, plan: this.enrichPlan(applied), created: true };
  }

  private applyCascadeRecords(plan: CourseCheckPlan, now: string): void {
    const body = plan.body;
    if (body.actionType === "decision" && body.items && body.items.length > 0) {
      for (const item of body.items) {
        if (item.status !== "active") continue;
        this.applyDecisionItemCascade(plan.id, item, now);
      }
      return;
    }

    this.applySingleCascade({
      planId: plan.id,
      proposalId: body.actionType === "decision" ? body.proposalId : null,
      proposalRevision:
        body.actionType === "decision" ? body.proposalRevision : null,
      outcome: body.actionType === "decision" ? body.outcome : null,
      speakers: body.speakers,
      participations: body.participations,
      session: body.actionType === "decision" ? body.session : body.session,
      tasks: body.tasks,
      portalAccess: body.portalAccess,
      now,
    });
  }

  private applyDecisionItemCascade(
    planId: string,
    item: DecisionPlanBody["items"][number],
    now: string,
  ): void {
    this.applySingleCascade({
      planId,
      proposalId: item.proposalId,
      proposalRevision: item.proposalRevision,
      outcome: item.outcome,
      speakers: item.speakers,
      participations: item.participations,
      session: item.session,
      tasks: item.tasks,
      portalAccess: item.portalAccess,
      now,
    });
  }

  private applySingleCascade(input: {
    planId: string;
    proposalId: string | null;
    proposalRevision: number | null;
    outcome: ProgramOutcome | null;
    speakers: CourseCheckPlanBody["speakers"];
    participations: CourseCheckPlanBody["participations"];
    session: CourseCheckPlanBody["session"] | null;
    tasks: CourseCheckPlanBody["tasks"];
    portalAccess: CourseCheckPlanBody["portalAccess"];
    now: string;
  }): void {
    const speakerIdByPlanned = new Map<string, string>();

    if (input.proposalId && input.outcome && input.proposalRevision !== null) {
      const current = this.ctx.storage.sql
        .exec<{ review_version: number; program_outcome: string }>(
          `SELECT review_version, program_outcome FROM proposals WHERE id = ?`,
          input.proposalId,
        )
        .toArray()[0];
      if (!current) {
        throw new Error(`Proposal ${input.proposalId} disappeared during apply.`);
      }
      if (Number(current.review_version) !== input.proposalRevision) {
        throw new Error("Proposal revision changed during apply.");
      }
      if (current.program_outcome) {
        throw new Error(
          `Proposal already has final outcome "${current.program_outcome}".`,
        );
      }
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET program_outcome = ? WHERE id = ?`,
        input.outcome,
        input.proposalId,
      );
      if (input.outcome === "declined") {
        return;
      }
    }

    for (const speaker of input.speakers) {
      let speakerId = speaker.existingSpeakerId;
      if (speaker.match === "reuse" && speakerId) {
        const existing = this.ctx.storage.sql
          .exec<{ id: string }>(`SELECT id FROM speakers WHERE id = ?`, speakerId)
          .toArray()[0];
        if (!existing) {
          throw new Error(`Expected speaker ${speakerId} was not found.`);
        }
      } else {
        speakerId = speaker.plannedId;
        this.ctx.storage.sql.exec(
          `INSERT INTO speakers (id, name, email, biography, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          speakerId,
          speaker.name,
          speaker.email,
          speaker.biography,
          input.now,
        );
      }
      speakerIdByPlanned.set(speaker.plannedId, speakerId!);
    }

    for (const participation of input.participations) {
      const speakerId = speakerIdByPlanned.get(participation.speakerPlannedId);
      if (!speakerId) {
        throw new Error("Participation is missing its speaker mapping.");
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO event_participations
          (id, speaker_id, proposal_id, course_check_plan_id, title_snapshot,
           organization_snapshot, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        participation.plannedId,
        speakerId,
        input.proposalId,
        input.planId,
        participation.titleSnapshot,
        participation.organizationSnapshot,
        participation.role,
        input.now,
      );
    }

    const session = input.session;
    if (session) {
      this.ctx.storage.sql.exec(
        `INSERT INTO sessions
          (id, proposal_id, course_check_plan_id, title, format, track_id,
           room_id, starts_at, ends_at, created_at, calendar_uid,
           calendar_sequence, calendar_invite_recorded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        session.plannedId,
        input.proposalId,
        input.planId,
        session.title,
        session.format,
        session.trackId,
        session.roomId,
        session.startsAt,
        session.endsAt,
        input.now,
        `cal_${session.plannedId}`,
      );
    }

    const event = this.getEvent();
    const deadlineBase = event
      ? Date.parse(`${event.startsOn}T00:00:00.000Z`)
      : Date.parse(input.now);
    const safeBase = Number.isFinite(deadlineBase)
      ? deadlineBase
      : Date.parse(input.now);

    input.tasks.forEach((task, taskIndex) => {
      const speakerId = speakerIdByPlanned.get(task.speakerPlannedId);
      if (!speakerId) throw new Error("Task is missing its speaker mapping.");
      const dueAt = new Date(
        safeBase - (input.tasks.length - taskIndex) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const completionRequirement = defaultCompletionRequirement(task.kind);
      const instructions =
        task.kind === "headshot"
          ? "Upload a recent headshot for the program."
          : task.kind === "profile"
            ? "Review and complete your speaker profile."
            : task.kind === "session_details"
              ? "Confirm your session title and details with organizers."
              : "";
      this.ctx.storage.sql.exec(
        `INSERT INTO onboarding_tasks
          (id, speaker_id, session_id, proposal_id, course_check_plan_id, title, kind,
           status, due_at, created_at, instructions, completion_requirement, readiness_flag,
           asset_id, completed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, NULL, NULL, 'system')`,
        task.plannedId,
        speakerId,
        session?.plannedId ?? null,
        input.proposalId,
        input.planId,
        task.title,
        task.kind,
        dueAt,
        input.now,
        instructions,
        completionRequirement,
      );
    });

    for (const access of input.portalAccess) {
      const speakerId = speakerIdByPlanned.get(access.speakerPlannedId);
      if (!speakerId) throw new Error("Portal access is missing its speaker mapping.");
      this.ctx.storage.sql.exec(
        `INSERT INTO portal_access_intents
          (id, speaker_id, email, intent, proposal_id, course_check_plan_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        speakerId,
        access.email,
        access.intent,
        input.proposalId,
        input.planId,
        input.now,
      );
      if (access.intent === "grant") {
        const tokenId = crypto.randomUUID().replaceAll("-", "");
        const expiresAt = new Date(
          Date.parse(input.now) + 1000 * 60 * 60 * 24 * 90,
        ).toISOString();
        this.ctx.storage.sql.exec(
          `INSERT INTO portal_tokens
            (token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
          tokenId,
          speakerId,
          input.proposalId,
          input.planId,
          expiresAt,
          input.now,
        );
      }
    }
  }

  getAcceptanceCascade(proposalId: string): AcceptanceCascadeSnapshot {
    return this.cascadeSnapshot({ proposalId });
  }

  getGuaranteedCascade(planId: string): AcceptanceCascadeSnapshot {
    return this.cascadeSnapshot({ planId });
  }

  private cascadeSnapshot(filter: {
    proposalId?: string;
    planId?: string;
  }): AcceptanceCascadeSnapshot {
    const proposalId = filter.proposalId ?? null;
    const planId = filter.planId ?? null;

    const participations = this.ctx.storage.sql
      .exec<{
        id: string;
        speaker_id: string;
        proposal_id: string | null;
        title_snapshot: string;
        organization_snapshot: string;
        role: string;
      }>(
        proposalId
          ? `SELECT id, speaker_id, proposal_id, title_snapshot, organization_snapshot, role
             FROM event_participations WHERE proposal_id = ?`
          : `SELECT id, speaker_id, proposal_id, title_snapshot, organization_snapshot, role
             FROM event_participations WHERE course_check_plan_id = ?`,
        proposalId ?? planId,
      )
      .toArray();

    const speakerIds = [...new Set(participations.map((row) => row.speaker_id))];
    const speakers =
      speakerIds.length === 0
        ? []
        : this.ctx.storage.sql
            .exec<SpeakerRow>(
              `SELECT id, name, email, biography, headshot_asset_id, created_at
               FROM speakers
               WHERE id IN (${speakerIds.map(() => "?").join(",")})`,
              ...speakerIds,
            )
            .toArray()
            .map((row) => ({
              id: row.id,
              name: row.name,
              email: row.email,
              biography: row.biography,
            }));

    const sessions = this.ctx.storage.sql
      .exec<{
        id: string;
        proposal_id: string | null;
        title: string;
        format: string;
        track_id: string;
      }>(
        proposalId
          ? `SELECT id, proposal_id, title, format, track_id FROM sessions WHERE proposal_id = ?`
          : `SELECT id, proposal_id, title, format, track_id FROM sessions WHERE course_check_plan_id = ?`,
        proposalId ?? planId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        proposalId: row.proposal_id,
        title: row.title,
        format: row.format,
        trackId: row.track_id,
      }));

    const tasks = this.ctx.storage.sql
      .exec<{
        id: string;
        title: string;
        kind: string;
        speaker_id: string;
      }>(
        proposalId
          ? `SELECT id, title, kind, speaker_id FROM onboarding_tasks WHERE proposal_id = ?`
          : `SELECT id, title, kind, speaker_id FROM onboarding_tasks WHERE course_check_plan_id = ?`,
        proposalId ?? planId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        speakerId: row.speaker_id,
      }));

    const portalAccessIntents = this.ctx.storage.sql
      .exec<{
        id: string;
        speaker_id: string;
        email: string;
        intent: string;
      }>(
        proposalId
          ? `SELECT id, speaker_id, email, intent FROM portal_access_intents WHERE proposal_id = ?`
          : `SELECT id, speaker_id, email, intent FROM portal_access_intents WHERE course_check_plan_id = ?`,
        proposalId ?? planId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        speakerId: row.speaker_id,
        email: row.email,
        intent: row.intent,
      }));

    const portalTokens = this.ctx.storage.sql
      .exec<PortalTokenRow>(
        proposalId
          ? `SELECT token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at
             FROM portal_tokens WHERE proposal_id = ?`
          : `SELECT token_id, speaker_id, proposal_id, course_check_plan_id, expires_at, revoked_at, signed_token, created_at
             FROM portal_tokens WHERE course_check_plan_id = ?`,
        proposalId ?? planId,
      )
      .toArray()
      .map((row) => ({
        tokenId: row.token_id,
        speakerId: row.speaker_id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        signedToken: row.signed_token,
      }));

    return {
      speakers,
      participations: participations.map((row) => ({
        id: row.id,
        speakerId: row.speaker_id,
        proposalId: row.proposal_id,
        titleSnapshot: row.title_snapshot,
        organizationSnapshot: row.organization_snapshot,
        role: row.role,
      })),
      sessions,
      tasks,
      portalAccessIntents,
      portalTokens,
      messagesQueued: 0,
      calendarEffects: 0,
      publicRevisions: 0,
    };
  }

  getAirtableSyncState(): AirtableSyncState {
    const row = this.ctx.storage.sql
      .exec<{
        health: string;
        configured: number;
        last_pull_at: string | null;
        last_success_at: string | null;
        last_error: string | null;
        guidance: string | null;
        pending_change_count: number;
        base_id: string | null;
        access_token: string | null;
      }>(
        `SELECT health, configured, last_pull_at, last_success_at, last_error,
                guidance, pending_change_count, base_id, access_token
         FROM airtable_sync_state
         WHERE id = 'default'
         LIMIT 1`,
      )
      .toArray()[0];

    if (!row) {
      return {
        health: "unconfigured",
        configured: false,
        hasAccessToken: false,
        lastPullAt: null,
        lastSuccessAt: null,
        lastError: null,
        guidance: AIRTABLE_HEALTH_GUIDANCE.unconfigured,
        pendingChangeCount: 0,
        baseId: null,
      };
    }

    const health = (
      ["unconfigured", "healthy", "pending", "delayed", "failed"] as const
    ).includes(row.health as AirtableSyncState["health"])
      ? (row.health as AirtableSyncState["health"])
      : "failed";
    const hasAccessToken = Boolean(row.access_token?.trim());
    const configured =
      row.configured === 1 || (hasAccessToken && Boolean(row.base_id?.trim()));

    return {
      health: configured ? health : "unconfigured",
      configured,
      hasAccessToken,
      lastPullAt: row.last_pull_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      guidance:
        row.guidance ??
        AIRTABLE_HEALTH_GUIDANCE[configured ? health : "unconfigured"],
      pendingChangeCount: row.pending_change_count ?? 0,
      baseId: row.base_id,
    };
  }

  /** Internal only — never send accessToken to HTTP clients. */
  getAirtableCredentials(): { accessToken: string; baseId: string } | null {
    const row = this.ctx.storage.sql
      .exec<{ access_token: string | null; base_id: string | null }>(
        `SELECT access_token, base_id FROM airtable_sync_state WHERE id = 'default' LIMIT 1`,
      )
      .toArray()[0];
    const accessToken = row?.access_token?.trim() ?? "";
    const baseId = row?.base_id?.trim() ?? "";
    if (!accessToken || !baseId) return null;
    return { accessToken, baseId };
  }

  saveAirtableConnection(input: {
    baseId: string;
    accessToken: string;
  }): AirtableSyncState {
    const baseId = input.baseId.trim();
    const incomingToken = input.accessToken.trim();
    if (!baseId) throw new Error("Base id is required.");
    if (!/^app[a-zA-Z0-9]+$/.test(baseId)) {
      throw new Error("Base id should look like appXXXXXXXXXXXXXX.");
    }

    const existing = this.getAirtableCredentials();
    const accessToken = incomingToken || existing?.accessToken || "";
    if (!accessToken) throw new Error("Access token is required.");

    const previous = this.getAirtableSyncState();
    this.ctx.storage.sql.exec(
      `INSERT INTO airtable_sync_state (
         id, health, configured, last_pull_at, last_success_at, last_error,
         guidance, pending_change_count, base_id, access_token
       ) VALUES ('default', 'pending', 1, ?, ?, NULL, ?, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         health = 'pending',
         configured = 1,
         last_error = NULL,
         guidance = excluded.guidance,
         base_id = excluded.base_id,
         access_token = excluded.access_token`,
      previous.lastPullAt,
      previous.lastSuccessAt,
      AIRTABLE_HEALTH_GUIDANCE.pending,
      baseId,
      accessToken,
    );
    return this.getAirtableSyncState();
  }

  clearAirtableConnection(): AirtableSyncState {
    this.ctx.storage.sql.exec(
      `INSERT INTO airtable_sync_state (
         id, health, configured, last_pull_at, last_success_at, last_error,
         guidance, pending_change_count, base_id, access_token
       ) VALUES ('default', 'unconfigured', 0, NULL, NULL, NULL, ?, 0, NULL, NULL)
       ON CONFLICT(id) DO UPDATE SET
         health = 'unconfigured',
         configured = 0,
         last_pull_at = NULL,
         last_success_at = NULL,
         last_error = NULL,
         guidance = excluded.guidance,
         pending_change_count = 0,
         base_id = NULL,
         access_token = NULL`,
      AIRTABLE_HEALTH_GUIDANCE.unconfigured,
    );
    return this.getAirtableSyncState();
  }

  setAirtableSyncState(state: AirtableSyncState): void {
    const existing = this.ctx.storage.sql
      .exec<{ access_token: string | null }>(
        `SELECT access_token FROM airtable_sync_state WHERE id = 'default' LIMIT 1`,
      )
      .toArray()[0];
    this.ctx.storage.sql.exec(
      `INSERT INTO airtable_sync_state (
         id, health, configured, last_pull_at, last_success_at, last_error,
         guidance, pending_change_count, base_id, access_token
       ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         health = excluded.health,
         configured = excluded.configured,
         last_pull_at = excluded.last_pull_at,
         last_success_at = excluded.last_success_at,
         last_error = excluded.last_error,
         guidance = excluded.guidance,
         pending_change_count = excluded.pending_change_count,
         base_id = excluded.base_id`,
      state.health,
      state.configured ? 1 : 0,
      state.lastPullAt,
      state.lastSuccessAt,
      state.lastError,
      state.guidance,
      state.pendingChangeCount,
      state.baseId,
      existing?.access_token ?? null,
    );
  }

  applyAirtablePullChanges(input: {
    changes: AirtablePullChange[];
    pulledAt: string;
    baseId: string;
  }): AirtablePullChange[] {
    const applied: AirtablePullChange[] = [];
    this.ctx.storage.transactionSync(() => {
      for (const change of input.changes) {
        const didApply = this.applyOneAirtableChange(change);
        if (!didApply) continue;
        this.ctx.storage.sql.exec(
          `INSERT INTO airtable_record_links
             (chartstead_kind, chartstead_id, airtable_record_id, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(chartstead_kind, chartstead_id) DO UPDATE SET
             airtable_record_id = excluded.airtable_record_id,
             updated_at = excluded.updated_at`,
          change.kind,
          change.chartsteadId,
          change.airtableRecordId,
          input.pulledAt,
        );
        applied.push(change);
      }
    });
    return applied;
  }

  private applyOneAirtableChange(change: AirtablePullChange): boolean {
    if (change.kind === "event") {
      const event = this.getEvent();
      if (!event || event.id !== change.chartsteadId) return false;
      const merged = applyPullWinsToLocalRecord(
        "event",
        {
          name: event.name,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
        },
        change.mappedValues,
      );
      this.ctx.storage.sql.exec(
        `UPDATE events SET name = ?, starts_on = ?, ends_on = ? WHERE id = ?`,
        String(merged.name ?? event.name),
        String(merged.startsOn ?? event.startsOn),
        String(merged.endsOn ?? event.endsOn),
        event.id,
      );
      return true;
    }

    if (change.kind === "submission") {
      const existing = this.getProposal(change.chartsteadId);
      if (!existing) return false;
      const event = this.getEvent();
      if (!event) return false;

      const merged = applyPullWinsToLocalRecord(
        "submission",
        {
          title: existing.title,
          abstract: existing.abstract,
          trackId: existing.trackId,
          speakerName: existing.speakerName,
          speakerEmail: existing.speakerEmail,
          biography: existing.biography,
          supportingLink: existing.supportingLink,
        },
        change.mappedValues,
      );

      const nextTrackId = String(merged.trackId ?? existing.trackId);
      const track =
        event.tracks.find((candidate) => candidate.id === nextTrackId) ??
        event.tracks.find((candidate) => candidate.id === existing.trackId);
      if (!track) return false;

      this.ctx.storage.sql.exec(
        `UPDATE proposals
         SET title = ?, abstract = ?, track_id = ?, track_name = ?,
             speaker_name = ?, speaker_email = ?, biography = ?, supporting_link = ?
         WHERE id = ?`,
        String(merged.title ?? existing.title),
        String(merged.abstract ?? existing.abstract),
        track.id,
        track.name,
        String(merged.speakerName ?? existing.speakerName),
        String(merged.speakerEmail ?? existing.speakerEmail),
        String(merged.biography ?? existing.biography),
        String(merged.supportingLink ?? existing.supportingLink),
        existing.id,
      );
      return true;
    }

    if (change.kind === "speaker") {
      const speaker = this.getSpeakerRow(change.chartsteadId);
      if (!speaker) return false;
      const merged = applyPullWinsToLocalRecord(
        "speaker",
        {
          name: speaker.name,
          email: speaker.email,
          biography: speaker.biography,
        },
        change.mappedValues,
      );
      this.ctx.storage.sql.exec(
        `UPDATE speakers SET name = ?, email = ?, biography = ? WHERE id = ?`,
        String(merged.name ?? speaker.name),
        String(merged.email ?? speaker.email)
          .trim()
          .toLowerCase(),
        String(merged.biography ?? speaker.biography),
        speaker.id,
      );
      return true;
    }

    if (change.kind === "session") {
      const row = this.ctx.storage.sql
        .exec<{
          id: string;
          title: string;
          format: string;
          track_id: string;
          room_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
        }>(
          `SELECT id, title, format, track_id, room_id, starts_at, ends_at
           FROM sessions WHERE id = ?`,
          change.chartsteadId,
        )
        .toArray()[0];
      if (!row) return false;
      const merged = applyPullWinsToLocalRecord(
        "session",
        {
          title: row.title,
          format: row.format,
          trackId: row.track_id,
          roomId: row.room_id,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
        },
        change.mappedValues,
      );
      this.ctx.storage.sql.exec(
        `UPDATE sessions
         SET title = ?, format = ?, track_id = ?, room_id = ?, starts_at = ?, ends_at = ?
         WHERE id = ?`,
        String(merged.title ?? row.title),
        String(merged.format ?? row.format),
        String(merged.trackId ?? row.track_id),
        merged.roomId == null ? null : String(merged.roomId),
        merged.startsAt == null ? null : String(merged.startsAt),
        merged.endsAt == null ? null : String(merged.endsAt),
        row.id,
      );
      return true;
    }

    if (change.kind === "task") {
      const row = this.ctx.storage.sql
        .exec<{
          id: string;
          title: string;
          instructions: string;
          due_at: string | null;
          status: string;
        }>(
          `SELECT id, title, instructions, due_at, status
           FROM onboarding_tasks WHERE id = ?`,
          change.chartsteadId,
        )
        .toArray()[0];
      if (!row) return false;
      const merged = applyPullWinsToLocalRecord(
        "task",
        {
          title: row.title,
          instructions: row.instructions,
          dueAt: row.due_at,
          status: row.status,
        },
        change.mappedValues,
      );
      const nextStatus = String(merged.status ?? row.status);
      if (nextStatus !== "open" && nextStatus !== "completed") return false;
      this.ctx.storage.sql.exec(
        `UPDATE onboarding_tasks
         SET title = ?, instructions = ?, due_at = ?, status = ?,
             completed_at = CASE
               WHEN ? = 'completed' AND completed_at IS NULL THEN ?
               WHEN ? = 'open' THEN NULL
               ELSE completed_at
             END
         WHERE id = ?`,
        String(merged.title ?? row.title),
        String(merged.instructions ?? row.instructions),
        merged.dueAt == null ? null : String(merged.dueAt),
        nextStatus,
        nextStatus,
        new Date().toISOString(),
        nextStatus,
        row.id,
      );
      return true;
    }

    return false;
  }

  listApiSpeakers(): Array<{
    id: string;
    name: string;
    email: string;
    biography: string;
    createdAt: string;
  }> {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        name: string;
        email: string;
        biography: string;
        created_at: string;
      }>(
        `SELECT id, name, email, biography, created_at
         FROM speakers
         ORDER BY name ASC, id ASC`,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        biography: row.biography,
        createdAt: row.created_at,
      }));
  }

  listApiTasks(): Array<{
    id: string;
    speakerId: string;
    title: string;
    kind: string;
    status: string;
    dueAt: string | null;
    instructions: string;
    completionRequirement: string;
    readinessFlag: string | null;
    completedAt: string | null;
  }> {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        speaker_id: string;
        title: string;
        kind: string;
        status: string;
        due_at: string | null;
        instructions: string;
        completion_requirement: string;
        readiness_flag: string | null;
        completed_at: string | null;
      }>(
        `SELECT id, speaker_id, title, kind, status, due_at, instructions,
                completion_requirement, readiness_flag, completed_at
         FROM onboarding_tasks
         ORDER BY created_at DESC, id ASC`,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        speakerId: row.speaker_id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        dueAt: row.due_at,
        instructions: row.instructions,
        completionRequirement: row.completion_requirement,
        readinessFlag: row.readiness_flag,
        completedAt: row.completed_at,
      }));
  }

  listApiCommunications(): OutboxMessage[] {
    return this.listOutboxMessages();
  }

  /** Test helper: pre-insert a conflicting session id for transactional rollback coverage. */
  insertSessionConflictForTest(sessionId: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions
        (id, proposal_id, course_check_plan_id, title, format, track_id,
         room_id, starts_at, ends_at, created_at)
       VALUES (?, NULL, 'conflict-fixture', 'Conflict fixture', 'talk', 'platform',
               NULL, NULL, NULL, ?)`,
      sessionId,
      new Date().toISOString(),
    );
  }

  /** Test helper: attach co-speakers without going through public submit. */
  setProposalCoSpeakersForTest(
    proposalId: string,
    coSpeakers: CoSpeakerInput[],
  ): void {
    this.ctx.storage.sql.exec(
      `UPDATE proposals
       SET co_speakers_json = ?, review_version = review_version + 1
       WHERE id = ?`,
      JSON.stringify(coSpeakers),
      proposalId,
    );
  }

  /** Test helper: create or return a speaker by email. */
  upsertSpeakerForTest(input: {
    name: string;
    email: string;
    biography: string;
  }): string {
    const email = input.email.trim().toLowerCase();
    const existing = this.ctx.storage.sql
      .exec<{ id: string }>(`SELECT id FROM speakers WHERE email = ?`, email)
      .toArray()[0];
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      `INSERT INTO speakers (id, name, email, biography, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      input.name,
      email,
      input.biography,
      new Date().toISOString(),
    );
    return id;
  }
}

export class DraftConflictError extends Error {
  readonly code = "draft_conflict" as const;
  constructor(message: string) {
    super(message);
    this.name = "DraftConflictError";
  }
}

/** Interrupted Worker deliveries stuck in `sending` become reclaimable after this. */
export const STALE_SENDING_MS = 2 * 60_000;

/** Unclaimed uploads older than this are eligible for R2/DB purge. */
export const ASSET_PURGE_AFTER_MS = 24 * 60 * 60_000;

export type ProposalWriteResult =
  | { ok: true; proposal: OrganizerProposal }
  | { ok: false; errors: Record<string, string> };

function createFormId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${slug || "cfp"}-${suffix}`;
}
