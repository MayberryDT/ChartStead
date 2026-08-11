import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { App, SubmissionsPage } from "./App";
import { ProposalDetailPage } from "./ProposalDetailPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const cfpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/cfp",
}).lazy(() => import("./cfp.lazy").then((module) => module.Route));

const proposalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/proposals/$proposalId",
  component: ProposalDetailPage,
});

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/submissions",
  component: SubmissionsPage,
});

const submissionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/submissions/$proposalId",
  component: SubmissionsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  cfpRoute,
  proposalDetailRoute,
  submissionsRoute,
  submissionDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
