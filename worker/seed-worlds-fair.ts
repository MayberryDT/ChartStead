import type {
  EventRecord,
  OrganizerProposal,
  ProposalStatus,
  PublicEmbedConfigInput,
  PublicEmbedWidget,
} from "../shared/events";
import { DEFAULT_PUBLIC_EMBED_FIELDS } from "../shared/public-program";
import {
  DEMO_EMBEDS,
  DEMO_EVENT_ENDS_ON,
  DEMO_EVENT_ID,
  DEMO_EVENT_NAME,
  DEMO_EVENT_STARTS_ON,
  DEMO_EVENT_THEME_ACCENT,
  DEMO_EVENT_TIMEZONE,
  DEMO_SAMPLE,
  DEMO_SPEAKER,
  DEMO_TASK_DUE_MONTH,
} from "../shared/demo-event";
import {
  DEMO_HEADSHOT_COUNT,
  demoHeadshotJpeg,
  demoHeadshotObjectKey,
} from "./demo-headshot-bytes";

export const WORLDS_FAIR_DAYS = [
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
] as const;

export const WORLDS_FAIR_TRACKS = [
  { id: "agents", name: "Agents", proposalCount: 16 },
  { id: "models", name: "Models", proposalCount: 14 },
  { id: "infrastructure", name: "Infrastructure", proposalCount: 14 },
  { id: "product", name: "Product", proposalCount: 12 },
  { id: "evaluation", name: "Evaluation", proposalCount: 12 },
  { id: "dx", name: "Developer Experience", proposalCount: 12 },
  { id: "safety", name: "Safety", proposalCount: 10 },
  { id: "workshops", name: "Workshops", proposalCount: 10 },
] as const;

export const WORLDS_FAIR_ROOMS = [
  { id: "keynote-hall", name: "Keynote Hall", readiness: "ready" as const },
  { id: "hall-a", name: "Hall A", readiness: "ready" as const },
  { id: "hall-b", name: "Hall B", readiness: "ready" as const },
  { id: "hall-c", name: "Hall C", readiness: "ready" as const },
  { id: "expo-stage", name: "Expo Stage", readiness: "ready" as const },
  { id: "workshop-1", name: "Workshop 1", readiness: "ready" as const },
  { id: "workshop-2", name: "Workshop 2", readiness: "ready" as const },
  { id: "community-lounge", name: "Community Lounge", readiness: "ready" as const },
  { id: "meetup-room", name: "Meetup Room", readiness: "ready" as const },
  { id: "press-room", name: "Press Room", readiness: "pending" as const },
] as const;

const FIRST_NAMES = [
  "Nora", "Priya", "Malik", "Elena", "Jonah", "Sable", "Theo", "Amara", "Quentin", "Imani",
  "Leo", "Farah", "Hugo", "Keiko", "Omar", "Tess", "Rafael", "Yuna", "Colin", "Nadia",
  "Ellis", "Mei", "Victor", "Anika", "Brooks", "Lila", "Dominic", "Hana", "Felix", "Soren",
  "Ava", "Kenji", "Marisol", "Pax", "Rhea", "Isaac", "Noor", "Caleb", "Simone", "Arjun",
  "June", "Tobias", "Leila", "Wes", "Dahlia", "Nico", "Greta", "Asa", "Camille", "Reza",
];

const LAST_NAMES = [
  "Ellison", "Raman", "Okoye", "Voss", "Hale", "Cho", "Marin", "Quaye", "Adler", "Brooks",
  "Patel", "Ishikawa", "Navarro", "Berg", "Solis", "Winter", "Kim", "Duarte", "Lang", "Shah",
  "Moreau", "Singh", "Alvarez", "Costa", "Brennan", "Nguyen", "Farouk", "Sato", "Keane", "Ivers",
  "Blum", "Ortega", "Reid", "Tan", "Volk", "Ameen", "Crowe", "Das", "Pell", "Horst",
  "Inoue", "May", "Kline", "Zhou", "Barros", "Frost", "Qadir", "Young", "Vale", "Ibarra",
];

