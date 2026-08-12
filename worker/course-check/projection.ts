import type {
  CommunicationPlanBody,
  CourseCheckSharedApprovalProjection,
  CourseCheckPlan,
  DecisionReviewGeneratedRecords,
  DecisionReviewIssue,
  DecisionReviewIssueClass,
  DecisionReviewItemProjection,
  DecisionReviewProjection,
  DecisionItem,
  DecisionPlanBody,
  ExternalEffectReviewAction,
  ExternalEffectReviewGroup,
  ExternalEffectReviewIssue,
  ExternalEffectReviewPhase,
  ExternalEffectReviewProjection,
  PublicationPlanBody,
  EventCourseCheckPolicy,
} from "../../shared/course-check";
import { DEFAULT_COURSE_CHECK_POLICY } from "../../shared/course-check";
import { redactCommunicationBody } from "./communication-planner";
import {
  decisionRevalidationSummary,
  declareDecisionIssueActions,
} from "./issue-actions";
import { buildCommunicationReviewProjection } from "./communication-results";

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
  /** Authenticated actor used only to explain current policy eligibility. */
  viewerActorId?: string;
  policy?: EventCourseCheckPolicy;
  canViewTechnicalEvidence?: boolean;
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
      if (finding.code === "relevant_input_changed") return items.length > 0;
      return items.some(
        (item) =>
          item.findings.some((itemFinding) => itemFinding.id === finding.id) ||
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

function redactPublicationBody(body: PublicationPlanBody): PublicationPlanBody {
  const calendarIds = body.calendarConsequences.map((operation) => operation.uid);
  const replaceCalendarIds = (value: unknown): unknown => {
    if (typeof value === "string") {
      return calendarIds.reduce(
        (redacted, id) => redacted.replaceAll(id, REDACTED),
        value,
      );
    }
    if (Array.isArray(value)) return value.map(replaceCalendarIds);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === "uid" || key === "calendarUid"
            ? REDACTED
            : replaceCalendarIds(item),
        ]),
      );
    }
    return value;
  };
  const redacted = {
    ...body,
    calendarConsequences: body.calendarConsequences.map((operation) => ({
      ...operation,
      uid: REDACTED,
      recipients: operation.recipients.map(() => ({
        email: REDACTED,
        name: REDACTED,
      })),
    })),
    airtable: {
      ...body.airtable,
      redacted: true,
      effects: body.airtable.effects.map((effect) => ({
        ...effect,
        fields: { redacted: true },
        beforeFields: null,
        providerRecordId: null,
        lastError: effect.lastError
          ? "Integration delivery requires administrator review."
          : null,
      })),
    },
  };
  return replaceCalendarIds(redacted) as PublicationPlanBody;
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
  eventId: string,
  body: DecisionPlanBody,
  activeItems: DecisionItem[],
  options: CourseCheckProjectionOptions,
  revalidation: ReturnType<typeof decisionRevalidationSummary>,
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
        summary:
          finding.code === "relevant_input_changed" &&
          revalidation.changedInputs.length > 0
            ? `${revalidation.changedInputs.map((input) => input.label).join(". ")}.`
            : finding.message,
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
        actions: declareDecisionIssueActions({
          eventId,
          body,
          finding,
          authority: {
            role: options.role,
            canViewFullDecisionEvidence: options.canViewFullDecisionEvidence,
            canDeferItems: options.canDeferItems ?? options.role === "admin",
          },
        }),
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
  const revalidation = decisionRevalidationSummary({
    eventId: plan.eventId,
    body,
    canViewTargets: options.canViewFullDecisionEvidence,
  });
  const issues = buildDecisionIssues(
    plan.eventId,
    body,
    activeItems,
    options,
    revalidation,
  );
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
    revalidation,
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

function externalPhase(plan: CourseCheckPlan): ExternalEffectReviewPhase {
  if (plan.body.actionType === "communication") {
    const summary = plan.body.deliverySummary;
    if (summary.failed > 0 || summary.unknown > 0) return "needs_attention";
    if (summary.total > 0 && summary.succeeded === summary.total) return "complete";
    if (summary.succeeded > 0) return "partially_complete";
    if (
      summary.total > 0 ||
      summary.queued > 0 ||
      summary.sending > 0 ||
      summary.retryScheduled > 0
    ) {
      return "in_progress";
    }
  }
  const activeAirtable =
    plan.body.airtable.disposition === "active" ? plan.body.airtable.effects : [];
  if (
    activeAirtable.some(
      (effect) =>
        effect.state === "unknown" ||
        effect.state === "permanent_failure" ||
        effect.state === "retryable_failure",
    )
  ) {
    return "needs_attention";
  }
  if (activeAirtable.some((effect) => effect.state === "attempting")) {
    return "in_progress";
  }
  if (
    plan.receipt &&
    activeAirtable.some((effect) => effect.state === "pending")
  ) {
    return "partially_complete";
  }
  if (plan.state === "Needs attention") return "needs_attention";
  if (plan.state === "Partially complete") return "partially_complete";
  if (plan.receipt || plan.state === "Complete") return "complete";
  if (plan.state === "In progress") return "in_progress";
  return "proposed";
}

