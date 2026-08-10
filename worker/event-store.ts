import { DurableObject } from "cloudflare:workers";

import type {
  EventRecord,
  OrganizerProposal,
  PublishedCfpForm,
  ProposalInput,
  ProposalStatus,
} from "../shared/events";
import { createStableProposalId } from "./proposals";
import type { AppBindings } from "./types";

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
}

interface ProposalRow {
  [key: string]: string | number;
  id: string;
  form_id: string;
  form_definition_version: number;
  title: string;
  abstract: string;
  track_id: string;
  track_name: string;
  speaker_name: string;
  speaker_email: string;
  biography: string;
  supporting_link: string;
  status: string;
  committee_note: string;
  private_note: string;
  submitted_at: string;
}

interface CfpFormRow {
  [key: string]: string | number;
  id: string;
  status: string;
  definition_version: number;
  definition_json: string;
  published_at: string;
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

const SUBMISSION_LIMIT = 20;
const SUBMISSION_WINDOW_MS = 10 * 60 * 1_000;

function mapProposal(row: ProposalRow, eventId: string): OrganizerProposal {
  return {
    id: row.id,
    eventId,
    formId: row.form_id,
    formDefinitionVersion: row.form_definition_version,
    title: row.title,
    abstract: row.abstract,
    trackId: row.track_id,
    trackName: row.track_name,
    speakerName: row.speaker_name,
    speakerEmail: row.speaker_email,
    biography: row.biography,
    supportingLink: row.supporting_link,
    status: row.status as ProposalStatus,
    committeeNote: row.committee_note,
    privateNote: row.private_note,
    submittedAt: row.submitted_at,
  };
}

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
          rooms_json TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY,
          form_id TEXT NOT NULL DEFAULT 'main-cfp',
          form_definition_version INTEGER NOT NULL DEFAULT 1,
          title TEXT NOT NULL,
          abstract TEXT NOT NULL,
          track_id TEXT NOT NULL,
          track_name TEXT NOT NULL,
          speaker_name TEXT NOT NULL,
          speaker_email TEXT NOT NULL,
          biography TEXT NOT NULL,
          supporting_link TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'unreviewed',
          committee_note TEXT NOT NULL DEFAULT '',
          private_note TEXT NOT NULL DEFAULT '',
          submitted_at TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS cfp_form_versions (
          id TEXT NOT NULL,
          status TEXT NOT NULL,
          definition_version INTEGER NOT NULL,
          definition_json TEXT NOT NULL,
          published_at TEXT NOT NULL,
          PRIMARY KEY (id, definition_version)
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

      const columns = this.ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(events)")
        .toArray();
      if (!columns.some((column) => column.name === "submission_count")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE events ADD COLUMN submission_count INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!columns.some((column) => column.name === "unreviewed_count")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE events ADD COLUMN unreviewed_count INTEGER NOT NULL DEFAULT 0",
        );
      }

