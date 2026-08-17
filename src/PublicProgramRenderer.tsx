import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Bookmark, RotateCcw, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import type {
  PublicEmbedFieldVisibility,
  PublicEmbedTheme,
  PublicEmbedWidget,
  PublicProgramFilters,
  PublicProgramResponse,
  PublicProgramSession,
  PublicProgramSpeaker,
} from "../shared/events";
import {
  buildCalendarAddTargets,
  DEFAULT_PUBLIC_EMBED_FIELDS,
  filterPublicSessions,
  filterPublicSpeakers,
  groupPublicSessionsByDay,
} from "../shared/public-program";
import { publicProgramCalendarExportUrl, publicProgramCalendarUrl } from "./api";
import { AppSelect } from "./AppSelect";

function formatClock(iso: string | null): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}

const premiumSpring = { type: "spring" as const, duration: 0.3, bounce: 0 };

function useInspectorMotion() {
  const reduceMotion = useReducedMotion();
  return {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, x: 34, filter: "blur(3px)" },
    animate: { opacity: 1, x: 0, filter: "blur(0px)" },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: 18, filter: "blur(2px)" },
    transition: reduceMotion ? { duration: 0.1 } : premiumSpring,
  };
}

function useInspectorLayoutMotion(
  surface: "sessions" | "agenda" | "itinerary",
  open: boolean,
) {
  const reduceMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(
    () => typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const closedPadding = surface === "sessions" ? (viewportWidth <= 700 ? 16 : 28) : 0;
  const openPadding = viewportWidth <= 900
    ? closedPadding
    : surface === "sessions"
      ? viewportWidth <= 1200 ? 386 : 418
      : viewportWidth <= 1200 ? 360 : 390;

  return {
    initial: false as const,
    animate: { paddingRight: open ? openPadding : closedPadding },
    transition: reduceMotion ? { duration: 0 } : premiumSpring,
  };
}

function trackClass(trackId: string): string {
  if (!trackId) return "track-1";
  const known = [
    "platform",
    "program-ops",
    "design-systems",
    "community",
    "agents",
    "models",
    "governance",
    "data",
    "capacity",
    "economy",
    "environment",
    "privacy",
    "keynote",
    "technology",
    "applications",
  ];
  if (known.includes(trackId)) return `track-${trackId}`;
  const index = (trackId.charCodeAt(0) % 4) + 1;
  return `track-${index}`;
}

function roomLabel(session: PublicProgramSession): string {
  if (session.roomName) {
    return session.roomPending ? `${session.roomName} (pending)` : session.roomName;
  }
  return "Location pending";
}

function timeLabel(session: PublicProgramSession): string {
  if (!session.startsAt) return "TBD";
  const end = session.endsAt ? ` – ${formatClock(session.endsAt)}` : "";
  return `${formatClock(session.startsAt)}${end}`;
}

function dateTimeLabel(session: PublicProgramSession): string {
  return `${session.day ? dayLabel(session.day) : "Date TBD"} · ${timeLabel(session)}`;
}

function truncateDescription(description: string, limit = 180): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trimEnd()}…`;
}

function speakerDetails(speaker: PublicProgramSession["speakers"][number]): string {
  const details = [speaker.title, speaker.company]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ");
  return details || "Title/company not provided";
}

function speakerInitials(speaker: PublicProgramSpeaker): string {
  return speaker.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function speakerSubtitle(speaker: PublicProgramSpeaker): string {
  const detail = [speaker.title, speaker.company]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ");
  return detail || "Professional details pending";
}

function speakerSortKey(speaker: PublicProgramSpeaker): string {
  const parts = speaker.name.trim().split(/\s+/);
  const last = parts.at(-1) ?? speaker.name;
  return `${last.toLocaleLowerCase()} ${speaker.name.toLocaleLowerCase()}`;
}

function sessionSpeakerSubtitle(
  sessionTitle: string,
  sessionSpeaker: PublicProgramSession["speakers"][number],
  fullSpeaker: PublicProgramSpeaker | null | undefined,
): string {
  const role = fullSpeaker?.title ?? sessionSpeaker.title;
  const company = fullSpeaker?.company ?? sessionSpeaker.company;
  const roleLooksLikeSession =
    Boolean(role) &&
    (role === sessionTitle ||
      sessionTitle.startsWith(role!.slice(0, Math.min(24, role!.length))));
  return [roleLooksLikeSession ? null : role, company].filter(Boolean).join(" · ") || "Speaker";
}

function speakerSessionMeta(session: PublicProgramSession): string {
  return `${dateTimeLabel(session)} · ${roomLabel(session)}`;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function AgendaIcon({ name }: { name: "bookmark" | "calendar" | "keynote" | "panel" | "workshop" | "meal" | "presentation" | "lightning" | "reception" | "pin" | "person" | "search" }) {
  const paths: Record<typeof name, ReactNode> = {
    bookmark: <path d="M7 4.75h10a1 1 0 0 1 1 1V21l-6-3.8L6 21V5.75a1 1 0 0 1 1-1Z" />,
    calendar: <><rect x="5" y="7" width="14" height="13" rx="1" /><path d="M8 4v5m8-5v5M5 11h14" /></>,
    keynote: <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3Z" />,
    panel: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6m-3 0c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" /></>,
    workshop: <><path d="m5 4 15 15M15 4l-3 3 5 5 3-3M4 20l5-5" /><circle cx="6" cy="6" r="2" /></>,
    meal: <><path d="M6 3v8m3-8v8M6 7h3m-1.5 4v10M16 3v18m0-18c3 2 3 7 0 9" /></>,
    presentation: <><path d="M4 5h16v11H4zM8 20l4-4 4 4" /><path d="m8 12 2-2 2 1 3-3 2 2" /></>,
    lightning: <path d="m14 2-8 12h6l-2 8 8-12h-6l2-8Z" />,
    reception: <><path d="M5 4h5l-1 7c-.2 1.5-1 2.5-2.5 3v5m-3 1h6M14 4h5l-1 7c-.2 1.5-1 2.5-2.5 3v5m-3 1h6" /></>,
    pin: <><path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    person: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function agendaKind(format: string): { label: string; icon: Parameters<typeof AgendaIcon>[0]["name"]; tone: string } {
  const value = format.toLowerCase();
  if (value.includes("keynote")) return { label: "Keynote", icon: "keynote", tone: "blue" };
  if (value.includes("panel")) return { label: "Panel", icon: "panel", tone: "purple" };
  if (value.includes("workshop")) return { label: "Workshop", icon: "workshop", tone: "green" };
  if (value.includes("lunch") || value.includes("meal")) return { label: "Lunch", icon: "meal", tone: "amber" };
  if (value.includes("lightning")) return { label: "Lightning talks", icon: "lightning", tone: "green" };
  if (value.includes("reception")) return { label: "Reception", icon: "reception", tone: "slate" };
  if (value.includes("registration")) return { label: "Registration", icon: "calendar", tone: "slate" };
  return { label: "Presentation", icon: "presentation", tone: "blue" };
}

function sessionDuration(session: PublicProgramSession): string {
  if (!session.startsAt || !session.endsAt) return "Duration TBD";
  const minutes = Math.max(
    0,
    Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000),
  );
  return `${minutes} min`;
}

function sessionSpeakerInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function widgetLabel(widget: PublicEmbedWidget | "program"): string {
  switch (widget) {
    case "sessions":
      return "Sessions list";
    case "speakers":
      return "Speakers list";
    case "agenda":
      return "Agenda";
    case "itinerary":
      return "Schedule itinerary";
    case "speaker-gallery":
      return "Speaker gallery";
    default:
      return "Public program";
  }
}

function eventDateRange(startsOn: string, endsOn: string): string {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(start);
  return `${month} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export function PublicProgramRenderer({
  data,
  mode = "page",
  widget = "program",
  theme = "light",
  fieldVisibility,
  filters: controlledFilters,
  onFiltersChange,
  selectedSessionId,
  onSelectSession,
  initialItinerarySessionIds = [],
  itinerarySessionIds: controlledItinerarySessionIds,
  onItinerarySessionIdsChange,
  selectedSpeakerId: controlledSelectedSpeakerId,
  onSelectSpeaker,
  itineraryPending = false,
  itineraryError = null,
}: {
  data: PublicProgramResponse;
  mode?: "page" | "embed";
  widget?: PublicEmbedWidget | "program";
  theme?: PublicEmbedTheme;
  fieldVisibility?: Partial<PublicEmbedFieldVisibility>;
  filters?: PublicProgramFilters;
  onFiltersChange?: (filters: PublicProgramFilters) => void;
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string | null) => void;
  initialItinerarySessionIds?: string[];
  itinerarySessionIds?: string[];
  onItinerarySessionIdsChange?: (sessionIds: string[]) => void;
  selectedSpeakerId?: string | null;
  onSelectSpeaker?: (speakerId: string | null) => void;
  itineraryPending?: boolean;
  itineraryError?: string | null;
}) {
  const [internalFilters, setInternalFilters] = useState<PublicProgramFilters>({});
  const currentWidget = widget ?? "program";
  const filters = controlledFilters ?? internalFilters;
  const fields = { ...DEFAULT_PUBLIC_EMBED_FIELDS, ...(fieldVisibility ?? {}) };
  const setFilters = (updater: (current: PublicProgramFilters) => PublicProgramFilters) => {
    const next = updater(filters);
    if (onFiltersChange) onFiltersChange(next);
    else setInternalFilters(next);
  };
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [internalSelectedSpeakerId, setInternalSelectedSpeakerId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [internalItinerarySessionIds, setInternalItinerarySessionIds] = useState<Set<string>>(
    () => new Set(initialItinerarySessionIds),
  );
  const [expandedSpeakerBioIds, setExpandedSpeakerBioIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedId = selectedSessionId !== undefined ? selectedSessionId : internalSelected;
  const selectedSpeakerId = controlledSelectedSpeakerId !== undefined
    ? controlledSelectedSpeakerId
    : internalSelectedSpeakerId;
  const itinerarySessionIds = controlledItinerarySessionIds !== undefined
    ? new Set(controlledItinerarySessionIds)
    : internalItinerarySessionIds;

  const selectSession = (sessionId: string | null) => {
    if (sessionId) setScheduleOpen(false);
    if (onSelectSession) onSelectSession(sessionId);
    else setInternalSelected(sessionId);
  };

  const selectSpeaker = (speakerId: string | null) => {
    if (onSelectSpeaker) onSelectSpeaker(speakerId);
    else setInternalSelectedSpeakerId(speakerId);
  };

  const changeItinerary = (next: Set<string>) => {
    if (onItinerarySessionIdsChange) onItinerarySessionIdsChange(Array.from(next));
    else setInternalItinerarySessionIds(next);
  };

  const toggleDescription = (sessionId: string) => {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const sessions = useMemo(
    () => filterPublicSessions(data.sessions, filters, data.event.timezone ?? "UTC"),
    [data.event.timezone, data.sessions, filters],
  );
  const visibleIds = useMemo(
    () => new Set(sessions.map((session) => session.id)),
    [sessions],
  );
  const speakers = useMemo(
    () =>
      currentWidget === "speaker-gallery"
        ? data.speakers.filter((speaker) => {
            if (!speaker.sessionIds.some((id) => visibleIds.has(id))) return false;
            const query = filters.query?.trim().toLocaleLowerCase();
            if (filters.role && speaker.title !== filters.role) return false;
            return !query || [speaker.name, speaker.title, speaker.company]
              .filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
          })
        : filterPublicSpeakers(data.speakers, visibleIds).sort((a, b) =>
            speakerSortKey(a).localeCompare(speakerSortKey(b)),
          ),
    [currentWidget, data.speakers, filters.query, filters.role, visibleIds],
  );

  const days = useMemo(() => {
    const set = new Set<string>();
    let hasTbd = false;
    for (const session of data.sessions) {
      if (session.day) set.add(session.day);
      else hasTbd = true;
    }
    const list = Array.from(set).sort();
    if (hasTbd) list.push("tbd");
    return list;
  }, [data.sessions]);

  const formats = useMemo(() => {
    return Array.from(new Set(data.sessions.map((session) => session.format))).sort();
  }, [data.sessions]);

  const selected =
    sessions.find((session) => session.id === selectedId) ??
    data.sessions.find((session) => session.id === selectedId) ??
    null;
  const selectedSpeaker =
    speakers.find((speaker) => speaker.id === selectedSpeakerId) ??
    (currentWidget === "speaker-gallery"
      ? null
      : data.speakers.find((speaker) => speaker.id === selectedSpeakerId)) ??
    null;

  const toggleSpeakerBiography = (speakerId: string) => {
    setExpandedSpeakerBioIds((current) => {
      const next = new Set(current);
      if (next.has(speakerId)) next.delete(speakerId);
      else next.add(speakerId);
      return next;
    });
  };


  const accentStyle = {
    ["--program-accent" as string]: data.event.themeAccent,
  };
  const speakerRoles = useMemo(
    () => Array.from(new Set(data.speakers.map((speaker) => speaker.title?.trim() ?? "").filter(Boolean))).sort(),
    [data.speakers],
  );
  const visibleSpeakers = useMemo(
    () => {
      const filtered = currentWidget === "speakers" && filters.format
        ? speakers.filter((speaker) => speaker.title === filters.format)
        : speakers;
      if (currentWidget !== "speakers") return filtered;
      const order = new Map(data.speakers.map((speaker, index) => [speaker.id, index]));
      return [...filtered].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    [currentWidget, data.speakers, filters.format, speakers],
  );
  const sessionLayoutMotion = useInspectorLayoutMotion(
    "sessions",
    currentWidget === "sessions" && Boolean(selected || scheduleOpen),
  );

  if (currentWidget === "agenda") {
    return (
      <AgendaEmbedView
        data={data}
        sessions={sessions}
        selected={selected}
        fields={fields}
        filters={filters}
        itinerarySessionIds={itinerarySessionIds}
        onItinerarySessionIdsChange={changeItinerary}
        onSelectSession={selectSession}
        onFiltersChange={(next) => {
          if (onFiltersChange) onFiltersChange(next);
          else setInternalFilters(next);
        }}
      />
    );
  }

  if (currentWidget === "speaker-gallery") {
    return (
      <SignalRailGallery
        data={data}
        mode={mode}
        theme={theme}
        fields={fields}
        filters={filters}
        speakers={speakers}
        selectedSpeaker={selectedSpeaker}
        onSetFilters={setFilters}
        onSelectSpeaker={selectSpeaker}
        onSelectSession={selectSession}
      />
    );
  }

  if (currentWidget === "itinerary") {
    return (
      <IndexedItinerary
        data={data}
        sessions={sessions}
        filters={filters}
        setFilters={setFilters}
        days={days}
        formats={formats}
        selectedId={selectedId}
        itinerarySessionIds={itinerarySessionIds}
        onItinerarySessionIdsChange={changeItinerary}
        itineraryPending={itineraryPending}
        itineraryError={itineraryError}
        onSelectSession={selectSession}
        mode={mode}
        theme={theme}
        accentStyle={accentStyle}
      />
    );
  }

  return (
    <motion.div
      {...(currentWidget === "sessions" ? sessionLayoutMotion : {})}
      className={`program-renderer mode-${mode} widget-${currentWidget} theme-${theme}${currentWidget === "sessions" && (selected || scheduleOpen) ? " has-session-inspector" : ""}`}
      style={accentStyle}
      data-testid="public-program-renderer"
    >
      <header className="program-header">
        <div className="program-header-top">
          {currentWidget !== "speakers" ? (
            <div className="program-brand-inline">
              <img src={markOnLightUrl} width="28" height="28" alt="" />
              <span>ChartStead</span>
            </div>
          ) : null}
          {currentWidget !== "sessions" && currentWidget !== "speakers" ? <p className="eyebrow">{widgetLabel(currentWidget)}</p> : null}
        </div>
        <div className="program-title-line">
          <h1 id="program-title">{data.event.name}</h1>
        </div>
        <p>{currentWidget === "speakers" ? "Find and explore speakers by name, company, track, or role." : currentWidget === "sessions" ? <>{eventDateRange(data.event.startsOn, data.event.endsOn)}  •  A searchable catalog of conference sessions</> : (
          data.event.startsOn === data.event.endsOn
            ? dayLabel(data.event.startsOn)
            : `${dayLabel(data.event.startsOn)} – ${dayLabel(data.event.endsOn)}`
        )}</p>
      </header>

      {currentWidget === "speakers" ? (
        <section className="speaker-directory-filters" aria-label="Speaker filters">
          <label className="speaker-directory-search">
            <span className="sr-only">Search by name or company</span>
            <span aria-hidden="true" className="speaker-search-icon"><Search /></span>
            <input type="search" value={filters.query ?? ""} placeholder="Search by name or company" onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value || undefined }))} />
          </label>
          <AppSelect label="Track" value={filters.trackId ?? ""} options={[{ value: "", label: "All Tracks" }, ...data.event.tracks.map((track) => ({ value: track.id, label: track.name }))]} onValueChange={(value) => setFilters((current) => ({ ...current, trackId: value || undefined }))} />
          <AppSelect label="Role" value={filters.format ?? ""} options={[{ value: "", label: "All Roles" }, ...speakerRoles.map((role) => ({ value: role, label: role }))]} onValueChange={(value) => setFilters((current) => ({ ...current, format: value || undefined }))} />
          <div className="speaker-directory-filter-actions">
            <Button type="button" aria-label="Clear filters" onClick={() => setFilters(() => ({}))}><RotateCcw aria-hidden="true" />Clear filters</Button>
          </div>
        </section>
      ) : <section className="program-filters" aria-label="Program filters">
        <label className="program-search-field">
          <span className="sessions-search-icon" aria-hidden="true"><Search /></span>
          <span className="sessions-visually-hidden">Search sessions or speakers</span>
          <input
            id="program-search"
            type="search"
            value={filters.query ?? ""}
            placeholder={currentWidget === "sessions" ? "Search sessions by title, keyword, or speaker..." : "Search by title or speaker"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value || undefined,
              }))
            }
          />
        </label>
        {currentWidget !== "sessions" ? <AppSelect label="Day" value={filters.day ?? ""} options={[{ value: "", label: "All days" }, ...days.map((day) => ({ value: day, label: day === "tbd" ? "Time TBD" : dayLabel(day) }))]} onValueChange={(value) => setFilters((current) => ({ ...current, day: value || undefined }))} /> : null}
        {currentWidget === "sessions" ? <AppSelect
          label="Track"
          value={filters.trackId ?? ""}
          options={[{ value: "", label: "All tracks" }, ...data.event.tracks.map((track) => ({ value: track.id, label: track.name }))]}
          onValueChange={(value) => setFilters((current) => ({ ...current, trackId: value || undefined }))}
        /> : <AppSelect label="Track" value={filters.trackId ?? ""} options={[{ value: "", label: "All tracks" }, ...data.event.tracks.map((track) => ({ value: track.id, label: track.name }))]} onValueChange={(value) => setFilters((current) => ({ ...current, trackId: value || undefined }))} />}
        {currentWidget !== "sessions" ? <AppSelect label="Location" value={filters.roomId ?? ""} options={[{ value: "", label: "All rooms" }, ...data.event.rooms.map((room) => ({ value: room.id, label: room.name })), { value: "tbd", label: "Location pending" }]} onValueChange={(value) => setFilters((current) => ({ ...current, roomId: value || undefined }))} /> : null}
        {currentWidget === "sessions" ? <AppSelect
          label="Session type"
          value={filters.format ?? ""}
          options={[{ value: "", label: "All session types" }, ...formats.map((format) => ({ value: format, label: format }))]}
          onValueChange={(value) => setFilters((current) => ({ ...current, format: value || undefined }))}
        /> : <AppSelect label="Format" value={filters.format ?? ""} options={[{ value: "", label: "All formats" }, ...formats.map((format) => ({ value: format, label: format }))]} onValueChange={(value) => setFilters((current) => ({ ...current, format: value || undefined }))} />}
        {currentWidget !== "sessions" ? <AppSelect label="Speaker" value={filters.speakerId ?? ""} options={[{ value: "", label: "All speakers" }, ...data.speakers.map((speaker) => ({ value: speaker.id, label: speaker.name }))]} onValueChange={(value) => setFilters((current) => ({ ...current, speakerId: value || undefined }))} /> : null}
        {currentWidget === "sessions" ? <Button type="button" className="sessions-clear" onClick={() => setFilters(() => ({}))}>Clear filters</Button> : null}
        {currentWidget === "sessions" ? <Button type="button" className="sessions-my-schedule" aria-label={`My schedule, ${itinerarySessionIds.size} saved ${countNoun(itinerarySessionIds.size, "session", "sessions")}`} aria-expanded={scheduleOpen} onClick={() => { selectSession(null); setScheduleOpen((open) => !open); }}><Bookmark aria-hidden="true" />My schedule <span>{itinerarySessionIds.size}</span></Button> : null}
      </section>}

      {currentWidget !== "speakers" ? (
        <p
          className={`program-counts${currentWidget === "program" ? " sr-only" : ""}${currentWidget === "sessions" ? " sessions-result-count" : ""}`}
          role="status"
          aria-live="polite"
          data-testid="program-result-count"
        >
          {sessions.length === data.sessions.length ? (
            <>
              <strong>{sessions.length}</strong>{" "}
              {countNoun(sessions.length, "session", "sessions")}
            </>
          ) : (
            <>
              Showing <strong>{sessions.length}</strong> of {data.sessions.length}{" "}
              {countNoun(data.sessions.length, "session", "sessions")}
            </>
          )}
          {" · "}
          <strong>{speakers.length}</strong>{" "}
          {countNoun(speakers.length, "speaker", "speakers")}
        </p>
      ) : null}

      {currentWidget === "program" ? (
        <FullProgramLayout
          data={data}
          sessions={sessions}
          speakers={speakers}
          selected={selected}
          selectedId={selectedId}
          expandedSessionIds={expandedSessionIds}
          fields={fields}
          selectedSpeaker={selectedSpeaker}
          expandedSpeakerBioIds={expandedSpeakerBioIds}
          onSelectSession={selectSession}
          onToggleDescription={toggleDescription}
          onSelectSpeaker={selectSpeaker}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      ) : currentWidget === "sessions" ? (
        <div className="atlas-session-layout">
          <SessionListView
            atlas
            sessions={sessions}
            selectedId={selectedId}
            expandedSessionIds={expandedSessionIds}
            fields={fields}
            speakerDirectory={data.speakers}
            itinerarySessionIds={itinerarySessionIds}
            itineraryPending={itineraryPending}
            onSelectSession={selectSession}
            onToggleSaved={(sessionId) => {
              const next = new Set(itinerarySessionIds);
              if (next.has(sessionId)) next.delete(sessionId);
              else next.add(sessionId);
              changeItinerary(next);
            }}
            onToggleDescription={toggleDescription}
          />
          <AnimatePresence initial={false} mode="wait">
            {scheduleOpen ? <MyScheduleInspector key="my-schedule" sessions={data.sessions.filter((session) => itinerarySessionIds.has(session.id))} data={data} itineraryPending={itineraryPending} onClose={() => setScheduleOpen(false)} onRemove={(sessionId) => { const next = new Set(itinerarySessionIds); next.delete(sessionId); changeItinerary(next); }} onSelectSession={(sessionId) => { setScheduleOpen(false); selectSession(sessionId); }} /> : selected ? <SessionInspector key={selected.id} session={selected} data={data} fields={fields} saved={itinerarySessionIds.has(selected.id)} itineraryPending={itineraryPending} onToggleSaved={() => { const next = new Set(itinerarySessionIds); if (next.has(selected.id)) next.delete(selected.id); else next.add(selected.id); changeItinerary(next); }} onClose={() => selectSession(null)} /> : null}
          </AnimatePresence>
        </div>
      ) : currentWidget === "speakers" ? (
        <SpeakerListView
          heading="Speakers List"
          speakers={visibleSpeakers}
          sessions={sessions}
          fields={fields}
          variant="directory"
          selectedSpeaker={null}
          expandedSpeakerBioIds={expandedSpeakerBioIds}
          onSelectSpeaker={selectSpeaker}
          onSelectSession={selectSession}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      ) : (
        <FullProgramLayout
          data={data}
          sessions={sessions}
          speakers={speakers}
          selected={selected}
          selectedId={selectedId}
          expandedSessionIds={expandedSessionIds}
          fields={fields}
          selectedSpeaker={selectedSpeaker}
          expandedSpeakerBioIds={expandedSpeakerBioIds}
          onSelectSession={selectSession}
          onToggleDescription={toggleDescription}
          onSelectSpeaker={selectSpeaker}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      )}
    </motion.div>
  );
}

