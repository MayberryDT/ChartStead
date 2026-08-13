import { useEffect, useMemo, useRef, useState } from "react";

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
import { publicProgramCalendarUrl } from "./api";

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

function trackClass(trackId: string): string {
  if (!trackId) return "track-1";
  const known = [
    "platform",
    "program-ops",
    "design-systems",
    "community",
    "agents",
    "models",
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

function speakerSessionMeta(session: PublicProgramSession): string {
  return `${dateTimeLabel(session)} · ${roomLabel(session)}`;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
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
}) {
  const [internalFilters, setInternalFilters] = useState<PublicProgramFilters>({});
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
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [expandedSpeakerBioIds, setExpandedSpeakerBioIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedId = selectedSessionId !== undefined ? selectedSessionId : internalSelected;

  const selectSession = (sessionId: string | null) => {
    if (onSelectSession) onSelectSession(sessionId);
    else setInternalSelected(sessionId);
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
      filterPublicSpeakers(data.speakers, visibleIds).sort((a, b) =>
        speakerSortKey(a).localeCompare(speakerSortKey(b)),
      ),
    [data.speakers, visibleIds],
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
    data.speakers.find((speaker) => speaker.id === selectedSpeakerId) ??
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
  const currentWidget = widget ?? "program";

  return (
    <div
      className={`program-renderer mode-${mode} widget-${currentWidget} theme-${theme}`}
      style={accentStyle}
      data-testid="public-program-renderer"
    >
      <header className="program-header">
        <p className="eyebrow">{widgetLabel(currentWidget)}</p>
        <h1 id="program-title">{data.event.name}</h1>
        <p>
          {data.event.startsOn === data.event.endsOn
            ? dayLabel(data.event.startsOn)
            : `${dayLabel(data.event.startsOn)} – ${dayLabel(data.event.endsOn)}`}
          {" · "}
          Published revision {data.revision.version}
          {data.revision.isCurrent ? " (current)" : " (archived)"}
        </p>
      </header>

      <section className="program-filters" aria-label="Program filters">
        <label className="program-search-field">
          Search sessions or speakers
          <input
            id="program-search"
            type="search"
            value={filters.query ?? ""}
            placeholder="Search by title or speaker"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label>
          Day
          <select
            id="program-day-filter"
            value={filters.day ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                day: event.target.value || undefined,
              }))
            }
          >
            <option value="">All days</option>
            {days.map((day) => (
              <option key={day} value={day}>
                {day === "tbd" ? "Time TBD" : dayLabel(day)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Track
          <select
            id="program-track-filter"
            value={filters.trackId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                trackId: event.target.value || undefined,
              }))
            }
          >
            <option value="">All tracks</option>
            {data.event.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            id="program-location-filter"
            value={filters.roomId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                roomId: event.target.value || undefined,
              }))
            }
          >
            <option value="">All rooms</option>
            {data.event.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
            <option value="tbd">Location pending</option>
          </select>
        </label>
        <label>
          Format
          <select
            id="program-format-filter"
            value={filters.format ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                format: event.target.value || undefined,
              }))
            }
          >
            <option value="">All formats</option>
            {formats.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speaker
          <select
            id="program-speaker-filter"
            value={filters.speakerId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                speakerId: event.target.value || undefined,
              }))
            }
          >
            <option value="">All speakers</option>
            {data.speakers.map((speaker) => (
              <option key={speaker.id} value={speaker.id}>
                {speaker.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <p className="program-counts" role="status" aria-live="polite" data-testid="program-result-count">
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
          onSelectSpeaker={setSelectedSpeakerId}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      ) : currentWidget === "sessions" ? (
        <SessionListView
          sessions={sessions}
          selectedId={selectedId}
          expandedSessionIds={expandedSessionIds}
          fields={fields}
          onSelectSession={selectSession}
          onToggleDescription={toggleDescription}
        />
      ) : currentWidget === "speakers" || currentWidget === "speaker-gallery" ? (
        <SpeakerListView
          heading={currentWidget === "speaker-gallery" ? "Speaker Gallery" : "Speakers List"}
          speakers={speakers}
          sessions={sessions}
          fields={fields}
          variant={currentWidget === "speaker-gallery" ? "gallery" : "directory"}
          selectedSpeaker={selectedSpeaker}
          expandedSpeakerBioIds={expandedSpeakerBioIds}
          onSelectSpeaker={setSelectedSpeakerId}
          onSelectSession={selectSession}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      ) : currentWidget === "itinerary" ? (
        <ItineraryView
          sessions={sessions}
          timeZone={data.event.timezone ?? "UTC"}
          selectedId={selectedId}
          expandedSessionIds={expandedSessionIds}
          fields={fields}
          onSelectSession={selectSession}
          onToggleDescription={toggleDescription}
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
          onSelectSpeaker={setSelectedSpeakerId}
          onToggleSpeakerBiography={toggleSpeakerBiography}
        />
      )}
    </div>
  );
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
  return (
    <div className="program-layout">
      <SessionListView
        sessions={sessions}
        selectedId={selectedId}
        expandedSessionIds={expandedSessionIds}
        fields={fields}
        onSelectSession={onSelectSession}
        onToggleDescription={onToggleDescription}
      />

      <section className="program-detail" aria-labelledby="program-detail-title">
        <h2 id="program-detail-title">Session</h2>
        {selected ? (
          <article className="program-detail-card">
            <h3>{fields.title ? selected.title : "Session details"}</h3>
            <dl className="program-dl">
              {fields.dateTime ? (
                <div>
                  <dt>Time</dt>
                  <dd>{timeLabel(selected)}</dd>
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
                  <dd>{selected.trackName}</dd>
                </div>
              ) : null}
              {fields.format ? (
                <div>
                  <dt>Type</dt>
                  <dd>{selected.format}</dd>
                </div>
              ) : null}
            </dl>
            {fields.description && selected.description ? <p>{selected.description}</p> : null}
            {fields.speakers ? (
              <>
                <h4>Speakers</h4>
                <ul className="program-inline-speakers">
                  {selected.speakers.map((speaker) => (
                    <li key={speaker.id}>{speaker.name}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <AddToCalendarMenu
              eventId={data.event.id}
              session={selected}
              revisionId={
                data.revision.isCurrent ? undefined : data.revision.id
              }
            />
          </article>
        ) : (
          <p className="program-empty">Select a session for details and calendar.</p>
        )}
      </section>

      <SpeakerListView
        heading="Speakers"
        speakers={speakers}
        sessions={sessions}
        fields={fields}
        selectedSpeaker={selectedSpeaker}
        expandedSpeakerBioIds={expandedSpeakerBioIds}
        onSelectSpeaker={onSelectSpeaker}
        onSelectSession={onSelectSession}
        onToggleSpeakerBiography={onToggleSpeakerBiography}
      />
    </div>
  );
}

function SessionListView({
  sessions,
  selectedId,
  expandedSessionIds,
  fields,
  onSelectSession,
  onToggleDescription,
}: {
  sessions: PublicProgramSession[];
  selectedId: string | null;
  expandedSessionIds: Set<string>;
  fields: PublicEmbedFieldVisibility;
  onSelectSession: (sessionId: string | null) => void;
  onToggleDescription: (sessionId: string) => void;
}) {
  return (
    <section className="program-schedule" aria-labelledby="program-schedule-title">
      <h2 id="program-schedule-title">Schedule</h2>
      {sessions.length === 0 ? (
        <p className="program-empty">No sessions match these filters.</p>
      ) : (
        <ul className="program-session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionCard
                session={session}
                selected={selectedId === session.id}
                expanded={expandedSessionIds.has(session.id)}
                fields={fields}
                onSelect={() => onSelectSession(selectedId === session.id ? null : session.id)}
                onToggleDescription={() => onToggleDescription(session.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
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
  onSelectSession: (sessionId: string) => void;
  onToggleSpeakerBiography: (speakerId: string) => void;
}) {
  const showDirectory = variant !== "gallery";
  const showGallery = variant !== "directory";
  return (
    <section className="program-speakers" aria-labelledby="program-speakers-title">
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
              <h3 id="program-speaker-directory-title">Speakers List</h3>
              <ul className="program-speaker-directory">
                {speakers.map((speaker) => (
                  <li key={speaker.id}>
                    <SpeakerDirectoryButton
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
      {selectedSpeaker ? (
        <SpeakerDetail
          speaker={selectedSpeaker}
          sessions={sessions.filter((session) => selectedSpeaker.sessionIds.includes(session.id))}
          fields={fields}
          biographyExpanded={expandedSpeakerBioIds.has(selectedSpeaker.id)}
          onToggleBiography={() => onToggleSpeakerBiography(selectedSpeaker.id)}
          onClose={() => onSelectSpeaker(null)}
          onSelectSession={onSelectSession}
        />
      ) : null}
    </section>
  );
}

function SpeakerDirectoryButton({
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
  return (
    <button
      type="button"
      className="program-speaker-list-entry"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {fields.headshots ? <SpeakerAvatar speaker={speaker} /> : null}
      <span>
        <strong>{speaker.name}</strong>
        <span>{speakerSubtitle(speaker)}</span>
      </span>
    </button>
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
  return (
    <button
      type="button"
      className="program-speaker-gallery-card"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {fields.headshots ? <SpeakerAvatar speaker={speaker} large /> : null}
      <span>
        <strong>{speaker.name}</strong>
        <span>{speakerSubtitle(speaker)}</span>
      </span>
    </button>
  );
}

function SpeakerAvatar({
  speaker,
  large = false,
}: {
  speaker: PublicProgramSpeaker;
  large?: boolean;
}) {
  return (
    <span className={large ? "program-speaker-avatar is-large" : "program-speaker-avatar"} aria-hidden="true">
      {speaker.headshotUrl ? <img src={speaker.headshotUrl} alt="" /> : speakerInitials(speaker)}
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
  onSelectSession,
}: {
  speaker: PublicProgramSpeaker;
  sessions: PublicProgramSession[];
  fields: PublicEmbedFieldVisibility;
  biographyExpanded: boolean;
  onToggleBiography: () => void;
  onClose: () => void;
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
    <article className="program-speaker-detail" aria-label={speaker.name}>
      <div className="program-speaker-detail-header">
        {fields.headshots ? <SpeakerAvatar speaker={speaker} large /> : null}
        <div>
          <h3>{speaker.name}</h3>
          <p>{speakerSubtitle(speaker)}</p>
        </div>
        <button type="button" className="program-speaker-close" onClick={onClose}>
          Close
        </button>
      </div>
      <section>
        <h4>Biography</h4>
        <p>{fields.biography && visibleBiography ? visibleBiography : "Biography pending."}</p>
        {fields.biography && longBiography ? (
          <button
            type="button"
            className="program-speaker-bio-toggle"
            aria-expanded={biographyExpanded}
            onClick={onToggleBiography}
          >
            {biographyExpanded ? "Collapse biography" : "Show full biography"}
          </button>
        ) : null}
      </section>
      {professionalLinks.length > 0 ? (
        <ul className="program-speaker-links" aria-label={`Professional links for ${speaker.name}`}>
          {professionalLinks.map(([label, url]) => (
            <li key={label}>
              <a href={url} target="_blank" rel="noreferrer">{label}</a>
            </li>
          ))}
        </ul>
      ) : null}
      <section>
        <h4>Sessions</h4>
        {sessions.length === 0 ? (
          <p>No sessions match the current filters.</p>
        ) : (
          <ul className="program-speaker-sessions">
            {sessions.map((session) => (
              <li key={session.id}>
                <button type="button" onClick={() => onSelectSession(session.id)}>
                  {session.title}
                  <span>{speakerSessionMeta(session)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
