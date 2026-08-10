export interface TrackRecord {
  id: string;
  name: string;
  proposalCount: number;
}

export interface RoomRecord {
  id: string;
  name: string;
  readiness: "ready" | "pending";
}

export interface EventRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  submissionCount: number;
  unreviewedCount: number;
  tracks: TrackRecord[];
  rooms: RoomRecord[];
}

export interface OrganizerPrincipal {
  id: string;
  displayName: string;
  role: "admin";
  eventIds: string[];
}

export interface EventListResponse {
  events: EventRecord[];
  principal: OrganizerPrincipal;
}
