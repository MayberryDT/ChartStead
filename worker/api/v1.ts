import { Hono } from "hono";

import type {
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalStatus,
  SessionPlacementPatch,
} from "../../shared/events";
import {
  pullAirtableForEvent,
  resolveAirtableConnection,
  type AirtableClientFactory,
  defaultAirtableClientFactory,
} from "../airtable/sync";
import {
  createApiKey,
  extractBearerToken,
  listApiKeysForEvent,
  parseApiKeyGrantBody,
  resolvePrincipalFromApiKey,
  updateApiKeyGrant,
} from "../api-keys";
import {
  createAiConnection,
  beginAiConnectionAuthorization,
  exchangeAiConnectionCode,
  listAiConnections,
  isRegisteredOAuthRedirect,
  parseAiConnectionInput,
  revokeAiConnection,
  registerOAuthClient,
  refreshAiConnectionToken,
  testAiConnection,
} from "../ai-connections";
import { AI_CONNECTION_PROVIDERS, type AiConnectionProvider } from "../../shared/ai-connections";
import {
  COURSE_CHECK_ACTION_TYPES,
  COURSE_CHECK_API_VERSION,
  COURSE_CHECK_SCOPES,
  expandCourseCheckScopes,
  isAgentOperatingMode,
  isCourseCheckScopeGrant,
  isKnownCourseCheckActionType,
} from "../../shared/agent-api";
import {
  assignedTrackIds,
  canAccessEvent,
  canReviewProposal,
  isEventAdmin,
  scopeEventForPrincipal,
} from "../authz";
import { resolveProductionPrincipal } from "../auth";
import { seedEvents } from "../seed-events";
import type { AppBindings } from "../types";
import { createSeedCfp } from "../seed-cfp";
import { createSeedProposals } from "../seed-proposals";

export type PrincipalResolver = (
  request: Request,
  env: AppBindings,
) => Promise<OrganizerPrincipal | null>;

export interface V1AppOptions {
  resolvePrincipal?: PrincipalResolver;
  airtableClientFactory?: AirtableClientFactory;
  airtableCredentialClientFactory?: import("../airtable/sync").AirtableCredentialClientFactory;
  /** When set, skips D1 API-key lookup and maps bearer tokens via this hook (tests). */
  resolveApiKeyPrincipal?: (
    token: string,
    env: AppBindings,
  ) => Promise<OrganizerPrincipal | null>;
}

function findSeed(eventId: string) {
  return seedEvents.find((event) => event.id === eventId);
}

async function loadEvent(env: AppBindings, seed: (typeof seedEvents)[number]) {
  const store = env.EVENT_STORE.getByName(seed.id);
  await store.seedIfEmpty(seed);
  await store.seedPublishedFormIfEmpty(createSeedCfp(seed));
  await store.seedProposalsIfNeeded(createSeedProposals(seed));
  const event = await store.getEvent();
  if (!event) throw new Error(`Event ${seed.id} failed to load`);
  return event;
}

async function resolveV1Principal(
  request: Request,
  env: AppBindings,
  options: V1AppOptions,
): Promise<OrganizerPrincipal | null> {
  const bearer = extractBearerToken(request);
  if (bearer) {
    if (options.resolveApiKeyPrincipal) {
      return options.resolveApiKeyPrincipal(bearer, env);
    }
    if (env.AUTH_DB) {
      return resolvePrincipalFromApiKey(env.AUTH_DB, bearer);
    }
    return null;
  }

  const resolve = options.resolvePrincipal ?? resolveProductionPrincipal;
  return resolve(request, env);
}

function isSafeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

function isValidPkceChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function canManageCredentials(principal: OrganizerPrincipal | null): boolean {
  return Boolean(principal && !principal.aiAccessProfile);
}

function canApplyOrdinaryWrite(principal: OrganizerPrincipal | null): boolean {
  // Reversible review dispositions and private schedule moves are intentionally ordinary writes;
  // consequential effects still pass through the separately scoped Course Check action routes.
  return Boolean(
    principal &&
      (principal.principalKind !== "agent" || principal.aiAccessProfile === "operate_with_approval"),
  );
}

function canApplyReviewDisposition(principal: OrganizerPrincipal | null): boolean {
  return canApplyOrdinaryWrite(principal) && principal?.aiApprovalPolicy !== "any_change";
}

