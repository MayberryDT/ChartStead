import type { EventRecord } from "../shared/events";
import { COURSE_CHECK_DEMO_TRACK } from "./seed-course-check-demo";
import { worldsFairEventRecord } from "./seed-worlds-fair";

export const seedEvents: EventRecord[] = [
  {
    id: "pacific-open-data-summit-2026",
    name: "Pacific Open Data Summit 2026",
    startsOn: "2026-10-07",
    endsOn: "2026-10-08",
    timezone: "America/Los_Angeles",
    submissionCount: 57,
    unreviewedCount: 18,
    themeAccent: "#2f5d98",
    tracks: [
      { id: "platform", name: "Platform", proposalCount: 14 },
      { id: "program-ops", name: "Program Ops", proposalCount: 12 },
      { id: "design-systems", name: "Design Systems", proposalCount: 11 },
      { id: "community", name: "Community", proposalCount: 10 },
      {
        id: COURSE_CHECK_DEMO_TRACK.id,
        name: COURSE_CHECK_DEMO_TRACK.name,
        proposalCount: COURSE_CHECK_DEMO_TRACK.proposalCount,
      },
    ],
    rooms: [
      { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
      { id: "compass-room", name: "Compass Room", readiness: "ready" },
      { id: "chart-room", name: "Chart Room", readiness: "ready" },
    ],
  },
  worldsFairEventRecord(),
  {
    id: "civic-tech-summit-2026",
    name: "Civic Tech Summit 2026",
    startsOn: "2026-11-12",
    endsOn: "2026-11-13",
    timezone: "America/New_York",
    submissionCount: 36,
    unreviewedCount: 12,
    themeAccent: "#7d4e2a",
    tracks: [
      { id: "civic-data", name: "Civic Data", proposalCount: 10 },
      { id: "public-interest", name: "Public Interest Technology", proposalCount: 9 },
      { id: "community-power", name: "Community Power", proposalCount: 9 },
      { id: "workshops", name: "Workshops", proposalCount: 8 },
    ],
    rooms: [
      { id: "assembly-hall", name: "Assembly Hall", readiness: "ready" },
      { id: "commons-room", name: "Commons Room", readiness: "ready" },
      { id: "studio-b", name: "Studio B", readiness: "pending" },
    ],
  },
];
