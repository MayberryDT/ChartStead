import { DurableObject } from "cloudflare:workers";

import type {
  EventRecord,
  OrganizerProposal,
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
  [key: string]: string;
  id: string;
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

function mapProposal(row: ProposalRow, eventId: string): OrganizerProposal {
  return {
    id: row.id,
    eventId,
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

  createProposal(input: ProposalInput): OrganizerProposal {
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
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO proposals (
          id, title, abstract, track_id, track_name, speaker_name, speaker_email,
          biography, supporting_link, status, committee_note, private_note, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', '', '', ?)`,
        id,
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
             unreviewed_count = unreviewed_count + 1
         WHERE id = ?`,
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
        `SELECT id, title, abstract, track_id, track_name, speaker_name, speaker_email,
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
        `SELECT id, title, abstract, track_id, track_name, speaker_name, speaker_email,
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
