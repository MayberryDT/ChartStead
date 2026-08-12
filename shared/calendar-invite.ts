/** RFC 5545 calendar invite serializer for speaker delivery (REQUEST / CANCEL). */

export type CalendarInviteMethod = "REQUEST" | "CANCEL";
export type CalendarInviteOperation = "create" | "update" | "cancel";

export interface CalendarInviteAttendee {
  email: string;
  name: string;
}

export interface BuildCalendarInviteInput {
  uid: string;
  sequence: number;
  method: CalendarInviteMethod;
  operation: CalendarInviteOperation;
  title: string;
  description: string;
  location: string;
  locationPending: boolean;
  startsAt: string | null;
  endsAt: string | null;
  organizerEmail: string;
  organizerName: string;
  attendee: CalendarInviteAttendee;
  eventName: string;
  /** Fixed DTSTAMP for golden fixtures / frozen payloads. */
  dtStamp?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
}

export function toIcsUtc(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

function formatAttendee(attendee: CalendarInviteAttendee): string {
  const cn = icsEscape(attendee.name || attendee.email);
  return `ATTENDEE;CN=${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email.trim().toLowerCase()}`;
}

function formatOrganizer(name: string, email: string): string {
  return `ORGANIZER;CN=${icsEscape(name)}:mailto:${email.trim().toLowerCase()}`;
}

export function resolveCalendarLocation(input: {
  roomName: string | null;
  locationPending: boolean;
}): string {
  if (input.roomName?.trim()) return input.roomName.trim();
  if (input.locationPending) return "Location pending";
  return "";
}

export function methodForOperation(operation: CalendarInviteOperation): CalendarInviteMethod {
  return operation === "cancel" ? "CANCEL" : "REQUEST";
}

export function statusForOperation(
  operation: CalendarInviteOperation,
): "CONFIRMED" | "CANCELLED" {
  return operation === "cancel" ? "CANCELLED" : "CONFIRMED";
}

/**
 * Build a single-attendee VCALENDAR invite suitable for Gmail, Outlook, and Apple Calendar.
 * Create and update use METHOD:REQUEST with increasing SEQUENCE.
 * Cancel uses METHOD:CANCEL and STATUS:CANCELLED with the same UID.
 */
export function buildCalendarInviteIcs(input: BuildCalendarInviteInput): string {
  const method = input.method;
  const status = input.status ?? statusForOperation(input.operation);
  const dtStamp = input.dtStamp
    ? toIcsUtc(input.dtStamp)
    : toIcsUtc(new Date().toISOString());
  const location =
    input.location ||
    (input.locationPending ? "Location pending" : "");
  const descriptionParts = [input.description.trim()];
  if (!input.startsAt || !input.endsAt) {
    descriptionParts.push("Time: TBD");
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChartStead//Speaker Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
    `SEQUENCE:${Math.max(0, input.sequence)}`,
    `STATUS:${status}`,
    `SUMMARY:${icsEscape(input.title)}`,
    formatOrganizer(input.organizerName, input.organizerEmail),
    formatAttendee(input.attendee),
  ];

  if (input.startsAt && input.endsAt) {
    lines.push(`DTSTART:${toIcsUtc(input.startsAt)}`);
    lines.push(`DTEND:${toIcsUtc(input.endsAt)}`);
  }

  const description = descriptionParts.filter(Boolean).join("\n\n");
  if (description) {
    lines.push(`DESCRIPTION:${icsEscape(description)}`);
  }
  if (location) {
    lines.push(`LOCATION:${icsEscape(location)}`);
  }
  lines.push(`CATEGORIES:${icsEscape(input.eventName)}`);
  if (method === "REQUEST") {
    lines.push("TRANSP:OPAQUE");
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function calendarInviteAttachmentFilename(operation: CalendarInviteOperation): string {
  if (operation === "cancel") return "invite-cancel.ics";
  if (operation === "update") return "invite-update.ics";
  return "invite.ics";
}
