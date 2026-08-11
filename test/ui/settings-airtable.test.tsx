import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsWorkspace } from "../../src/SettingsWorkspace";
import * as api from "../../src/api";

describe("Settings Airtable sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows stacked connect controls without search-field chrome", async () => {
    vi.spyOn(api, "fetchAirtableSync").mockResolvedValue({
      sync: {
        health: "unconfigured",
        configured: false,
        hasAccessToken: false,
        lastPullAt: null,
        lastSuccessAt: null,
        lastError: null,
        guidance: "Connect Airtable in Settings.",
        pendingChangeCount: 0,
        baseId: null,
      },
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SettingsWorkspace eventId="pacific-open-data-summit-2026" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect demo Airtable sandbox/i }),
    ).toBeInTheDocument();
    const base = screen.getByLabelText(/^Base ID$/i);
    const token = screen.getByLabelText(/Personal access token/i);
    expect(base.className).toContain("settings-input");
    expect(token.className).toContain("settings-input");
    expect(base.closest("label.field")).toBeNull();
  });

  it("connects the demo sandbox in one click", async () => {
    vi.spyOn(api, "fetchAirtableSync").mockResolvedValue({
      sync: {
        health: "unconfigured",
        configured: false,
        hasAccessToken: false,
        lastPullAt: null,
        lastSuccessAt: null,
        lastError: null,
        guidance: "Connect Airtable in Settings.",
        pendingChangeCount: 0,
        baseId: null,
      },
    });
    vi.spyOn(api, "connectAirtableSync").mockResolvedValue({
      pull: {
        ok: true,
        health: "healthy",
        pulledAt: "2026-08-11T12:05:00.000Z",
        changes: [{ kind: "submission", chartsteadId: "SUB-1", airtableRecordId: "rec1", mappedValues: {} }],
        error: null,
        guidance: "Airtable pull is up to date.",
      },
      sync: {
        health: "healthy",
        configured: true,
        hasAccessToken: true,
        lastPullAt: "2026-08-11T12:05:00.000Z",
        lastSuccessAt: "2026-08-11T12:05:00.000Z",
        lastError: null,
        guidance: "Airtable pull is up to date.",
        pendingChangeCount: 0,
        baseId: "appChartSteadDemo",
      },
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <SettingsWorkspace eventId="pacific-open-data-summit-2026" />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: /Connect demo Airtable sandbox/i }),
    );

    await waitFor(() => {
      expect(api.connectAirtableSync).toHaveBeenCalledWith(
        "pacific-open-data-summit-2026",
        { baseId: "appChartSteadDemo", accessToken: "pat_demo_sandbox" },
      );
    });
    expect(await screen.findByText(/Connected\. Pull applied 1/i)).toBeInTheDocument();
  });
});
