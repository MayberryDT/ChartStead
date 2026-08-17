import { Button } from "@base-ui/react/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import type { EventListResponse, EventRecord } from "../shared/events";
import { ApiError, createOrganizerForm, fetchEvents } from "./api";
import { NoAccessPanel, SignIn, signOutAndReturn } from "./SignIn";
import { AgendaWorkspace, type AgendaChrome } from "./AgendaWorkspace";
import { OnboardingWorkspace } from "./OnboardingWorkspace";
import {
  MessagesCommandBar,
  MessagesWorkspace,
  type MessagesChrome,
} from "./MessagesWorkspace";
import {
  SettingsCommandBar,
  SettingsWorkspace,
  type SettingsChrome,
} from "./SettingsWorkspace";
import { CreateEventDialog } from "./EventWorkspaceManagement";
import {
  SubmissionsCommandBar,
  SubmissionsWorkspace,
  type BatchChrome,
  type ReviewChrome,
  type ProposalQueueState,
  type ProposalSort,
} from "./SubmissionsWorkspace";
import {
  defaultFormsQueue,
  FormsCommandBar,
  FormsWorkspace,
  type FormsQueueState,
  type FormsSelection,
} from "./FormsWorkspace";
import {
  CfpBuilderWorkspace,
  type CfpBuilderChrome,
} from "./CfpBuilderPage";
import {
  EmbedManagerWorkspace,
  type EmbedsChrome,
} from "./EmbedManagerWorkspace";
import { OrganizerShell, type NavItem } from "./OrganizerShell";
import { OverviewWorkspace } from "./OverviewWorkspace";
import "./styles.css";

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

