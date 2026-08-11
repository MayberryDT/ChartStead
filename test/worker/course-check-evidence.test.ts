import { describe, expect, it } from "vitest";

import { buildEvidenceSections, computeAgeWarning } from "../../worker/course-check/evidence";

describe("Course Check evidence and age warnings", () => {
  it("orders evidence sections and expands risk automatically", () => {
    const sections = buildEvidenceSections({
      findings: [
        {
          id: "b1",
          severity: "blocker",
          code: "identity_ambiguity",
          message: "Ambiguous speaker",
        },
        {
          id: "i1",
          severity: "info",
          code: "no_implicit_communication",
          message: "No email",
        },
      ],
      deltas: [
        {
          entityType: "proposal",
          action: "update",
          summary: "Accept proposal",
        },
        {
          entityType: "speaker",
          action: "create",
          summary: "Create speaker",
        },
      ],
    });
    expect(sections.map((s) => s.kind)).toEqual([
      "irreversible",
      "people",
      "public",
      "operational",
      "integration",
      "internal",
    ]);
    expect(sections.find((s) => s.kind === "irreversible")?.defaultExpanded).toBe(true);
    expect(sections.find((s) => s.kind === "integration")?.defaultExpanded).toBe(false);
  });

  it("ages external stages after the configured threshold without hard-blocking", () => {
    const createdAt = "2026-08-10T00:00:00.000Z";
    const now = "2026-08-11T12:00:00.000Z";
    const warning = computeAgeWarning({
      createdAt,
      ageWarningHours: 24,
      stages: [{ external: true }],
      now,
    });
    expect(warning?.active).toBe(true);
    expect(warning?.message).toMatch(/24h/);

    const fresh = computeAgeWarning({
      createdAt: "2026-08-11T10:00:00.000Z",
      ageWarningHours: 24,
      stages: [{ external: true }],
      now,
    });
    expect(fresh?.active).toBe(false);

    const internalOnly = computeAgeWarning({
      createdAt,
      ageWarningHours: 24,
      stages: [{ external: false }],
      now,
    });
    expect(internalOnly).toBeNull();
  });
});
