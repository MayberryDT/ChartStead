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
  CourseCheckReceipt,
  ProgramOutcome,
} from "../shared/course-check";
import type {
  CoSpeakerInput,
  EventRecord,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerProposal,
  OutboxDeliveryStatus,
  OutboxMessage,
  ProposalAuditEvent,
  ProposalInput,
  ProposalStatus,
  PublishedCfpForm,
  SubmissionAnswers,
} from "../shared/events";
import type { AssetClaimInput } from "./cfp-submissions";
import {
  hasBlockerFindings,
  planDecisionCascade,
  planGuaranteedSpeaker,
  type ExistingSpeaker,
} from "./course-check/decision-planner";
import { digestPayload } from "./course-check/digest";
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
  [key: string]: string;
  id: string;
  name: string;
  email: string;
  biography: string;
  created_at: string;
}

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
  messagesQueued: number;
  calendarEffects: number;
  publicRevisions: number;
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
    body: JSON.parse(row.body_json) as CourseCheckPlanBody,
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
    kind: "submission_confirmation",
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
        CREATE TABLE IF NOT EXISTS onboarding_tasks (
          id TEXT PRIMARY KEY,
          speaker_id TEXT NOT NULL,
          session_id TEXT,
          proposal_id TEXT,
          course_check_plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
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

      this.ensureColumn("events", "submission_count", "INTEGER NOT NULL DEFAULT 0");
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
    kind: "submission_confirmation";
    toEmail: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    proposalId: string;
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
    this.ctx.storage.sql.exec(
      `UPDATE proposals
       SET confirmation_email_status = 'queued'
       WHERE id = ?`,
      input.proposalId,
    );
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
      if (message.proposalId) {
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
    if (message.proposalId) {
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET confirmation_email_status = 'sent' WHERE id = ?`,
        message.proposalId,
      );
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
    if (message.proposalId) {
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET confirmation_email_status = 'failed' WHERE id = ?`,
        message.proposalId,
      );
    }
    return this.getOutboxMessage(id)!;
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
                  form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id
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
                form_id, form_definition_version, question_name, max_bytes, claimed_proposal_id
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
      .exec<SpeakerRow>(`SELECT id, name, email, biography, created_at FROM speakers`)
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

  getCourseCheckPlan(planId: string): CourseCheckPlan | null {
    const eventId = this.eventIdOrThrow();
    const row = this.loadCourseCheckPlanRow(planId);
    if (!row) return null;
    return this.attachReceipt(mapCourseCheckPlan(row, eventId), row.receipt_id);
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
      .map((row) => this.attachReceipt(mapCourseCheckPlan(row, eventId), row.receipt_id));
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
    proposalId: string;
    outcome: ProgramOutcome;
    idempotencyKey: string;
    actor: CourseCheckActor;
  }): Promise<{ plan: CourseCheckPlan; created: boolean }> {
    const existing = this.readIdempotency("create-decision", input.idempotencyKey);
    if (existing) {
      const plan = this.getCourseCheckPlan(existing.planId);
      if (!plan) throw new Error("Idempotent decision plan is missing.");
      return { plan, created: false };
    }

    const proposal = this.getProposal(input.proposalId);
    if (!proposal) throw new Error(`Proposal ${input.proposalId} not found.`);

    const planId = crypto.randomUUID();
    const body = planDecisionCascade({
      proposal,
      outcome: input.outcome,
      existingSpeakersByEmail: this.listExistingSpeakersByEmail(),
      planId,
    });
    const digest = await digestPayload({
      actionType: body.actionType,
      proposalId: body.proposalId,
      outcome: body.outcome,
      proposalRevision: body.proposalRevision,
      speakers: body.speakers,
      participations: body.participations,
      session: body.session,
      tasks: body.tasks,
      portalAccess: body.portalAccess,
      deltas: body.deltas,
      findings: body.findings,
      stages: body.stages,
    });
    const now = new Date().toISOString();
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
    const plan = this.getCourseCheckPlan(planId);
    if (!plan) throw new Error("Decision Course Check was not persisted.");
    this.writeIdempotency({
      command: "create-decision",
      key: input.idempotencyKey,
      planId,
      response: plan,
    });
    return { plan, created: true };
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
      const proposal = this.getProposal(plan.body.proposalId);
      if (!proposal) {
        return {
          ok: false,
          status: 409,
          code: "relevant_input_changed",
          error: "The proposal for this plan no longer exists.",
          recoveryGuidance: "Create a new Decision Course Check from current proposals.",
          changedInputs: ["proposal"],
        };
      }
      if (proposal.reviewVersion !== plan.body.proposalRevision) {
        return {
          ok: false,
          status: 409,
          code: "relevant_input_changed",
          error: "Relevant proposal inputs changed after this plan was created.",
          recoveryGuidance:
            "Create a new Decision Course Check from the current proposal revision.",
          changedInputs: ["proposal.reviewVersion"],
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
          "Resolve the blocking findings, then create a new Course Check.",
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
        this.ctx.storage.sql.exec(
          `UPDATE course_check_plans
           SET state = 'Complete',
               updated_at = ?,
               approval_json = ?,
               receipt_id = ?
           WHERE id = ?`,
          now,
          JSON.stringify(approval),
          receiptId,
          plan.id,
        );
        const proposalId =
          plan.body.actionType === "decision" ? plan.body.proposalId : "";
        const outcomeLabel =
          plan.body.actionType === "decision"
            ? plan.body.outcome
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
              state: "Complete",
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
    return { ok: true, plan: applied, created: true };
  }

  private applyCascadeRecords(plan: CourseCheckPlan, now: string): void {
    const body = plan.body;
    const speakerIdByPlanned = new Map<string, string>();

    if (body.actionType === "decision") {
      const current = this.ctx.storage.sql
        .exec<{ review_version: number; program_outcome: string }>(
          `SELECT review_version, program_outcome FROM proposals WHERE id = ?`,
          body.proposalId,
        )
        .toArray()[0];
      if (!current) {
        throw new Error(`Proposal ${body.proposalId} disappeared during apply.`);
      }
      if (Number(current.review_version) !== body.proposalRevision) {
        throw new Error("Proposal revision changed during apply.");
      }
      if (current.program_outcome) {
        throw new Error(
          `Proposal already has final outcome "${current.program_outcome}".`,
        );
      }
      this.ctx.storage.sql.exec(
        `UPDATE proposals SET program_outcome = ? WHERE id = ?`,
        body.outcome,
        body.proposalId,
      );
      if (body.outcome === "declined") {
        return;
      }
    }

    for (const speaker of body.speakers) {
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
          now,
        );
      }
      speakerIdByPlanned.set(speaker.plannedId, speakerId!);
    }

    for (const participation of body.participations) {
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
        body.actionType === "decision" ? body.proposalId : null,
        plan.id,
        participation.titleSnapshot,
        participation.organizationSnapshot,
        participation.role,
        now,
      );
    }

    const session = body.session;
    if (session) {
      this.ctx.storage.sql.exec(
        `INSERT INTO sessions
          (id, proposal_id, course_check_plan_id, title, format, track_id,
           room_id, starts_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        session.plannedId,
        body.actionType === "decision" ? body.proposalId : null,
        plan.id,
        session.title,
        session.format,
        session.trackId,
        session.roomId,
        session.startsAt,
        session.endsAt,
        now,
      );
    }

    for (const task of body.tasks) {
      const speakerId = speakerIdByPlanned.get(task.speakerPlannedId);
      if (!speakerId) throw new Error("Task is missing its speaker mapping.");
      this.ctx.storage.sql.exec(
        `INSERT INTO onboarding_tasks
          (id, speaker_id, session_id, proposal_id, course_check_plan_id, title, kind,
           status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        task.plannedId,
        speakerId,
        session?.plannedId ?? null,
        body.actionType === "decision" ? body.proposalId : null,
        plan.id,
        task.title,
        task.kind,
        now,
      );
    }

    for (const access of body.portalAccess) {
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
        body.actionType === "decision" ? body.proposalId : null,
        plan.id,
        now,
      );
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
              `SELECT id, name, email, biography, created_at
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
      messagesQueued: 0,
      calendarEffects: 0,
      publicRevisions: 0,
    };
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
