import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";

describe("organizer application", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the seeded event in the locked organizer shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          event: {
            id: "pacific-open-data-summit-2026",
            name: "Pacific Open Data Summit 2026",
            startsOn: "2026-10-07",
            endsOn: "2026-10-08",
            tracks: ["Platform", "Program Ops", "Design Systems", "Community"],
            rooms: ["Harbor Hall", "Compass Room", "Chart Room"],
          },
          principal: { displayName: "Demo Administrator", role: "admin" },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Organizer" })).toBeVisible();
    expect(screen.getByLabelText("4 tracks")).toBeVisible();
    expect(screen.getByLabelText("3 rooms")).toBeVisible();
  });
});
