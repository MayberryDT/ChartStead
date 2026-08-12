import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../worker/app";

const eventId = "rocky-mountain-data-days-2027";
const adminId = "competition-20-admin";
const reviewerId = "competition-20-reviewer";

const adminApp = createApp({
  resolvePrincipal: async () => ({
    id: adminId,
    displayName: "Workspace Administrator",
    role: "admin",
    eventIds: ["pacific-open-data-summit-2026"],
  }),
});

const reviewerApp = createApp({
  resolvePrincipal: async () => ({
    id: reviewerId,
    displayName: "Track Reviewer",
    role: "reviewer",
    eventIds: ["pacific-open-data-summit-2026"],
    rolesByEvent: { "pacific-open-data-summit-2026": "reviewer" },
    trackIdsByEvent: { "pacific-open-data-summit-2026": ["platform"] },
  }),
});

async function request(
  app: typeof adminApp,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return app.request(`https://chartstead.test${path}`, init, env);
}

describe("Competition 20 — durable event workspaces", () => {
  beforeAll(async () => {
    const now = Date.now();
    await env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )`).run();
    await env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS event_memberships (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
      PRIMARY KEY (event_id, user_id)
    )`).run();
    await env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS reviewer_track_assignments (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id, track_id)
    )`).run();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(adminId, "Workspace Administrator", "workspace-admin@example.test", now, now),
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(reviewerId, "Track Reviewer", "workspace-reviewer@example.test", now, now),
    ]);
  });

  it("creates an empty event for an administrator and preserves it across reloads", async () => {
    const created = await request(adminApp, "/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: eventId,
        name: "Rocky Mountain Data Days 2027",
        startsOn: "2027-04-15",
        endsOn: "2027-04-17",
        timezone: "America/Denver",
      }),
    });

    expect(created.status).toBe(201);
    const body = await created.json<{
      event: {
        id: string;
        timezone: string;
        submissionCount: number;
        tracks: unknown[];
        rooms: unknown[];
      };
    }>();
    expect(body.event).toMatchObject({
      id: eventId,
      timezone: "America/Denver",
      submissionCount: 0,
      tracks: [],
      rooms: [],
    });

    const listed = await request(adminApp, "/api/events");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ id: eventId, name: "Rocky Mountain Data Days 2027" }),
      ]),
    });

    await evictDurableObject(env.EVENT_STORE.getByName(eventId));
    const reloaded = await request(adminApp, `/api/events/${eventId}`);
    expect(reloaded.status).toBe(200);
    await expect(reloaded.json()).resolves.toMatchObject({
      event: {
        id: eventId,
        timezone: "America/Denver",
        submissionCount: 0,
        unreviewedCount: 0,
        tracks: [],
        rooms: [],
      },
    });

    const proposals = await request(adminApp, `/api/events/${eventId}/proposals`);
    expect(proposals.status).toBe(200);
    await expect(proposals.json()).resolves.toEqual({ proposals: [] });

    const onboarding = await request(adminApp, `/api/events/${eventId}/onboarding`);
    expect(onboarding.status).toBe(200);
    await expect(onboarding.json()).resolves.toMatchObject({ speakers: [], drafts: [] });

    const agenda = await request(adminApp, `/api/events/${eventId}/sessions`);
    expect(agenda.status).toBe(200);
    await expect(agenda.json()).resolves.toMatchObject({
      sessions: [],
      counts: { unplaced: 0, partial: 0, placed: 0, conflicts: 0 },
    });

    const outside = await request(reviewerApp, `/api/events/${eventId}`);
    expect(outside.status).toBe(401);
  });

  it("rejects unauthorized, invalid, and duplicate event creation actionably", async () => {
    const unauthorized = await request(reviewerApp, "/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "reviewer-owned-event",
        name: "Reviewer owned event",
        startsOn: "2027-05-01",
        endsOn: "2027-05-02",
        timezone: "UTC",
      }),
    });
    expect(unauthorized.status).toBe(403);
    await expect(unauthorized.json()).resolves.toMatchObject({
      error: expect.stringMatching(/administrator/i),
    });

    const invalid = await request(adminApp, "/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "backwards-event",
        name: "Backwards event",
        startsOn: "2027-06-03",
        endsOn: "2027-06-01",
        timezone: "Moon/Base",
      }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: expect.stringMatching(/end date|timezone/i),
    });

    const duplicate = await request(adminApp, "/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: eventId,
        name: "A different event",
        startsOn: "2027-07-01",
        endsOn: "2027-07-02",
        timezone: "UTC",
      }),
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: expect.stringMatching(/identifier.*already/i),
    });
  });

  it("adds, renames, and removes unused tracks and rooms without losing invalid edits", async () => {
    const configured = await request(adminApp, `/api/events/${eventId}/configuration`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tracks: [
          { id: "main-stage", name: "Main stage" },
          { id: "workshops", name: "Workshops" },
        ],
        rooms: [
          { id: "ballroom", name: "Ballroom", readiness: "ready" },
          { id: "studio", name: "Studio", readiness: "pending" },
        ],
      }),
    });
    expect(configured.status).toBe(200);

    const renamed = await request(adminApp, `/api/events/${eventId}/configuration`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tracks: [{ id: "main-stage", name: "Plenary" }],
        rooms: [{ id: "ballroom", name: "Grand Ballroom", readiness: "ready" }],
      }),
    });
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({
      event: {
        tracks: [{ id: "main-stage", name: "Plenary", proposalCount: 0 }],
        rooms: [{ id: "ballroom", name: "Grand Ballroom", readiness: "ready" }],
      },
    });

    const formName = "Rocky Mountain CFP";
    const form = await request(adminApp, `/api/events/${eventId}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: formName }),
    });
    expect(form.status).toBe(201);
    const seedForms = await request(
      adminApp,
      "/api/events/pacific-open-data-summit-2026/forms",
    );
    expect(seedForms.status).toBe(200);
    const seedFormsBody = await seedForms.json<{ forms: Array<{ name: string }> }>();
    expect(seedFormsBody.forms.map((candidate) => candidate.name)).not.toContain(formName);

    const reviewer = await request(adminApp, `/api/events/${eventId}/reviewers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "workspace-reviewer@example.test",
        trackIds: ["main-stage"],
      }),
    });
    expect(reviewer.status).toBe(200);
    const reviewerView = await request(reviewerApp, `/api/events/${eventId}`);
    expect(reviewerView.status).toBe(200);
    await expect(reviewerView.json()).resolves.toMatchObject({
      event: { id: eventId, tracks: [{ id: "main-stage", name: "Plenary" }] },
      principal: { id: reviewerId },
    });

    const assignedTrackRemoval = await request(
      adminApp,
      `/api/events/${eventId}/configuration`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracks: [] }),
      },
    );
    expect(assignedTrackRemoval.status).toBe(409);
    await expect(assignedTrackRemoval.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Plenary.*reviewer|reviewer.*Plenary/i),
    });

    const invalid = await request(adminApp, `/api/events/${eventId}/configuration`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startsOn: "2027-04-20",
        endsOn: "2027-04-19",
        tracks: [
          { id: "main-stage", name: "Plenary" },
          { id: "duplicate", name: "One" },
          { id: "duplicate", name: "Two" },
        ],
      }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: expect.stringMatching(/end date|duplicate track/i),
    });

    const unchanged = await request(adminApp, `/api/events/${eventId}`);
    await expect(unchanged.json()).resolves.toMatchObject({
      event: {
        startsOn: "2027-04-15",
        endsOn: "2027-04-17",
        tracks: [{ id: "main-stage", name: "Plenary" }],
        rooms: [{ id: "ballroom", name: "Grand Ballroom" }],
      },
    });
  });

  it("blocks removal of tracks and rooms already used by program records", async () => {
    const seed = await request(adminApp, "/api/events/pacific-open-data-summit-2026");
    expect(seed.status).toBe(200);
    const seedBody = await seed.json<{
      event: { tracks: unknown[]; rooms: unknown[] };
    }>();
    const program = await request(
      adminApp,
      "/api/events/pacific-open-data-summit-2026/program",
    );
    expect(program.status).toBe(200);
    const createDecision = await request(
      adminApp,
      "/api/events/pacific-open-data-summit-2026/course-checks/decisions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "competition-20-room-plan",
        },
        body: JSON.stringify({
          proposalId: "SUB-PODS0027",
          outcome: "accepted",
          idempotencyKey: "competition-20-room-plan",
        }),
      },
    );
    expect(createDecision.status).toBe(201);
    const plan = await createDecision.json<{
      id: string;
      version: number;
      digest: string;
      body: { session: { plannedId: string } };
    }>();
    const applyDecision = await request(
      adminApp,
      `/api/events/pacific-open-data-summit-2026/course-checks/${plan.id}/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "competition-20-room-apply",
        },
        body: JSON.stringify({
          planVersion: plan.version,
          digest: plan.digest,
          stageId: "apply-decision",
          idempotencyKey: "competition-20-room-apply",
        }),
      },
    );
    expect(applyDecision.status).toBe(200);
    const place = await request(
      adminApp,
      `/api/events/pacific-open-data-summit-2026/sessions/${plan.body.session.plannedId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "harbor-hall" }),
      },
    );
    expect(place.status).toBe(200);

    const removeTrack = await request(
      adminApp,
      "/api/events/pacific-open-data-summit-2026/configuration",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tracks: seedBody.event.tracks.filter(
            (track) => (track as { id: string }).id !== "platform",
          ),
        }),
      },
    );
    expect(removeTrack.status).toBe(409);
    await expect(removeTrack.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Platform.*proposal|proposal.*Platform/i),
    });

    const removeRoom = await request(
      adminApp,
      "/api/events/pacific-open-data-summit-2026/configuration",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rooms: seedBody.event.rooms.filter(
            (room) => (room as { id: string }).id !== "harbor-hall",
          ),
        }),
      },
    );
    expect(removeRoom.status).toBe(409);
    await expect(removeRoom.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Harbor Hall.*session|session.*Harbor Hall/i),
    });
  });
});
