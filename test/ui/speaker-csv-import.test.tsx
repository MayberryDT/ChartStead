import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OnboardingBoard } from "../../shared/events";
import { OnboardingWorkspace } from "../../src/OnboardingWorkspace";

const eventId = "pacific-open-data-summit-2026";
const board: OnboardingBoard = { eventId, speakers: [], drafts: [] };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWorkspace eventId={eventId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ticket 25 speaker CSV import UI", () => {
  it("maps common columns and previews every row before offering apply", async () => {
    const user = userEvent.setup();
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        requests.push({ url, method, body });
        if (url.endsWith(`/api/events/${eventId}/onboarding`)) {
          return Response.json(board);
        }
        if (url.endsWith(`/api/events/${eventId}/speaker-imports/preview`)) {
          return Response.json({
            digest: "a".repeat(64),
            headers: ["Full Name", "Email Address", "Bio", "Job Title", "Company"],
            mapping: body.mapping,
            totals: { create: 1, reuse: 0, update: 1, skip: 0, invalid: 1 },
            rows: [
              {
                rowNumber: 2,
                values: {
                  name: "New CSV Person",
                  email: "new.csv@example.test",
                  biography: "Bio",
                  titleSnapshot: "Engineer",
                  organizationSnapshot: "New Org",
                  role: "invited",
                },
                outcome: "create",
                feedback: ["A new speaker identity and event participation will be created."],
                matches: [],
                selectedSpeakerId: null,
              },
              {
                rowNumber: 3,
                values: {
                  name: "Existing CSV Person",
                  email: "existing.csv@example.test",
                  biography: "Updated bio",
                  titleSnapshot: "Director",
                  organizationSnapshot: "Existing Org",
                  role: "invited",
                },
                outcome: "update",
                feedback: ["Current name or biography differs; approve an update explicitly."],
                matches: [
                  {
                    speakerId: "sp-existing",
                    name: "Existing CSV Person",
                    email: "existing.csv@example.test",
                    signal: "email",
                  },
                ],
                selectedSpeakerId: "sp-existing",
              },
              {
                rowNumber: 4,
                values: {
                  name: "Invalid CSV Person",
                  email: "",
                  biography: "Bio",
                  titleSnapshot: "Designer",
                  organizationSnapshot: "Invalid Org",
                  role: "invited",
                },
                outcome: "invalid",
                feedback: ["Email is required."],
                matches: [],
                selectedSpeakerId: null,
              },
            ],
          });
        }
        if (url.endsWith(`/api/events/${eventId}/speaker-imports/apply`)) {
          return Response.json(
            {
              id: "imp-ui",
              idempotencyKey: body.idempotencyKey,
              previewDigest: body.previewDigest,
              appliedAt: "2026-08-12T12:00:00.000Z",
              actorId: "admin",
              actorName: "Admin",
              totals: { created: 1, reused: 0, updated: 1, skipped: 1, invalid: 1 },
              rows: [
                { rowNumber: 2, outcome: "created", speakerId: "sp-new" },
                { rowNumber: 3, outcome: "updated", speakerId: "sp-existing" },
                { rowNumber: 4, outcome: "skipped", speakerId: null },
              ],
            },
            { status: 201 },
          );
        }
        return Response.json({ error: `Unhandled ${method} ${url}` }, { status: 500 });
      }),
    );
    renderDirectory();

    await user.click(await screen.findByRole("button", { name: /import csv/i }));
    const file = new File(
      [
        "Full Name,Email Address,Bio,Job Title,Company\n",
        "New CSV Person,new.csv@example.test,Bio,Engineer,New Org",
      ],
      "speakers.csv",
      { type: "text/csv" },
    );
    await user.upload(screen.getByLabelText(/csv file/i), file);

    expect(await screen.findByRole("combobox", { name: /^name column$/i })).toHaveValue(
      "Full Name",
    );
    expect(screen.getByRole("combobox", { name: /^email column$/i })).toHaveValue(
      "Email Address",
    );
    expect(screen.getByRole("combobox", { name: /^biography column$/i })).toHaveValue(
      "Bio",
    );
    expect(screen.getByRole("combobox", { name: /^title column$/i })).toHaveValue(
      "Job Title",
    );
    expect(screen.getByRole("combobox", { name: /^organization column$/i })).toHaveValue(
      "Company",
    );
    expect(
      requests.filter((request) => request.url.endsWith("/speaker-imports/apply")),
    ).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /preview 1 row/i }));
    expect(await screen.findByText("1 create · 1 update · 1 invalid")).toBeVisible();
    const previewTable = screen.getByRole("table", { name: /speaker import preview/i });
    expect(within(previewTable).getByText("New CSV Person")).toBeVisible();
    expect(within(previewTable).getByText("Existing CSV Person")).toBeVisible();
    expect(within(previewTable).getByText("Email is required.")).toBeVisible();
    expect(within(previewTable).getByLabelText(/action for csv row 2/i)).toHaveValue(
      "create",
    );
    expect(within(previewTable).getByLabelText(/action for csv row 3/i)).toHaveValue(
      "update:sp-existing",
    );
    expect(within(previewTable).getByLabelText(/action for csv row 4/i)).toHaveValue(
      "skip",
    );

    await user.click(screen.getByRole("button", { name: /apply 2 changes/i }));
    await waitFor(() => {
      const apply = requests.find((request) =>
        request.url.endsWith("/speaker-imports/apply"),
      );
      expect(apply?.body).toMatchObject({
        previewDigest: "a".repeat(64),
        resolutions: {
          "2": { action: "create" },
          "3": { action: "update", speakerId: "sp-existing" },
          "4": { action: "skip" },
        },
      });
    });
    expect(
      await screen.findByText("1 created · 1 updated · 1 skipped · 1 invalid"),
    ).toBeVisible();
    expect(screen.getByText(/Import receipt imp-ui/i)).toBeVisible();
  });
});
