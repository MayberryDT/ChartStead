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
    expect(screen.getAllByRole("button", { name: /Aiden Tui|Carmen Rodrigues|Maya Chen|Jordon Prasad|Jordan Lee|Leilani Williams|Linh Tran|Malakai Iosefa|Maria Svensson|Priya Nair|Ravi Singh|Sione Vaka|Takuya Nakamura|Tiana Moana|Will Jackson/ })).toHaveLength(15);
    expect(screen.getAllByAltText("Portrait of Aiden Tui").every((image) => image.getAttribute("src") === "/demo/speakers/speaker-1.webp")).toBe(true);
    expect(speakersListFixture.speakers.every((speaker) => !("email" in speaker))).toBe(true);

    await user.click(screen.getByRole("combobox", { name: "Track" }));
    await user.click(screen.getByRole("option", { name: "Community" }));
    expect(screen.getByRole("status")).toHaveTextContent("4 speakers");
    await user.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(screen.getByRole("status")).toHaveTextContent("15 speakers");
  });
});
