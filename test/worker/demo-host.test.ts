import { describe, expect, it } from "vitest";

import {
  DEMO_CANONICAL_ORIGIN,
  isDemoWorkerPath,
  redirectLegacyDemoHost,
} from "../../worker/demo-host";

describe("legacy demo host redirect", () => {
  it("sends workers.dev paths to demo.chartstead.com", () => {
    const response = redirectLegacyDemoHost(
      new Request(
        "https://chartstead-demo.mayberrydt.workers.dev/demo?persona=organizer",
      ),
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(308);
    expect(response!.headers.get("Location")).toBe(
      `${DEMO_CANONICAL_ORIGIN}/demo?persona=organizer`,
    );
  });

  it("preserves method on API posts to the legacy host", () => {
    const response = redirectLegacyDemoHost(
      new Request("https://chartstead-demo.mayberrydt.workers.dev/api/events", {
        method: "POST",
      }),
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(308);
    expect(response!.headers.get("Location")).toBe(
      `${DEMO_CANONICAL_ORIGIN}/api/events`,
    );
  });

  it("leaves first-party and local hosts alone", () => {
    expect(
      redirectLegacyDemoHost(new Request("https://demo.chartstead.com/demo")),
    ).toBeNull();
    expect(
      redirectLegacyDemoHost(new Request("http://127.0.0.1:5173/demo")),
    ).toBeNull();
    expect(
      redirectLegacyDemoHost(new Request("http://100.105.117.93:5173/demo")),
    ).toBeNull();
  });

  it("classifies worker-handled paths", () => {
    expect(isDemoWorkerPath("/api/health")).toBe(true);
    expect(isDemoWorkerPath("/mcp")).toBe(true);
    expect(isDemoWorkerPath("/demo")).toBe(false);
    expect(isDemoWorkerPath("/e/pacific-open-data-summit-2026/cfp")).toBe(false);
  });
});
