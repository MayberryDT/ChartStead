import { useEffect, useState } from "react";

import markUrl from "../design/assets/brand/chartstead-mark-on-dark.png";
import { authClient } from "./auth-client";
import "./styles.css";

interface EventRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  tracks: string[];
  rooms: string[];
}

interface Principal {
  displayName: string;
  role: "admin";
}

type EventResponse =
  | { event: EventRecord; principal: Principal }
  | { error: string };

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; event: EventRecord; principal: Principal };

const navItems = [
  ["Overview", "overview"],
  ["Submissions", "submissions"],
  ["Speakers", "speakers"],
  ["Agenda", "agenda"],
  ["Messages", "messages"],
  ["Settings", "settings"],
] as const;

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

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/events/current", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as EventResponse;
        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (!response.ok || !("event" in body)) {
          throw new Error("error" in body ? body.error : "Unable to load event");
        }
        setState({
          status: "ready",
          event: body.event,
          principal: body.principal,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load event",
        });
      });

    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <div className="boot-state">Opening the event desk…</div>;
  }

  if (state.status === "unauthorized") {
    return (
      <main className="sign-in-shell">
        <section className="sign-in-panel" aria-labelledby="sign-in-title">
          <img src={markUrl} width="48" height="48" alt="" />
          <p className="eyebrow">ChartStead</p>
          <h1 id="sign-in-title">Conference programming, kept on course.</h1>
          <p>
            Sign in to open your event desk. The demo environment uses an
            isolated administrator over disposable data.
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              void authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
              });
            }}
          >
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <p className="eyebrow">Event unavailable</p>
          <h1>ChartStead could not open the event desk.</h1>
          <p>{state.message}</p>
          <button className="primary-action" type="button" onClick={() => location.reload()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  const { event, principal } = state;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ChartStead home">
          <img src={markUrl} width="32" height="32" alt="" />
          <span>
            <strong>ChartStead</strong>
            <small>Conference programming</small>
          </span>
        </a>

        <nav aria-label="Organizer">
          {navItems.map(([label, key], index) => (
            <a key={key} href={`#${key}`} aria-current={index === 0 ? "page" : undefined}>
              <span className="nav-mark" aria-hidden="true" />
              {label}
              {key === "submissions" ? <span className="nav-count">47</span> : null}
            </a>
          ))}
        </nav>

        <button className="event-switcher" type="button">
          <span>Event</span>
          <strong>{event.name}</strong>
        </button>
      </aside>

      <main className="main-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Event overview</p>
            <h1>{event.name}</h1>
            <p className="topbar-meta">{formatDateRange(event.startsOn, event.endsOn)}</p>
          </div>
          <div className="operator">
            <span className="operator-avatar" aria-hidden="true">DA</span>
            <span>
              <strong>{principal.displayName}</strong>
              <small>Event administrator</small>
            </span>
          </div>
        </header>

        <div className="workspace">
          <section className="readiness" aria-labelledby="readiness-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Program readiness</p>
                <h2 id="readiness-title">The working chart</h2>
              </div>
              <span className="status-indicator">Seeded demo</span>
            </div>

            <div className="metric-strip">
              <div><strong>47</strong><span>submissions</span></div>
              <div><strong>18</strong><span>unreviewed</span></div>
              <div aria-label={`${event.tracks.length} tracks`}><strong>{event.tracks.length}</strong><span>tracks</span></div>
              <div aria-label={`${event.rooms.length} rooms`}><strong>{event.rooms.length}</strong><span>rooms</span></div>
            </div>
          </section>

          <div className="operations-grid">
            <section className="operations-panel" aria-labelledby="tracks-title">
              <div className="panel-heading">
                <h2 id="tracks-title">Tracks</h2>
                <span>{event.tracks.length} active</span>
              </div>
              <ul className="operation-list">
                {event.tracks.map((track, index) => (
                  <li key={track}>
                    <span className={`track-line track-${index + 1}`} aria-hidden="true" />
                    <strong>{track}</strong>
                    <span>{[14, 12, 11, 10][index] ?? 0} proposals</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="operations-panel" aria-labelledby="rooms-title">
              <div className="panel-heading">
                <h2 id="rooms-title">Rooms</h2>
                <span>{event.rooms.length} configured</span>
              </div>
              <ul className="operation-list">
                {event.rooms.map((room, index) => (
                  <li key={room}>
                    <span className="room-index">0{index + 1}</span>
                    <strong>{room}</strong>
                    <span>Ready</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
