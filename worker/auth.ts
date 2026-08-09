import { betterAuth } from "better-auth";

import { seedEventId } from "./event-store";
import type { AppBindings } from "./types";

export interface Principal {
  id: string;
  displayName: string;
  role: "admin";
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
    account: {
      encryptOAuthTokens: true,
    },
  });
}

export async function resolveProductionPrincipal(
  request: Request,
  env: AppBindings,
): Promise<Principal | null> {
  const auth = createAuth(env);
  if (!auth) {
    return null;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  const membership = await env.AUTH_DB.prepare(
    `SELECT role
     FROM event_memberships
     WHERE event_id = ? AND user_id = ?`,
  )
    .bind(seedEventId, session.user.id)
    .first<{ role: "admin" | "reviewer" }>();

  if (membership?.role !== "admin") {
    return null;
  }

  return {
    id: session.user.id,
    displayName: session.user.name,
    role: "admin",
  };
}