function publicationActionLabel(body: PublicationPlanBody): string {
  const count = body.includedSessionIds.length;
  if (body.operation === "unpublish") return "Unpublish the attendee program";
  if (body.operation === "restore") {
    return `Restore ${count} ${plural(count, "session")} to the attendee program`;
  }
  return `Publish ${count} ${plural(count, "session")} to the attendee program`;
}

function externalRouteAction(input: {
  id: string;
  label: string;
  href: string;
  resultingEffectSummary: string;
}): ExternalEffectReviewAction {
  return { ...input, kind: "repair", target: { type: "route", href: input.href } };
}

function externalCommandAction(input: {
  id: string;
  label: string;
  kind: ExternalEffectReviewAction["kind"];
  command: Extract<ExternalEffectReviewAction["target"], { type: "command" }>["command"];
  entityIds: string[];
  resultingEffectSummary: string;
}): ExternalEffectReviewAction {
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    target: { type: "command", command: input.command, entityIds: input.entityIds },
    resultingEffectSummary: input.resultingEffectSummary,
  };
}

function publicationIssue(
  plan: CourseCheckPlan,
  finding: PublicationPlanBody["findings"][number],
  canMutate: boolean,
): ExternalEffectReviewIssue {
  const sessionIds = finding.entityRef?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const classification =
    finding.severity === "blocker"
      ? "needs_action"
      : finding.materialExternal
        ? "check"
        : "details";
  const label =
    classification === "needs_action"
      ? "Needs action"
      : classification === "check"
        ? "Check"
        : "Details";
  const firstSession = sessionIds[0];
  const actions: ExternalEffectReviewAction[] = [];
  if (firstSession) {
    actions.push(
      externalRouteAction({
        id: `publication:${finding.id}:repair`,
        label: "Open affected session",
        href: `/e/${encodeURIComponent(plan.eventId)}/agenda?session=${encodeURIComponent(firstSession)}`,
        resultingEffectSummary: "The working session opens; this frozen review does not change until it is refreshed.",
      }),
    );
  }
  if (canMutate && sessionIds.length > 0) {
    actions.push(
      externalCommandAction({
        id: `publication:${finding.id}:exclude`,
        label: sessionIds.length === 1 ? "Exclude affected session" : "Exclude affected sessions",
        kind: "exclude",
        command: "exclude_publication_sessions",
        entityIds: sessionIds,
        resultingEffectSummary: `${sessionIds.length} affected ${plural(sessionIds.length, "session")} will stay internal.`,
      }),
    );
  }
  if (canMutate && finding.materialExternal) {
    actions.push(
      externalCommandAction({
        id: `publication:${finding.id}:override`,
        label: "Record reasoned override",
        kind: "override",
        command: "record_reasoned_override",
        entityIds: [finding.id],
        resultingEffectSummary: "The warning remains on the receipt with the organizer's reason.",
      }),
    );
  }
  return {
    classification,
    label,
    summary: finding.message,
    affectedObjectLabel:
      sessionIds.length > 0
        ? `${sessionIds.length} ${plural(sessionIds.length, "session")}`
        : "Attendee program",
    consequence:
      finding.severity === "blocker"
        ? "The attendee-facing release cannot proceed until this is repaired or excluded."
        : finding.materialExternal
          ? "Publishing unchanged makes this known issue attendee-facing."
          : "This remains visible as a stated TBD detail; it does not imply delivery.",
    actions,
  };
}

function airtableState(
  effects: CourseCheckPlan["body"]["airtable"]["effects"],
): ExternalEffectReviewGroup["state"] {
  if (effects.some((effect) => effect.state === "unknown")) return "unknown";
  if (
    effects.some(
      (effect) =>
        effect.state === "permanent_failure" || effect.state === "retryable_failure",
    )
  ) {
    return "failed";
  }
  if (effects.length > 0 && effects.every((effect) => effect.state === "succeeded")) {
    return "succeeded";
  }
  if (effects.length > 0 && effects.every((effect) => effect.state === "compensated")) {
    return "compensated";
  }
  if (effects.some((effect) => effect.state === "attempting")) return "in_progress";
  return "pending";
}

