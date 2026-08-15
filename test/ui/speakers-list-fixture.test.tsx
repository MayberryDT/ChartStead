import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SpeakersListFixturePage, speakersListFixture } from "../../src/SpeakersListFixturePage";

afterEach(cleanup);

describe("premium speakers list fixture", () => {
  it("renders deterministic public-safe Atlas Modules content and working filters", async () => {
    const user = userEvent.setup();
    render(<SpeakersListFixturePage />);

    expect(screen.getByRole("heading", { name: "Pacific Open Data Summit 2026" })).toBeInTheDocument();
    expect(document.querySelectorAll(".program-speaker-list-entry")).toHaveLength(15);
    expect(screen.getAllByAltText("Portrait of Aiden Tui").every((image) => image.getAttribute("src") === "/demo/speakers/speaker-1.webp")).toBe(true);
    expect(speakersListFixture.speakers.every((speaker) => !("email" in speaker))).toBe(true);

    await user.click(screen.getByRole("combobox", { name: "Track" }));
    await user.click(screen.getByRole("option", { name: "Community" }));
    expect(document.querySelectorAll(".program-speaker-list-entry")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(document.querySelectorAll(".program-speaker-list-entry")).toHaveLength(15);
  });
});
