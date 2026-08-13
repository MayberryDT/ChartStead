import { describe, expect, it } from "vitest";

import type { PublicProgramSession } from "../../shared/events";
import {
  assertPublicProgramPayloadIsSafe,
  buildCalendarAddTargets,
  buildSessionIcs,
  filterPublicSessions,
  toIcsUtc,
} from "../../shared/public-program";

function session(
  partial: Partial<PublicProgramSession> & Pick<PublicProgramSession, "id" | "title">,
): PublicProgramSession {
  return {
    description: "Abstract",
    format: "talk",
    trackId: "platform",
    trackName: "Platform",
    roomId: "harbor-hall",
    roomName: "Harbor Hall",
    roomPending: false,
    startsAt: "2026-10-07T15:00:00.000Z",
    endsAt: "2026-10-07T15:45:00.000Z",
    day: "2026-10-07",
    calendarUid: `cal_${partial.id}`,
    calendarSequence: 0,
    speakers: [
      {
        id: "sp-1",
        name: "Ada Lovelace",
        title: "Program Director",
        company: "Analytical Engines",
        role: "primary",
      },
    ],
    ...partial,
  };
}

describe("public program helpers", () => {
  it("filters sessions by day, track, room, format, and speaker", () => {
    const sessions = [
      session({ id: "a", title: "A", trackId: "platform", day: "2026-10-07" }),
      session({
        id: "b",
        title: "B",
        trackId: "community",
        day: "2026-10-08",
        roomId: null,
        roomName: null,
        format: "workshop",
        speakers: [{ id: "sp-2", name: "Grace", title: "", company: "", role: "primary" }],
      }),
      session({
        id: "c",
        title: "C",
        day: null,
        startsAt: null,
        endsAt: null,
        roomId: null,
        roomName: null,
      }),
    ];

    expect(filterPublicSessions(sessions, { day: "2026-10-07" }).map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(filterPublicSessions(sessions, { day: "tbd" }).map((s) => s.id)).toEqual(["c"]);
    expect(filterPublicSessions(sessions, { trackId: "community" }).map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(filterPublicSessions(sessions, { roomId: "tbd" }).map((s) => s.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterPublicSessions(sessions, { format: "workshop" }).map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(filterPublicSessions(sessions, { speakerId: "sp-2" }).map((s) => s.id)).toEqual([
      "b",
    ]);
  });

  it("matches title and speaker keywords and composes public facets", () => {
    const sessions = [
      session({
        id: "a",
        title: "Harbor data trusts",
        trackId: "platform",
        format: "keynote",
        roomId: "harbor-hall",
        speakers: [
          {
            id: "sp-1",
            name: "Ada Lovelace",
            title: "Program Director",
            company: "Analytical Engines",
            role: "primary",
          },
        ],
      }),
      session({
        id: "b",
        title: "Community maps",
        trackId: "community",
        format: "talk",
        roomId: "compass-room",
        speakers: [
          {
            id: "sp-2",
            name: "Grace Hopper",
            title: "Systems Lead",
            company: "Compiler Works",
            role: "primary",
          },
        ],
      }),
    ];

    expect(filterPublicSessions(sessions, { query: "harbor data" }).map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(filterPublicSessions(sessions, { query: "grace hopper" }).map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(
      filterPublicSessions(sessions, {
        query: "ada",
        trackId: "platform",
        format: "keynote",
        roomId: "harbor-hall",
      }).map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      filterPublicSessions(sessions, {
        query: "ada",
        trackId: "community",
        format: "keynote",
        roomId: "harbor-hall",
      }),
    ).toEqual([]);
  });

  it("builds ICS with stable UID and sequence", () => {
    const ics = buildSessionIcs({
      uid: "cal_session_1",
      sequence: 2,
      title: "Opening Keynote",
      description: "Welcome",
      location: "Harbor Hall",
      startsAt: "2026-10-07T15:00:00.000Z",
      endsAt: "2026-10-07T15:45:00.000Z",
      eventName: "Pacific Open Data Summit 2026",
    });

    expect(ics).toContain("UID:cal_session_1");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain(`DTSTART:${toIcsUtc("2026-10-07T15:00:00.000Z")}`);
    expect(ics).toContain("SUMMARY:Opening Keynote");
    expect(ics).toContain("LOCATION:Harbor Hall");
  });

  it("builds Luma-style calendar targets with Google, Outlook, webcal, and ICS URL", () => {
    const targets = buildCalendarAddTargets({
      origin: "https://chartstead.example",
      icsPath: "/api/events/evt/program/sessions/ses-1/calendar.ics",
      title: "Opening Keynote",
      description: "Welcome",
      location: "Harbor Hall",
      startsAt: "2026-10-07T15:00:00.000Z",
      endsAt: "2026-10-07T15:45:00.000Z",
    });

    expect(targets.icsUrl).toBe(
      "https://chartstead.example/api/events/evt/program/sessions/ses-1/calendar.ics",
    );
    expect(targets.webcalUrl).toBe(
      "webcal://chartstead.example/api/events/evt/program/sessions/ses-1/calendar.ics",
    );
    expect(targets.googleUrl).toContain("calendar.google.com/calendar/render");
    expect(targets.googleUrl).toContain("action=TEMPLATE");
    expect(targets.googleUrl).toContain("Opening+Keynote");
    expect(targets.outlookUrl).toContain("outlook.live.com/calendar");
    expect(targets.outlookUrl).toContain("rru=addevent");
    expect(targets.hasSchedule).toBe(true);

    const tbd = buildCalendarAddTargets({
      origin: "https://chartstead.example",
      icsPath: "/api/events/evt/program/sessions/ses-2/calendar.ics",
      title: "Workshop",
      description: "Later",
      location: "Location pending",
      startsAt: null,
      endsAt: null,
    });
    expect(tbd.googleUrl).toBeNull();
    expect(tbd.outlookUrl).toBeNull();
    expect(tbd.icsUrl).toContain("ses-2/calendar.ics");
    expect(tbd.hasSchedule).toBe(false);
  });

  it("flags private organizer fields in a public payload", () => {
    expect(
      assertPublicProgramPayloadIsSafe({
        sessions: [{ title: "Safe" }],
      }),
    ).toEqual([]);
    expect(
      assertPublicProgramPayloadIsSafe({
        committeeNote: "secret",
        speakerEmail: "a@b.com",
      }),
    ).toEqual(expect.arrayContaining(["committeeNote", "speakerEmail"]));
  });
});
