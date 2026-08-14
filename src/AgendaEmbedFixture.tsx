import type { PublicProgramResponse, PublicProgramSession } from "../shared/events";
import { PublicProgramRenderer } from "./PublicProgramRenderer";

const speakers = [
  ["maya", "Maya Chen"], ["jordan", "Jordan Lee"], ["priya", "Priya Nair"],
  ["elena", "Elena Rodriguez"], ["noah", "Noah Kim"], ["diego", "Diego Ramirez"],
  ["aisha", "Aisha Malik"], ["ben", "Ben Carter"], ["leilani", "Leilani Santos"],
].map(([id, name]) => ({ id, name, biography: "", title: "", company: "", headshotAssetId: null, sessionIds: [] }));

const row = (id: string, title: string, format: string, start: string, minutes: number, roomId: string, roomName: string, trackId: string, trackName: string, speakerIds: string[]): PublicProgramSession => ({
  id, title, description: `${title} at Pacific Open Data Summit.`, format, trackId, trackName, roomId, roomName, roomPending: false,
  startsAt: `2026-10-07T${start}:00.000Z`, endsAt: new Date(new Date(`2026-10-07T${start}:00.000Z`).getTime() + minutes * 60000).toISOString(), day: "2026-10-07",
  calendarUid: `fixture-${id}`, calendarSequence: 0,
  speakers: speakerIds.map((speakerId) => { const speaker = speakers.find((item) => item.id === speakerId)!; return { id: speaker.id, name: speaker.name, title: "", company: "", role: "primary" as const }; }),
});

const data: PublicProgramResponse = {
  event: {
    id: "agenda-fixture", name: "Pacific Open Data Summit 2026", startsOn: "2026-10-07", endsOn: "2026-10-08", timezone: "UTC", themeAccent: "#2f5d98",
    tracks: [{ id: "keynote", name: "Keynote" }, { id: "governance", name: "Governance" }, { id: "capacity", name: "Capacity Building" }, { id: "applications", name: "Applications" }, { id: "emerging", name: "Emerging Tech" }, { id: "community", name: "Community" }],
    rooms: [{ id: "foyer", name: "Harbor Hall Foyer", readiness: "ready" }, { id: "harbor", name: "Harbor Hall", readiness: "ready" }, { id: "atlas", name: "Atlas Room", readiness: "ready" }, { id: "studio", name: "Studio B", readiness: "ready" }, { id: "terrace", name: "Harbor Terrace", readiness: "ready" }],
  },
  revision: { id: "fixture-revision", version: 4, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true },
  revisions: [{ id: "fixture-revision", version: 4, publishedAt: "2026-08-14T12:00:00.000Z", isCurrent: true }],
  sessions: [
    row("agenda-registration", "Registration & Check-in", "registration", "08:00", 60, "foyer", "Harbor Hall Foyer", "", "", []),
    row("agenda-keynote", "Public Infrastructure for Everyone", "keynote", "09:00", 60, "harbor", "Harbor Hall", "keynote", "Keynote", ["maya"]),
    row("agenda-trust", "Designing Trustworthy Data Systems", "panel", "10:15", 75, "atlas", "Atlas Room", "governance", "Governance", ["jordan", "priya", "elena"]),
    row("agenda-value", "From Open Data to Public Value", "workshop", "11:30", 75, "studio", "Studio B", "capacity", "Capacity Building", ["noah"]),
    row("agenda-lunch", "Networking Lunch", "lunch", "12:45", 75, "harbor", "Harbor Hall", "", "", []),
    row("agenda-action", "Open Data in Action: City and Community Impact", "presentation", "14:00", 60, "harbor", "Harbor Hall", "applications", "Applications", ["diego"]),
    row("agenda-good", "AI, Open Data, and the Public Good", "panel", "15:15", 60, "atlas", "Atlas Room", "emerging", "Emerging Tech", ["aisha", "ben", "leilani"]),
    row("agenda-spotlights", "Community Spotlights", "lightning talks", "16:30", 45, "studio", "Studio B", "community", "Community", ["maya", "noah"]),
    row("agenda-reception", "Welcome Reception", "reception", "17:30", 60, "terrace", "Harbor Terrace", "", "", []),
    { ...row("agenda-day-two", "Open Data Futures", "keynote", "09:00", 60, "harbor", "Harbor Hall", "keynote", "Keynote", ["maya"]), day: "2026-10-08", startsAt: "2026-10-08T09:00:00.000Z", endsAt: "2026-10-08T10:00:00.000Z" },
  ],
  speakers,
};

export function AgendaEmbedFixture() {
  return <main className="program-shell mode-embed"><PublicProgramRenderer data={data} mode="embed" widget="agenda" /><footer className="program-footer"><p>Powered by <strong>ChartStead</strong></p></footer></main>;
}
