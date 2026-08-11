import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { App, SubmissionsPage } from "./App";
import { CfpBuilderPage, CfpFormsPage } from "./CfpBuilderPage";
import { ProposalDetailPage } from "./ProposalDetailPage";
import { SubmitterEditPage } from "./SubmitterEditPage";

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
  validateSearch: (search: Record<string, unknown>): { formId?: string } => ({
    formId: typeof search.formId === "string" ? search.formId : undefined,
  }),
}).lazy(() => import("./cfp.lazy").then((module) => module.Route));

const proposalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/proposals/$proposalId",
  component: ProposalDetailPage,
});

const submitterEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/edit/$token",
  component: SubmitterEditPage,
});

const formsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/forms",
  component: CfpFormsPage,
});

const formBuilderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/forms/$formId",
  component: CfpBuilderPage,
});

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/submissions",
  component: SubmissionsPage,
  validateSearch: validateProposalQueueSearch,
});

const submissionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/submissions/$proposalId",
  component: SubmissionsPage,
  validateSearch: validateProposalQueueSearch,
});

function validateProposalQueueSearch(search: Record<string, unknown>) {
  return {
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    track: typeof search.track === "string" ? search.track : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
  };
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  cfpRoute,
  proposalDetailRoute,
  submitterEditRoute,
  formsRoute,
  formBuilderRoute,
  submissionsRoute,
  submissionDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
