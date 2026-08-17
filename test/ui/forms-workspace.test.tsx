import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultCfpDefinition,
  updateQuestion,
  updateWelcome,
} from "../../shared/cfp-definition";
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

function organizerForm(
  summary: OrganizerCfpFormSummary,
  options?: { welcomeTitle?: string; titleLabel?: string; invalid?: boolean },
): OrganizerCfpForm {
  let draft = createDefaultCfpDefinition({
    definitionId: summary.id,
    eventId,
    trackChoices: [{ value: "platform", text: "Platform" }],
  });
  if (options?.welcomeTitle) {
    draft = updateWelcome(draft, {
      title: options.welcomeTitle,
      body: `Welcome body for ${summary.name}.`,
    });
  }
  if (options?.titleLabel) {
    draft = updateQuestion(draft, "title", { title: options.titleLabel });
  }
  if (options?.invalid) {
    draft = {
      ...draft,
      runtime: {
        ...draft.runtime,
        survey: {
          ...draft.runtime.survey,
          elements: draft.runtime.survey.elements.filter(
            (element) => element.name !== "title",
          ),
        },
      },
    };
  }
  return {
    ...summary,
    draft,
    publishedDefinition: summary.publishedVersion
      ? { ...draft, status: "published", definitionVersion: summary.publishedVersion }
      : null,
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

function renderForms(
  data: OrganizerCfpFormSummary[] = forms,
  detailFactory: (summary: OrganizerCfpFormSummary) => OrganizerCfpForm = organizerForm,
) {
  vi.spyOn(api, "fetchOrganizerForms").mockResolvedValue(data);
  vi.spyOn(api, "fetchOrganizerForm").mockImplementation(async (_eventId, formId) => {
    const summary = data.find((form) => form.id === formId) ?? data[0]!;
    return {
      form: detailFactory(summary),
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

  it("updates the right preview when a different form is selected", async () => {
    const user = userEvent.setup();
    const pair: OrganizerCfpFormSummary[] = [
      {
        id: "alpha-form",
        name: "Alpha talks",
        lifecycleStatus: "draft",
        draftUpdatedAt: "2026-08-11T00:00:00.000Z",
        publishedVersion: null,
        publishedAt: null,
      },
      {
        id: "beta-form",
        name: "Beta workshops",
        lifecycleStatus: "published",
        draftUpdatedAt: "2026-08-01T00:00:00.000Z",
        publishedVersion: 1,
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
    ];

    renderForms(pair, (summary) =>
      organizerForm(summary, {
        welcomeTitle:
          summary.id === "alpha-form" ? "Welcome to Alpha" : "Welcome to Beta",
        titleLabel:
          summary.id === "alpha-form" ? "Alpha talk title" : "Beta workshop title",
      }),
    );

    const table = await screen.findByRole("table", { name: "Forms" });
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Alpha talks");
    });
    expect(screen.getByTestId("forms-preview-welcome")).toHaveTextContent("Welcome to Alpha");
    expect(screen.getByText("Alpha talk title")).toBeVisible();
    expect(screen.queryByText("Beta workshop title")).toBeNull();

    await user.click(within(table).getByRole("link", { name: "Beta workshops" }).closest("tr")!);

    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Beta workshops");
    });
    expect(screen.getByTestId("forms-preview-welcome")).toHaveTextContent("Welcome to Beta");
    expect(screen.getByText("Beta workshop title")).toBeVisible();
    expect(screen.queryByText("Alpha talk title")).toBeNull();
    expect(screen.queryByTestId("forms-preview-loading")).toBeNull();
  });

  it("shows a clear loading state instead of a stale previous preview", async () => {
    const user = userEvent.setup();
    const pair: OrganizerCfpFormSummary[] = [
      {
        id: "first-form",
        name: "First form",
        lifecycleStatus: "draft",
        draftUpdatedAt: "2026-08-11T00:00:00.000Z",
        publishedVersion: null,
        publishedAt: null,
      },
      {
        id: "second-form",
        name: "Second form",
        lifecycleStatus: "published",
        draftUpdatedAt: "2026-08-01T00:00:00.000Z",
        publishedVersion: 1,
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
    ];

    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    vi.spyOn(api, "fetchOrganizerForms").mockResolvedValue(pair);
    vi.spyOn(api, "fetchOrganizerForm").mockImplementation(async (_eventId, formId) => {
      const summary = pair.find((form) => form.id === formId) ?? pair[0]!;
      if (formId === "second-form") await secondGate;
      return {
        form: organizerForm(summary, {
          welcomeTitle: formId === "first-form" ? "First welcome" : "Second welcome",
        }),
        event: {
          id: eventId,
          name: "Pacific Open Data Summit 2026",
          startsOn: "2026-10-07",
          endsOn: "2026-10-08",
          timezone: "America/Los_Angeles",
        },
      };
    });

    render(<Harness />);
    const table = await screen.findByRole("table", { name: "Forms" });
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("First form");
    });

    await user.click(within(table).getByRole("link", { name: "Second form" }).closest("tr")!);

    expect(await screen.findByTestId("forms-preview-loading")).toBeVisible();
    expect(screen.queryByTestId("forms-preview-name")).toBeNull();
    expect(screen.queryByText("First welcome")).toBeNull();

    releaseSecond();
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Second form");
    });
    expect(screen.getByTestId("forms-preview-welcome")).toHaveTextContent("Second welcome");
  });

  it("keeps the invalid-draft empty state scoped to the selected form", async () => {
    const user = userEvent.setup();
    const pair: OrganizerCfpFormSummary[] = [
      {
        id: "valid-form",
        name: "Valid form",
        lifecycleStatus: "published",
        draftUpdatedAt: "2026-08-01T00:00:00.000Z",
        publishedVersion: 1,
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "broken-form",
        name: "Broken draft",
        lifecycleStatus: "draft",
        draftUpdatedAt: "2026-08-11T00:00:00.000Z",
        publishedVersion: null,
        publishedAt: null,
      },
    ];

    renderForms(pair, (summary) =>
      organizerForm(summary, {
        welcomeTitle: summary.id === "valid-form" ? "Valid welcome" : "Broken welcome",
        invalid: summary.id === "broken-form",
      }),
    );

    const table = await screen.findByRole("table", { name: "Forms" });
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Broken draft");
    });
    // name-asc sorts Broken before Valid
    expect(screen.getByTestId("forms-preview-invalid")).toBeVisible();

    await user.click(within(table).getByRole("link", { name: "Valid form" }).closest("tr")!);
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Valid form");
    });
    expect(screen.queryByTestId("forms-preview-invalid")).toBeNull();
    expect(screen.getByTestId("forms-preview-welcome")).toHaveTextContent("Valid welcome");

    await user.click(within(table).getByRole("link", { name: "Broken draft" }).closest("tr")!);
    await waitFor(() => {
      expect(screen.getByTestId("forms-preview-invalid")).toBeVisible();
    });
    expect(screen.getByTestId("forms-preview-name")).toHaveTextContent("Broken draft");
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
