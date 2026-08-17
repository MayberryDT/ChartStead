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
    vi.spyOn(api, "fetchCourseCheckPolicy").mockResolvedValue({
      requireTwoPersonApproval: false,
      requireDistinctApprover: false,
      requireReasonOnApprove: false,
      maxAgentMode: "propose_only",
    } as Awaited<ReturnType<typeof api.fetchCourseCheckPolicy>>);
  });

  it("shows API and MCP automation access without an OAuth wizard", async () => {
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
    vi.spyOn(api, "createEventApiKey").mockResolvedValue({
      apiKey: {
        id: "key-1",
        name: "Claude Code",
        token: "cs_live_testtokenvalue",
        keyPrefix: "cs_live_test",
        principalKind: "agent",
        agentMode: "propose_only",
        courseCheckScopes: ["decisions", "drafts"],
        createdAt: "2026-08-12T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /^Agents$/i }));
    expect(await screen.findByRole("button", { name: /^API$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^MCP$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Choose an assistant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open secure handoff/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^MCP$/i }));
    expect(screen.getByText(/^MCP URL$/i)).toBeInTheDocument();
    expect(screen.getByText(/^MCP config$/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create MCP token/i }));

    await waitFor(() => {
      expect(api.createEventApiKey).toHaveBeenCalledWith(
        "pacific-open-data-summit-2026",
        expect.objectContaining({
          principalKind: "agent",
          agentMode: "propose_only",
        }),
      );
    });
    expect(await screen.findByText("cs_live_testtokenvalue")).toBeInTheDocument();
    expect(screen.getByText(/Token \(shown once\)/i)).toBeInTheDocument();
  });

  it("creates API keys from the API tab", async () => {
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

    await user.click(await screen.findByRole("button", { name: /^Agents$/i }));
    expect(await screen.findByRole("button", { name: /Create API key/i })).toBeInTheDocument();
    expect(screen.queryByText(/Developer access/i)).not.toBeInTheDocument();
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
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <SettingsWorkspace eventId="pacific-open-data-summit-2026" />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /^Airtable$/i }));
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect and pull/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Disconnect/i })).toBeDisabled();
    expect(screen.queryByPlaceholderText(/Search/i)).not.toBeInTheDocument();
  });

  it("connects an Airtable base from Settings", async () => {
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
        pulledAt: "2026-08-12T00:00:00.000Z",
        changes: [
          {
            kind: "submission",
            chartsteadId: "SUB-1",
            airtableRecordId: "rec1",
            mappedValues: {},
          },
        ],
        rejectedChanges: [],
        error: null,
        guidance: "Airtable pull is up to date.",
      },
      sync: {
        health: "healthy",
        configured: true,
        hasAccessToken: true,
        lastPullAt: "2026-08-12T00:00:00.000Z",
        lastSuccessAt: "2026-08-12T00:00:00.000Z",
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

    await user.click(await screen.findByRole("button", { name: /^Airtable$/i }));
    await user.type(screen.getByLabelText("Base ID"), "appChartSteadDemo");
    await user.type(screen.getByLabelText("Token"), "pat_demo_sandbox");
    await user.click(await screen.findByRole("button", { name: /Connect and pull/i }));
    await waitFor(() => {
      expect(api.connectAirtableSync).toHaveBeenCalledWith(
        "pacific-open-data-summit-2026",
        { baseId: "appChartSteadDemo", accessToken: "pat_demo_sandbox" },
      );
    });
  });
});