function integrationReview(input: {
  plan: CourseCheckPlan;
  options: CourseCheckProjectionOptions;
}): Pick<ExternalEffectReviewProjection, "issues" | "effectGroups" | "integrationActions"> {
  const { plan, options } = input;
  const airtable = plan.body.airtable;
  if (airtable.effects.length === 0 || airtable.disposition === "removed") {
    return { issues: [], effectGroups: [], integrationActions: [] };
  }
  const allowed = new Set(options.permittedStageIds ?? []);
  const mayMutate = options.role !== "reviewer" && allowed.has("write-airtable");
  const state = airtableState(airtable.effects);
  const providerDetails = options.canViewCommunicationEvidence
    ? airtable.effects.map(
        (effect) =>
          `${effect.operation} ${effect.tableName}/${effect.providerRecordId ?? effect.chartsteadId} · ${effect.state}`,
      )
    : [];
  const effectGroups: ExternalEffectReviewGroup[] = [
    {
      key: "airtable",
      title: "Airtable records",
      state,
      count: airtable.effects.length,
      summary: airtable.summary,
      details: airtable.effects.map(
        (effect) =>
          `${effect.operation === "create" ? "Create" : "Update"} ${effect.kind} ${effect.chartsteadId} in ${effect.tableName}`,
      ),
      providerDetails,
    },
  ];
  const uncertain = airtable.effects.filter(
    (effect) =>
      effect.state === "unknown" ||
      effect.state === "retryable_failure" ||
      effect.state === "permanent_failure",
  );
  const issues: ExternalEffectReviewIssue[] = uncertain.map((effect) => ({
    classification: effect.state === "unknown" ? "could_not_check" : "needs_action",
    label: effect.state === "unknown" ? "Could not check" : "Needs action",
    summary:
      effect.state === "unknown"
        ? `Airtable may or may not have ${effect.operation === "create" ? "created" : "updated"} ${effect.kind} ${effect.chartsteadId}.`
        : `Airtable did not ${effect.operation} ${effect.kind} ${effect.chartsteadId}.`,
    affectedObjectLabel: `${effect.kind} ${effect.chartsteadId}`,
    consequence:
      "ChartStead's internal work remains committed; only this optional mirror is uncertain.",
    actions: mayMutate
      ? [
          externalCommandAction({
            id: `airtable:${effect.id}:reconcile`,
            label: "Reconcile unknown writes",
            kind: "reconcile",
            command: "reconcile_airtable",
            entityIds: [effect.id],
            resultingEffectSummary: "The provider is checked before any new write is attempted.",
          }),
        ]
      : [],
  }));
  const count = airtable.effects.length;
  const integrationActions = mayMutate
    ? [
        {
          action: "execute" as const,
          label: `Write ${count} ${plural(count, "record")} to Airtable`,
          effectSummary: airtable.summary,
        },
        ...(uncertain.some((effect) => effect.state === "unknown")
          ? [
              {
                action: "reconcile" as const,
                label: "Reconcile unknown writes",
                effectSummary: "Check the existing provider result without duplicating a write.",
              },
            ]
          : []),
        {
          action: "deferred" as const,
          label: "Defer Airtable",
          effectSummary: "Keep internal work committed and leave the optional mirror pending.",
        },
        {
          action: "removed" as const,
          label: "Remove Airtable stage",
          effectSummary: "Keep internal work committed and remove these optional provider writes.",
        },
      ]
    : [];
  return { issues, effectGroups, integrationActions };
}

