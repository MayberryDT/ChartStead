import { Button } from "@base-ui/react/button";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";

import markOnDarkUrl from "../design/assets/brand/chartstead-mark-on-dark.png";
import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import type { EventListResponse, EventRecord } from "../shared/events";
import { ApiError, fetchEvents } from "./api";
import { AppSelect } from "./AppSelect";
import { authClient } from "./auth-client";
import { AgendaWorkspace } from "./AgendaWorkspace";
import { OnboardingWorkspace } from "./OnboardingWorkspace";
import { SettingsWorkspace } from "./SettingsWorkspace";
import {
  SubmissionsWorkspace,
  type ProposalQueueState,
} from "./SubmissionsWorkspace";
import "./styles.css";

const navItems = [
  "Overview",
  "Submissions",
  "Speakers",
  "Agenda",
  "Messages",
  "Settings",
] as const;

type NavItem = (typeof navItems)[number];

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

function NavIcon({ item }: { item: NavItem }) {
  const paths: Record<NavItem, React.ReactNode> = {
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

function LoadingShell() {
  return (
    <div className="app shell-skeleton" aria-busy="true" aria-label="Opening the event desk">
      <aside className="sidebar">
        <div className="skeleton-mark" />
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="skeleton-line skeleton-title" />
        </header>
        <div className="workspace">
          <div className="skeleton-panel" />
          <div className="skeleton-panel short" />
        </div>
      </main>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [sending, setSending] = useState(false);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const result = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setSending(false);
    if (result.error) {
      setTone("error");
      setMessage(result.error.message ?? "Unable to send sign-in link.");
      return;
    }
    setTone("success");
    setMessage("Check your email for a secure sign-in link.");
  }

  return (
    <main className="sign-in-shell">
      <section className="sign-in-panel" aria-labelledby="sign-in-title">
        <img src={markOnLightUrl} width="48" height="48" alt="" />
        <p className="eyebrow">ChartStead</p>
        <h1 id="sign-in-title">Conference programming and speaker management.</h1>
        <p>Sign in to open your event desk. Production access is granted per event.</p>
        <Button
          className="primary-action"
          onClick={() =>
            void authClient.signIn.social({ provider: "google", callbackURL: "/" })
          }
        >
          Continue with Google
        </Button>
        <div className="sign-in-divider">
          <span>or use a secure email link</span>
        </div>
        <form className="magic-link-form" onSubmit={requestMagicLink}>
          <label htmlFor="email">Work email</label>
          <div>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(change) => setEmail(change.target.value)}
            />
            <Button
              className="secondary-action"
              type="submit"
              disabled={sending}
              focusableWhenDisabled
            >
              {sending ? "Sending…" : "Email sign-in link"}
            </Button>
          </div>
        </form>
        {message ? (
          <p className="form-message" data-tone={tone} role="status">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function OverviewWorkspace({ event }: { event: EventRecord }) {
  return (
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
          <div aria-label={`${event.submissionCount} submissions`}>
            <strong>{event.submissionCount}</strong>
            <span>submissions</span>
          </div>
          <div>
            <strong>{event.unreviewedCount}</strong>
            <span>unreviewed</span>
          </div>
          <div aria-label={`${event.tracks.length} tracks`}>
            <strong>{event.tracks.length}</strong>
            <span>tracks</span>
          </div>
          <div aria-label={`${event.rooms.length} rooms`}>
            <strong>{event.rooms.length}</strong>
            <span>rooms</span>
          </div>
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
              <li key={track.id}>
                <span
                  className={`track-line track-${index + 1}`}
                  aria-hidden="true"
                />
                <strong>{track.name}</strong>
                <span>{track.proposalCount} proposals</span>
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
              <li key={room.id}>
                <span className="room-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{room.name}</strong>
                <span>{room.readiness === "ready" ? "Ready" : "Pending"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function EventDesk({
  data,
  initialNav = "Overview",
  initialEventId = null,
  initialProposalId = null,
  initialQueue = { query: "", status: "all", track: "", sort: "newest" },
  repairReturnTo = null,
  repairField = null,
}: {
  data: EventListResponse;
  initialNav?: NavItem;
  initialEventId?: string | null;
  initialProposalId?: string | null;
  initialQueue?: ProposalQueueState;
  repairReturnTo?: string | null;
  repairField?: string | null;
}) {
  const navigate = useNavigate();
  const [selectedEventId, setSelectedEventId] = useState(() => {
    if (initialEventId && data.events.some((event) => event.id === initialEventId)) {
      localStorage.setItem("chartstead:event", initialEventId);
      return initialEventId;
    }
    const stored = localStorage.getItem("chartstead:event");
    if (stored && data.events.some((event) => event.id === stored)) {
      return stored;
    }
    return data.events[0]?.id ?? null;
  });
  const [activeNav, setActiveNav] = useState<NavItem>(initialNav);
  const event =
    data.events.find((candidate) => candidate.id === selectedEventId) ?? data.events[0];

  useEffect(() => {
    if (initialProposalId) return;
    const proposalId = sessionStorage.getItem("chartstead:return-focus-proposal");
    if (!proposalId) return;
    let frame = 0;
    let attempts = 0;
    const focusProposal = () => {
      const row = Array.from(
        document.querySelectorAll<HTMLTableRowElement>("tr[data-id]"),
      ).find((candidate) => candidate.dataset.id === proposalId);
      const link = row?.querySelector<HTMLAnchorElement>(".proposal-row-link");
      if (link) {
        link.focus();
        sessionStorage.removeItem("chartstead:return-focus-proposal");
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        frame = window.requestAnimationFrame(focusProposal);
      } else {
        sessionStorage.removeItem("chartstead:return-focus-proposal");
      }
    };
    frame = window.requestAnimationFrame(focusProposal);
    return () => window.cancelAnimationFrame(frame);
  }, [initialProposalId]);

  if (!event) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>No events are assigned to this account.</h1>
        </section>
      </main>
    );
  }

  function selectEvent(eventId: string) {
    localStorage.setItem("chartstead:event", eventId);
    setSelectedEventId(eventId);
    if (activeNav === "Submissions") {
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId },
        search: queueSearch(initialQueue),
      });
      return;
    }
    if (activeNav === "Agenda") {
      void navigate({
        to: "/e/$eventId/agenda",
        params: { eventId },
      });
    }
  }

  function selectNav(item: NavItem) {
    setActiveNav(item);
    if (item === "Submissions") {
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId: event.id },
        search: queueSearch(initialQueue),
      });
      return;
    }
    if (item === "Agenda") {
      void navigate({
        to: "/e/$eventId/agenda",
        params: { eventId: event.id },
      });
      return;
    }
    if (item === "Speakers") {
      return;
    }
    if (item === "Overview") {
      void navigate({ to: "/" });
    }
  }

  function selectProposal(proposalId: string) {
    void navigate({
      to: "/e/$eventId/submissions/$proposalId",
      params: { eventId: event.id, proposalId },
      search: queueSearch(initialQueue),
    });
  }

  async function closeProposal() {
    const proposalId = initialProposalId;
    if (proposalId) {
      sessionStorage.setItem("chartstead:return-focus-proposal", proposalId);
    }
    await navigate({
      to: "/e/$eventId/submissions",
      params: { eventId: event.id },
      search: queueSearch(initialQueue),
    });
  }

  function changeQueue(next: ProposalQueueState) {
    void navigate({
      to: initialProposalId
        ? "/e/$eventId/submissions/$proposalId"
        : "/e/$eventId/submissions",
      params: initialProposalId
        ? { eventId: event.id, proposalId: initialProposalId }
        : { eventId: event.id },
      search: queueSearch(next),
      replace: true,
    });
  }

  const cfpHref = `/e/${event.id}/cfp`;
  const formsHref = `/e/${event.id}/forms`;
  const topbarTitle =
    activeNav === "Submissions"
      ? "Submissions"
      : activeNav === "Agenda"
        ? "Agenda"
        : activeNav === "Speakers"
          ? "Speaker onboarding"
          : activeNav === "Settings"
            ? "Settings"
            : event.name;
  const topbarMeta =
    activeNav === "Submissions"
      ? `${event.submissionCount} total · ${event.unreviewedCount} unreviewed · track routing on`
      : activeNav === "Agenda"
        ? `${formatDateRange(event.startsOn, event.endsOn)} · day and room placement`
        : activeNav === "Speakers"
          ? "Readiness, missing work, and assisted reminder drafts"
          : activeNav === "Settings"
            ? "Airtable sync status and API foundation"
            : formatDateRange(event.startsOn, event.endsOn);
  const currentRole = data.principal.rolesByEvent?.[event.id] ?? data.principal.role;

  return (
    <div className="app">
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
              href={
                item === "Submissions"
                  ? `/e/${event.id}/submissions`
                  : item === "Agenda"
                    ? `/e/${event.id}/agenda`
                    : item === "Overview"
                      ? "/"
                      : `#${item.toLowerCase()}`
              }
              aria-current={activeNav === item ? "page" : undefined}
              onClick={(click) => {
                if (item === "Messages") {
                  click.preventDefault();
                  setActiveNav(item);
                  return;
                }
                if (item === "Settings") {
                  click.preventDefault();
                  setActiveNav(item);
                  return;
                }
                click.preventDefault();
                selectNav(item);
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
        <div className="event-switcher">
          <AppSelect
            label="Event"
            value={event.id}
            options={data.events.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
            }))}
            onValueChange={selectEvent}
            variant="sidebar"
          />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{topbarTitle}</h1>
            <p className="topbar-meta">{topbarMeta}</p>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            {activeNav === "Submissions" || activeNav === "Overview" ? (
              <>
                {currentRole === "admin" ? (
                  <a className="btn btn-secondary" href={formsHref}>
                    Manage CFP forms
                  </a>
                ) : null}
                <a className="btn btn-primary" href={cfpHref}>
                  Open CFP form
                </a>
              </>
            ) : null}
            <div className="operator">
              <span className="operator-avatar" aria-hidden="true">
                {data.principal.displayName
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span>
                <strong>{data.principal.displayName}</strong>
                <small>{currentRole === "admin" ? "Event administrator" : "Track reviewer"}</small>
              </span>
            </div>
          </div>
        </header>

        {repairReturnTo ? (
          <aside className="repair-return" aria-label="Course Check repair">
            <p>
              {repairField === "sessionPlacement"
                ? "Review the submission source for session placement changes."
                : "Review the affected source record."}
            </p>
            <a className="btn btn-secondary btn-sm" href={repairReturnTo}>
              Return to decision review
            </a>
          </aside>
        ) : null}

        {activeNav === "Submissions" ? (
          <SubmissionsWorkspace
            event={event}
            principal={data.principal}
            selectedProposalId={initialProposalId}
            onSelectProposal={selectProposal}
            onCloseProposal={closeProposal}
            queue={initialQueue}
            onQueueChange={changeQueue}
            cfpHref={cfpHref}
          />
        ) : activeNav === "Agenda" ? (
          <AgendaWorkspace event={event} />
        ) : activeNav === "Overview" ? (
          <OverviewWorkspace event={event} />
        ) : activeNav === "Speakers" ? (
          <OnboardingWorkspace eventId={event.id} />
        ) : activeNav === "Settings" ? (
          <SettingsWorkspace eventId={event.id} />
        ) : (
          <div className="workspace">
            <section className="operations-panel">
              <div className="panel-heading">
                <h2>{activeNav}</h2>
              </div>
              <p className="empty-state padded">
                {activeNav} is outside the current competition spine.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function safeCourseCheckReturnPath(value: unknown, eventId: string | undefined): string | null {
  if (typeof value !== "string" || !eventId) return null;
  const prefix = `/e/${encodeURIComponent(eventId)}/course-checks/`;
  if (!value.startsWith(prefix)) return null;
  const planId = value.slice(prefix.length);
  return planId.length > 0 && !/[/?#]/.test(planId) ? value : null;
}

function useOrganizerData() {
  return useQuery({ queryKey: ["events"], queryFn: fetchEvents });
}

export function App() {
  const query = useOrganizerData();
  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <p className="eyebrow">Event unavailable</p>
          <h1>ChartStead could not open the event desk.</h1>
          <p>{query.error.message}</p>
          <Button className="primary-action" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </section>
      </main>
    );
  }
  return <EventDesk data={query.data} />;
}

export function SubmissionsPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as {
    eventId?: string;
    proposalId?: string;
  };
  const search = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open submissions.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Submissions"
      initialEventId={params.eventId ?? null}
      initialProposalId={params.proposalId ?? null}
      initialQueue={parseQueueSearch(search)}
      repairReturnTo={safeCourseCheckReturnPath(search.returnTo, params.eventId)}
      repairField={typeof search.field === "string" ? search.field : null}
    />
  );
}

export function AgendaPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open the agenda.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Agenda"
      initialEventId={params.eventId ?? null}
    />
  );
}

function parseQueueSearch(search: Record<string, unknown>): ProposalQueueState {
  const status = ["unreviewed", "approve", "maybe", "deny", "all"].includes(
    String(search.status ?? ""),
  )
    ? (search.status as ProposalQueueState["status"])
    : "all";
  const sort = ["newest", "oldest", "title-asc", "speaker-asc"].includes(
    String(search.sort ?? ""),
  )
    ? (search.sort as ProposalQueueState["sort"])
    : "newest";
  return {
    query: typeof search.q === "string" ? search.q : "",
    status,
    track: typeof search.track === "string" ? search.track : "",
    sort,
  };
}

function queueSearch(queue: ProposalQueueState) {
  return {
    q: queue.query || undefined,
    status: queue.status === "all" ? undefined : queue.status,
    track: queue.track || undefined,
    sort: queue.sort === "newest" ? undefined : queue.sort,
  };
}
