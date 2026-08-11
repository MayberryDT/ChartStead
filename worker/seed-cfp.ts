import { createDefaultCfpDefinition } from "../shared/cfp-definition";
import type { EventRecord, PublishedCfpForm } from "../shared/events";

export function createSeedCfp(event: EventRecord): PublishedCfpForm {
  const definition = createDefaultCfpDefinition({
    definitionId: "main-cfp",
    eventId: event.id,
    trackChoices: event.tracks.map((track) => ({
      value: track.id,
      text: track.name,
    })),
  });
  definition.status = "published";
  definition.definitionVersion = 1;
  definition.opensAt = "2026-08-09T00:00:00.000Z";

  return {
    id: "main-cfp",
    name: "Main CFP",
    status: "published",
    definitionVersion: 1,
    publishedAt: "2026-08-09T00:00:00.000Z",
    definition,
  };
}