function deliveryReview(
  plan: CourseCheckPlan,
  options: CourseCheckProjectionOptions,
): Pick<ExternalEffectReviewProjection, "issues" | "effectGroups" | "result"> {
  if (plan.body.actionType !== "communication" || plan.body.effects.length === 0) {
    return { issues: [], effectGroups: [], result: null };
  }
  const body = plan.body;
  const canMutate =
    options.role !== "reviewer" &&
    options.canViewCommunicationEvidence &&
    (options.permittedStageIds ?? []).includes("send-messages");
  const issues: ExternalEffectReviewIssue[] = body.effects
    .filter(
      (effect) =>
        effect.status === "permanent_failure" ||
        effect.status === "exhausted" ||
        effect.status === "unknown",
    )
    .map((effect) => {
      const unknown = effect.status === "unknown";
      const actions: ExternalEffectReviewAction[] = canMutate
        ? [
            ...(unknown
              ? [
                  externalCommandAction({
                    id: `delivery:${effect.effectId}:reconcile`,
                    label: "Reconcile provider outcome",
                    kind: "reconcile",
                    command: "reconcile_delivery",
                    entityIds: [effect.effectId],
                    resultingEffectSummary: "Confirm delivered or not delivered before any retry.",
                  }),
                ]
              : [
                  externalCommandAction({
                    id: `delivery:${effect.effectId}:retry`,
                    label: "Retry this address",
                    kind: "retry",
                    command: "retry_delivery",
                    entityIds: [effect.effectId],
                    resultingEffectSummary: "Queue one bounded attempt for this address only.",
                  }),
                ]),
            externalCommandAction({
              id: `delivery:${effect.effectId}:correction`,
              label: "Create reviewed correction",
              kind: "compensate",
              command: "create_delivery_correction",
              entityIds: [effect.effectId],
              resultingEffectSummary: "Create a new reviewed plan; the original delivery remains immutable.",
            }),
          ]
        : [];
      return {
        classification: unknown ? "could_not_check" : "needs_action",
        label: unknown ? "Could not check" : "Needs action",
        summary: unknown
          ? `Delivery to ${effect.toEmail} has an unknown provider outcome.`
          : `Delivery to ${effect.toEmail} failed after ${effect.attemptCount} ${plural(effect.attemptCount, "attempt")}.`,
        affectedObjectLabel: effect.toEmail,
        consequence: unknown
          ? "Do not retry until the provider outcome is reconciled; a duplicate message is possible."
          : "This person has not received the message; successful deliveries stay unchanged.",
        actions,
      } satisfies ExternalEffectReviewIssue;
    });
  const summary = body.deliverySummary;
  const active = summary.queued + summary.sending + summary.retryScheduled;
  const deliveryState: ExternalEffectReviewGroup["state"] =
    summary.unknown > 0
      ? "unknown"
      : summary.failed > 0
        ? "failed"
        : active > 0
          ? "in_progress"
          : summary.total > 0 && summary.succeeded === summary.total
            ? "succeeded"
            : "pending";
  const resultSummary = `${summary.succeeded} of ${summary.total} deliveries succeeded; ${summary.failed} failed and ${summary.unknown} ${summary.unknown === 1 ? "has" : "have"} an unknown outcome.`;
  return {
    issues,
    effectGroups: [
      {
        key: "delivery",
        title: "Message delivery",
        state: deliveryState,
        count: summary.total,
        summary: resultSummary,
        details: body.effects.map(
          (effect) => `${effect.toEmail} · ${effect.status.replaceAll("_", " ")} · ${effect.attemptCount} ${plural(effect.attemptCount, "attempt")}`,
        ),
        providerDetails: options.canViewCommunicationEvidence
          ? body.effects.map(
              (effect) => `${effect.effectId} · ${effect.providerReference ?? "no provider reference"}`,
            )
          : [],
      },
    ],
    result: {
      state: externalPhase(plan) === "proposed" ? "in_progress" : (externalPhase(plan) as Exclude<ExternalEffectReviewPhase, "proposed">),
      summary: resultSummary,
      processed: summary.succeeded + summary.failed + summary.unknown,
      succeeded: summary.succeeded,
      failed: summary.failed,
      unknown: summary.unknown,
      compensated: 0,
    },
  };
}

