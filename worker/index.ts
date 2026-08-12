import { createApp } from "./app";
import {
  pullAirtableForEvent,
  resolveAirtableConnection,
} from "./airtable/sync";
import { createResendCommunicationSender, createResendSender } from "./email";
import { flushCommunicationEffects } from "./course-check/communication-delivery";
import { flushEventOutbox } from "./outbox";
import { seedEvents } from "./seed-events";
import type { AppBindings } from "./types";

export { EventStore } from "./event-store";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(_controller, env) {
    const sender = createResendSender(env);
    const communicationSender = createResendCommunicationSender(env);
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
