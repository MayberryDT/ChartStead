import { createApp } from "./app";
import {
  pullAirtableForEvent,
  resolveAirtableConnection,
} from "./airtable/sync";
import { createResendSender } from "./email";
import { flushEventOutbox } from "./outbox";
import { seedEvents } from "./seed-events";
import type { AppBindings } from "./types";

export { EventStore } from "./event-store";

const app = createApp({
  resolvePrincipal: async () => ({
    id: "demo-admin",
    displayName: "Demo Administrator",
    role: "admin",
    eventIds: seedEvents.map((event) => event.id),
  }),
  // Demo/e2e only — production uses BETTER_AUTH_SECRET from the environment.
  signingSecret: "demo-local-signing-secret-not-for-production",
});

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(_controller, env) {
    const sender = createResendSender(env);
    const now = new Date();
    for (const event of seedEvents) {
      const store = env.EVENT_STORE.getByName(event.id);
      if (sender) {
        await flushEventOutbox({
          store,
          sender,
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
