import type { EventRecord } from "../shared/events";

export const seedEvents: EventRecord[] = [
  {
    id: "pacific-open-data-summit-2026",
    name: "Pacific Open Data Summit 2026",
    startsOn: "2026-10-07",
    endsOn: "2026-10-08",
    submissionCount: 47,
    unreviewedCount: 18,
    tracks: [
      { id: "platform", name: "Platform", proposalCount: 14 },
      { id: "program-ops", name: "Program Ops", proposalCount: 12 },
      { id: "design-systems", name: "Design Systems", proposalCount: 11 },
      { id: "community", name: "Community", proposalCount: 10 },
    ],
    rooms: [
      { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
      { id: "compass-room", name: "Compass Room", readiness: "ready" },
      { id: "chart-room", name: "Chart Room", readiness: "ready" },
    ],
  },
  {
    id: "ai-engineer-worlds-fair-2026",
    name: "AI Engineer World's Fair 2026",
    startsOn: "2026-06-25",
    endsOn: "2026-06-27",
    submissionCount: 32,
    unreviewedCount: 9,
    tracks: [
      { id: "agents", name: "Agents", proposalCount: 12 },
      { id: "models", name: "Models", proposalCount: 8 },
      { id: "infrastructure", name: "Infrastructure", proposalCount: 7 },
      { id: "product", name: "Product", proposalCount: 5 },
    ],
    rooms: [
      { id: "main-stage", name: "Main Stage", readiness: "ready" },
      { id: "workshop-hall", name: "Workshop Hall", readiness: "pending" },
    ],
  },
];