const TITLES: Record<string, string[]> = {
  agents: [
    "Shipping reliable agent workflows in production",
    "Tool use without surprise side effects",
    "Memory, traces, and the agent debug loop",
    "When a supervisor should not be another agent",
    "Human handoff that operators will actually use",
    "Planning less, verifying more",
    "Multi-agent routing that stays inspectable",
    "Retries, budgets, and graceful degradation",
    "Writing agent policies teams can audit",
    "From demo notebook to on-call playbook",
    "Grounding agents in internal systems safely",
    "The smallest useful agent for a real team",
  ],
  models: [
    "Choosing a model family without the hype cycle",
    "Distillation that keeps the useful behavior",
    "Long-context work that is worth the cost",
    "Fine-tuning only the last mile",
    "Eval sets that survive the next model drop",
    "Mixture-of-experts in product clothing",
    "Prompting is not a substitute for a spec",
    "Open weights in a regulated shop",
    "Latency budgets for interactive assistants",
    "What to cache, what to recompute",
    "Tokenizer surprises that break products",
    "A calm approach to multimodal inputs",
  ],
  infrastructure: [
    "GPU scheduling for a conference-week spike",
    "Tracing every tool call without drowning",
    "Queues, backpressure, and polite failure",
    "Secrets, sandboxes, and outbound allowlists",
    "Feature stores that agents can trust",
    "Cost dashboards that change the plan",
    "Blue-green for prompt and policy releases",
    "Object storage for traces and artifacts",
    "Regional inference without a second product",
    "The boring CI path for model packages",
    "Rate limits as a product feature",
    "Observability that names the failing step",
  ],
  product: [
    "Designing an AI feature users can refuse",
    "Empty states for systems that think",
    "Pricing usage without surprising finance",
    "Onboarding that teaches the boundary",
    "When a chat window is the wrong surface",
    "Support workflows that stay human-led",
    "Roadmaps after the first wow demo",
    "Measuring usefulness instead of tokens",
    "Permissioning generated actions",
    "A launch checklist for probabilistic UX",
    "Keeping the product voice when models change",
    "Internal tools that earn a second week",
  ],
  evaluation: [
    "Offline evals that predict production pain",
    "Rubrics reviewers can finish in one sitting",
    "Golden sets that do not rot in a week",
    "Human review when the score is a maybe",
    "Regression gates for prompt changes",
    "Pairwise comparison without the theater",
    "Safety evals that product will actually run",
    "What a single bad transcript should do",
    "Sampling production without leaking users",
    "Calibrating judges against a small panel",
    "Coverage for the long tail of tools",
    "Reporting evals to people who ship",
  ],
  dx: [
    "Local loops that do not need a cluster",
    "SDK design for people who hate SDKs",
    "Replay a failing agent turn in one command",
    "Docs that show the failure first",
    "Typed tool contracts that stay honest",
    "Fixtures instead of live model calls",
    "A starter repo teams will not throw away",
    "Linting prompts like any other source",
    "Versioning evals next to the product",
    "Editor hints for structured outputs",
    "Making traces readable in pull requests",
    "The five-minute path from clone to first run",
  ],
  safety: [
    "Allowlists beat after-the-fact filters",
    "Red-teaming a tool-using assistant",
    "Data boundaries the model cannot shrug off",
    "Incident response when the agent emailed",
    "Consent for generated actions",
    "Prompt injection as a product bug",
    "Logging enough to explain, not to hoard",
    "Dual control for irreversible tools",
    "What not to fine-tune on",
    "A public-safe disclosure habit",
    "Children, accounts, and over-eager helpers",
    "Keeping eval data out of training paths",
  ],
  workshops: [
    "Build a traced agent in ninety minutes",
    "Write an eval set before the feature",
    "Ship a refusal that users understand",
    "Instrument a tool call end to end",
    "Turn a notebook into a reviewable PR",
    "Design a human approval step",
    "Cost a workload before you scale it",
    "Pair on a failing production transcript",
    "Make a starter policy file",
    "Workshop: local replay and fix",
    "Map your first ten golden tasks",
    "Close the loop from eval to ticket",
  ],
};

const SLOT_HOURS = [9, 10, 11, 13, 14, 15, 16, 17];
const PROGRAM_ROOMS = ["keynote-hall", "hall-a", "hall-b"] as const;
const DECIDED_STATUSES: ProposalStatus[] = ["approve", "maybe", "deny"];

