import { DurableObject } from "cloudflare:workers";

import type { AppBindings } from "./types";

export interface EventRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  tracks: string[];
  rooms: string[];
}

export const seedEventId = "pacific-open-data-summit-2026";

const seedEvent: EventRecord = {
  id: seedEventId,
  name: "Pacific Open Data Summit 2026",
  startsOn: "2026-10-07",
  endsOn: "2026-10-08",
  tracks: ["Platform", "Program Ops", "Design Systems", "Community"],
  rooms: ["Harbor Hall", "Compass Room", "Chart Room"],
};

interface EventRow {
  [key: string]: string;
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
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
          tracks_json TEXT NOT NULL,
          rooms_json TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO events
          (id, name, starts_on, ends_on, tracks_json, rooms_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        seedEvent.id,
        seedEvent.name,
        seedEvent.startsOn,
        seedEvent.endsOn,
        JSON.stringify(seedEvent.tracks),
        JSON.stringify(seedEvent.rooms),
      );
    });
  }

  getEvent(): EventRecord {
    const row = this.ctx.storage.sql
      .exec<EventRow>(
        `SELECT id, name, starts_on, ends_on, tracks_json, rooms_json
         FROM events
         WHERE id = ?`,
        seedEvent.id,
      )
      .one();

    return {
      id: row.id,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      tracks: JSON.parse(row.tracks_json) as string[],
      rooms: JSON.parse(row.rooms_json) as string[],
    };
  }
}
