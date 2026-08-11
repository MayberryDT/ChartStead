import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PublicProgramFilters,
  PublicProgramResponse,
  PublicProgramSession,
  PublicProgramSpeaker,
} from "../shared/events";
import {
  buildCalendarAddTargets,
  filterPublicSessions,
  filterPublicSpeakers,
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

export function PublicProgramRenderer({
  data,
  mode = "page",
  selectedSessionId = null,
  onSelectSession,
}: {
  data: PublicProgramResponse;
  mode?: "page" | "embed";
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string | null) => void;
}) {
  const [filters, setFilters] = useState<PublicProgramFilters>({});
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId = selectedSessionId ?? internalSelected;

  const selectSession = (sessionId: string | null) => {
    if (onSelectSession) onSelectSession(sessionId);
    else setInternalSelected(sessionId);
  };

  const sessions = useMemo(
    () => filterPublicSessions(data.sessions, filters),
    [data.sessions, filters],
  );
  const visibleIds = useMemo(
    () => new Set(sessions.map((session) => session.id)),
    [sessions],
  );
  const speakers = useMemo(
    () => filterPublicSpeakers(data.speakers, visibleIds),
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

  const accentStyle = {
    ["--program-accent" as string]: data.event.themeAccent,
  };

  return (
    <div
      className={`program-renderer mode-${mode}`}
      style={accentStyle}
      data-testid="public-program-renderer"
    >
      <header className="program-header">
        <p className="eyebrow">Public program</p>
        <h1 id="program-title">{data.event.name}</h1>
        <p>
          {data.event.startsOn === data.event.endsOn
            ? dayLabel(data.event.startsOn)
            : `${dayLabel(data.event.startsOn)} – ${dayLabel(data.event.endsOn)}`}
          {" · "}
          Revision {data.revision.version}
          {data.revision.isCurrent ? " (current)" : ""}
        </p>
      </header>

      <section className="program-filters" aria-label="Program filters">
        <label>
          Day
          <select
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
          Room
          <select
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
          Type
          <select
            value={filters.format ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                format: event.target.value || undefined,
              }))
            }
          >
            <option value="">All types</option>
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

      <p className="program-counts" aria-live="polite">
        <strong>{sessions.length}</strong> sessions · <strong>{speakers.length}</strong>{" "}
        speakers
      </p>

      <div className="program-layout">
        <section className="program-schedule" aria-labelledby="program-schedule-title">
          <h2 id="program-schedule-title">Schedule</h2>
          {sessions.length === 0 ? (
            <p className="program-empty">No sessions match these filters.</p>
          ) : (
            <ul className="program-session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={`program-session-card ${trackClass(session.trackId)}${
                      selectedId === session.id ? " is-selected" : ""
                    }`}
                    onClick={() =>
                      selectSession(selectedId === session.id ? null : session.id)
                    }
                  >
                    <span className="program-session-time">{timeLabel(session)}</span>
                    <span className="program-session-title">{session.title}</span>
                    <span className="program-session-meta">
                      {session.trackName} · {roomLabel(session)} · {session.format}
                    </span>
                    <span className="program-session-speakers">
                      {session.speakers.map((speaker) => speaker.name).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="program-detail" aria-labelledby="program-detail-title">
          <h2 id="program-detail-title">Session</h2>
          {selected ? (
            <article className="program-detail-card">
              <h3>{selected.title}</h3>
              <dl className="program-dl">
                <div>
                  <dt>Time</dt>
                  <dd>{timeLabel(selected)}</dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>{roomLabel(selected)}</dd>
                </div>
                <div>
                  <dt>Track</dt>
                  <dd>{selected.trackName}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{selected.format}</dd>
                </div>
              </dl>
              {selected.description ? <p>{selected.description}</p> : null}
              <h4>Speakers</h4>
              <ul className="program-inline-speakers">
                {selected.speakers.map((speaker) => (
                  <li key={speaker.id}>{speaker.name}</li>
                ))}
              </ul>
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

        <section className="program-speakers" aria-labelledby="program-speakers-title">
          <h2 id="program-speakers-title">Speakers</h2>
          {speakers.length === 0 ? (
            <p className="program-empty">No speakers for the current filters.</p>
          ) : (
            <ul className="program-speaker-list">
              {speakers.map((speaker) => (
                <SpeakerCard
                  key={speaker.id}
                  speaker={speaker}
                  sessions={data.sessions}
                  onSelectSession={selectSession}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
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

function SpeakerCard({
  speaker,
  sessions,
  onSelectSession,
}: {
  speaker: PublicProgramSpeaker;
  sessions: PublicProgramSession[];
  onSelectSession: (sessionId: string) => void;
}) {
  const linked = sessions.filter((session) => speaker.sessionIds.includes(session.id));
  return (
    <li className="program-speaker-card">
      <div className="program-speaker-avatar" aria-hidden="true">
        {speaker.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0] ?? "")
          .join("")
          .toUpperCase()}
      </div>
      <div>
        <h3>{speaker.name}</h3>
        {speaker.biography ? <p>{speaker.biography}</p> : null}
        <ul className="program-speaker-sessions">
          {linked.map((session) => (
            <li key={session.id}>
              <button type="button" onClick={() => onSelectSession(session.id)}>
                {session.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
