import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  DecisionReviewGeneratedRecords,
  DecisionReviewIssue,
  DecisionReviewIssueClass,
  DecisionReviewItemProjection,
  DecisionReviewProjection,
  DecisionItem,
  DecisionPlanBody,
} from "../../shared/course-check";
import { redactCommunicationBody } from "./communication-planner";

export type CourseCheckProjectionOptions = {
  role: "admin" | "reviewer" | "agent" | "none";
  /** Assigned track ids for reviewers. Empty = no decision evidence. */
  trackIds: string[];
  canViewCommunicationEvidence: boolean;
  canViewFullDecisionEvidence: boolean;
  /** Stage ids the authenticated principal can execute right now. */
  permittedStageIds?: string[];
  canDeferItems?: boolean;
  canStartDraftPreparation?: boolean;
};

const REDACTED = "[redacted]";

function redactDecisionItem(item: DecisionItem): DecisionItem {
  return {
    ...item,
    speakers: item.speakers.map((speaker) => ({
      ...speaker,
      email: REDACTED,
      biography: REDACTED,
    })),
    portalAccess: item.portalAccess.map((access) => ({
      ...access,
      email: REDACTED,
    })),
    findings: item.findings.filter((finding) => finding.severity === "blocker"),
  };
}

function projectDecisionBody(
  body: DecisionPlanBody,
  options: CourseCheckProjectionOptions,
): DecisionPlanBody {
  if (options.canViewFullDecisionEvidence) return body;
  const allowed = new Set(options.trackIds);
  const items = body.items
    .filter((item) => {
      const trackId = item.session?.trackId;
      // Prefer session track; fall back to allowing if no track (declined)
      if (!trackId) return options.role === "reviewer" && allowed.size > 0;
      return allowed.has(trackId);
    })
    .map(redactDecisionItem);

  const activeIds = new Set(items.map((item) => item.itemId));
  return {
    ...body,
    items,
    proposalId: items[0]?.proposalId ?? body.proposalId,
    speakers: items.flatMap((item) => item.speakers),
    participations: items.flatMap((item) => item.participations),
    session: items.find((item) => item.session)?.session ?? null,
    tasks: items.flatMap((item) => item.tasks),
    portalAccess: items.flatMap((item) => item.portalAccess),
    deltas: body.deltas.filter(
      (delta) => !delta.proposalId || items.some((item) => item.proposalId === delta.proposalId),
    ),
    findings: body.findings.filter((finding) => {
      if (finding.severity === "blocker") return true;
      if (!finding.entityRef) return false;
      return items.some(
        (item) =>
          item.proposalId === finding.entityRef ||
          item.itemId === finding.entityRef,
      );
    }),
    followUpQueue: body.followUpQueue.filter((row) =>
      items.some((item) => item.proposalId === row.proposalId),
    ),
    aggregateProgress: {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      deferred: items.filter((item) => item.status === "deferred").length,
      applied: items.filter((item) => item.status === "applied").length,
    },
    // Keep linked ids so navigation works without leaking foreign tracks.
    linkedPlanIds: body.linkedPlanIds,
    // Drop item-private cascade details for out-of-track leftovers.
    softWarningOverrides: body.softWarningOverrides.filter((row) =>
      activeIds.size === 0 ? false : true,
    ),
  };
}

function redactDecisionEmails(body: DecisionPlanBody): DecisionPlanBody {
  return {
    ...body,
    speakers: body.speakers.map((speaker) => ({ ...speaker, email: REDACTED, biography: REDACTED })),
    portalAccess: body.portalAccess.map((access) => ({ ...access, email: REDACTED })),
    items: body.items.map(redactDecisionItem),
  };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function joinActionClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? "";
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
}

