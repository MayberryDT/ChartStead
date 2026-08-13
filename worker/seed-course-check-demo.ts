import type { CoSpeakerInput, OrganizerProposal } from "../shared/events";

/** Pacific Open Data Summit proposals reserved for the Course Check killer demo. */
export const COURSE_CHECK_DEMO_EVENT_ID = "pacific-open-data-summit-2026";

export const COURSE_CHECK_DEMO_TRACK = {
  id: "course-check-demo",
  name: "Course Check Demo",
  proposalCount: 10,
} as const;

/**
 * Stable seed IDs (SUB-PODS0048…0057) after the 47 generic PODS proposals.
 * Keep these IDs out of other suites so the killer walkthrough stays reliable.
 */
export const COURSE_CHECK_DEMO = {
  acceptCoSpeakers: "SUB-PODS0048",
  decline: "SUB-PODS0049",
  missingAddress: "SUB-PODS0050",
  identityReuse: "SUB-PODS0051",
  priorCommunication: "SUB-PODS0052",
  conflictA: "SUB-PODS0053",
  conflictB: "SUB-PODS0054",
  unplaced: "SUB-PODS0055",
  publication: "SUB-PODS0056",
  deliveryOutcomes: "SUB-PODS0057",
} as const;

export type CourseCheckDemoKey = keyof typeof COURSE_CHECK_DEMO;

const DEMO_SPEAKER = {
  identityReuseEmail: "riley.nguyen@example.test",
  identityReuseName: "Riley Nguyen",
  priorEmail: "sam.okonkwo@example.test",
} as const;

type DemoSpec = {
  id: string;
  title: string;
  speakerName: string;
  speakerEmail: string;
  biography: string;
  coSpeakers: CoSpeakerInput[];
  abstract: string;
  status: OrganizerProposal["status"];
};

const DEMO_SPECS: DemoSpec[] = [
  {
    id: COURSE_CHECK_DEMO.acceptCoSpeakers,
    title: "Harbor data trusts with co-facilitators",
    speakerName: "Maya Chen",
    speakerEmail: "maya.chen@example.test",
    biography: "Maya leads civic data trusts across Pacific ports.",
    coSpeakers: [
      {
        name: "Jordan Blake",
        email: "jordan.blake@example.test",
        biography: "Jordan facilitates multi-agency workshops.",
      },
      {
        name: "Casey Ortiz",
        email: "casey.ortiz@example.test",
        biography: "Casey documents community consent practices.",
      },
    ],
    abstract:
      "A hands-on session on standing up harbor data trusts with two co-facilitators.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.decline,
    title: "Declined: speculative satellite-only coverage",
    speakerName: "Alex Rivera",
    speakerEmail: "alex.rivera@example.test",
    biography: "Alex pitches remote-sensing products.",
    coSpeakers: [],
    abstract: "Out of scope for the open data program this year.",
    status: "deny",
  },
  {
    id: COURSE_CHECK_DEMO.missingAddress,
    title: "Coastal sensors without a contact email",
    speakerName: "No Email Primary",
    speakerEmail: "",
    biography: "Primary contact still finishing registration.",
    coSpeakers: [
      {
        name: "Missing Address Co",
        email: "",
        biography: "Co-speaker also missing an address.",
      },
    ],
    abstract: "Sensor network story reserved to exercise missing-address findings.",
    status: "maybe",
  },
  {
    id: COURSE_CHECK_DEMO.identityReuse,
    title: "Reuse an existing speaker identity",
    speakerName: DEMO_SPEAKER.identityReuseName,
    speakerEmail: DEMO_SPEAKER.identityReuseEmail,
    biography: "Same person already appears in the speaker directory.",
    coSpeakers: [],
    abstract: "Acceptance should reuse the existing speaker row, not invent a duplicate.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.priorCommunication,
    title: "Follow-up after an earlier notice",
    speakerName: "Sam Okonkwo",
    speakerEmail: DEMO_SPEAKER.priorEmail,
    biography: "Sam already received a confirmation notice.",
    coSpeakers: [],
    abstract: "Communication Course Check should surface the prior related send.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.conflictA,
    title: "Morning slot: charting open registries",
    speakerName: "Priya Nair",
    speakerEmail: "priya.nair@example.test",
    biography: "Priya designs registry UX.",
    coSpeakers: [],
    abstract: "Place against conflict B in Harbor Hall to show a private schedule conflict.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.conflictB,
    title: "Morning slot: harbor hall double-book",
    speakerName: "Luis Romero",
    speakerEmail: "luis.romero@example.test",
    biography: "Luis runs logistics for municipal open data.",
    coSpeakers: [],
    abstract: "Overlaps conflict A when both are placed in Harbor Hall.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.unplaced,
    title: "Unplaced lightning: shoreline APIs",
    speakerName: "Nina Patel",
    speakerEmail: "nina.patel@example.test",
    biography: "Nina maintains shoreline API docs.",
    coSpeakers: [],
    abstract: "Stay unplaced so publication valid-subset excludes it by default.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.publication,
    title: "Publishable keynote: shared coastal maps",
    speakerName: "Elena Vos",
    speakerEmail: "elena.vos@example.test",
    biography: "Elena publishes coastal basemaps.",
    coSpeakers: [],
    abstract: "Fully placeable session for Program Publication Course Check.",
    status: "approve",
  },
  {
    id: COURSE_CHECK_DEMO.deliveryOutcomes,
    title: "Delivery matrix: success, retry, unknown",
    speakerName: "Theo Park",
    speakerEmail: "theo.park@example.test",
    biography: "Theo coordinates multi-address delivery drills.",
    coSpeakers: [
      {
        name: "Transient Recipient",
        email: "cc10-transient@example.test",
        biography: "Simulated transient provider failure.",
      },
      {
        name: "Unknown Recipient",
        email: "cc10-unknown@example.test",
        biography: "Simulated unknown provider outcome.",
      },
    ],
    abstract: "Use mock providers to prove per-address recovery without duplicate delivery.",
    status: "approve",
  },
];

