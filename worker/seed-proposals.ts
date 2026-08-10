import type { EventRecord, OrganizerProposal, ProposalStatus } from "../shared/events";

const EVENT_PREFIXES: Record<string, string> = {
  "pacific-open-data-summit-2026": "PODS",
  "ai-engineer-worlds-fair-2026": "AEWF",
};

const DECIDED_STATUSES: ProposalStatus[] = ["approve", "maybe", "deny"];

export function createSeedProposals(event: EventRecord): OrganizerProposal[] {
  const prefix = EVENT_PREFIXES[event.id] ?? "DEMO";
  let proposalIndex = 0;

  return event.tracks.flatMap((track) =>
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

      return {
        id: `SUB-${prefix}${sequence}`,
        eventId: event.id,
        formId: "main-cfp",
        formDefinitionVersion: 1,
        title: `${track.name}: practical field notes ${trackIndex + 1}`,
        abstract: `A seeded ${track.name} proposal for the event operations demonstration.`,
        trackId: track.id,
        trackName: track.name,
        speakerName: `Demo Speaker ${sequence}`,
        speakerEmail: `speaker-${prefix.toLowerCase()}-${sequence}@example.test`,
        biography: `Demo Speaker ${sequence} works on ${track.name.toLowerCase()} programs.`,
        supportingLink: "",
        status,
        committeeNote: "",
        privateNote: "",
        submittedAt: `2026-07-${String((proposalIndex % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      } satisfies OrganizerProposal;
    }),
  );
}