function generatedRecords(items: DecisionItem[]): DecisionReviewGeneratedRecords {
  const records = items.reduce<DecisionReviewGeneratedRecords>(
    (total, item) => {
      total.speakersCreated += item.speakers.filter(
        (speaker) => speaker.match === "create",
      ).length;
      total.speakersReused += item.speakers.filter(
        (speaker) => speaker.match === "reuse",
      ).length;
      total.participationsCreated += item.participations.length;
      total.sessionsCreated += item.session ? 1 : 0;
      total.tasksCreated += item.tasks.length;
      total.portalAccessCreated += item.portalAccess.length;
      return total;
    },
    {
      speakersCreated: 0,
      speakersReused: 0,
      participationsCreated: 0,
      sessionsCreated: 0,
      tasksCreated: 0,
      portalAccessCreated: 0,
      totalCreated: 0,
    },
  );
  records.totalCreated =
    records.speakersCreated +
    records.participationsCreated +
    records.sessionsCreated +
    records.tasksCreated +
    records.portalAccessCreated;
  return records;
}

function decisionSummary(
  accepted: number,
  declined: number,
  phase: DecisionReviewProjection["phase"],
): string {
  const clauses: string[] = [];
  if (accepted > 0) {
    clauses.push(
      `${accepted} ${plural(accepted, "submission")} ${
        phase === "applied" ? (accepted === 1 ? "was" : "were") : "will be"
      } accepted`,
    );
  }
  if (declined > 0) {
    clauses.push(
      `${declined} ${plural(declined, "submission")} ${
        phase === "applied" ? (declined === 1 ? "was" : "were") : "will be"
      } declined`,
    );
  }
  if (clauses.length === 0) {
    return phase === "applied"
      ? "No decisions were applied."
      : "No decisions will be applied.";
  }
  return `${clauses.join(" and ")}.`;
}

