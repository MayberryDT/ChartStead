import { describe, expect, it } from "vitest";

import {
  detectScheduleConflicts,
  placementStatus,
  type ConflictSessionInput,
} from "../../shared/schedule-conflicts";

function session(
  partial: Partial<ConflictSessionInput> & Pick<ConflictSessionInput, "id" | "title">,
): ConflictSessionInput {
  return {
    roomId: null,
    startsAt: null,
    endsAt: null,
    speakers: [],
    ...partial,
  };
}

describe("placementStatus", () => {
  it("marks fully empty sessions as unplaced", () => {
    expect(placementStatus(session({ id: "a", title: "A" }))).toBe("unplaced");
  });

  it("marks incomplete room or time as partial TBD", () => {
    expect(
      placementStatus(
        session({
          id: "a",
          title: "A",
          roomId: "harbor-hall",
        }),
      ),
    ).toBe("partial");
    expect(
      placementStatus(
        session({
          id: "b",
          title: "B",
          startsAt: "2026-10-07T16:00:00.000Z",
          endsAt: "2026-10-07T16:45:00.000Z",
        }),
      ),
    ).toBe("partial");
  });

  it("marks room + start + end as placed", () => {
    expect(
      placementStatus(
        session({
          id: "a",
          title: "A",
          roomId: "harbor-hall",
          startsAt: "2026-10-07T16:00:00.000Z",
          endsAt: "2026-10-07T16:45:00.000Z",
        }),
      ),
    ).toBe("placed");
  });
});

describe("detectScheduleConflicts", () => {
  const morning = {
    startsAt: "2026-10-07T16:00:00.000Z",
    endsAt: "2026-10-07T16:45:00.000Z",
  };
  const overlap = {
    startsAt: "2026-10-07T16:30:00.000Z",
    endsAt: "2026-10-07T17:15:00.000Z",
  };
  const later = {
    startsAt: "2026-10-07T17:00:00.000Z",
    endsAt: "2026-10-07T17:45:00.000Z",
  };

  it("returns no conflicts for unplaced or TBD sessions", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Unplaced",
        speakers: [{ id: "s1", name: "Ada" }],
      }),
      session({
        id: "b",
        title: "Room only",
        roomId: "harbor-hall",
        speakers: [{ id: "s1", name: "Ada" }],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("names speaker double-booking with both sessions", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Opening Keynote",
        roomId: "harbor-hall",
        ...morning,
        speakers: [{ id: "s1", name: "Ada Lovelace" }],
      }),
      session({
        id: "b",
        title: "Platform Deep Dive",
        roomId: "compass-room",
        ...overlap,
        speakers: [{ id: "s1", name: "Ada Lovelace" }],
      }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "speaker_double_book",
      speakerId: "s1",
      speakerName: "Ada Lovelace",
      sessionIds: ["a", "b"],
      sessionTitles: ["Opening Keynote", "Platform Deep Dive"],
    });
    expect(conflicts[0].summary).toContain("Ada Lovelace");
    expect(conflicts[0].summary).toContain("Opening Keynote");
    expect(conflicts[0].summary).toContain("Platform Deep Dive");
  });

  it("names room overlap with both sessions", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Talk A",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...morning,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
      session({
        id: "b",
        title: "Talk B",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...overlap,
        speakers: [{ id: "s2", name: "Grace" }],
      }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "room_overlap",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      sessionIds: ["a", "b"],
      sessionTitles: ["Talk A", "Talk B"],
    });
    expect(conflicts[0].summary).toContain("Harbor Hall");
  });

  it("allows adjacent non-overlapping slots in the same room", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Talk A",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...morning,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
      session({
        id: "b",
        title: "Talk B",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...later,
        speakers: [{ id: "s2", name: "Grace" }],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("emits both speaker and room conflicts when both apply", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Talk A",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...morning,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
      session({
        id: "b",
        title: "Talk B",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        ...overlap,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
    ]);
    expect(conflicts.map((c) => c.kind).sort()).toEqual([
      "room_overlap",
      "speaker_double_book",
    ]);
  });

  it("does not conflict when times are missing on one side", () => {
    const conflicts = detectScheduleConflicts([
      session({
        id: "a",
        title: "Talk A",
        roomId: "harbor-hall",
        ...morning,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
      session({
        id: "b",
        title: "Talk B",
        roomId: "harbor-hall",
        startsAt: "2026-10-07T16:30:00.000Z",
        endsAt: null,
        speakers: [{ id: "s1", name: "Ada" }],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });
});
