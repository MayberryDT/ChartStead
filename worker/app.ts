import { Hono } from "hono";

import {
  canonicalizeCfpDefinition,
  createDefaultCfpDefinition,
  type CfpDefinitionV1,
} from "../shared/cfp-definition";
import type {
  EventRecord,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalStatus,
  PublishedCfpForm,
  ReviewerAssignment,
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
} from "./event-store";
import { createSeedCfp } from "./seed-cfp";
import { seedEvents } from "./seed-events";
import { createSeedProposals } from "./seed-proposals";
import {
  createTokenId,
  signEditToken,
  verifyEditToken,
  type SignedEditTokenPayload,
} from "./signed-links";
import type { AppBindings } from "./types";

const MAX_PROPOSAL_BODY_BYTES = 64 * 1_024;
const EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_FILE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILE_NAME_LENGTH = 120;
const INVALID_EDIT_LINK_ERROR = {
  error: "This edit link is invalid or has expired.",
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

function eventRole(
  principal: OrganizerPrincipal,
  eventId: string,
): "admin" | "reviewer" | null {
  if (!principal.eventIds.includes(eventId)) return null;
  return principal.rolesByEvent?.[eventId] ?? principal.role;
}

function assignedTrackIds(
  principal: OrganizerPrincipal,
  eventId: string,
): string[] | null {
  return eventRole(principal, eventId) === "admin"
    ? null
    : (principal.trackIdsByEvent?.[eventId] ?? []);
}

function canAccessEvent(
  principal: OrganizerPrincipal | null,
  eventId: string,
): principal is OrganizerPrincipal {
  return Boolean(principal && eventRole(principal, eventId));
}

function isEventAdmin(
  principal: OrganizerPrincipal | null,
  eventId: string,
): principal is OrganizerPrincipal {
  return Boolean(principal && eventRole(principal, eventId) === "admin");
}

function canReviewProposal(
  principal: OrganizerPrincipal,
  eventId: string,
  proposal: Pick<OrganizerProposal, "trackId">,
): boolean {
  const tracks = assignedTrackIds(principal, eventId);
  return tracks === null || tracks.includes(proposal.trackId);
}

async function scopeEventForPrincipal(
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

  return app;
}