function buildExternalEffectReviewProjection(
  plan: CourseCheckPlan,
  options: CourseCheckProjectionOptions,
): ExternalEffectReviewProjection | null {
  // Decision plans already expose the authoritative decisionReview adapter,
  // including their independently approved integration group. Do not place a
  // second review surface ahead of that decision scope.
  if (plan.body.actionType === "decision") return null;
  const allowed = new Set(options.permittedStageIds ?? []);
  const phase = externalPhase(plan);
  const integration = integrationReview({ plan, options });
  const delivery = deliveryReview(plan, options);
  let family: ExternalEffectReviewProjection["family"] = "integration";
  let title = "Review optional Airtable effects";
  let summary = plan.body.airtable.summary;
  let issues = [...integration.issues];
  let effectGroups = [...integration.effectGroups];
  let permittedActions: ExternalEffectReviewProjection["permittedActions"] = [];
  let primaryActionLabel: string | null = null;
  let result = delivery.result;

  if (plan.body.actionType === "publication") {
    family = "publication";
    const body = plan.body;
    const actionLabel = publicationActionLabel(body);
    title = plan.receipt ? `${actionLabel} — result` : actionLabel;
    summary = `${body.includedSessionIds.length} ${plural(body.includedSessionIds.length, "session")} will be attendee-facing; ${body.excludedSessions.length} will stay internal.`;
    const canMutate =
      options.role !== "reviewer" &&
      body.stages.some(
        (stage) => stage.id !== "write-airtable" && allowed.has(stage.id),
      );
    issues = [
      ...body.findings
        .filter(
          (finding) =>
            finding.severity !== "info" ||
            finding.code === "session_tbd" ||
            finding.code === "session_unplaced",
        )
        .map((finding) => publicationIssue(plan, finding, canMutate)),
      ...integration.issues,
    ];
    effectGroups = [
      {
        key: "publication",
        title: "Attendee program",
        state: plan.receipt ? "applied" : "pending",
        count: body.includedSessionIds.length,
        summary: actionLabel,
        details: body.sessionDeltas.map(
          (delta) => `${delta.title}: ${delta.changes.join(", ")}`,
        ),
        providerDetails: [],
      },
      ...(body.excludedSessions.length > 0
        ? [
            {
              key: "exclusions" as const,
              title: "Kept internal",
              state: "unchanged" as const,
              count: body.excludedSessions.length,
              summary: `${body.excludedSessions.length} ${plural(body.excludedSessions.length, "session")} will remain out of the attendee program.`,
              details: body.excludedSessions.map(
                (row) => `${row.title}: ${row.reasons.join("; ")}`,
              ),
              providerDetails: [],
            },
          ]
        : []),
      ...(body.calendarConsequences.length > 0
        ? [
            {
              key: "calendar" as const,
              title: "Calendar follow-up",
              state: "pending" as const,
              count: body.calendarConsequences.length,
              summary: `${body.calendarConsequences.length} calendar ${plural(body.calendarConsequences.length, "operation")} will open in a separately approved Communication Course Check. Nothing is sent by publication.`,
              details: body.calendarConsequences.map(
                (op) => `${op.kind === "create" ? "Create" : op.kind === "update" ? "Update" : "Cancel"} ${op.title}${op.timePending ? " · time TBD" : ""}${op.locationPending ? " · location TBD" : op.roomName ? ` · ${op.roomName}` : ""}`,
              ),
              providerDetails: options.canViewCommunicationEvidence
                ? body.calendarConsequences.map(
                    (op) => `UID ${op.uid} · sequence ${op.sequence} · ${op.reversibility.replaceAll("_", " ")}`,
                  )
                : [],
            },
          ]
        : []),
      ...integration.effectGroups,
    ];
    const stage = body.stages.find(
      (candidate) =>
        candidate.id !== "write-airtable" &&
        allowed.has(candidate.id) &&
        (candidate.status === "ready" || candidate.status === "approved"),
    );
    if (stage && !plan.receipt) {
      primaryActionLabel = actionLabel;
      permittedActions.push({
        stageId: stage.id,
        label: actionLabel,
        effectSummary: `${summary} Calendar delivery and Airtable remain separately approved.`,
      });
    }
    if (plan.receipt) {
      const airtableSucceeded = body.airtable.effects.filter(
        (effect) => effect.state === "succeeded",
      ).length;
      const airtableFailed = body.airtable.effects.filter(
        (effect) =>
          effect.state === "permanent_failure" ||
          effect.state === "retryable_failure",
      ).length;
      const airtableUnknown = body.airtable.effects.filter(
        (effect) => effect.state === "unknown",
      ).length;
      const airtableCompensated = body.airtable.effects.filter(
        (effect) => effect.state === "compensated",
      ).length;
      const integrationClause =
        body.airtable.effects.length === 0 || body.airtable.disposition !== "active"
          ? " No Airtable write was required."
          : ` Airtable: ${airtableSucceeded} succeeded, ${airtableFailed} failed, ${airtableUnknown} unknown, and ${airtableCompensated} compensated.`;
      result = {
        state: phase === "proposed" ? "complete" : phase,
        summary: `${body.operation === "unpublish" ? "The attendee program was unpublished" : body.operation === "restore" ? `${body.includedSessionIds.length} sessions were restored to the attendee program` : `${body.includedSessionIds.length} sessions were published to the attendee program`}.${integrationClause}`,
        processed: body.includedSessionIds.length + airtableSucceeded + airtableFailed + airtableUnknown + airtableCompensated,
        succeeded: body.includedSessionIds.length + airtableSucceeded,
        failed: airtableFailed,
        unknown: airtableUnknown,
        compensated: airtableCompensated,
      };
    }
  } else if (plan.body.actionType === "communication") {
    family = "communication";
    const body = plan.body;
    const total = body.deliverySummary.total || body.drafts.length;
    title =
      phase === "needs_attention"
        ? `Recover delivery for ${body.deliverySummary.failed + body.deliverySummary.unknown} ${plural(body.deliverySummary.failed + body.deliverySummary.unknown, "person", "people")}`
        : body.compensation
          ? "Review a corrective message"
          : `Review delivery to ${total} ${plural(total, "person", "people")}`;
    summary = delivery.result?.summary ?? `${body.drafts.length} frozen ${plural(body.drafts.length, "draft")}; sending remains separately approved.`;
    issues = [...delivery.issues, ...integration.issues];
    effectGroups = [
      ...delivery.effectGroups,
      ...(body.compensation
        ? [
            {
              key: "compensation" as const,
              title: "Corrective message",
              state: phase === "complete" ? ("compensated" as const) : ("pending" as const),
              count: 1,
              summary: `The original delivery ${body.compensation.originalEffectId} remains immutable; this is a separately reviewed correction.`,
              details: [body.compensation.reason],
              providerDetails: options.canViewCommunicationEvidence
                ? [body.compensation.originalEffectId]
                : [],
            },
          ]
        : []),
      ...integration.effectGroups,
    ];
    const sendStage = body.stages.find(
      (candidate) =>
        candidate.id === "send-messages" &&
        allowed.has(candidate.id) &&
        (candidate.status === "ready" || candidate.status === "approved"),
    );
    if (sendStage) {
      primaryActionLabel = `Send ${body.drafts.length} ${plural(body.drafts.length, "message")}`;
      permittedActions.push({
        stageId: sendStage.id,
        label: primaryActionLabel,
        effectSummary: `Queue exactly ${body.drafts.length} frozen recipient ${plural(body.drafts.length, "payload")}; calendar operations, when present, use their frozen UID and sequence.`,
      });
    }
  }

  if (effectGroups.length === 0) return null;
  if (
    allowed.has("write-airtable") &&
    plan.body.airtable.effects.length > 0 &&
    plan.body.airtable.disposition === "active"
  ) {
    const writeStage = plan.body.stages.find(
      (stage) =>
        stage.id === "write-airtable" &&
        (stage.status === "ready" || stage.status === "approved"),
    );
    if (writeStage) {
      permittedActions.push({
        stageId: writeStage.id,
        label: `Write ${plan.body.airtable.effects.length} ${plural(plan.body.airtable.effects.length, "record")} to Airtable`,
        effectSummary: plan.body.airtable.summary,
      });
    }
  }
  if (!result && family === "integration" && plan.body.airtable.effects.length > 0) {
    const effects = plan.body.airtable.effects;
    const succeeded = effects.filter((effect) => effect.state === "succeeded").length;
    const failed = effects.filter(
      (effect) =>
        effect.state === "permanent_failure" || effect.state === "retryable_failure",
    ).length;
    const unknown = effects.filter((effect) => effect.state === "unknown").length;
    const compensated = effects.filter((effect) => effect.state === "compensated").length;
    if (succeeded + failed + unknown + compensated > 0) {
      result = {
        state: phase === "proposed" ? "in_progress" : phase,
        summary: `${succeeded} of ${effects.length} Airtable writes succeeded; ${failed} failed, ${unknown} unknown, and ${compensated} compensated. Internal ChartStead work is unchanged.`,
        processed: succeeded + failed + unknown + compensated,
        succeeded,
        failed,
        unknown,
        compensated,
      };
    }
  }
  return {
    kind: "external_effect_review",
    family,
    phase,
    title,
    summary,
    attentionCount: issues.filter((issue) => issue.classification !== "details").length +
      issues.filter((issue) => issue.classification === "details").length,
    issues,
    effectGroups,
    permittedActions,
    integrationActions: integration.integrationActions,
    primaryActionLabel,
    result,
  };
}