function decisionActionLabel(
  accepted: number,
  declined: number,
  recordCount: number,
): string {
  const clauses: string[] = [];
  if (accepted > 0) {
    clauses.push(`Accept ${accepted} ${plural(accepted, "submission")}`);
  }
  if (declined > 0) {
    clauses.push(`decline ${declined} ${plural(declined, "submission")}`);
  }
  if (recordCount > 0) {
    clauses.push(
      `create ${recordCount} related ${plural(recordCount, "record")}`,
    );
  }
  const joined = joinActionClauses(clauses);
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function decisionReviewTitle(
  selected: number,
  accepted: number,
  declined: number,
  phase: DecisionReviewProjection["phase"],
): string {
  if (phase === "applied") {
    if (accepted > 0 && declined === 0) {
      return `Acceptance ${plural(accepted, "decision")} applied`;
    }
    if (declined > 0 && accepted === 0) {
      return `Decline ${plural(declined, "decision")} applied`;
    }
    return "Decision results";
  }
  if (accepted === selected) {
    return `Review ${selected} acceptance ${plural(selected, "decision")}`;
  }
  if (declined === selected) {
    return `Review ${selected} decline ${plural(selected, "decision")}`;
  }
  return `Review ${selected} decisions`;
}

function issueClassForFinding(
  finding: DecisionPlanBody["findings"][number],
): DecisionReviewIssueClass {
  if (
    finding.code === "checker_unavailable" ||
    finding.code.endsWith("_check_unavailable") ||
    finding.code.endsWith("_checker_unavailable")
  ) {
    return "could_not_check";
  }
  if (finding.severity === "blocker") return "needs_action";
  if (finding.severity === "warning") return "check";
  return "details";
}

function issueLabel(
  classification: DecisionReviewIssueClass,
): DecisionReviewIssue["label"] {
  if (classification === "needs_action") return "Needs action";
  if (classification === "could_not_check") return "Could not check";
  if (classification === "check") return "Check";
  return "Details";
}

function issueGroupKey(finding: DecisionPlanBody["findings"][number]): string {
  return [
    issueClassForFinding(finding),
    finding.code,
    finding.recoveryGuidance ?? "",
  ].join("\u0000");
}

function affectedItemsForFinding(
  finding: DecisionPlanBody["findings"][number],
  items: DecisionItem[],
): DecisionItem[] {
  const key = issueGroupKey(finding);
  const direct = items.filter((item) =>
    item.findings.some((itemFinding) => issueGroupKey(itemFinding) === key),
  );
  if (direct.length > 0) return direct;
  if (!finding.entityRef) return [];
  return items.filter(
    (item) =>
      item.itemId === finding.entityRef ||
      item.proposalId === finding.entityRef ||
      item.speakers.some(
        (speaker) =>
          speaker.plannedId === finding.entityRef ||
          speaker.existingSpeakerId === finding.entityRef ||
          speaker.email === finding.entityRef,
      ),
  );
}

function affectedObjectLabel(items: DecisionItem[]): string {
  if (items.length === 0) return "This decision batch";
  if (items.length === 1) {
    const item = items[0]!;
    const title = item.session?.title;
    const speakers = item.speakers.map((speaker) => speaker.name).filter(Boolean);
    if (!title && speakers.length === 0) return item.proposalId;
    const object = title ? `${title} (${item.proposalId})` : item.proposalId;
    return speakers.length > 0 ? `${object} — ${speakers.join(", ")}` : object;
  }
  return `${items.length} submissions: ${items.map((item) => item.proposalId).join(", ")}`;
}

function issueScope(
  affected: DecisionItem[],
  activeItems: DecisionItem[],
  blocks: boolean,
): string {
  if (!blocks) {
    return "This does not block the decision commit.";
  }
  if (affected.length === 0) return "Blocks the permitted decision commit.";
  const otherCount = Math.max(0, activeItems.length - affected.length);
  if (affected.length === 1 && otherCount > 0) {
    return `Blocks ${affected[0]!.proposalId} only; ${otherCount} other ${plural(
      otherCount,
      "submission",
    )} can proceed.`;
  }
  if (affected.length === 1) return `Blocks ${affected[0]!.proposalId}.`;
  if (otherCount > 0) {
    return `Blocks these ${affected.length} submissions; ${otherCount} other ${plural(
      otherCount,
      "submission",
    )} can proceed.`;
  }
  return `Blocks all ${affected.length} selected submissions.`;
}

function issueConsequence(
  classification: DecisionReviewIssueClass,
  finding: DecisionPlanBody["findings"][number],
  affected: DecisionItem[],
): string {
  if (classification === "needs_action") {
    return affected.length === 1
      ? `${affected[0]!.proposalId} will stay unchanged until this is resolved or removed from the batch.`
      : "The affected decisions will stay unchanged until this is resolved or removed from the batch.";
  }
  if (classification === "could_not_check") {
    return finding.severity === "blocker"
      ? "The affected scope cannot proceed while this required check is unavailable."
      : "The check remains unknown; the decision can proceed where policy permits.";
  }
  if (classification === "check") {
    return "The decision can proceed with this warning unchanged.";
  }
  return finding.message;
}

function safeAlternativeLabel(
  classification: DecisionReviewIssueClass,
  finding: DecisionPlanBody["findings"][number],
  affected: DecisionItem[],
): string | null {
  if (classification === "could_not_check") return "Review later";
  if (classification === "details") return null;
  if (classification === "needs_action") return "Leave decision unchanged";
  if (
    finding.code.includes("recipient") ||
    finding.code.includes("readiness") ||
    affected.some((item) => item.outcome === "accepted")
  ) {
    return "Accept without a draft";
  }
  return "Review later";
}

function buildDecisionIssues(
  body: DecisionPlanBody,
  activeItems: DecisionItem[],
): DecisionReviewIssue[] {
  const severityRank: Record<DecisionReviewIssueClass, number> = {
    needs_action: 0,
    could_not_check: 1,
    check: 2,
    details: 3,
  };
  const groups = new Map<
    string,
    {
      finding: DecisionPlanBody["findings"][number];
      affected: DecisionItem[];
    }
  >();
  for (const finding of body.findings) {
    const key = issueGroupKey(finding);
    if (groups.has(key)) continue;
    groups.set(key, {
      finding,
      affected: affectedItemsForFinding(finding, body.items),
    });
  }
  return [...groups.values()]
    .map(({ finding, affected }) => {
      const classification = issueClassForFinding(finding);
      return {
        severity: finding.severity,
        classification,
        label: issueLabel(classification),
        summary: finding.message,
        affectedObjectLabel: affectedObjectLabel(affected),
        consequence: issueConsequence(classification, finding, affected),
        scope: issueScope(
          affected,
          activeItems,
          finding.severity === "blocker",
        ),
        nextStep: finding.recoveryGuidance ?? null,
        safeAlternativeLabel: safeAlternativeLabel(
          classification,
          finding,
          affected,
        ),
        affectedItemCount: Math.max(1, affected.length),
        affectedItems: affected.map((item) => ({
          itemId: item.itemId,
          proposalId: item.proposalId,
        })),
      } satisfies DecisionReviewIssue;
    })
    .sort(
      (a, b) => severityRank[a.classification] - severityRank[b.classification],
    );
}

function itemProjection(
  item: DecisionItem,
  phase: DecisionReviewProjection["phase"],
): DecisionReviewItemProjection {
  const classifications = item.findings.map(issueClassForFinding);
  const needsAction = classifications.includes("needs_action");
  const couldNotCheck = classifications.includes("could_not_check");
  const check = classifications.includes("check") || couldNotCheck;
  const skipped = item.status === "deferred";
  const applied = item.status === "applied" || phase === "applied";
  const speakers = item.speakers.map((speaker) => speaker.name).filter(Boolean);
  return {
    itemId: item.itemId,
    proposalId: item.proposalId,
    proposalLabel: item.session?.title ?? item.proposalId,
    proposedDecision:
      item.outcome === "accepted"
        ? applied
          ? "Accepted"
          : "Will accept"
        : applied
          ? "Declined"
          : "Will decline",
    speakerContext:
      speakers.length === 0
        ? "No speaker records will be created"
        : speakers.join(", "),
    decisionReadiness: skipped
      ? "Skipped"
      : applied
        ? "Applied"
        : needsAction
          ? "Needs action"
          : "Ready",
    draftReadiness: skipped
      ? "Skipped"
      : couldNotCheck
        ? "Could not check"
        : check
          ? "Check"
          : "Not prepared",
    batchOutcome: skipped
      ? applied
        ? "Unchanged"
        : "Will stay unchanged"
      : applied
        ? "Processed"
        : needsAction
          ? "Will stay unchanged"
          : "Will process",
    filter: skipped
      ? "skipped"
      : needsAction
        ? "needs_action"
        : check
          ? "check"
          : "ready",
  };
}

function partialActionLabel(
  baseLabel: string,
  skippedCount: number,
): string {
  if (skippedCount === 0) return baseLabel;
  return `${baseLabel}; leave ${skippedCount} unchanged`;
}

function buildDecisionReviewProjection(
  plan: CourseCheckPlan,
  body: DecisionPlanBody,
  options: CourseCheckProjectionOptions,
): DecisionReviewProjection {
  const phase: DecisionReviewProjection["phase"] =
    plan.receipt?.stageId === "apply-decision" ? "applied" : "proposed";
  const selected = body.items.length;
  const activeItems = body.items.filter((item) => item.status === "active");
  const globalBlocker = body.findings.some(
    (finding) =>
      finding.severity === "blocker" &&
      affectedItemsForFinding(finding, body.items).length === 0,
  );
  const eligibleItems = globalBlocker
    ? []
    : activeItems.filter(
        (item) =>
          !item.findings.some((finding) => finding.severity === "blocker"),
      );
  const blockedItems = activeItems.filter((item) => !eligibleItems.includes(item));
  const ready = body.items.filter(
    (item) =>
      item.status === "active" &&
      !item.findings.some((finding) => finding.severity === "blocker"),
  ).length;
  const needsAction = body.items.filter(
    (item) =>
      item.status === "active" &&
      item.findings.some((finding) => finding.severity === "blocker"),
  ).length;
  const warning = body.items.filter(
    (item) =>
      item.status === "active" &&
      item.findings.some((finding) => finding.severity === "warning"),
  ).length;
  const skipped = body.items.filter((item) => item.status === "deferred").length;
  const scopedItems = body.items.filter((item) =>
    phase === "applied" ? item.status === "applied" : eligibleItems.includes(item),
  );
  const accepted = scopedItems.filter((item) => item.outcome === "accepted").length;
  const declined = scopedItems.filter((item) => item.outcome === "declined").length;
  const records = generatedRecords(scopedItems);
  const actionLabel = decisionActionLabel(
    accepted,
    declined,
    records.totalCreated,
  );
  const issues = buildDecisionIssues(body, activeItems);
  const issueSummaryParts: string[] = [];
  if (needsAction > 0) {
    issueSummaryParts.push(
      `${needsAction} ${plural(
        needsAction,
        "item",
      )} that need attention`,
    );
  }
  if (warning > 0) {
    issueSummaryParts.push(
      `${warning} ${plural(warning, "warning")}`,
    );
  }
  const courseCheckSummary =
    issueSummaryParts.length === 0
      ? "Course Check found no issues."
      : `Course Check found ${issueSummaryParts.join(" and ")}.`;
  const recordsSummary =
    records.totalCreated === 0
      ? `No related records ${phase === "applied" ? "were" : "will be"} created.`
      : `${records.totalCreated} related ${plural(
          records.totalCreated,
          "record",
        )} ${phase === "applied" ? (records.totalCreated === 1 ? "was" : "were") : "will be"} created.`;
  const projectedSkipped =
    phase === "applied" ? skipped : skipped + blockedItems.length;
  const unchangedSummary =
    projectedSkipped === 0
      ? `No submissions ${phase === "applied" ? "were" : "will stay"} unchanged.`
      : `${projectedSkipped} ${plural(projectedSkipped, "submission")} ${
          phase === "applied"
            ? projectedSkipped === 1
              ? "was"
              : "were"
            : "will stay"
        } unchanged.`;
  const allowedStageIds = new Set(
    options.permittedStageIds ??
      (options.role === "admin" ? body.stages.map((stage) => stage.id) : []),
  );
  let permittedCommits: DecisionReviewProjection["permittedCommits"] = body.stages
    .filter(
      (stage) =>
        allowedStageIds.has(stage.id) &&
        (stage.status === "ready" || stage.status === "approved"),
    )
    .map((stage) => ({
      stageId: stage.id,
      label:
        stage.id === "apply-decision"
          ? actionLabel
          : stage.id === "write-airtable"
            ? `Write ${body.airtable.effects.length} ${plural(
                body.airtable.effects.length,
                "record",
              )} to Airtable`
            : stage.verb,
      effectSummary:
        stage.id === "apply-decision"
          ? `${decisionSummary(accepted, declined, phase)} ${recordsSummary}`
          : body.airtable.summary,
    }));
  const mayUseApplyStage = allowedStageIds.has("apply-decision");
  const mayPartiallyExecute =
    phase === "proposed" &&
    eligibleItems.length > 0 &&
    blockedItems.length > 0 &&
    !globalBlocker &&
    mayUseApplyStage &&
    (options.canDeferItems ?? options.role === "admin") &&
    plan.state !== "Out of date" &&
    !body.stages.some((stage) => stage.status === "out_of_date");
  const partialLabel = mayPartiallyExecute
    ? partialActionLabel(actionLabel, projectedSkipped)
    : null;
  if (mayPartiallyExecute && partialLabel) {
    permittedCommits = [
      {
        stageId: "apply-decision",
        label: partialLabel,
        effectSummary: `${decisionSummary(accepted, declined, phase)} ${projectedSkipped} ${plural(
          projectedSkipped,
          "submission",
        )} will stay unchanged.`,
        requiresDeferredItemIds: blockedItems.map((item) => item.itemId),
      },
      ...permittedCommits.filter((commit) => commit.stageId !== "apply-decision"),
    ];
  }
  const applyCommit = permittedCommits.find(
    (commit) => commit.stageId === "apply-decision",
  );
  const freshness =
    plan.state === "Out of date" ||
    body.stages.some((stage) => stage.status === "out_of_date")
      ? {
          state: "out_of_date" as const,
          label: "Source information changed since this review.",
          checkedAt: plan.updatedAt,
        }
      : body.ageWarning?.active
        ? {
            state: "age_warning" as const,
            label: "This review is older than the event freshness window.",
            checkedAt: plan.updatedAt,
          }
        : {
            state: "current" as const,
            label: "Checked against current proposal information.",
            checkedAt: plan.updatedAt,
          };
  const title = decisionReviewTitle(selected, accepted, declined, phase);
  const decisionResultSummary = decisionSummary(accepted, declined, phase);
  const result =
    phase === "applied" && plan.receipt
      ? {
          title,
          summary: `${decisionResultSummary}${
            skipped > 0 ? ` ${unchangedSummary}` : ""
          }`,
          decisions: { accepted, declined, total: accepted + declined },
          generatedRecords: records,
          unchangedCount: skipped,
          drafts: {
            state: "not_prepared" as const,
            count: 0,
            label: "No drafts were prepared.",
          },
          externalCommunication: {
            emailsSent: 0,
            label: "No emails were sent.",
          },
          outcomeCounts: {
            processed: scopedItems.length,
            // Deferred items were never attempted; transactional decision apply
            // either processes the complete active scope or records no receipt.
            failed: 0,
            warned: scopedItems.filter((item) =>
              item.findings.some((finding) => finding.severity === "warning"),
            ).length,
            skipped,
            unchanged: skipped,
          },
          appliedAt: plan.receipt.appliedAt,
          appliedBy: plan.receipt.actor.displayName,
        }
      : null;

  return {
    kind: "decision_review",
    phase,
    title,
    courseCheckSummary,
    counts: {
      selected,
      ready,
      eligible: eligibleItems.length,
      needsAction,
      warning,
      skipped,
    },
    issues,
    items: body.items.map((item) => itemProjection(item, phase)),
    effectGroups: [
      {
        key: "decisions",
        title: "Decisions",
        state: phase === "applied" ? "applied" : "pending",
        count: accepted + declined,
        summary: decisionResultSummary,
      },
      {
        key: "records",
        title: "Generated records",
        state:
          records.totalCreated === 0
            ? "unchanged"
            : phase === "applied"
              ? "applied"
              : "pending",
        count: records.totalCreated,
        summary: recordsSummary,
      },
      {
        key: "unchanged",
        title: "Unchanged",
        state: "unchanged",
        count: projectedSkipped,
        summary: unchangedSummary,
      },
      {
        key: "drafts",
        title: "Drafts",
        state: "unchanged",
        count: 0,
        summary:
          phase === "applied"
            ? "No drafts were prepared."
            : "No drafts will be prepared.",
      },
      {
        key: "external_communication",
        title: "External communication",
        state: "unchanged",
        count: 0,
        summary:
          phase === "applied"
            ? "No emails were sent."
            : "No emails will be sent.",
      },
      ...(body.airtable.effects.length > 0
        ? [
            {
              key: "integration" as const,
              title: "Integration",
              state: "pending" as const,
              count: body.airtable.effects.length,
              summary: body.airtable.summary,
            },
          ]
        : []),
    ],
    permittedCommits,
    partialExecution: {
      eligibleCount: eligibleItems.length,
      skippedCount: projectedSkipped,
      canExecute:
        phase === "proposed" &&
        Boolean(
          permittedCommits.find((commit) => commit.stageId === "apply-decision"),
        ),
      requiredDeferredItemIds: mayPartiallyExecute
        ? blockedItems.map((item) => item.itemId)
        : [],
      primaryActionLabel:
        phase === "proposed"
          ? permittedCommits.find((commit) => commit.stageId === "apply-decision")
              ?.label ?? null
          : null,
      skippedOutcomeLabel: "Leave decision unchanged",
    },
    canDeferItems: options.canDeferItems ?? options.role === "admin",
    canStartDraftPreparation:
      options.canStartDraftPreparation ?? options.role === "admin",
    freshness,
    preCommitBoundary:
      phase === "proposed"
        ? "Nothing has changed. No external communication has been sent."
        : null,
    primaryActionLabel:
      phase === "proposed"
        ? permittedCommits.find((commit) => commit.stageId === "apply-decision")
            ?.label ??
          applyCommit?.label ??
          null
        : null,
    result,
  };
}

/**
 * Role-aware Course Check projection.
 * Admins/agents with full authority see complete evidence.
 * Reviewers see assigned-track decision evidence only (emails redacted).
 * Communication private fields require communication authority.
 */
export function projectCourseCheckForViewer(
  plan: CourseCheckPlan,
  options: CourseCheckProjectionOptions,
): CourseCheckPlan | null {
  if (options.role === "none") return null;

  let projected: CourseCheckPlan = { ...plan, body: plan.body };

  if (plan.body.actionType === "decision") {
    if (options.role === "reviewer") {
      const body = projectDecisionBody(plan.body, options);
      // Reviewers with no matching tracks get an empty projected plan shell.
      projected = { ...projected, body };
    } else if (!options.canViewFullDecisionEvidence) {
      projected = { ...projected, body: redactDecisionEmails(plan.body) };
    }
    if (projected.body.actionType === "decision") {
      projected = {
        ...projected,
        decisionReview: buildDecisionReviewProjection(
          projected,
          projected.body,
          options,
        ),
      };
    }
  }

  if (
    projected.body.actionType === "communication" &&
    !options.canViewCommunicationEvidence
  ) {
    projected = {
      ...projected,
      body: redactCommunicationBody(projected.body as CommunicationPlanBody),
    };
  }

  if (!options.canViewCommunicationEvidence && projected.body.airtable.effects.length > 0) {
    projected = {
      ...projected,
      body: {
        ...projected.body,
        airtable: {
          ...projected.body.airtable,
          redacted: true,
          effects: projected.body.airtable.effects.map((effect) => ({
            ...effect,
            fields: { redacted: true },
            beforeFields: null,
            lastError: effect.lastError
              ? "Integration delivery requires administrator review."
              : null,
          })),
        },
      },
    };
  }

  // Never leak version body payloads that reviewers shouldn't see.
  if (projected.versions && options.role === "reviewer") {
    projected = {
      ...projected,
      versions: projected.versions.map((version) => ({
        ...version,
        body:
          version.body.actionType === "decision"
            ? projectDecisionBody(version.body, options)
            : version.body.actionType === "communication"
              ? redactCommunicationBody(version.body)
              : version.body,
      })),
    };
  }

  return projected;
}

/** Whether a reviewer should see this plan in list views at all. */
export function reviewerCanSeePlan(
  plan: CourseCheckPlan,
  trackIds: string[],
): boolean {
  if (plan.body.actionType !== "decision") {
    // Non-decision plans: reviewers may see state badges only when assigned any track.
    return trackIds.length > 0;
  }
  const allowed = new Set(trackIds);
  return plan.body.items.some((item) => {
    const trackId = item.session?.trackId;
    if (!trackId) return true;
    return allowed.has(trackId);
  });
}
