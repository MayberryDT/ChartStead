import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EventRecord, PublicEmbedConfig } from "../../shared/events";
import { DEFAULT_PUBLIC_EMBED_FIELDS } from "../../shared/public-program";
import { agendaEmbedFixtureData } from "../../src/AgendaEmbedFixture";
import {
  EmbedManagerWorkspace,
  type EmbedsChrome,
} from "../../src/EmbedManagerWorkspace";

const event: EventRecord = {
  ...agendaEmbedFixtureData.event,
  timezone: agendaEmbedFixtureData.event.timezone ?? "America/Denver",
  submissionCount: 57,
  unreviewedCount: 12,
  tracks: agendaEmbedFixtureData.event.tracks.map((track) => ({
    ...track,
    proposalCount: 0,
  })),
};

const config: PublicEmbedConfig = {
  id: "embed_sessions",
  eventId: event.id,
  name: "Conference sessions",
  widget: "sessions",
  theme: "light",
  filters: {},
  fields: DEFAULT_PUBLIC_EMBED_FIELDS,
  revisionId: null,
  disabled: false,
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T13:00:00.000Z",
  publicUrl: `/e/${event.id}/embed/embed_sessions`,
  embedCode: `<iframe src="/e/${event.id}/embed/embed_sessions"></iframe>`,
  feedUrl: `/api/events/${event.id}/public-embeds/embed_sessions/feed.json`,
};

function renderWorkspace() {
  const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/api/events/${event.id}/embed-configs`)) {
      return new Response(JSON.stringify({ configs: [config] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith(`/api/events/${event.id}/program`)) {
      return new Response(JSON.stringify(agendaEmbedFixtureData), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `Unhandled ${url}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchStub);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function WorkspaceHarness() {
    const [chrome, setChrome] = useState<EmbedsChrome | null>(null);
    return (
      <>
        <header aria-label="Organizer embed controls">
          {chrome?.tools}
          {chrome?.actions}
        </header>
        <EmbedManagerWorkspace event={event} onChromeChange={setChrome} />
      </>
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceHarness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("EmbedManagerWorkspace", () => {
  it("presents saved embeds as a Harbor Ledger queue with the real selected renderer", async () => {
    renderWorkspace();

    const queue = await screen.findByRole("table", { name: "Saved embeds" });
    expect(within(queue).getByRole("button", { name: "Conference sessions" })).toBeVisible();
    await waitFor(() => {
      expect(document.querySelector(".embeds-list-preview .widget-sessions")).toBeTruthy();
    });
  });

  it("opens a dedicated builder and swaps the real preview when the widget changes", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole("button", { name: "New embed" }));
    const builder = await screen.findByLabelText("Embed builder");
    const widget = within(builder).getByRole("combobox", { name: "Widget" });
    await user.click(widget);
    await user.click(await screen.findByRole("option", { name: "Speaker Gallery" }));

    await waitFor(() => {
      expect(builder.querySelector(".embeds-preview-frame .widget-speaker-gallery")).toBeTruthy();
    });
  });
});
