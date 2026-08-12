import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsWorkspace } from "../../src/SettingsWorkspace";
import * as api from "../../src/api";

describe("Settings Airtable sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "listEventApiKeys").mockResolvedValue({ apiKeys: [] });
    vi.spyOn(api, "listAiConnections").mockResolvedValue({ connections: [] });
  });

  it("connects and verifies a personal assistant without revealing a bearer token", async () => {
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
    vi.spyOn(api, "createAiConnection").mockResolvedValue({
      connection: {
        id: "connection-1",
        name: "Claude",
        provider: "claude",
        accessProfile: "research_prepare",
        approvalPolicy: "important_actions",
        status: "connection_not_tested",
        createdAt: "2026-08-12T00:00:00.000Z",
        lastUsedAt: null,
        lastTestAt: null,
        authorizationUrl: "https://claude.ai/settings/connectors?chartstead=code",
      },
    });
    vi.spyOn(api, "testAiConnection").mockResolvedValue({
      connection: {
        id: "connection-1",
        name: "Claude",
        provider: "claude",
        accessProfile: "research_prepare",
        approvalPolicy: "important_actions",
        status: "connected",
        createdAt: "2026-08-12T00:00:00.000Z",
        lastUsedAt: null,
        lastTestAt: "2026-08-12T00:01:00.000Z",
      },
      test: { acceptedSpeakersMissingBiography: 2, changedRecords: 0 },
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

    expect(await screen.findByText(/^AI connections$/i)).toBeInTheDocument();
    expect(screen.getByText(/Use your AI assistant with ChartStead/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Choose an assistant/i }));
    await user.click(screen.getByRole("button", { name: /^Claude$/i }));
    expect(screen.getByText(/Research and prepare/i)).toBeInTheDocument();
    expect(screen.getByText(/ChartStead will ask before/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Allow and connect/i }));

    await waitFor(() => {
      expect(api.createAiConnection).toHaveBeenCalledWith(
        "pacific-open-data-summit-2026",
        {
          provider: "claude",
          accessProfile: "research_prepare",
          approvalPolicy: "important_actions",
        },
      );
    });
    expect(screen.queryByText(/cs_live_/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Test connection/i }));
    expect(await screen.findByText(/Claude is connected/i)).toBeInTheDocument();
    expect(screen.getByText(/No changes were made/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Claude/i })).toBeInTheDocument();
  });

  it("keeps long-lived API keys under secondary Developer access", async () => {
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <SettingsWorkspace eventId="pacific-open-data-summit-2026" />
      </QueryClientProvider>,
    );

    const developer = await screen.findByText("Developer access");
    expect(developer).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create agent key/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open developer access/i }));
    expect(screen.getByRole("button", { name: /Create API key/i })).toBeInTheDocument();
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
        rejectedChanges: [],
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
