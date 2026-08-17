import { Hono } from "hono";

import type {
  EventRecord,
  OrganizerActivityByActorResponse,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  OrganizerPrincipal,
  OrganizerProposal,
  OrganizerTeamMember,
  ProposalAuditEvent,
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
  eventRole,
  isEventAdmin,
  scopeEventForPrincipal,
} from "../authz";
import { resolveProductionPrincipal } from "../auth";
import type { AppBindings } from "../types";
import {
  enrichPrincipalMemberships,
  findKnownEvent,
  listEventWorkspaces,
  loadEventWorkspace,
} from "../event-catalog";
import {
  anonymizeEvaluationProposal,
  evaluationRoundAccessError,
} from "../evaluation-plans";
import {
  parseInitiatingHumanHeader,
  toCourseCheckActor,
} from "../course-check/agent-authz";
import { formatCourseCheckActorLabel } from "../../shared/course-check";

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
  return findKnownEvent(eventId);
}

async function loadEvent(env: AppBindings, seed: EventRecord) {
  const event = await loadEventWorkspace(env, seed.id);
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
    if (env?.AUTH_DB) {
      return resolvePrincipalFromApiKey(env.AUTH_DB, bearer);
    }
    return null;
  }

  const resolve = options.resolvePrincipal ?? resolveProductionPrincipal;
  return enrichPrincipalMemberships(env?.AUTH_DB, await resolve(request, env));
}


