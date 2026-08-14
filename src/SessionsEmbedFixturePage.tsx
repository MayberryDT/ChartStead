import type { PublicProgramResponse } from "../shared/events";
import { PublicProgramRenderer } from "./PublicProgramRenderer";

const tracks = [
  ["governance", "Governance & Policy"], ["data", "Data & Technology"],
  ["capacity", "Capacity Building"], ["economy", "Economy & Opportunity"],
  ["environment", "Environment & Resilience"], ["privacy", "Privacy & Ethics"],
] as const;

const rows = [
  ["Public Infrastructure for Everyone", "A keynote on building equitable, sustainable public data infrastructure that serves everyone.", "Keynote", "governance", "Grand Hall", "2026-10-07T09:00:00.000Z", "2026-10-07T10:00:00.000Z", ["Maya Chen"]],
  ["Designing Trustworthy Data Systems", "A panel on building secure, transparent, and accountable data systems that earn and keep public trust.", "Panel", "data", "Grand Hall", "2026-10-07T11:15:00.000Z", "2026-10-07T12:15:00.000Z", ["Elena Ruiz", "Omar Shah", "Nia Brooks"]],
  ["From Open Data to Public Value", "A hands-on workshop for turning open data into insights, services, and stronger communities.", "Workshop", "capacity", "Room 204", "2026-10-07T14:15:00.000Z", "2026-10-07T15:45:00.000Z", ["Jordan Lee"]],
  ["Open Data for Inclusive Growth", "Exploring how open data drives economic opportunity and supports small businesses and local innovation.", "Presentation", "economy", "Room 204", "2026-10-07T16:00:00.000Z", "2026-10-07T16:45:00.000Z", ["Priya Nair"]],
  ["Data for Climate Resilience", "How open environmental data supports climate adaptation, emergency response, and long-term resilience.", "Panel", "environment", "Grand Hall", "2026-10-08T09:00:00.000Z", "2026-10-08T10:00:00.000Z", ["Mateo Silva", "Amara Okafor", "Noah Green"]],
  ["Interoperability in Practice", "Real-world examples and lessons for making data interoperable across systems and jurisdictions.", "Presentation", "data", "Room 203", "2026-10-07T10:15:00.000Z", "2026-10-07T11:00:00.000Z", ["Alex Morgan"]],
  ["Open Data Skills Lab", "A collaborative lab to strengthen practical skills in data cleaning, visualization, and storytelling.", "Workshop", "capacity", "Room 204", "2026-10-08T13:30:00.000Z", "2026-10-08T15:00:00.000Z", ["Leah Park"]],
  ["Privacy, Ethics, and the Public Good", "A discussion on protecting privacy and advancing equity in open data initiatives.", "Panel", "privacy", "Grand Hall", "2026-10-08T15:15:00.000Z", "2026-10-08T16:15:00.000Z", ["Sam Reed", "Aisha Khan", "Ben Ortiz"]],
  ["Building Sustainable Data Partnerships", "Practical patterns for durable partnerships across government, research, and community organizations.", "Presentation", "governance", "Room 203", "2026-10-08T16:15:00.000Z", "2026-10-08T17:00:00.000Z", ["Iris Bell"]],
  ["Community-Led Data Governance", "Putting residents at the center of decisions about collection, access, stewardship, and accountability.", "Workshop", "privacy", "Room 204", "2026-10-08T17:15:00.000Z", "2026-10-08T18:45:00.000Z", ["Taylor Kim"]],
] as const;

export const sessionsEmbedFixture: PublicProgramResponse = {
  event: { id: "sessions-embed-fixture", name: "Pacific Open Data Summit 2026", startsOn: "2026-10-07", endsOn: "2026-10-08", timezone: "UTC", themeAccent: "#2f5d98", tracks: tracks.map(([id, name]) => ({ id, name })), rooms: ["Grand Hall", "Room 203", "Room 204"].map((name) => ({ id: name.toLowerCase().replace(/ /g, "-"), name, readiness: "ready" })) },
  revision: { id: "fixture-revision", version: 1, publishedAt: "2026-08-14T00:00:00.000Z", isCurrent: true },
  sessions: rows.map(([title, description, format, trackId, roomName, startsAt, endsAt, names], index) => ({ id: `fixture-session-${index + 1}`, title, description, format, trackId, trackName: tracks.find(([id]) => id === trackId)?.[1] ?? trackId, roomId: roomName.toLowerCase().replace(/ /g, "-"), roomName, roomPending: false, startsAt, endsAt, day: startsAt.slice(0, 10), calendarUid: `fixture-${index + 1}@chartstead.test`, calendarSequence: 0, speakers: names.map((name, speakerIndex) => ({ id: `fixture-speaker-${index}-${speakerIndex}`, name, title: "Public data leader", company: "Pacific Open Data Network", role: "primary" })) })),
  speakers: rows.flatMap((row, index) => row[7].map((name, speakerIndex) => ({ id: `fixture-speaker-${index}-${speakerIndex}`, name, biography: "Public-safe deterministic fixture biography.", headshotAssetId: null, sessionIds: [`fixture-session-${index + 1}`] }))),
  revisions: [{ id: "fixture-revision", version: 1, publishedAt: "2026-08-14T00:00:00.000Z", isCurrent: true }],
};

export function SessionsEmbedFixturePage() {
  return <main className="program-shell mode-embed"><PublicProgramRenderer data={sessionsEmbedFixture} mode="embed" widget="sessions" /><footer className="program-footer"><p>Powered by&nbsp; <strong>ChartStead</strong></p></footer></main>;
}