function EventDesk({
  data,
  initialNav = "Overview",
  initialEventId = null,
  initialProposalId = null,
  initialQueue = { query: "", status: "all", track: "", roundId: "", sort: "newest" },
  repairReturnTo = null,
  repairField = null,
  initialAgendaDay = null,
  initialAgendaSessionIds = [],
  initialMessagePlanId = null,
  initialFormId = null,
}: {
  data: EventListResponse;
  initialNav?: NavItem;
  initialEventId?: string | null;
  initialProposalId?: string | null;
  initialQueue?: ProposalQueueState;
  repairReturnTo?: string | null;
  repairField?: string | null;
  initialAgendaDay?: string | null;
  initialAgendaSessionIds?: string[];
  initialMessagePlanId?: string | null;
  initialFormId?: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [batchChrome, setBatchChrome] = useState<BatchChrome | null>(null);
  const [reviewChrome, setReviewChrome] = useState<ReviewChrome | null>(null);
  const [agendaChrome, setAgendaChrome] = useState<AgendaChrome | null>(null);
  const [messagesChrome, setMessagesChrome] = useState<MessagesChrome | null>(null);
  const [settingsChrome, setSettingsChrome] = useState<SettingsChrome | null>(null);
  const [cfpBuilderChrome, setCfpBuilderChrome] = useState<CfpBuilderChrome | null>(null);
  const [formsQueue, setFormsQueue] = useState<FormsQueueState>(defaultFormsQueue);
  const [formsSelection, setFormsSelection] = useState<FormsSelection | null>(null);
  const [speakerChrome, setSpeakerChrome] = useState<ReactNode | null>(null);
  const [embedsChrome, setEmbedsChrome] = useState<EmbedsChrome | null>(null);
  const createForm = useMutation({
    mutationFn: ({ eventId, name }: { eventId: string; name: string }) =>
      createOrganizerForm(eventId, name),
    onSuccess: async (form, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["forms", vars.eventId] });
      void navigate({
        to: "/e/$eventId/forms/$formId",
        params: { eventId: vars.eventId, formId: form.id },
      });
    },
  });
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

  useEffect(() => {
    if (activeNav !== "Agenda") setAgendaChrome(null);
  }, [activeNav]);

  useEffect(() => {
    setCfpBuilderChrome(null);
  }, [initialFormId]);

  if (!event) {
    return <NoAccessPanel displayName={data.principal.displayName} />;
  }

  function selectEvent(eventId: string) {
    localStorage.setItem("chartstead:event", eventId);
    setSelectedEventId(eventId);
    setMessagesChrome(null);
    setSettingsChrome(null);
    setAgendaChrome(null);
    setCfpBuilderChrome(null);
    if (activeNav === "Submissions") {
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId },
        search: queueSearch(initialQueue),
      });
      return;
    }
    if (activeNav === "Forms") {
      void navigate({
        to: "/e/$eventId/forms",
        params: { eventId },
      });
      return;
    }
    if (activeNav === "Agenda") {
      void navigate({
        to: "/e/$eventId/agenda",
        params: { eventId },
      });
      return;
    }
    if (activeNav === "Messages") {
      void navigate({
        to: "/e/$eventId/messages",
        params: { eventId },
      });
      return;
    }
    if (activeNav === "Speakers") {
      void navigate({
        to: "/e/$eventId/speakers",
        params: { eventId },
      });
      return;
    }
    if (activeNav === "Embeds") {
      void navigate({
        to: "/e/$eventId/embeds",
        params: { eventId },
      });
      return;
    }
    if (activeNav === "Settings") {
      void navigate({
        to: "/e/$eventId/settings",
        params: { eventId },
      });
      return;
    }
    void navigate({
      to: "/e/$eventId",
      params: { eventId },
    });
  }

  function selectNav(item: NavItem) {
    setActiveNav(item);
    if (item !== "Submissions") {
      setBatchChrome(null);
      setReviewChrome(null);
    }
    if (item !== "Agenda") setAgendaChrome(null);
    if (item !== "Messages") setMessagesChrome(null);
    if (item !== "Settings") setSettingsChrome(null);
    if (item !== "Speakers") setSpeakerChrome(null);
    if (item !== "Forms") setCfpBuilderChrome(null);
    if (item !== "Embeds") setEmbedsChrome(null);
    if (item === "Submissions") {
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId: event.id },
        search: queueSearch(initialQueue),
      });
      return;
    }
    if (item === "Forms") {
      void navigate({
        to: "/e/$eventId/forms",
        params: { eventId: event.id },
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
    if (item === "Messages") {
      void navigate({
        to: "/e/$eventId/messages",
        params: { eventId: event.id },
      });
      return;
    }
    if (item === "Speakers") {
      void navigate({
        to: "/e/$eventId/speakers",
        params: { eventId: event.id },
      });
      return;
    }
    if (item === "Embeds") {
      void navigate({
        to: "/e/$eventId/embeds",
        params: { eventId: event.id },
      });
      return;
    }
    if (item === "Settings") {
      void navigate({
        to: "/e/$eventId/settings",
        params: { eventId: event.id },
      });
      return;
    }
    if (item === "Overview") {
      void navigate({
        to: "/e/$eventId",
        params: { eventId: event.id },
      });
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

  const topbarTitle =
    activeNav === "Submissions"
      ? "Submissions"
      : activeNav === "Forms"
        ? cfpBuilderChrome?.title ?? (initialFormId ? "Guided CFP builder" : "Forms")
        : activeNav === "Agenda"
          ? "Agenda"
          : activeNav === "Messages"
            ? "Speaker messages"
            : activeNav === "Speakers"
              ? "Speakers"
              : activeNav === "Embeds"
                ? "Embeds"
                : activeNav === "Settings"
                  ? "Settings"
                  : event.name;
  const topbarMeta =
    activeNav === "Submissions"
      ? `${event.submissionCount} total · ${event.unreviewedCount} unreviewed`
      : activeNav === "Forms"
        ? cfpBuilderChrome?.meta ?? "Forms"
        : activeNav === "Agenda"
          ? `${formatDateRange(event.startsOn, event.endsOn)} · day and room placement`
          : activeNav === "Messages"
            ? "Exact audiences, frozen drafts, and truthful delivery"
            : activeNav === "Speakers"
              ? "Directory, readiness, event participation, and assisted follow-up"
              : activeNav === "Embeds"
                ? "Five public widgets, saved snippets, feeds, and revision pins"
                : activeNav === "Settings"
                  ? "Event configuration, reviewers, policies, automation, and Airtable"
                  : formatDateRange(event.startsOn, event.endsOn);
  const currentRole = data.principal.rolesByEvent?.[event.id] ?? data.principal.role;

  function updateEvent(updated: EventRecord) {
    queryClient.setQueryData<EventListResponse>(["events"], (current) =>
      current
        ? {
            ...current,
            events: current.events.map((candidate) =>
              candidate.id === updated.id ? updated : candidate,
            ),
          }
        : current,
    );
  }

  function eventCreated(created: EventRecord) {
    queryClient.setQueryData<EventListResponse>(["events"], (current) => {
      if (!current) return current;
      return {
        ...current,
        events: current.events.some((candidate) => candidate.id === created.id)
          ? current.events.map((candidate) =>
              candidate.id === created.id ? created : candidate,
            )
          : [...current.events, created],
        principal: {
          ...current.principal,
          eventIds: [...new Set([...current.principal.eventIds, created.id])],
          rolesByEvent: {
            ...current.principal.rolesByEvent,
            [created.id]: "admin",
          },
        },
      };
    });
    localStorage.setItem("chartstead:event", created.id);
    setSelectedEventId(created.id);
    setActiveNav("Overview");
    setCreateEventOpen(false);
    void navigate({
      to: "/e/$eventId",
      params: { eventId: created.id },
    });
  }

  return (
    <>
      <OrganizerShell
        data={data}
        event={event}
        activeNav={activeNav}
        title={topbarTitle}
        meta={topbarMeta}
        currentRole={currentRole}
        onNavigate={selectNav}
        onEventChange={selectEvent}
        onCreateEvent={() => setCreateEventOpen(true)}
        onSignOut={signOutAndReturn}
        identity={
          activeNav === "Submissions" ||
          activeNav === "Overview" ||
          activeNav === "Agenda" ||
          activeNav === "Speakers" ||
          activeNav === "Forms" ||
          activeNav === "Messages" ||
          activeNav === "Settings" ||
          activeNav === "Embeds" ? null : (
            <div className="topbar-identity" title={topbarMeta}>
              <h1>{topbarTitle}</h1>
              <p className="topbar-meta">{topbarMeta}</p>
            </div>
          )
        }
        tools={
          activeNav === "Submissions" ? (
            <SubmissionsCommandBar
              event={event}
              principal={data.principal}
              queue={initialQueue}
              onQueueChange={changeQueue}
              batch={batchChrome}
              review={reviewChrome}
            />
          ) : activeNav === "Forms" ? (
            initialFormId ? (
              cfpBuilderChrome?.tools
            ) : (
              <FormsCommandBar
                queue={formsQueue}
                onQueueChange={(next) => setFormsQueue((current) => ({ ...current, ...next }))}
              />
            )
          ) : activeNav === "Agenda" ? (
            agendaChrome?.tools
          ) : activeNav === "Messages" ? (
            <MessagesCommandBar chrome={messagesChrome} />
          ) : activeNav === "Speakers" ? (
            speakerChrome
          ) : activeNav === "Settings" ? (
            <SettingsCommandBar chrome={settingsChrome} />
          ) : activeNav === "Embeds" ? (
            embedsChrome?.tools
          ) : null
        }
        actions={
          activeNav === "Forms" ? (
            initialFormId ? (
              cfpBuilderChrome?.actions
            ) : (
              <>
                {formsSelection?.publishedVersion != null ? (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`/e/${event.id}/cfp?formId=${formsSelection.id}`}
                  >
                    View Form
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    title={
                      formsSelection
                        ? "Publish this form to open the public CFP"
                        : "Select a published form to view"
                    }
                  >
                    View Form
                  </button>
                )}
                {formsSelection ? (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`/e/${event.id}/forms/${formsSelection.id}`}
                  >
                    Open Form Builder
                  </a>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled>
                    Open Form Builder
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={createForm.isPending}
                  onClick={() =>
                    createForm.mutate({
                      eventId: event.id,
                      name: `CFP ${new Date().toLocaleDateString()}`,
                    })
                  }
                >
                  Create Form
                </button>
              </>
            )
          ) : activeNav === "Agenda" ? (
            agendaChrome?.actions
          ) : activeNav === "Embeds" ? (
            embedsChrome?.actions
          ) : null
        }
      >
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
            onBatchChromeChange={setBatchChrome}
            onReviewChromeChange={setReviewChrome}
            focusSelectedRecord={Boolean(repairReturnTo)}
          />
        ) : activeNav === "Forms" ? (
          initialFormId ? (
            <CfpBuilderWorkspace
              eventId={event.id}
              formId={initialFormId}
              onChromeChange={setCfpBuilderChrome}
            />
          ) : (
            <FormsWorkspace
              eventId={event.id}
              queue={formsQueue}
              onQueueChange={(next) => setFormsQueue((current) => ({ ...current, ...next }))}
              onSelectionChange={setFormsSelection}
            />
          )
        ) : activeNav === "Agenda" ? (
          <AgendaWorkspace
            event={event}
            initialDay={initialAgendaDay}
            initialSessionIds={initialAgendaSessionIds}
            onChromeChange={setAgendaChrome}
          />
        ) : activeNav === "Overview" ? (
          <OverviewWorkspace event={event} />
        ) : activeNav === "Speakers" ? (
          <OnboardingWorkspace
            eventId={event.id}
            onShellToolsChange={setSpeakerChrome}
          />
        ) : activeNav === "Messages" ? (
          <MessagesWorkspace
            eventId={event.id}
            eventName={event.name}
            focusedPlanId={initialMessagePlanId}
            onOpenCourseCheck={(planId) => {
              void navigate({
                to: "/e/$eventId/course-checks/$planId",
                params: { eventId: event.id, planId },
              });
            }}
            onChromeChange={setMessagesChrome}
          />
        ) : activeNav === "Embeds" ? (
          <EmbedManagerWorkspace event={event} onChromeChange={setEmbedsChrome} />
        ) : activeNav === "Settings" ? (
          <SettingsWorkspace
            event={event}
            onEventUpdated={updateEvent}
            onChromeChange={setSettingsChrome}
          />
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
      </OrganizerShell>
      <CreateEventDialog
        open={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onCreated={eventCreated}
      />
    </>
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

export function OverviewPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open the event overview.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Overview"
      initialEventId={params.eventId ?? null}
    />
  );
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
      initialAgendaDay={typeof search.day === "string" ? search.day : null}
      initialAgendaSessionIds={
        typeof search.sessionIds === "string"
          ? search.sessionIds.split(",").filter(Boolean)
          : typeof search.session === "string"
            ? [search.session]
            : []
      }
    />
  );
}

export function MessagesPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };
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
          <h1>ChartStead could not open messages.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Messages"
      initialEventId={params.eventId ?? null}
      initialMessagePlanId={typeof search.planId === "string" ? search.planId : null}
    />
  );
}

