import { Hono } from "hono";

import type {
  EventRecord,
  OrganizerPrincipal,
} from "../shared/events";
import { createAuth, resolveProductionPrincipal } from "./auth";
import {
  normalizeProposalInput,
  toPublicProposal,
  validateProposalInput,
} from "./proposals";
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

function findSeed(eventId: string): EventRecord | undefined {
  return seedEvents.find((event) => event.id === eventId);
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

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({ event: await loadEvent(c.env, seed), principal });
  });

  app.get("/api/events/:eventId/cfp", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const event = await loadEvent(c.env, seed);
    return c.json({
      event: {
        id: event.id,
        name: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
      },
      form: {
        status: "published" as const,
        tracks: event.tracks.map((track) => ({
          id: track.id,
          name: track.name,
        })),
      },
    });
  });

  app.post("/api/events/:eventId/proposals", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const event = await loadEvent(c.env, seed);
    const values = normalizeProposalInput(await c.req.json().catch(() => ({})));
    const validation = validateProposalInput(values, event);
    if (validation) {
      return c.json(validation, 400);
    }

    const store = c.env.EVENT_STORE.getByName(event.id);
    const proposal = await store.createProposal(values);
    return c.json({ proposal: toPublicProposal(proposal) }, 201);
  });

  app.get("/api/events/:eventId/proposals", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!principal || !principal.eventIds.includes(eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const query = c.req.query("q") ?? "";
    const proposals = await store.listProposals(query);
    return c.json({ proposals });
  });

  app.get("/api/events/:eventId/proposals/:proposalId", async (c) => {
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const proposal = await store.getProposal(proposalId);
    if (!proposal) {
      return c.json({ error: "Proposal not found" }, 404);
    }

    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (principal && principal.eventIds.includes(eventId)) {
      return c.json({ proposal });
    }

    return c.json({ proposal: toPublicProposal(proposal) });
  });

  return app;
}
