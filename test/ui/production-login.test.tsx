import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { AuthMethodButtons, humanizeAuthError, SignIn } from "../../src/SignIn";

const signInSocial = vi.fn();
const signInMagicLink = vi.fn();
const signOut = vi.fn();

vi.mock("../../src/auth-client", () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) => signInSocial(...args),
      magicLink: (...args: unknown[]) => signInMagicLink(...args),
    },
    signOut: (...args: unknown[]) => signOut(...args),
  },
}));

function renderApp(path = "/") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: App,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
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

describe("production login UI", () => {
  beforeEach(() => {
    signInSocial.mockReset();
    signInMagicLink.mockReset();
    signOut.mockReset();
    signInSocial.mockResolvedValue({ error: null });
    signInMagicLink.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({});
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows Google and magic-link sign-in when the organizer API requires authentication", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth-status")) {
        return new Response(
          JSON.stringify({ configured: true, google: true, magicLink: true }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });

    renderApp("/");

    expect(
      await screen.findByRole("heading", {
        name: "Conference programming and speaker management.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Work email" })).toBeVisible();
  });

  it("shows a truthful no-access state instead of a 401 dump or demo bypass", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/events")) {
        return new Response(
          JSON.stringify({
            events: [],
            principal: {
              id: "pat",
              displayName: "Pat Example",
              role: "reviewer",
              eventIds: [],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });

    renderApp("/");

    expect(
      await screen.findByRole("heading", { name: "This account has no event access." }),
    ).toBeVisible();
    expect(screen.getByText(/Pat Example is signed in/)).toBeVisible();
    expect(screen.queryByText(/Unauthorized/)).toBeNull();
    expect(screen.queryByText(/demo-admin/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /conference programming/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("recovers from cancelled Google sign-in and missing email configuration", async () => {
    window.history.replaceState({}, "", "/?error=access_denied");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ configured: true, google: true, magicLink: false }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    render(<SignIn />);

    expect(
      await screen.findByText(
        "Google sign-in was cancelled. You can try again or use an email link.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Email sign-in is not configured for this environment."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Email sign-in link" })).toHaveAttribute("aria-disabled", "true");
  });

  it("surfaces a failed Google attempt without leaving the sign-in page", async () => {
    const user = userEvent.setup();
    signInSocial.mockResolvedValue({
      error: { message: "Google provider rejected the request" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ configured: true, google: true, magicLink: true }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    render(<SignIn />);
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(
      await screen.findByText("Google sign-in failed. Try again or use an email link."),
    ).toBeVisible();
  });

  it("signs out from the no-access state", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/events")) {
        return new Response(
          JSON.stringify({
            events: [],
            principal: {
              id: "pat",
              displayName: "Pat Example",
              role: "reviewer",
              eventIds: [],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });

    renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("humanizes expired-session and missing-email errors", () => {
    expect(humanizeAuthError("session expired")).toMatch(/session expired/i);
    expect(humanizeAuthError("Magic-link email is not configured for this environment.")).toMatch(
      /not configured/i,
    );
  });

  it("uses the same Google and email controls on CFP and reviewer surfaces", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ configured: true, google: true, magicLink: true }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <AuthMethodButtons
        callbackURL="/e/pacific-open-data-summit-2026/cfp"
        name="CFP submitter"
        emailInputId="cfp-account-email"
        emailLabel="Email address"
        emailButtonLabel="Email account link"
      />,
    );

    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Email account link" })).toBeVisible();
  });
});
