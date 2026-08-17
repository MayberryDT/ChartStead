import { useEffect, useMemo, useRef } from "react";

import type {
  CourseCheckPlan,
  DecisionReviewProjection,
  DecisionPlanBody,
} from "../../shared/course-check";
import { SharedApprovalReview } from "./SharedApprovalReview";

export interface DecisionFastPathCounts {
  accepted: number;
  declined: number;
  sessions: number;
  speakerRecords: number;
  onboardingTasks: number;
  communicationDrafts: number;
  externalEffects: number;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function joinClauses(clauses: string[]) {
  if (clauses.length <= 1) return clauses[0] ?? "";
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
}

export function decisionFastPathCounts(
  plan: CourseCheckPlan,
  review: DecisionReviewProjection,
): DecisionFastPathCounts {
  const body = plan.body as DecisionPlanBody;
  const items = body.items.filter((item) =>
    review.phase === "applied" ? item.status === "applied" : item.status === "active",
  );
  const generated = review.result?.generatedRecords;

  return {
    accepted: items.filter((item) => item.outcome === "accepted").length,
    declined: items.filter((item) => item.outcome === "declined").length,
    sessions:
      generated?.sessionsCreated ?? items.filter((item) => item.session !== null).length,
    speakerRecords:
      generated
        ? generated.speakersCreated + generated.speakersReused
        : items.reduce((count, item) => count + item.speakers.length, 0),
    onboardingTasks:
      generated?.tasksCreated ??
      items.reduce((count, item) => count + item.tasks.length, 0),
    communicationDrafts:
      review.result?.drafts.count ??
      review.effectGroups.find((group) => group.key === "drafts")?.count ??
      0,
    externalEffects:
      review.result?.externalCommunication.emailsSent ??
      review.effectGroups.find((group) => group.key === "external_communication")
        ?.count ??
      0,
  };
}

export function decisionFastPathActionLabel(counts: DecisionFastPathCounts) {
  const clauses: string[] = [];
  if (counts.accepted > 0) {
    clauses.push(
      `Accept ${counts.accepted} ${plural(counts.accepted, "submission")}`,
    );
  }
  if (counts.declined > 0) {
    clauses.push(
      `${clauses.length === 0 ? "Deny" : "deny"} ${counts.declined} ${plural(
        counts.declined,
        "submission",
      )}`,
    );
  }
  if (counts.sessions > 0) {
    clauses.push(`create ${counts.sessions} ${plural(counts.sessions, "session")}`);
  }
  if (counts.speakerRecords > 0) {
    clauses.push(
      `link ${counts.speakerRecords} ${plural(counts.speakerRecords, "speaker record")}`,
    );
  }
  if (counts.onboardingTasks > 0) {
    clauses.push(
      `create ${counts.onboardingTasks} onboarding ${plural(
        counts.onboardingTasks,
        "task",
      )}`,
    );
  }
  return joinClauses(clauses);
}

/**
 * A clean issue count is necessary but not sufficient. Keep policy-gated,
 * stale, split, deferred, or externally integrated work in the full workspace.
 */
export function isDecisionFastPathEligible(
  plan: CourseCheckPlan,
  review: DecisionReviewProjection,
) {
  if (plan.body.actionType !== "decision") return false;
  const body = plan.body;
  const hasReviewIssues =
    review.issues.length > 0 ||
    review.counts.needsAction > 0 ||
    review.counts.warning > 0;
  const hasComplexHistory =
    review.counts.skipped > 0 ||
    body.followUpQueue.length > 0 ||
    body.linkedPlanIds.length > 0 ||
    body.parentPlanId !== null ||
    body.batchGroupId !== null;
  const hasExternalStage =
    body.airtable.effects.length > 0 ||
    review.effectGroups.some(
      (group) => group.key === "integration" && group.count > 0,
    );
  const statusesAreSimple = body.items.every((item) =>
    review.phase === "applied" ? item.status === "applied" : item.status === "active",
  );
  const commitIsSimple =
    review.phase === "applied"
      ? Boolean(review.result && plan.receipt)
      : Boolean(review.primaryActionLabel) &&
        review.permittedCommits.length === 1 &&
        review.permittedCommits[0]?.stageId === "apply-decision";
  const approvalIsSimple =
    !plan.sharedApproval ||
    (plan.sharedApproval.currentStage.canExecute &&
      !plan.sharedApproval.currentStage.canEndorse &&
      plan.sharedApproval.currentStage.requiredApproverCount === 1 &&
      !plan.sharedApproval.currentStage.distinctApproverRequired &&
      !plan.sharedApproval.currentStage.reasonRequired);

  return (
    !hasReviewIssues &&
    review.freshness.state === "current" &&
    !hasComplexHistory &&
    !hasExternalStage &&
    statusesAreSimple &&
    commitIsSimple &&
    approvalIsSimple
  );
}

export function DecisionFastPath({
  plan,
  review,
  busy,
  error,
  onCancel,
  onConfirm,
  onPrepareDrafts,
  onReturnToSubmissions,
}: {
  plan: CourseCheckPlan;
  review: DecisionReviewProjection;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onPrepareDrafts: () => void;
  onReturnToSubmissions: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const counts = useMemo(
    () => decisionFastPathCounts(plan, review),
    [plan, review],
  );
  const actionLabel = decisionFastPathActionLabel(counts);
  const result = review.result;

  useEffect(() => {
    titleRef.current?.focus();
  }, [review.phase]);

  return (
    <main className="course-check-page course-check-fast-path-page">
      <section
        className="panel course-check-fast-path"
        role="dialog"
        aria-labelledby="decision-fast-path-title"
        aria-describedby={result ? undefined : "decision-fast-path-boundary"}
      >
        <header>
          <h1 id="decision-fast-path-title" ref={titleRef} tabIndex={-1}>
            {review.title}
          </h1>
          <p className="course-check-fast-path-clear">{review.courseCheckSummary}</p>
        </header>

        {result ? (
          <div className="course-check-fast-path-result" role="status">
            <p className="lede">{result.summary}</p>
            <p>{result.drafts.label} {result.externalCommunication.label}</p>
            <p className="muted">
              Applied {result.appliedAt} by {result.appliedBy}.
            </p>
          </div>
        ) : (
          <p id="decision-fast-path-boundary" className="course-check-boundary">
            {review.preCommitBoundary}
          </p>
        )}

        {plan.sharedApproval ? (
          <SharedApprovalReview review={plan.sharedApproval} />
        ) : null}

        <section aria-labelledby="decision-fast-path-effects-title">
          <h2 id="decision-fast-path-effects-title">
            {result ? "What happened" : "What will happen"}
          </h2>
          <ul className="course-check-fast-path-counts">
            <li>
              <strong>Decisions</strong>
              <span>{counts.accepted} accepted · {counts.declined} denied</span>
            </li>
            <li>
              <strong>Sessions</strong>
              <span>{counts.sessions} {plural(counts.sessions, "session")}</span>
            </li>
            <li>
              <strong>Speakers</strong>
              <span>
                {counts.speakerRecords} {plural(
                  counts.speakerRecords,
                  "speaker record or link",
                  "speaker records or links",
                )}
              </span>
            </li>
            <li>
              <strong>Onboarding</strong>
              <span>
                {counts.onboardingTasks} onboarding {plural(counts.onboardingTasks, "task")}
              </span>
            </li>
            <li>
              <strong>Drafts</strong>
              <span>{counts.communicationDrafts} communication drafts</span>
            </li>
            <li>
              <strong>External effects</strong>
              <span>{counts.externalEffects} external effects</span>
            </li>
          </ul>
        </section>

        {error ? (
          <p className="form-message" data-tone="error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="course-check-fast-path-actions">
          {result ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onReturnToSubmissions}
              >
                Return to submissions
              </button>
              {review.canStartDraftPreparation ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={onPrepareDrafts}
                >
                  Prepare communication drafts
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={onConfirm}
              >
                {actionLabel}
              </button>
            </>
          )}
        </footer>
      </section>
    </main>
  );
}
