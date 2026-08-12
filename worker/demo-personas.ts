import type { OrganizerPrincipal } from "../shared/events";
import type { CourseCheckPlan } from "../shared/course-check";
import { createApp } from "./app";
import { loadPrincipalForUser, type AuthenticatedUser } from "./auth";
import { seedEvents } from "./seed-events";
import { signPortalToken } from "./signed-links";
import type { AppBindings } from "./types";

export const demoEventId = "pacific-open-data-summit-2026";

export const demoPersonas = [
  {
    id: "organizer",
    role: "admin",
    label: "Organizer",
    description: "Manage the event, review submissions, and coordinate the program.",
  },
  {
    id: "track-reviewer",
    role: "reviewer",
    label: "Track reviewer",
    description: "Evaluate proposals in the Platform track with the shared review queue.",
  },
  {
    id: "accepted-speaker",
    role: "speaker",
    label: "Accepted speaker",
    description: "Open a private signed portal for one accepted talk and its onboarding tasks.",
  },
] as const;

const demoCookieName = "chartstead_demo_persona";
const demoSigningSecret = "demo-local-signing-secret-not-for-production";
const demoAdmin = {
  id: "demo-admin",
  displayName: "Demo Administrator",
  role: "admin",
  eventIds: seedEvents.map((event) => event.id),
} satisfies OrganizerPrincipal;
const demoReviewer = {
  id: "demo-track-reviewer",
  name: "Platform Track Reviewer",
  email: "platform-reviewer@chartstead-demo.invalid",
} satisfies AuthenticatedUser;

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function resolveDemoPrincipal(
  request: Request,
  env: AppBindings,
): Promise<OrganizerPrincipal | null> {
  switch (cookieValue(request, demoCookieName)) {
    case "track-reviewer":
      return loadPrincipalForUser(env.AUTH_DB, demoReviewer);
    case "accepted-speaker":
      return null;
    default:
      return demoAdmin;
  }
}

function personaCookie(personaId: (typeof demoPersonas)[number]["id"]): string {
  return `${demoCookieName}=${encodeURIComponent(personaId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

async function tokenFromOutbox(
  env: AppBindings,
  outboxId: string,
): Promise<string | null> {
  const bodies = await env.EVENT_STORE.getByName(demoEventId).getOutboxBodies(outboxId);
  return bodies?.text.match(/reviewer-invitations\/([^\s]+)/)?.[1] ?? null;
}

async function provisionDemoReviewer(env: AppBindings): Promise<void> {
  const adminApp = createApp({
    resolvePrincipal: async () => demoAdmin,
    emailSender: null,
    signingSecret: demoSigningSecret,
  });
  const existingMembership = await env.AUTH_DB.prepare(
    `SELECT role FROM event_memberships WHERE event_id = ? AND user_id = ? LIMIT 1`,
  )
    .bind(demoEventId, demoReviewer.id)
    .first<{ role: string }>();
  if (existingMembership?.role === "reviewer") {
    const assignments = await env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ? ORDER BY track_id`,
    )
      .bind(demoEventId, demoReviewer.id)
      .all<{ track_id: string }>();
    if (
      assignments.results.length === 1 &&
      assignments.results[0]?.track_id === "platform"
    ) {
      return;
    }
    const restored = await adminApp.request(
      `https://chartstead.demo/api/events/${demoEventId}/reviewers/${demoReviewer.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackIds: ["platform"] }),
      },
      env,
    );
    if (restored.status !== 200) {
      throw new Error(`Unable to restore the demo reviewer track (${restored.status}).`);
    }
    return;
  }

  await adminApp.request(`https://chartstead.demo/api/events/${demoEventId}`, undefined, env);

  const pending = await env.AUTH_DB.prepare(
    `SELECT outbox_id, expires_at FROM reviewer_invitations
     WHERE event_id = ? AND email = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(demoEventId, demoReviewer.email)
    .first<{ outbox_id: string; expires_at: string }>();
  let token =
    pending && Date.parse(pending.expires_at) > Date.now()
      ? await tokenFromOutbox(env, pending.outbox_id)
      : null;

  if (!token) {
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `DELETE FROM reviewer_invitations WHERE event_id = ? AND email = ?`,
      ).bind(demoEventId, demoReviewer.email),
      env.AUTH_DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(demoReviewer.id),
    ]);
    const invited = await adminApp.request(
      `https://chartstead.demo/api/events/${demoEventId}/reviewers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: demoReviewer.email, trackIds: ["platform"] }),
      },
      env,
    );
    if (invited.status !== 202) {
      throw new Error(`Unable to provision the demo reviewer invitation (${invited.status}).`);
    }
    const invitation = await invited.json<{ invitation: { id: string } }>();
    const row = await env.AUTH_DB.prepare(
      `SELECT outbox_id FROM reviewer_invitations WHERE id = ? LIMIT 1`,
    )
      .bind(invitation.invitation.id)
      .first<{ outbox_id: string }>();
    token = row ? await tokenFromOutbox(env, row.outbox_id) : null;
  }
  if (!token) throw new Error("Unable to recover the demo reviewer invitation.");

  const now = Date.now();
  await env.AUTH_DB.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       emailVerified = 1,
       updatedAt = excluded.updatedAt`,
  )
    .bind(demoReviewer.id, demoReviewer.name, demoReviewer.email, now, now)
    .run();

  const acceptanceApp = createApp({
    resolvePrincipal: async () => null,
    resolveAuthenticatedUser: async () => demoReviewer,
    emailSender: null,
    signingSecret: demoSigningSecret,
  });
  const accepted = await acceptanceApp.request(
    `https://chartstead.demo/api/reviewer-invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
    env,
  );
  if (accepted.status !== 200) {
    throw new Error(`Unable to accept the demo reviewer invitation (${accepted.status}).`);
  }
}

