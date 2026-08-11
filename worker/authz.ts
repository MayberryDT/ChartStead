import type { EventRecord, OrganizerPrincipal, OrganizerProposal } from "../shared/events";
import type { AppBindings } from "./types";

export function eventRole(
  principal: OrganizerPrincipal,
  eventId: string,
): "admin" | "reviewer" | null {
  if (!principal.eventIds.includes(eventId)) return null;
  return principal.rolesByEvent?.[eventId] ?? principal.role;
}

export function assignedTrackIds(
  principal: OrganizerPrincipal,
  eventId: string,
): string[] | null {
  return eventRole(principal, eventId) === "admin"
    ? null
    : (principal.trackIdsByEvent?.[eventId] ?? []);
}

export function canAccessEvent(
  principal: OrganizerPrincipal | null,
  eventId: string,
): principal is OrganizerPrincipal {
  return Boolean(principal && eventRole(principal, eventId));
}

export function isEventAdmin(
  principal: OrganizerPrincipal | null,
  eventId: string,
): principal is OrganizerPrincipal {
  return Boolean(principal && eventRole(principal, eventId) === "admin");
}

export function canReviewProposal(
  principal: OrganizerPrincipal,
  eventId: string,
  proposal: Pick<OrganizerProposal, "trackId">,
): boolean {
  const tracks = assignedTrackIds(principal, eventId);
  return tracks === null || tracks.includes(proposal.trackId);
}

export async function scopeEventForPrincipal(
  env: AppBindings,
  event: EventRecord,
  principal: OrganizerPrincipal,
): Promise<EventRecord> {
  const tracks = assignedTrackIds(principal, event.id);
  if (tracks === null) return event;
  const proposals = (await env.EVENT_STORE.getByName(event.id).listProposals({
    trackIds: tracks,
  })) as OrganizerProposal[];
  const counts = new Map<string, number>();
  let unreviewedCount = 0;
  for (const proposal of proposals) {
    counts.set(proposal.trackId, (counts.get(proposal.trackId) ?? 0) + 1);
    if (proposal.status === "unreviewed") unreviewedCount += 1;
  }
  return {
    ...event,
    submissionCount: proposals.length,
    unreviewedCount,
    tracks: event.tracks
      .filter((track) => tracks.includes(track.id))
      .map((track) => ({ ...track, proposalCount: counts.get(track.id) ?? 0 })),
  };
}
