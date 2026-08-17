import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import {
  AgendaPage,
  App,
  CfpBuilderPage,
  EmbedsPage,
  FormsPage,
  MessagesPage,
  OverviewPage,
  SettingsPage,
  SpeakersPage,
  SubmissionsPage,
} from "./App";
import { CourseCheckPage } from "./CourseCheckPage";
import { ProposalDetailPage } from "./ProposalDetailPage";
import {
  PublicAgendaPage,
  PublicItineraryPage,
  PublicManagedEmbedPage,
  PublicProgramEmbedPage,
  PublicProgramPage,
  PublicSessionsPage,
  PublicSpeakerGalleryPage,
  PublicSpeakersPage,
} from "./PublicProgramPage";
import { SpeakerPortalPage } from "./SpeakerPortalPage";
import { SubmitterEditPage } from "./SubmitterEditPage";
import { SubmitterDashboardPage } from "./SubmitterDashboardPage";
import { ReviewerInvitationPage } from "./ReviewerInvitationPage";
import { DemoPersonasPage } from "./DemoPersonasPage";
import { AgendaEmbedFixture } from "./AgendaEmbedFixture";
import { SpeakersListFixturePage } from "./SpeakersListFixturePage";
import { SessionsEmbedFixturePage } from "./SessionsEmbedFixturePage";
import { ItineraryEmbedFixture } from "./ItineraryEmbedFixture";

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

const agendaEmbedFixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fixtures/agenda-embed",
  component: AgendaEmbedFixture,
});

const speakersListFixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fixtures/embeds/speakers-list",
  component: SpeakersListFixturePage,
});

const sessionsEmbedFixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/demo/embeds/sessions-list",
  component: SessionsEmbedFixturePage,
});

const itineraryEmbedFixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fixtures/itinerary-embed",
  component: ItineraryEmbedFixture,
});

const cfpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/cfp",
  validateSearch: (search: Record<string, unknown>): {
    formId?: string;
    draftId?: string;
  } => ({
    formId: typeof search.formId === "string" ? search.formId : undefined,
    draftId: typeof search.draftId === "string" ? search.draftId : undefined,
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

const submitterDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/my-proposals",
  component: SubmitterDashboardPage,
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

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId",
  component: OverviewPage,
});

const formsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/forms",
  component: FormsPage,
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { day?: string; session?: string; sessionIds?: string; returnTo?: string } => ({
    day: typeof search.day === "string" ? search.day : undefined,
    session: typeof search.session === "string" ? search.session : undefined,
    sessionIds: typeof search.sessionIds === "string" ? search.sessionIds : undefined,
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
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

const speakersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/speakers",
  component: SpeakersPage,
});

const embedsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/embeds",
  component: EmbedsPage,
});


const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/settings",
  component: SettingsPage,
});

const publicManagedEmbedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/embed/$embedId",
  component: PublicManagedEmbedPage,
});


function validateProgramSearch(search: Record<string, unknown>) {
  return {
    revision: typeof search.revision === "string" ? search.revision : undefined,
    query: typeof search.query === "string" ? search.query : undefined,
    day: typeof search.day === "string" ? search.day : undefined,
    trackId: typeof search.trackId === "string" ? search.trackId : undefined,
    roomId: typeof search.roomId === "string" ? search.roomId : undefined,
    format: typeof search.format === "string" ? search.format : undefined,
    speakerId: typeof search.speakerId === "string" ? search.speakerId : undefined,
    role: typeof search.role === "string" ? search.role : undefined,
    speaker: typeof search.speaker === "string" ? search.speaker : undefined,
    session: typeof search.session === "string" ? search.session : undefined,
    itinerary: typeof search.itinerary === "string" ? search.itinerary : undefined,
    widget: typeof search.widget === "string" ? search.widget : undefined,
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
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

const programSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/sessions",
  component: PublicSessionsPage,
  validateSearch: validateProgramSearch,
});

const programSpeakersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/speakers",
  component: PublicSpeakersPage,
  validateSearch: validateProgramSearch,
});

const programAgendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/agenda",
  component: PublicAgendaPage,
  validateSearch: validateProgramSearch,
});

const programItineraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/itinerary",
  component: PublicItineraryPage,
  validateSearch: validateProgramSearch,
});

const programSpeakerGalleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e/$eventId/program/speaker-gallery",
  component: PublicSpeakerGalleryPage,
  validateSearch: validateProgramSearch,
});


function validateProposalQueueSearch(search: Record<string, unknown>): {
  q?: string;
  status?: string;
  track?: string;
  roundId?: string;
  sort?: string;
  field?: string;
  returnTo?: string;
  stage?: string;
} {
  return {
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    track: typeof search.track === "string" ? search.track : undefined,
    roundId: typeof search.roundId === "string" ? search.roundId : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    field: typeof search.field === "string" ? search.field : undefined,
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
    stage: typeof search.stage === "string" ? search.stage : undefined,
  };
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  demoPersonasRoute,
  agendaEmbedFixtureRoute,
  speakersListFixtureRoute,
  sessionsEmbedFixtureRoute,
  itineraryEmbedFixtureRoute,
  cfpRoute,
  proposalDetailRoute,
  submitterEditRoute,
  submitterDashboardRoute,
  speakerPortalRoute,
  reviewerInvitationRoute,
  overviewRoute,
  formsRoute,
  formBuilderRoute,
  submissionsRoute,
  submissionDetailRoute,
  courseCheckRoute,
  agendaRoute,
  messagesRoute,
  speakersRoute,
  settingsRoute,
  publicManagedEmbedRoute,
  embedsRoute,
  programRoute,
  programEmbedRoute,
  programSessionsRoute,
  programSpeakersRoute,
  programAgendaRoute,
  programItineraryRoute,
  programSpeakerGalleryRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
