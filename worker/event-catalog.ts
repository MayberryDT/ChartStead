import type { EventRecord, OrganizerPrincipal } from "../shared/events";
import { createSeedCfp } from "./seed-cfp";
import { seedEvents } from "./seed-events";
import { createSeedProposals } from "./seed-proposals";
import type { AppBindings } from "./types";

const operationalEvents = new Map<string, EventRecord>();

export function isSeedEvent(eventId: string): boolean {
  return seedEvents.some((event) => event.id === eventId);
}

export function findKnownEvent(eventId: string): EventRecord | undefined {
  return (
    seedEvents.find((event) => event.id === eventId) ??
    operationalEvents.get(eventId)
  );
}

export function rememberEvent(event: EventRecord): EventRecord {
  if (!isSeedEvent(event.id)) operationalEvents.set(event.id, event);
  return event;
}

export async function loadEventWorkspace(
  env: AppBindings,
  eventId: string,
): Promise<EventRecord | null> {
  const seed = seedEvents.find((event) => event.id === eventId);
  const store = env.EVENT_STORE.getByName(eventId);
  if (seed) {
    await store.seedIfEmpty(seed);
    await store.seedPublishedFormIfEmpty(createSeedCfp(seed));
    await store.seedProposalsIfNeeded(createSeedProposals(seed));
    await store.seedCourseCheckDemoIfNeeded();
  }
  const event = await store.getEvent();
  return event ? rememberEvent(event) : null;
}

export async function enrichPrincipalMemberships(
  database: D1Database | undefined,
  principal: OrganizerPrincipal | null,
): Promise<OrganizerPrincipal | null> {
  if (!database || !principal) return principal;
  try {
    const memberships = await database
      .prepare(
        `SELECT event_id, role FROM event_memberships
         WHERE user_id = ? ORDER BY event_id`,
      )
      .bind(principal.id)
      .all<{ event_id: string; role: "admin" | "reviewer" }>();
    if (memberships.results.length === 0) return principal;
    const eventIds = [...principal.eventIds];
    const rolesByEvent = { ...principal.rolesByEvent };
    const trackIdsByEvent = Object.fromEntries(
      Object.entries(principal.trackIdsByEvent ?? {}).map(([eventId, trackIds]) => [
        eventId,
        [...trackIds],
      ]),
    );
    for (const membership of memberships.results) {
      if (!eventIds.includes(membership.event_id)) eventIds.push(membership.event_id);
      rolesByEvent[membership.event_id] = membership.role;
    }
    try {
      const assignments = await database
        .prepare(
          `SELECT event_id, track_id FROM reviewer_track_assignments
           WHERE user_id = ? ORDER BY event_id, track_id`,
        )
        .bind(principal.id)
        .all<{ event_id: string; track_id: string }>();
      for (const assignment of assignments.results) {
        const trackIds = (trackIdsByEvent[assignment.event_id] ??= []);
        if (!trackIds.includes(assignment.track_id)) trackIds.push(assignment.track_id);
      }
    } catch (error) {
      if (!(error instanceof Error) || !/no such table/i.test(error.message)) throw error;
    }
    return { ...principal, eventIds, rolesByEvent, trackIdsByEvent };
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return principal;
    throw error;
  }
}

export async function listEventWorkspaces(
  env: AppBindings,
  principal: OrganizerPrincipal,
): Promise<EventRecord[]> {
  const events = await Promise.all(
    principal.eventIds.map((eventId) => loadEventWorkspace(env, eventId)),
  );
  return events.filter((event): event is EventRecord => event !== null);
}

export async function listAllEventWorkspaceIds(
  database: D1Database | undefined,
): Promise<string[]> {
  const ids = seedEvents.map((event) => event.id);
  if (!database) return ids;
  try {
    const memberships = await database
      .prepare(`SELECT DISTINCT event_id FROM event_memberships ORDER BY event_id`)
      .all<{ event_id: string }>();
    for (const row of memberships.results) {
      if (!ids.includes(row.event_id)) ids.push(row.event_id);
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/i.test(error.message)) throw error;
  }
  return ids;
}
