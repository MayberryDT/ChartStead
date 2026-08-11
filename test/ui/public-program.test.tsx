import { cleanup, render, screen, within } from "@testing-library/react";
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

import type { PublicProgramResponse } from "../../shared/events";
import {
  PublicProgramEmbedPage,
  PublicProgramPage,
} from "../../src/PublicProgramPage";
import { PublicProgramRenderer } from "../../src/PublicProgramRenderer";

const eventId = "pacific-open-data-summit-2026";

function programResponse(
  overrides?: Partial<PublicProgramResponse>,
): PublicProgramResponse {
  return {
    event: {
      id: eventId,
      name: "Pacific Open Data Summit 2026",
      startsOn: "2026-10-07",
      endsOn: "2026-10-08",
      themeAccent: "#2f5d98",
      tracks: [
        { id: "platform", name: "Platform" },
        { id: "community", name: "Community" },
      ],
      rooms: [
        { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
        { id: "compass-room", name: "Compass Room", readiness: "ready" },
      ],
    },
    revision: {
      id: "pubrev_1",
      version: 1,
      publishedAt: "2026-08-11T00:00:00.000Z",
      isCurrent: true,
    },
    sessions: [
      {
        id: "ses-1",
        title: "Opening Keynote",
        description: "Welcome to the summit.",
        format: "keynote",
        trackId: "platform",
        trackName: "Platform",
        roomId: "harbor-hall",
        roomName: "Harbor Hall",
        roomPending: false,
        startsAt: "2026-10-07T15:00:00.000Z",
        endsAt: "2026-10-07T15:45:00.000Z",
        day: "2026-10-07",
        calendarUid: "cal_ses-1",
        calendarSequence: 0,
        speakers: [{ id: "sp-1", name: "Ada Lovelace", role: "primary" }],
      },
      {
        id: "ses-2",
        title: "Community Circle",
        description: "Open conversation.",
        format: "talk",
        trackId: "community",
        trackName: "Community",
        roomId: null,
        roomName: null,
        roomPending: true,
        startsAt: null,
        endsAt: null,
        day: null,
        calendarUid: "cal_ses-2",
        calendarSequence: 0,
        speakers: [{ id: "sp-2", name: "Grace Hopper", role: "primary" }],
      },
    ],
    speakers: [
      {
        id: "sp-1",
        name: "Ada Lovelace",
        biography: "Analytical engines for organizers.",
        headshotAssetId: null,
        sessionIds: ["ses-1"],
      },
      {
        id: "sp-2",
        name: "Grace Hopper",
        biography: "Debugging the schedule.",
        headshotAssetId: null,
        sessionIds: ["ses-2"],
      },
    ],
    revisions: [
      {
        id: "pubrev_1",
        version: 1,
        publishedAt: "2026-08-11T00:00:00.000Z",
        isCurrent: true,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicProgramRenderer", () => {
  it("filters schedule and speaker lineup together", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} />);

    const schedule = () =>
      screen.getByRole("heading", { name: "Schedule" }).closest("section") as HTMLElement;
    const speakers = () =>
      screen.getByRole("heading", { name: "Speakers" }).closest("section") as HTMLElement;

    expect(within(schedule()).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(schedule()).getByText("Community Circle")).toBeInTheDocument();
    expect(within(speakers()).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(speakers()).getByText("Grace Hopper")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Track"), "platform");
    expect(within(schedule()).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(schedule()).queryByText("Community Circle")).not.toBeInTheDocument();
    expect(within(speakers()).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(speakers()).queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("shows session detail with TBD/pending and a calendar chooser", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<PublicProgramRenderer data={programResponse()} />);

    const schedule = screen.getByRole("heading", { name: "Schedule" }).closest("section");
    expect(schedule).toBeTruthy();
    await user.click(
      within(schedule as HTMLElement).getByRole("button", { name: /Community Circle/i }),
    );
    const detail = screen.getByRole("heading", { name: "Session" }).closest("section");
    expect(detail).toBeTruthy();
    expect(within(detail as HTMLElement).getByText("TBD")).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("Location pending")).toBeInTheDocument();

    await user.click(
      within(detail as HTMLElement).getByRole("button", { name: /Add to calendar/i }),
    );
    const menu = screen.getByRole("menu", { name: /Add to calendar/i });
    expect(within(menu).getByText(/Google Calendar \(needs a scheduled time\)/i)).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /System calendar/i })).toHaveAttribute(
      "href",
      expect.stringContaining("webcal://"),
    );
    expect(within(menu).getByRole("menuitem", { name: /Open ICS feed/i })).toHaveAttribute(
      "href",
      expect.stringContaining(`/api/events/${eventId}/program/sessions/ses-2/calendar.ics`),
    );

    await user.click(within(menu).getByRole("menuitem", { name: /Copy ICS URL/i }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(`/api/events/${eventId}/program/sessions/ses-2/calendar.ics`),
    );
  });

  it("offers Google and Outlook deep links when the session is scheduled", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} />);

    const schedule = screen.getByRole("heading", { name: "Schedule" }).closest("section");
    await user.click(
      within(schedule as HTMLElement).getByRole("button", { name: /Opening Keynote/i }),
    );
    const detail = screen.getByRole("heading", { name: "Session" }).closest("section");
    await user.click(
      within(detail as HTMLElement).getByRole("button", { name: /Add to calendar/i }),
    );
    const menu = screen.getByRole("menu", { name: /Add to calendar/i });
    expect(within(menu).getByRole("menuitem", { name: /^Google Calendar$/i })).toHaveAttribute(
      "href",
      expect.stringContaining("calendar.google.com"),
    );
    expect(within(menu).getByRole("menuitem", { name: /^Outlook Calendar$/i })).toHaveAttribute(
      "href",
      expect.stringContaining("outlook.live.com"),
    );
  });

  it("applies event theme accent without replacing structure", () => {
    const { container } = render(
      <PublicProgramRenderer
        data={programResponse({
          event: {
            ...programResponse().event,
            themeAccent: "#081d3a",
          },
        })}
      />,
    );
    const root = container.querySelector(".program-renderer") as HTMLElement;
    expect(root.style.getPropertyValue("--program-accent")).toBe("#081d3a");
    expect(screen.getByTestId("public-program-renderer")).toBeInTheDocument();
  });
});