export function FormsPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open forms.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Forms"
      initialEventId={params.eventId ?? null}
    />
  );
}

export function CfpBuilderPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string; formId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open the CFP builder.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Forms"
      initialEventId={params.eventId ?? null}
      initialFormId={params.formId ?? null}
    />
  );
}

export function SpeakersPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open speakers.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Speakers"
      initialEventId={params.eventId ?? null}
    />
  );
}


export function EmbedsPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open embeds.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Embeds"
      initialEventId={params.eventId ?? null}
    />
  );
}
export function SettingsPage() {
  const query = useOrganizerData();
  const params = useParams({ strict: false }) as { eventId?: string };

  if (query.isPending) return <LoadingShell />;
  if (query.error instanceof ApiError && query.error.status === 401) return <SignIn />;
  if (query.isError) {
    return (
      <main className="sign-in-shell">
        <section className="error-panel" role="alert">
          <h1>ChartStead could not open settings.</h1>
          <p>{query.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <EventDesk
      data={query.data}
      initialNav="Settings"
      initialEventId={params.eventId ?? null}
    />
  );
}

const PROPOSAL_SORTS: ProposalSort[] = [
  "newest",
  "oldest",
  "title-asc",
  "title-desc",
  "track-asc",
  "track-desc",
  "status-asc",
  "status-desc",
  "speaker-asc",
  "aggregate-asc",
  "aggregate-desc",
];

function parseQueueSearch(search: Record<string, unknown>): ProposalQueueState {
  const status = ["unreviewed", "approve", "maybe", "deny", "locked", "all"].includes(
    String(search.status ?? ""),
  )
    ? (search.status as ProposalQueueState["status"])
    : "all";
  const sort = PROPOSAL_SORTS.includes(String(search.sort ?? "") as ProposalSort)
    ? (search.sort as ProposalSort)
    : "newest";
  return {
    query: typeof search.q === "string" ? search.q : "",
    status,
    track: typeof search.track === "string" ? search.track : "",
    roundId: typeof search.roundId === "string" ? search.roundId : "",
    sort,
  };
}

function queueSearch(queue: ProposalQueueState) {
  return {
    q: queue.query || undefined,
    status: queue.status === "all" ? undefined : queue.status,
    track: queue.track || undefined,
    roundId: queue.roundId || undefined,
    sort: queue.sort === "newest" ? undefined : queue.sort,
  };
}