export function createV1App(options: V1AppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>();
  const airtableFactory =
    options.airtableClientFactory ?? defaultAirtableClientFactory;
  const airtableCredentialFactory = options.airtableCredentialClientFactory;

  app.use("/events/:eventId", async (c, next) => {
    await loadEventWorkspace(c.env, c.req.param("eventId"));
    await next();
  });
  app.use("/events/:eventId/*", async (c, next) => {
    await loadEventWorkspace(c.env, c.req.param("eventId"));
    await next();
  });

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

    const visibleEvents = await listEventWorkspaces(c.env, principal);
    const events = await Promise.all(
      visibleEvents.map(async (event) =>
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
    const store = c.env.EVENT_STORE.getByName(eventId);
    const plan = await store.getEvaluationPlan();
    const roundId = c.req.query("roundId") ?? "";
    let round = null;
    if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
      if (!roundId) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      const access = await store.getEvaluationRoundAccess(roundId, principal.id);
      if (!access.allowed) {
        const error = evaluationRoundAccessError(access);
        return c.json(error.body, error.status);
      }
      round = access.round;
    }
    const tracks = assignedTrackIds(principal, eventId);
    const proposalIds = round
      ? await store.listEvaluationRoundProposalIds(round.id, principal.id)
      : undefined;
    const proposals = (await store.listProposals({
      trackIds: tracks ?? undefined,
      proposalIds,
    })) as OrganizerProposal[];
    const projected = await Promise.all(
      proposals.map(async (proposal) => {
        if (eventRole(principal, eventId) === "admin") {
          return {
            ...proposal,
            reviewerRecusals: await store.listProposalReviewRecusals(proposal.id),
          };
        }
        const recusal = round
          ? await store.getReviewerRecusal({
              proposalId: proposal.id,
              roundId: round.id,
              reviewerId: principal.id,
            })
          : null;
        const withRecusal = { ...proposal, reviewerRecusal: recusal, reviewerRecusals: [] };
        return round?.anonymization === "blind"
          ? anonymizeEvaluationProposal(withRecusal)
          : withRecusal;
      }),
    );
    return c.json({
      submissions: projected,
    });
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
    const store = c.env.EVENT_STORE.getByName(eventId);
    const proposal = (await store.getProposal(
      c.req.param("submissionId"),
    )) as OrganizerProposal | null;
    if (!proposal || !canReviewProposal(principal, eventId, proposal)) {
      return c.json({ error: "Submission not found" }, 404);
    }
    const plan = await store.getEvaluationPlan();
    const roundId = c.req.query("roundId") ?? "";
    let round = null;
    if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
      if (!roundId) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      const access = await store.getEvaluationRoundAccess(roundId, principal.id);
      if (!access.allowed) {
        const error = evaluationRoundAccessError(access);
        return c.json(error.body, error.status);
      }
      if (
        !(await store.listEvaluationRoundProposalIds(roundId, principal.id)).includes(
          proposal.id,
        )
      ) {
        return c.json({ error: "Submission not found" }, 404);
      }
      round = access.round;
    }
    const isAdmin = eventRole(principal, eventId) === "admin";
    const reviewerRecusal =
      !isAdmin && round
        ? await store.getReviewerRecusal({
            proposalId: proposal.id,
            roundId: round.id,
            reviewerId: principal.id,
          })
        : null;
    return c.json({
      submission: isAdmin
        ? {
            ...proposal,
            reviewerRecusals: await store.listProposalReviewRecusals(proposal.id),
          }
        : {
            ...(round?.anonymization === "blind" ? anonymizeEvaluationProposal(proposal) : proposal),
            reviewerRecusal,
            reviewerRecusals: [],
          },
    });
  });

  app.patch("/events/:eventId/submissions/:submissionId/review", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
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
      roundId?: string;
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

    const plan = await store.getEvaluationPlan();
    let roundId: string | undefined;
    let round = null;
    if (plan?.enabled && eventRole(principal, eventId) !== "admin") {
      if (!body.roundId) {
        return c.json(
          { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
          403,
        );
      }
      const access = await store.getEvaluationRoundAccess(body.roundId, principal.id);
      if (!access.allowed) {
        const error = evaluationRoundAccessError(access);
        return c.json(error.body, error.status);
      }
      roundId = access.round?.id;
      round = access.round;
      if (roundId) {
        if (
          !(await store.listEvaluationRoundProposalIds(roundId, principal.id)).includes(
            submissionId,
          )
        ) {
          return c.json({ error: "Submission not found" }, 404);
        }
        const recusal = await store.getReviewerRecusal({
          proposalId: submissionId,
          roundId,
          reviewerId: principal.id,
        });
        if (recusal) {
          return c.json(
            {
              error: "You have recused yourself from this review assignment.",
              code: "reviewer_recused",
            },
            409,
          );
        }
      }
    }

    try {
      const reviewActor = toCourseCheckActor(
        principal,
        parseInitiatingHumanHeader(c.req.raw),
      );
      const proposal = await store.updateProposalReview({
        proposalId: submissionId,
        status: body.status,
        committeeNote:
          typeof body.committeeNote === "string"
            ? body.committeeNote.trim()
            : undefined,
        expectedVersion: body.expectedVersion ?? existing.reviewVersion,
        actorId: reviewActor.id,
        actorName: formatCourseCheckActorLabel(reviewActor),
        actorJson: JSON.stringify(reviewActor),
        roundId,
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
      const isAdmin = eventRole(principal, eventId) === "admin";
      const auditEvents = (await store.listProposalAuditEvents(submissionId)).filter(
        (audit: ProposalAuditEvent) => isAdmin || audit.actorId === principal.id,
      );
      return c.json({
        submission:
          !isAdmin && round?.anonymization === "blind"
            ? anonymizeEvaluationProposal(proposal)
            : isAdmin
              ? {
                  ...proposal,
                  reviewerRecusals: await store.listProposalReviewRecusals(submissionId),
                }
              : proposal,
        auditEvents,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review failed.";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/events/:eventId/submissions/:submissionId/recusal", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (eventRole(principal, eventId) === "admin") {
      return c.json({ error: "Reviewer access required.", code: "reviewer_not_assigned" }, 403);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const submissionId = c.req.param("submissionId");
    const proposal = (await store.getProposal(submissionId)) as OrganizerProposal | null;
    if (!proposal || !canReviewProposal(principal, eventId, proposal)) {
      return c.json({ error: "Submission not found" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as {
      roundId?: unknown;
      reason?: unknown;
    } | null;
    if (!body || typeof body.roundId !== "string" || !body.roundId) {
      return c.json(
        { error: "Select an assigned evaluation round.", code: "reviewer_not_assigned" },
        403,
      );
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return c.json({ error: "Recusal reason must be text." }, 400);
    }
    if (typeof body.reason === "string" && body.reason.length > 2000) {
      return c.json({ error: "Recusal reason must be 2000 characters or fewer." }, 400);
    }
    const access = await store.getEvaluationRoundAccess(body.roundId, principal.id);
    if (!access.allowed) {
      const error = evaluationRoundAccessError(access);
      return c.json(error.body, error.status);
    }
    if (
      !(await store.listEvaluationRoundProposalIds(access.round!.id, principal.id)).includes(
        submissionId,
      )
    ) {
      return c.json({ error: "Submission not found" }, 404);
    }
    const recusal = await store.recuseProposalReview({
      proposalId: submissionId,
      roundId: access.round!.id,
      reviewerId: principal.id,
      reviewerName: principal.displayName,
      reason: body.reason,
    });
    const current = (await store.getProposal(submissionId)) as OrganizerProposal;
    return c.json({
      submission: {
        ...(access.round!.anonymization === "blind" ? anonymizeEvaluationProposal(current) : current),
        reviewerRecusal: recusal,
        reviewerRecusals: [],
      },
      auditEvents: (await store.listProposalAuditEvents(submissionId)).filter(
        (audit: ProposalAuditEvent) => audit.actorId === principal.id,
      ),
    });
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

  app.get("/events/:eventId/organizer/activity", async (c) => {
    const principal = await resolveV1Principal(c.req.raw, c.env, options);
    const eventId = c.req.param("eventId");
    if (!canAccessEvent(principal, eventId)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const seed = findSeed(eventId);
    if (!seed) return c.json({ error: "Event not found" }, 404);
    await loadEvent(c.env, seed);
    const store = c.env.EVENT_STORE.getByName(eventId);
    const isAdmin = eventRole(principal, eventId) === "admin";

    const membershipRows = await c.env.AUTH_DB.prepare(
      `SELECT u.id, u.name, u.email, m.role
       FROM event_memberships AS m
       JOIN "user" AS u ON u.id = m.user_id
       WHERE m.event_id = ? AND m.role IN ('admin', 'reviewer')
       ORDER BY u.name COLLATE NOCASE, u.id`,
    )
      .bind(eventId)
      .all<{ id: string; name: string; email: string; role: "admin" | "reviewer" }>();

    let actors: OrganizerTeamMember[] = membershipRows.results.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      kind: "human" as const,
    }));
    if (!isAdmin) {
      actors = actors.filter((member) => member.id === principal!.id);
    } else {
      const agentActors = await store.listAgentActivityActors();
      const knownIds = new Set(actors.map((member) => member.id));
      for (const agent of agentActors) {
        if (knownIds.has(agent.id)) continue;
        actors.push({
          id: agent.id,
          name: agent.name,
          email: "",
          role: "admin",
          kind: "agent",
        });
        knownIds.add(agent.id);
      }
    }

    const actorIdParam = c.req.query("actorId");
    const actorId =
      typeof actorIdParam === "string" && actorIdParam.trim()
        ? actorIdParam.trim()
        : null;
    const limitParam = c.req.query("limit");
    const parsedLimit =
      typeof limitParam === "string" && limitParam.trim()
        ? Number.parseInt(limitParam.trim(), 10)
        : 50;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 50;
    const beforeParam = c.req.query("before");
    const before =
      typeof beforeParam === "string" && beforeParam.trim()
        ? beforeParam.trim()
        : null;

    let actor: OrganizerTeamMember | null = null;
    let entries: OrganizerActivityByActorResponse["entries"] = [];
    let hasMore = false;

    if (actorId) {
      if (!isAdmin && actorId !== principal!.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      const activity = await store.listTeamActivityByActor(actorId, {
        limit,
        before,
      });
      entries = activity.entries;
      hasMore = activity.hasMore;
      actor = actors.find((member) => member.id === actorId) ?? null;
      if (!actor) {
        const agentMatch = entries.find((entry) => entry.actorId === actorId);
        if (agentMatch) {
          actor = {
            id: actorId,
            name: agentMatch.actorName,
            email: "",
            role: "admin",
            kind: "agent",
          };
        }
      }
    }

    const body: OrganizerActivityByActorResponse = {
      actorId,
      actor,
      actors,
      entries,
      limit,
      hasMore,
    };
    return c.json(body);
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
    if (principal?.principalKind === "agent") return c.json({ error: "Agent keys cannot manage integration credentials." }, 403);
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
    if (principal?.principalKind === "agent") return c.json({ error: "Agent keys cannot manage integration credentials." }, 403);
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
    if (principal?.principalKind === "agent") return c.json({ error: "Agent keys cannot run integration credential operations." }, 403);
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
    if (principal?.principalKind === "agent") return c.json({ error: "Agent keys cannot create credentials." }, 403);
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
    if (principal?.principalKind === "agent") return c.json({ error: "Agent keys cannot manage credentials." }, 403);
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
