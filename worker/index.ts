import { createApp } from "./app";
import {
  pullAirtableForEvent,
  resolveAirtableConnection,
} from "./airtable/sync";
import { createResendCommunicationSender, createResendSender } from "./email";
import { flushCommunicationEffects } from "./course-check/communication-delivery";
import { flushEventOutbox } from "./outbox";
import { listAllEventWorkspaceIds } from "./event-catalog";
import type { AppBindings } from "./types";

export { EventStore } from "./event-store";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(_controller, env) {
    const sender = createResendSender(env);
    const communicationSender = createResendCommunicationSender(env);
    const now = new Date();

    for (const eventId of await listAllEventWorkspaceIds(env.AUTH_DB)) {
      const store = env.EVENT_STORE.getByName(eventId);
      await store.processAutomaticOnboardingReminders();
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
      // Interval pull when Settings or env is configured; never on interactive hot path.
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
