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
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, agendaRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ticket 08 agenda workspace", () => {
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
          };
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
    expect(screen.getByText(/2 unplaced · 0 conflicts/i)).toBeInTheDocument();
    const pool = screen.getByLabelText("Unplaced sessions");
    expect(within(pool).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(pool).getAllByText(/Unplaced · room and time TBD/i).length).toBeGreaterThan(0);
    expect(within(pool).queryByRole("button", { name: "Move Session" })).toBeNull();

    await user.click(within(pool).getByText("Opening Keynote"));
    await user.click(screen.getByRole("button", { name: "Move Session" }));
    expect(screen.getByRole("heading", { name: "Move Session" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Room"), "harbor-hall");
    await user.selectOptions(screen.getByLabelText("Start"), "10:00");
    await user.click(screen.getByRole("button", { name: "Save placement" }));

    await waitFor(() => {
      expect(screen.getByText(/Placement saved/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1 unplaced · 0 conflicts/i)).toBeInTheDocument();
  });

  it("shows named conflicts with non-blocking repair actions", async () => {
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.endsWith("/api/events") || url.endsWith("/api/events/")) {
          return Response.json(eventsResponse);
        }
        if (url.includes("/sessions/") && method === "PATCH") {
          const moved = {
            ...placedA,
            roomId: "compass-room",
            roomName: "Compass Room",
          };
          agenda = agendaResponse({
            sessions: [moved, placedB],
            conflicts: [],
            counts: { unplaced: 0, partial: 0, placed: 2, conflicts: 0 },
          });
          return Response.json({
            session: moved,
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

    expect(await screen.findByText(/0 unplaced · 1 conflict/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Room overlap in Harbor Hall/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep this session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find another time" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move room" }));
    await waitFor(() => {
      expect(screen.getByText(/0 unplaced · 0 conflicts/i)).toBeInTheDocument();
    });
  });
});
