import { describe, expect, it } from "vitest";

import { buildCalendarInviteIcs } from "../../shared/calendar-invite";

/** Golden ICS bodies validated for Gmail, Outlook, and Apple Calendar clients. */
const CREATE_REQUEST = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//ChartStead//Speaker Calendar//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:cal_session-create-1",
  "DTSTAMP:20261001T120000Z",
  "SEQUENCE:0",
  "STATUS:CONFIRMED",
  "SUMMARY:Opening Keynote",
  "ORGANIZER;CN=Pacific Open Data Summit Program:mailto:program@chartstead.eve",
  " nts",
  "ATTENDEE;CN=Ada Example;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRU",
  " E:mailto:ada@example.test",
  "DTSTART:20261008T160000Z",
  "DTEND:20261008T170000Z",
  "DESCRIPTION:Your session has been scheduled.",
  "LOCATION:Location pending",
  "CATEGORIES:Pacific Open Data Summit",
  "TRANSP:OPAQUE",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const UPDATE_REQUEST = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//ChartStead//Speaker Calendar//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:cal_session-create-1",
  "DTSTAMP:20261001T130000Z",
  "SEQUENCE:1",
  "STATUS:CONFIRMED",
  "SUMMARY:Opening Keynote",
  "ORGANIZER;CN=Pacific Open Data Summit Program:mailto:program@chartstead.eve",
  " nts",
  "ATTENDEE;CN=Ada Example;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRU",
  " E:mailto:ada@example.test",
  "DTSTART:20261008T180000Z",
  "DTEND:20261008T190000Z",
  "DESCRIPTION:Your session time was updated.",
  "LOCATION:Harbor Hall",
  "CATEGORIES:Pacific Open Data Summit",
  "TRANSP:OPAQUE",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const CANCEL_REQUEST = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//ChartStead//Speaker Calendar//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:CANCEL",
  "BEGIN:VEVENT",
  "UID:cal_session-create-1",
  "DTSTAMP:20261001T140000Z",
  "SEQUENCE:2",
  "STATUS:CANCELLED",
  "SUMMARY:Opening Keynote",
  "ORGANIZER;CN=Pacific Open Data Summit Program:mailto:program@chartstead.eve",
  " nts",
  "ATTENDEE;CN=Ada Example;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRU",
  " E:mailto:ada@example.test",
  "DTSTART:20261008T180000Z",
  "DTEND:20261008T190000Z",
  "DESCRIPTION:This session invitation is cancelled.",
  "LOCATION:Harbor Hall",
  "CATEGORIES:Pacific Open Data Summit",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

describe("calendar invite ICS golden fixtures", () => {
  it("matches Gmail/Outlook/Apple-compatible create REQUEST", () => {
    const ics = buildCalendarInviteIcs({
      uid: "cal_session-create-1",
      sequence: 0,
      method: "REQUEST",
      operation: "create",
      title: "Opening Keynote",
      description: "Your session has been scheduled.",
      location: "",
      locationPending: true,
      startsAt: "2026-10-08T16:00:00.000Z",
      endsAt: "2026-10-08T17:00:00.000Z",
      organizerEmail: "program@chartstead.events",
      organizerName: "Pacific Open Data Summit Program",
      attendee: { email: "ada@example.test", name: "Ada Example" },
      eventName: "Pacific Open Data Summit",
      dtStamp: "2026-10-01T12:00:00.000Z",
    });
    expect(ics).toBe(CREATE_REQUEST);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("LOCATION:Location pending");
    expect(ics).toContain("SEQUENCE:0");
  });

  it("matches update REQUEST with same UID and higher sequence", () => {
    const ics = buildCalendarInviteIcs({
      uid: "cal_session-create-1",
      sequence: 1,
      method: "REQUEST",
      operation: "update",
      title: "Opening Keynote",
      description: "Your session time was updated.",
      location: "Harbor Hall",
      locationPending: false,
      startsAt: "2026-10-08T18:00:00.000Z",
      endsAt: "2026-10-08T19:00:00.000Z",
      organizerEmail: "program@chartstead.events",
      organizerName: "Pacific Open Data Summit Program",
      attendee: { email: "ada@example.test", name: "Ada Example" },
      eventName: "Pacific Open Data Summit",
      dtStamp: "2026-10-01T13:00:00.000Z",
    });
    expect(ics).toBe(UPDATE_REQUEST);
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("UID:cal_session-create-1");
  });

  it("matches CANCEL with same UID and valid cancellation semantics", () => {
    const ics = buildCalendarInviteIcs({
      uid: "cal_session-create-1",
      sequence: 2,
      method: "CANCEL",
      operation: "cancel",
      title: "Opening Keynote",
      description: "This session invitation is cancelled.",
      location: "Harbor Hall",
      locationPending: false,
      startsAt: "2026-10-08T18:00:00.000Z",
      endsAt: "2026-10-08T19:00:00.000Z",
      organizerEmail: "program@chartstead.events",
      organizerName: "Pacific Open Data Summit Program",
      attendee: { email: "ada@example.test", name: "Ada Example" },
      eventName: "Pacific Open Data Summit",
      dtStamp: "2026-10-01T14:00:00.000Z",
    });
    expect(ics).toBe(CANCEL_REQUEST);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
  });
});