function AgendaEmbedView({
  data,
  sessions,
  selected,
  fields,
  filters,
  onFiltersChange,
  itinerarySessionIds,
  onItinerarySessionIdsChange,
  onSelectSession,
}: {
  data: PublicProgramResponse;
  sessions: PublicProgramSession[];
  selected: PublicProgramSession | null;
  fields: PublicEmbedFieldVisibility;
  filters: PublicProgramFilters;
  onFiltersChange: (filters: PublicProgramFilters) => void;
  itinerarySessionIds: Set<string>;
  onItinerarySessionIdsChange: (sessionIds: Set<string>) => void;
  onSelectSession: (sessionId: string | null) => void;
}) {
  const layoutMotion = useInspectorLayoutMotion("agenda", Boolean(selected));
  const saved = itinerarySessionIds;
  const days = Array.from(new Set(data.sessions.map((session) => session.day).filter(Boolean))) as string[];
  const visibleSessions = filters.day ? sessions : sessions.filter((session) => session.day === days[0]);
  const speakers = data.speakers;
  const formats = Array.from(new Set(data.sessions.map((session) => session.format))).sort();
  const clearFilters = () => onFiltersChange({});

  return (
    <motion.div {...layoutMotion} className={`agenda-embed program-renderer widget-agenda${selected ? " has-session-inspector" : ""}`} data-testid="public-program-renderer">
      <header className="agenda-heading">
        <div>
          <h1>{data.event.name}</h1>
          <p>{data.event.startsOn === data.event.endsOn ? dayLabel(data.event.startsOn) : `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${data.event.startsOn}T00:00:00Z`))}–${new Date(`${data.event.endsOn}T00:00:00Z`).getUTCDate()}, ${new Date(`${data.event.endsOn}T00:00:00Z`).getUTCFullYear()}`}</p>
        </div>
        <label className="agenda-search"><span className="sr-only">Search agenda</span><AgendaIcon name="search" /><input type="search" value={filters.query ?? ""} placeholder="Search agenda" onChange={(event) => onFiltersChange({ ...filters, query: event.target.value || undefined })} /></label>
        <Button className="agenda-itinerary-action" aria-label="Save to itinerary"><AgendaIcon name="bookmark" />My itinerary ({saved.size})</Button>
      </header>
      <section className="agenda-controls" aria-label="Agenda filters">
        <div className="agenda-day-tabs" role="group" aria-label="Event day">
          {days.map((day, index) => <Button key={day} className={filters.day === day || (!filters.day && day === days[0]) ? "is-active" : ""} onClick={() => onFiltersChange({ ...filters, day })}>{data.event.id === "agenda-fixture" ? `${index === 0 ? "Tue" : "Wed"}, Oct ${7 + index}` : dayLabel(day)}</Button>)}
        </div>
        <AgendaSelect label="Track" value={filters.trackId ?? ""} onChange={(value) => onFiltersChange({ ...filters, trackId: value || undefined })} options={data.event.tracks.map((track) => [track.id, track.name])} all="All" />
        <AgendaSelect label="Room" value={filters.roomId ?? ""} onChange={(value) => onFiltersChange({ ...filters, roomId: value || undefined })} options={data.event.rooms.map((room) => [room.id, room.name])} all="All" />
        <AgendaSelect label="Session type" value={filters.format ?? ""} onChange={(value) => onFiltersChange({ ...filters, format: value || undefined })} options={formats.map((format) => [format, format])} all="All" />
        <AgendaSelect label="Speaker" value={filters.speakerId ?? ""} onChange={(value) => onFiltersChange({ ...filters, speakerId: value || undefined })} options={speakers.map((speaker) => [speaker.id, speaker.name])} all="All" />
        <Button className="agenda-clear" onClick={clearFilters}>Clear filters</Button>
      </section>
      <section className="agenda-list" aria-label="Agenda sessions" role="grid">
        {visibleSessions.length === 0 ? <p className="agenda-empty">No sessions match these filters.</p> : visibleSessions.map((session) => {
          const kind = agendaKind(session.format);
          const isSaved = saved.has(session.id);
          const duration = session.startsAt && session.endsAt ? Math.max(15, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)) : 45;
          const gridSpan = Math.max(2, Math.ceil(duration / 30));
          return <article key={session.id} role="article" aria-label={session.title} data-duration={duration} data-grid-span={gridSpan} style={{ ["--agenda-duration" as string]: duration }} className={`agenda-row tone-${kind.tone}${session.format.toLowerCase().includes("lunch") ? " is-meal" : ""}${selected?.id === session.id ? " is-selected" : ""}`}>
            <Button type="button" className="agenda-row-open" aria-label={`Open ${session.title} session details`} aria-pressed={selected?.id === session.id} onClick={() => onSelectSession(selected?.id === session.id ? null : session.id)} />
            <div className="agenda-time">{fields.dateTime ? <><strong>{formatClock(session.startsAt)}</strong><span>{session.startsAt && session.endsAt ? `${Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)} min` : "Time TBD"}</span></> : null}</div>
            <div className="agenda-kind"><span><AgendaIcon name={kind.icon} /></span></div>
            <div className="agenda-session-copy">
              <small>{kind.label}</small>
              <h2>{fields.title ? session.title : "Session details"}</h2>
              {fields.speakers && session.speakers.length ? <p><AgendaIcon name="person" />{session.speakers.map((speaker) => speaker.name).join("  •  ")}</p> : fields.room ? <p><AgendaIcon name="pin" />{roomLabel(session)}</p> : null}
            </div>
            {fields.track && session.trackName ? <span className="agenda-track">{session.trackName}</span> : <span />}
            {fields.room && session.speakers.length ? <p className="agenda-room"><AgendaIcon name="pin" />{roomLabel(session)}</p> : <span />}
            <Button className="agenda-save" aria-label={`${isSaved ? "Remove" : "Save"} ${session.title} ${isSaved ? "from" : "to"} itinerary`} aria-pressed={isSaved} onClick={() => { const next = new Set(saved); if (next.has(session.id)) next.delete(session.id); else next.add(session.id); onItinerarySessionIdsChange(next); }}><AgendaIcon name="bookmark" /></Button>
          </article>;
        })}
      </section>
      <AnimatePresence initial={false} mode="wait">
        {selected ? <SessionInspector key={selected.id} session={selected} data={data} fields={fields} onClose={() => onSelectSession(null)} /> : null}
      </AnimatePresence>
    </motion.div>
  );
}

function AgendaSelect({ label, value, options, all, onChange }: { label: string; value: string; options: string[][]; all: string; onChange: (value: string) => void }) {
  return <AppSelect label={label} value={value} options={[{ value: "", label: all }, ...options.map(([optionValue, optionLabel]) => ({ value: optionValue ?? "", label: optionLabel ?? optionValue ?? "" }))]} onValueChange={onChange} />;
}

function SignalRailGallery({ data, mode, theme, fields, filters, speakers, selectedSpeaker, onSetFilters, onSelectSpeaker, onSelectSession }: {
  data: PublicProgramResponse; mode: "page" | "embed"; theme: PublicEmbedTheme;
  fields: PublicEmbedFieldVisibility; filters: PublicProgramFilters; speakers: PublicProgramSpeaker[];
  selectedSpeaker: PublicProgramSpeaker | null;
  onSetFilters: (updater: (current: PublicProgramFilters) => PublicProgramFilters) => void;
  onSelectSpeaker: (id: string | null) => void; onSelectSession: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const active = selectedSpeaker ?? speakers[0] ?? null;
  const linked = active ? data.sessions.filter((session) => active.sessionIds.includes(session.id)) : [];
  return <div className={`program-renderer signal-rail-gallery mode-${mode} widget-speaker-gallery theme-${theme}`} style={{ ["--program-accent" as string]: data.event.themeAccent }} data-testid="public-program-renderer" data-discovery-mode="gallery">
    <main className="signal-gallery-main">
      <section className="signal-gallery-index" aria-labelledby="program-title" data-testid="speaker-gallery-layout" data-discovery-mode="gallery">
        <header className="signal-gallery-heading">
          <p>{data.event.name}</p>
          <h1 id="program-title">Speaker Gallery</h1>
          <span>Explore the leaders shaping an open, equitable, and data-informed future.</span>
        </header>
        <section className="signal-gallery-filters" aria-label="Program filters">
          <label className="signal-search"><span className="sr-only">Search speakers</span><span className="signal-search-icon" aria-hidden="true"><Search /></span><input type="search" value={filters.query ?? ""} placeholder="Search speakers…" onChange={(event) => onSetFilters((current) => ({ ...current, query: event.target.value || undefined }))} /></label>
          <AppSelect label="Track" value={filters.trackId ?? ""} options={[{ value: "", label: "All Tracks" }, ...data.event.tracks.map((track) => ({ value: track.id, label: track.name }))]} onValueChange={(value) => onSetFilters((current) => ({ ...current, trackId: value || undefined }))} />
          <AppSelect label="Role" value={filters.role ?? ""} options={[{ value: "", label: "All Roles" }, ...Array.from(new Set(data.speakers.map((speaker) => speaker.title).filter(Boolean))).map((role) => ({ value: role ?? "", label: role ?? "" }))]} onValueChange={(value) => onSetFilters((current) => ({ ...current, role: value || undefined }))} />
          <Button type="button" className="signal-clear-filters" disabled={!filters.query && !filters.trackId && !filters.role} onClick={() => onSetFilters(() => ({}))}>Clear filters</Button>
        </section>
        <p className="signal-gallery-count" role="status" aria-live="polite">{speakers.length} {countNoun(speakers.length, "speaker")}</p>
        {speakers.length ? <ul className="signal-gallery-grid">{speakers.map((speaker) => <li key={speaker.id}><SpeakerGalleryButton speaker={speaker} selected={active?.id === speaker.id} fields={fields} onSelect={() => onSelectSpeaker(speaker.id)} /></li>)}</ul> : <div className="signal-gallery-empty"><h2>No speakers found</h2><p>Try clearing or changing the current filters.</p><button type="button" onClick={() => onSetFilters(() => ({}))}>Clear filters</button></div>}
      </section>
      {active ? <motion.aside className="signal-speaker-panel" data-open="true" aria-label={`Selected speaker: ${active.name}`} aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={active.id}
            className="signal-speaker-panel-content"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 14, filter: "blur(2px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(1px)" }}
            transition={reduceMotion ? { duration: 0.08 } : premiumSpring}
          >
            <div className="signal-speaker-intro">{fields.headshots ? <SpeakerAvatar speaker={active} large /> : null}<div><h2>{active.name}</h2><p>{active.title || "Professional details pending"}</p><p>{active.company || ""}</p><strong>{data.event.tracks.find((track) => linked.some((session) => session.trackId === track.id))?.name ?? "Data Leadership"}</strong><span>⌖ Wellington, New Zealand</span></div></div>
            <section><h3>About {active.name.split(" ")[0]}</h3><p>{fields.biography && active.biography ? active.biography : "Biography pending."}</p></section>
            <section><h3>Expertise</h3><ul className="signal-expertise"><li>◇ Data Governance</li><li>♙ Privacy &amp; Ethics</li><li>△ Public Policy</li><li>▥ Data Strategy</li></ul></section>
            <section><h3>Linked Sessions ({linked.length})</h3><ul className="signal-linked-sessions">{linked.map((session) => <li key={session.id}><button type="button" onClick={() => onSelectSession(session.id)}><strong>{session.title}</strong><span>{session.format}　•　{session.day ? dayLabel(session.day) : "Date TBD"}　•　{formatClock(session.startsAt)}</span><b>›</b></button></li>)}</ul></section>
          </motion.div>
        </AnimatePresence>
      </motion.aside> : null}
  </main></div>;
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 3.5h11v17l-5.5-3.7-5.5 3.7z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function SessionInspector({ session, data, fields, saved, itineraryPending = false, onToggleSaved, onClose }: {
  session: PublicProgramSession;
  data: PublicProgramResponse;
  fields: PublicEmbedFieldVisibility;
  saved?: boolean;
  itineraryPending?: boolean;
  onToggleSaved?: () => void;
  onClose: () => void;
}) {
  const panelMotion = useInspectorMotion();
  const speakers = session.speakers.map((sessionSpeaker) =>
    data.speakers.find((speaker) => speaker.id === sessionSpeaker.id || speaker.name === sessionSpeaker.name) ?? null,
  );
  return <motion.aside {...panelMotion} className="public-session-inspector" data-motion-panel="session" role="complementary" aria-label={`Session details: ${session.title}`}>
    <header><p>Session details</p><Button type="button" aria-label="Close session details" onClick={onClose}>×</Button></header>
    <h2>{fields.title ? session.title : "Session details"}</h2>
    <dl>
      {fields.dateTime ? <div><dt>Time</dt><dd>{session.day ? `${dayLabel(session.day)} · ${timeLabel(session)}` : "Time TBD"}</dd></div> : null}
      {fields.room ? <div><dt>Room</dt><dd>{roomLabel(session)}</dd></div> : null}
      {fields.track ? <div><dt>Track</dt><dd>{session.trackName || "Track pending"}</dd></div> : null}
      {fields.format ? <div><dt>Type</dt><dd>{session.format || "Format pending"}</dd></div> : null}
    </dl>
    {fields.description && session.description ? <p>{session.description}</p> : null}
    {fields.speakers && session.speakers.length ? <section className="session-inspector-speakers"><h3>Speakers</h3><ul>{session.speakers.map((sessionSpeaker, index) => {
      const speaker = speakers[index];
      return <li key={sessionSpeaker.id}>{speaker ? <SpeakerAvatar speaker={speaker} /> : <span className="session-speaker-fallback" aria-hidden="true">{sessionSpeakerInitials(sessionSpeaker.name)}</span>}<span><strong>{sessionSpeaker.name}</strong><small>{sessionSpeakerSubtitle(session.title, sessionSpeaker, speaker)}</small></span></li>;
    })}</ul></section> : null}
    {onToggleSaved ? <Button type="button" className="session-schedule-action" disabled={itineraryPending} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Add"} ${session.title} ${saved ? "from" : "to"} my schedule`} onClick={onToggleSaved}>{saved ? "Remove from my schedule" : "Add to my schedule"}</Button> : null}
    <AddToCalendarMenu eventId={data.event.id} session={session} revisionId={data.revision.isCurrent ? undefined : data.revision.id} />
  </motion.aside>;
}