async function provisionDemoSpeaker(env: AppBindings): Promise<{
  token: string;
  planId: string;
  speakerId: string;
}> {
  const adminApp = createApp({
    resolvePrincipal: async () => demoAdmin,
    emailSender: null,
    signingSecret: demoSigningSecret,
  });
  const idempotencyKey = "demo-evaluator-accepted-speaker-v1";
  const planned = await adminApp.request(
    `https://chartstead.demo/api/events/${demoEventId}/course-checks/guaranteed-speakers`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        sourceLabel: "Evaluation-ready demo",
        title: "Building trustworthy public-data platforms",
        format: "talk",
        trackId: "platform",
        speakers: [
          {
            name: "Maya Chen",
            email: "maya.chen@chartstead-demo.invalid",
            biography:
              "Maya leads public-data platform programs and helps teams make trustworthy delivery decisions.",
          },
        ],
        idempotencyKey,
      }),
    },
    env,
  );
  if (planned.status !== 200 && planned.status !== 201) {
    throw new Error(`Unable to prepare the demo speaker (${planned.status}).`);
  }
  const plan = await planned.json<CourseCheckPlan>();
  const applied = await adminApp.request(
    `https://chartstead.demo/api/events/${demoEventId}/course-checks/${encodeURIComponent(plan.id)}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${idempotencyKey}-apply`,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `${idempotencyKey}-apply`,
      }),
    },
    env,
  );
  if (applied.status !== 200) {
    throw new Error(`Unable to apply the demo speaker Course Check (${applied.status}).`);
  }

  const store = env.EVENT_STORE.getByName(demoEventId);
  const cascade = await store.getGuaranteedCascade(plan.id);
  const grant = cascade.portalTokens[0];
  if (!grant) throw new Error("Demo speaker portal access was not created.");
  if (grant.signedToken && Date.parse(grant.expiresAt) > Date.now() + 86_400_000) {
    return { token: grant.signedToken, planId: plan.id, speakerId: grant.speakerId };
  }
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const signedToken = await signPortalToken(demoSigningSecret, {
    v: 1,
    kind: "portal",
    eventId: demoEventId,
    speakerId: grant.speakerId,
    tokenId: grant.tokenId,
    exp,
  });
  await store.setPortalTokenSignature({
    tokenId: grant.tokenId,
    signedToken,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
  return { token: signedToken, planId: plan.id, speakerId: grant.speakerId };
}

async function resetDemoFixtures(env: AppBindings): Promise<Response> {
  await provisionDemoReviewer(env);
  const store = env.EVENT_STORE.getByName(demoEventId);
  const reviewerProposalId = "SUB-PODS0001";
  if (!(await store.resetProposalReviewFixture(reviewerProposalId))) {
    throw new Error("Unable to reset the demo review fixture.");
  }

  const speaker = await provisionDemoSpeaker(env);
  const speakerReset = await store.resetSpeakerPortalFixture({
    courseCheckPlanId: speaker.planId,
    speakerId: speaker.speakerId,
    name: "Maya Chen",
    biography:
      "Maya leads public-data platform programs and helps teams make trustworthy delivery decisions.",
  });
  if (!speakerReset.reset) throw new Error("Unable to reset the demo speaker fixture.");
  if (env.ASSETS) {
    for (const objectKey of speakerReset.objectKeys) await env.ASSETS.delete(objectKey);
  }
  return Response.json({
    reset: true,
    restored: ["track-reviewer", "accepted-speaker"],
  });
}

export function getDemoPersonaDirectory(): Response {
  const event = seedEvents.find((candidate) => candidate.id === demoEventId);
  if (!event) return Response.json({ error: "Demo event unavailable." }, { status: 503 });
  return Response.json({
    event: { id: event.id, name: event.name },
    personas: demoPersonas,
  });
}

export function isDemoPersonaDirectoryRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === "GET" && url.pathname === "/api/demo/personas";
}

export async function handleDemoPersonaRequest(
  request: Request,
  env: AppBindings,
): Promise<Response | null> {
  if (isDemoPersonaDirectoryRequest(request)) return getDemoPersonaDirectory();
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/demo/personas/reset") {
    return resetDemoFixtures(env);
  }
  const match = url.pathname.match(/^\/api\/demo\/personas\/([^/]+)\/enter$/);
  if (request.method !== "POST" || !match) return null;
  const personaId = match[1];
  if (personaId === "organizer") {
    return Response.json(
      {
        path: `/e/${demoEventId}/submissions`,
        persona: { role: "admin", trackIds: null },
      },
      { headers: { "set-cookie": personaCookie("organizer") } },
    );
  }
  if (personaId === "track-reviewer") {
    await provisionDemoReviewer(env);
    return Response.json(
      {
        path: `/e/${demoEventId}/submissions?track=platform`,
        persona: { role: "reviewer", trackIds: ["platform"] },
      },
      { headers: { "set-cookie": personaCookie("track-reviewer") } },
    );
  }
  if (personaId === "accepted-speaker") {
    const { token } = await provisionDemoSpeaker(env);
    return Response.json(
      {
        path: `/e/${demoEventId}/portal/${encodeURIComponent(token)}`,
        persona: { role: "speaker" },
      },
      { headers: { "set-cookie": personaCookie("accepted-speaker") } },
    );
  }
  return Response.json({ error: "Demo persona not found." }, { status: 404 });
}
