import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { agendaEmbedFixtureData } from "../../src/AgendaEmbedFixture";
import { PublicProgramRenderer } from "../../src/PublicProgramRenderer";

afterEach(() => { cleanup(); localStorage.clear(); });

async function chooseOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
}

describe("functional public agenda", () => {
  it("places sessions by real duration without collision and filters the grid", async () => {
    const user = userEvent.setup();
    render(<PublicProgramRenderer data={agendaEmbedFixtureData} mode="embed" widget="agenda" />);
    const grid = screen.getByRole("grid", { name: "Agenda sessions" });
    const keynote = within(grid).getByRole("article", { name: /Public Infrastructure for Everyone/ });
    const workshop = within(grid).getByRole("article", { name: /From Open Data to Public Value/ });
    expect(keynote).toHaveAttribute("data-duration", "60");
    expect(workshop).toHaveAttribute("data-duration", "75");
    expect(Number(workshop.getAttribute("data-grid-span"))).toBeGreaterThan(Number(keynote.getAttribute("data-grid-span")));

    await chooseOption(user, "Track", "Capacity Building");
    expect(within(grid).getByText("From Open Data to Public Value")).toBeInTheDocument();
    expect(within(grid).queryByText("Public Infrastructure for Everyone")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(grid).getByText("Public Infrastructure for Everyone")).toBeInTheDocument();
  });

  it("restores controlled itinerary saves and exposes keyboard-focusable controls", async () => {
    const user = userEvent.setup();
    const first = render(<PublicProgramRenderer data={agendaEmbedFixtureData} mode="embed" widget="agenda" />);
    const save = screen.getByRole("button", { name: /Save Public Infrastructure for Everyone to itinerary/ });
    await user.click(save);
    expect(save).toHaveAttribute("aria-pressed", "true");
    first.unmount();
    render(<PublicProgramRenderer data={agendaEmbedFixtureData} mode="embed" widget="agenda" itinerarySessionIds={["agenda-keynote"]} />);
    const remove = screen.getByRole("button", { name: /Remove Public Infrastructure for Everyone from itinerary/ });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    remove.focus();
    expect(remove).toHaveFocus();
  });
});