export function worldsFairEventRecord(): EventRecord {
  return {
    id: DEMO_EVENT_ID,
    name: DEMO_EVENT_NAME,
    startsOn: DEMO_EVENT_STARTS_ON,
    endsOn: DEMO_EVENT_ENDS_ON,
    timezone: DEMO_EVENT_TIMEZONE,
    submissionCount: WORLDS_FAIR_TRACKS.reduce((sum, track) => sum + track.proposalCount, 0),
    unreviewedCount: 28,
    themeAccent: DEMO_EVENT_THEME_ACCENT,
    tracks: WORLDS_FAIR_TRACKS.map((track) => ({ ...track })),
    rooms: WORLDS_FAIR_ROOMS.map((room) => ({ ...room })),
  };
}

export function worldsFairSpeakerName(index: number): string {
  if (index === 0) return DEMO_SPEAKER.name;
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const last = LAST_NAMES[(index * 3 + 1) % LAST_NAMES.length]!;
  const name = `${first} ${last}`;
  return name === DEMO_SPEAKER.name ? `${first} Vale` : name;
}

export function worldsFairSpeakerEmail(index: number): string {
  if (index === 0) return DEMO_SPEAKER.email;
  return `speaker-aewf-${String(index).padStart(3, "0")}@example.test`;
}

export function worldsFairTalkTitle(trackId: string, index: number): string {
  if (index === 0) return DEMO_SPEAKER.talkTitle;
  const titles = TITLES[trackId] ?? TITLES.agents;
  return titles[index % titles.length]!;
}

export function worldsFairBiography(name: string, trackName: string): string {
  if (name === DEMO_SPEAKER.name) return DEMO_SPEAKER.biography;
  return `${name} works on ${trackName.toLowerCase()} systems and talks about the parts that have to stay boring in production.`;
}

