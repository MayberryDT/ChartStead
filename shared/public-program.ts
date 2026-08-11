import type {
  PublicProgramFilters,
  PublicProgramSession,
  PublicProgramSpeaker,
} from "./events";
import { placementStatus } from "./schedule-conflicts";

export type PublishabilityReason =
  | "unplaced"
  | "missing_title"
  | "missing_description"
  | "missing_speaker"
  | "private";

export interface PublishabilityResult {
  publishable: boolean;
  reasons: PublishabilityReason[];
  placement: ReturnType<typeof placementStatus>;
}

/** Valid public subset rules for Program Publication Course Check. */
export function assessSessionPublishability(
  session: Pick<
    PublicProgramSession,
    "title" | "description" | "roomId" | "startsAt" | "endsAt" | "speakers"
  > & { private?: boolean },
): PublishabilityResult {
  const placement = placementStatus(session);
  const reasons: PublishabilityReason[] = [];
  if (session.private) reasons.push("private");
  if (placement === "unplaced") reasons.push("unplaced");
  if (!session.title.trim()) reasons.push("missing_title");
  if (!session.description.trim()) reasons.push("missing_description");
  if (!session.speakers.some((speaker) => speaker.name.trim().length > 0)) {
    reasons.push("missing_speaker");
  }
  return {
    publishable: reasons.length === 0,
    reasons,
    placement,
  };
}

export function selectValidPublicSubset(
  sessions: PublicProgramSession[],
  speakers: PublicProgramSpeaker[],
): { sessions: PublicProgramSession[]; speakers: PublicProgramSpeaker[] } {
  const included = sessions.filter(
    (session) => assessSessionPublishability(session).publishable,
  );
  const ids = new Set(included.map((session) => session.id));
  return {
    sessions: included,
    speakers: speakers
      .map((speaker) => ({
        ...speaker,
        sessionIds: speaker.sessionIds.filter((id) => ids.has(id)),
      }))
      .filter((speaker) => speaker.sessionIds.length > 0),
  };
}

export function sessionPublicFingerprint(
  session: PublicProgramSession,
): Record<string, unknown> {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    format: session.format,
    trackId: session.trackId,
    roomId: session.roomId,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    calendarUid: session.calendarUid,
    calendarSequence: session.calendarSequence,
    speakers: session.speakers
      .map((speaker) => ({ id: speaker.id, name: speaker.name, role: speaker.role }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function filterPublicSessions(
  sessions: PublicProgramSession[],
  filters: PublicProgramFilters,
): PublicProgramSession[] {
  return sessions.filter((session) => {
    if (filters.day) {
      if (filters.day === "tbd") {
        if (session.day !== null) return false;
      } else if (session.day !== filters.day) {
        return false;
      }
    }
    if (filters.trackId && session.trackId !== filters.trackId) return false;
    if (filters.roomId) {
      if (filters.roomId === "tbd") {
        if (session.roomId !== null) return false;
      } else if (session.roomId !== filters.roomId) {
        return false;
      }
    }
    if (filters.format && session.format !== filters.format) return false;
    if (
      filters.speakerId &&
      !session.speakers.some((speaker) => speaker.id === filters.speakerId)
    ) {
      return false;
    }
    return true;
  });
}

export function filterPublicSpeakers(
  speakers: PublicProgramSpeaker[],
  visibleSessionIds: Set<string>,
): PublicProgramSpeaker[] {
  return speakers.filter((speaker) =>
    speaker.sessionIds.some((sessionId) => visibleSessionIds.has(sessionId)),
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format an ISO timestamp as UTC ICS DATE-TIME (YYYYMMDDTHHMMSSZ). */
export function toIcsUtc(iso: string): string {
  const date = new Date(iso);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildSessionIcs(input: {
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  eventName: string;
}): string {
  const now = toIcsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChartStead//Public Program//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    `SEQUENCE:${Math.max(0, input.sequence)}`,
    `SUMMARY:${icsEscape(input.title)}`,
  ];

  if (input.startsAt && input.endsAt) {
    lines.push(`DTSTART:${toIcsUtc(input.startsAt)}`);
    lines.push(`DTEND:${toIcsUtc(input.endsAt)}`);
  } else {
    lines.push(`DESCRIPTION:${icsEscape(`${input.description}\n\nTime: TBD`.trim())}`);
  }

  if (input.startsAt && input.endsAt && input.description) {
    lines.push(`DESCRIPTION:${icsEscape(input.description)}`);
  }

  if (input.location) {
    lines.push(`LOCATION:${icsEscape(input.location)}`);
  }

  lines.push(`CATEGORIES:${icsEscape(input.eventName)}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export interface CalendarAddTargets {
  /** Stable HTTPS ICS feed URL (copy / subscribe). */
  icsUrl: string;
  /** webcal: scheme for system calendar apps. */
  webcalUrl: string;
  /** Google Calendar one-shot template URL, or null when times are TBD. */
  googleUrl: string | null;
  /** Outlook.com compose deep link, or null when times are TBD. */
  outlookUrl: string | null;
  hasSchedule: boolean;
}

function toGoogleDates(startsAt: string, endsAt: string): string {
  return `${toIcsUtc(startsAt)}/${toIcsUtc(endsAt)}`;
}

/**
 * Build Luma-style calendar targets for a public session.
 * `icsPath` is a root-absolute path (e.g. /api/events/.../calendar.ics).
 * `origin` is the public site origin (https://host) used to form absolute URLs.
 */
export function buildCalendarAddTargets(input: {
  origin: string;
  icsPath: string;
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
}): CalendarAddTargets {
  const origin = input.origin.replace(/\/$/, "");
  const path = input.icsPath.startsWith("/") ? input.icsPath : `/${input.icsPath}`;
  const icsUrl = `${origin}${path}`;
  const webcalUrl = icsUrl.replace(/^https:/i, "webcal:").replace(/^http:/i, "webcal:");
  const hasSchedule = Boolean(input.startsAt && input.endsAt);

  if (!hasSchedule || !input.startsAt || !input.endsAt) {
    return {
      icsUrl,
      webcalUrl,
      googleUrl: null,
      outlookUrl: null,
      hasSchedule: false,
    };
  }

  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", input.title);
  google.searchParams.set("dates", toGoogleDates(input.startsAt, input.endsAt));
  if (input.description) google.searchParams.set("details", input.description);
  if (input.location) google.searchParams.set("location", input.location);

  const outlook = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  outlook.searchParams.set("path", "/calendar/action/compose");
  outlook.searchParams.set("rru", "addevent");
  outlook.searchParams.set("subject", input.title);
  outlook.searchParams.set("body", input.description);
  outlook.searchParams.set("startdt", input.startsAt);
  outlook.searchParams.set("enddt", input.endsAt);
  if (input.location) outlook.searchParams.set("location", input.location);

  return {
    icsUrl,
    webcalUrl,
    googleUrl: google.toString(),
    outlookUrl: outlook.toString(),
    hasSchedule: true,
  };
}

export function assertPublicProgramPayloadIsSafe(payload: unknown): string[] {
  const leaks: string[] = [];
  const text = JSON.stringify(payload);
  const forbidden = [
    "committeeNote",
    "privateNote",
    "courseCheckPlanId",
    "portalToken",
    "signedToken",
    "onboarding",
    "speakerEmail",
    "@chartstead.invalid",
  ];
  for (const key of forbidden) {
    if (text.includes(key)) leaks.push(key);
  }
  // Email-shaped values in public JSON are leaks unless they're only in ICS/mailto later.
  if (/"email"\s*:/.test(text)) leaks.push("email");
  return leaks;
}
