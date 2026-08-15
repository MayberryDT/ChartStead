import type { PublicProgramResponse } from "../shared/events";

const people = [
  ["maya", "Maya Chen", "Chief Data Officer", "City of Auckland", "Data Leadership", "platform"],
  ["priya", "Priya Nair", "Head of Data Governance", "Digital Government NZ", "Governance & Policy", "community"],
  ["jordan", "Jordan Lee", "Senior Data Scientist", "Stats NZ", "Data Practice", "design-systems"],
  ["leilani", "Leilani Williams", "Open Data Lead", "Hawaii State Office of Planning", "Open Communities", "agents"],
  ["iakopo", "Iakopo Tuisano", "GIS Program Manager", "Samoa Ministry of Natural Resources", "Data Practice", "design-systems"],
  ["helen", "Dr. Helen Roberts", "Director, Data & Insights", "Australian Bureau of Statistics", "Governance & Policy", "community"],
  ["arjun", "Arjun Patel", "Co-founder & CTO", "Taro Works", "Innovation & Tech", "program-ops"],
  ["moana", "Moana Kaitu’u", "Research & Evaluation Lead", "Pacific Community (SPC)", "Open Communities", "agents"],
  ["litia", "Litia Tuivasa", "Data Analyst", "Ministry of Health, Tonga", "Data Practice", "design-systems"],
  ["ben", "Ben Thompson", "Manager, Data Strategy", "World Bank", "Data Leadership", "platform"],
  ["sina", "Sina Malimali", "Youth Data Advocate", "Pacific Youth Council", "Open Communities", "agents"],
] as const;

export const demoSpeakerGalleryFixture: PublicProgramResponse = {
  event: {
    id: "signal-rail-gallery",
    name: "Pacific Open Data Summit 2026",
    startsOn: "2026-05-12",
    endsOn: "2026-05-13",
    timezone: "Pacific/Auckland",
    themeAccent: "#0756b8",
    tracks: [
      { id: "platform", name: "Data Leadership" },
      { id: "community", name: "Governance & Policy" },
      { id: "design-systems", name: "Data Practice" },
      { id: "agents", name: "Open Communities" },
      { id: "program-ops", name: "Innovation & Tech" },
    ],
    rooms: [{ id: "harbour", name: "Harbour Hall", readiness: "ready" }],
  },
  revision: { id: "signal-rail-v3", version: 3, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true },
  revisions: [{ id: "signal-rail-v3", version: 3, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true }],
  sessions: [
    { id: "trust", title: "Building Trust in Government Data", description: "A practical panel on trusted public data.", format: "Panel Discussion", trackId: "community", trackName: "Governance & Policy", roomId: "harbour", roomName: "Harbour Hall", roomPending: false, startsAt: "2026-05-12T10:30:00.000Z", endsAt: "2026-05-12T11:15:00.000Z", day: "2026-05-12", calendarUid: "signal-trust", calendarSequence: 0, speakers: people.filter((_, i) => i % 2 === 0 || i === 1).map(([id, name, title, company]) => ({ id, name, title, company, role: "speaker" })) },
    { id: "cross-border", title: "Governance Patterns for Cross-Border Data", description: "Patterns for regional collaboration.", format: "Breakout Session", trackId: "community", trackName: "Governance & Policy", roomId: "harbour", roomName: "Harbour Hall", roomPending: false, startsAt: "2026-05-13T14:00:00.000Z", endsAt: "2026-05-13T14:45:00.000Z", day: "2026-05-13", calendarUid: "signal-cross", calendarSequence: 0, speakers: people.filter((_, i) => i % 2 === 1).map(([id, name, title, company]) => ({ id, name, title, company, role: "speaker" })) },
  ],
  speakers: people.map(([id, name, title, company, track], index) => ({
    id, name, title, company,
    biography: id === "priya" ? "Priya leads data governance strategy at Digital Government NZ, advancing trusted data use, privacy-by-design, and ethical frameworks that support better public outcomes." : `${name} works across the Pacific to make public data more useful, trustworthy, and inclusive.`,
    headshotAssetId: `demo-${id}`,
    headshotUrl: `/demo/speaker-gallery/${id}.webp`,
    sessionIds: id === "priya" ? ["trust", "cross-border"] : index % 2 === 0 ? ["trust"] : ["cross-border"],
  })),
};
