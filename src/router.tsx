import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { AgendaPage, App, MessagesPage, SubmissionsPage } from "./App";
import { CfpBuilderPage, CfpFormsPage } from "./CfpBuilderPage";
import { CourseCheckPage } from "./CourseCheckPage";
import { ProposalDetailPage } from "./ProposalDetailPage";
import {
  PublicProgramEmbedPage,
  PublicProgramPage,
} from "./PublicProgramPage";
import { SpeakerPortalPage } from "./SpeakerPortalPage";
import { SubmitterEditPage } from "./SubmitterEditPage";
import { ReviewerInvitationPage } from "./ReviewerInvitationPage";
import { DemoPersonasPage } from "./DemoPersonasPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const demoPersonasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/demo",
  component: DemoPersonasPage,
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

const speakerPortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/portal/$token",
  component: SpeakerPortalPage,
});

const reviewerInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/reviewer-invitations/$token",
  component: ReviewerInvitationPage,
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

const courseCheckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/course-checks/$planId",
  component: CourseCheckPage,
  validateSearch: validateProposalQueueSearch,
});

const agendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/agenda",
  component: AgendaPage,
  validateSearch: (search: Record<string, unknown>): { sessionIds?: string } => ({
    sessionIds: typeof search.sessionIds === "string" ? search.sessionIds : undefined,
  }),
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/messages",
  component: MessagesPage,
  validateSearch: (search: Record<string, unknown>): { planId?: string } => ({
    planId: typeof search.planId === "string" ? search.planId : undefined,
  }),
});

function validateProgramSearch(search: Record<string, unknown>) {
  return {
    revision: typeof search.revision === "string" ? search.revision : undefined,
  };
}

const programRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program",
  component: PublicProgramPage,
  validateSearch: validateProgramSearch,
});

const programEmbedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/embed",
  component: PublicProgramEmbedPage,
  validateSearch: validateProgramSearch,
});

function validateProposalQueueSearch(search: Record<string, unknown>): {
  q?: string;
  status?: string;
  track?: string;
  sort?: string;
  field?: string;
  returnTo?: string;
  stage?: string;
} {
  return {
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    track: typeof search.track === "string" ? search.track : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    field: typeof search.field === "string" ? search.field : undefined,
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
    stage: typeof search.stage === "string" ? search.stage : undefined,
  };
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  demoPersonasRoute,
  cfpRoute,
  proposalDetailRoute,
  submitterEditRoute,
  speakerPortalRoute,
  reviewerInvitationRoute,
  formsRoute,
  formBuilderRoute,
  submissionsRoute,
  submissionDetailRoute,
  courseCheckRoute,
  agendaRoute,
  messagesRoute,
  programRoute,
  programEmbedRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
