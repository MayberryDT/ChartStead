import { createApp } from "./app";
import {
  pullAirtableForEvent,
  resolveAirtableConnection,
} from "./airtable/sync";
import { createResendCommunicationSender, createResendSender } from "./email";
import { flushCommunicationEffects } from "./course-check/communication-delivery";
import { flushEventOutbox } from "./outbox";
import {
  handleDemoPersonaRequest,
  resolveDemoPrincipal,
} from "./demo-personas";
import { listAllEventWorkspaceIds, loadEventWorkspace } from "./event-catalog";
import { seedEvents } from "./seed-events";
import type { AppBindings } from "./types";

export { EventStore } from "./event-store";

const app = createApp({
  resolvePrincipal: async (request, env) => {
    const principal = await resolveDemoPrincipal(request, env);
    if (principal?.id === "demo-admin") {
      const now = Date.now();
      await env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('demo-admin', 'Demo Administrator', 'demo-admin@chartstead.test', 1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
        .bind(now, now)
        .run();
    }
    return principal;
  },
  // Demo/e2e only — production uses BETTER_AUTH_SECRET from the environment.
  signingSecret: "demo-local-signing-secret-not-for-production",
});

async function ensureDemoShowcase(env: AppBindings): Promise<void> {
  for (const seed of seedEvents) {
    await loadEventWorkspace(env, seed.id);
    env.EVENT_STORE.getByName(seed.id).seedDemoShowcaseIfNeeded();
  }
}

export default {
  fetch: async (request: Request, env: AppBindings, ctx: ExecutionContext) => {
    await ensureDemoShowcase(env);
    return (await handleDemoPersonaRequest(request, env)) ?? app.fetch(request, env, ctx);
  },
  async scheduled(_controller, env) {
    const sender = createResendSender(env);
    const communicationSender = createResendCommunicationSender(env);
    const now = new Date();
    for (const eventId of await listAllEventWorkspaceIds(env.AUTH_DB)) {
      const store = env.EVENT_STORE.getByName(eventId);
      if (sender) {
        await flushEventOutbox({
          store,
          sender,
          now,
          limit: 50,
        });
      }
      if (communicationSender) {
        await flushCommunicationEffects({
          store,
          sender: communicationSender,
          now,
          limit: 50,
        });
      }
      const connection = await resolveAirtableConnection({ store, env });
      if (connection) {
        await pullAirtableForEvent({
          store,
          client: connection.client,
          baseId: connection.baseId,
          now,
        });
      }
    }
  },
} satisfies ExportedHandler<AppBindings>;
