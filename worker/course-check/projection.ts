import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  DecisionReviewGeneratedRecords,
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

function buildDecisionReviewProjection(
  plan: CourseCheckPlan,
  body: DecisionPlanBody,
  options: CourseCheckProjectionOptions,
): DecisionReviewProjection {
  const phase: DecisionReviewProjection["phase"] =
    plan.receipt?.stageId === "apply-decision" ? "applied" : "proposed";
  const selected = body.items.length;
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
    phase === "applied" ? item.status === "applied" : item.status === "active",
  );
  const accepted = scopedItems.filter((item) => item.outcome === "accepted").length;
  const declined = scopedItems.filter((item) => item.outcome === "declined").length;
  const records = generatedRecords(scopedItems);
  const actionLabel = decisionActionLabel(
    accepted,
    declined,
    records.totalCreated,
  );
  const severityRank = { blocker: 0, warning: 1, info: 2 } as const;
  const issues = [...body.findings]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .map((finding) => ({
      severity: finding.severity,
      summary: finding.message,
      nextStep: finding.recoveryGuidance ?? null,
      affectedItemCount: Math.max(
        1,
        body.items.filter((item) =>
          item.findings.some((itemFinding) => itemFinding.id === finding.id),
        ).length,
      ),
    }));
  const issueCounts = issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { blocker: 0, warning: 0, info: 0 },
  );
  const issueSummaryParts: string[] = [];
  if (issueCounts.blocker > 0) {
    issueSummaryParts.push(
      `${issueCounts.blocker} ${plural(
        issueCounts.blocker,
        "item",
      )} that need attention`,
    );
  }
  if (issueCounts.warning > 0) {
    issueSummaryParts.push(
      `${issueCounts.warning} ${plural(issueCounts.warning, "warning")}`,
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
  const unchangedSummary =
    skipped === 0
      ? `No submissions ${phase === "applied" ? "were" : "will stay"} unchanged.`
      : `${skipped} ${plural(skipped, "submission")} ${
          phase === "applied"
            ? skipped === 1
              ? "was"
              : "were"
            : "will stay"
        } unchanged.`;
  const allowedStageIds = new Set(
    options.permittedStageIds ??
      (options.role === "admin" ? body.stages.map((stage) => stage.id) : []),
  );
  const permittedCommits = body.stages
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
          appliedAt: plan.receipt.appliedAt,
          appliedBy: plan.receipt.actor.displayName,
        }
      : null;

  return {
    kind: "decision_review",
    phase,
    title,
    courseCheckSummary,
    counts: { selected, ready, needsAction, warning, skipped },
    issues,
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
        count: skipped,
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
    canDeferItems: options.canDeferItems ?? options.role === "admin",
    canStartDraftPreparation:
      options.canStartDraftPreparation ?? options.role === "admin",
    freshness,
    preCommitBoundary:
      phase === "proposed"
        ? "Nothing has changed. No external communication has been sent."
        : null,
    primaryActionLabel: phase === "proposed" ? (applyCommit?.label ?? null) : null,
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
