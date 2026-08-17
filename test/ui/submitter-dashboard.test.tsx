import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const magicLink = vi.hoisted(() => vi.fn());
const social = vi.hoisted(() => vi.fn());
const useSession = vi.hoisted(() => vi.fn());

vi.mock("../../src/auth-client", () => ({
  authClient: {
    signIn: { magicLink, social },
    useSession,
  },
}));

import { SubmitterDashboardPage } from "../../src/SubmitterDashboardPage";

const eventId = "pacific-open-data-summit-2026";

function renderAtDashboard() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/my-proposals",
    component: SubmitterDashboardPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboardRoute]),
    history: createMemoryHistory({ initialEntries: [`/e/${eventId}/my-proposals`] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("submitter dashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers account creation to a logged-out submitter", async () => {
    useSession.mockReturnValue({ data: null });
    magicLink.mockResolvedValue({ data: {}, error: null });

    renderAtDashboard();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "Email address" }),
      "speaker@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Email account link" }));

    expect(magicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "speaker@example.com",
        name: "CFP submitter",
        callbackURL: "/",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
  });

  it("lists only event-scoped submitter proposals and claims matching legacy work", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "submitter-alice", email: "alice@example.com" } },
    });
    let claimed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/claim") && init?.method === "POST") {
        claimed = true;
        return new Response(
          JSON.stringify({
            proposal: { id: "SUB-LEGACY", claimed: true, claimable: false },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          user: { id: "submitter-alice", name: "Alice", email: "alice@example.com" },
          drafts: [
            {
              id: "DRF-1234",
              eventId,
              title: "Resume me later",
              formId: "main-cfp",
              formName: "Main CFP",
              formDefinitionVersion: 1,
              latestFormDefinitionVersion: 1,
              formVersionStale: false,
              lifecycle: {
                state: "open",
                reason: "open",
                opensAt: null,
                closesAt: null,
                deadlineAt: null,
                timezone: "UTC",
                evaluatedAt: "2026-08-12T00:00:00.000Z",
              },
              createdAt: "2026-08-12T00:00:00.000Z",
              updatedAt: "2026-08-12T00:00:00.000Z",
            },
          ],
          proposals: [
            {
              id: "SUB-LEGACY",
              eventId,
              title: "Legacy proposal",
              trackId: "platform",
              trackName: "Platform",
              speakerName: "Alice",
              submittedAt: "2026-08-12T00:00:00.000Z",
              status: "under_review",
              claimed,
              claimable: !claimed,
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    renderAtDashboard();
    const user = userEvent.setup();
    expect(await screen.findByText("Legacy proposal")).toBeVisible();
    expect(screen.getByText("Resume me later")).toBeVisible();
    expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute(
      "href",
      `/e/${eventId}/cfp?draftId=DRF-1234`,
    );
    expect(screen.getByText("Under review")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Claim proposal" }));

    expect(await screen.findByText("Legacy proposal")).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/events/${eventId}/submitter/proposals/SUB-LEGACY/claim`,
      { method: "POST" },
    );
    expect(screen.queryByRole("button", { name: "Claim proposal" })).not.toBeInTheDocument();
  });
});
