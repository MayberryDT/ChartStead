import type { ReactNode } from "react";

import markOnDarkUrl from "../design/assets/brand/chartstead-mark-on-dark.png";
import type {
  EventListResponse,
  EventRecord,
  OrganizerPrincipal,
} from "../shared/events";
import { AppSelect } from "./AppSelect";

export const navItems = [
  "Overview",
  "Submissions",
  "Forms",
  "Speakers",
  "Agenda",
  "Messages",
  "Embeds",
  "Settings",
] as const;

export type NavItem = (typeof navItems)[number];

function NavIcon({ item }: { item: NavItem }) {
  const paths: Record<NavItem, ReactNode> = {
    Overview: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </>
    ),
    Submissions: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    ),
    Forms: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    Speakers: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
    Agenda: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="1" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    Messages: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="m22 6-10 7L2 6" />
      </>
    ),
    Embeds: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m9 9-3 3 3 3M15 9l3 3-3 3" />
      </>
    ),
    Settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[item]}
    </svg>
  );
}

function formatEventWindow(event: EventRecord) {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${event.startsOn}T00:00:00Z`))} – ${format.format(
    new Date(`${event.endsOn}T00:00:00Z`),
  )}`;
}

function navHref(item: NavItem, eventId: string) {
  switch (item) {
    case "Overview":
      return `/e/${eventId}`;
    case "Submissions":
      return `/e/${eventId}/submissions`;
    case "Forms":
      return `/e/${eventId}/forms`;
    case "Agenda":
      return `/e/${eventId}/agenda`;
    case "Messages":
      return `/e/${eventId}/messages`;
    case "Speakers":
      return `/e/${eventId}/speakers`;
    case "Embeds":
      return `/e/${eventId}/embeds`;
    case "Settings":
      return `/e/${eventId}/settings`;
  }
}

export function OrganizerShell({
  data,
  event,
  activeNav,
  title,
  meta,
  currentRole,
  onNavigate,
  onEventChange,
  onCreateEvent,
  identity,
  tools,
  actions,
  children,
}: {
  data: EventListResponse;
  event: EventRecord;
  activeNav: NavItem;
  title: string;
  meta: string;
  currentRole: OrganizerPrincipal["role"];
  onNavigate: (item: NavItem) => void;
  onEventChange: (eventId: string) => void;
  onCreateEvent: () => void;
  identity: ReactNode;
  tools?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app organizer-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ChartStead home">
          <img src={markOnDarkUrl} width="32" height="32" alt="" />
          <span className="brand-text">
            <span className="brand-name">ChartStead</span>
            <span className="brand-desc">Conference Programming</span>
          </span>
        </a>
        <nav className="nav" aria-label="Organizer">
          {navItems.map((item) => (
            <a
              key={item}
              href={navHref(item, event.id)}
              aria-current={activeNav === item ? "page" : undefined}
              onClick={(click) => {
                click.preventDefault();
                onNavigate(item);
              }}
            >
              <NavIcon item={item} />
              <span>{item}</span>
              {item === "Submissions" ? (
                <span className="nav-count">{event.submissionCount}</span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-session" aria-label="Signed-in account">
          <strong>{data.principal.displayName}</strong>
          <small>{currentRole === "admin" ? "Event administrator" : "Track reviewer"}</small>
        </div>
        <div className="sidebar-event-window" aria-label="Event dates">
          <strong>{formatEventWindow(event)}</strong>
          <small>{event.timezone.replaceAll("_", " ")}</small>
        </div>
        <div className="event-switcher">
          <AppSelect
            label="Event"
            value={event.id}
            options={data.events.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
            }))}
            onValueChange={onEventChange}
            variant="sidebar"
          />
          {currentRole === "admin" ? (
            <button type="button" className="event-create-trigger" onClick={onCreateEvent}>
              <span aria-hidden="true">＋</span>
              Create event
            </button>
          ) : null}
        </div>
      </aside>

      <main className="main">
        {identity || tools || actions ? (
          <header
            className={`shell-toolbar${tools && !identity ? " shell-toolbar-tools-only" : ""}`}
            data-polish-id="S-shell-topbar"
          >
            {identity ?? <h1 className="sr-only">{title}</h1>}
            {tools ? (
              <div className="topbar-tools" aria-label={`${title} tools`}>
                {tools}
              </div>
            ) : null}
            {actions ? <div className="topbar-actions">{actions}</div> : null}
          </header>
        ) : (
          <h1 className="sr-only">{title}</h1>
        )}
        {children}
      </main>
    </div>
  );
}
