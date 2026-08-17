import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import type { OrganizerPrincipal } from "../shared/events";
import { renderMagicLinkEmail } from "./emails/magic-link";
import { listAllEventWorkspaceIds } from "./event-catalog";
import type { AppBindings } from "./types";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export const PRODUCTION_BOOTSTRAP_ADMIN_EMAIL = "tyler@animasai.co";

const TAILSCALE_HOST = "100.105.117.93";
const LOCAL_AUTH_PORTS = ["5173", "5858"];

export function isProductionBootstrapAdmin(email: string): boolean {
  return email.trim().toLowerCase() === PRODUCTION_BOOTSTRAP_ADMIN_EMAIL;
}

export function authTrustedOrigins(baseURL: string | undefined): string[] {
  const origins = new Set<string>();
  if (baseURL) origins.add(baseURL.replace(/\/$/, ""));
  for (const port of LOCAL_AUTH_PORTS) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://${TAILSCALE_HOST}:${port}`);
  }
  origins.add("https://app.chartstead.com");
  origins.add("https://chartstead.mayberrydt.workers.dev");
  return [...origins];
}

/** Google rejects Tailscale CGNAT IPs, so local Google uses localhost. Email links still open on Tailscale. */
export function magicLinkPublicUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = TAILSCALE_HOST;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function emptyPrincipalForUser(user: AuthenticatedUser): OrganizerPrincipal {
  return {
    id: user.id,
    displayName: user.name,
    role: "reviewer",
    eventIds: [],
    rolesByEvent: {},
  };
}

function hasRealSecret(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  return !/replace-with|example\.com|changeme/i.test(trimmed);
}

export function authStatusFromEnv(env: AppBindings): {
  configured: boolean;
  google: boolean;
  magicLink: boolean;
} {
  return {
    configured: hasRealSecret(env.BETTER_AUTH_SECRET),
    google: hasRealSecret(env.GOOGLE_CLIENT_ID) && hasRealSecret(env.GOOGLE_CLIENT_SECRET),
    magicLink: hasRealSecret(env.RESEND_API_KEY) && hasRealSecret(env.AUTH_EMAIL_FROM),
  };
}

export async function grantBootstrapAdminMemberships(
  database: D1Database,
  user: { id: string; email: string },
): Promise<void> {
  if (!isProductionBootstrapAdmin(user.email)) return;
  const eventIds = await listAllEventWorkspaceIds(database);
  if (eventIds.length === 0) return;
  await database.batch(
    eventIds.map((eventId) =>
      database
        .prepare(
          `INSERT INTO event_memberships (event_id, user_id, role)
           VALUES (?, ?, 'admin')
           ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'admin'`,
        )
        .bind(eventId, user.id),
    ),
  );
}

async function sendMagicLink(
  env: AppBindings,
  email: string,
  url: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    throw new Error("Magic-link email is not configured for this environment.");
  }

  const message = await renderMagicLinkEmail({ url: magicLinkPublicUrl(url) });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Magic-link delivery failed with status ${response.status}.`);
  }
}

export function createAuth(env: AppBindings) {
  if (!env.BETTER_AUTH_SECRET) {
    return null;
  }

  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    database: env.AUTH_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: authTrustedOrigins(env.BETTER_AUTH_URL),
    socialProviders: google,
    account: { encryptOAuthTokens: true },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      magicLink({
        storeToken: "hashed",
        sendMagicLink: ({ email, url }) => sendMagicLink(env, email, url),
      }),
    ],
  });
}

export async function loadPrincipalForUser(
  database: D1Database,
  user: { id: string; name: string },
): Promise<OrganizerPrincipal | null> {
  const memberships = await database.prepare(
    `SELECT m.event_id, m.role, r.track_id
     FROM event_memberships AS m
     LEFT JOIN reviewer_track_assignments AS r
       ON r.event_id = m.event_id AND r.user_id = m.user_id
     WHERE m.user_id = ?
     ORDER BY m.event_id, r.track_id`,
  )
    .bind(user.id)
    .all<{ event_id: string; role: "admin" | "reviewer"; track_id: string | null }>();
  const eventIds = [...new Set(memberships.results.map((row) => row.event_id))];
  if (eventIds.length === 0) return null;

  const rolesByEvent: Record<string, "admin" | "reviewer"> = {};
  const trackIdsByEvent: Record<string, string[]> = {};
  for (const membership of memberships.results) {
    rolesByEvent[membership.event_id] = membership.role;
    trackIdsByEvent[membership.event_id] ??= [];
    if (membership.track_id) {
      trackIdsByEvent[membership.event_id]!.push(membership.track_id);
    }
  }

  return {
    id: user.id,
    displayName: user.name,
    role: rolesByEvent[eventIds[0]!] ?? "reviewer",
    eventIds,
    rolesByEvent,
    trackIdsByEvent,
  };
}

export async function resolveProductionPrincipal(
  request: Request,
  env: AppBindings,
): Promise<OrganizerPrincipal | null> {
  const auth = createAuth(env);
  if (!auth) {
    return null;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  await grantBootstrapAdminMemberships(env.AUTH_DB, {
    id: session.user.id,
    email: session.user.email,
  });

  return loadPrincipalForUser(env.AUTH_DB, {
    id: session.user.id,
    name: session.user.name,
  });
}

export async function resolveProductionAuthenticatedUser(
  request: Request,
  env: AppBindings,
): Promise<AuthenticatedUser | null> {
  const auth = createAuth(env);
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}
