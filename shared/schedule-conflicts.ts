export type PlacementStatus = "unplaced" | "partial" | "placed";

export interface ConflictSpeaker {
  id: string;
  name: string;
}

export interface ConflictSessionInput {
  id: string;
  title: string;
  roomId: string | null;
  roomName?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  speakers: ConflictSpeaker[];
}

export type ScheduleConflictKind = "speaker_double_book" | "room_overlap";

export interface ScheduleConflict {
  id: string;
  kind: ScheduleConflictKind;
  summary: string;
  sessionIds: [string, string];
  sessionTitles: [string, string];
  speakerId?: string;
  speakerName?: string;
  roomId?: string;
  roomName?: string;
  startsAt: string;
  endsAt: string;
  actions: Array<
    | "move_time"
    | "move_room"
    | "keep_placement"
    | "open_speaker_schedule"
  >;
}

export function placementStatus(
  session: Pick<ConflictSessionInput, "roomId" | "startsAt" | "endsAt">,
): PlacementStatus {
  const hasRoom = Boolean(session.roomId);
  const hasStart = Boolean(session.startsAt);
  const hasEnd = Boolean(session.endsAt);
  if (!hasRoom && !hasStart && !hasEnd) return "unplaced";
  if (hasRoom && hasStart && hasEnd) return "placed";
  return "partial";
}

function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a0 = Date.parse(aStart);
  const a1 = Date.parse(aEnd);
  const b0 = Date.parse(bStart);
  const b1 = Date.parse(bEnd);
  if ([a0, a1, b0, b1].some((n) => Number.isNaN(n))) return false;
  return a0 < b1 && b0 < a1;
}

function orderedPair(
  a: ConflictSessionInput,
  b: ConflictSessionInput,
): [ConflictSessionInput, ConflictSessionInput] {
  return a.id <= b.id ? [a, b] : [b, a];
}

export function detectScheduleConflicts(
  sessions: ConflictSessionInput[],
): ScheduleConflict[] {
  type TimedSession = ConflictSessionInput & {
    startsAt: string;
    endsAt: string;
  };
  const timed: TimedSession[] = [];
  for (const session of sessions) {
    if (!session.startsAt || !session.endsAt) continue;
    timed.push({
      ...session,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
    });
  }
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const left = timed[i];
      const right = timed[j];
      if (!timesOverlap(left.startsAt, left.endsAt, right.startsAt, right.endsAt)) {
        continue;
      }
      const [rawA, rawB] = orderedPair(left, right);
      const a = rawA as TimedSession;
      const b = rawB as TimedSession;
      const windowStart =
        Date.parse(a.startsAt) <= Date.parse(b.startsAt) ? a.startsAt : b.startsAt;
      const windowEnd =
        Date.parse(a.endsAt) >= Date.parse(b.endsAt) ? a.endsAt : b.endsAt;

      if (a.roomId && a.roomId === b.roomId) {
        const roomName = a.roomName || b.roomName || a.roomId;
        conflicts.push({
          id: `room:${a.roomId}:${a.id}:${b.id}`,
          kind: "room_overlap",
          summary: `Room overlap in ${roomName}: “${a.title}” and “${b.title}”`,
          sessionIds: [a.id, b.id],
          sessionTitles: [a.title, b.title],
          roomId: a.roomId,
          roomName,
          startsAt: windowStart,
          endsAt: windowEnd,
          actions: ["move_time", "move_room", "keep_placement"],
        });
      }

      for (const speaker of a.speakers) {
        if (!b.speakers.some((other) => other.id === speaker.id)) continue;
        conflicts.push({
          id: `speaker:${speaker.id}:${a.id}:${b.id}`,
          kind: "speaker_double_book",
          summary: `Speaker double-booking for ${speaker.name}: “${a.title}” and “${b.title}”`,
          sessionIds: [a.id, b.id],
          sessionTitles: [a.title, b.title],
          speakerId: speaker.id,
          speakerName: speaker.name,
          startsAt: windowStart,
          endsAt: windowEnd,
          actions: [
            "move_time",
            "move_room",
            "keep_placement",
            "open_speaker_schedule",
          ],
        });
      }
    }
  }

  return conflicts.sort((left, right) => left.id.localeCompare(right.id));
}
