import { Hono } from "hono";

import type {
  EventRecord,
  OrganizerPrincipal,
  PublishedCfpForm,
} from "../shared/events";
import { createAuth, resolveProductionPrincipal } from "./auth";
import {
  normalizeProposalInput,
  toPublicProposal,
  validateProposalInput,
} from "./proposals";
import { createSeedCfp } from "./seed-cfp";
import { seedEvents } from "./seed-events";
import { createSeedProposals } from "./seed-proposals";
import type { AppBindings } from "./types";

const MAX_PROPOSAL_BODY_BYTES = 64 * 1_024;

async function readProposalBody(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();

      byteLength += value.byteLength;
      if (byteLength > MAX_PROPOSAL_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

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
  await store.seedPublishedFormIfEmpty(createSeedCfp(seed));
  await store.seedProposalsIfNeeded(createSeedProposals(seed));
  const event = await store.getEvent();
  if (!event) {
    throw new Error(`Event ${seed.id} was not initialized.`);
  }
  return event;
}

async function submissionClientKey(request: Request): Promise<string> {
  const identity = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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
    const store = c.env.EVENT_STORE.getByName(event.id);
    const form = (await store.getPublishedForm()) as PublishedCfpForm | null;
    if (!form) {
      return c.json({ error: "Published CFP not found" }, 404);
    }
    return c.json({
      event: {
        id: event.id,
        name: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
      },
      form,
    });
  });

  app.post("/api/events/:eventId/proposals", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const declaredLength = Number(c.req.header("content-length") ?? "0");
    if (declaredLength > MAX_PROPOSAL_BODY_BYTES) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    const rawBody = await readProposalBody(c.req.raw);
    if (rawBody === null) {
      return c.json({ error: "Proposal request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Proposal request must be valid JSON." }, 400);
    }

    const event = await loadEvent(c.env, seed);
    const values = normalizeProposalInput(body);
    const validation = validateProposalInput(values, event);
    if (validation) {
      return c.json(validation, 400);
    }

    const store = c.env.EVENT_STORE.getByName(event.id);
    const bodyRecord = body as Record<string, unknown>;
    const formId = bodyRecord.formId;
    const formDefinitionVersion = bodyRecord.formDefinitionVersion;
    if (
      typeof formId !== "string" ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion)
    ) {
      return c.json({ error: "A published form version is required." }, 400);
    }

    const form = (await store.getFormVersion(
      formId,
      formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }

    const quota = await store.consumeSubmissionQuota(
      await submissionClientKey(c.req.raw),
      Date.now(),
    );
    if (!quota.allowed) {
      c.header("retry-after", String(quota.retryAfterSeconds));
      return c.json(
        { error: "Too many proposals submitted. Try again later." },
        429,
      );
    }

    const proposal = await store.createProposal(
      values,
      form.id,
      form.definitionVersion,
    );
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

  // Permanent speaker-facing detail: always public-safe fields (never committee data).
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

    return c.json({ proposal: toPublicProposal(proposal) });
  });

  app.get("/api/events/:eventId/organizer/proposals/:proposalId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    if (!principal || !principal.eventIds.includes(eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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

    return c.json({ proposal });
  });

  return app;
}
