import { Hono } from "hono";

import {
  canonicalizeCfpDefinition,
  createDefaultCfpDefinition,
  type CfpDefinitionV1,
} from "../shared/cfp-definition";
import type {
  EventRecord,
  OnboardingCompletionRequirement,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalStatus,
  PublishedCfpForm,
  ReviewerAssignment,
  SessionPlacementPatch,
} from "../shared/events";
import { createAuth, resolveProductionPrincipal } from "./auth";
import {
  createResendSender,
  renderSubmissionConfirmationEmail,
  type EmailSender,
} from "./email";
import { deliverOutboxMessage } from "./outbox";
import {
  resolveFileQuestion,
  validateAndNormalizeSubmission,
} from "./cfp-submissions";
import { toPublicProposal, toSubmitterProposal } from "./proposals";
import type {
  AssetUploadStartRequest,
  SubmissionAnswers,
} from "../shared/events";
import {
  ASSET_PURGE_AFTER_MS,
  DraftConflictError,
  HEADSHOT_MAX_BYTES,
  HEADSHOT_MIME_TYPES,
  TASK_FILE_MAX_BYTES,
} from "./event-store";
import { createSeedCfp } from "./seed-cfp";
import { seedEvents } from "./seed-events";
import { createSeedProposals } from "./seed-proposals";
import {
  createTokenId,
  signEditToken,
  signPortalToken,
  verifyEditToken,
  verifyPortalToken,
  type SignedEditTokenPayload,
  type SignedPortalTokenPayload,
} from "./signed-links";
import type { AppBindings } from "./types";
import {
  assignedTrackIds,
  canAccessEvent,
  canReviewProposal,
  eventRole,
  isEventAdmin,
  scopeEventForPrincipal,
} from "./authz";
import { createV1App, type V1AppOptions } from "./api/v1";
import {
  defaultAirtableClientFactory,
  pullAirtableForEvent,
  resolveAirtableConnection,
  type AirtableClientFactory,
  type AirtableCredentialClientFactory,
} from "./airtable/sync";


const MAX_PROPOSAL_BODY_BYTES = 64 * 1_024;
const EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const PORTAL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const DEFAULT_FILE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILE_NAME_LENGTH = 120;
const INVALID_EDIT_LINK_ERROR = {
  error: "This edit link is invalid or has expired.",
} as const;
const INVALID_PORTAL_LINK_ERROR = {
  error: "This portal link is invalid or has expired.",
} as const;

function deriveEventTrackChoices(
  definition: CfpDefinitionV1,
  tracks: EventRecord["tracks"],
): CfpDefinitionV1 {
  const trackQuestion = definition.runtime.survey.elements.find(
    (element) => element.name === definition.chartstead.trackQuestionName,
  );
  if (trackQuestion?.type === "dropdown") {
    trackQuestion.choices = tracks.map((track) => ({
      value: track.id,
      text: track.name,
    }));
  }
  return definition;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function isDraftConflict(error: unknown): boolean {
  if (error instanceof DraftConflictError) return true;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "draft_conflict"
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    error.message.includes("Draft changed since you last loaded it")
  );
}

async function purgeStaleAssets(
  store: {
    listPurgeableAssets(
      olderThanIso: string,
      limit?: number,
    ): Promise<Array<{ asset_id: string; object_key: string }>> | Array<{
      asset_id: string;
      object_key: string;
    }>;
    deleteAssetRecord(
      assetId: string,
    ): Promise<unknown> | unknown;
  },
  bucket: R2Bucket | undefined,
  now = Date.now(),
): Promise<void> {
  if (!bucket) return;
  const olderThan = new Date(now - ASSET_PURGE_AFTER_MS).toISOString();
  const purgeable = await store.listPurgeableAssets(olderThan, 25);
  for (const asset of purgeable) {
    try {
      await bucket.delete(asset.object_key);
    } catch {
      // best-effort R2 delete; still drop the DB row so we do not retry forever
    }
    await store.deleteAssetRecord(asset.asset_id);
  }
}

/** Basename-only safe key segment; never trust client fileName for path structure. */
export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const stripped = base.replace(/\0/g, "").replace(/\.\./g, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const cleaned = safe.slice(0, MAX_UPLOAD_FILE_NAME_LENGTH).replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned : "file";
}

type EditTokenRow = {
  tokenId: string;
  proposalId: string;
  expiresAt: string;
  revokedAt: string | null;
};

type EditTokenLookup = {
  getEditToken: (tokenId: string) => Promise<EditTokenRow | null>;
};

type PortalTokenRow = {
  tokenId: string;
  speakerId: string;
  expiresAt: string;
  revokedAt: string | null;
};

type PortalTokenLookup = {
  getPortalToken: (tokenId: string) => Promise<PortalTokenRow | null>;
};

async function authorizeSubmitterEdit(input: {
  secret: string | null;
  token: string;
  eventId: string;
  expectedProposalId?: string;
  store: EditTokenLookup;
  nowMs?: number;
}): Promise<{ payload: SignedEditTokenPayload; tokenRow: EditTokenRow } | null> {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.secret || !input.token) return null;

  const payload = await verifyEditToken(input.secret, input.token, nowMs);
  if (!payload || payload.eventId !== input.eventId) return null;
  if (
    input.expectedProposalId !== undefined &&
    payload.proposalId !== input.expectedProposalId
  ) {
    return null;
  }

  const tokenRow = await input.store.getEditToken(payload.tokenId);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    tokenRow.proposalId !== payload.proposalId ||
    Date.parse(tokenRow.expiresAt) <= nowMs
  ) {
    return null;
  }

  return { payload, tokenRow };
}

async function authorizeSpeakerPortal(input: {
  secret: string | null;
  token: string;
  eventId: string;
  store: PortalTokenLookup;
  nowMs?: number;
}): Promise<{ payload: SignedPortalTokenPayload; tokenRow: PortalTokenRow } | null> {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.secret || !input.token) return null;

  const payload = await verifyPortalToken(input.secret, input.token, nowMs);
  if (!payload || payload.eventId !== input.eventId) return null;

  const tokenRow = await input.store.getPortalToken(payload.tokenId);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    tokenRow.speakerId !== payload.speakerId ||
    Date.parse(tokenRow.expiresAt) <= nowMs
  ) {
    return null;
  }

  return { payload, tokenRow };
}

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
  emailSender?: EmailSender | null;
  signingSecret?: string;
  airtableClientFactory?: AirtableClientFactory;
  airtableCredentialClientFactory?: AirtableCredentialClientFactory;
  resolveApiKeyPrincipal?: V1AppOptions["resolveApiKeyPrincipal"];
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

function publicBaseUrl(request: Request, env: AppBindings): string {
  return env.BETTER_AUTH_URL || new URL(request.url).origin;
}