function sharedApprovalSelectionCount(plan: CourseCheckPlan): number {
  const body = plan.body;
  if (body.actionType === "decision") return body.items.length;
  if (body.actionType === "publication") {
    return body.includedSessionIds.length + body.excludedSessions.length;
  }
  if (body.actionType === "communication") {
    return body.recipientGroups.reduce(
      (count, group) =>
        count + group.recipients.filter((recipient) => recipient.selected).length,
      0,
    );
  }
  return body.speakers.length;
}

function sharedApprovalSourceRevisions(plan: CourseCheckPlan): string[] {
  const body = plan.body;
  if (body.actionType === "decision") {
    return body.items.map(
      (item) => `${item.proposalId} revision ${item.proposalRevision}`,
    );
  }
  if (body.actionType === "communication") {
    return Object.entries(body.relevantRevisions.proposalRevisions).map(
      ([proposalId, revision]) => `${proposalId} revision ${revision}`,
    );
  }
  if (body.actionType === "publication") {
    return [
      `Working schedule ${body.workingFingerprint}`,
      ...(body.publicRevisionId
        ? [
            `Public revision ${body.publicRevisionId} version ${body.publicRevisionVersion ?? "unknown"}`,
          ]
        : []),
    ];
  }
  return body.relevantRevisions.speakerEmails.map(
    (_email, index) => `Speaker source ${index + 1}`,
  );
}