export function createV1App(options: V1AppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>();
  const airtableFactory =
    options.airtableClientFactory ?? defaultAirtableClientFactory;
  const airtableCredentialFactory = options.airtableCredentialClientFactory;

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      api: COURSE_CHECK_API_VERSION,
      stableIds: true,
      courseCheck: {
        actionTypes: COURSE_CHECK_ACTION_TYPES,
        scopes: COURSE_CHECK_SCOPES,
        agentModes: [
          "propose_only",
          "delegated_execution",
          "autonomous_policy",
        ],
      },
    }),
  );

  /** Reject unknown Course Check action types closed — no heuristic reinterpretation. */
  app.post("/events/:eventId/course-checks/actions", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const body = (await c.req.json().catch(() => null)) as {
      actionType?: unknown;
    } | null;
    if (!isKnownCourseCheckActionType(body?.actionType)) {
      return c.json(
        {
          error: "Unknown Course Check action type.",
          code: "unknown_action_type",
          recoveryGuidance:
            "Use a closed v1 action type: decision, guaranteed_speaker, publication, or communication.",
          knownActionTypes: COURSE_CHECK_ACTION_TYPES,
        },
        400,
      );
    }
    return c.json({
      ok: true,
      actionType: body.actionType,
      message:
        "Action type recognized. Create the plan via the typed Course Check endpoint; apply never invokes a model.",
    });
  });

  app.get("/events", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    if (!principal) return c.json({ error: "Unauthorized" }, 401);

    const visibleSeeds = seedEvents.filter((event) =>
      canAccessEvent(principal, event.id),
    );
    const events = await Promise.all(
      visibleSeeds.map(async (event) =>
        scopeEventForPrincipal(c.env, await loadEvent(c.env, event), principal),
      ),
    );
    return c.json({ events, principal });
  });

  app.get("/events/:eventId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    return c.json({
      event: await scopeEventForPrincipal(
        c.env,
        await loadEvent(c.env, seed),
        principal,
      ),
      principal,
    });
  });

  app.get("/events/:eventId/forms", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const forms = (await c.env.EVENT_STORE.getByName(eventId).listForms()) as OrganizerCfpFormSummary[];
    return c.json({ forms });
  });

  app.get("/events/:eventId/forms/:formId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const form = (await c.env.EVENT_STORE.getByName(eventId).getForm(
      c.req.param("formId"),
    )) as OrganizerCfpForm | null;
    if (!form) return c.json({ error: "Form not found" }, 404);
    return c.json({ form });
  });

  app.get("/events/:eventId/submissions", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const tracks = assignedTrackIds(principal, eventId);
    const proposals = (await c.env.EVENT_STORE.getByName(eventId).listProposals({
      trackIds: tracks ?? undefined,
    })) as OrganizerProposal[];
    return c.json({ submissions: proposals });
  });

  app.get("/events/:eventId/submissions/:submissionId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const proposal = (await c.env.EVENT_STORE.getByName(eventId).getProposal(
      c.req.param("submissionId"),
    )) as OrganizerProposal | null;
    if (!proposal || !canReviewProposal(principal, eventId, proposal)) {
      return c.json({ error: "Submission not found" }, 404);
    }
    return c.json({ submission: proposal });
  });

  app.patch("/events/:eventId/submissions/:submissionId/review", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!canApplyReviewDisposition(principal)) return c.json({ error: "This connection requires approval before applying review changes." }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const submissionId = c.req.param("submissionId");
    const existing = (await store.getProposal(submissionId)) as OrganizerProposal | null;
    if (!existing || !canReviewProposal(principal, eventId, existing)) {
      return c.json({ error: "Submission not found" }, 404);
    }

    const body = (await c.req.json()) as {
      status?: ProposalStatus;
      committeeNote?: string;
      expectedVersion?: number;
    };
    if (
      body.status !== undefined &&
      body.status !== "unreviewed" &&
      body.status !== "approve" &&
      body.status !== "maybe" &&
      body.status !== "deny"
    ) {
      return c.json({ error: "Invalid review status." }, 400);
    }
    if (body.status === undefined && body.committeeNote === undefined) {
      return c.json({ error: "A review change is required" }, 400);
    }

    try {
      const proposal = await store.updateProposalReview({
        proposalId: submissionId,
        status: body.status,
        committeeNote:
          typeof body.committeeNote === "string"
            ? body.committeeNote.trim()
            : undefined,
        expectedVersion: body.expectedVersion ?? existing.reviewVersion,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      if (!proposal) {
        return c.json(
          {
            error:
              "This submission changed since you opened it. Reload and try again.",
          },
          409,
        );
      }
      const auditEvents = await store.listProposalAuditEvents(submissionId);
      return c.json({ submission: proposal, auditEvents });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review failed.";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/events/:eventId/speakers", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const speakers = await c.env.EVENT_STORE.getByName(eventId).listApiSpeakers();
    return c.json({ speakers });
  });

  app.get("/events/:eventId/sessions", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const workspace = await c.env.EVENT_STORE.getByName(eventId).getAgendaWorkspace();
    return c.json(workspace);
  });

  app.patch("/events/:eventId/sessions/:sessionId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canApplyReviewDisposition(principal)) return c.json({ error: "This connection requires approval before applying schedule changes." }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as SessionPlacementPatch | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "JSON body is required." }, 400);
    }
    const result = (await c.env.EVENT_STORE.getByName(eventId).updateSessionPlacement(
      c.req.param("sessionId"),
      body,
    )) as
      | { ok: true; result: unknown }
      | { ok: false; status: 400 | 404; error: string };
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.result);
  });

  app.get("/events/:eventId/tasks", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const tasks = await c.env.EVENT_STORE.getByName(eventId).listApiTasks();
    return c.json({ tasks });
  });

  app.get("/events/:eventId/communications", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const communications = await c.env.EVENT_STORE.getByName(
      eventId,
    ).listApiCommunications();
    return c.json({ communications });
  });

  app.get("/events/:eventId/program", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const program = await c.env.EVENT_STORE.getByName(eventId).getPublicProgram();
    return c.json(program);
  });

  app.get("/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    return c.json({ sync: await store.getAirtableSyncState() });
  });

  app.put("/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage integration credentials." }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      baseId?: unknown;
      accessToken?: unknown;
    } | null;
    if (!body || typeof body.baseId !== "string" || typeof body.accessToken !== "string") {
      return c.json(
        { error: "baseId and accessToken are required strings." },
        400,
      );
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      await store.saveAirtableConnection({
        baseId: body.baseId,
        accessToken: body.accessToken,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unable to save connection." },
        400,
      );
    }
    const connection = await resolveAirtableConnection({
      store,
      env: c.env,
      clientFactory: airtableFactory,
      credentialClientFactory: airtableCredentialFactory,
    });
    const result = await pullAirtableForEvent({
      store,
      client: connection?.client ?? null,
      baseId: connection?.baseId ?? null,
    });
    return c.json({ sync: await store.getAirtableSyncState(), pull: result });
  });

  app.delete("/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage integration credentials." }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const sync = await c.env.EVENT_STORE.getByName(eventId).clearAirtableConnection();
    return c.json({ sync });
  });

  app.post("/events/:eventId/integrations/airtable/pull", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot run integration credential operations." }, 403);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const connection = await resolveAirtableConnection({
      store,
      env: c.env,
      clientFactory: airtableFactory,
      credentialClientFactory: airtableCredentialFactory,
    });
    const result = await pullAirtableForEvent({
      store,
      client: connection?.client ?? null,
      baseId: connection?.baseId ?? null,
    });
    return c.json({ pull: result, sync: await store.getAirtableSyncState() });
  });

  app.get("/events/:eventId/ai-connections", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage other connections." }, 403);
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    return c.json({ connections: await listAiConnections(c.env.AUTH_DB, eventId) });
  });

  app.post("/events/:eventId/ai-connections", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot create other connections." }, 403);
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const input = parseAiConnectionInput(await c.req.json().catch(() => ({})));
    if (!input) return c.json({ error: "Choose a supported provider and access profile." }, 400);
    const connection = await createAiConnection({
      db: c.env.AUTH_DB,
      eventId,
      owner: principal,
      ...input,
      origin: new URL(c.req.url).origin,
    });
    return c.json({ connection }, 201);
  });

  app.post("/ai-connections/token", async (c) => {
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const contentType = c.req.header("content-type") ?? "";
    const body = contentType.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(await c.req.text()).entries())
      : await c.req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.grant_type === "refresh_token") {
      if (typeof body.refresh_token !== "string" || typeof body.resource !== "string") {
        return c.json({ error: "refresh_token and resource are required." }, 400);
      }
      const refreshed = await refreshAiConnectionToken({ db: c.env.AUTH_DB, refreshToken: body.refresh_token, resource: body.resource });
      if (!refreshed) return c.json({ error: "Refresh token is invalid or the connection was revoked." }, 400);
      return c.json({ access_token: refreshed.accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshed.refreshToken });
    }
    if (
      typeof body.code !== "string" ||
      typeof (body.codeVerifier ?? body.code_verifier) !== "string" ||
      typeof (body.clientId ?? body.client_id) !== "string" ||
      typeof (body.redirectUri ?? body.redirect_uri) !== "string" ||
      typeof body.resource !== "string"
    ) {
      return c.json({ error: "Invalid authorization exchange." }, 400);
    }
    const exchanged = await exchangeAiConnectionCode({
      db: c.env.AUTH_DB,
      code: body.code,
      provider: AI_CONNECTION_PROVIDERS.includes(body.provider as AiConnectionProvider) ? body.provider as AiConnectionProvider : undefined,
      codeVerifier: String(body.codeVerifier ?? body.code_verifier),
      clientId: String(body.clientId ?? body.client_id),
      redirectUri: String(body.redirectUri ?? body.redirect_uri),
      resource: body.resource,
    });
    if (!exchanged) return c.json({ error: "Authorization code is invalid or already used." }, 400);
    return c.json({ access_token: exchanged.accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: exchanged.refreshToken, accessToken: exchanged.accessToken, tokenType: "Bearer" });
  });

  app.post("/ai-connections/register", async (c) => {
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const body = await c.req.json().catch(() => ({})) as { client_name?: unknown; redirect_uris?: unknown };
    if (typeof body.client_name === "string" && body.client_name.length > 120) {
      return c.json({ error: "client_name must be 120 characters or fewer." }, 400);
    }
    if (Array.isArray(body.redirect_uris) && body.redirect_uris.length > 10) {
      return c.json({ error: "No more than 10 redirect URIs may be registered." }, 400);
    }
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((value): value is string => typeof value === "string" && value.length <= 2048 && isSafeRedirectUri(value))
      : [];
    if (redirectUris.length === 0) return c.json({ error: "At least one HTTPS or localhost redirect URI is required." }, 400);
    const registered = await registerOAuthClient({
      db: c.env.AUTH_DB,
      clientName: typeof body.client_name === "string" ? body.client_name : "AI assistant",
      redirectUris,
    }).catch(() => null);
    if (!registered) return c.json({ error: "OAuth client registration is temporarily at capacity." }, 429);
    return c.json({
      client_id: registered.clientId,
      client_name: registered.clientName,
      redirect_uris: registered.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }, 201);
  });

  app.get("/ai-connections/setup", (c) => {
    const origin = new URL(c.req.url).origin;
    const connectionId = c.req.query("connectionId") ?? "";
    return c.html(`<!doctype html><html><head><meta charset="utf-8"><title>Connect ChartStead</title></head><body><main><h1>Connect ChartStead from your assistant</h1><p>In your assistant's connector settings, add this server URL:</p><p><code>${origin}/mcp?connection_id=${encodeURIComponent(connectionId)}</code></p><p>The assistant will return to ChartStead to authorize the conference and access profile you already selected. No API key is copied.</p></main></body></html>`);
  });

  app.get("/ai-connections/authorize", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    if (!principal || principal.principalKind === "agent") return c.json({ error: "Sign in as an organizer to authorize this connection." }, 401);
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const query = c.req.query();
    const redirectUri = query.redirect_uri;
    const clientId = query.client_id;
    const resource = query.resource;
    const challenge = query.code_challenge;
    if (
      query.response_type !== "code" || query.code_challenge_method !== "S256" ||
      !redirectUri || !clientId || !resource || !resource.startsWith(`${new URL(c.req.url).origin}/mcp?`) ||
      !challenge || !isValidPkceChallenge(challenge) || !isSafeRedirectUri(redirectUri) ||
      !await isRegisteredOAuthRedirect(c.env.AUTH_DB, clientId, redirectUri)
    ) return c.json({ error: "Invalid OAuth authorization request." }, 400);
    const connectionId = new URL(resource).searchParams.get("connection_id");
    if (!connectionId) return c.json({ error: "The MCP server URL is missing its connection identifier." }, 400);
    const authorized = await beginAiConnectionAuthorization({
      db: c.env.AUTH_DB, owner: principal, connectionId, clientId, redirectUri, resource,
      codeChallenge: challenge, origin: new URL(c.req.url).origin,
    }).catch(() => null);
    if (!authorized) return c.json({ error: "This connection handoff is no longer available." }, 400);
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", authorized.code);
    if (query.state) redirect.searchParams.set("state", query.state);
    return c.redirect(redirect.toString(), 302);
  });

  app.post("/events/:eventId/ai-connections/:connectionId/test", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage connection verification." }, 403);
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const proposals = await c.env.EVENT_STORE.getByName(eventId).listProposals();
    const acceptedSpeakersMissingBiography = proposals.filter(
      (proposal) => proposal.programOutcome === "accepted" && !proposal.biography?.trim(),
    ).length;
    const connection = await testAiConnection({ db: c.env.AUTH_DB, eventId, connectionId: c.req.param("connectionId") });
    if (!connection) return c.json({ error: "Complete the assistant sign-in before testing this connection." }, 409);
    return c.json({ connection, test: { acceptedSpeakersMissingBiography, changedRecords: 0 } });
  });

  app.delete("/events/:eventId/ai-connections/:connectionId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) return c.json({ error: "Administrator access required" }, 403);
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage other connections." }, 403);
    if (!c.env.AUTH_DB) return c.json({ error: "AI connections require AUTH_DB." }, 503);
    const revoked = await revokeAiConnection({ db: c.env.AUTH_DB, eventId, connectionId: c.req.param("connectionId") });
    if (!revoked) return c.json({ error: "Connection not found" }, 404);
    return c.json({ revoked: true });
  });

  app.get("/events/:eventId/api-keys", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!c.env.AUTH_DB) {
      return c.json({ error: "API keys require AUTH_DB." }, 503);
    }
    const includeRevoked = c.req.query("includeRevoked") === "1";
    const apiKeys = await listApiKeysForEvent({
      db: c.env.AUTH_DB,
      eventId,
      includeRevoked,
    });
    return c.json({ apiKeys });
  });

  app.post("/events/:eventId/api-keys", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot create credentials." }, 403);
    if (!c.env.AUTH_DB) {
      return c.json({ error: "API keys require AUTH_DB." }, 503);
    }
    const rawBody = await c.req.json().catch(() => ({}));
    const grant = parseApiKeyGrantBody(rawBody);
    const scoped: OrganizerPrincipal = {
      ...principal,
      eventIds: principal.eventIds.includes(eventId)
        ? principal.eventIds
        : [...principal.eventIds, eventId],
      rolesByEvent: {
        ...(principal.rolesByEvent ?? {}),
        [eventId]: "admin",
      },
    };
    const created = await createApiKey({
      db: c.env.AUTH_DB,
      name: grant.name || `Event ${eventId}`,
      principal: scoped,
      principalKind: grant.principalKind,
      agentMode: grant.agentMode,
      courseCheckScopes: grant.courseCheckScopes,
      eventId,
    });
    return c.json(
      {
        apiKey: {
          id: created.id,
          name: created.name,
          token: created.token,
          createdAt: created.createdAt,
          principalKind: created.principalKind,
          agentMode: created.agentMode,
          /** Expanded individual scopes (never bare `all`). */
          courseCheckScopes: created.courseCheckScopes,
          courseCheckScopesByEvent: created.courseCheckScopesByEvent,
        },
      },
      201,
    );
  });

  /** Update agent mode/scopes or revoke — takes effect before next stage execution. */
  app.patch("/events/:eventId/api-keys/:keyId", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    const keyId = c.req.param("keyId");
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    if (!canManageCredentials(principal)) return c.json({ error: "AI connections cannot manage credentials." }, 403);
    if (!c.env.AUTH_DB) {
      return c.json({ error: "API keys require AUTH_DB." }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      agentMode?: unknown;
      courseCheckScopes?: unknown;
      revoke?: unknown;
    };
    const scopes =
      body.courseCheckScopes === "all"
        ? (["all"] as const)
        : Array.isArray(body.courseCheckScopes)
          ? body.courseCheckScopes.filter(isCourseCheckScopeGrant)
          : undefined;
    const updated = await updateApiKeyGrant({
      db: c.env.AUTH_DB,
      keyId,
      eventId,
      agentMode: isAgentOperatingMode(body.agentMode) ? body.agentMode : undefined,
      courseCheckScopes: scopes ? [...scopes] : undefined,
      revoke: body.revoke === true,
    });
    if (!updated) return c.json({ error: "API key not found" }, 404);
    return c.json({
      apiKey: {
        id: updated.id,
        revoked: updated.revoked,
        agentMode: updated.agentMode,
        courseCheckScopes: updated.courseCheckScopes,
        expandedFromAll:
          Array.isArray(body.courseCheckScopes) &&
          body.courseCheckScopes.includes("all")
            ? expandCourseCheckScopes(["all"])
            : body.courseCheckScopes === "all"
              ? expandCourseCheckScopes(["all"])
              : undefined,
      },
    });
  });

  return app;
}
