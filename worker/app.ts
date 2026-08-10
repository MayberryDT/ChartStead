import { Hono } from "hono";

import type { EventRecord, OrganizerPrincipal } from "../shared/events";
import { createAuth, resolveProductionPrincipal } from "./auth";
import { seedEvents } from "./seed-events";
import type { AppBindings } from "./types";

type PrincipalResolver = (
  request: Request,
  env: AppBindings,
) => Promise<OrganizerPrincipal | null>;

interface AppOptions {
  resolvePrincipal?: PrincipalResolver;
}

async function loadEvent(
  env: AppBindings,
  seed: EventRecord,
): Promise<EventRecord> {
  const store = env.EVENT_STORE.getByName(seed.id);
  await store.seedIfEmpty(seed);
  const event = await store.getEvent();
  if (!event) {
    throw new Error(`Event ${seed.id} was not initialized.`);
  }
  return event;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>();
  const resolvePrincipal =
    options.resolvePrincipal ?? resolveProductionPrincipal;

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.all("/api/auth/*", async (c) => {
    const auth = createAuth(c.env);
    if (!auth) {
      return c.json(
        { error: "Authentication is not configured for this environment." },
        503,
      );
    }
    return auth.handler(c.req.raw);
  });

  app.get("/api/events", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const visibleSeeds = seedEvents.filter((event) =>
      principal.eventIds.includes(event.id),
    );
    const events = await Promise.all(
      visibleSeeds.map((event) => loadEvent(c.env, event)),
    );
    return c.json({ events, principal });
  });

  app.get("/api/events/:eventId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!principal || !principal.eventIds.includes(eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = seedEvents.find((event) => event.id === eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({ event: await loadEvent(c.env, seed), principal });
  });

  return app;
}
