import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgendaWorkspaceResponse,
  EventListResponse,
  OrganizerSession,
  ScheduleConflict,
  SessionContentRecord,
} from "../../shared/events";
import { AgendaPage, App } from "../../src/App";

const eventId = "pacific-open-data-summit-2026";

const eventsResponse: EventListResponse = {
  principal: {
    id: "admin-1",
    displayName: "Ada Admin",
    role: "admin",
    eventIds: [eventId],
  },
  events: [
    {
      id: eventId,
      name: "Pacific Open Data Summit 2026",
      startsOn: "2026-10-07",
      endsOn: "2026-10-08",
      timezone: "America/Los_Angeles",
      submissionCount: 12,
      unreviewedCount: 3,
      tracks: [
        { id: "platform", name: "Platform", proposalCount: 4 },
        { id: "community", name: "Community", proposalCount: 3 },
      ],
      rooms: [
        { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
        { id: "compass-room", name: "Compass Room", readiness: "ready" },
      ],
    },
  ],
};

function session(partial: Partial<OrganizerSession> & Pick<OrganizerSession, "id" | "title">): OrganizerSession {
  return {
    proposalId: null,
    courseCheckPlanId: "plan-1",
    format: "talk",
    trackId: "platform",
    trackName: "Platform",
    roomId: null,
    roomName: null,
    startsAt: null,
    endsAt: null,
    placementStatus: "unplaced",
    speakers: [{ id: "sp-1", name: "Ada Lovelace", email: "ada@example.com", role: "primary" }],
    calendarUid: `cal_${partial.id}`,
    calendarSequence: 0,
    calendarInviteRecorded: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

function agendaResponse(overrides?: Partial<AgendaWorkspaceResponse>): AgendaWorkspaceResponse {
  const sessions = overrides?.sessions ?? [
    session({ id: "ses-1", title: "Opening Keynote" }),
    session({
      id: "ses-2",
      title: "Platform Deep Dive",
      speakers: [{ id: "sp-2", name: "Grace Hopper", email: "grace@example.com", role: "primary" }],
    }),
  ];
  const unplaced = sessions.filter((item) => item.placementStatus !== "placed");
  const conflicts = overrides?.conflicts ?? [];
  const counts = {
    unplaced: unplaced.filter((s) => s.placementStatus === "unplaced").length,
    partial: unplaced.filter((s) => s.placementStatus === "partial").length,
    placed: sessions.filter((s) => s.placementStatus === "placed").length,
    conflicts: conflicts.length,
    ...overrides?.counts,
  };
  return {
    version: overrides?.version ?? 1,
    eventId,
    calendarIntents: [],
    ...overrides,
    sessions,
    unplacedSessions: overrides?.unplacedSessions ?? unplaced,
    conflicts,
    counts,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function renderAgenda(path = `/e/${eventId}/agenda`) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: App,
  });
  const agendaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/agenda",
    component: AgendaPage,
    validateSearch: (
      search: Record<string, unknown>,
    ): { day?: string; session?: string; sessionIds?: string } => ({
      day: typeof search.day === "string" ? search.day : undefined,
      session: typeof search.session === "string" ? search.session : undefined,
      sessionIds: typeof search.sessionIds === "string" ? search.sessionIds : undefined,
    }),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, agendaRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ticket 08 agenda workspace", () => {
  it("opens an exact affected session from a Course Check handoff", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.endsWith(`/api/events/${eventId}/sessions`)) {
          return Response.json(agendaResponse());
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    renderAgenda(`/e/${eventId}/agenda?sessionIds=ses-2`);

    const inspector = await screen.findByRole("complementary", {
      name: "Session inspector",
    });
    expect(within(inspector).getByRole("heading", { name: "Platform Deep Dive" })).toBeVisible();
  });

  it("uses the shared shell toolbar for direct Agenda navigation and day switching", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.endsWith(`/api/events/${eventId}/sessions`)) {
          return Response.json(agendaResponse());
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    const { container, router } = renderAgenda(
      `/e/${eventId}/agenda?session=ses-2&day=2026-10-08`,
    );

    await screen.findByLabelText("Unplaced sessions");
    const toolbars = container.querySelectorAll(".shell-toolbar");
    expect(toolbars).toHaveLength(1);
    const toolbar = toolbars[0] as HTMLElement;
    expect(screen.queryByText("Schedule builder")).not.toBeInTheDocument();
    expect(within(toolbar).getByLabelText("2 unplaced")).toBeVisible();
    expect(within(toolbar).getByLabelText("0 placed")).toBeVisible();
    expect(within(toolbar).getByLabelText("0 conflicts")).toBeVisible();
    expect(within(toolbar).getByRole("button", { name: "Publish program" })).toBeVisible();
    const dayNav = within(toolbar).getByRole("group", { name: "Event day" });
    expect(within(dayNav).getByText(/Thu, Oct 8/)).toBeVisible();
    expect(within(dayNav).getByLabelText("Next day")).toBeDisabled();
    expect(within(dayNav).getByLabelText("Previous day")).toBeEnabled();
    expect(
      within(await screen.findByRole("complementary", { name: "Session inspector" })).getByRole(
        "heading",
        { name: "Platform Deep Dive" },
      ),
    ).toBeVisible();

    await user.click(within(dayNav).getByLabelText("Previous day"));

    await waitFor(() => {
      expect(within(dayNav).getByText(/Wed, Oct 7/)).toBeVisible();
    });
    expect(router.state.location.search.day).toBeUndefined();
    expect(router.state.location.search.sessionIds).toBe("ses-2");
  });

  it("exposes every day for a 4-day World's Fair event and keeps selection cues", async () => {
    const user = userEvent.setup();
    const fourDayEventId = "ai-engineer-worlds-fair-2026";
    const fourDayEvents: EventListResponse = {
      ...eventsResponse,
      principal: {
        ...eventsResponse.principal,
        eventIds: [fourDayEventId],
      },
      events: [
        {
          ...eventsResponse.events[0],
          id: fourDayEventId,
          name: "AI Engineer World's Fair 2026",
          startsOn: "2026-06-29",
          endsOn: "2026-07-02",
        },
      ],
    };
    const dayTwoSession = session({
      id: "ses-day2",
      title: "Agents Deep Dive",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-06-30T16:00:00.000Z",
      endsAt: "2026-06-30T16:45:00.000Z",
      placementStatus: "placed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(fourDayEvents);
        }
        if (url.endsWith(`/api/events/${fourDayEventId}/sessions`)) {
          return Response.json(
            agendaResponse({
              eventId: fourDayEventId,
              sessions: [dayTwoSession, session({ id: "ses-unplaced", title: "Unplaced Talk" })],
            }),
          );
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    const { container, router } = renderAgenda(
      `/e/${fourDayEventId}/agenda?session=ses-day2&day=2026-06-29`,
    );

    await screen.findByLabelText("Unplaced sessions");
    const toolbar = container.querySelector(".shell-toolbar") as HTMLElement;
    const dayNav = within(toolbar).getByRole("group", { name: "Event day" });
    expect(dayNav).toHaveAttribute("data-day-count", "4");
    expect(within(dayNav).getByLabelText("Previous day")).toBeDisabled();
    expect(within(dayNav).getByLabelText("Next day")).toBeEnabled();
    expect(dayNav.querySelector('[data-day="2026-06-29"]')).toBeTruthy();
    expect(within(dayNav).getByText(/Mon, Jun 29/)).toBeVisible();
    expect(dayNav.querySelector(".agenda-day-current")).toHaveClass(
      "has-selection-elsewhere",
    );

    await user.click(within(dayNav).getByLabelText("Next day"));
    await waitFor(() => {
      expect(dayNav.querySelector('[data-day="2026-06-30"]')).toBeTruthy();
    });
    expect(router.state.location.search.day).toBe("2026-06-30");
    expect(within(toolbar).getByLabelText(/unplaced/i)).toBeVisible();

    await user.click(within(dayNav).getByLabelText("Next day"));
    await waitFor(() => {
      expect(dayNav.querySelector('[data-day="2026-07-01"]')).toBeTruthy();
    });
    await user.click(within(dayNav).getByLabelText("Previous day"));
    await waitFor(() => {
      expect(dayNav.querySelector('[data-day="2026-06-30"]')).toBeTruthy();
    });
  });

  it("keeps a reachable two-day toolbar control without clipping to a binary pair", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.endsWith(`/api/events/${eventId}/sessions`)) {
          return Response.json(agendaResponse());
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    const { container } = renderAgenda(`/e/${eventId}/agenda`);
    await screen.findByLabelText("Unplaced sessions");
    const toolbar = container.querySelector(".shell-toolbar") as HTMLElement;
    const dayNav = within(toolbar).getByRole("group", { name: "Event day" });
    expect(dayNav).toHaveAttribute("data-day-count", "2");
    expect(within(dayNav).getByText(/Wed, Oct 7/)).toBeVisible();
    expect(within(dayNav).getByLabelText("Previous day")).toBeDisabled();
    expect(within(dayNav).getByLabelText("Next day")).toBeEnabled();

    await user.click(within(dayNav).getByLabelText("Next day"));
    await waitFor(() => {
      expect(within(dayNav).getByText(/Thu, Oct 8/)).toBeVisible();
    });
    expect(within(dayNav).getByLabelText("Next day")).toBeDisabled();
  });

  it("shows unplaced pool, live counts, TBD labels, and keyboard Move Session", async () => {
    const user = userEvent.setup();
    let agenda = agendaResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.includes(`/api/events/${eventId}/sessions/ses-1`) && method === "PATCH") {
          const rawBody =
            typeof init?.body === "string"
              ? init.body
              : input instanceof Request
                ? await input.clone().text()
                : "{}";
          const patch = JSON.parse(rawBody) as {
            roomId?: string | null;
            startsAt?: string | null;
            endsAt?: string | null;
            expectedAgendaVersion?: number;
          };
          expect(patch.expectedAgendaVersion).toBe(1);
          const updated = session({
            id: "ses-1",
            title: "Opening Keynote",
            roomId: patch.roomId ?? null,
            roomName: patch.roomId === "harbor-hall" ? "Harbor Hall" : null,
            startsAt: patch.startsAt ?? null,
            endsAt: patch.endsAt ?? null,
            placementStatus:
              patch.roomId && patch.startsAt && patch.endsAt
                ? "placed"
                : patch.roomId || patch.startsAt || patch.endsAt
                  ? "partial"
                  : "unplaced",
          });
          agenda = agendaResponse({
            sessions: [updated, agenda.sessions[1]],
          });
          return Response.json({
            session: updated,
            conflicts: [],
            counts: agenda.counts,
            calendarIntentsCreated: [],
          });
        }
        if (url.includes(`/api/events/${eventId}/sessions`) && method === "GET") {
          return Response.json(agenda);
        }
        return new Response(JSON.stringify({ error: `unhandled ${method} ${url}` }), {
          status: 500,
        });
      }),
    );

    renderAgenda();

    expect(await screen.findByLabelText("Unplaced sessions")).toBeInTheDocument();
    expect(screen.getByLabelText("2 unplaced")).toBeInTheDocument();
    const pool = screen.getByLabelText("Unplaced sessions");
    expect(within(pool).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(pool).getAllByText(/Unplaced · room and time TBD/i).length).toBeGreaterThan(0);
    expect(within(pool).queryByRole("button", { name: "Move Session" })).toBeNull();

    await user.click(within(pool).getByText("Opening Keynote"));
    expect(screen.getByRole("heading", { name: "Move Session" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Room" }));
    await user.click(await screen.findByRole("option", { name: "Harbor Hall" }));
    await user.click(screen.getByRole("combobox", { name: "Start" }));
    await user.click(await screen.findByRole("option", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "Save placement" }));

    await waitFor(() => {
      expect(screen.getByText(/Placement saved/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("1 unplaced")).toBeInTheDocument();
  });

  it("previews and applies an exact auto-place plan without optimistic drift", async () => {
    const user = userEvent.setup();
    let agenda = agendaResponse();
    const placed = session({
      id: "ses-1",
      title: "Opening Keynote",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T09:00:00.000Z",
      endsAt: "2026-10-07T09:45:00.000Z",
      placementStatus: "placed",
    });
    const preview = {
      previewId: "agenda_preview_ui",
      previewDigest: "digest-ui",
      agendaVersion: 1,
      selectedSessionIds: ["ses-1", "ses-2"],
      includeManual: false,
      proposals: [
        {
          sessionId: "ses-1",
          title: "Opening Keynote",
          roomId: "harbor-hall",
          roomName: "Harbor Hall",
          startsAt: "2026-10-07T09:00:00.000Z",
          endsAt: "2026-10-07T09:45:00.000Z",
          durationMinutes: 45,
          reason: "First available conflict-free slot in the event window.",
        },
      ],
      leftovers: [
        {
          sessionId: "ses-2",
          title: "Platform Deep Dive",
          placementStatus: "unplaced" as const,
          reason: "No conflict-free 45-minute slot remains across the event days and ready rooms.",
        },
      ],
      conflicts: [],
      assumptions: ["Uses 45-minute sessions on 30-minute boundaries."],
      manualPlacementPreserved: [],
      createdAt: "2026-08-12T00:00:00.000Z",
    };
    const previewBodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.endsWith(`/api/events/${eventId}/agenda/auto-place/preview`) && method === "POST") {
          previewBodies.push(JSON.parse(String(init?.body ?? "{}")));
          return Response.json(preview, { status: 201 });
        }
        if (url.endsWith(`/api/events/${eventId}/agenda/auto-place/apply`) && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            previewId: string;
            previewDigest: string;
            agendaVersion: number;
          };
          expect(body).toMatchObject({
            previewId: preview.previewId,
            previewDigest: preview.previewDigest,
            agendaVersion: preview.agendaVersion,
          });
          agenda = agendaResponse({
            version: 2,
            sessions: [placed, agenda.sessions[1]],
          });
          return Response.json({
            previewDigest: preview.previewDigest,
            agendaVersion: 2,
            appliedSessionIds: ["ses-1"],
            unchangedSessionIds: [],
            audit: {
              id: "audit-1",
              type: "auto_place.applied",
              actorId: "admin-1",
              actorName: "Ada Admin",
              sessionIds: ["ses-1"],
              summary: "Auto-placed 1 session(s); 1 left for manual placement.",
              createdAt: "2026-08-12T00:00:01.000Z",
            },
            agenda,
            idempotent: false,
          });
        }
        if (url.includes(`/api/events/${eventId}/sessions`) && method === "GET") {
          return Response.json(agenda);
        }
        return new Response(JSON.stringify({ error: `unhandled ${method} ${url}` }), {
          status: 500,
        });
      }),
    );

    renderAgenda();

    await user.click(await screen.findByRole("button", { name: "Auto-place" }));
    expect(previewBodies).toEqual([{ includeManual: false }]);
    const dialog = await screen.findByRole("dialog", { name: /Auto-place preview/i });
    expect(within(dialog).getByLabelText("Proposed auto-place slots")).toHaveTextContent(
      "Opening Keynote",
    );
    expect(within(dialog).getByLabelText("Auto-place leftovers")).toHaveTextContent(
      "Platform Deep Dive",
    );

    await user.click(
      within(dialog).getByRole("button", { name: /Apply 1 placement/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Auto-placed 1 session/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog", { name: /Auto-place preview/i })).toBeNull();
  });

  it("opens Fix Conflicts modal with Auto-place and Fix only", async () => {
    const user = userEvent.setup();
    const conflict: ScheduleConflict = {
      id: "room:harbor-hall:ses-1:ses-2",
      kind: "room_overlap",
      summary: 'Room overlap in Harbor Hall: “Opening Keynote” and “Platform Deep Dive”',
      sessionIds: ["ses-1", "ses-2"],
      sessionTitles: ["Opening Keynote", "Platform Deep Dive"],
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
      actions: ["move_time", "move_room", "keep_placement"],
    };
    const placedA = session({
      id: "ses-1",
      title: "Opening Keynote",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
      placementStatus: "placed",
    });
    const placedB = session({
      id: "ses-2",
      title: "Platform Deep Dive",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:30:00.000Z",
      endsAt: "2026-10-07T17:15:00.000Z",
      placementStatus: "placed",
      speakers: [{ id: "sp-2", name: "Grace Hopper", email: "grace@example.com", role: "primary" }],
    });
    let agenda = agendaResponse({
      sessions: [placedA, placedB],
      conflicts: [conflict],
      counts: { unplaced: 0, partial: 0, placed: 2, conflicts: 1 },
    });
    const previewBody = {
      previewId: "preview-conflict-1",
      previewDigest: "digest-conflict-1",
      agendaVersion: 3,
      proposals: [
        {
          sessionId: "ses-1",
          title: "Opening Keynote",
          roomId: "compass-room",
          roomName: "Compass Room",
          startsAt: "2026-10-07T17:00:00.000Z",
          endsAt: "2026-10-07T17:45:00.000Z",
          reason: "First free slot.",
        },
      ],
      leftovers: [],
      conflicts: [],
      assumptions: ["45-minute duration"],
      manualPlacementPreserved: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.includes(`/api/events/${eventId}/sessions`) && method === "GET") {
          return Response.json(agenda);
        }
        if (url.endsWith(`/api/events/${eventId}/agenda/auto-place/preview`) && method === "POST") {
          return Response.json(previewBody);
        }
        if (url.endsWith(`/api/events/${eventId}/agenda/auto-place/apply`) && method === "POST") {
          agenda = agendaResponse({
            sessions: [
              {
                ...placedA,
                roomId: "compass-room",
                roomName: "Compass Room",
                startsAt: "2026-10-07T17:00:00.000Z",
                endsAt: "2026-10-07T17:45:00.000Z",
              },
              placedB,
            ],
            conflicts: [],
            counts: { unplaced: 0, partial: 0, placed: 2, conflicts: 0 },
          });
          return Response.json({
            agenda,
            appliedSessionIds: ["ses-1"],
            idempotent: false,
          });
        }
        return new Response(JSON.stringify({ error: `unhandled ${method} ${url}` }), {
          status: 500,
        });
      }),
    );

    renderAgenda();

    expect(await screen.findByLabelText("1 conflicts")).toBeInTheDocument();
    expect(screen.queryByText(/Room overlap in Harbor Hall/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Fix Conflicts/i }));
    const dialog = await screen.findByRole("dialog", { name: "Fix Conflicts" });
    expect(within(dialog).getByText(/Room overlap in Harbor Hall/i)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Auto-place" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Fix" })).toBeEnabled();

    await user.click(within(dialog).getByRole("button", { name: "Auto-place" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Auto-place preview" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Fix Conflicts" })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("0 conflicts")).toBeInTheDocument();
  });

  it("Fix from conflicts modal selects the session in the inspector", async () => {
    const user = userEvent.setup();
    const conflict: ScheduleConflict = {
      id: "room:harbor-hall:ses-1:ses-2",
      kind: "room_overlap",
      summary: 'Room overlap in Harbor Hall: “Opening Keynote” and “Platform Deep Dive”',
      sessionIds: ["ses-1", "ses-2"],
      sessionTitles: ["Opening Keynote", "Platform Deep Dive"],
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
      actions: ["move_time", "move_room", "keep_placement"],
    };
    const placedA = session({
      id: "ses-1",
      title: "Opening Keynote",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
      placementStatus: "placed",
    });
    const placedB = session({
      id: "ses-2",
      title: "Platform Deep Dive",
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T16:30:00.000Z",
      endsAt: "2026-10-07T17:15:00.000Z",
      placementStatus: "placed",
      speakers: [{ id: "sp-2", name: "Grace Hopper", email: "grace@example.com", role: "primary" }],
    });
    const agenda = agendaResponse({
      sessions: [placedA, placedB],
      conflicts: [conflict],
      counts: { unplaced: 0, partial: 0, placed: 2, conflicts: 1 },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.includes(`/api/events/${eventId}/sessions`) && method === "GET") {
          return Response.json(agenda);
        }
        return new Response(JSON.stringify({ error: `unhandled ${method} ${url}` }), {
          status: 500,
        });
      }),
    );

    renderAgenda();
    await user.click(await screen.findByRole("button", { name: /Fix Conflicts/i }));
    const dialog = await screen.findByRole("dialog", { name: "Fix Conflicts" });
    await user.click(within(dialog).getByRole("button", { name: "Fix" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Fix Conflicts" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Opening Keynote" })).toBeVisible();
  });

  it("edits central session content", async () => {
    const user = userEvent.setup();
    const base = session({ id: "ses-1", title: "Opening Keynote" });
    let content: SessionContentRecord = {
      ...base,
      abstract: "Original abstract",
      publicContent: "Original public copy",
      contentStatus: "draft",
      contentVersion: 1,
      contentUpdatedAt: "2026-08-01T00:00:00.000Z",
      contentUpdatedBy: { id: "system", name: "Proposal acceptance" },
      contentHistory: [
        {
          id: "history-1",
          sessionId: base.id,
          version: 1,
          title: base.title,
          abstract: "Original abstract",
          publicContent: "Original public copy",
          status: "draft",
          changedFields: ["title", "abstract", "publicContent", "status"],
          previous: null,
          actorId: "system",
          actorName: "Proposal acceptance",
          createdAt: "2026-08-01T00:00:00.000Z",
          changeKind: "initial",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.endsWith(`/api/events/${eventId}/sessions`) && method === "GET") {
          return Response.json(agendaResponse({ sessions: [{ ...base, title: content.title }] }));
        }
        if (url.endsWith(`/api/events/${eventId}/session-content`) && method === "GET") {
          return Response.json({ eventId, sessions: [content] });
        }
        if (url.endsWith(`/session-content/${base.id}`) && method === "PATCH") {
          const body = JSON.parse(String(init?.body)) as {
            title: string;
            abstract: string;
            publicContent: string;
          };
          content = {
            ...content,
            ...body,
            contentVersion: 2,
            contentHistory: [
              {
                ...content.contentHistory[0],
                id: "history-2",
                version: 2,
                title: body.title,
                abstract: body.abstract,
                publicContent: body.publicContent,
                changedFields: ["title", "abstract", "publicContent"],
                previous: {
                  title: content.title,
                  abstract: content.abstract,
                  publicContent: content.publicContent,
                  status: content.contentStatus,
                },
                actorId: "admin-1",
                actorName: "Ada Admin",
                changeKind: "edit",
              },
              ...content.contentHistory,
            ],
          };
          return Response.json({ session: content });
        }
        return new Response(JSON.stringify({ error: `unhandled ${method} ${url}` }), { status: 500 });
      }),
    );

    renderAgenda();
    expect(await screen.findByRole("heading", { name: "Public session content" })).toBeVisible();
    await user.clear(screen.getByLabelText("Session title"));
    await user.type(screen.getByLabelText("Session title"), "Revised keynote");
    await user.clear(screen.getByLabelText("Abstract"));
    await user.type(screen.getByLabelText("Abstract"), "Revised abstract");
    await user.click(screen.getByRole("button", { name: "Save content" }));
    expect(await screen.findByText("Session content saved.")).toBeVisible();
    expect(screen.getByText(/Version 2 · draft/)).toBeVisible();
    expect(screen.queryByText(/Version history/i)).toBeNull();
  });
});
