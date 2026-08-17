import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import demoWorker from "../../worker/demo";

describe("evaluation-ready demo personas", () => {
  beforeAll(async () => {
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" INTEGER NOT NULL DEFAULT 0,
        "image" TEXT,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "event_memberships" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'reviewer')),
        PRIMARY KEY ("event_id", "user_id")
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "reviewer_track_assignments" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "track_id" TEXT NOT NULL,
        PRIMARY KEY ("event_id", "user_id", "track_id")
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "reviewer_invitations" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "event_id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "token_hash" TEXT NOT NULL UNIQUE,
        "track_ids_json" TEXT NOT NULL,
        "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'accepted', 'revoked')),
        "outbox_id" TEXT NOT NULL,
        "expires_at" TEXT NOT NULL,
        "accepted_by_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
        "accepted_at" TEXT,
        "revoked_at" TEXT,
        "created_at" TEXT NOT NULL,
        "updated_at" TEXT NOT NULL
      )`),
    ]);
  });

  it("redirects the legacy workers.dev host before the SPA runs", async () => {
    const response = await demoWorker.fetch(
      new Request("https://chartstead-demo.mayberrydt.workers.dev/demo"),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://demo.chartstead.com/demo");
  });

  it("declares the three safe evaluator entry points without exposing credentials", async () => {
    const response = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      event: { id: string; name: string };
      personas: Array<{
        id: string;
        role: string;
        label: string;
        description: string;
      }>;
    }>();
    expect(body.event).toEqual({
      id: "pacific-open-data-summit-2026",
      name: "Pacific Open Data Summit 2026",
    });
    expect(body.personas.map((persona) => persona.id)).toEqual([
      "organizer",
      "track-reviewer",
      "accepted-speaker",
    ]);
    expect(body.personas.map((persona) => persona.role)).toEqual([
      "admin",
      "reviewer",
      "speaker",
    ]);
    expect(body.personas.every((persona) => persona.label && persona.description)).toBe(true);

    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("password");
  });

  it("enters through an accepted production invitation and keeps a persistent track-scoped review", async () => {
    const entered = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas/track-reviewer/enter", {
        method: "POST",
      }),
      env,
      {} as ExecutionContext,
    );
    expect(entered.status).toBe(200);
    const entry = await entered.json<{ path: string; persona: { role: string; trackIds: string[] } }>();
    expect(entry).toEqual({
      path: "/e/pacific-open-data-summit-2026/submissions?track=platform",
      persona: { role: "reviewer", trackIds: ["platform"] },
    });
    const cookie = entered.headers.get("set-cookie");
    expect(cookie).toMatch(/chartstead_demo_persona=track-reviewer/);

    const requestAsReviewer = (path: string, init?: RequestInit) =>
      demoWorker.fetch(
        new Request(`https://chartstead.test${path}`, {
          ...init,
          headers: { ...Object.fromEntries(new Headers(init?.headers)), cookie: cookie! },
        }),
        env,
        {} as ExecutionContext,
      );

    const events = await requestAsReviewer("/api/events");
    expect(events.status).toBe(200);
    await expect(events.json()).resolves.toMatchObject({
      principal: {
        id: "demo-track-reviewer",
        role: "reviewer",
        rolesByEvent: { "pacific-open-data-summit-2026": "reviewer" },
        trackIdsByEvent: { "pacific-open-data-summit-2026": ["platform"] },
      },
    });

    const queue = await requestAsReviewer(
      "/api/events/pacific-open-data-summit-2026/proposals",
    );
    expect(queue.status).toBe(200);
    const queueBody = await queue.json<{ proposals: Array<{ id: string; trackId: string }> }>();
    expect(queueBody.proposals.length).toBeGreaterThan(0);
    expect(new Set(queueBody.proposals.map((proposal) => proposal.trackId))).toEqual(
      new Set(["platform"]),
    );

    const detailPath =
      "/api/events/pacific-open-data-summit-2026/organizer/proposals/SUB-PODS0001";
    const before = await (await requestAsReviewer(detailPath)).json<{
      proposal: { reviewVersion: number };
    }>();
    const saved = await requestAsReviewer(`${detailPath}/review`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "approve",
        committeeNote: "Strong evidence for the platform track.",
        expectedVersion: before.proposal.reviewVersion,
      }),
    });
    expect(saved.status).toBe(200);

    const reloaded = await requestAsReviewer(detailPath);
    await expect(reloaded.json()).resolves.toMatchObject({
      proposal: {
        status: "approve",
        committeeNote: "Strong evidence for the platform track.",
      },
    });

    const acceptedInvitations = await env.AUTH_DB.prepare(
      `SELECT COUNT(*) AS total FROM reviewer_invitations
       WHERE event_id = ? AND accepted_by_user_id = ?`,
    )
      .bind("pacific-open-data-summit-2026", "demo-track-reviewer")
      .first<{ total: number }>();
    expect(acceptedInvitations?.total).toBe(1);

    const organizerEntry = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas/organizer/enter", {
        method: "POST",
      }),
      env,
      {} as ExecutionContext,
    );
    const changedTracks = await demoWorker.fetch(
      new Request(
        "https://chartstead.test/api/events/pacific-open-data-summit-2026/reviewers/demo-track-reviewer",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: organizerEntry.headers.get("set-cookie")!,
          },
          body: JSON.stringify({ trackIds: ["community"] }),
        },
      ),
      env,
      {} as ExecutionContext,
    );
    expect(changedTracks.status).toBe(200);

    const restoredEntry = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas/track-reviewer/enter", {
        method: "POST",
      }),
      env,
      {} as ExecutionContext,
    );
    const restoredEvents = await demoWorker.fetch(
      new Request("https://chartstead.test/api/events", {
        headers: { cookie: restoredEntry.headers.get("set-cookie")! },
      }),
      env,
      {} as ExecutionContext,
    );
    await expect(restoredEvents.json()).resolves.toMatchObject({
      principal: {
        role: "reviewer",
        trackIdsByEvent: { "pacific-open-data-summit-2026": ["platform"] },
      },
    });
  });

  it("enters an idempotent accepted-speaker journey through a valid production signed portal", async () => {
    const enterSpeaker = () =>
      demoWorker.fetch(
        new Request("https://chartstead.test/api/demo/personas/accepted-speaker/enter", {
          method: "POST",
        }),
        env,
        {} as ExecutionContext,
      );

    const entered = await enterSpeaker();
    expect(entered.status).toBe(200);
    const entry = await entered.json<{ path: string; persona: { role: string } }>();
    expect(entry.persona).toEqual({ role: "speaker" });
    expect(entry.path).toMatch(
      /^\/e\/pacific-open-data-summit-2026\/portal\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(entered.headers.get("set-cookie")).toMatch(
      /chartstead_demo_persona=accepted-speaker/,
    );

    const token = entry.path.split("/").at(-1)!;
    const portal = await demoWorker.fetch(
      new Request(
        `https://chartstead.test/api/events/pacific-open-data-summit-2026/portal?token=${encodeURIComponent(token)}`,
      ),
      env,
      {} as ExecutionContext,
    );
    expect(portal.status).toBe(200);
    const session = await portal.json<{
      acceptanceState: string;
      profile: { id: string; name: string; email: string };
      session: { title: string; trackId: string };
      tasks: Array<{ speakerId: string }>;
      messages: unknown[];
    }>();
    expect(session).toMatchObject({
      acceptanceState: "accepted",
      profile: {
        name: "Maya Chen",
        email: "maya.chen@chartstead-demo.invalid",
      },
      session: {
        title: "Building trustworthy public-data platforms",
        trackId: "platform",
      },
    });
    expect(session.tasks.length).toBeGreaterThanOrEqual(3);
    expect(session.tasks.every((task) => task.speakerId === session.profile.id)).toBe(true);
    const serialized = JSON.stringify(session);
    expect(serialized).not.toMatch(/committeeNote|privateNote|digest|signingSecret/i);

    const repeated = await enterSpeaker();
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ path: entry.path });

    const edited = await demoWorker.fetch(
      new Request(
        `https://chartstead.test/api/events/pacific-open-data-summit-2026/portal/profile?token=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Edited Demo Speaker",
            biography: "A temporary evaluator edit.",
          }),
        },
      ),
      env,
      {} as ExecutionContext,
    );
    expect(edited.status).toBe(200);

    const reset = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas/reset", { method: "POST" }),
      env,
      {} as ExecutionContext,
    );
    expect(reset.status).toBe(200);
    await expect(reset.json()).resolves.toEqual({
      reset: true,
      restored: ["track-reviewer", "accepted-speaker"],
    });

    const speakerAfterReset = await demoWorker.fetch(
      new Request(
        `https://chartstead.test/api/events/pacific-open-data-summit-2026/portal?token=${encodeURIComponent(token)}`,
      ),
      env,
      {} as ExecutionContext,
    );
    await expect(speakerAfterReset.json()).resolves.toMatchObject({
      profile: {
        name: "Maya Chen",
        biography:
          "Maya leads public-data platform programs and helps teams make trustworthy delivery decisions.",
      },
      tasks: expect.arrayContaining([expect.objectContaining({ status: "open" })]),
    });

    const reviewerEntry = await demoWorker.fetch(
      new Request("https://chartstead.test/api/demo/personas/track-reviewer/enter", {
        method: "POST",
      }),
      env,
      {} as ExecutionContext,
    );
    const reviewerDetail = await demoWorker.fetch(
      new Request(
        "https://chartstead.test/api/events/pacific-open-data-summit-2026/organizer/proposals/SUB-PODS0001",
        { headers: { cookie: reviewerEntry.headers.get("set-cookie")! } },
      ),
      env,
      {} as ExecutionContext,
    );
    await expect(reviewerDetail.json()).resolves.toMatchObject({
      proposal: { status: "unreviewed", committeeNote: "", reviewVersion: 0 },
      auditEvents: [],
    });
  });
});
