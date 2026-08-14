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
         speakers: [
           {
             id: "sp-1",
             name: "Ada Lovelace",
             title: "Program Director",
             company: "Analytical Engines",
             role: "primary",
           },
         ],
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
         speakers: [
           {
             id: "sp-2",
             name: "Grace Hopper",
             title: "Systems Lead",
             company: "Compiler Works",
             role: "primary",
           },
         ],
      },
    ],
    speakers: [
      {
        id: "sp-1",
        name: "Ada Lovelace",
        biography: "Analytical engines for organizers.",
        title: "Program Director",
        company: "Analytical Engines",
        socialLinks: { linkedin: "", x: "", github: "", website: "https://ada.example.test" },
        headshotAssetId: null,
        sessionIds: ["ses-1"],
      },
      {
        id: "sp-2",
        name: "Grace Hopper",
        biography: "Debugging the schedule.",
        title: "Systems Lead",
        company: "Compiler Works",
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

async function chooseOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
}

describe("PublicProgramRenderer", () => {
  it("keeps itinerary state controlled across sessions, agenda, and itinerary widgets", async () => {
    const user = userEvent.setup();
    const onItinerarySessionIdsChange = vi.fn();
    const { rerender } = render(
      <PublicProgramRenderer
        data={programResponse()}
        mode="embed"
        widget="sessions"
        itinerarySessionIds={[]}
        onItinerarySessionIdsChange={onItinerarySessionIdsChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save Opening Keynote to itinerary" }));
    expect(onItinerarySessionIdsChange).toHaveBeenLastCalledWith(["ses-1"]);

    rerender(
      <PublicProgramRenderer
        data={programResponse()}
        mode="embed"
        widget="agenda"
        itinerarySessionIds={["ses-1"]}
        onItinerarySessionIdsChange={onItinerarySessionIdsChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Opening Keynote from itinerary" }));
    expect(onItinerarySessionIdsChange).toHaveBeenLastCalledWith([]);

    rerender(
      <PublicProgramRenderer
        data={programResponse()}
        mode="embed"
        widget="itinerary"
        itinerarySessionIds={[]}
        onItinerarySessionIdsChange={onItinerarySessionIdsChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save Opening Keynote" }));
    expect(onItinerarySessionIdsChange).toHaveBeenLastCalledWith(["ses-1"]);
  });

  it("keeps speaker-gallery selection controlled and reconciles an invalid selection", async () => {
    const user = userEvent.setup();
    const onSelectSpeaker = vi.fn();
    const { rerender } = render(
      <PublicProgramRenderer
        data={programResponse()}
        mode="embed"
        widget="speaker-gallery"
        selectedSpeakerId="sp-1"
        onSelectSpeaker={onSelectSpeaker}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Selected speaker: Ada Lovelace" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Grace Hopper/i }));
    expect(onSelectSpeaker).toHaveBeenCalledWith("sp-2");

    rerender(
      <PublicProgramRenderer
        data={programResponse()}
        mode="embed"
        widget="speaker-gallery"
        selectedSpeakerId="missing"
        onSelectSpeaker={onSelectSpeaker}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Selected speaker: Ada Lovelace" })).toBeVisible();
  });
  it("renders the dedicated agenda controls and preserves itinerary/filter behavior", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} mode="embed" widget="agenda" />);

    expect(screen.queryByText("ChartStead Agenda")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to itinerary" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search agenda" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Event day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Opening Keynote to itinerary/ })).toHaveAttribute("aria-pressed", "false");

    await chooseOption(user, "Track", "Platform");
    expect(screen.getByText("Opening Keynote")).toBeInTheDocument();
    expect(screen.queryByText("Community Circle")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("combobox", { name: "Track" })).toHaveTextContent("All");
    expect(screen.getByText("Opening Keynote")).toBeInTheDocument();
  });

  it("renders itinerary as an accessible time-by-room grid and preserves saved state while filtering", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} widget="itinerary" mode="embed" />);

    expect(screen.getByRole("grid", { name: "Schedule itinerary" })).toBeInTheDocument();
    expect(screen.getByText("October 7–8, 2026")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Harbor Hall" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save Opening Keynote" });
    await user.click(save);
    expect(save).toHaveAttribute("aria-pressed", "true");

    await chooseOption(user, "Track", "Community");
    expect(within(screen.getByRole("grid", { name: "Schedule itinerary" })).queryByText("Opening Keynote")).not.toBeInTheDocument();
    await chooseOption(user, "Track", "Platform");
    expect(screen.getAllByRole("button", { name: "Remove Opening Keynote from itinerary" })
      .some((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
  });

  it("keeps controlled itinerary saves atomic, duplicate-free, and restorable", async () => {
    const user = userEvent.setup();
    const onItineraryChange = vi.fn();
    const { rerender } = render(
      <PublicProgramRenderer data={programResponse()} widget="itinerary" mode="embed"
        itinerarySessionIds={[]} onItinerarySessionIdsChange={onItineraryChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Save Opening Keynote" }));
    expect(onItineraryChange).toHaveBeenLastCalledWith(["ses-1"]);

    rerender(<PublicProgramRenderer data={programResponse()} widget="itinerary" mode="embed"
      itinerarySessionIds={["ses-1", "ses-1"]} onItinerarySessionIdsChange={onItineraryChange} />);
    expect(screen.getByText("1 saved")).toBeInTheDocument();
    await user.click(within(screen.getByRole("grid", { name: "Schedule itinerary" }))
      .getByRole("button", { name: "Remove Opening Keynote from itinerary" }));
    expect(onItineraryChange).toHaveBeenLastCalledWith([]);
  });

  it("filters schedule and speaker lineup together", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} />);

    const schedule = () =>
      screen.getByRole("heading", { name: "Schedule" }).closest("section") as HTMLElement;
    const speakers = () =>
      screen.getByRole("heading", { name: "Speakers" }).closest("section") as HTMLElement;

    expect(within(schedule()).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(schedule()).getByText("Community Circle")).toBeInTheDocument();
    expect(within(speakers()).getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(within(speakers()).getAllByText("Grace Hopper").length).toBeGreaterThan(0);

    await chooseOption(user, "Track", "Platform");
    expect(within(schedule()).getByText("Opening Keynote")).toBeInTheDocument();
    expect(within(schedule()).queryByText("Community Circle")).not.toBeInTheDocument();
    expect(within(speakers()).getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(within(speakers()).queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("renders the complete card anatomy and expands one description without losing state", async () => {
    const user = userEvent.setup();
    const longDescription = Array.from(
      { length: 3 },
      () => "A public program description that remains useful when the card is expanded.",
    ).join(" ");
    render(
      <PublicProgramRenderer
        data={programResponse({
          sessions: [
            { ...programResponse().sessions[0]!, description: longDescription },
            programResponse().sessions[1]!,
          ],
        })}
      />,
    );

    const card = screen.getByTestId("public-session-card-ses-1");
    expect(within(card).getByRole("heading", { name: "Opening Keynote" })).toBeInTheDocument();
    expect(within(card).getByText(/Oct 7.*3:00 PM.*3:45 PM/i)).toBeInTheDocument();
    expect(within(card).getByText("Harbor Hall")).toBeInTheDocument();
    expect(within(card).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(card).getByText("Program Director · Analytical Engines")).toBeInTheDocument();
    expect(within(card).getByText("keynote")).toBeInTheDocument();
    expect(within(card).getByText("Platform")).toBeInTheDocument();

    await chooseOption(user, "Track", "Platform");
    await user.type(screen.getByRole("searchbox", { name: "Search sessions or speakers" }), "Ada");
    await user.click(within(card).getByRole("button", { name: "Opening Keynote" }));
    const expand = within(card).getByRole("button", { name: "Show more" });
    await user.click(expand);

    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText(longDescription)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Track" })).toHaveTextContent("Platform");
    expect(screen.getByRole("searchbox", { name: "Search sessions or speakers" })).toHaveValue(
      "Ada",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 sessions");
    expect(screen.getByRole("button", { name: "Opening Keynote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "false");
  });

  it("searches titles and speakers, composes track/format/location facets, and counts results", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={programResponse()} />);

    const search = screen.getByRole("searchbox", { name: "Search sessions or speakers" });
    await user.type(search, "Grace Hopper");
    expect(screen.getByTestId("public-session-card-ses-2")).toBeInTheDocument();
    expect(screen.queryByTestId("public-session-card-ses-1")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 sessions");

    await chooseOption(user, "Track", "Community");
    await chooseOption(user, "Format", "talk");
    await chooseOption(user, "Location", "Location pending");
    expect(screen.getByTestId("public-session-card-ses-2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 sessions");

    await chooseOption(user, "Track", "Platform");
    expect(screen.getByText("No sessions match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 2 sessions");
  });

  it("orders speaker directory and gallery by surname and opens public-safe speaker details", async () => {
    const user = userEvent.setup();
    const longBiography = Array.from(
      { length: 5 },
      () => "Analytical engines for organizers need public context and careful biography controls.",
    ).join(" ");
    render(
      <PublicProgramRenderer
        data={programResponse({
          speakers: [
            { ...programResponse().speakers[0]!, biography: longBiography },
            programResponse().speakers[1]!,
          ],
        })}
      />,
    );

    const directory = screen.getByRole("heading", { name: "Speakers List" }).closest("section");
    const gallery = screen.getByRole("heading", { name: "Speaker Gallery" }).closest("section");
    expect(directory).toBeTruthy();
    expect(gallery).toBeTruthy();

    const directoryButtons = within(directory as HTMLElement).getAllByRole("button");
    expect(directoryButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Grace Hopper"),
      expect.stringContaining("Ada Lovelace"),
    ]);
    const galleryButtons = within(gallery as HTMLElement).getAllByRole("button");
    expect(galleryButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Grace Hopper"),
      expect.stringContaining("Ada Lovelace"),
    ]);

    await user.click(within(directory as HTMLElement).getByRole("button", { name: /Ada Lovelace/i }));
    const detail = screen.getByRole("article", { name: "Ada Lovelace" });
    expect(within(detail).getByText("Program Director · Analytical Engines")).toBeInTheDocument();
    expect(within(detail).getByText(/Analytical engines for organizers need public context/)).toBeInTheDocument();
    const expandBiography = within(detail).getByRole("button", { name: "Show full biography" });
    expect(expandBiography).toHaveAttribute("aria-expanded", "false");
    await user.click(expandBiography);
    expect(expandBiography).toHaveAttribute("aria-expanded", "true");
    expect(within(detail).getByText(longBiography)).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "Website" })).toHaveAttribute(
      "href",
      "https://ada.example.test",
    );
    const sessionButton = within(detail).getByRole("button", { name: /Opening Keynote/i });
    expect(sessionButton).toHaveTextContent(/Oct 7.*3:00 PM.*Harbor Hall/i);
  });

  it("narrows list and gallery by speaker search, handles missing profile data, and closes without clearing state", async () => {
    const user = userEvent.setup();
    const payload = programResponse({
      speakers: [
        programResponse().speakers[0]!,
        {
          ...programResponse().speakers[1]!,
          title: "",
          company: "",
          biography: "",
        },
      ],
    });
    const { container } = render(<PublicProgramRenderer data={payload} />);

    const search = screen.getByRole("searchbox", { name: "Search sessions or speakers" });
    await user.type(search, "Grace");
    expect(screen.getByRole("status")).toHaveTextContent("1 speaker");

    const directory = screen.getByRole("heading", { name: "Speakers List" }).closest("section");
    const gallery = screen.getByRole("heading", { name: "Speaker Gallery" }).closest("section");
    expect(within(directory as HTMLElement).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(directory as HTMLElement).queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(within(gallery as HTMLElement).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(gallery as HTMLElement).queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(container.querySelector(".program-speaker-gallery-card .program-speaker-avatar"))
      .toHaveTextContent("GH");

    await user.click(within(gallery as HTMLElement).getByRole("button", { name: /Grace Hopper/i }));
    const detail = screen.getByRole("article", { name: "Grace Hopper" });
    expect(within(detail).getAllByText("Professional details pending").length).toBeGreaterThan(0);
    expect(within(detail).getByText("Biography pending.")).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: /Community Circle/i })).toHaveTextContent(
      /Date TBD.*Location pending/i,
    );

    await user.click(within(detail).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("article", { name: "Grace Hopper" })).not.toBeInTheDocument();
    expect(search).toHaveValue("Grace");
    expect(within(gallery as HTMLElement).getByText("Grace Hopper")).toBeInTheDocument();
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
    expect(
      within(schedule as HTMLElement)
        .getByTestId("public-session-card-ses-2")
        .getAttribute("aria-labelledby"),
    ).toBe("session-title-ses-2");

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
        query: typeof search.query === "string" ? search.query : undefined,
        day: typeof search.day === "string" ? search.day : undefined,
        trackId: typeof search.trackId === "string" ? search.trackId : undefined,
        roomId: typeof search.roomId === "string" ? search.roomId : undefined,
        format: typeof search.format === "string" ? search.format : undefined,
        speakerId: typeof search.speakerId === "string" ? search.speakerId : undefined,
        session: typeof search.session === "string" ? search.session : undefined,
        speaker: typeof search.speaker === "string" ? search.speaker : undefined,
        itinerary: typeof search.itinerary === "string" ? search.itinerary : undefined,
        widget: typeof search.widget === "string" ? search.widget : undefined,
      }),
    });
    const embedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/e/$eventId/program/embed",
      component: PublicProgramEmbedPage,
      validateSearch: (search: Record<string, unknown>) => ({
        revision: typeof search.revision === "string" ? search.revision : undefined,
        query: typeof search.query === "string" ? search.query : undefined,
        day: typeof search.day === "string" ? search.day : undefined,
        trackId: typeof search.trackId === "string" ? search.trackId : undefined,
        roomId: typeof search.roomId === "string" ? search.roomId : undefined,
        format: typeof search.format === "string" ? search.format : undefined,
        speakerId: typeof search.speakerId === "string" ? search.speakerId : undefined,
        session: typeof search.session === "string" ? search.session : undefined,
        speaker: typeof search.speaker === "string" ? search.speaker : undefined,
        itinerary: typeof search.itinerary === "string" ? search.itinerary : undefined,
        widget: typeof search.widget === "string" ? search.widget : undefined,
      }),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([programRoute, embedRoute]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    return { ...view, router };
  }

  it("renders full page and embed from the same public payload", async () => {
    const user = userEvent.setup();
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
    await user.type(screen.getByRole("searchbox", { name: "Search sessions or speakers" }), "Grace");
    expect(screen.getByRole("searchbox", { name: "Search sessions or speakers" })).toHaveValue(
      "Grace",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 speaker");
    expect(screen.getByTestId("public-program-renderer")).toHaveClass("mode-embed");
    expect(screen.queryByRole("link", { name: /Embed view/i })).not.toBeInTheDocument();
  });

  it("restores and updates speaker and itinerary state through TanStack Router search", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(programResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    );

    const { router } = renderAt(`/e/${eventId}/program/embed?widget=speaker-gallery&speaker=sp-1&itinerary=ses-1`);
    expect(await screen.findByRole("complementary", { name: "Selected speaker: Ada Lovelace" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Grace Hopper/i }));
    expect(router.state.location.search).toMatchObject({ speaker: "sp-2", itinerary: "ses-1" });
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
    expect(container.querySelector(".program-speaker-surfaces")).toBeTruthy();
    expect(container.querySelector(".program-speaker-directory")).toBeTruthy();
    expect(container.querySelector(".program-speaker-gallery")).toBeTruthy();
  });
});
