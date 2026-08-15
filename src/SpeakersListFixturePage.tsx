import type { PublicProgramResponse } from "../shared/events";
import { PublicProgramRenderer } from "./PublicProgramRenderer";

const people = [
  ["Aiden Tui", "Data Strategist", "Pacific Insight", "Opening Keynote: Data for a Resilient Pacific"],
  ["Carmen Rodrigues", "Head of Open Data", "Ministry of Digital Future", "National Open Data Roadmaps · From Policy to Practice"],
  ["Maya Chen", "Chief Data Officer", "OpenCity Labs", "Opening Keynote: Data for a Resilient Pacific · AI with Impact: Responsible Innovation"],
  ["Jordon Prasad", "Data Engineer", "Stats NZ", "Building Interoperable Data Systems"],
  ["Jordan Lee", "Open Data Lead", "City Innovation Office", "Local Data, Local Impact · Open Data Partnerships That Work"],
  ["Leilani Williams", "Community Data Lead", "Data Aotearoa", "Indigenous Data Sovereignty in Action · Community-Led Data Initiatives"],
  ["Linh Tran", "Product Manager", "Dataify", "Designing Data Products People Use"],
  ["Malakai Iosefa", "GIS Lead", "Tonga Land & Survey", "Geospatial Data for Climate Resilience"],
  ["Maria Svensson", "Open Data Coordinator", "UNDP Pacific Office", "Financing Open Data Ecosystems"],
  ["Priya Nair", "Director of Data Ethics", "Civic Data Trust", "Ethical Data in the Public Interest · Building Public Trust in Data"],
  ["Ravi Singh", "Open Data Analyst", "Fiji Bureau of Statistics", "Data Quality at Scale"],
  ["Sione Vaka", "Chief Technology Officer", "Pacific Data Hub", "Building Interoperable Data Systems · Open Infrastructure for the Pacific"],
  ["Takuya Nakamura", "Research Lead", "Asia Pacific Open Data Partnership", "Cross-Border Data Collaboration"],
  ["Tiana Moana", "Data Literacy Lead", "Youth in Data", "Empowering the Next Generation"],
  ["Will Jackson", "Director of Data Strategy", "Auckland Council", "AI with Impact: Responsible Innovation"],
] as const;

const sessions = people.map(([name, title, company, sessionTitle], index) => ({
  id: `fixture-session-${index + 1}`,
  title: sessionTitle,
  description: `A practical session from ${name} for the Pacific open data community.`,
  format: index % 4 === 0 ? "keynote" : "talk",
  trackId: ["platform", "community", "policy", "data"][(index % 4)]!,
  trackName: ["Platform", "Community", "Policy", "Data"][(index % 4)]!,
  roomId: "harbor-hall",
  roomName: "Harbor Hall",
  roomPending: false,
  startsAt: `2026-10-07T${String(15 + Math.floor(index / 2)).padStart(2, "0")}:00:00.000Z`,
  endsAt: `2026-10-07T${String(15 + Math.floor(index / 2)).padStart(2, "0")}:45:00.000Z`,
  day: "2026-10-07",
  calendarUid: `fixture-session-${index + 1}`,
  calendarSequence: 0,
  speakers: [{ id: `fixture-speaker-${index + 1}`, name, title, company, role: "primary" }],
}));

export const speakersListFixture: PublicProgramResponse = {
  event: {
    id: "pacific-open-data-summit-2026",
    name: "Pacific Open Data Summit 2026",
    startsOn: "2026-10-07",
    endsOn: "2026-10-08",
    timezone: "Pacific/Auckland",
    themeAccent: "#2F5D98",
    tracks: [
      { id: "platform", name: "Platform" }, { id: "community", name: "Community" },
      { id: "policy", name: "Policy" }, { id: "data", name: "Data" },
    ],
    rooms: [{ id: "harbor-hall", name: "Harbor Hall", readiness: "ready" }],
  },
  revision: { id: "fixture-revision", version: 7, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true },
  sessions,
  speakers: people.map(([name, title, company], index) => ({
    id: `fixture-speaker-${index + 1}`, name, title, company,
    biography: `${name} works across the Pacific open data community to make public information useful, trustworthy, and accessible.`,
    headshotAssetId: `fixture-headshot-${index + 1}`,
    headshotUrl: `/demo/speakers/speaker-${index + 1}.webp`,
    sessionIds: [`fixture-session-${index + 1}`],
  })),
  revisions: [{ id: "fixture-revision", version: 7, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true }],
};

export function SpeakersListFixturePage() {
  return <main className="program-shell mode-embed speaker-list-fixture"><PublicProgramRenderer data={speakersListFixture} mode="embed" widget="speakers" /><footer className="program-footer"><p>Powered by <strong>ChartStead</strong></p></footer></main>;
}
