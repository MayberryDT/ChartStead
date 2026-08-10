import { createApp } from "./app";
import { seedEvents } from "./seed-events";

export { EventStore } from "./event-store";

export default createApp({
  resolvePrincipal: async () => ({
    id: "demo-admin",
    displayName: "Demo Administrator",
    role: "admin",
    eventIds: seedEvents.map((event) => event.id),
  }),
});
