import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EventListResponse } from "../../shared/events";
import { navItems, OrganizerShell } from "../../src/OrganizerShell";

const data: EventListResponse = {
  events: [
    {
      id: "event-one",
      name: "Event One",
      startsOn: "2026-10-07",
      endsOn: "2026-10-08",
      timezone: "UTC",
      submissionCount: 4,
      unreviewedCount: 2,
      tracks: [],
      rooms: [],
    },
    {
      id: "event-two",
      name: "Event Two",
      startsOn: "2026-11-07",
      endsOn: "2026-11-08",
      timezone: "UTC",
      submissionCount: 0,
      unreviewedCount: 0,
      tracks: [],
      rooms: [],
    },
  ],
  principal: {
    id: "organizer-1",
    displayName: "Organizer One",
    role: "admin",
    eventIds: ["event-one", "event-two"],
  },
};

describe("OrganizerShell", () => {
  it("renders one toolbar with explicit identity, tools, and actions slots", () => {
    const { container } = render(
      <OrganizerShell
        data={data}
        event={data.events[0]!}
        activeNav="Overview"
        title="Event One"
        meta="October 7-8, 2026"
        currentRole="admin"
        onNavigate={vi.fn()}
        onEventChange={vi.fn()}
        onCreateEvent={vi.fn()}
        identity={<h1>Event identity</h1>}
        tools={<button type="button">Queue tools</button>}
        actions={<button type="button">Workspace action</button>}
      >
        <section aria-label="Work surface">Work surface</section>
      </OrganizerShell>,
    );

    expect(container.querySelectorAll(".shell-toolbar")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Event identity" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Queue tools" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Workspace action" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Work surface" })).toBeVisible();
  });

  it("keeps organizer navigation and event context keyboard reachable", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onEventChange = vi.fn();

    render(
      <OrganizerShell
        data={data}
        event={data.events[0]!}
        activeNav="Overview"
        title="Event One"
        meta="October 7-8, 2026"
        currentRole="admin"
        onNavigate={onNavigate}
        onEventChange={onEventChange}
        onCreateEvent={vi.fn()}
        identity={null}
      >
        <section aria-label="Work surface">Work surface</section>
      </OrganizerShell>,
    );

    const agenda = screen.getByRole("link", { name: "Agenda" });
    agenda.focus();
    expect(agenda).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledWith("Agenda");

    await user.click(screen.getByRole("combobox", { name: "Event" }));
    await user.click(await screen.findByRole("option", { name: "Event Two" }));
    expect(onEventChange).toHaveBeenCalledWith("event-two");
  });

  it("publishes direct event-scoped links for every organizer surface", () => {
    render(
      <OrganizerShell
        data={data}
        event={data.events[0]!}
        activeNav="Overview"
        title="Event One"
        meta="October 7-8, 2026"
        currentRole="admin"
        onNavigate={vi.fn()}
        onEventChange={vi.fn()}
        onCreateEvent={vi.fn()}
        identity={<h1>Event identity</h1>}
      >
        <section aria-label="Work surface">Work surface</section>
      </OrganizerShell>,
    );

    const expectedHrefs = {
      Overview: "/e/event-one",
      Submissions: "/e/event-one/submissions",
      Forms: "/e/event-one/forms",
      Speakers: "/e/event-one/speakers",
      Agenda: "/e/event-one/agenda",
      Messages: "/e/event-one/messages",
      Embeds: "/e/event-one/embeds",
      Settings: "/e/event-one/settings",
    } as const;

    for (const item of navItems) {
      expect(screen.getByRole("link", { name: new RegExp(`^${item}`) })).toHaveAttribute(
        "href",
        expectedHrefs[item],
      );
    }
  });

  it("keeps the shell toolbar and tools slot ready for narrow-width scrolling", () => {
    const { container } = render(
      <OrganizerShell
        data={data}
        event={data.events[0]!}
        activeNav="Submissions"
        title="Submissions"
        meta="4 total"
        currentRole="admin"
        onNavigate={vi.fn()}
        onEventChange={vi.fn()}
        onCreateEvent={vi.fn()}
        identity={null}
        tools={
          <div className="topbar-tools-inner">
            <button type="button">Search</button>
            <button type="button">Status</button>
            <button type="button">Track</button>
          </div>
        }
      >
        <section aria-label="Work surface">Work surface</section>
      </OrganizerShell>,
    );

    const toolbar = container.querySelector<HTMLElement>(".shell-toolbar");
    const tools = container.querySelector<HTMLElement>(".topbar-tools");
    expect(toolbar).toHaveClass("shell-toolbar-tools-only");
    expect(toolbar).toHaveAttribute("data-polish-id", "S-shell-topbar");
    expect(tools).toContainElement(container.querySelector(".topbar-tools-inner"));
    expect(tools).toHaveAttribute("aria-label", "Submissions tools");
    expect(screen.getByRole("button", { name: "Search" })).toBeVisible();
  });
});
