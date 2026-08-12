import { describe, expect, it } from "vitest";

import type { DecisionPlanBody } from "../../shared/course-check";
import {
  decisionRevalidationSummary,
  declareDecisionIssueActions,
} from "../../worker/course-check/issue-actions";

const finding = {
  id: "shared-speaker",
  severity: "blocker" as const,
  code: "identity_ambiguity",
  message: "A speaker identity is shared by two submissions.",
  entityRef: "shared@example.test",
};

const body = {
  actionType: "decision",
  findings: [finding],
  items: ["SUB-1", "SUB-2"].map((proposalId, index) => ({
    itemId: `item-${index + 1}`,
    proposalId,
    outcome: "accepted" as const,
    proposalRevision: 1,
    status: "active" as const,
    speakers: [
      {
        plannedId: `speaker-${index + 1}`,
        role: "primary" as const,
        name: "Shared Speaker",
        email: "shared@example.test",
        biography: "",
        match: "create" as const,
        existingSpeakerId: null,
      },
    ],
    participations: [],
    session: null,
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: index === 1 ? [finding] : [],
  })),
  stages: [
    { id: "apply-decision", label: "Apply", status: "out_of_date", verb: "Apply" },
    { id: "prior-import", label: "Import", status: "complete", verb: "Import" },
  ],
} as unknown as DecisionPlanBody;

describe("Course Check issue actions", () => {
  it("expands a shared identity dependency to every affected batch item", () => {
    const actions = declareDecisionIssueActions({
      eventId: "event-1",
      body,
      finding,
      authority: {
        role: "admin",
        canViewFullDecisionEvidence: true,
        canDeferItems: true,
      },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Resolve speaker identity",
          affectedEntityIds: expect.arrayContaining(["SUB-1", "SUB-2"]),
          resultingEffectSummary: expect.stringContaining("all 2 submissions"),
        }),
        expect.objectContaining({
          label: "Skip 2 submissions",
          target: expect.objectContaining({ itemIds: ["item-1", "item-2"] }),
        }),
      ]),
    );
  });

  it("names stale inputs in business language and preserves completed stages", () => {
    const staleBody = {
      ...body,
      findings: [
        {
          id: "stale",
          severity: "blocker" as const,
          code: "relevant_input_changed",
          message: "Relevant inputs changed: SUB-1:reviewVersion, SUB-2:recipients.",
        },
      ],
    };
    const summary = decisionRevalidationSummary({
      eventId: "event-1",
      body: staleBody,
      canViewTargets: true,
    });

    expect(summary).toMatchObject({
      scope: "affected_dependencies",
      affectedItemIds: ["item-1", "item-2"],
      preservedStageIds: ["prior-import"],
    });
    expect(summary.changedInputs.map((row) => row.label)).toEqual([
      "Review decision for SUB-1 changed",
      "Speaker recipients for SUB-2 changed",
    ]);
    expect(summary.changedInputs.every((row) => row.target?.objectType === "proposal")).toBe(true);
  });

  it("redacts mutating commands and source fields from reviewer actions", () => {
    const actions = declareDecisionIssueActions({
      eventId: "event-1",
      body,
      finding,
      authority: {
        role: "reviewer",
        canViewFullDecisionEvidence: false,
        canDeferItems: false,
      },
    });
    expect(actions).toEqual([
      expect.objectContaining({
        label: "View first affected submission",
        target: expect.objectContaining({ field: null }),
      }),
    ]);
    expect(JSON.stringify(actions)).not.toContain("shared@example.test");
  });
});
