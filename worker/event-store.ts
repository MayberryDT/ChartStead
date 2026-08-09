import { DurableObject } from "cloudflare:workers";

import type { EventRecord } from "../shared/events";
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

  initializeEvent(event: EventRecord): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO events
        (id, name, starts_on, ends_on, submission_count, unreviewed_count, tracks_json, rooms_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         starts_on = excluded.starts_on,
         ends_on = excluded.ends_on,
         submission_count = excluded.submission_count,
         unreviewed_count = excluded.unreviewed_count,
         tracks_json = excluded.tracks_json,
         rooms_json = excluded.rooms_json`,
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
}
