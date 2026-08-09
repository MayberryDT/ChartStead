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
    plugins: [
      magicLink({
        storeToken: "hashed",
        sendMagicLink: ({ email, url }) => sendMagicLink(env, email, url),
      }),
    ],
  });
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

  const memberships = await env.AUTH_DB.prepare(
    `SELECT event_id
     FROM event_memberships
     WHERE user_id = ? AND role = 'admin'
     ORDER BY event_id`,
  )
    .bind(session.user.id)
    .all<{ event_id: string }>();
  const eventIds = memberships.results.map((membership) => membership.event_id);

  if (eventIds.length === 0) {
    return null;
  }

  return {
    id: session.user.id,
    displayName: session.user.name,
    role: "admin",
    eventIds,
  };
}
