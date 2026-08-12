import { describe, expect, it } from "vitest";

import {
  COURSE_CHECK_HUMAN_VALIDATION_MATRIX,
  COURSE_CHECK_UX_ACCEPTANCE_MATRIX,
} from "../fixtures/course-check-acceptance-matrix";

const checklistIds = [
  "TF1", "TF2", "TF3",
  "FP1", "FP2", "FP3",
  "I1", "I2", "I3", "I4", "I5", "I6",
  "N1", "N2", "N3", "N4",
  "P1", "P2", "P3", "P4",
  "M1", "M2", "M3", "M4", "M5", "M6",
  "C1", "C2", "C3", "C4",
  "A1", "A2", "A3", "A4", "A5", "A6",
] as const;

describe("Course Check UX acceptance traceability", () => {
  it("maps every research checklist item exactly once to durable evidence", () => {
    expect(COURSE_CHECK_UX_ACCEPTANCE_MATRIX.map((row) => row.id)).toEqual(checklistIds);
    expect(new Set(COURSE_CHECK_UX_ACCEPTANCE_MATRIX.map((row) => row.id)).size).toBe(36);
    expect(COURSE_CHECK_UX_ACCEPTANCE_MATRIX).toHaveLength(36);
    for (const row of COURSE_CHECK_UX_ACCEPTANCE_MATRIX) {
      expect(row.requirement.length).toBeGreaterThan(20);
      expect(["test", "kernel_invariant", "real_human_validation"]).toContain(
        row.evidence.kind,
      );
      expect(row.evidence.reference.length).toBeGreaterThan(8);
      const sourcePath = row.evidence.reference.split(" — ")[0];
      expect(
        existsSync(resolve(process.cwd(), sourcePath)),
        `${row.id} references missing evidence ${sourcePath}`,
      ).toBe(true);
    }
  });

  it("labels participant-only claims separately instead of treating browser runs as human evidence", () => {
    expect(COURSE_CHECK_HUMAN_VALIDATION_MATRIX.map((row) => row.id)).toEqual([
      "H1", "H2", "H3", "H4", "H5", "H6",
    ]);
    for (const row of COURSE_CHECK_HUMAN_VALIDATION_MATRIX) {
      expect(row.evidence.kind).toBe("real_human_validation");
      expect(row.evidence.reference).toMatch(/not automated evidence/i);
    }
    expect(COURSE_CHECK_HUMAN_VALIDATION_MATRIX[0]?.requirement).toMatch(
      /5–6 representative administrators/i,
    );
  });
});
import { existsSync } from "node:fs";
import { resolve } from "node:path";
