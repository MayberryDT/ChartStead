import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import type { OrganizerPrincipal } from "../shared/events";
import type { AppBindings } from "./types";

async function sendMagicLink(
  env: AppBindings,
  email: string,
  url: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    throw new Error("Magic-link email is not configured for this environment.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: email,
      subject: "Sign in to ChartStead",
      text: `Open your ChartStead event desk: ${url}`,
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
    trustedOrigins: [env.BETTER_AUTH_URL],
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

  return loadPrincipalForUser(env.AUTH_DB, {
    id: session.user.id,
    name: session.user.name,
  });
}
