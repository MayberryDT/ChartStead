import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../worker/app";
import {
  authStatusFromEnv,
  authTrustedOrigins,
  emptyPrincipalForUser,
  magicLinkPublicUrl,
  grantBootstrapAdminMemberships,
  isProductionBootstrapAdmin,
  loadPrincipalForUser,
  PRODUCTION_BOOTSTRAP_ADMIN_EMAIL,
} from "../../worker/auth";
import { renderMagicLinkEmail } from "../../worker/emails/magic-link";
import { seedEvents } from "../../worker/seed-events";
import type { AppBindings } from "../../worker/types";

const productionApp = createApp();

async function ensureAuthTables() {
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
  ]);
}

describe("production login", () => {
  beforeAll(async () => {
    await ensureAuthTables();
  });

  it("keeps the production entrypoint unauthorized without a session and without demo-admin", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/events");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    const text = await (await SELF.fetch("https://chartstead.test/api/events")).text();
    expect(text).not.toContain("demo-admin");
  });

  it("reports auth configuration without exposing secrets", async () => {
    const response = await productionApp.request(
      "https://chartstead.test/api/auth-status",
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<ReturnType<typeof authStatusFromEnv>>();
    expect(body).toEqual({
      configured: expect.any(Boolean),
      google: expect.any(Boolean),
      magicLink: expect.any(Boolean),
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|sk_|re_/i);
  });

  it("returns an empty workspace for a signed-in user with no memberships", async () => {
    const app = createApp({
      resolvePrincipal: async () => null,
      resolveAuthenticatedUser: async () => ({
        id: "signed-in-no-events",
        name: "Pat Example",
        email: "pat@example.test",
      }),
    });
    const response = await app.request("https://chartstead.test/api/events", undefined, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [],
      principal: emptyPrincipalForUser({
        id: "signed-in-no-events",
        name: "Pat Example",
        email: "pat@example.test",
      }),
    });
  });

  it("grants tyler@animasai.co admin membership on every known event", async () => {
    expect(isProductionBootstrapAdmin("Tyler@AnimasAI.co")).toBe(true);
    expect(isProductionBootstrapAdmin("someone@example.test")).toBe(false);

    const now = Date.now();
    const userId = `bootstrap-admin-${crypto.randomUUID()}`;
    await env.AUTH_DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'Tyler', ?, 1, ?, ?)`,
    )
      .bind(userId, PRODUCTION_BOOTSTRAP_ADMIN_EMAIL, now, now)
      .run();

    await grantBootstrapAdminMemberships(env.AUTH_DB, {
      id: userId,
      email: "Tyler@AnimasAI.co",
    });

    const principal = await loadPrincipalForUser(env.AUTH_DB, {
      id: userId,
      name: "Tyler",
    });
    expect(principal?.role).toBe("admin");
    expect(principal?.eventIds).toEqual(expect.arrayContaining(seedEvents.map((event) => event.id)));
    expect(principal?.eventIds).toHaveLength(seedEvents.length);
    expect(principal?.rolesByEvent).toEqual(
      Object.fromEntries(seedEvents.map((event) => [event.id, "admin"])),
    );
  });

  it("does not grant bootstrap memberships to other emails", async () => {
    const now = Date.now();
    const userId = `other-user-${crypto.randomUUID()}`;
    await env.AUTH_DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'Pat', 'pat-other@example.test', 1, ?, ?)`,
    )
      .bind(userId, now, now)
      .run();

    await grantBootstrapAdminMemberships(env.AUTH_DB, {
      id: userId,
      email: "pat-other@example.test",
    });
    const principal = await loadPrincipalForUser(env.AUTH_DB, {
      id: userId,
      name: "Pat",
    });
    expect(principal).toBeNull();
  });

  it("trusts local, Tailscale, and production auth origins", () => {
    expect(authTrustedOrigins("http://localhost:5858")).toEqual(
      expect.arrayContaining([
        "http://100.105.117.93:5858",
        "http://localhost:5173",
        "http://localhost:5858",
        "http://127.0.0.1:5858",
        "https://app.chartstead.com",
        "https://chartstead.mayberrydt.workers.dev",
      ]),
    );
  });

  it("rewrites localhost magic-link emails onto the Tailscale host", () => {
    expect(
      magicLinkPublicUrl("http://localhost:5858/api/auth/magic-link/verify?token=abc"),
    ).toBe("http://100.105.117.93:5858/api/auth/magic-link/verify?token=abc");
    expect(
      magicLinkPublicUrl("http://127.0.0.1:5858/api/auth/magic-link/verify?token=abc"),
    ).toBe("http://100.105.117.93:5858/api/auth/magic-link/verify?token=abc");
    expect(
      magicLinkPublicUrl("http://100.105.117.93:5858/api/auth/magic-link/verify?token=abc"),
    ).toBe("http://100.105.117.93:5858/api/auth/magic-link/verify?token=abc");
    expect(
      magicLinkPublicUrl("https://chartstead.mayberrydt.workers.dev/api/auth/magic-link/verify?token=abc"),
    ).toBe("https://chartstead.mayberrydt.workers.dev/api/auth/magic-link/verify?token=abc");
    expect(
      magicLinkPublicUrl("https://app.chartstead.com/api/auth/magic-link/verify?token=abc"),
    ).toBe("https://app.chartstead.com/api/auth/magic-link/verify?token=abc");
  });

  it("renders a styled magic-link email with a button and plaintext fallback", async () => {
    const message = await renderMagicLinkEmail({
      url: "https://app.chartstead.com/api/auth/magic-link/verify?token=abc",
    });
    expect(message.subject).toBe("Sign in to ChartStead");
    expect(message.html).toContain("Open your event desk");
    expect(message.html).toContain("https://app.chartstead.com/api/auth/magic-link/verify?token=abc");
    expect(message.html).toMatch(/<a[^>]+href=/i);
    expect(message.text).toContain("Open your event desk");
    expect(message.text).toContain("https://app.chartstead.com/api/auth/magic-link/verify?token=abc");
  });

  it("treats missing Google and Resend bindings as unconfigured", () => {
    expect(
      authStatusFromEnv({
        BETTER_AUTH_SECRET: "x".repeat(32),
      } as AppBindings),
    ).toEqual({
      configured: true,
      google: false,
      magicLink: false,
    });
    expect(
      authStatusFromEnv({
        BETTER_AUTH_SECRET: "replace-with-at-least-32-random-characters",
        GOOGLE_CLIENT_ID: "replace-with-google-oauth-client-id",
        GOOGLE_CLIENT_SECRET: "replace-with-google-oauth-client-secret",
        RESEND_API_KEY: "replace-with-resend-api-key",
        AUTH_EMAIL_FROM: "ChartStead <sign-in@example.com>",
      } as AppBindings),
    ).toEqual({
      configured: false,
      google: false,
      magicLink: false,
    });
  });
});
