import { describe, expect, it } from "vitest";

import {
  PRODUCTION_CANONICAL_ORIGIN,
  isProductionWorkerPath,
  redirectLegacyProductionHost,
} from "../../worker/production-host";

describe("legacy production host redirect", () => {
  it("sends workers.dev paths to app.chartstead.com", () => {
    const response = redirectLegacyProductionHost(
      new Request("https://chartstead.mayberrydt.workers.dev/api/health?ready=1"),
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(308);
    expect(response!.headers.get("Location")).toBe(
      `${PRODUCTION_CANONICAL_ORIGIN}/api/health?ready=1`,
    );
  });

  it("preserves method on API posts to the legacy host", () => {
    const response = redirectLegacyProductionHost(
      new Request("https://chartstead.mayberrydt.workers.dev/api/events", {
        method: "POST",
      }),
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(308);
    expect(response!.headers.get("Location")).toBe(
      `${PRODUCTION_CANONICAL_ORIGIN}/api/events`,
    );
  });

  it("leaves first-party and local hosts alone", () => {
    expect(
      redirectLegacyProductionHost(new Request("https://app.chartstead.com/")),
    ).toBeNull();
    expect(
      redirectLegacyProductionHost(new Request("http://127.0.0.1:5858/")),
    ).toBeNull();
    expect(
      redirectLegacyProductionHost(new Request("http://100.105.117.93:5858/")),
    ).toBeNull();
    expect(
      redirectLegacyProductionHost(new Request("https://demo.chartstead.com/demo")),
    ).toBeNull();
  });

  it("classifies worker-handled paths", () => {
    expect(isProductionWorkerPath("/api/health")).toBe(true);
    expect(isProductionWorkerPath("/mcp")).toBe(true);
    expect(isProductionWorkerPath("/")).toBe(false);
    expect(isProductionWorkerPath("/e/pacific-open-data-summit-2026/cfp")).toBe(false);
  });
});
