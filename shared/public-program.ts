import type {
  PublicEmbedFieldVisibility,
  PublicEmbedTheme,
  PublicEmbedWidget,
  PublicProgramFilters,
  PublicProgramSession,
  PublicProgramSpeaker,
  SessionContentStatus,
} from "./events";
import { placementStatus } from "./schedule-conflicts";

export const PUBLIC_EMBED_WIDGETS: PublicEmbedWidget[] = [
  "sessions",
  "speakers",
  "agenda",
  "itinerary",
  "speaker-gallery",
];

export const PUBLIC_EMBED_THEMES: PublicEmbedTheme[] = ["light", "dark", "minimal"];

export const DEFAULT_PUBLIC_EMBED_FIELDS: PublicEmbedFieldVisibility = {
  title: true,
  dateTime: true,
  room: true,
  track: true,
  speakers: true,
  description: true,
  format: true,
  headshots: true,
  biography: true,
};

export function isPublicEmbedWidget(value: unknown): value is PublicEmbedWidget {
  return typeof value === "string" && PUBLIC_EMBED_WIDGETS.includes(value as PublicEmbedWidget);
}

export function normalizePublicEmbedTheme(value: unknown): PublicEmbedTheme {
  return typeof value === "string" && PUBLIC_EMBED_THEMES.includes(value as PublicEmbedTheme)
    ? (value as PublicEmbedTheme)
    : "light";
}

export function normalizePublicEmbedFields(
  value: Partial<PublicEmbedFieldVisibility> | null | undefined,
): PublicEmbedFieldVisibility {
  return {
    ...DEFAULT_PUBLIC_EMBED_FIELDS,
    ...(value ?? {}),
  };
}

export function normalizePublicProgramFilters(value: unknown): PublicProgramFilters {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    query: typeof input.query === "string" && input.query.trim() ? input.query.trim() : undefined,
    day: typeof input.day === "string" && input.day.trim() ? input.day.trim() : undefined,
    trackId: typeof input.trackId === "string" && input.trackId.trim() ? input.trackId.trim() : undefined,
    roomId: typeof input.roomId === "string" && input.roomId.trim() ? input.roomId.trim() : undefined,
    format: typeof input.format === "string" && input.format.trim() ? input.format.trim() : undefined,
    speakerId: typeof input.speakerId === "string" && input.speakerId.trim() ? input.speakerId.trim() : undefined,
  };
}

export type PublishabilityReason =
  | "unplaced"
  | "missing_title"
  | "missing_description"
  | "missing_speaker"
  | "private"
  | "content_not_approved";

export interface PublishabilityResult {
  publishable: boolean;
  reasons: PublishabilityReason[];
  placement: ReturnType<typeof placementStatus>;
}

/** Valid public subset rules for Program Publication Course Check. */
export function assessSessionPublishability(
  session: Pick<
    PublicProgramSession,
    | "title"
    | "description"
    | "roomId"
    | "startsAt"
    | "endsAt"
    | "speakers"
    | "contentStatus"
  > & { private?: boolean; contentStatus?: SessionContentStatus },
): PublishabilityResult {
  const placement = placementStatus(session);
  const reasons: PublishabilityReason[] = [];
  if (session.private) reasons.push("private");
  if (session.contentStatus && session.contentStatus !== "approved") {
    reasons.push("content_not_approved");
  }
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
  contentStatuses?: Readonly<Record<string, SessionContentStatus>>,
): { sessions: PublicProgramSession[]; speakers: PublicProgramSpeaker[] } {
  const included = sessions.filter(
    (session) =>
      assessSessionPublishability({
        ...session,
        contentStatus: contentStatuses ? contentStatuses[session.id] : undefined,
      }).publishable,
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
      .map((speaker) => ({
        id: speaker.id,
        name: speaker.name,
        title: speaker.title,
        company: speaker.company,
        role: speaker.role,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function filterPublicSessions(
  sessions: PublicProgramSession[],
  filters: PublicProgramFilters,
  timeZone = "UTC",
): PublicProgramSession[] {
  const queryTokens = (filters.query ?? "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return sessions.filter((session) => {
    if (queryTokens.length > 0) {
      const searchable = [
        session.title,
        ...session.speakers.flatMap((speaker) => [
          speaker.name,
          speaker.title,
          speaker.company,
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!queryTokens.every((token) => searchable.includes(token))) return false;
    }
    if (filters.day) {
      const sessionDay = publicProgramDay(session.startsAt, session.day, timeZone);
      if (filters.day === "tbd") {
        if (sessionDay !== null) return false;
      } else if (sessionDay !== filters.day) {
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

export type PublicProgramDay = {
  day: string;
  sessions: PublicProgramSession[];
};

/** Resolve a scheduled session to the event's calendar day. */
export function publicProgramDay(
  startsAt: string | null,
  fallbackDay: string | null,
  timeZone = "UTC",
): string | null {
  if (fallbackDay) return fallbackDay;
  if (!startsAt) return fallbackDay;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(startsAt));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    return year && month && day ? `${year}-${month}-${day}` : fallbackDay;
  } catch {
    return fallbackDay;
  }
}

function comparePublicSessions(
  a: PublicProgramSession,
  b: PublicProgramSession,
): number {
  if (a.startsAt && b.startsAt) {
    const time = a.startsAt.localeCompare(b.startsAt);
    if (time !== 0) return time;
  } else if (a.startsAt) {
    return -1;
  } else if (b.startsAt) {
    return 1;
  }
  const title = a.title.localeCompare(b.title);
  return title !== 0 ? title : a.id.localeCompare(b.id);
}

/** Group the published program into chronological day sections, with TBD last. */
export function groupPublicSessionsByDay(
  sessions: PublicProgramSession[],
  timeZone = "UTC",
): PublicProgramDay[] {
  const groups = new Map<string, PublicProgramSession[]>();
  for (const session of sessions) {
    const day = publicProgramDay(session.startsAt, session.day, timeZone) ?? "tbd";
    const group = groups.get(day);
    if (group) group.push(session);
    else groups.set(day, [session]);
  }

  return Array.from(groups, ([day, groupedSessions]) => ({
    day,
    sessions: groupedSessions.sort(comparePublicSessions),
  })).sort((a, b) => {
    if (a.day === "tbd") return 1;
    if (b.day === "tbd") return -1;
    return a.day.localeCompare(b.day);
  });
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
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export interface SessionIcsInput {
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  eventName: string;
}

function buildSessionIcsLines(input: SessionIcsInput, dtStamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
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
  return lines;
}

export function buildCombinedIcs(inputs: SessionIcsInput[]): string {
  const now = toIcsUtc(new Date().toISOString());
  const orderedInputs = [...inputs].sort((a, b) => {
    if (a.startsAt && b.startsAt) {
      const time = a.startsAt.localeCompare(b.startsAt);
      if (time !== 0) return time;
    } else if (a.startsAt) {
      return -1;
    } else if (b.startsAt) {
      return 1;
    }
    return a.uid.localeCompare(b.uid);
  });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChartStead//Public Program//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...orderedInputs.flatMap((input) => buildSessionIcsLines(input, now)),
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function buildSessionIcs(input: SessionIcsInput): string {
  return buildCombinedIcs([input]);
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
