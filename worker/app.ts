import { Hono } from "hono";

import {
  createAuth,
  resolveProductionPrincipal,
  type Principal,
} from "./auth";
import type { AppBindings } from "./types";
import { seedEventId } from "./event-store";


type PrincipalResolver = (
  request: Request,
  env: AppBindings,
) => Promise<Principal | null>;

interface AppOptions {
  resolvePrincipal?: PrincipalResolver;
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

  app.get("/api/events/current", async (c) => {
    const principal = await resolvePrincipal(c.req.raw, c.env);
    if (!principal) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const event = await c.env.EVENT_STORE.getByName(seedEventId).getEvent();
    return c.json({ event, principal });
  });

  return app;
}
