import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createApp } from "../../worker/app";
import indexSource from "../../worker/index.ts?raw";
import demoSource from "../../worker/demo.ts?raw";

describe("demo isolation vs production entrypoint", () => {
  it("production SELF entrypoint rejects unauthenticated organizer list", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/events");
    expect(response.status).toBe(401);
    const body = await response.json().catch(() => ({}));
    expect(JSON.stringify(body).toLowerCase()).not.toContain("demo-admin");
  });

  it("createApp() without demo override does not grant organizer access", async () => {
    const productionShaped = createApp({
      resolvePrincipal: async () => null,
    });
    const response = await productionShaped.request(
      "https://chartstead.test/api/events",
    );
    expect(response.status).toBe(401);
  });

  it("worker/index.ts does not hardcode the demo principal", () => {
    expect(indexSource).toContain("createApp()");
    expect(indexSource).not.toMatch(/demo-admin/);
    expect(indexSource).not.toMatch(/Demo Administrator/);
    expect(indexSource).not.toMatch(/demo-local-signing-secret/);
  });

  it("worker/demo.ts is the only entry that pins demo-admin", () => {
    expect(demoSource).toMatch(/demo-admin/);
    expect(demoSource).toMatch(/Demo Administrator/);
    expect(demoSource).toMatch(/signingSecret/);
  });
});
