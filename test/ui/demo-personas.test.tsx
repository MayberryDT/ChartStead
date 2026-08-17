import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoPersonasPage } from "../../src/DemoPersonasPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("demo persona entry", () => {
  it("explains all three evaluator journeys and enters only through the demo API", async () => {
    const navigateTo = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/demo/personas") {
        return Response.json({
          event: {
            id: "ai-engineer-worlds-fair-2026",
            name: "AI Engineer World's Fair 2026",
          },
          personas: [
            {
              id: "organizer",
              role: "admin",
              label: "Organizer",
              description: "Manage the event, review submissions, and coordinate the program.",
            },
            {
              id: "track-reviewer",
              role: "reviewer",
              label: "Track reviewer",
              description: "Evaluate proposals in the Agents track with the shared review queue.",
            },
            {
              id: "accepted-speaker",
              role: "speaker",
              label: "Accepted speaker",
              description: "Open a private signed portal for one accepted talk and its onboarding tasks.",
            },
          ],
        });
      }
      if (url === "/api/demo/personas/track-reviewer/enter" && init?.method === "POST") {
        return Response.json({
          path: "/e/ai-engineer-worlds-fair-2026/submissions?track=agents",
          persona: { role: "reviewer", trackIds: ["agents"] },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoPersonasPage navigateTo={navigateTo} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Choose an evaluator journey" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Organizer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Track reviewer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Accepted speaker" })).toBeVisible();
    expect(screen.getByText(/shared review queue/i)).toBeVisible();
    expect(screen.getByText(/private signed portal/i)).toBeVisible();
    expect(screen.getByText(/isolated demo data/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy AI-guided tour" })).toBeVisible();
    expect(screen.getByText(/Prefer an agent/i)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Enter as track reviewer" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/demo/personas/track-reviewer/enter",
      expect.objectContaining({ method: "POST" }),
    );
    expect(navigateTo).toHaveBeenCalledWith(
      "/e/ai-engineer-worlds-fair-2026/submissions?track=agents",
    );
  });

  it("offers an explicit safe reset and reports completion", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/demo/personas") {
        return Response.json({
          event: { id: "event", name: "Demo event" },
          personas: [],
        });
      }
      if (String(input) === "/api/demo/personas/reset" && init?.method === "POST") {
        return Response.json({
          reset: true,
          restored: ["track-reviewer", "accepted-speaker"],
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoPersonasPage navigateTo={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "Choose an evaluator journey" });
    await userEvent.click(screen.getByRole("button", { name: "Reset evaluator data" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Reviewer and speaker demo data restored.",
    );
  });

  it("copies the AI tour prompt and shows a toast with the next step", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/demo/personas") {
        return Response.json({
          event: { id: "event", name: "Demo event" },
          personas: [],
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoPersonasPage navigateTo={vi.fn()} />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "Choose an evaluator journey" });
    await userEvent.click(screen.getByRole("button", { name: "Copy AI-guided tour" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("ChartStead demo — AI-guided tour");
    expect(copied).toContain("How do you want to do this?");
    expect(copied).not.toMatch(/guide-only|guide \+ hands/i);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Prompt copied. Paste it into your AI agent — it'll walk you through the demo from there.",
    );
  });
});