export function buildCourseCheckDemoProposals(
  eventId: string,
): OrganizerProposal[] {
  if (eventId !== COURSE_CHECK_DEMO_EVENT_ID) return [];
  return DEMO_SPECS.map((spec, index) => {
    const answers: OrganizerProposal["answers"] = {
      title: spec.title,
      abstract: spec.abstract,
      trackId: COURSE_CHECK_DEMO_TRACK.id,
      sessionFormat: "talk",
      speakers: [
        {
          name: spec.speakerName,
          email: spec.speakerEmail,
          biography: spec.biography,
        },
        ...spec.coSpeakers.map((co) => ({
          name: co.name,
          email: co.email,
          biography: co.biography,
        })),
      ] as unknown as OrganizerProposal["answers"]["speakers"],
      supportingLink: "",
    };
    return {
      id: spec.id,
      eventId,
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers,
      title: spec.title,
      abstract: spec.abstract,
      trackId: COURSE_CHECK_DEMO_TRACK.id,
      trackName: COURSE_CHECK_DEMO_TRACK.name,
      speakerName: spec.speakerName,
      speakerEmail: spec.speakerEmail,
      biography: spec.biography,
      supportingLink: "",
      sessionFormat: "talk",
      workshopDuration: "",
      coSpeakers: spec.coSpeakers,
      supportingFile: null,
      status: spec.status,
      programOutcome: null,
      committeeNote: "",
      privateNote: `Course Check demo fixture ${index + 1}`,
      reviewVersion: 0,
      submittedAt: `2026-08-${String((index % 10) + 1).padStart(2, "0")}T15:00:00.000Z`,
      confirmationEmailStatus: null,
      scorecardAggregate: null,
      reviewerRecusal: null,
      reviewerRecusals: [],
    } satisfies OrganizerProposal;
  });
}

export const COURSE_CHECK_DEMO_IDENTITY = {
  name: DEMO_SPEAKER.identityReuseName,
  email: DEMO_SPEAKER.identityReuseEmail,
  biography: "Existing directory speaker for identity-reuse demo.",
} as const;

export const COURSE_CHECK_DEMO_PRIOR_OUTBOX = {
  proposalId: COURSE_CHECK_DEMO.priorCommunication,
  toEmail: DEMO_SPEAKER.priorEmail,
  subject: "Earlier decision notice for Sam Okonkwo",
  textBody: "You already received this confirmation from program ops.",
  htmlBody: "<p>You already received this confirmation from program ops.</p>",
} as const;
