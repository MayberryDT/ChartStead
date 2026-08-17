/** Canonical demo event shared by `/demo`, public program, embeds, and the website. */

export const DEMO_EVENT_ID = "ai-engineer-worlds-fair-2026";
export const DEMO_EVENT_NAME = "AI Engineer World's Fair 2026";
export const DEMO_EVENT_STARTS_ON = "2026-06-29";
export const DEMO_EVENT_ENDS_ON = "2026-07-02";
export const DEMO_EVENT_TIMEZONE = "America/Los_Angeles";
export const DEMO_EVENT_VENUE = "Moscone West";
export const DEMO_EVENT_CITY = "San Francisco";
export const DEMO_EVENT_THEME_ACCENT = "#081d3a";

export const DEMO_REVIEW_TRACK_ID = "agents";
export const DEMO_REVIEW_TRACK_NAME = "Agents";
export const DEMO_REVIEWER_PROPOSAL_ID = "SUB-AEWF0001";

export const DEMO_SPEAKER = {
  name: "Nora Ellison",
  email: "nora.ellison@example.test",
  biography:
    "Nora builds production agent systems and helps teams keep tool use, evaluation, and rollback boringly reliable.",
  talkTitle: "Shipping reliable agent workflows in production",
  trackId: DEMO_REVIEW_TRACK_ID,
  format: "talk",
} as const;

export const DEMO_SAMPLE = {
  label: "Sample event",
  name: DEMO_EVENT_NAME,
  eventId: DEMO_EVENT_ID,
  proposalId: "SUB-AEWF0017",
  speakerId: "aewf-speaker-000",
  sessionId: "aewf-session-000",
  track: DEMO_REVIEW_TRACK_NAME,
  speaker: DEMO_SPEAKER.name,
  coSpeaker: "Priya Raman",
  talkTitle: DEMO_SPEAKER.talkTitle,
} as const;

/** Speaker onboarding due dates stay in the future for the live demo. */
export const DEMO_TASK_DUE_MONTH = "2026-11";

export const DEMO_EMBEDS = [
  { id: "aewf-embed-sessions", name: "Sessions List", widget: "sessions" },
  { id: "aewf-embed-speakers", name: "Speakers List", widget: "speakers" },
  { id: "aewf-embed-agenda", name: "Agenda", widget: "agenda" },
  { id: "aewf-embed-itinerary", name: "Schedule Itinerary", widget: "itinerary" },
  { id: "aewf-embed-speaker-gallery", name: "Speaker Gallery", widget: "speaker-gallery" },
] as const;

export const SWITCHER_EVENT_IDS = [
  "pacific-open-data-summit-2026",
  "civic-tech-summit-2026",
] as const;
