import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  CourseCheckPlan,
  DecisionReviewIssue,
  DecisionReviewProjection,
} from "../../shared/course-check";
import type { ProgramOutcome } from "../../shared/events";
import {
  applyCourseCheckPlan,
  createCommunicationCourseCheck,
  createCommunicationDrafts,
  createDecisionCourseCheck,
  deferCourseCheckItems,
  fetchCourseCheckPlan,
} from "../api";
import { createClientId } from "../id";
import { programOutcomeVerb } from "../decision-language";
import {
  decisionFastPathActionLabel,
  decisionFastPathCounts,
  isDecisionFastPathEligible,
} from "./DecisionFastPath";
import { DecisionExceptionReview } from "./DecisionExceptionReview";
import type { CourseCheckReturnContext } from "./useCourseCheckReturnContext";
import {
  type DecisionFinalizeResultSnapshot,
  readDecisionFinalizeResume,
  writeDecisionFinalizeResume,
  writeDecisionFinalizeResult,
} from "./decisionFinalizeStorage";

type Mode = "idle" | "loading" | "confirm" | "exception" | "applying";

export type DecisionFinalizeRequest =
  | { kind: "single"; proposalId: string; outcome: ProgramOutcome }
  | {
      kind: "batch";
      items: Array<{ proposalId: string; outcome: ProgramOutcome }>;
      outcome: ProgramOutcome;
    };

function reviewOf(plan: CourseCheckPlan): DecisionReviewProjection | null {
  return plan.decisionReview ?? null;
}

function emptyIssueContext(
  eventId: string,
  scrollY: number,
): Omit<CourseCheckReturnContext, "focusActionId"> {
  return {
    returnPath: `/e/${eventId}/submissions`,
    selectedItemIds: [],
    issueFilter: "all",
    expandedIssueIds: [],
    subject: "",
    bodyText: "",
    selectedRecipientIds: [],
    overrideReasons: {},
    acknowledgedIssueIds: [],
    scrollY,
  };
}

function shortPrimaryActionLabel(label: string, outcome: ProgramOutcome): string {
  if (/^Accept\b/i.test(label)) return "Accept";
  if (/^Deny\b/i.test(label) || /^Decline\b/i.test(label)) return "Deny";
  return outcome === "accepted" ? "Accept" : "Deny";
}

async function prepareDraftsAfterDecision(
  eventId: string,
  decisionPlan: CourseCheckPlan,
): Promise<{ draftsPrepared: number; error: string | null }> {
  try {
    const linked = await createCommunicationCourseCheck(eventId, {
      decisionPlanId: decisionPlan.id,
      idempotencyKey: `ui-link-comm-${decisionPlan.id}-${createClientId()}`,
    });
    const materialWarnings = linked.body.findings.filter(
      (finding) => finding.severity === "warning" && finding.materialExternal,
    );
    const drafted = await createCommunicationDrafts(eventId, linked.id, {
      planVersion: linked.version,
      digest: linked.digest,
      stageId: "create-drafts",
      idempotencyKey: `ui-drafts-${linked.id}-${createClientId()}`,
      softWarningOverrides: materialWarnings.map((finding) => ({
        findingId: finding.id,
        reason: "Reviewed prior communication; proceeding with draft freeze.",
      })),
    });
    const count =
      drafted.body.actionType === "communication" ? drafted.body.drafts.length : 0;
    return { draftsPrepared: count, error: null };
  } catch (error) {
    return {
      draftsPrepared: 0,
      error:
        error instanceof Error
          ? error.message
          : "Applied, but drafts could not be prepared.",
    };
  }
}

function toastFromResult(snapshot: DecisionFinalizeResultSnapshot): string {
  const parts = [snapshot.summary, snapshot.draftsLabel, snapshot.externalLabel]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" ");
}