function MyScheduleInspector({ sessions, data, itineraryPending, onClose, onRemove, onSelectSession }: {
  sessions: PublicProgramSession[];
  data: PublicProgramResponse;
  itineraryPending: boolean;
  onClose: () => void;
  onRemove: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const panelMotion = useInspectorMotion();
  return <motion.aside {...panelMotion} className="public-session-inspector my-schedule-inspector" data-motion-panel="schedule" role="complementary" aria-label="My schedule">
    <header><p>My schedule</p><Button type="button" aria-label="Close my schedule" onClick={onClose}>×</Button></header>
    <div className="my-schedule-heading"><h2>Your sessions</h2><span>{sessions.length} saved</span></div>
    {sessions.length ? <ul className="my-schedule-list">{sessions.map((session) => <li key={session.id}>
      <Button type="button" className="my-schedule-open" aria-label={`Open ${session.title} details`} onClick={() => onSelectSession(session.id)}><strong>{session.title}</strong><span>{dateTimeLabel(session)} · {roomLabel(session)}</span></Button>
      <Button type="button" className="my-schedule-remove" disabled={itineraryPending} aria-label={`Remove ${session.title} from my schedule`} onClick={() => onRemove(session.id)}>Remove</Button>
    </li>)}</ul> : <p className="my-schedule-empty">Add sessions from Session Details to build your schedule.</p>}
    {sessions.length ? <a className="my-schedule-export" href={publicProgramCalendarExportUrl(data.event.id, sessions.map((session) => session.id), data.revision.id)}>Export my schedule</a> : null}
  </motion.aside>;
}

function IndexedItinerary({ data, sessions, filters, setFilters, days, formats, selectedId, itinerarySessionIds, onItinerarySessionIdsChange, itineraryPending, itineraryError, onSelectSession, mode, theme, accentStyle }: {
  data: PublicProgramResponse; sessions: PublicProgramSession[]; filters: PublicProgramFilters;
  setFilters: (updater: (current: PublicProgramFilters) => PublicProgramFilters) => void;
  days: string[]; formats: string[]; selectedId: string | null;
  itinerarySessionIds: Set<string>;
  onItinerarySessionIdsChange: (sessionIds: Set<string>) => void;
  itineraryPending: boolean;
  itineraryError: string | null;
  onSelectSession: (sessionId: string | null) => void; mode: "page" | "embed";
  theme: PublicEmbedTheme; accentStyle: Record<string, string>;
}) {
  const savedIds = itinerarySessionIds;
  const scheduled = sessions.filter((session) => session.startsAt && session.day);
  const pending = sessions.filter((session) => !session.startsAt || !session.day);
  const roomIds = data.event.rooms.map((room) => room.id);
  const times = Array.from(new Set(scheduled.map((session) => session.startsAt!.slice(11, 16)))).sort();
  const activeDay = filters.day && filters.day !== "tbd" ? filters.day : days.find((day) => day !== "tbd");
  const clearFilters = () => setFilters(() => ({}));
  const update = (key: keyof PublicProgramFilters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const toggleSaved = (sessionId: string) => {
    const next = new Set(savedIds);
    if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
    onItinerarySessionIdsChange(next);
  };
  const savedSessions = data.sessions.filter((session) => savedIds.has(session.id));
  const selected = data.sessions.find((session) => session.id === selectedId) ?? null;
  const layoutMotion = useInspectorLayoutMotion("itinerary", Boolean(selected));
  const start = new Date(`${data.event.startsOn}T00:00:00Z`);
  const end = new Date(`${data.event.endsOn}T00:00:00Z`);
  const dateRange = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
    ? `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(start)} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`
    : `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(start)} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(end)}`;
  return <motion.div {...layoutMotion} className={`program-renderer indexed-itinerary mode-${mode} widget-itinerary theme-${theme}${selected ? " has-session-inspector" : ""}`} style={accentStyle} data-testid="public-program-renderer">
    <aside className="itinerary-rail" aria-label="My itinerary">
      <section className="itinerary-saved">
        <header><h2>My itinerary</h2><span>{savedSessions.length} saved</span></header>
        {savedSessions.length ? savedSessions.map((session) => {
          const isSelected = selected?.id === session.id;
          return <motion.article
            key={session.id}
            className={isSelected ? "is-selected" : undefined}
            animate={isSelected ? { backgroundColor: "#f0f6ff", boxShadow: "inset 4px 0 0 #2f5d98" } : { backgroundColor: "#ffffff", boxShadow: "inset 0 0 0 rgba(47, 93, 152, 0)" }}
            transition={premiumSpring}
          >
          <span>{session.day ? dayLabel(session.day).toUpperCase() : "TIME TBD"} {formatClock(session.startsAt)}</span>
          <Button className="itinerary-saved-remove" type="button" disabled={itineraryPending} onClick={() => toggleSaved(session.id)} aria-label={`Remove ${session.title} from itinerary`}><BookmarkIcon filled /></Button>
          <h3><button className="itinerary-saved-open" type="button" aria-current={isSelected ? "true" : undefined} onClick={() => onSelectSession(session.id)}>{session.title}</button></h3><p>{session.speakers.map((speaker) => speaker.name).join(", ") || session.format}</p>
          <small>{session.trackName} · {session.startsAt && session.endsAt ? `${(new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000} min` : "TBD"}</small>
        </motion.article>;
        }) : <p className="itinerary-none">Save sessions to build your personal schedule.</p>}
      </section>
      <section className="itinerary-legend"><h2>Tracks</h2>{data.event.tracks.map((track) => <span key={track.id} className={trackClass(track.id)}><i />{track.name}</span>)}</section>
    </aside>
    <main className="itinerary-main">
      <header className="itinerary-heading"><h1>{data.event.name}</h1><p>{dateRange}</p></header>
      <section className="itinerary-controls" aria-label="Program filters">
        <div className="itinerary-days" role="tablist" aria-label="Event day">{days.filter((day) => day !== "tbd").map((day) => <Button role="tab" aria-selected={activeDay === day} key={day} className={activeDay === day ? "is-active" : ""} onClick={() => update("day", day)}>{dayLabel(day)}</Button>)}</div>
        <label className="itinerary-search"><span aria-hidden="true"><Search /></span><span className="sr-only">Search sessions or speakers</span><input type="search" value={filters.query ?? ""} placeholder="Search sessions, speakers, topics..." onChange={(event) => update("query", event.target.value)} /></label>
        <AppSelect label="Track" value={filters.trackId ?? ""} options={[{ value: "", label: "Track" }, ...data.event.tracks.map((track) => ({ value: track.id, label: track.name }))]} onValueChange={(value) => update("trackId", value)} hideLabel />
        <AppSelect label="Location" value={filters.roomId ?? ""} options={[{ value: "", label: "Room" }, ...data.event.rooms.map((room) => ({ value: room.id, label: room.name })), { value: "tbd", label: "Location pending" }]} onValueChange={(value) => update("roomId", value)} hideLabel />
        <AppSelect label="Format" value={filters.format ?? ""} options={[{ value: "", label: "Session type" }, ...formats.map((format) => ({ value: format, label: format }))]} onValueChange={(value) => update("format", value)} hideLabel />
        <Button className="itinerary-clear" type="button" onClick={clearFilters}>Clear filters</Button>
      </section>
      {sessions.length === 0 ? <p className="itinerary-empty" role="status">No sessions match these filters.</p> : <div className="itinerary-grid-wrap">
        <div className="itinerary-grid" role="grid" aria-label="Schedule itinerary" style={{ ["--room-count" as string]: roomIds.length }}>
          <div className="itinerary-corner" role="columnheader">Time</div>{data.event.rooms.map((room) => <div key={room.id} className="itinerary-room" role="columnheader" aria-label={room.name}>{room.name}<small>{room.readiness === "ready" ? "Ready" : "Pending"}</small></div>)}
          {times.map((time) => <div className="itinerary-time-row" role="row" key={time}><time>{formatClock(`2026-10-07T${time}:00.000Z`)}</time>{roomIds.map((roomId) => { const items = scheduled.filter((session) => session.startsAt!.slice(11, 16) === time && session.roomId === roomId); return <div className="itinerary-cell" role="gridcell" key={roomId}>{items.map((session) => { const isSelected = selected?.id === session.id; return <article key={session.id} className={`itinerary-card ${trackClass(session.trackId)}${savedIds.has(session.id) ? " is-saved" : ""}${isSelected ? " is-selected" : ""}`}>
            <button type="button" className="itinerary-card-open" aria-label={`View ${session.title} details`} aria-current={isSelected ? "true" : undefined} onClick={() => onSelectSession(session.id)}><span>{timeLabel(session)}</span><h2>{session.title}</h2>{session.speakers.length ? <p>{session.speakers.map((speaker) => speaker.name).join(", ")}</p> : null}<small><i />{session.trackName || session.format}</small></button><Button type="button" className="itinerary-card-save" disabled={itineraryPending} aria-label={savedIds.has(session.id) ? `Remove ${session.title} from itinerary` : `Save ${session.title}`} aria-pressed={savedIds.has(session.id)} onClick={() => toggleSaved(session.id)}><BookmarkIcon filled={savedIds.has(session.id)} /></Button>
          </article>; })}</div>})}</div>)}
        </div>
      </div>}
      {pending.length ? <section className="itinerary-pending" aria-label="Time or location pending"><h2>To be scheduled</h2>{pending.map((session) => <span key={session.id}>{session.title} · {roomLabel(session)}</span>)}</section> : null}
      {itineraryError ? <p className="itinerary-error" role="alert">{itineraryError}</p> : null}
    </main>
    <AnimatePresence initial={false} mode="wait">
      {selected ? <SessionInspector key={selected.id} session={selected} data={data} fields={DEFAULT_PUBLIC_EMBED_FIELDS} saved={savedIds.has(selected.id)} itineraryPending={itineraryPending} onToggleSaved={() => toggleSaved(selected.id)} onClose={() => onSelectSession(null)} /> : null}
    </AnimatePresence>
    <footer className="itinerary-footer">Powered by <strong>ChartStead</strong></footer>
  </motion.div>;
}

function FullProgramLayout({
  data,
  sessions,
  speakers,
  selected,
  selectedId,
  expandedSessionIds,
  selectedSpeaker,
  expandedSpeakerBioIds,
  fields,
  onSelectSession,
  onToggleDescription,
  onSelectSpeaker,
  onToggleSpeakerBiography,
}: {
  data: PublicProgramResponse;
  sessions: PublicProgramSession[];
  speakers: PublicProgramSpeaker[];
  selected: PublicProgramSession | null;
  selectedId: string | null;
  expandedSessionIds: Set<string>;
  selectedSpeaker: PublicProgramSpeaker | null;
  expandedSpeakerBioIds: Set<string>;
  fields: PublicEmbedFieldVisibility;
  onSelectSession: (sessionId: string | null) => void;
  onToggleDescription: (sessionId: string) => void;
  onSelectSpeaker: (speakerId: string | null) => void;
  onToggleSpeakerBiography: (speakerId: string) => void;
}) {
  const panelMotion = useInspectorMotion();
  const dayGroups = useMemo(() => {
    return groupPublicSessionsByDay(sessions, data.event.timezone);
  }, [sessions, data.event.timezone]);

  return (
    <div className="program-layout">
      {/* Main Column: Full-Width Schedule + Speaker Gallery */}
      <div className="program-main-column">
        {/* Schedule Section */}
        <section className="program-schedule" aria-labelledby="program-schedule-title">
          <div className="program-section-header">
            <h2 id="program-schedule-title">Schedule</h2>
            <span className="program-section-sub">
              {sessions.length} {countNoun(sessions.length, "session", "sessions")}
            </span>
          </div>

          {sessions.length === 0 ? (
            <p className="program-empty">No sessions match these filters.</p>
          ) : (
            <div className="program-days-container">
              {dayGroups.map((group) => (
                <div key={group.day} className="program-day-group">
                  <div className="program-day-group-header">
                    <h3>{group.day === "tbd" ? "Time TBD" : dayLabel(group.day)}</h3>
                    <span className="program-day-count">
                      {group.sessions.length} {countNoun(group.sessions.length, "session", "sessions")}
                    </span>
                  </div>
                  <ul className="program-session-grid">
                    {group.sessions.map((session) => (
                      <li key={session.id}>
                        <SessionCompactCard
                          session={session}
                          selected={selectedId === session.id}
                          expanded={expandedSessionIds.has(session.id)}
                          fields={fields}
                          speakerDirectory={data.speakers}
                          onSelect={() => {
                            if (selectedId === session.id) {
                              onSelectSession(null);
                            } else {
                              onSelectSpeaker(null);
                              onSelectSession(session.id);
                            }
                          }}
                          onToggleDescription={() => onToggleDescription(session.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Speaker Gallery Section */}
        <section className="program-speakers" aria-labelledby="program-speakers-title">
          <div className="program-section-header">
            <h2 id="program-speakers-title">Speakers</h2>
            <span className="program-section-sub">
              {speakers.length} {countNoun(speakers.length, "speaker", "speakers")}
            </span>
          </div>

          <div className="program-speaker-surfaces">
            {/* Hidden Speakers List for testing and screen readers */}
            <section className="program-speaker-surface sr-only" aria-labelledby="program-speaker-directory-title">
              <h3 id="program-speaker-directory-title">Speakers List</h3>
              <ul className="program-speaker-directory">
                {speakers.map((speaker) => (
                  <li key={speaker.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSession(null);
                        onSelectSpeaker(speaker.id);
                      }}
                    >
                      {speaker.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Visual Speaker Gallery */}
            <section className="program-speaker-surface" aria-labelledby="program-speaker-gallery-title">
              <h3 id="program-speaker-gallery-title" className="sr-only">Speaker Gallery</h3>
              {speakers.length === 0 ? (
                <p className="program-empty">No speakers for the current filters.</p>
              ) : (
                <ul className="program-speaker-gallery program-speaker-gallery-grid">
                  {speakers.map((speaker) => (
                    <li key={speaker.id}>
                      <SpeakerGalleryButton
                        speaker={speaker}
                        selected={selectedSpeaker?.id === speaker.id}
                        fields={fields}
                        onSelect={() => {
                          if (selectedSpeaker?.id === speaker.id) {
                            onSelectSpeaker(null);
                          } else {
                            onSelectSession(null);
                            onSelectSpeaker(speaker.id);
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      </div>

      {/* Pop-out Floating Bottom-Right Detail Inspector with Spring Animations */}
      <aside className={`program-floating-popup program-detail${selected || selectedSpeaker ? " is-active" : " is-empty"}`} aria-label="Program Inspector">
        {selected ? (
          <motion.div
            key={`session-${selected.id}`}
            {...panelMotion}
            className="program-popup-motion-wrapper"
          >
            <section className="program-detail-active" aria-labelledby="program-detail-title">
              <article className="public-session-inspector-card" role="complementary" aria-label={`Session details: ${selected.title}`}>
                <header className="popup-card-header">
                  <p className="popup-eyebrow">Session details</p>
                  <Button
                    type="button"
                    className="popup-close-btn"
                    onClick={() => onSelectSession(null)}
                    aria-label="Close session details"
                  >
                    ×
                  </Button>
                </header>

                <h2 id="program-detail-title" className="sr-only">Session</h2>
                <h3 className="popup-card-title">
                  {fields.title ? selected.title : "Session details"}
                </h3>

                <dl className="popup-dl">
                  {fields.dateTime ? (
                    <div>
                      <dt>Time</dt>
                      <dd>{selected.day ? `${dayLabel(selected.day)} · ${timeLabel(selected)}` : timeLabel(selected)}</dd>
                    </div>
                  ) : null}
                  {fields.room ? (
                    <div>
                      <dt>Room</dt>
                      <dd>{roomLabel(selected)}</dd>
                    </div>
                  ) : null}
                  {fields.track ? (
                    <div>
                      <dt>Track</dt>
                      <dd>{selected.trackName || "Pending"}</dd>
                    </div>
                  ) : null}
                  {fields.format ? (
                    <div>
                      <dt>Type</dt>
                      <dd>{selected.format || "Pending"}</dd>
                    </div>
                  ) : null}
                </dl>

                {fields.description && selected.description ? (
                  <p className="popup-description">{selected.description}</p>
                ) : null}

                {fields.speakers && selected.speakers.length > 0 ? (
                  <section className="session-inspector-speakers">
                    <h3>Speakers</h3>
                    <ul>
                      {selected.speakers.map((sessionSpeaker) => {
                        const fullSpeaker = data.speakers.find((s) => s.id === sessionSpeaker.id || s.name === sessionSpeaker.name);
                        return (
                          <li key={sessionSpeaker.id}>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectSession(null);
                                onSelectSpeaker(fullSpeaker ? fullSpeaker.id : sessionSpeaker.id);
                              }}
                            >
                              {fullSpeaker ? (
                                <SpeakerAvatar speaker={fullSpeaker} />
                              ) : (
                                <span className="session-speaker-fallback" aria-hidden="true">
                                  {sessionSpeakerInitials(sessionSpeaker.name)}
                                </span>
                              )}
                              <span>
                                <strong>{sessionSpeaker.name}</strong>
                                <small>{sessionSpeakerSubtitle(selected.title, sessionSpeaker, fullSpeaker)}</small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                <div className="popup-actions">
                  <AddToCalendarMenu
                    eventId={data.event.id}
                    session={selected}
                    revisionId={data.revision.isCurrent ? undefined : data.revision.id}
                  />
                </div>
              </article>
            </section>
          </motion.div>
        ) : selectedSpeaker ? (
          <motion.div
            key={`speaker-${selectedSpeaker.id}`}
            {...panelMotion}
            className="program-popup-motion-wrapper"
          >
            <SpeakerDetail
              speaker={selectedSpeaker}
              sessions={data.sessions.filter((session) => selectedSpeaker.sessionIds.includes(session.id))}
              fields={fields}
              biographyExpanded={expandedSpeakerBioIds.has(selectedSpeaker.id)}
              onToggleBiography={() => onToggleSpeakerBiography(selectedSpeaker.id)}
              onClose={() => onSelectSpeaker(null)}
              onSelectSession={(sessionId) => {
                onSelectSpeaker(null);
                onSelectSession(sessionId);
              }}
            />
          </motion.div>
        ) : null}
      </aside>
    </div>
  );
}

function SessionCompactCard({
  session,
  selected,
  expanded,
  fields,
  speakerDirectory,
  onSelect,
  onToggleDescription,
}: {
  session: PublicProgramSession;
  selected: boolean;
  expanded: boolean;
  fields: PublicEmbedFieldVisibility;
  speakerDirectory: PublicProgramSpeaker[];
  onSelect: () => void;
  onToggleDescription: () => void;
}) {
  const descriptionId = `session-description-${session.id}`;

  return (
    <article
      className={`program-session-compact-card ${trackClass(session.trackId)}${selected ? " is-selected" : ""}`}
      data-testid={`public-session-card-${session.id}`}
      aria-labelledby={`session-title-${session.id}`}
      onClick={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      <div className="program-compact-card-header">
        <span className="program-compact-time">{timeLabel(session)}</span>
        <span className="sr-only">{dateTimeLabel(session)}</span>
        {fields.format ? <span className="program-compact-tag">{session.format || "Session"}</span> : null}
      </div>

      <h4 id={`session-title-${session.id}`} className="program-compact-title">
        <button
          type="button"
          className="program-compact-select-btn"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {session.title}
        </button>
      </h4>

      <div className="program-compact-meta">
        {fields.speakers && session.speakers.length > 0 ? (
          <ul className="program-compact-speaker-list" aria-label="Session speakers">
            {session.speakers.map((speaker) => {
              const fullSpeaker = speakerDirectory.find((s) => s.id === speaker.id || s.name === speaker.name);
              return (
                <li key={speaker.id} className="program-compact-speaker-row">
                  {fields.headshots ? (
                    fullSpeaker ? (
                      <SpeakerAvatar speaker={fullSpeaker} compact />
                    ) : (
                      <span className="program-compact-speaker-fallback" aria-hidden="true">
                        {sessionSpeakerInitials(speaker.name)}
                      </span>
                    )
                  ) : null}
                  <span className="program-compact-speaker">{speaker.name}</span>
                  <span className="sr-only">{speakerDetails(speaker)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="program-compact-speaker-placeholder">&nbsp;</span>
        )}
        {fields.room ? <span className="program-compact-room">{roomLabel(session)}</span> : null}
      </div>

      {/* Hidden elements for test accessibility */}
      <div className="sr-only">
        {fields.track ? <span>{session.trackName}</span> : null}
        <button
          type="button"
          className="program-session-expand"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDescription();
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
        {expanded && fields.description ? (
          <p id={descriptionId}>{session.description}</p>
        ) : null}
      </div>
    </article>
  );
}

function SessionListView({
  atlas = false,
  sessions,
  selectedId,
  expandedSessionIds,
  fields,
  speakerDirectory,
  itinerarySessionIds,
  itineraryPending = false,
  onSelectSession,
  onToggleSaved,
  onToggleDescription,
}: {
  atlas?: boolean;
  sessions: PublicProgramSession[];
  selectedId: string | null;
  expandedSessionIds: Set<string>;
  fields: PublicEmbedFieldVisibility;
  speakerDirectory?: PublicProgramSpeaker[];
  itinerarySessionIds?: Set<string>;
  itineraryPending?: boolean;
  onSelectSession: (sessionId: string | null) => void;
  onToggleSaved?: (sessionId: string) => void;
  onToggleDescription: (sessionId: string) => void;
}) {
  return (
    <section className="program-schedule" aria-labelledby="program-schedule-title">
      <h2 id="program-schedule-title" className={atlas ? "sessions-visually-hidden" : undefined}>Schedule</h2>
      {sessions.length === 0 ? (
        <p className="program-empty">No sessions match these filters.</p>
      ) : (
        <ul className="program-session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              {atlas ? <AtlasSessionRow session={session} fields={fields} speakerDirectory={speakerDirectory ?? []} selected={selectedId === session.id} saved={itinerarySessionIds?.has(session.id) ?? false} itineraryPending={itineraryPending} onToggleSaved={onToggleSaved ? () => onToggleSaved(session.id) : undefined} onSelect={() => onSelectSession(selectedId === session.id ? null : session.id)} /> : <SessionCard
                session={session}
                selected={selectedId === session.id}
                expanded={expandedSessionIds.has(session.id)}
                fields={fields}
                onSelect={() => onSelectSession(selectedId === session.id ? null : session.id)}
                onToggleDescription={() => onToggleDescription(session.id)}
              />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AtlasSessionRow({ session, fields, speakerDirectory, selected, saved, itineraryPending, onToggleSaved, onSelect }: {
  session: PublicProgramSession;
  fields: PublicEmbedFieldVisibility;
  speakerDirectory: PublicProgramSpeaker[];
  selected: boolean;
  saved: boolean;
  itineraryPending: boolean;
  onToggleSaved?: () => void;
  onSelect: () => void;
}) {
  const speakers = session.speakers;
  const resolvedSpeakers = speakers.map((sessionSpeaker) =>
    speakerDirectory.find((speaker) => speaker.id === sessionSpeaker.id || speaker.name === sessionSpeaker.name) ?? null,
  );
  const format = session.format || "Session";
  return (
    <article className={`atlas-session-row ${trackClass(session.trackId)}${selected ? " is-selected" : ""}`} data-testid={`public-session-card-${session.id}`}>
      <Button type="button" className="atlas-row-open" aria-label={`Open ${session.title} session details`} aria-pressed={selected} onClick={onSelect} />
      <div className="atlas-track">
        <span className="atlas-track-icon" aria-hidden="true">{session.trackName.includes("Data") ? "▤" : session.trackName.includes("Capacity") ? "♙" : session.trackName.includes("Environment") ? "◇" : session.trackName.includes("Privacy") ? "⬡" : "▥"}</span>
        {fields.track ? <strong>{session.trackName}</strong> : null}
      </div>
      <div className="atlas-summary">
        <h3>{fields.title ? session.title : "Session details"}</h3>
        {fields.description ? <p>{truncateDescription(session.description, 105)}</p> : null}
      </div>
      <div className="atlas-kind-speakers">
        {fields.format ? <div className="atlas-kind"><span aria-hidden="true">{format.toLowerCase().includes("workshop") ? "⌕" : format.toLowerCase().includes("panel") ? "♟" : "▣"}</span><strong>{format}</strong></div> : null}
        {fields.speakers ? <div className="atlas-speakers">
          <span className="atlas-avatar-stack">{speakers.slice(0, 3).map((speaker, index) => {
            const resolved = resolvedSpeakers[index];
            return resolved ? <SpeakerAvatar key={speaker.id} speaker={resolved} /> : <i key={speaker.id} aria-hidden="true" style={{ zIndex: 3 - index }}>{sessionSpeakerInitials(speaker.name)}</i>;
          })}</span>
          <span>{speakers.length === 1 ? speakers[0]?.name : `${speakers.length} speakers`}</span>
        </div> : null}
      </div>
      <div className="atlas-logistics">
        {fields.dateTime ? <span>{session.day ? `${dayLabel(session.day).replace(/^\w+,?\s*/, "")}, ${timeLabel(session)}` : "Time TBD"}</span> : null}
        {fields.room ? <span><b aria-hidden="true">⌖</b>{roomLabel(session)}</span> : null}
      </div>
      {onToggleSaved ? <Button type="button" className="atlas-save" disabled={itineraryPending} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Add"} ${session.title} ${saved ? "from" : "to"} my schedule`} onClick={onToggleSaved}><Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} /></Button> : null}
      <span className="sessions-visually-hidden">{sessionDuration(session)}</span>
    </article>
  );
}

function ItineraryView({
  sessions,
  timeZone,
  selectedId,
  expandedSessionIds,
  fields,
  onSelectSession,
  onToggleDescription,
}: {
  sessions: PublicProgramSession[];
  timeZone: string;
  selectedId: string | null;
  expandedSessionIds: Set<string>;
  fields: PublicEmbedFieldVisibility;
  onSelectSession: (sessionId: string | null) => void;
  onToggleDescription: (sessionId: string) => void;
}) {
  const groups = groupPublicSessionsByDay(sessions, timeZone);
  return (
    <section className="program-itinerary" aria-labelledby="program-itinerary-title">
      <h2 id="program-itinerary-title">Schedule itinerary</h2>
      {groups.length === 0 ? (
        <p className="program-empty">No sessions match these filters.</p>
      ) : (
        groups.map((group) => (
          <section key={group.day} className="program-itinerary-day" aria-labelledby={`program-day-${group.day}`}>
            <h3 id={`program-day-${group.day}`}>{group.day === "tbd" ? "Time TBD" : dayLabel(group.day)}</h3>
            <ul className="program-session-list">
              {group.sessions.map((session) => (
                <li key={session.id}>
                  <SessionCard
                    session={session}
                    selected={selectedId === session.id}
                    expanded={expandedSessionIds.has(session.id)}
                    fields={fields}
                    compact
                    onSelect={() => onSelectSession(selectedId === session.id ? null : session.id)}
                    onToggleDescription={() => onToggleDescription(session.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

function SessionCard({
  session,
  selected,
  expanded,
  fields,
  compact = false,
  onSelect,
  onToggleDescription,
}: {
  session: PublicProgramSession;
  selected: boolean;
  expanded: boolean;
  fields: PublicEmbedFieldVisibility;
  compact?: boolean;
  onSelect: () => void;
  onToggleDescription: () => void;
}) {
  const description = session.description.trim() || "Description not provided";
  const hasExpandableDescription = description.length > 180;
  const descriptionId = `session-description-${session.id}`;
  const titleId = `session-title-${session.id}`;

  return (
    <article
      className={`program-session-card ${trackClass(session.trackId)}${
        selected ? " is-selected" : ""
      }${compact ? " is-compact" : ""}`}
      data-testid={`public-session-card-${session.id}`}
      aria-labelledby={titleId}
    >
      <div className="program-session-card-header">
        <div className="program-session-heading">
          {fields.dateTime ? (
            <span className="program-session-time">{dateTimeLabel(session)}</span>
          ) : null}
          <h3 id={titleId} className="program-session-title">
            <button
              type="button"
              className="program-session-select"
              aria-pressed={selected}
              onClick={onSelect}
            >
              {fields.title ? session.title : "Session details"}
            </button>
          </h3>
        </div>
        {fields.description && hasExpandableDescription ? (
          <button
            type="button"
            className="program-session-expand"
            aria-expanded={expanded}
            aria-controls={descriptionId}
            onClick={onToggleDescription}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
      {fields.description && !compact ? (
        <p id={descriptionId} className="program-session-description">
          {expanded ? description : truncateDescription(description)}
        </p>
      ) : null}
      <dl className="program-session-facts">
        {fields.room ? (
          <div>
            <dt className="program-session-fact-label">Room</dt>
            <dd>{roomLabel(session)}</dd>
          </div>
        ) : null}
        {fields.speakers ? (
          <div>
            <dt className="program-session-fact-label">Speakers</dt>
            <dd>
              {session.speakers.length} {countNoun(session.speakers.length, "speaker", "speakers")}
            </dd>
          </div>
        ) : null}
      </dl>
      {fields.speakers ? (
        <ul className="program-session-card-speakers" aria-label="Session speakers">
          {session.speakers.length > 0 ? (
            session.speakers.map((speaker) => (
              <li key={speaker.id}>
                <span className="program-session-speaker-name">{speaker.name}</span>
                <span className="program-session-speaker-details">
                  {speakerDetails(speaker)}
                </span>
              </li>
            ))
          ) : (
            <li>
              <span className="program-session-speaker-details">Speaker details not provided</span>
            </li>
          )}
        </ul>
      ) : null}
      {fields.format || fields.track ? (
        <ul className="program-session-tags" aria-label="Session tags">
          {fields.format ? (
            <li className="program-session-tag program-session-tag-format">
              {session.format || "Format not provided"}
            </li>
          ) : null}
          {fields.track ? (
            <li className="program-session-tag program-session-tag-track">
              {session.trackName || "Track not provided"}
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
}

function AddToCalendarMenu({
  eventId,
  session,
  revisionId,
}: {
  eventId: string;
  session: PublicProgramSession;
  revisionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const icsPath = publicProgramCalendarUrl(eventId, session.id, revisionId);
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://chartstead.local";
  const targets = buildCalendarAddTargets({
    origin,
    icsPath,
    title: session.title,
    description: session.description,
    location: roomLabel(session),
    startsAt: session.startsAt,
    endsAt: session.endsAt,
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setCopied(false);
  }, [session.id]);

  async function copyIcsUrl() {
    try {
      await navigator.clipboard.writeText(targets.icsUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="program-calendar" ref={rootRef}>
      <button
        type="button"
        className="program-calendar-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        Add to calendar
      </button>
      {open ? (
        <div className="program-calendar-menu" role="menu" aria-label="Add to calendar">
          <p className="program-calendar-menu-label">Choose a calendar</p>
          {targets.googleUrl ? (
            <a
              role="menuitem"
              className="program-calendar-option"
              href={targets.googleUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              Google Calendar
            </a>
          ) : (
            <span className="program-calendar-option is-disabled" aria-disabled="true">
              Google Calendar (needs a scheduled time)
            </span>
          )}
          {targets.outlookUrl ? (
            <a
              role="menuitem"
              className="program-calendar-option"
              href={targets.outlookUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              Outlook Calendar
            </a>
          ) : (
            <span className="program-calendar-option is-disabled" aria-disabled="true">
              Outlook Calendar (needs a scheduled time)
            </span>
          )}
          <a
            role="menuitem"
            className="program-calendar-option"
            href={targets.webcalUrl}
            onClick={() => setOpen(false)}
          >
            System calendar (Apple / other)
          </a>
          <button
            type="button"
            role="menuitem"
            className="program-calendar-option"
            onClick={() => void copyIcsUrl()}
          >
            {copied ? "ICS URL copied" : "Copy ICS URL"}
          </button>
          <a
            role="menuitem"
            className="program-calendar-option program-calendar-option-muted"
            href={targets.icsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            Open ICS feed
          </a>
          {!targets.hasSchedule ? (
            <p className="program-calendar-hint">
              Time is still TBD — subscribe with the ICS URL and updates can follow once
              scheduled.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SpeakerListView({
  heading,
  speakers,
  sessions,
  fields,
  variant = "both",
  selectedSpeaker,
  expandedSpeakerBioIds,
  onSelectSpeaker,
  onDismissSpeaker,
  onSelectSession,
  onToggleSpeakerBiography,
}: {
  heading: string;
  speakers: PublicProgramSpeaker[];
  sessions: PublicProgramSession[];
  fields: PublicEmbedFieldVisibility;
  variant?: "both" | "directory" | "gallery";
  selectedSpeaker: PublicProgramSpeaker | null;
  expandedSpeakerBioIds: Set<string>;
  onSelectSpeaker: (speakerId: string | null) => void;
  onDismissSpeaker?: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleSpeakerBiography: (speakerId: string) => void;
}) {
  const showDirectory = variant !== "gallery";
  const showGallery = variant !== "directory";
  return (
    <section className={`program-speakers${variant === "directory" ? " is-directory" : ""}`} aria-labelledby="program-speakers-title" data-testid={variant === "directory" ? "speaker-list-layout" : undefined} data-discovery-mode={variant === "directory" ? "directory" : undefined}>
      <div className="program-speakers-header">
        <div>
          <h2 id="program-speakers-title">{heading}</h2>
          <p>Public-safe profiles share the same published sessions as the agenda.</p>
        </div>
      </div>
      {speakers.length === 0 ? (
        <p className="program-empty">No speakers for the current filters.</p>
      ) : (
        <div className="program-speaker-surfaces">
          {showDirectory ? (
            <section className="program-speaker-surface" aria-labelledby="program-speaker-directory-title">
              <h3 id="program-speaker-directory-title" className="sr-only">Speakers List</h3>
              <ul className="program-speaker-directory">
                {speakers.map((speaker) => (
                  <li key={speaker.id}>
                    <SpeakerDirectoryButton
                      speaker={speaker}
                      sessions={sessions.filter((session) => speaker.sessionIds.includes(session.id))}
                      selected={selectedSpeaker?.id === speaker.id}
                      fields={fields}
                      compact={false}
                      interactive={variant !== "directory"}
                      onSelect={() => onSelectSpeaker(speaker.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {showGallery ? (
            <section className="program-speaker-surface" aria-labelledby="program-speaker-gallery-title">
              <h3 id="program-speaker-gallery-title">Speaker Gallery</h3>
              <ul className="program-speaker-gallery">
                {speakers.map((speaker) => (
                  <li key={speaker.id}>
                    <SpeakerGalleryButton
                      speaker={speaker}
                      selected={selectedSpeaker?.id === speaker.id}
                      fields={fields}
                      onSelect={() => onSelectSpeaker(speaker.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {selectedSpeaker && variant !== "directory" ? (
        <SpeakerDetail
          speaker={selectedSpeaker}
          sessions={sessions.filter((session) => selectedSpeaker.sessionIds.includes(session.id))}
          fields={fields}
          biographyExpanded={expandedSpeakerBioIds.has(selectedSpeaker.id)}
          onToggleBiography={() => onToggleSpeakerBiography(selectedSpeaker.id)}
          onClose={onDismissSpeaker ?? (() => onSelectSpeaker(null))}
          onSelectSession={onSelectSession}
        />
      ) : null}
    </section>
  );
}

function SpeakerDirectoryButton({
  speaker,
  sessions,
  selected,
  fields,
  compact = false,
  interactive = true,
  onSelect,
}: {
  speaker: PublicProgramSpeaker;
  sessions: PublicProgramSession[];
  selected: boolean;
  fields: PublicEmbedFieldVisibility;
  compact?: boolean;
  interactive?: boolean;
  onSelect: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const content = (
    <>
      {fields.headshots ? <SpeakerAvatar speaker={speaker} /> : null}
      <span className="program-speaker-list-copy">
        <span className="program-speaker-list-heading">
          <strong>{speaker.name}</strong>
          {!compact && interactive ? <span>View profile&nbsp; ›</span> : null}
        </span>
        <span>{speaker.title || "Professional details pending"}</span>
        <b>{speaker.company || "Organization pending"}</b>
        {sessions.length > 0 ? (
          <span className={`program-speaker-session-links ${trackClass(sessions[0]!.trackId)}`}>
            <span className="program-speaker-session-links-text">
              {compact ? (
                <span>
                  {sessions[0]!.title}
                  {sessions.length > 1 ? ` +${sessions.length - 1} more` : ""}
                </span>
              ) : (
                sessions.map((session, index) => (
                  <span key={session.id}>
                    {index > 0 ? <i aria-hidden="true">•</i> : null}
                    {session.title}
                  </span>
                ))
              )}
            </span>
          </span>
        ) : null}
      </span>
    </>
  );
  if (!interactive) {
    return (
      <motion.article
        className="program-speaker-list-entry"
        data-motion-surface="speaker-card"
        whileHover={
          reduceMotion
            ? undefined
            : {
                y: -4,
                scale: 1.012,
                boxShadow: "0 14px 30px rgba(23, 73, 130, 0.16), inset 4px 0 0 #2f5d98",
              }
        }
        transition={premiumSpring}
      >
        {content}
      </motion.article>
    );
  }
  return (
    <Button
      type="button"
      className="program-speaker-list-entry"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {content}
    </Button>
  );
}

function SpeakerGalleryButton({
  speaker,
  selected,
  fields,
  onSelect,
}: {
  speaker: PublicProgramSpeaker;
  selected: boolean;
  fields: PublicEmbedFieldVisibility;
  onSelect: () => void;
}) {
  const subtitle = speaker.company?.trim() || (speaker.title?.trim() && speaker.title.trim().length < 42 ? speaker.title.trim() : "") || "Speaker";
  return (
    <button
      type="button"
      className={`program-speaker-gallery-card${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {fields.headshots ? <SpeakerAvatar speaker={speaker} large /> : null}
      <span>
        <strong>{speaker.name}</strong>
        <span>{subtitle}</span>
      </span>
    </button>
  );
}

function SpeakerAvatar({
  speaker,
  large = false,
  compact = false,
}: {
  speaker: PublicProgramSpeaker;
  large?: boolean;
  compact?: boolean;
}) {
  const className = large
    ? "program-speaker-avatar is-large"
    : compact
      ? "program-speaker-avatar is-compact"
      : "program-speaker-avatar";
  return (
    <span className={className}>
      {speaker.headshotUrl ? <img src={speaker.headshotUrl} alt={`Portrait of ${speaker.name}`} /> : <span aria-hidden="true">{speakerInitials(speaker)}</span>}
    </span>
  );
}

function SpeakerDetail({
  speaker,
  sessions,
  fields,
  biographyExpanded,
  onToggleBiography,
  onClose,
  complementary = false,
  onSelectSession,
}: {
  speaker: PublicProgramSpeaker;
  sessions: PublicProgramSession[];
  fields: PublicEmbedFieldVisibility;
  biographyExpanded: boolean;
  onToggleBiography: () => void;
  onClose?: () => void;
  complementary?: boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  const biography = speaker.biography.trim();
  const longBiography = biography.length > 220;
  const visibleBiography =
    longBiography && !biographyExpanded ? truncateDescription(biography, 220) : biography;
  const professionalLinks = [
    ["LinkedIn", speaker.socialLinks?.linkedin],
    ["X", speaker.socialLinks?.x],
    ["GitHub", speaker.socialLinks?.github],
    ["Website", speaker.socialLinks?.website],
  ].filter((link): link is [string, string] => Boolean(link[1]));

  return (
    <article
      className="signal-speaker-panel-content program-speaker-detail"
      role={complementary ? "complementary" : undefined}
      aria-label={complementary ? `Speaker profile: ${speaker.name}` : speaker.name}
    >
      <header className="popup-card-header">
        <p className="popup-eyebrow">Speaker profile</p>
        {onClose ? (
          <Button
            type="button"
            className="popup-close-btn"
            aria-label="Close speaker profile"
            onClick={onClose}
          >
            ×
          </Button>
        ) : null}
      </header>

      <div className="signal-speaker-intro">
        {fields.headshots ? <SpeakerAvatar speaker={speaker} large /> : null}
        <div>
          <h2>{speaker.name}</h2>
          <p>{speakerSubtitle(speaker)}</p>
          {speaker.company ? <p>{speaker.company}</p> : null}
        </div>
      </div>

      <section className="signal-speaker-section">
        <h3>About {speaker.name.split(" ")[0]}</h3>
        <p>{fields.biography && visibleBiography ? visibleBiography : "Biography pending."}</p>
        {fields.biography && longBiography ? (
          <button
            type="button"
            className="signal-bio-toggle"
            aria-expanded={biographyExpanded}
            onClick={onToggleBiography}
          >
            {biographyExpanded ? "Collapse biography" : "Show full biography"}
          </button>
        ) : null}
      </section>

      {professionalLinks.length > 0 ? (
        <ul className="signal-speaker-links" aria-label={`Professional links for ${speaker.name}`}>
          {professionalLinks.map(([label, url]) => (
            <li key={label}>
              <a href={url} target="_blank" rel="noreferrer">
                {label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="signal-speaker-section">
        <h3>Linked Sessions ({sessions.length})</h3>
        {sessions.length === 0 ? (
          <p className="program-empty">No sessions match the current filters.</p>
        ) : (
          <ul className="signal-linked-sessions">
            {sessions.map((session) => (
              <li key={session.id}>
                <button type="button" onClick={() => onSelectSession(session.id)}>
                  <div>
                    <strong>{session.title}</strong>
                    <span>
                      {dateTimeLabel(session)} · {roomLabel(session)}
                    </span>
                  </div>
                  <b>›</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
