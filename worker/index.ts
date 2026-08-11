import { createApp } from "./app";
import { createResendSender } from "./email";
import { flushEventOutbox } from "./outbox";
import { seedEvents } from "./seed-events";
import type { AppBindings } from "./types";

export { EventStore } from "./event-store";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(_controller, env) {
    const sender = createResendSender(env);
    if (!sender) return;

    const now = new Date();
    for (const event of seedEvents) {
      const store = env.EVENT_STORE.getByName(event.id);
      await flushEventOutbox({
        store,
        sender,
        now,
        limit: 50,
      });
    }
  },
} satisfies ExportedHandler<AppBindings>;