      const proposalColumns = this.ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(proposals)")
        .toArray();
      if (!proposalColumns.some((column) => column.name === "form_id")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE proposals ADD COLUMN form_id TEXT NOT NULL DEFAULT 'main-cfp'",
        );
      }
      if (
        !proposalColumns.some(
          (column) => column.name === "form_definition_version",
        )
      ) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE proposals ADD COLUMN form_definition_version INTEGER NOT NULL DEFAULT 1",
        );
      }
    });
  }

  /** Insert seed once. Never overwrite persisted operational rows. */
  seedIfEmpty(event: EventRecord): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO events
        (id, name, starts_on, ends_on, submission_count, unreviewed_count, tracks_json, rooms_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      event.id,
      event.name,
      event.startsOn,
      event.endsOn,
      event.submissionCount,
      event.unreviewedCount,
      JSON.stringify(event.tracks),
      JSON.stringify(event.rooms),
    );
  }

  seedPublishedFormIfEmpty(form: PublishedCfpForm): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO cfp_form_versions
        (id, status, definition_version, definition_json, published_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id, definition_version) DO NOTHING`,
      form.id,
      form.status,
      form.definitionVersion,
      JSON.stringify(form.definition),
      form.publishedAt,
    );
  }

  seedProposalsIfNeeded(proposals: OrganizerProposal[]): void {
    const marker = this.ctx.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM seed_markers WHERE name = 'proposals-v1'",
      )
      .toArray()[0];
    if (marker) return;

    const existingProposalCount = this.ctx.storage.sql
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
            id, form_id, form_definition_version, title, abstract,
            track_id, track_name, speaker_name, speaker_email,
            biography, supporting_link, status, committee_note, private_note, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
          proposal.id,
          proposal.formId,
          proposal.formDefinitionVersion,
          proposal.title,
          proposal.abstract,
          proposal.trackId,
          proposal.trackName,
          proposal.speakerName,
          proposal.speakerEmail,
          proposal.biography,
          proposal.supportingLink,
          proposal.status,
          proposal.committeeNote,
          proposal.privateNote,
          proposal.submittedAt,
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO seed_markers (name, applied_at)
         VALUES ('proposals-v1', ?)`,
        new Date().toISOString(),
      );

      const eventRow = this.ctx.storage.sql
        .exec<{ tracks_json: string }>(
          "SELECT tracks_json FROM events LIMIT 1",
        )
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
        const tracks = (JSON.parse(eventRow.tracks_json) as EventRecord["tracks"]).map(
          (track) => ({
            ...track,
            proposalCount: countByTrack.get(track.id) ?? 0,
          }),
        );
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

  getPublishedForm(): PublishedCfpForm | null {
    const row = this.ctx.storage.sql
      .exec<CfpFormRow>(
        `SELECT id, status, definition_version, definition_json, published_at
         FROM cfp_form_versions
         WHERE status = 'published'
         ORDER BY definition_version DESC
         LIMIT 1`,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      status: "published",
      definitionVersion: row.definition_version,
      definition: JSON.parse(row.definition_json) as Record<string, unknown>,
      publishedAt: row.published_at,
    };
  }

  getFormVersion(
    formId: string,
    definitionVersion: number,
  ): PublishedCfpForm | null {
    const row = this.ctx.storage.sql
      .exec<CfpFormRow>(
        `SELECT id, status, definition_version, definition_json, published_at
         FROM cfp_form_versions
         WHERE id = ? AND definition_version = ? AND status = 'published'
         LIMIT 1`,
        formId,
        definitionVersion,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      status: "published",
      definitionVersion: row.definition_version,
      definition: JSON.parse(row.definition_json) as Record<string, unknown>,
      publishedAt: row.published_at,
    };
  }

  consumeSubmissionQuota(
    clientKey: string,
    nowMs: number,
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
    if (row.attempt_count >= SUBMISSION_LIMIT) {
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
                unreviewed_count, tracks_json, rooms_json
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
    };
  }

  createProposal(
    input: ProposalInput,
    formId: string,
    formDefinitionVersion: number,
  ): OrganizerProposal {
    const event = this.getEvent();
    if (!event) {
      throw new Error("Event is not initialized.");
    }
    const track = event.tracks.find((candidate) => candidate.id === input.trackId);
    if (!track) {
      throw new Error(`Unknown track ${input.trackId}`);
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
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO proposals (
          id, form_id, form_definition_version, title, abstract,
          track_id, track_name, speaker_name, speaker_email,
          biography, supporting_link, status, committee_note, private_note, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', '', '', ?)`,
        id,
        formId,
        formDefinitionVersion,
        input.title.trim(),
        input.abstract.trim(),
        track.id,
        track.name,
        input.speakerName.trim(),
        input.speakerEmail.trim(),
        input.biography.trim(),
        input.supportingLink.trim(),
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

    const created = this.getProposal(id);
    if (!created) {
      throw new Error(`Proposal ${id} was not persisted.`);
    }
    return created;
  }

  getProposal(proposalId: string): OrganizerProposal | null {
    const event = this.getEvent();
    if (!event) return null;
    const row = this.ctx.storage.sql
      .exec<ProposalRow>(
        `SELECT id, form_id, form_definition_version, title, abstract,
                track_id, track_name, speaker_name, speaker_email,
                biography, supporting_link, status, committee_note, private_note, submitted_at
         FROM proposals
         WHERE id = ?`,
        proposalId,
      )
      .toArray()[0];
    return row ? mapProposal(row, event.id) : null;
  }

  listProposals(query = ""): OrganizerProposal[] {
    const event = this.getEvent();
    if (!event) return [];
    const rows = this.ctx.storage.sql
      .exec<ProposalRow>(
        `SELECT id, form_id, form_definition_version, title, abstract,
                track_id, track_name, speaker_name, speaker_email,
                biography, supporting_link, status, committee_note, private_note, submitted_at
         FROM proposals
         ORDER BY submitted_at DESC, id DESC`,
      )
      .toArray();
    const proposals = rows.map((row) => mapProposal(row, event.id));
    const needle = query.trim().toLowerCase();
    if (!needle) return proposals;
    return proposals.filter((proposal) => {
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
  }
}
