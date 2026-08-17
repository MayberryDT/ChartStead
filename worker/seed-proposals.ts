import type { EventRecord, OrganizerProposal, ProposalStatus } from "../shared/events";
import { DEMO_EVENT_ID } from "../shared/demo-event";
import {
  buildCourseCheckDemoProposals,
  COURSE_CHECK_DEMO_TRACK,
} from "./seed-course-check-demo";
import { createWorldsFairSeedProposals } from "./seed-worlds-fair";

const EVENT_PREFIXES: Record<string, string> = {
  "pacific-open-data-summit-2026": "PODS",
  "ai-engineer-worlds-fair-2026": "AEWF",
  "civic-tech-summit-2026": "CTS",
};

const DECIDED_STATUSES: ProposalStatus[] = ["approve", "maybe", "deny"];

export function createSeedProposals(event: EventRecord): OrganizerProposal[] {
  if (event.id === DEMO_EVENT_ID) {
    return createWorldsFairSeedProposals(event);
  }
  const prefix = EVENT_PREFIXES[event.id] ?? "DEMO";
  let proposalIndex = 0;

  const generic = event.tracks
    .filter((track) => track.id !== COURSE_CHECK_DEMO_TRACK.id)
    .flatMap((track) =>
      Array.from({ length: track.proposalCount }, (_, trackIndex) => {
        proposalIndex += 1;
        const sequence = String(proposalIndex).padStart(4, "0");
        const status =
          proposalIndex <= event.unreviewedCount
            ? "unreviewed"
            : DECIDED_STATUSES[
                (proposalIndex - event.unreviewedCount - 1) %
                  DECIDED_STATUSES.length
              ];

        const title = `${track.name}: practical field notes ${trackIndex + 1}`;
        const abstract = `A seeded ${track.name} proposal for the event operations demonstration.`;
        const speakerName = `Demo Speaker ${sequence}`;
        const speakerEmail = `speaker-${prefix.toLowerCase()}-${sequence}@example.test`;
        const biography = `Demo Speaker ${sequence} works on ${track.name.toLowerCase()} programs.`;
        return {
          id: `SUB-${prefix}${sequence}`,
          eventId: event.id,
          formId: "main-cfp",
          formDefinitionVersion: 1,
          answers: {
            title,
            abstract,
            trackId: track.id,
            sessionFormat: "talk",
            speakers: [{ name: speakerName, email: speakerEmail, biography }],
            supportingLink: "",
          },
          title,
          abstract,
          trackId: track.id,
          trackName: track.name,
          speakerName,
          speakerEmail,
          biography,
          supportingLink: "",
          sessionFormat: "talk",
          workshopDuration: "",
          coSpeakers: [],
          supportingFile: null,
          status,
          programOutcome: null,
          committeeNote: "",
          privateNote: "",
          reviewVersion: 0,
          submittedAt: `2026-07-${String((proposalIndex % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
          confirmationEmailStatus: null,
          scorecardAggregate: null,
          reviewerRecusal: null,
          reviewerRecusals: [],
        } satisfies OrganizerProposal;
      }),
    );

  return [...generic, ...buildCourseCheckDemoProposals(event.id)];
}
