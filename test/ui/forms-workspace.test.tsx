import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultCfpDefinition } from "../../shared/cfp-definition";
import type { OrganizerCfpForm, OrganizerCfpFormSummary } from "../../shared/events";
import {
  defaultFormsQueue,
  FormsCommandBar,
  FormsWorkspace,
  type FormsQueueState,
} from "../../src/FormsWorkspace";
import * as api from "../../src/api";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    params,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    params: { eventId: string; formId: string };
    onClick?: (event: { stopPropagation: () => void }) => void;
  }) => (
    <a
      className={className}
      href={`/e/${params.eventId}/forms/${params.formId}`}
      onClick={onClick}
    >
      {children}
    </a>
  ),
}));

const eventId = "pacific-open-data-summit-2026";

const forms: OrganizerCfpFormSummary[] = [
  {
    id: "late-draft",
    name: "Lightning talks",
    lifecycleStatus: "draft",
    draftUpdatedAt: "2026-08-11T00:00:00.000Z",
    publishedVersion: null,
    publishedAt: null,
  },
  {
    id: "main-cfp",
    name: "Main CFP",
    lifecycleStatus: "published",
    draftUpdatedAt: "2026-08-01T00:00:00.000Z",
    publishedVersion: 3,
    publishedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "closed-workshop",
    name: "Workshop CFP",
    lifecycleStatus: "closed",
    draftUpdatedAt: "2026-07-15T00:00:00.000Z",
    publishedVersion: 1,
    publishedAt: "2026-07-01T00:00:00.000Z",
  },
];

function organizerForm(summary: OrganizerCfpFormSummary): OrganizerCfpForm {
  const draft = createDefaultCfpDefinition({
    definitionId: summary.id,
    eventId,
    trackChoices: [{ value: "platform", text: "Platform" }],
  });
  return {
    ...summary,
    draft,
    publishedDefinition: summary.publishedVersion ? { ...draft, status: "published", definitionVersion: summary.publishedVersion } : null,
  };
}

function Harness() {
  const [queue, setQueue] = useState<FormsQueueState>(defaultFormsQueue);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <FormsCommandBar
        queue={queue}
        onQueueChange={(next) => setQueue((current) => ({ ...current, ...next }))}
      />
      <FormsWorkspace
        eventId={eventId}
        queue={queue}
        onQueueChange={(next) => setQueue((current) => ({ ...current, ...next }))}
        onSelectionChange={() => undefined}
      />
    </QueryClientProvider>
  );
}

function renderForms(data: OrganizerCfpFormSummary[] = forms) {
  vi.spyOn(api, "fetchOrganizerForms").mockResolvedValue(data);
  vi.spyOn(api, "fetchOrganizerForm").mockImplementation(async (_eventId, formId) => {
    const summary = data.find((form) => form.id === formId) ?? data[0]!;
    return {
      form: organizerForm(summary),
      event: {
        id: eventId,
        name: "Pacific Open Data Summit 2026",
        startsOn: "2026-10-07",
        endsOn: "2026-10-08",
        timezone: "America/Los_Angeles",
      },
    };
  });
  return render(<Harness />);
}

describe("FormsWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an operational table instead of a card wall", async () => {
    const { container } = renderForms();

    const table = await screen.findByRole("table", { name: "Forms" });
    expect(within(table).getByRole("columnheader", { name: /Form/ })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: /Status/ })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: /Version/ })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: /Updated/ })).toBeVisible();
    expect(container.querySelector(".form-card-list")).toBeNull();
    expect(container.querySelector(".status-pill")).toBeNull();
    expect(screen.getByRole("link", { name: "Main CFP" })).toHaveAttribute(
      "href",
      `/e/${eventId}/forms/main-cfp`,
    );
    expect(within(table).getByText("Draft")).toBeVisible();
    expect(within(table).getByText("Published")).toBeVisible();
    expect(screen.getByText("v3")).toBeVisible();
    expect(screen.getByText("Not published")).toBeVisible();
  });

  it("filters and searches locally without refetching", async () => {
    const user = userEvent.setup();
    renderForms();
    await screen.findByRole("table", { name: "Forms" });

    await user.click(screen.getByRole("button", { name: "Draft" }));
    expect(screen.getByRole("link", { name: "Lightning talks" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Main CFP" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByLabelText("Search form name or ID"), "workshop");
    expect(screen.getByRole("link", { name: "Workshop CFP" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Main CFP" })).toBeNull();
    expect(api.fetchOrganizerForms).toHaveBeenCalledTimes(1);
  });

  it("auto-loads the first form and keeps the title as a builder link", async () => {
    renderForms();
    const table = await screen.findByRole("table", { name: "Forms" });
    const firstRow = table.querySelector("tbody tr");
    expect(firstRow).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Lightning talks" })).toHaveAttribute(
      "href",
      `/e/${eventId}/forms/late-draft`,
    );
    expect(screen.getByLabelText("Form preview")).toBeVisible();
  });

  it("sorts locally from headers without changing the loaded set", async () => {
    const user = userEvent.setup();
    renderForms();

    const table = await screen.findByRole("table", { name: "Forms" });
    const names = () =>
      within(table)
        .getAllByRole("link")
        .map((link) => link.textContent ?? "");

    expect(names()[0]).toContain("Lightning talks");

    await user.click(within(table).getByRole("button", { name: /Status/ }));
    expect(names()[0]).toContain("Lightning talks");

    await user.click(within(table).getByRole("button", { name: /Status/ }));
    expect(names()[0]).toContain("Workshop CFP");

    await user.click(within(table).getByRole("button", { name: /Updated/ }));
    expect(names()[0]).toContain("Lightning talks");
    expect(api.fetchOrganizerForms).toHaveBeenCalledTimes(1);
  });

  it("explains an empty event without inventing forms", async () => {
    renderForms([]);
    expect(await screen.findByText("No forms yet. Create one to open a public CFP.")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Forms" })).toBeNull();
  });

  it("surfaces a recoverable load error", async () => {
    vi.spyOn(api, "fetchOrganizerForms").mockRejectedValue(new Error("Unable to load forms"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FormsWorkspace
          eventId={eventId}
          queue={defaultFormsQueue}
          onQueueChange={() => undefined}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to load forms");
    });
  });
});
