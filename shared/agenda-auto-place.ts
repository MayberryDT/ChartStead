import type {
  AgendaAutoPlaceLeftover,
  AgendaAutoPlaceProposal,
  EventRecord,
  OrganizerSession,
} from "./events";
import { placementStatus } from "./schedule-conflicts";

export const AUTO_PLACE_DURATION_MINUTES = 45;
export const AUTO_PLACE_DAY_START_HOUR = 9;
export const AUTO_PLACE_DAY_END_HOUR = 18;
export const AUTO_PLACE_SLOT_MINUTES = 30;

export interface AutoPlacePlan {
  proposals: AgendaAutoPlaceProposal[];
  leftovers: AgendaAutoPlaceLeftover[];
  assumptions: string[];
  manualPlacementPreserved: string[];
}

function eachDay(startsOn: string, endsOn: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function slots(): string[] {
  const result: string[] = [];
  for (
    let minutes = AUTO_PLACE_DAY_START_HOUR * 60;
    minutes + AUTO_PLACE_DURATION_MINUTES <= AUTO_PLACE_DAY_END_HOUR * 60;
    minutes += AUTO_PLACE_SLOT_MINUTES
  ) {
    result.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return result;
}

function toIso(day: string, slot: string): string {
  return `${day}T${slot}:00.000Z`;
}

function overlaps(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd);
}

function conflictsWith(
  candidate: Pick<OrganizerSession, "roomId" | "startsAt" | "endsAt" | "speakers"> & {
    roomId: string;
    startsAt: string;
    endsAt: string;
  },
  existing: OrganizerSession,
): boolean {
  if (!existing.startsAt || !existing.endsAt) return false;
  if (!overlaps(candidate.startsAt, candidate.endsAt, existing.startsAt, existing.endsAt)) {
    return false;
  }
  if (candidate.roomId === existing.roomId) return true;
  return candidate.speakers.some((speaker) =>
    existing.speakers.some((other) => other.id === speaker.id),
  );
}

function orderedSessions(sessions: OrganizerSession[]): OrganizerSession[] {
  return [...sessions].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
}

export function planAutoPlace(input: {
  event: Pick<EventRecord, "startsOn" | "endsOn" | "rooms">;
  sessions: OrganizerSession[];
  selectedSessionIds: string[];
  includeManual: boolean;
}): AutoPlacePlan {
  const sessions = orderedSessions(input.sessions);
  const selectedIds = new Set([...input.selectedSessionIds].sort());
  const candidates = sessions.filter((session) => {
    if (!selectedIds.has(session.id)) return false;
    return input.includeManual || placementStatus(session) === "unplaced";
  });
  const candidateIds = new Set(candidates.map((session) => session.id));
  const preserved = sessions.filter((session) => !candidateIds.has(session.id));
  const manualPlacementPreserved = preserved
    .filter((session) => placementStatus(session) === "placed")
    .map((session) => session.id)
    .sort();
  const readyRooms = input.event.rooms.filter((room) => room.readiness === "ready");
  const assumptions = [
    `Uses ${AUTO_PLACE_DURATION_MINUTES}-minute sessions on ${AUTO_PLACE_SLOT_MINUTES}-minute boundaries.`,
    `Searches ${AUTO_PLACE_DAY_START_HOUR}:00–${AUTO_PLACE_DAY_END_HOUR}:00 UTC on each event day.`,
    "Existing full placements are preserved unless those session IDs were explicitly selected.",
    "Partial placements remain untouched unless explicitly selected and included.",
  ];
  if (readyRooms.length < input.event.rooms.length) {
    assumptions.push("Rooms marked pending are excluded until they are ready.");
  }

  const occupied = preserved.filter((session) => placementStatus(session) === "placed");
  const proposals: AgendaAutoPlaceProposal[] = [];
  const leftovers: AgendaAutoPlaceLeftover[] = sessions
    .filter((session) => selectedIds.has(session.id) && !candidateIds.has(session.id))
    .map((session) => ({
      sessionId: session.id,
      title: session.title,
      placementStatus: placementStatus(session),
      reason:
        placementStatus(session) === "partial"
          ? "Partial placement is preserved. Select includeManual to replace its TBD fields."
          : "This session is already placed and was preserved. Select includeManual to move it.",
    }));
  const days = eachDay(input.event.startsOn, input.event.endsOn);
  const timeSlots = slots();

  for (const session of candidates) {
    let proposal: AgendaAutoPlaceProposal | null = null;
    for (const day of days) {
      if (proposal) break;
      for (const slot of timeSlots) {
        if (proposal) break;
        for (const room of readyRooms) {
          const startsAt = toIso(day, slot);
          const endsAt = new Date(
            Date.parse(startsAt) + AUTO_PLACE_DURATION_MINUTES * 60 * 1000,
          ).toISOString();
          const candidate = {
            roomId: room.id,
            startsAt,
            endsAt,
            speakers: session.speakers,
          };
          if (occupied.some((existing) => conflictsWith(candidate, existing))) continue;
          proposal = {
            sessionId: session.id,
            title: session.title,
            roomId: room.id,
            roomName: room.name,
            startsAt,
            endsAt,
            durationMinutes: AUTO_PLACE_DURATION_MINUTES,
            reason: "First available conflict-free slot in the event window.",
          };
          occupied.push({ ...session, ...candidate, placementStatus: "placed" });
          break;
        }
      }
    }
    if (proposal) {
      proposals.push(proposal);
    } else {
      const reason =
        readyRooms.length === 0
          ? "No ready rooms are available. Mark a room ready, then run preview again."
          : "No conflict-free 45-minute slot remains across the event days and ready rooms.";
      leftovers.push({
        sessionId: session.id,
        title: session.title,
        placementStatus: placementStatus(session),
        reason,
      });
    }
  }

  return {
    proposals,
    leftovers,
    assumptions,
    manualPlacementPreserved,
  };
}