function buildSharedApprovalProjection(
  plan: CourseCheckPlan,
  options: CourseCheckProjectionOptions,
): CourseCheckSharedApprovalProjection {
  const policy = options.policy ?? DEFAULT_COURSE_CHECK_POLICY;
  const activeStage =
    plan.body.stages.find((stage) => stage.status === "out_of_date") ??
    plan.body.stages.find(
      (stage) =>
        stage.status === "ready" ||
        stage.status === "approved" ||
        stage.status === "blocked",
    ) ??
    plan.body.stages.find((stage) => stage.status === "pending") ??
    [...plan.body.stages].reverse().find((stage) => stage.status === "complete") ??
    plan.body.stages[0] ?? {
      id: "complete",
      label: "Course Check",
      verb: "Review Course Check",
      status: "complete" as const,
    };
  const stageEndorsements = (plan.stageEndorsements ?? []).filter(
    (endorsement) =>
      endorsement.stageId === activeStage.id &&
      endorsement.planVersion === plan.version &&
      endorsement.digest === plan.digest,
  );
  const uniqueEndorserIds = new Set(
    stageEndorsements.map((endorsement) => endorsement.actor.id),
  );
  const viewerActorId = options.viewerActorId ?? null;
  const viewerEndorsed = Boolean(
    viewerActorId && uniqueEndorserIds.has(viewerActorId),
  );
  const hasOtherEndorser = Boolean(
    viewerActorId &&
      stageEndorsements.some(
        (endorsement) => endorsement.actor.id !== viewerActorId,
      ),
  );
  const stagePermitted = (
    options.permittedStageIds ??
    (options.role === "admin" ? plan.body.stages.map((stage) => stage.id) : [])
  ).includes(activeStage.id);
  // A decision batch can be dependency-safe even when its aggregate stage is
  // blocked: the decision projection declares the exact eligible subset and
  // the items that must remain unchanged. Treat that declared commit as the
  // actionable authority instead of making shared approval veto it.
  const actionable =
    activeStage.status === "ready" ||
    activeStage.status === "approved" ||
    (activeStage.id === "send-messages" &&
      plan.body.actionType === "communication" &&
      plan.body.stageVisibility.send === "ready") ||
    (activeStage.id === "apply-decision" &&
      plan.decisionReview?.partialExecution.canExecute === true);
  const violatesDistinctApprover = Boolean(
    policy.requireDistinctApprover && viewerActorId === plan.createdBy.id,
  );
  const canEndorse = Boolean(
    actionable &&
      stagePermitted &&
      policy.requireTwoPersonApproval &&
      !violatesDistinctApprover &&
      !viewerEndorsed &&
      !hasOtherEndorser,
  );
  const canExecute = Boolean(
    actionable &&
      stagePermitted &&
      !violatesDistinctApprover &&
      (!policy.requireTwoPersonApproval || hasOtherEndorser),
  );
  const decisionCommit = plan.decisionReview?.permittedCommits.find(
    (commit) => commit.stageId === activeStage.id,
  );
  const externalCommit = plan.externalReview?.permittedActions.find(
    (commit) => commit.stageId === activeStage.id,
  );
  const availableCommit = decisionCommit ?? externalCommit ??
    (actionable
      ? {
          stageId: activeStage.id,
          label: activeStage.verb,
          effectSummary: activeStage.label,
        }
      : null);
  const changedInputs =
    plan.decisionReview?.revalidation.changedInputs.map((input) => input.label) ??
    plan.body.findings
      .filter((finding) => finding.code === "relevant_input_changed")
      .map((finding) => finding.message);
  const affectedStageIds = plan.body.stages
    .filter((stage) => stage.status === "out_of_date")
    .map((stage) => stage.id);
  const preservedStageIds = plan.body.stages
    .filter((stage) => stage.status === "complete")
    .map((stage) => stage.id);
  const freshnessState =
    plan.state === "Out of date" || affectedStageIds.length > 0
      ? ("out_of_date" as const)
      : plan.body.ageWarning?.active
        ? ("age_warning" as const)
        : ("current" as const);
  const freshnessNextAction =
    freshnessState === "out_of_date"
      ? `Refresh the ${activeStage.label.toLowerCase()} review before approving ${activeStage.id}.`
      : freshnessState === "age_warning"
        ? `Recheck the current source information before approving ${activeStage.id}.`
        : `Continue with ${activeStage.verb.toLowerCase()} when the review is ready.`;

  let stateSummary: string;
  let nextAction: string;
  if (activeStage.status === "complete") {
    stateSummary = `${activeStage.label} is complete.`;
    nextAction = "No approval action is required for this completed stage.";
  } else if (freshnessState === "out_of_date") {
    stateSummary = `${activeStage.label} needs review because source evidence changed.`;
    nextAction = freshnessNextAction;
  } else if (!stagePermitted) {
    stateSummary = `${activeStage.label} is waiting for an authorized actor.`;
    nextAction = "Ask an authorized administrator to continue this exact review.";
  } else if (violatesDistinctApprover) {
    stateSummary = `${activeStage.label} requires an approver other than the requester.`;
    nextAction = "Ask another authorized administrator to approve and execute this stage.";
  } else if (policy.requireTwoPersonApproval && viewerEndorsed) {
    stateSummary = `${activeStage.label} is waiting for a different authorized administrator.`;
    nextAction = "Another authorized administrator must approve this exact plan version.";
  } else if (canEndorse) {
    stateSummary = `${activeStage.label} is ready for your endorsement.`;
    nextAction = `Endorse this exact review${policy.requireReasonOnApprove ? " with a reason" : ""}; a different authorized administrator can then execute it.`;
  } else if (canExecute) {
    stateSummary = `${activeStage.label} is ready for you to approve and execute.`;
    nextAction = `${activeStage.verb}${policy.requireReasonOnApprove ? " and provide an approval reason" : ""}.`;
  } else {
    stateSummary = `${activeStage.label} is ${activeStage.status.replaceAll("_", " ")}.`;
    nextAction = `Resolve the outstanding review requirements before ${activeStage.verb.toLowerCase()}.`;
  }

  const policyRules = [
    ...(policy.requireTwoPersonApproval ? ["Two authorized people"] : []),
    ...(policy.requireDistinctApprover ? ["Different approver"] : []),
    ...(policy.requireReasonOnApprove ? ["Approval reason required"] : []),
  ];
  const outstandingIssueCount =
    plan.decisionReview?.issues.filter(
      (issue) => issue.classification !== "details",
    ).length ??
    plan.externalReview?.issues.length ??
    plan.body.findings.filter((finding) => finding.severity !== "info").length;

  return {
    kind: "shared_approval",
    currentStage: {
      stageId: activeStage.id,
      label: activeStage.label,
      status: activeStage.status,
      canExecute,
      canEndorse,
      canRequestApproval: actionable && !canExecute && !canEndorse,
      availableCommit,
      requiredApproverCount: policy.requireTwoPersonApproval ? 2 : 1,
      requiredEndorsementCount: policy.requireTwoPersonApproval ? 1 : 0,
      endorsementCount: uniqueEndorserIds.size,
      distinctApproverRequired: policy.requireDistinctApprover,
      reasonRequired: policy.requireReasonOnApprove,
      stateSummary,
      nextAction,
    },
    resume: {
      selectionCount: sharedApprovalSelectionCount(plan),
      planVersion: plan.version,
      completedStageIds: preservedStageIds,
      outstandingIssueCount,
      activityCount: plan.activity?.length ?? 0,
    },
    freshness: {
      state: freshnessState,
      changedInputs,
      affectedStageIds,
      preservedStageIds,
      nextAction: freshnessNextAction,
    },
    ...(options.canViewTechnicalEvidence
      ? {
          technicalDetails: {
            planId: plan.id,
            planVersion: plan.version,
            digest: plan.digest,
            sourceRevisions: sharedApprovalSourceRevisions(plan),
            policyRules,
          },
        }
      : {}),
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

  if (
    projected.body.actionType === "publication" &&
    !options.canViewCommunicationEvidence
  ) {
    projected = {
      ...projected,
      body: redactPublicationBody(projected.body),
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
              : version.body.actionType === "publication"
                ? redactPublicationBody(version.body)
              : version.body,
      })),
    };
  }

  const externalReview = buildExternalEffectReviewProjection(projected, options);
  if (externalReview) projected = { ...projected, externalReview };

  const sharedApproval = buildSharedApprovalProjection(projected, options);
  projected = { ...projected, sharedApproval };

  const communicationStage = sharedApproval.currentStage.stageId === "send-messages"
    ? sharedApproval.currentStage
    : null;
  const communicationReview = buildCommunicationReviewProjection(projected, {
    canViewCommunicationEvidence: options.canViewCommunicationEvidence,
    sendAction:
      communicationStage?.canExecute
        ? "execute"
        : communicationStage?.canEndorse
          ? "endorse"
          : null,
    reasonRequired: communicationStage?.reasonRequired ?? false,
  });
  if (communicationReview) projected = { ...projected, communicationReview };

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
