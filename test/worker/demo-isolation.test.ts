import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createApp } from "../../worker/app";
import indexSource from "../../worker/index.ts?raw";
import demoSource from "../../worker/demo.ts?raw";
import demoPersonaSource from "../../worker/demo-personas.ts?raw";

describe("demo isolation vs production entrypoint", () => {
  it("production SELF entrypoint rejects unauthenticated organizer list", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/events");
    expect(response.status).toBe(401);
    const body = await response.json().catch(() => ({}));
    expect(JSON.stringify(body).toLowerCase()).not.toContain("demo-admin");
  });

  it("production SELF entrypoint does not expose demo persona routes", async () => {
    const response = await SELF.fetch("https://chartstead.test/api/demo/personas");
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json().catch(() => ({})))).not.toMatch(
      /organizer|track-reviewer|accepted-speaker|demo-track-reviewer/i,
    );
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
    expect(indexSource).not.toMatch(/demo-personas|accepted-speaker|track-reviewer/);
  });

  it("the isolated demo entry graph is the only place that pins demo access", () => {
    expect(demoSource).toMatch(/demo-personas/);
    expect(demoSource).toMatch(/signingSecret/);
    expect(demoPersonaSource).toMatch(/demo-admin/);
    expect(demoPersonaSource).toMatch(/Demo Administrator/);
    expect(demoPersonaSource).toMatch(/accepted-speaker/);
  });
});
