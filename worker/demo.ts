import { createApp } from "./app";

export { EventStore } from "./event-store";

export default createApp({
  resolvePrincipal: async () => ({
    id: "demo-admin",
    displayName: "Demo Administrator",
    role: "admin",
  }),
});
