import { Button } from "@base-ui/react/button";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

import markOnDarkUrl from "../design/assets/brand/chartstead-mark-on-dark.png";
import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import type { EventListResponse, EventRecord } from "../shared/events";
import { authClient } from "./auth-client";
import "./styles.css";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const navItems = [
  "Overview",
  "Submissions",
  "Speakers",
  "Agenda",
  "Messages",
  "Settings",
] as const;

async function fetchEvents(): Promise<EventListResponse> {
  const response = await fetch("/api/events");
  const body = (await response.json()) as EventListResponse | { error: string };
  if (!response.ok || !("events" in body)) {
    throw new ApiError("error" in body ? body.error : "Unable to load events", response.status);
  }
  return body;
}

function formatDateRange(startsOn: string, endsOn: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${startsOn}T00:00:00Z`))} – ${format.format(
    new Date(`${endsOn}T00:00:00Z`),
  )}`;
}

function NavIcon({ item }: { item: (typeof navItems)[number] }) {
  const paths: Record<(typeof navItems)[number], React.ReactNode> = {
    Overview: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    Submissions: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    Speakers: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>,
    Agenda: <><rect x="3" y="4" width="18" height="18" rx="1"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    Messages: <><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></>,
    Settings: <><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[item]}</svg>;
}

function LoadingShell() {
  return (
    <div className="app-shell shell-skeleton" aria-busy="true" aria-label="Opening the event desk">
      <aside className="sidebar"><div className="skeleton-mark" /></aside>
      <main className="main-workspace">
        <header className="topbar"><div className="skeleton-line skeleton-title" /></header>
        <div className="workspace"><div className="skeleton-panel" /><div className="skeleton-panel short" /></div>
      </main>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const result = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setSending(false);
    setMessage(result.error ? result.error.message ?? "Unable to send sign-in link." : "Check your email for a secure sign-in link.");
  }

  return (
    <main className="sign-in-shell">
      <section className="sign-in-panel" aria-labelledby="sign-in-title">
        <img src={markOnLightUrl} width="48" height="48" alt="" />
        <p className="eyebrow">ChartStead</p>
        <h1 id="sign-in-title">Conference programming and speaker management.</h1>
        <p>Sign in to open your event desk. Production access is granted per event.</p>
        <Button className="primary-action" onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}>
          Continue with Google
        </Button>
        <div className="sign-in-divider"><span>or use a secure email link</span></div>
        <form className="magic-link-form" onSubmit={requestMagicLink}>
          <label htmlFor="email">Work email</label>
          <div>
            <input id="email" name="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button className="secondary-action" type="submit" disabled={sending} focusableWhenDisabled>
              {sending ? "Sending…" : "Email sign-in link"}
            </Button>
          </div>
        </form>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}

function EventDesk({ data }: { data: EventListResponse }) {
  const [selectedEventId, setSelectedEventId] = useState(() => localStorage.getItem("chartstead:event"));
  const [activeNav, setActiveNav] = useState<(typeof navItems)[number]>("Overview");
  const event = data.events.find((candidate) => candidate.id === selectedEventId) ?? data.events[0];

  if (!event) {
    return <main className="sign-in-shell"><section className="error-panel" role="alert"><h1>No events are assigned to this account.</h1></section></main>;
  }

  function selectEvent(eventId: string) {
    localStorage.setItem("chartstead:event", eventId);
    setSelectedEventId(eventId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ChartStead home">
          <img src={markOnDarkUrl} width="32" height="32" alt="" />
          <span className="brand-text"><strong>ChartStead</strong><small>Conference programming</small></span>
        </a>
        <nav className="nav" aria-label="Organizer">
          {navItems.map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} aria-current={activeNav === item ? "page" : undefined} onClick={() => setActiveNav(item)}>
              <NavIcon item={item} /><span>{item}</span>
              {item === "Submissions" ? <span className="nav-count">{event.submissionCount}</span> : null}
            </a>
          ))}
        </nav>
        <label className="event-switcher">
          <span className="event-switcher-label">Event</span>
          <select aria-label="Event" value={event.id} onChange={(change) => selectEvent(change.target.value)}>
            {data.events.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </label>
      </aside>

      <main className="main-workspace">
        <header className="topbar">
          <div><h1>{event.name}</h1><p className="topbar-meta">{formatDateRange(event.startsOn, event.endsOn)}</p></div>
          <div className="topbar-spacer" />
          <div className="operator"><span className="operator-avatar" aria-hidden="true">{data.principal.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{data.principal.displayName}</strong><small>Event administrator</small></span></div>
        </header>

        <div className="workspace">
          <section className="readiness" aria-labelledby="readiness-title">
            <div className="section-heading"><div><p className="eyebrow">Program readiness</p><h2 id="readiness-title">The working chart</h2></div><span className="status-indicator">Seeded demo</span></div>
            <div className="metric-strip">
              <div aria-label={`${event.submissionCount} submissions`}><strong>{event.submissionCount}</strong><span>submissions</span></div>
              <div><strong>{event.unreviewedCount}</strong><span>unreviewed</span></div>
              <div aria-label={`${event.tracks.length} tracks`}><strong>{event.tracks.length}</strong><span>tracks</span></div>
              <div aria-label={`${event.rooms.length} rooms`}><strong>{event.rooms.length}</strong><span>rooms</span></div>
            </div>
          </section>

          <div className="operations-grid">
            <section className="operations-panel" aria-labelledby="tracks-title">
              <div className="panel-heading"><h2 id="tracks-title">Tracks</h2><span>{event.tracks.length} active</span></div>
              <ul className="operation-list">{event.tracks.map((track, index) => <li key={track.id}><span className={`track-line track-${index + 1}`} aria-hidden="true"/><strong>{track.name}</strong><span>{track.proposalCount} proposals</span></li>)}</ul>
            </section>
            <section className="operations-panel" aria-labelledby="rooms-title">
              <div className="panel-heading"><h2 id="rooms-title">Rooms</h2><span>{event.rooms.length} configured</span></div>
              <ul className="operation-list">{event.rooms.map((room, index) => <li key={room.id}><span className="room-index">{String(index + 1).padStart(2, "0")}</span><strong>{room.name}</strong><span>{room.readiness === "ready" ? "Ready" : "Pending"}</span></li>)}</ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export function App() {
  const query = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) return <main className="sign-in-shell"><section className="error-panel" role="alert"><p className="eyebrow">Event unavailable</p><h1>ChartStead could not open the event desk.</h1><p>{query.error.message}</p><Button className="primary-action" onClick={() => void query.refetch()}>Try again</Button></section></main>;
  return <EventDesk data={query.data} />;
}
