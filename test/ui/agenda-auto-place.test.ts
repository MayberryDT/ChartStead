import { describe, expect, it } from "vitest";

import { planAutoPlace } from "../../shared/agenda-auto-place";
import type { EventRecord, OrganizerSession } from "../../shared/events";

const event = {
  startsOn: "2026-10-07",
  endsOn: "2026-10-07",
  rooms: [
    { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
    { id: "pending-room", name: "Pending Room", readiness: "pending" },
  ],
} satisfies Pick<EventRecord, "startsOn" | "endsOn" | "rooms">;

function session(overrides: Partial<OrganizerSession> & Pick<OrganizerSession, "id" | "title">): OrganizerSession {
  return {
    proposalId: null,
    courseCheckPlanId: "plan-1",
    format: "talk",
    trackId: "platform",
    trackName: "Platform",
    roomId: null,
    roomName: null,
    startsAt: null,
    endsAt: null,
    placementStatus: "unplaced",
    speakers: [
      { id: `speaker-${overrides.id}`, name: `Speaker ${overrides.id}`, email: `${overrides.id}@example.com`, role: "primary" },
    ],
    calendarUid: `cal_${overrides.id}`,
    calendarSequence: 0,
    calendarInviteRecorded: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Ticket 18 agenda auto-place planner", () => {
  it("proposes deterministic conflict-free slots and preserves manual placements by default", () => {
    const manual = session({
      id: "manual",
      title: "Manual Session",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T09:00:00.000Z",
      endsAt: "2026-10-07T09:45:00.000Z",
      placementStatus: "placed",
    });
    const later = session({ id: "later", title: "Later Session", createdAt: "2026-08-03T00:00:00.000Z" });
    const earlier = session({ id: "earlier", title: "Earlier Session", createdAt: "2026-08-02T00:00:00.000Z" });

    const first = planAutoPlace({
      event,
      sessions: [manual, later, earlier],
      selectedSessionIds: [manual.id, later.id, earlier.id],
      includeManual: false,
    });
    const second = planAutoPlace({
      event,
      sessions: [later, manual, earlier],
      selectedSessionIds: [earlier.id, manual.id, later.id],
      includeManual: false,
    });

    expect(first.manualPlacementPreserved).toEqual([manual.id]);
    expect(first.leftovers).toEqual([
      expect.objectContaining({
        sessionId: manual.id,
        reason: expect.stringContaining("already placed"),
      }),
    ]);
    expect(first.proposals.map((proposal) => proposal.sessionId)).toEqual(["earlier", "later"]);
    expect(first.proposals.map((proposal) => proposal.startsAt)).toEqual([
      "2026-10-07T10:00:00.000Z",
      "2026-10-07T11:00:00.000Z",
    ]);
    expect(second.proposals).toEqual(first.proposals);
  });

  it("reports no-capacity leftovers instead of hiding unplaced sessions", () => {
    const crowded = Array.from({ length: 18 }, (_, index) =>
      session({
        id: `existing-${index}`,
        title: `Existing ${index}`,
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        startsAt: `2026-10-07T${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}:00.000Z`,
        endsAt: new Date(
          Date.parse(
            `2026-10-07T${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}:00.000Z`,
          ) +
            30 * 60 * 1000,
        ).toISOString(),
        placementStatus: "placed",
      }),
    );
    const target = session({ id: "target", title: "Needs a Slot" });

    const plan = planAutoPlace({
      event,
      sessions: [...crowded, target],
      selectedSessionIds: [target.id],
      includeManual: false,
    });

    expect(plan.proposals).toEqual([]);
    expect(plan.leftovers).toEqual([
      expect.objectContaining({
        sessionId: target.id,
        reason: expect.stringContaining("No conflict-free 45-minute slot remains"),
      }),
    ]);
    expect(plan.assumptions).toContain("Rooms marked pending are excluded until they are ready.");
  });

  it("avoids speaker double-booking while scheduling candidates", () => {
    const speaker = { id: "speaker-shared", name: "Shared Speaker", email: "shared@example.com", role: "primary" as const };
    const fixed = session({
      id: "fixed",
      title: "Fixed Session",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T09:00:00.000Z",
      endsAt: "2026-10-07T09:45:00.000Z",
      placementStatus: "placed",
      speakers: [speaker],
    });
    const target = session({ id: "target", title: "Target", speakers: [speaker] });

    const plan = planAutoPlace({
      event,
      sessions: [fixed, target],
      selectedSessionIds: [target.id],
      includeManual: false,
    });

    expect(plan.proposals).toEqual([
      expect.objectContaining({
        sessionId: target.id,
        startsAt: "2026-10-07T10:00:00.000Z",
      }),
    ]);
  });
});