function wallClockIso(day: string, hour: number, minute = 0): string {
  return `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

export function worldsFairTaskDueAt(sessionIndex: number, taskIndex = 0): string {
  const day = 12 + ((sessionIndex + taskIndex) % 16);
  return `${DEMO_TASK_DUE_MONTH}-${String(day).padStart(2, "0")}T17:00:00.000Z`;
}

export function worldsFairHeadshotAsset(index: number): {
  assetId: string;
  objectKey: string;
  fileName: string;
} {
  return {
    assetId: `aewf-headshot-${String(index).padStart(3, "0")}`,
    objectKey: demoHeadshotObjectKey(index),
    fileName: `${worldsFairSpeakerName(index).toLowerCase().replaceAll(" ", "-")}.jpg`,
  };
}

export function worldsFairShowcasePlacement(index: number): {
  roomId: string;
  startsAt: string;
  endsAt: string;
} {
  const day = WORLDS_FAIR_DAYS[index % WORLDS_FAIR_DAYS.length]!;
  const hour = SLOT_HOURS[index % SLOT_HOURS.length]!;
  const roomId = ["hall-c", "expo-stage", "workshop-1", "community-lounge"][index % 4]!;
  return {
    roomId,
    startsAt: wallClockIso(day, hour),
    endsAt: wallClockIso(day, hour + 1),
  };
}

export function worldsFairEmbedInputs(): Array<PublicEmbedConfigInput & { id: string }> {
  return DEMO_EMBEDS.map((embed) => ({
    id: embed.id,
    name: embed.name,
    widget: embed.widget as PublicEmbedWidget,
    theme: "light",
    filters: {},
    fields: { ...DEFAULT_PUBLIC_EMBED_FIELDS },
    revisionId: null,
    disabled: false,
  }));
}

let headshotSeed: Promise<void> | null = null;

export async function seedWorldsFairHeadshotObjects(assets?: R2Bucket): Promise<void> {
  if (!assets) return;
  if (!headshotSeed) {
    headshotSeed = (async () => {
      if (await assets.head(demoHeadshotObjectKey(0))) return;
      await Promise.all(
        Array.from({ length: DEMO_HEADSHOT_COUNT }, async (_, index) => {
          await assets.put(demoHeadshotObjectKey(index), demoHeadshotJpeg(index), {
            httpMetadata: { contentType: "image/jpeg" },
          });
        }),
      );
    })();
  }
  await headshotSeed;
}

export interface WorldsFairProgramSession {
  sessionId: string;
  speakerId: string;
  proposalId: string;
  speakerName: string;
  speakerEmail: string;
  biography: string;
  title: string;
  abstract: string;
  trackId: string;
  trackName: string;
  roomId: string;
  format: "talk" | "workshop" | "keynote";
  startsAt: string;
  endsAt: string;
  coSpeakerName?: string;
}

export function buildWorldsFairProgramSessions(): WorldsFairProgramSession[] {
  const sessions: WorldsFairProgramSession[] = [];
  let index = 0;
  for (const [dayIndex, day] of WORLDS_FAIR_DAYS.entries()) {
    for (const hour of SLOT_HOURS) {
      for (const [roomIndex, roomId] of PROGRAM_ROOMS.entries()) {
        const track = WORLDS_FAIR_TRACKS[(index + dayIndex + roomIndex) % WORLDS_FAIR_TRACKS.length]!;
        const speakerName = worldsFairSpeakerName(index);
        const title = worldsFairTalkTitle(track.id, index);
        const format =
          hour === 9 && roomId === "keynote-hall"
            ? "keynote"
            : track.id === "workshops"
              ? "workshop"
              : "talk";
        sessions.push({
          sessionId: index === 0 ? DEMO_SAMPLE.sessionId : `aewf-session-${String(index).padStart(3, "0")}`,
          speakerId: index === 0 ? DEMO_SAMPLE.speakerId : `aewf-speaker-${String(index).padStart(3, "0")}`,
          proposalId: index === 0 ? DEMO_SAMPLE.proposalId : `SUB-AEWFP${String(index).padStart(3, "0")}`,
          speakerName,
          speakerEmail: worldsFairSpeakerEmail(index),
          biography: worldsFairBiography(speakerName, track.name),
          title,
          abstract: `${title} — a ${track.name.toLowerCase()} session for engineers who have to ship, operate, and explain the work.`,
          trackId: track.id,
          trackName: track.name,
          roomId,
          format,
          startsAt: wallClockIso(day, hour),
          endsAt: wallClockIso(day, hour + 1),
          coSpeakerName: index === 0 ? DEMO_SAMPLE.coSpeaker : undefined,
        });
        index += 1;
      }
    }
  }
  return sessions;
}

export function createWorldsFairSeedProposals(event: EventRecord): OrganizerProposal[] {
  let proposalIndex = 0;
  return event.tracks.flatMap((track) =>
    Array.from({ length: track.proposalCount }, (_, _trackIndex) => {
      proposalIndex += 1;
      const sequence = String(proposalIndex).padStart(4, "0");
      const status: ProposalStatus =
        proposalIndex <= event.unreviewedCount
          ? "unreviewed"
          : DECIDED_STATUSES[(proposalIndex - event.unreviewedCount - 1) % DECIDED_STATUSES.length]!;
      const speakerName = worldsFairSpeakerName(proposalIndex);
      const title = worldsFairTalkTitle(track.id, proposalIndex);
      const speakerEmail = `speaker-aewf-${sequence}@example.test`;
      const biography = worldsFairBiography(speakerName, track.name);
      const abstract = `A ${track.name.toLowerCase()} proposal for ${event.name}: ${title.toLowerCase()}.`;
      return {
        id: `SUB-AEWF${sequence}`,
        eventId: event.id,
        formId: "main-cfp",
        formDefinitionVersion: 1,
        answers: {
          title,
          abstract,
          trackId: track.id,
          sessionFormat: track.id === "workshops" ? "workshop" : "talk",
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
        sessionFormat: track.id === "workshops" ? "workshop" : "talk",
        workshopDuration: track.id === "workshops" ? "90" : "",
        coSpeakers: [],
        supportingFile: null,
        status,
        programOutcome: null,
        committeeNote: "",
        privateNote: "",
        reviewVersion: 0,
        submittedAt: `2026-05-${String((proposalIndex % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        confirmationEmailStatus: null,
        scorecardAggregate: null,
        reviewerRecusal: null,
        reviewerRecusals: [],
      } satisfies OrganizerProposal;
    }),
  );
}