describe("Public program routes", () => {
  function renderAt(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const programRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/e/$eventId/program",
      component: PublicProgramPage,
      validateSearch: (search: Record<string, unknown>) => ({
        revision: typeof search.revision === "string" ? search.revision : undefined,
      }),
    });
    const embedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/e/$eventId/program/embed",
      component: PublicProgramEmbedPage,
      validateSearch: (search: Record<string, unknown>) => ({
        revision: typeof search.revision === "string" ? search.revision : undefined,
      }),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([programRoute, embedRoute]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  it("renders full page and embed from the same public payload", async () => {
    const payload = programResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain(`/api/events/${eventId}/program`);
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    renderAt(`/e/${eventId}/program`);
    expect(await screen.findByRole("heading", { name: payload.event.name })).toBeInTheDocument();
    expect(screen.getByText("Powered by ChartStead")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Embed view/i })).toBeInTheDocument();
    cleanup();

    renderAt(`/e/${eventId}/program/embed`);
    expect(await screen.findByRole("heading", { name: payload.event.name })).toBeInTheDocument();
    expect(screen.getByTestId("public-program-renderer")).toHaveClass("mode-embed");
    expect(screen.queryByRole("link", { name: /Embed view/i })).not.toBeInTheDocument();
  });

  it("keeps schedule, detail, and speakers in one responsive layout tree", () => {
    const { container } = render(
      <PublicProgramRenderer data={programResponse()} mode="page" />,
    );
    expect(container.querySelector(".program-layout")).toBeTruthy();
    expect(container.querySelector(".program-schedule")).toBeTruthy();
    expect(container.querySelector(".program-detail")).toBeTruthy();
    expect(container.querySelector(".program-speakers")).toBeTruthy();
    expect(container.querySelector(".program-filters")).toBeTruthy();
  });
});