export function useDecisionFinalize(eventId: string) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("idle");
  const [plan, setPlan] = useState<CourseCheckPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedActionIds, setAcknowledgedActionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [toast, setToast] = useState<string | null>(null);

  const review = plan ? reviewOf(plan) : null;

  const clearPlanUi = useCallback(() => {
    setMode("idle");
    setPlan(null);
    setError(null);
    setAcknowledgedActionIds(new Set());
    writeDecisionFinalizeResume(eventId, null);
  }, [eventId]);

  const openWithPlan = useCallback(
    (next: CourseCheckPlan, options?: { restoreAcknowledgedIds?: string[] }) => {
      const nextReview = reviewOf(next);
      if (!nextReview || next.body.actionType !== "decision") {
        setError("This decision review is not ready yet. Try again.");
        setMode("idle");
        return;
      }
      setPlan(next);
      setError(null);
      setAcknowledgedActionIds(new Set(options?.restoreAcknowledgedIds ?? []));
      if (nextReview.phase === "applied" && nextReview.result) {
        const snapshot: DecisionFinalizeResultSnapshot = {
          planId: next.id,
          summary: nextReview.result.summary,
          draftsLabel: nextReview.result.drafts.label,
          externalLabel: nextReview.result.externalCommunication.label,
          appliedAt: nextReview.result.appliedAt,
          appliedBy: nextReview.result.appliedBy,
          dismissed: false,
        };
        writeDecisionFinalizeResult(eventId, { ...snapshot, dismissed: true });
        setToast(toastFromResult(snapshot));
        clearPlanUi();
        return;
      }
      setMode(
        isDecisionFastPathEligible(next, nextReview) ? "confirm" : "exception",
      );
    },
    [clearPlanUi, eventId],
  );

  const persistFixResume = useCallback(() => {
    if (!plan || plan.body.actionType !== "decision") return;
    const outcome =
      plan.body.items.find((item) => item.status === "active")?.outcome ??
      plan.body.items[0]?.outcome ??
      "accepted";
    writeDecisionFinalizeResume(eventId, {
      planId: plan.id,
      outcome,
      openedAt: new Date().toISOString(),
      acknowledgedActionIds: [...acknowledgedActionIds],
    });
  }, [acknowledgedActionIds, eventId, plan]);

  const resumeIfAny = useCallback(async () => {
    const resume = readDecisionFinalizeResume(eventId);
    if (!resume) return false;
    try {
      const next = await fetchCourseCheckPlan(eventId, resume.planId);
      openWithPlan(next, {
        restoreAcknowledgedIds: resume.acknowledgedActionIds ?? [],
      });
      return true;
    } catch {
      writeDecisionFinalizeResume(eventId, null);
      return false;
    }
  }, [eventId, openWithPlan]);

  const start = useCallback(
    async (request: DecisionFinalizeRequest) => {
      setMode("loading");
      setError(null);
      writeDecisionFinalizeResume(eventId, null);
      try {
        const created =
          request.kind === "single"
            ? await createDecisionCourseCheck(eventId, {
                proposalId: request.proposalId,
                outcome: request.outcome,
                idempotencyKey: `ui-decision-${request.proposalId}-${request.outcome}-${createClientId()}`,
              })
            : await createDecisionCourseCheck(eventId, {
                items: request.items,
                idempotencyKey: `ui-batch-${request.items
                  .map((item) => item.proposalId)
                  .sort()
                  .join("-")}-${request.outcome}-${createClientId()}`,
              });
        openWithPlan(created);
      } catch (err) {
        setMode("idle");
        setError(
          err instanceof Error ? err.message : "Unable to start decision review.",
        );
      }
    },
    [eventId, openWithPlan],
  );

  const applyDecision = useCallback(async () => {
    if (!plan || !review) return;
    setMode("applying");
    setError(null);
    try {
      const applied = await applyCourseCheckPlan(eventId, plan.id, {
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `ui-apply-${plan.id}-${createClientId()}`,
      });
      const draftResult = await prepareDraftsAfterDecision(eventId, applied);
      const refreshed = await fetchCourseCheckPlan(eventId, applied.id);
      const finalReview = reviewOf(refreshed);
      const summary =
        finalReview?.result?.summary ?? "Final outcomes applied.";
      const draftsLabel =
        draftResult.draftsPrepared > 0
          ? `${draftResult.draftsPrepared} draft${draftResult.draftsPrepared === 1 ? "" : "s"} prepared.`
          : (finalReview?.result?.drafts.label ?? "No drafts prepared.");
      const externalLabel =
        finalReview?.result?.externalCommunication.label ?? "No emails sent.";
      const snapshot: DecisionFinalizeResultSnapshot = {
        planId: refreshed.id,
        summary: draftResult.error ? `${summary} ${draftResult.error}` : summary,
        draftsLabel,
        externalLabel,
        appliedAt: finalReview?.result?.appliedAt ?? new Date().toISOString(),
        appliedBy: finalReview?.result?.appliedBy ?? "you",
        dismissed: true,
      };
      writeDecisionFinalizeResult(eventId, snapshot);
      setToast(toastFromResult(snapshot));
      clearPlanUi();
      void queryClient.invalidateQueries({ queryKey: ["proposals", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["proposal-review", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["course-checks", eventId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply decisions.");
      setMode(
        plan && review && isDecisionFastPathEligible(plan, review)
          ? "confirm"
          : "exception",
      );
    }
  }, [clearPlanUi, eventId, plan, queryClient, review]);

  const excludeItems = useCallback(
    async (itemIds: string[]) => {
      if (!plan || itemIds.length === 0) return;
      setError(null);
      try {
        const next = await deferCourseCheckItems(eventId, plan.id, {
          planVersion: plan.version,
          digest: plan.digest,
          itemIds,
          reason: "Excluded from this batch during in-place decision review.",
          idempotencyKey: `ui-defer-${plan.id}-${createClientId()}`,
        });
        openWithPlan(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to exclude items.");
      }
    },
    [eventId, openWithPlan, plan],
  );

  const cancel = useCallback(() => {
    clearPlanUi();
  }, [clearPlanUi]);

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    mode,
    plan,
    review,
    error,
    acknowledgedActionIds,
    setAcknowledgedActionIds,
    toast,
    dismissToast,
    start,
    resumeIfAny,
    persistFixResume,
    applyDecision,
    excludeItems,
    cancel,
  };
}

function attentionLine(review: DecisionReviewProjection): string | null {
  const needs = review.counts.needsAction;
  const warnings = review.counts.warning;
  if (needs > 0) {
    return needs === 1 ? "1 item needs attention" : `${needs} items need attention`;
  }
  if (warnings > 0) {
    return warnings === 1 ? "1 warning" : `${warnings} warnings`;
  }
  return null;
}

export function DecisionFinalizeInspector({
  eventId,
  mode,
  plan,
  review,
  error,
  busy,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
  onCancel,
  onConfirm,
  onChooseAlternative,
  onBeforeFix,
}: {
  eventId: string;
  mode: Mode;
  plan: CourseCheckPlan | null;
  review: DecisionReviewProjection | null;
  error: string | null;
  busy: boolean;
  acknowledgedActionIds: Set<string>;
  onAcknowledgeIssue: (actionId: string) => void;
  onExcludeIssueItems: (itemIds: string[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
  onBeforeFix?: () => void;
}) {
  const counts = useMemo(
    () => (plan && review ? decisionFastPathCounts(plan, review) : null),
    [plan, review],
  );

  const outcome: ProgramOutcome =
    plan?.body.actionType === "decision"
      ? (plan.body.items.find((item) => item.status === "active")?.outcome ??
        plan.body.items[0]?.outcome ??
        "accepted")
      : "accepted";
  const outcomeVerb = programOutcomeVerb(outcome);

  const primaryLabel = useMemo(() => {
    if (!counts) return outcomeVerb;
    if (mode === "exception" && review?.primaryActionLabel) {
      return shortPrimaryActionLabel(review.primaryActionLabel, outcome);
    }
    return shortPrimaryActionLabel(decisionFastPathActionLabel(counts), outcome);
  }, [counts, mode, outcome, outcomeVerb, review?.primaryActionLabel]);

  if (mode === "idle") return null;

  if (mode === "loading" || !plan || !review || !counts) {
    return (
      <div className="inspector-content decision-finalize-inspector">
        <div className="inspector-header decision-finalize-header">
          <button
            type="button"
            className="inspector-close btn btn-secondary btn-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <div className="inspector-kicker">Final decision</div>
          <h2>Checking impact…</h2>
        </div>
        <div className="inspector-body">
          {error ? (
            <p className="form-message" data-tone="error" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted">One moment.</p>
          )}
        </div>
      </div>
    );
  }

  const attention = attentionLine(review);
  const canCommit =
    mode === "confirm" ||
    mode === "applying" ||
    (review.partialExecution.canExecute && review.counts.needsAction === 0);

  return (
    <div
      className="inspector-content decision-finalize-inspector"
      role="dialog"
      aria-labelledby="decision-finalize-title"
    >
      <div className="inspector-header decision-finalize-header">
        <button
          type="button"
          className="inspector-close btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <div className="inspector-kicker">Final decision</div>
        <h2 id="decision-finalize-title">
          {outcome === "accepted" ? "Accept" : "Deny"}{" "}
          {counts.accepted + counts.declined === 1
            ? "1 submission"
            : `${counts.accepted + counts.declined} submissions`}
        </h2>
        {attention ? (
          <p className="decision-finalize-attention" role="status">
            <strong>Attention.</strong> {attention}.
          </p>
        ) : (
          <p className="muted decision-finalize-quiet">Ready to apply. No emails will be sent.</p>
        )}
      </div>

      <div className="inspector-body decision-finalize-body">
        {mode === "confirm" || mode === "applying" ? (
          <section className="panel decision-finalize-summary" aria-label="What will happen">
            <h3>What will happen</h3>
            <ul className="decision-finalize-counts">
              <li>
                <strong>{counts.accepted + counts.declined}</strong>
                <span>
                  {outcome === "accepted" ? "accepted" : "denied"}
                </span>
              </li>
              {counts.sessions > 0 ? (
                <li>
                  <strong>{counts.sessions}</strong>
                  <span>sessions</span>
                </li>
              ) : null}
              {counts.speakerRecords > 0 ? (
                <li>
                  <strong>{counts.speakerRecords}</strong>
                  <span>speakers</span>
                </li>
              ) : null}
              {counts.onboardingTasks > 0 ? (
                <li>
                  <strong>{counts.onboardingTasks}</strong>
                  <span>onboarding tasks</span>
                </li>
              ) : null}
              <li>
                <strong>Drafts</strong>
                <span>Prepared — not sent</span>
              </li>
            </ul>
          </section>
        ) : (
          <DecisionExceptionReview
            review={review}
            compact
            planId={plan.id}
            issueActionContext={emptyIssueContext(
              eventId,
              typeof window !== "undefined" ? window.scrollY : 0,
            )}
            acknowledgedActionIds={acknowledgedActionIds}
            onAcknowledgeIssue={(action) => onAcknowledgeIssue(action.id)}
            onExcludeIssueItems={onExcludeIssueItems}
            onChooseAlternative={onChooseAlternative}
            onBeforeFix={onBeforeFix}
          />
        )}

        {error ? (
          <p className="form-message" data-tone="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="inspector-footer decision-finalize-footer">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !canCommit}
          onClick={onConfirm}
        >
          {busy ? "Applying…" : primaryLabel}
        </button>
      </div>
    </div>
  );
}

/** @deprecated Use DecisionFinalizeInspector — kept as alias for imports. */
export const DecisionFinalizeOverlay = DecisionFinalizeInspector;