function signingSecret(env: AppBindings, override?: string): string | null {
  if (override !== undefined) {
    return override.length > 0 ? override : null;
  }
  return env.BETTER_AUTH_SECRET || null;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>();
  const resolvePrincipal =
    options.resolvePrincipal ?? resolveProductionPrincipal;
  const airtableFactory =
    options.airtableClientFactory ?? defaultAirtableClientFactory;
  const airtableCredentialFactory = options.airtableCredentialClientFactory;

  app.route(
    "/api/v1",
    createV1App({
      resolvePrincipal,
      airtableClientFactory: airtableFactory,
      airtableCredentialClientFactory: airtableCredentialFactory,
      resolveApiKeyPrincipal: options.resolveApiKeyPrincipal,
    }),
  );

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
      canAccessEvent(principal, event.id),
    );
    const events = await Promise.all(
      visibleSeeds.map(async (event) =>
        scopeEventForPrincipal(c.env, await loadEvent(c.env, event), principal),
      ),
    );
    return c.json({ events, principal });
  });

  app.get("/api/events/:eventId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({
      event: await scopeEventForPrincipal(
        c.env,
        await loadEvent(c.env, seed),
        principal,
      ),
      principal,
    });
  });

  app.get("/api/events/:eventId/cfp", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(event.id);
    const formId = c.req.query("formId") ?? undefined;
    const publicEvent = {
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      themeAccent: event.themeAccent,
    };

    if (formId) {
      const meta = (await store.getForm(formId)) as OrganizerCfpForm | null;
      if (meta?.lifecycleStatus === "closed" && meta.publishedVersion != null) {
        return c.json(
          {
            error: "This call for proposals is closed to new submissions.",
            status: "closed",
            event: publicEvent,
            formId: meta.id,
            formName: meta.name,
            publishedVersion: meta.publishedVersion,
          },
          410,
        );
      }
    } else {
      const closedDefault = (await store.listForms()) as OrganizerCfpFormSummary[];
      const closedMain =
        closedDefault.find(
          (form) =>
            form.lifecycleStatus === "closed" &&
            form.publishedVersion != null &&
            form.id === "main-cfp",
        ) ??
        closedDefault.find(
          (form) =>
            form.lifecycleStatus === "closed" && form.publishedVersion != null,
        );
      const openForm = (await store.getPublishedForm()) as PublishedCfpForm | null;
      if (!openForm && closedMain) {
        return c.json(
          {
            error: "This call for proposals is closed to new submissions.",
            status: "closed",
            event: publicEvent,
            formId: closedMain.id,
            formName: closedMain.name,
            publishedVersion: closedMain.publishedVersion,
          },
          410,
        );
      }
    }

    const form = (await store.getPublishedForm(formId)) as PublishedCfpForm | null;
    if (!form) {
      return c.json({ error: "Published CFP not found" }, 404);
    }
    return c.json({
      event: publicEvent,
      form,
    });
  });

  app.get("/api/events/:eventId/forms", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const store = c.env.EVENT_STORE.getByName(eventId);
    return c.json({ forms: await store.listForms() });
  });

  app.post("/api/events/:eventId/forms", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Untitled CFP";
    const draft = createDefaultCfpDefinition({
      definitionId: "pending",
      eventId,
      trackChoices: event.tracks.map((track) => ({
        value: track.id,
        text: track.name,
      })),
    });
    const store = c.env.EVENT_STORE.getByName(eventId);
    const form = await store.createForm(name, draft);
    return c.json({ form }, 201);
  });

  app.get("/api/events/:eventId/forms/:formId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const form = await store.getForm(formId);
    if (!form) return c.json({ error: "Form not found" }, 404);
    const event = await store.getEvent();
    return c.json({
      form,
      event: event
        ? {
            id: event.id,
            name: event.name,
            startsOn: event.startsOn,
            endsOn: event.endsOn,
            themeAccent: event.themeAccent,
          }
        : {
            id: seed.id,
            name: seed.name,
            startsOn: seed.startsOn,
            endsOn: seed.endsOn,
            themeAccent: seed.themeAccent,
          },
    });
  });

  app.put("/api/events/:eventId/forms/:formId/draft", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      name?: string;
      draft?: unknown;
      expectedDraftUpdatedAt?: string;
    } | null;
    if (!body?.draft) {
      return c.json({ error: "Draft definition is required." }, 400);
    }
    const draftRecord =
      body.draft && typeof body.draft === "object"
        ? (body.draft as Record<string, unknown>)
        : null;
    if (draftRecord?.eventId && draftRecord.eventId !== eventId) {
      return c.json({ error: "Draft event id does not match this event." }, 400);
    }
    if (draftRecord?.definitionId && draftRecord.definitionId !== formId) {
      return c.json({ error: "Draft definition id does not match this form." }, 400);
    }
    const canonical = canonicalizeCfpDefinition({
      ...(draftRecord ?? {}),
      definitionId: formId,
      eventId,
      status: "draft",
    });
    if ("errors" in canonical) {
      return c.json(
        { error: canonical.errors[0], errors: canonical.errors },
        400,
      );
    }
    const draft = deriveEventTrackChoices(canonical, event.tracks);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.saveFormDraft(formId, {
        name: body.name,
        draft,
        expectedDraftUpdatedAt: body.expectedDraftUpdatedAt,
      });
      return c.json({ form });
    } catch (error) {
      if (error instanceof DraftConflictError || isDraftConflict(error)) {
        return c.json({ error: errorMessage(error) }, 409);
      }
      return c.json({ error: "Form not found" }, 404);
    }
  });

  app.post("/api/events/:eventId/forms/:formId/publish", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const existing = (await store.getForm(formId)) as OrganizerCfpForm | null;
    if (!existing) return c.json({ error: "Form not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      name?: string;
      draft?: unknown;
      expectedDraftUpdatedAt?: string;
    } | null;
    const sourceDraft =
      body?.draft && typeof body.draft === "object"
        ? (body.draft as Record<string, unknown>)
        : (existing.draft as unknown as Record<string, unknown>);
    const canonical = canonicalizeCfpDefinition({
      ...sourceDraft,
      definitionId: formId,
      eventId,
      status: "draft",
    });
    if ("errors" in canonical) {
      return c.json(
        { error: canonical.errors[0], errors: canonical.errors },
        400,
      );
    }
    try {
      const form = await store.publishForm(
        formId,
        deriveEventTrackChoices(canonical, event.tracks),
        {
          name: body?.name,
          expectedDraftUpdatedAt: body?.expectedDraftUpdatedAt,
        },
      );
      return c.json({ form });
    } catch (error) {
      if (error instanceof DraftConflictError || isDraftConflict(error)) {
        return c.json({ error: errorMessage(error) }, 409);
      }
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to publish form.",
        },
        400,
      );
    }
  });

  app.post("/api/events/:eventId/forms/:formId/close", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.closeForm(formId);
      return c.json({ form });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to close form.",
        },
        400,
      );
    }
  });

  app.post("/api/events/:eventId/forms/:formId/reopen", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const formId = c.req.param("formId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      const form = await store.reopenForm(formId);
      return c.json({ form });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to reopen form.",
        },
        400,
      );
    }
  });

  app.get("/api/events/:eventId/reviewers", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);

    const rows = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email, r.track_id
       FROM event_memberships AS m
       JOIN "user" AS u ON u.id = m.user_id
       LEFT JOIN reviewer_track_assignments AS r
         ON r.event_id = m.event_id AND r.user_id = m.user_id
       WHERE m.event_id = ? AND m.role = 'reviewer'
       ORDER BY u.name COLLATE NOCASE, u.id, r.track_id`,
    )
      .bind(eventId)
      .all<{ id: string; name: string; email: string; track_id: string | null }>();
    const reviewers = new Map<string, ReviewerAssignment>();
    for (const row of rows.results) {
      const reviewer = reviewers.get(row.id) ?? {
        id: row.id,
        name: row.name,
        email: row.email,
        trackIds: [],
      };
      if (row.track_id) reviewer.trackIds.push(row.track_id);
      reviewers.set(row.id, reviewer);
    }
    return c.json({ reviewers: [...reviewers.values()] });
  });

  app.post("/api/events/:eventId/reviewers", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      trackIds?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const trackIds = Array.isArray(body?.trackIds)
      ? [...new Set(body.trackIds.filter((trackId): trackId is string => typeof trackId === "string"))]
      : [];
    if (!email || trackIds.length === 0) {
      return c.json({ error: "Choose a reviewer and at least one track" }, 400);
    }
    if (trackIds.some((trackId) => !seed.tracks.some((track) => track.id === trackId))) {
      return c.json({ error: "One or more tracks do not belong to this event" }, 400);
    }

    const user = await c.env.AUTH_DB.prepare(
      `SELECT id, name, email FROM "user" WHERE lower(email) = ? LIMIT 1`,
    )
      .bind(email)
      .first<{ id: string; name: string; email: string }>();
    if (!user) {
      return c.json(
        { error: "That person must sign in to ChartStead before they can be assigned" },
        404,
      );
    }
    const membership = await c.env.AUTH_DB.prepare(
      `SELECT role FROM event_memberships WHERE event_id = ? AND user_id = ? LIMIT 1`,
    )
      .bind(eventId, user.id)
      .first<{ role: "admin" | "reviewer" }>();
    if (membership?.role === "admin") {
      return c.json({ error: "Event administrators already have access to every track" }, 409);
    }

    const existingAssignments = await c.env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ?
       ORDER BY track_id`,
    )
      .bind(eventId, user.id)
      .all<{ track_id: string }>();
    const grantedTrackIds = [
      ...new Set([
        ...existingAssignments.results.map((row) => row.track_id),
        ...trackIds,
      ]),
    ];

    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role)
         VALUES (?, ?, 'reviewer')
         ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'reviewer'`,
      ).bind(eventId, user.id),
      ...trackIds.map((trackId) =>
        c.env.AUTH_DB.prepare(
          `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
           VALUES (?, ?, ?)
           ON CONFLICT(event_id, user_id, track_id) DO NOTHING`,
        ).bind(eventId, user.id, trackId),
      ),
    ]);

    return c.json({
      reviewer: {
        id: user.id,
        name: user.name,
        email: user.email,
        trackIds: grantedTrackIds,
      } satisfies ReviewerAssignment,
    });
  });

  app.delete("/api/events/:eventId/reviewers/:reviewerId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const reviewerId = c.req.param("reviewerId");
    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `DELETE FROM reviewer_track_assignments WHERE event_id = ? AND user_id = ?`,
      ).bind(eventId, reviewerId),
      c.env.AUTH_DB.prepare(
        `DELETE FROM event_memberships
         WHERE event_id = ? AND user_id = ? AND role = 'reviewer'`,
      ).bind(eventId, reviewerId),
    ]);
    return c.json({ ok: true });
  });

  app.patch("/api/events/:eventId/reviewers/:reviewerId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { trackIds?: unknown } | null;
    const trackIds = Array.isArray(body?.trackIds)
      ? [...new Set(body.trackIds.filter((trackId): trackId is string => typeof trackId === "string"))]
      : [];
    if (trackIds.length === 0) {
      return c.json({ error: "Choose at least one track" }, 400);
    }
    if (trackIds.some((trackId) => !seed.tracks.some((track) => track.id === trackId))) {
      return c.json({ error: "One or more tracks do not belong to this event" }, 400);
    }

    const reviewerId = c.req.param("reviewerId");
    const reviewer = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email
       FROM event_memberships m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.event_id = ? AND m.user_id = ? AND m.role = 'reviewer'
       LIMIT 1`,
    )
      .bind(eventId, reviewerId)
      .first<{ id: string; name: string; email: string }>();
    if (!reviewer) return c.json({ error: "Reviewer not found" }, 404);

    await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare(
        `DELETE FROM reviewer_track_assignments WHERE event_id = ? AND user_id = ?`,
      ).bind(eventId, reviewerId),
      ...trackIds.map((trackId) =>
        c.env.AUTH_DB.prepare(
          `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
           VALUES (?, ?, ?)`,
        ).bind(eventId, reviewerId, trackId),
      ),
    ]);

    return c.json({
      reviewer: { ...reviewer, trackIds } satisfies ReviewerAssignment,
    });
  });

  app.post("/api/events/:eventId/uploads", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }

    const storeForPurge = c.env.EVENT_STORE.getByName(eventId);
    void purgeStaleAssets(storeForPurge, c.env.ASSETS);

    const body = (await c.req.json().catch(() => null)) as
      | Partial<AssetUploadStartRequest>
      | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Upload request must be valid JSON." }, 400);
    }

    const formId = typeof body.formId === "string" ? body.formId.trim() : "";
    const formDefinitionVersion = body.formDefinitionVersion;
    const questionName =
      typeof body.questionName === "string" ? body.questionName.trim() : "";
    const rawFileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "";
    const fileName = rawFileName ? sanitizeUploadFileName(rawFileName) : "";
    const mime =
      typeof body.mime === "string" && body.mime.trim()
        ? body.mime.trim()
        : "";
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
        ? body.sizeBytes
        : Number.NaN;

    if (
      !formId ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion) ||
      !questionName ||
      !fileName ||
      !mime ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      return c.json({ error: "A valid upload start request is required." }, 400);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    if (!(await store.isFormOpenForSubmission(formId))) {
      return c.json({ error: "This call for proposals is closed." }, 409);
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

    const question = resolveFileQuestion(form.definition, questionName);
    if (!question) {
      return c.json({ error: "That question does not accept file uploads." }, 400);
    }

    const maxBytes = question.maxFileBytes ?? DEFAULT_FILE_MAX_BYTES;
    const acceptMimeTypes = question.acceptMimeTypes ?? [];
    if (sizeBytes > maxBytes) {
      return c.json(
        {
          error: `Files must be ${maxBytes} bytes or smaller.`,
        },
        400,
      );
    }
    if (acceptMimeTypes.length > 0 && !acceptMimeTypes.includes(mime)) {
      return c.json({ error: "That file type is not allowed." }, 400);
    }

    const quota = await store.consumeUploadStartQuota(
      await submissionClientKey(c.req.raw),
      Date.now(),
    );
    if (!quota.allowed) {
      c.header("retry-after", String(quota.retryAfterSeconds));
      return c.json(
        { error: "Too many uploads started. Try again later." },
        429,
      );
    }

    const assetId = createTokenId();
    const objectKey = `${eventId}/${assetId}/${fileName}`;
    await store.createAsset({
      assetId,
      objectKey,
      fileName,
      mime,
      sizeBytes,
      formId,
      formDefinitionVersion,
      questionName,
      maxBytes,
    });

    return c.json({
      upload: {
        assetId,
        objectKey,
        uploadUrl: `/api/events/${eventId}/uploads/${assetId}`,
        maxBytes,
        acceptMimeTypes,
      },
    });
  });

  app.delete("/api/events/:eventId/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const abandoned = await store.abandonUnclaimedAsset(assetId);
    if (!abandoned) {
      return c.json({ error: "Upload not found or already attached." }, 404);
    }
    if (c.env.ASSETS) {
      try {
        await c.env.ASSETS.delete(abandoned.object_key);
      } catch {
        // best-effort
      }
    }
    await store.deleteAssetRecord(assetId);
    return c.json({ ok: true });
  });

  app.put("/api/events/:eventId/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const asset = await store.getAsset(assetId);
    if (!asset) return c.json({ error: "Upload session not found." }, 404);

    if (
      asset.claimed_proposal_id ||
      (asset.status !== "pending" && asset.status !== "failed")
    ) {
      return c.json({ error: "This upload can no longer be replaced." }, 400);
    }

    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
      return c.json({ error: "Content-Length is required." }, 400);
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return c.json({ error: "Content-Length is invalid." }, 400);
    }
    if (contentLength !== Number(asset.size_bytes)) {
      return c.json(
        { error: "Upload size must match the declared file size." },
        400,
      );
    }
    if (contentLength > Number(asset.max_bytes)) {
      return c.json(
        {
          error: `Files must be ${Number(asset.max_bytes)} bytes or smaller.`,
        },
        400,
      );
    }

    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (contentType !== asset.mime) {
      return c.json({ error: "Content-Type must match the declared file type." }, 400);
    }

    if (!c.req.raw.body) {
      return c.json({ error: "Upload body is required." }, 400);
    }

    try {
      const stored = await c.env.ASSETS.put(asset.object_key, c.req.raw.body, {
        httpMetadata: { contentType: asset.mime },
        customMetadata: {
          assetId,
          eventId,
          fileName: asset.file_name,
        },
      });
      if (!stored || stored.size !== Number(asset.size_bytes)) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort cleanup
        }
        await store.failAsset(assetId);
        return c.json(
          { error: "Upload size did not match the declared file size." },
          400,
        );
      }

      const completed = await store.completeAsset({
        assetId,
        sizeBytes: stored.size,
        mime: asset.mime,
        fileName: asset.file_name,
      });
      if (!completed) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort cleanup of the object just written
        }
        return c.json(
          { error: "This upload can no longer be replaced." },
          409,
        );
      }
      return c.json({ asset: completed });
    } catch {
      await store.failAsset(assetId);
      return c.json(
        { error: "Upload failed. You can retry without restarting the form." },
        502,
      );
    }
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

    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const formId = bodyRecord.formId;
    const formDefinitionVersion = bodyRecord.formDefinitionVersion;
    const answersRaw = bodyRecord.answers;
    if (
      typeof formId !== "string" ||
      typeof formDefinitionVersion !== "number" ||
      !Number.isInteger(formDefinitionVersion)
    ) {
      return c.json({ error: "A published form version is required." }, 400);
    }
    if (
      !answersRaw ||
      typeof answersRaw !== "object" ||
      Array.isArray(answersRaw)
    ) {
      return c.json({ error: "Submission answers are required." }, 400);
    }
    const answers = answersRaw as SubmissionAnswers;

    const event = await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(event.id);

    const formMeta = (await store.getForm(String(formId))) as OrganizerCfpForm | null;
    if (formMeta && formMeta.lifecycleStatus === "closed") {
      return c.json({ error: "This call for proposals is closed." }, 409);
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

    if (!(await store.isFormOpenForSubmission(formId))) {
      return c.json({ error: "This call for proposals is closed." }, 409);
    }

    const validated = validateAndNormalizeSubmission(
      form.definition,
      answers,
      event,
    );
    if (!validated.normalized || Object.keys(validated.errors).length > 0) {
      return c.json(
        { errors: validated.errors, values: validated.answers },
        400,
      );
    }

    const secret = signingSecret(c.env, options.signingSecret);
    if (!secret) {
      return c.json(
        {
          error:
            "Proposal editing is temporarily unavailable. Try again later.",
        },
        503,
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

    const created = await store.createProposal({
      formId: form.id,
      formDefinitionVersion: form.definitionVersion,
      answers: validated.answers,
      normalized: validated.normalized,
      assetClaims: validated.assetClaims,
    });
    if (!created.ok) {
      return c.json(
        { errors: created.errors, values: validated.answers },
        400,
      );
    }
    const proposal = created.proposal;

    const tokenId = createTokenId();
    const exp = Math.floor(Date.now() / 1000) + EDIT_TOKEN_TTL_SECONDS;
    await store.createEditToken({
      tokenId,
      proposalId: proposal.id,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
    const token = await signEditToken(secret, {
      v: 1,
      eventId: event.id,
      proposalId: proposal.id,
      tokenId,
      exp,
    });
    const editUrl = `${publicBaseUrl(c.req.raw, c.env)}/e/${event.id}/edit/${token}`;

    const email = await renderSubmissionConfirmationEmail({
      eventName: event.name,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      speakerName: proposal.speakerName,
      editUrl,
    });
    email.to = proposal.speakerEmail;

    const outboxId = `outbox-${proposal.id}`;
    await store.queueOutboxMessage({
      id: outboxId,
      kind: "submission_confirmation",
      toEmail: proposal.speakerEmail,
      subject: email.subject,
      htmlBody: email.html,
      textBody: email.text,
      proposalId: proposal.id,
    });

    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    if (sender) {
      await deliverOutboxMessage({
        store,
        sender,
        messageId: outboxId,
        now: new Date(),
      });
    }

    const fresh = await store.getProposal(proposal.id);
    return c.json(
      {
        proposal: toPublicProposal(fresh ?? proposal),
        confirmationEmailStatus:
          fresh?.confirmationEmailStatus ?? "queued",
      },
      201,
    );
  });

  app.get("/api/events/:eventId/proposals", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const seed = findSeed(eventId);
    if (!seed) {
      return c.json({ error: "Event not found" }, 404);
    }

    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const query = c.req.query("q") ?? "";
    const requestedStatus = c.req.query("status") ?? "";
    const status = ["unreviewed", "approve", "maybe", "deny"].includes(
      requestedStatus,
    )
      ? (requestedStatus as ProposalStatus)
      : undefined;
    if (requestedStatus && requestedStatus !== "all" && !status) {
      return c.json({ error: "Unknown review status" }, 400);
    }
    const requestedSort = c.req.query("sort") ?? "newest";
    if (!["newest", "oldest", "title-asc", "speaker-asc"].includes(requestedSort)) {
      return c.json({ error: "Unknown proposal sort" }, 400);
    }
    const requestedTrack = c.req.query("track") ?? "";
    const allowedTracks = assignedTrackIds(principal, eventId);
    if (
      requestedTrack &&
      allowedTracks !== null &&
      !allowedTracks.includes(requestedTrack)
    ) {
      return c.json({ error: "That track is outside your review assignment" }, 403);
    }
    const trackIds = requestedTrack
      ? [requestedTrack]
      : (allowedTracks ?? undefined);
    const proposals = await store.listProposals({
      query,
      status,
      trackIds,
      sort: requestedSort as "newest" | "oldest" | "title-asc" | "speaker-asc",
    });
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
    if (!canAccessEvent(principal, eventId)) {
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
    if (!canReviewProposal(principal, eventId, proposal)) {
      return c.json({ error: "Proposal not found" }, 404);
    }

    return c.json({
      proposal,
      auditEvents: await store.listProposalAuditEvents(proposalId),
    });
  });

  app.patch(
    "/api/events/:eventId/organizer/proposals/:proposalId/review",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const proposalId = c.req.param("proposalId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const store = c.env.EVENT_STORE.getByName(eventId);
      const existing = (await store.getProposal(proposalId)) as OrganizerProposal | null;
      if (!existing || !canReviewProposal(principal, eventId, existing)) {
        return c.json({ error: "Proposal not found" }, 404);
      }

      const body = (await c.req.json().catch(() => null)) as {
        status?: unknown;
        committeeNote?: unknown;
        expectedVersion?: unknown;
      } | null;
      if (!body || !Number.isInteger(body.expectedVersion)) {
        return c.json({ error: "An expected review version is required" }, 400);
      }
      const status = body.status;
      if (
        status !== undefined &&
        (typeof status !== "string" ||
          !["unreviewed", "approve", "maybe", "deny"].includes(status))
      ) {
        return c.json({ error: "Unknown review status" }, 400);
      }
      if (
        body.committeeNote !== undefined &&
        typeof body.committeeNote !== "string"
      ) {
        return c.json({ error: "Committee note must be text" }, 400);
      }
      if (
        typeof body.committeeNote === "string" &&
        body.committeeNote.length > 10_000
      ) {
        return c.json({ error: "Committee note must be 10000 characters or fewer" }, 400);
      }
      if (status === undefined && body.committeeNote === undefined) {
        return c.json({ error: "A review change is required" }, 400);
      }

      const proposal = await store.updateProposalReview({
        proposalId,
        expectedVersion: body.expectedVersion as number,
        status: status as ProposalStatus | undefined,
        committeeNote:
          typeof body.committeeNote === "string"
            ? body.committeeNote.trim()
            : undefined,
        actorId: principal.id,
        actorName: principal.displayName,
      });
      if (!proposal) {
        return c.json(
          { error: "This proposal changed since you opened it. Reload and try again." },
          409,
        );
      }
      return c.json({
        proposal,
        auditEvents: await store.listProposalAuditEvents(proposalId),
      });
    },
  );

  app.get("/api/events/:eventId/portal", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) {
      return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    }
    return c.json(session);
  });

  app.patch("/api/events/:eventId/portal/profile", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => null)) as {
      biography?: unknown;
      name?: unknown;
      headshotAssetId?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Profile update must be valid JSON." }, 400);
    }

    const patch: {
      biography?: string;
      name?: string;
      headshotAssetId?: string | null;
    } = {};
    if ("biography" in body) {
      if (typeof body.biography !== "string") {
        return c.json({ error: "Biography must be a string." }, 400);
      }
      patch.biography = body.biography;
    }
    if ("name" in body) {
      if (typeof body.name !== "string") {
        return c.json({ error: "Name must be a string." }, 400);
      }
      patch.name = body.name;
    }
    if ("headshotAssetId" in body) {
      if (body.headshotAssetId !== null && typeof body.headshotAssetId !== "string") {
        return c.json({ error: "Headshot asset id is invalid." }, 400);
      }
      patch.headshotAssetId = body.headshotAssetId;
    }

    const result = await store.updateSpeakerPortalProfile({
      speakerId: authorized.payload.speakerId,
      ...patch,
    });
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    return c.json(session);
  });

  app.post("/api/events/:eventId/portal/uploads", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => null)) as {
      purpose?: unknown;
      taskId?: unknown;
      fileName?: unknown;
      mime?: unknown;
      sizeBytes?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Upload request must be valid JSON." }, 400);
    }

    const purpose = body.purpose === "headshot" || body.purpose === "task" ? body.purpose : null;
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    const rawFileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "";
    const fileName = rawFileName ? sanitizeUploadFileName(rawFileName) : "";
    const mime =
      typeof body.mime === "string" && body.mime.trim() ? body.mime.trim() : "";
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
        ? body.sizeBytes
        : Number.NaN;

    if (!purpose || !fileName || !mime || !Number.isInteger(sizeBytes) || sizeBytes < 0) {
      return c.json({ error: "A valid portal upload start request is required." }, 400);
    }
    if (purpose === "task" && !taskId) {
      return c.json({ error: "Task id is required for task uploads." }, 400);
    }
    if (purpose === "task") {
      const session = await store.getSpeakerPortalSession({
        speakerId: authorized.payload.speakerId,
        expiresAt: authorized.tokenRow.expiresAt,
      });
      const task = session?.tasks.find((row) => row.id === taskId);
      if (!task) return c.json({ error: "Task not found." }, 404);
      if (task.completionRequirement !== "file") {
        return c.json({ error: "This task does not accept file uploads." }, 400);
      }
    }

    const maxBytes = purpose === "headshot" ? HEADSHOT_MAX_BYTES : TASK_FILE_MAX_BYTES;
    const acceptMimeTypes =
      purpose === "headshot" ? [...HEADSHOT_MIME_TYPES] : [] as string[];
    if (sizeBytes > maxBytes) {
      return c.json({ error: `Files must be ${maxBytes} bytes or smaller.` }, 400);
    }
    if (acceptMimeTypes.length > 0 && !acceptMimeTypes.includes(mime)) {
      return c.json({ error: "That file type is not allowed." }, 400);
    }

    const assetId = createTokenId();
    const objectKey = `${eventId}/portal/${authorized.payload.speakerId}/${assetId}/${fileName}`;
    await store.createPortalAsset({
      assetId,
      objectKey,
      fileName,
      mime,
      sizeBytes,
      speakerId: authorized.payload.speakerId,
      purpose: purpose === "headshot" ? "portal_headshot" : "portal_task",
      taskId: purpose === "task" ? taskId : undefined,
      maxBytes,
    });

    return c.json({
      upload: {
        assetId,
        objectKey,
        uploadUrl: `/api/events/${eventId}/portal/uploads/${assetId}`,
        maxBytes,
        acceptMimeTypes,
      },
    });
  });

  app.get("/api/events/:eventId/portal/assets/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.status !== "complete" ||
      asset.owner_speaker_id !== authorized.payload.speakerId ||
      (asset.purpose !== "portal_headshot" && asset.purpose !== "portal_task")
    ) {
      return c.json({ error: "Asset not found." }, 404);
    }

    const object = await c.env.ASSETS.get(asset.object_key);
    if (!object) {
      return c.json({ error: "Asset file is missing." }, 404);
    }
    const headers = new Headers();
    headers.set("content-type", asset.mime || "application/octet-stream");
    headers.set("cache-control", "private, max-age=300");
    if (asset.file_name) {
      headers.set(
        "content-disposition",
        `inline; filename="${sanitizeUploadFileName(asset.file_name)}"`,
      );
    }
    return new Response(object.body, { status: 200, headers });
  });

  app.put("/api/events/:eventId/portal/uploads/:assetId", async (c) => {
    const eventId = c.req.param("eventId");
    const assetId = c.req.param("assetId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    if (!c.env.ASSETS) {
      return c.json({ error: "File uploads are not configured." }, 503);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const asset = await store.getAsset(assetId);
    if (
      !asset ||
      asset.owner_speaker_id !== authorized.payload.speakerId ||
      (asset.purpose !== "portal_headshot" && asset.purpose !== "portal_task")
    ) {
      return c.json({ error: "Upload session not found." }, 404);
    }
    if (
      asset.claimed_proposal_id ||
      (asset.status !== "pending" && asset.status !== "failed")
    ) {
      return c.json({ error: "This upload can no longer be replaced." }, 400);
    }

    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
      return c.json({ error: "Content-Length is required." }, 400);
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return c.json({ error: "Content-Length is invalid." }, 400);
    }
    if (contentLength !== Number(asset.size_bytes)) {
      return c.json(
        { error: "Upload size must match the declared file size." },
        400,
      );
    }
    if (contentLength > Number(asset.max_bytes)) {
      return c.json(
        { error: `Files must be ${Number(asset.max_bytes)} bytes or smaller.` },
        400,
      );
    }
    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (contentType !== asset.mime) {
      return c.json({ error: "Content-Type must match the declared file type." }, 400);
    }
    if (!c.req.raw.body) {
      return c.json({ error: "Upload body is required." }, 400);
    }

    try {
      const stored = await c.env.ASSETS.put(asset.object_key, c.req.raw.body, {
        httpMetadata: { contentType: asset.mime },
        customMetadata: {
          assetId,
          eventId,
          fileName: asset.file_name,
          speakerId: authorized.payload.speakerId,
        },
      });
      if (!stored || stored.size !== Number(asset.size_bytes)) {
        try {
          await c.env.ASSETS.delete(asset.object_key);
        } catch {
          // best-effort
        }
        await store.failAsset(assetId);
        return c.json(
          { error: "Upload size did not match the declared file size." },
          400,
        );
      }
      const completed = await store.completeAsset({
        assetId,
        sizeBytes: stored.size,
        mime: asset.mime,
        fileName: asset.file_name,
      });
      if (!completed) {
        return c.json({ error: "This upload can no longer be replaced." }, 409);
      }
      return c.json({ asset: completed });
    } catch {
      await store.failAsset(assetId);
      return c.json(
        { error: "Upload failed. You can retry without restarting." },
        502,
      );
    }
  });

  app.post("/api/events/:eventId/portal/tasks/:taskId/complete", async (c) => {
    const eventId = c.req.param("eventId");
    const taskId = c.req.param("taskId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSpeakerPortal({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) return c.json(INVALID_PORTAL_LINK_ERROR, 401);

    const body = (await c.req.json().catch(() => ({}))) as {
      assetId?: unknown;
    };
    const assetId =
      typeof body.assetId === "string" && body.assetId.trim()
        ? body.assetId.trim()
        : null;

    const result = await store.completePortalTask({
      speakerId: authorized.payload.speakerId,
      taskId,
      assetId,
    });
    if (!result.ok) {
      const status = result.status === 404 ? 404 : 400;
      return c.json({ error: result.error }, status);
    }

    const session = await store.getSpeakerPortalSession({
      speakerId: authorized.payload.speakerId,
      expiresAt: authorized.tokenRow.expiresAt,
    });
    if (!session) return c.json(INVALID_PORTAL_LINK_ERROR, 401);
    return c.json(session);
  });

  app.get("/api/events/:eventId/onboarding", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    const event = await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can open onboarding." }, 403);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const board = await store.getOnboardingBoard();
    return c.json({ ...board, eventId: event.id });
  });

  app.post("/api/events/:eventId/onboarding/tasks", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can create tasks." }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as {
      speakerId?: unknown;
      title?: unknown;
      instructions?: unknown;
      kind?: unknown;
      completionRequirement?: unknown;
      readinessFlag?: unknown;
      dueAt?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Task request must be valid JSON." }, 400);
    }

    const speakerId = typeof body.speakerId === "string" ? body.speakerId.trim() : "";
    const title = typeof body.title === "string" ? body.title : "";
    const instructions = typeof body.instructions === "string" ? body.instructions : "";
    const kind = typeof body.kind === "string" ? body.kind : "custom";
    const completionRequirement = (
      body.completionRequirement === "manual" ||
      body.completionRequirement === "file" ||
      body.completionRequirement === "ack"
        ? body.completionRequirement
        : null
    ) as OnboardingCompletionRequirement | null;
    const readinessFlag =
      typeof body.readinessFlag === "string" && body.readinessFlag.trim()
        ? body.readinessFlag.trim()
        : null;
    const dueAt =
      typeof body.dueAt === "string" && body.dueAt.trim() ? body.dueAt.trim() : null;

    if (!speakerId || !completionRequirement) {
      return c.json(
        { error: "speakerId and completionRequirement are required." },
        400,
      );
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const created = await store.createOnboardingTask({
      speakerId,
      title,
      instructions,
      kind,
      completionRequirement,
      readinessFlag,
      dueAt,
      createdBy: principal.id,
    });
    if ("error" in created) {
      return c.json({ error: created.error }, 400);
    }
    return c.json({ task: created }, 201);
  });

  app.post("/api/events/:eventId/onboarding/reminders", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can prepare reminders." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      speakerId?: unknown;
    } | null;
    const speakerId =
      body && typeof body.speakerId === "string" ? body.speakerId.trim() : "";
    if (!speakerId) return c.json({ error: "speakerId is required." }, 400);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const draft = await store.prepareOnboardingReminder({
      speakerId,
      actorId: principal.id,
      actorName: principal.displayName,
    });
    if ("error" in draft) return c.json({ error: draft.error }, 400);
    return c.json(draft, 201);
  });

  app.patch("/api/events/:eventId/onboarding/reminders/:draftId", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can edit reminders." }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      subject?: unknown;
      bodyText?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Draft update must be valid JSON." }, 400);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const updated = await store.updateReminderDraft({
      id: draftId,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      bodyText: typeof body.bodyText === "string" ? body.bodyText : undefined,
    });
    if ("error" in updated) return c.json({ error: updated.error }, 400);
    return c.json(updated);
  });

  app.post("/api/events/:eventId/onboarding/reminders/:draftId/discard", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can discard reminders." }, 403);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    const discarded = await store.discardReminderDraft(draftId);
    if ("error" in discarded) return c.json({ error: discarded.error }, 400);
    return c.json(discarded);
  });

  app.post("/api/events/:eventId/onboarding/reminders/:draftId/send", async (c) => {
    const eventId = c.req.param("eventId");
    const draftId = c.req.param("draftId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal || !canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Only event administrators can send reminders." }, 403);
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const queued = await store.queueReminderSend(draftId);
    if ("error" in queued) return c.json({ error: queued.error }, 400);

    const sender =
      options.emailSender === undefined
        ? createResendSender(c.env)
        : options.emailSender;
    if (!sender) {
      await store.markOutboxFailed(
        queued.outboxId,
        "Email delivery is not configured.",
        new Date().toISOString(),
        null,
      );
      const failed = await store.getReminderDraft(draftId);
      return c.json(failed ?? queued.draft);
    }

    await deliverOutboxMessage({
      store,
      sender,
      messageId: queued.outboxId,
      now: new Date(),
    });
    const after = await store.getReminderDraft(draftId);
    return c.json(after ?? queued.draft);
  });

  app.get("/api/events/:eventId/submitter/edit", async (c) => {
    const eventId = c.req.param("eventId");
    const token = c.req.query("token") ?? "";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSubmitterEdit({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const proposal = await store.getProposal(authorized.payload.proposalId);
    if (!proposal) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const form = (await store.getFormVersion(
      proposal.formId,
      proposal.formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    return c.json({
      eventId,
      proposalId: proposal.id,
      expiresAt: authorized.tokenRow.expiresAt,
      form,
      answers: proposal.answers,
      proposal: toSubmitterProposal(proposal),
    });
  });

  app.patch("/api/events/:eventId/submitter/proposals/:proposalId", async (c) => {
    const eventId = c.req.param("eventId");
    const proposalId = c.req.param("proposalId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);

    const token =
      c.req.header("x-submitter-token") ||
      c.req.query("token") ||
      "";
    const store = c.env.EVENT_STORE.getByName(eventId);
    const authorized = await authorizeSubmitterEdit({
      secret: signingSecret(c.env, options.signingSecret),
      token,
      eventId,
      expectedProposalId: proposalId,
      store,
    });
    if (!authorized) {
      return c.json(INVALID_EDIT_LINK_ERROR, 401);
    }

    const event = await store.getEvent();
    if (!event) return c.json({ error: "Event not found" }, 404);

    const existing = await store.getProposal(proposalId);
    if (!existing) return c.json(INVALID_EDIT_LINK_ERROR, 401);

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
    if (!body || typeof body !== "object") {
      return c.json({ error: "Proposal request must be valid JSON." }, 400);
    }
    const bodyRecord = body as Record<string, unknown>;
    const answersRaw = bodyRecord.answers;
    if (
      !answersRaw ||
      typeof answersRaw !== "object" ||
      Array.isArray(answersRaw)
    ) {
      return c.json({ error: "Submission answers are required." }, 400);
    }

    const form = (await store.getFormVersion(
      existing.formId,
      existing.formDefinitionVersion,
    )) as PublishedCfpForm | null;
    if (!form) {
      return c.json(
        { error: "This form version is no longer available. Reload the form." },
        409,
      );
    }

    const validated = validateAndNormalizeSubmission(
      form.definition,
      answersRaw as SubmissionAnswers,
      event,
    );
    if (!validated.normalized || Object.keys(validated.errors).length > 0) {
      return c.json(
        { errors: validated.errors, values: validated.answers },
        400,
      );
    }

    const updated = await store.updateProposal({
      proposalId,
      answers: validated.answers,
      normalized: validated.normalized,
      assetClaims: validated.assetClaims,
    });
    if (!updated.ok) {
      return c.json(
        { errors: updated.errors, values: validated.answers },
        400,
      );
    }
    return c.json({ proposal: toPublicProposal(updated.proposal) });
  });

  app.post(
    "/api/events/:eventId/submitter/tokens/:tokenId/revoke",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const tokenId = c.req.param("tokenId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!isEventAdmin(principal, eventId)) {
        return c.json({ error: "Administrator access required" }, 403);
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const store = c.env.EVENT_STORE.getByName(eventId);
      await store.revokeEditToken(tokenId);
      return c.json({ ok: true });
    },
  );

  app.post("/api/events/:eventId/course-checks/decisions", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to create a Decision Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to create or apply this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      proposalId?: unknown;
      outcome?: unknown;
      items?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    const items: Array<{ proposalId: string; outcome: "accepted" | "declined" }> = [];
    if (Array.isArray(body?.items)) {
      for (const raw of body.items) {
        const row = raw as { proposalId?: unknown; outcome?: unknown };
        if (typeof row.proposalId !== "string" || !row.proposalId.trim()) {
          return c.json({ error: "Each item requires proposalId" }, 400);
        }
        if (row.outcome !== "accepted" && row.outcome !== "declined") {
          return c.json({ error: "Each item outcome must be accepted or declined" }, 400);
        }
        items.push({ proposalId: row.proposalId.trim(), outcome: row.outcome });
      }
    } else if (typeof body?.proposalId === "string" && body.proposalId.trim()) {
      if (body.outcome !== "accepted" && body.outcome !== "declined") {
        return c.json({ error: "outcome must be accepted or declined" }, 400);
      }
      items.push({ proposalId: body.proposalId.trim(), outcome: body.outcome });
    } else {
      return c.json({ error: "proposalId or items[] is required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const store = c.env.EVENT_STORE.getByName(eventId);
    for (const item of items) {
      const proposal = await store.getProposal(item.proposalId);
      if (!proposal) return c.json({ error: `Proposal ${item.proposalId} not found` }, 404);
    }
    try {
      const result = (await store.createDecisionCourseCheck({
        items,
        idempotencyKey,
        actor: { id: principal.id, displayName: principal.displayName },
      })) as {
        plan: import("../shared/course-check").CourseCheckPlan;
        created: boolean;
        linkedPlans?: import("../shared/course-check").CourseCheckPlan[];
      };
      if (result.linkedPlans && result.linkedPlans.length > 0) {
        return c.json(
          { ...result.plan, linkedPlans: result.linkedPlans },
          result.created ? 201 : 200,
        );
      }
      return c.json(result.plan, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Unable to create Decision Course Check",
        },
        400,
      );
    }
  });

  app.get("/api/events/:eventId/course-checks", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const role = eventRole(principal, eventId);
    // Reviewers may list plans but communication private evidence is redacted.
    if (role !== "admin" && role !== "reviewer") {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const canViewCommunicationEvidence = role === "admin";
    const listed = (await store.listCourseCheckPlans()) as import("../shared/course-check").CourseCheckPlan[];
    const plans = await Promise.all(
      listed.map((plan) =>
        store.projectCourseCheckPlan(plan, { canViewCommunicationEvidence }),
      ),
    );
    return c.json({ plans });
  });

  app.post("/api/events/:eventId/course-checks/communications", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to create a Communication Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to create this Communication Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      decisionPlanId?: unknown;
      proposalIds?: unknown;
      sessionIds?: unknown;
      speakerIds?: unknown;
      taskIds?: unknown;
      templateKind?: unknown;
      subject?: unknown;
      bodyText?: unknown;
      bodyHtml?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    try {
      const result = (await c.env.EVENT_STORE.getByName(eventId).createCommunicationCourseCheck({
        decisionPlanId:
          typeof body?.decisionPlanId === "string" ? body.decisionPlanId.trim() : undefined,
        proposalIds: asStringArray(body?.proposalIds),
        sessionIds: asStringArray(body?.sessionIds),
        speakerIds: asStringArray(body?.speakerIds),
        taskIds: asStringArray(body?.taskIds),
        templateKind:
          body?.templateKind === "acceptance" ||
          body?.templateKind === "decline" ||
          body?.templateKind === "custom"
            ? body.templateKind
            : undefined,
        subject: typeof body?.subject === "string" ? body.subject : undefined,
        bodyText: typeof body?.bodyText === "string" ? body.bodyText : undefined,
        bodyHtml: typeof body?.bodyHtml === "string" ? body.bodyHtml : undefined,
        idempotencyKey,
        actor: { id: principal.id, displayName: principal.displayName },
      })) as { plan: import("../shared/course-check").CourseCheckPlan; created: boolean };
      return c.json(result.plan, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to create Communication Course Check",
        },
        400,
      );
    }
  });

  app.post("/api/events/:eventId/course-checks/:planId/revise", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to revise a Communication Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to revise this Communication Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      subject?: unknown;
      bodyText?: unknown;
      bodyHtml?: unknown;
      recipientSelection?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error: "planVersion, digest, and idempotencyKey are required to revise a Course Check.",
        },
        400,
      );
    }
    const recipientSelection = Array.isArray(body.recipientSelection)
      ? body.recipientSelection
          .map((row) => {
            const item = row as { recipientId?: unknown; selected?: unknown };
            if (typeof item.recipientId !== "string") return null;
            return {
              recipientId: item.recipientId,
              selected: Boolean(item.selected),
            };
          })
          .filter((row): row is { recipientId: string; selected: boolean } => Boolean(row))
      : undefined;
    const result = (await c.env.EVENT_STORE.getByName(eventId).reviseCommunicationCourseCheck({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      bodyText: typeof body.bodyText === "string" ? body.bodyText : undefined,
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : undefined,
      recipientSelection,
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    return c.json(result.plan, result.created ? 201 : 200);
  });

  app.post("/api/events/:eventId/course-checks/:planId/create-drafts", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to create communication drafts.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to create drafts for this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      stageId?: unknown;
      idempotencyKey?: unknown;
      softWarningOverrides?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, and idempotencyKey are required to create communication drafts.",
        },
        400,
      );
    }
    const softWarningOverrides = Array.isArray(body.softWarningOverrides)
      ? body.softWarningOverrides
          .map((row) => {
            const item = row as { findingId?: unknown; reason?: unknown };
            if (typeof item.findingId !== "string") return null;
            return {
              findingId: item.findingId,
              reason: typeof item.reason === "string" ? item.reason : null,
            };
          })
          .filter((row): row is { findingId: string; reason: string | null } => Boolean(row))
      : undefined;
    const result = (await c.env.EVENT_STORE.getByName(eventId).createCommunicationDrafts({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      stageId: typeof body.stageId === "string" ? body.stageId : "create-drafts",
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
      softWarningOverrides,
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
          findings?: import("../shared/course-check").CourseCheckFinding[];
          changedInputs?: string[];
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
          findings: result.findings,
          changedInputs: result.changedInputs,
        },
        result.status,
      );
    }
    return c.json(result.plan, result.created ? 201 : 200);
  });

  app.post("/api/events/:eventId/course-checks/:planId/defer", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to defer Course Check items.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to continue this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      itemIds?: unknown;
      reason?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !Array.isArray(body.itemIds) ||
      typeof body.reason !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, itemIds, reason, and idempotencyKey are required to defer items.",
        },
        400,
      );
    }
    const itemIds = body.itemIds.filter((id): id is string => typeof id === "string");
    const result = (await c.env.EVENT_STORE.getByName(eventId).deferCourseCheckItems({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      itemIds,
      reason: body.reason,
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    return c.json(result.plan, result.created ? 201 : 200);
  });


  app.post("/api/events/:eventId/course-checks/:planId/defer", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to defer Course Check items.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to continue this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      itemIds?: unknown;
      reason?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      !Array.isArray(body.itemIds) ||
      typeof body.reason !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, itemIds, reason, and idempotencyKey are required to defer items.",
        },
        400,
      );
    }
    const itemIds = body.itemIds.filter((id): id is string => typeof id === "string");
    const result = (await c.env.EVENT_STORE.getByName(eventId).deferCourseCheckItems({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      itemIds,
      reason: body.reason,
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
        },
        result.status,
      );
    }
    return c.json(result.plan, result.created ? 201 : 200);
  });

  app.post("/api/events/:eventId/course-checks/guaranteed-speakers", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to create a Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to create or apply this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      sourceLabel?: unknown;
      title?: unknown;
      format?: unknown;
      trackId?: unknown;
      speakers?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return c.json({ error: "title is required" }, 400);
    }
    if (typeof body.trackId !== "string" || !body.trackId.trim()) {
      return c.json({ error: "trackId is required" }, 400);
    }
    if (!Array.isArray(body.speakers) || body.speakers.length === 0) {
      return c.json({ error: "At least one speaker is required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    const speakers: Array<{
      name: string;
      email: string;
      biography?: string;
      role?: "primary" | "co";
    }> = body.speakers.map((speaker) => {
      const row = speaker as {
        name?: unknown;
        email?: unknown;
        biography?: unknown;
        role?: unknown;
      };
      return {
        name: typeof row.name === "string" ? row.name : "",
        email: typeof row.email === "string" ? row.email : "",
        biography: typeof row.biography === "string" ? row.biography : "",
        role:
          row.role === "primary" || row.role === "co" ? row.role : undefined,
      };
    });
    const store = c.env.EVENT_STORE.getByName(eventId);
    const result = (await store.createGuaranteedSpeakerCourseCheck({
      sourceLabel:
        typeof body.sourceLabel === "string" ? body.sourceLabel : "Guaranteed speaker",
      title: body.title,
      format: typeof body.format === "string" ? body.format : "talk",
      trackId: body.trackId,
      speakers,
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
    })) as { plan: import("../shared/course-check").CourseCheckPlan; created: boolean };
    return c.json(result.plan, result.created ? 201 : 200);
  });

  app.get("/api/events/:eventId/course-checks/:planId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const role = eventRole(principal, eventId);
    if (role !== "admin" && role !== "reviewer") {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const canViewCommunicationEvidence = role === "admin";
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const plan = await store.getCourseCheckPlan(planId);
    if (!plan) return c.json({ error: "Course Check not found" }, 404);
    return c.json(
      await store.projectCourseCheckPlan(plan, { canViewCommunicationEvidence }),
    );
  });

  app.post("/api/events/:eventId/course-checks/:planId/apply", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const planId = c.req.param("planId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to apply a Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to apply this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      planVersion?: unknown;
      digest?: unknown;
      stageId?: unknown;
      idempotencyKey?: unknown;
      softWarningOverrides?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    if (
      !body ||
      !Number.isInteger(body.planVersion) ||
      typeof body.digest !== "string" ||
      typeof body.stageId !== "string" ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error:
            "planVersion, digest, stageId, and idempotencyKey are required to apply a Course Check.",
        },
        400,
      );
    }
    const softWarningOverrides = Array.isArray(body.softWarningOverrides)
      ? body.softWarningOverrides
          .map((row) => {
            const item = row as { findingId?: unknown; reason?: unknown };
            if (typeof item.findingId !== "string") return null;
            return {
              findingId: item.findingId,
              reason: typeof item.reason === "string" ? item.reason : null,
            };
          })
          .filter((row): row is { findingId: string; reason: string | null } => Boolean(row))
      : undefined;
    const result = (await c.env.EVENT_STORE.getByName(eventId).applyCourseCheck({
      planId,
      planVersion: body.planVersion as number,
      digest: body.digest,
      stageId: body.stageId,
      idempotencyKey,
      actor: { id: principal.id, displayName: principal.displayName },
      softWarningOverrides,
    })) as
      | { ok: true; plan: import("../shared/course-check").CourseCheckPlan; created: boolean }
      | {
          ok: false;
          status: 400 | 409;
          code: string;
          error: string;
          recoveryGuidance: string;
          findings?: import("../shared/course-check").CourseCheckFinding[];
          changedInputs?: string[];
        };
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          code: result.code,
          recoveryGuidance: result.recoveryGuidance,
          findings: result.findings,
          changedInputs: result.changedInputs,
        },
        result.status,
      );
    }

    const store = c.env.EVENT_STORE.getByName(eventId);
    const secret = signingSecret(c.env, options.signingSecret);
    if (secret) {
      const grants = await store.listPortalTokensForPlan(planId);
      const exp = Math.floor(Date.now() / 1000) + PORTAL_TOKEN_TTL_SECONDS;
      for (const grant of grants) {
        if (grant.signedToken || grant.revokedAt) continue;
        const token = await signPortalToken(secret, {
          v: 1,
          kind: "portal",
          eventId,
          speakerId: grant.speakerId,
          tokenId: grant.tokenId,
          exp,
        });
        await store.setPortalTokenSignature({
          tokenId: grant.tokenId,
          signedToken: token,
          expiresAt: new Date(exp * 1000).toISOString(),
        });
      }
    }

    return c.json(result.plan);
  });

  app.post(
    "/api/events/:eventId/course-checks/:planId/airtable/disposition",
    async (c) => {
      const principal = await resolvePrincipal(c.req.raw, c.env);
      const eventId = c.req.param("eventId");
      const planId = c.req.param("planId");
      if (!canAccessEvent(principal, eventId)) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!isEventAdmin(principal, eventId)) {
        return c.json(
          {
            error: "Administrator access is required to change Airtable delivery.",
            code: "missing_authority",
          },
          403,
        );
      }
      const seed = findSeed(eventId);
      if (!seed) return c.json({ error: "Event not found" }, 404);
      await loadEvent(c.env, seed);
      const body = (await c.req.json().catch(() => null)) as {
        planVersion?: unknown;
        digest?: unknown;
        disposition?: unknown;
        idempotencyKey?: unknown;
      } | null;
      const headerKey = c.req.header("idempotency-key");
      const idempotencyKey =
        (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
        (typeof headerKey === "string" && headerKey.trim()) ||
        "";
      if (
        !body ||
        !Number.isInteger(body.planVersion) ||
        typeof body.digest !== "string" ||
        (body.disposition !== "deferred" && body.disposition !== "removed") ||
        !idempotencyKey
      ) {
        return c.json(
          {
            error:
              "planVersion, digest, disposition, and idempotencyKey are required.",
          },
          400,
        );
      }
      const result = await c.env.EVENT_STORE.getByName(
        eventId,
      ).setAirtableStageDisposition({
        planId,
        planVersion: body.planVersion as number,
        digest: body.digest,
        disposition: body.disposition,
        idempotencyKey,
        actor: { id: principal.id, displayName: principal.displayName },
      }) as
        | {
            ok: true;
            plan: import("../shared/course-check").CourseCheckPlan;
            created: boolean;
          }
        | {
            ok: false;
            status: 400 | 409;
            code: string;
            error: string;
            recoveryGuidance: string;
          };
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            recoveryGuidance: result.recoveryGuidance,
          },
          result.status,
        );
      }
      return c.json(result.plan);
    },
  );

  app.get("/api/events/:eventId/program", async (c) => {
    const eventId = c.req.param("eventId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const revisionId = c.req.query("revision") ?? undefined;
    const program = await c.env.EVENT_STORE.getByName(eventId).getPublicProgram(
      revisionId,
    );
    if (!program) {
      return c.json({ error: "Public program not found" }, 404);
    }
    return c.json(program);
  });

  app.get("/api/events/:eventId/program/sessions/:sessionId/calendar.ics", async (c) => {
    const eventId = c.req.param("eventId");
    const sessionId = c.req.param("sessionId");
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const revisionId = c.req.query("revision") ?? undefined;
    const result = await c.env.EVENT_STORE.getByName(eventId).getPublicProgramSessionIcs(
      sessionId,
      revisionId,
    );
    if (!result.ok) {
      return c.json({ error: "Session not found" }, 404);
    }
    return new Response(result.ics, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        // inline so webcal/https open in calendar apps; filename kept for Save As
        "content-disposition": `inline; filename="${result.filename}"`,
        "cache-control": "public, max-age=300",
      },
    });
  });

  app.post("/api/events/:eventId/course-checks/publications", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json(
        {
          error: "Administrator access is required to create a Publication Course Check.",
          code: "missing_authority",
          recoveryGuidance:
            "Ask an event administrator to create or apply this Course Check.",
        },
        403,
      );
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as {
      operation?: unknown;
      restoreRevisionId?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const headerKey = c.req.header("idempotency-key");
    const idempotencyKey =
      (typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      (typeof headerKey === "string" && headerKey.trim()) ||
      "";
    const operation = body?.operation;
    if (
      operation !== "publish" &&
      operation !== "unpublish" &&
      operation !== "restore"
    ) {
      return c.json(
        { error: "operation must be publish, unpublish, or restore" },
        400,
      );
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    if (
      operation === "restore" &&
      (typeof body?.restoreRevisionId !== "string" || !body.restoreRevisionId.trim())
    ) {
      return c.json({ error: "restoreRevisionId is required for restore" }, 400);
    }
    try {
      const result = (await c.env.EVENT_STORE.getByName(
        eventId,
      ).createPublicationCourseCheck({
        operation,
        restoreRevisionId:
          typeof body?.restoreRevisionId === "string"
            ? body.restoreRevisionId.trim()
            : undefined,
        idempotencyKey,
        actor: { id: principal.id, displayName: principal.displayName },
      })) as {
        plan: import("../shared/course-check").CourseCheckPlan;
        created: boolean;
      };
      return c.json(result.plan, result.created ? 201 : 200);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to create Publication Course Check",
        },
        400,
      );
    }
  });

  /** Legacy test seam — still valid-subset publish without Course Check ceremony. */
  app.post("/api/events/:eventId/program/publish-test", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const program = await c.env.EVENT_STORE.getByName(
      eventId,
    ).publishPublicProgramRevisionForTest();
    return c.json(program, 201);
  });

  app.get("/api/events/:eventId/sessions", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const agenda = await c.env.EVENT_STORE.getByName(eventId).getAgendaWorkspace();
    return c.json(agenda);
  });

  app.patch("/api/events/:eventId/sessions/:sessionId", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    const eventId = c.req.param("eventId");
    const sessionId = c.req.param("sessionId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!isEventAdmin(principal, eventId)) {
      return c.json({ error: "Administrator access required" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const body = (await c.req.json().catch(() => null)) as SessionPlacementPatch | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "JSON body is required." }, 400);
    }
    const patch: SessionPlacementPatch = {};
    if ("roomId" in body) {
      if (body.roomId !== null && typeof body.roomId !== "string") {
        return c.json({ error: "roomId must be a string or null." }, 400);
      }
      patch.roomId = body.roomId;
    }
    if ("startsAt" in body) {
      if (body.startsAt !== null && typeof body.startsAt !== "string") {
        return c.json({ error: "startsAt must be a string or null." }, 400);
      }
      patch.startsAt = body.startsAt;
    }
    if ("endsAt" in body) {
      if (body.endsAt !== null && typeof body.endsAt !== "string") {
        return c.json({ error: "endsAt must be a string or null." }, 400);
      }
      patch.endsAt = body.endsAt;
    }
    const result = (await c.env.EVENT_STORE.getByName(eventId).updateSessionPlacement(
      sessionId,
      patch,
    )) as
      | { ok: true; result: import("../shared/events").SessionPlacementResponse }
      | { ok: false; status: 400 | 404; error: string };
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.result);
  });

  app.get("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const store = c.env.EVENT_STORE.getByName(eventId);
    const sync = await store.getAirtableSyncState();
    return c.json({ sync });
  });

  app.put("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const body = (await c.req.json().catch(() => null)) as {
      baseId?: unknown;
      accessToken?: unknown;
    } | null;
    if (!body || typeof body.baseId !== "string") {
      return c.json({ error: "baseId is required." }, 400);
    }
    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken : "";
    const store = c.env.EVENT_STORE.getByName(eventId);
    try {
      await store.saveAirtableConnection({
        baseId: body.baseId,
        accessToken,
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
    return c.json({
      sync: await store.getAirtableSyncState(),
      pull: result,
    });
  });

  app.delete("/api/events/:eventId/integrations/airtable", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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
    const store = c.env.EVENT_STORE.getByName(eventId);
    const sync = await store.clearAirtableConnection();
    return c.json({ sync });
  });

  app.post("/api/events/:eventId/integrations/airtable/pull", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
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

  return app;
}
