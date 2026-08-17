import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DecisionReviewIssue,
  DecisionReviewIssueClass,
  DecisionReviewItemFilter,
  DecisionReviewProjection,
} from "../../shared/course-check";
import type { CourseCheckIssueAction } from "../../shared/course-check-actions";
import { IssueActions, shortIssueActionLabel } from "./IssueActions";
import { CourseCheckRepairLink } from "./CourseCheckRepairLink";
import {
  repairHref,
  saveCourseCheckReturnContext,
  type CourseCheckReturnContext,
} from "./useCourseCheckReturnContext";

const GENERIC_NON_BLOCKING_SCOPE = "This does not block the decision commit.";

type IssueActionProps = {
  planId: string;
  issueActionContext: Omit<CourseCheckReturnContext, "focusActionId">;
  acknowledgedActionIds: Set<string>;
  onAcknowledgeIssue: (action: CourseCheckIssueAction) => void;
  onExcludeIssueItems: (itemIds: string[]) => void;
  onBeforeFix?: () => void;
};

const ISSUE_ORDER: Array<{
  classification: DecisionReviewIssueClass;
  title: DecisionReviewIssue["label"];
}> = [
  { classification: "needs_action", title: "Needs action" },
  { classification: "could_not_check", title: "Could not check" },
  { classification: "check", title: "Check" },
  { classification: "details", title: "Details" },
];

const FILTERS: Array<{ key: DecisionReviewItemFilter | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "check", label: "Check" },
  { key: "ready", label: "Ready" },
  { key: "skipped", label: "Skipped" },
];

const CLASSIFICATION_ICON: Record<DecisionReviewIssueClass, string> = {
  needs_action: "!",
  could_not_check: "?",
  check: "!",
  details: "i",
};

/** Short topic title for compact inspector cards. */
export function compactIssueTitle(issue: DecisionReviewIssue): string {
  const text = `${issue.summary} ${issue.consequence}`.toLowerCase();
  if (/unplaced|no room|placement|place the session/.test(text)) {
    return "Session placement";
  }
  if (/\btbd\b|session time|set times|time remains/.test(text)) {
    return "Session time";
  }
  if (/email|draft|notification|recipient/.test(text)) {
    return "Notification draft";
  }
  if (/speaker|identity|duplicate/.test(text)) {
    return "Speaker identity";
  }
  if (/conflict|overlap/.test(text)) {
    return "Schedule conflict";
  }
  const first = issue.summary.split(/[.!?]/)[0]?.trim();
  return first && first.length <= 40 ? first : "Needs a decision";
}

function compactIssueDescription(issue: DecisionReviewIssue): string {
  // One concrete line — prefer the factual summary, strip ceremony.
  return issue.summary
    .replace(/\s+/g, " ")
    .replace(/\bthis does not block[^.]*\.?/gi, "")
    .trim();
}

function IssueCard({
  issue,
  compact,
  hideObjectLabel,
  onChooseAlternative,
  planId,
  issueActionContext,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
  onBeforeFix,
}: {
  issue: DecisionReviewIssue;
  compact: boolean;
  hideObjectLabel?: boolean;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
} & IssueActionProps) {
  if (compact) {
    const fixAction = issue.actions.find(
      (action) =>
        action.kind === "deep_repair" && action.target.type === "route",
    );
    const acceptAck = issue.actions.find(
      (action) =>
        action.kind === "acknowledge" &&
        action.target.type === "command" &&
        action.target.command === "acknowledge_warning",
    );
    const acceptDefer = issue.actions.find(
      (action) =>
        action.kind === "exclude" &&
        action.target.type === "command" &&
        action.target.command === "defer_items",
    );
    // Warnings: Accept = acknowledge. Blockers: Accept = leave this item unchanged.
    const acceptAction =
      acceptAck ??
      (issue.classification === "needs_action" ? acceptDefer : null);
    const isAccepted = Boolean(
      acceptAck && acknowledgedActionIds.has(acceptAck.id),
    );

    return (
      <article
        className="decision-exception decision-exception-compact-card"
        data-classification={issue.classification}
        data-accepted={isAccepted ? "true" : undefined}
      >
        <h3>{compactIssueTitle(issue)}</h3>
        <p className="decision-exception-desc">{compactIssueDescription(issue)}</p>
        <div className="decision-exception-actions-row">
          {isAccepted ? (
            <p className="course-check-action-result" role="status">
              Accepted
            </p>
          ) : (
            <>
              {acceptAction ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-issue-action-id={acceptAction.id}
                  onClick={() => {
                    if (
                      acceptAction.target.type === "command" &&
                      acceptAction.target.command === "acknowledge_warning"
                    ) {
                      onAcknowledgeIssue(acceptAction);
                      return;
                    }
                    if (
                      acceptAction.target.type === "command" &&
                      acceptAction.target.command === "defer_items"
                    ) {
                      onExcludeIssueItems(acceptAction.target.itemIds);
                      return;
                    }
                    onChooseAlternative(issue);
                  }}
                >
                  Accept
                </button>
              ) : null}
              {fixAction && fixAction.target.type === "route" ? (
                <CourseCheckRepairLink
                  className="btn btn-secondary btn-sm"
                  href={repairHref(
                    fixAction.target.href,
                    issueActionContext.returnPath,
                  )}
                  data-issue-action-id={fixAction.id}
                  onNavigate={() => {
                    onBeforeFix?.();
                    saveCourseCheckReturnContext(planId, {
                      ...issueActionContext,
                      focusActionId: fixAction.id,
                      acknowledgedIssueIds: [...acknowledgedActionIds],
                    });
                  }}
                >
                  Fix
                </CourseCheckRepairLink>
              ) : null}
            </>
          )}
        </div>
      </article>
    );
  }

  const showConsequence = issue.consequence !== issue.summary;
  const showNextStep =
    Boolean(issue.nextStep) &&
    issue.nextStep !== issue.summary &&
    issue.nextStep !== issue.consequence;
  const proceedAlreadySaid = /does not block|can proceed/i.test(
    `${issue.consequence}${issue.nextStep ?? ""}`,
  );
  const showScope =
    issue.scope !== issue.summary &&
    issue.scope !== issue.consequence &&
    !(issue.scope === GENERIC_NON_BLOCKING_SCOPE && proceedAlreadySaid);

  return (
    <article className="decision-exception" data-classification={issue.classification}>
      {hideObjectLabel ? null : <h3>{issue.affectedObjectLabel}</h3>}
      <p>{issue.summary}</p>
      {showConsequence ? (
        <p className="decision-exception-consequence">{issue.consequence}</p>
      ) : null}
      {showScope ? <p className="decision-exception-scope">{issue.scope}</p> : null}
      {issue.affectedItems.length > 1 ? (
        <ul className="decision-exception-objects" aria-label="Affected submissions">
          {issue.affectedItems.map((item) => (
            <li key={item.itemId}>{item.proposalId}</li>
          ))}
        </ul>
      ) : null}
      {showNextStep ? <p className="muted">{issue.nextStep}</p> : null}
      <IssueActions
        planId={planId}
        actions={issue.actions}
        context={issueActionContext}
        acknowledgedActionIds={acknowledgedActionIds}
        onAcknowledge={onAcknowledgeIssue}
        onExclude={onExcludeIssueItems}
      />
      {issue.safeAlternativeLabel ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChooseAlternative(issue)}
        >
          {shortIssueActionLabel(issue.safeAlternativeLabel)}
        </button>
      ) : null}
    </article>
  );
}

function CompactProposedReview({
  review,
  onChooseAlternative,
  planId,
  issueActionContext,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
  onBeforeFix,
}: {
  review: DecisionReviewProjection;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
} & IssueActionProps) {
  const groups = useMemo(() => {
    const visible = review.issues.filter(
      (issue) => issue.classification !== "details",
    );
    const map = new Map<string, DecisionReviewIssue[]>();
    for (const issue of visible) {
      const key = issue.affectedObjectLabel || "Submission";
      const list = map.get(key) ?? [];
      list.push(issue);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [review.issues]);

  return (
    <div className="course-check-sections course-check-review decision-exception-review decision-exception-compact">
      {groups.map(([objectLabel, issues]) => (
        <section
          key={objectLabel}
          className="decision-exception-group"
          aria-label={objectLabel}
        >
          <h2 className="decision-exception-submission-title">{objectLabel}</h2>
          <div className="decision-exception-list">
            {issues.map((issue) => (
              <IssueCard
                key={`${issue.classification}-${issue.summary}`}
                issue={issue}
                compact
                hideObjectLabel
                onChooseAlternative={onChooseAlternative}
                planId={planId}
                issueActionContext={issueActionContext}
                acknowledgedActionIds={acknowledgedActionIds}
                onAcknowledgeIssue={onAcknowledgeIssue}
                onExcludeIssueItems={onExcludeIssueItems}
                onBeforeFix={onBeforeFix}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ProposedReview({
  review,
  compact,
  onChooseAlternative,
  planId,
  issueActionContext,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
  onBeforeFix,
}: {
  review: DecisionReviewProjection;
  compact: boolean;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
} & IssueActionProps) {
  const [filter, setFilter] = useState<DecisionReviewItemFilter | "all">("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const visibleItems = review.items.filter(
    (item) => filter === "all" || item.filter === filter,
  );

  if (compact) {
    return (
      <CompactProposedReview
        review={review}
        onChooseAlternative={onChooseAlternative}
        planId={planId}
        issueActionContext={issueActionContext}
        acknowledgedActionIds={acknowledgedActionIds}
        onAcknowledgeIssue={onAcknowledgeIssue}
        onExcludeIssueItems={onExcludeIssueItems}
        onBeforeFix={onBeforeFix}
      />
    );
  }

  return (
    <div className="course-check-sections course-check-review decision-exception-review">
      <section className="panel decision-exception-summary" aria-label="Review summary">
        <div className="decision-exception-counts">
          <strong>{review.counts.eligible} eligible</strong>
          <span>{review.counts.needsAction} need action</span>
          <span>{review.counts.warning} to check</span>
          <span>{review.partialExecution.skippedCount} will stay unchanged</span>
        </div>
        <p className="course-check-boundary" role="status">
          {review.preCommitBoundary}
        </p>
      </section>

      {ISSUE_ORDER.filter(({ classification }) => classification !== "details").map(
        ({ classification, title }) => {
          const matching = review.issues.filter(
            (issue) => issue.classification === classification,
          );
          if (matching.length === 0) return null;
          return (
            <section
              className="panel decision-exception-section"
              aria-labelledby={`decision-${classification}-title`}
              key={classification}
            >
              <h2 id={`decision-${classification}-title`}>
                <span
                  className="course-check-classification-icon"
                  aria-hidden="true"
                >
                  {CLASSIFICATION_ICON[classification]}
                </span>{" "}
                {title}
              </h2>
              <div className="decision-exception-list">
                {matching.map((issue) => (
                  <IssueCard
                    key={`${issue.classification}-${issue.summary}`}
                    issue={issue}
                    compact={false}
                    onChooseAlternative={onChooseAlternative}
                    planId={planId}
                    issueActionContext={issueActionContext}
                    acknowledgedActionIds={acknowledgedActionIds}
                    onAcknowledgeIssue={onAcknowledgeIssue}
                    onExcludeIssueItems={(itemIds) => {
                      setSelectedItemIds(new Set(itemIds));
                      onExcludeIssueItems(itemIds);
                    }}
                    onBeforeFix={onBeforeFix}
                  />
                ))}
              </div>
            </section>
          );
        },
      )}

      <section className="panel" aria-labelledby="decision-review-effects-title">
        <h2 id="decision-review-effects-title">What will happen</h2>
        <ul className="course-check-review-effects">
          {review.effectGroups.map((group) => (
            <li key={group.key} data-state={group.state}>
              <div>
                <strong>{group.title}</strong>
                <span>{group.state === "pending" ? "Pending" : "Unchanged"}</span>
              </div>
              <p>{group.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      {review.issues.some((issue) => issue.classification === "details") ? (
        <details className="panel decision-exception-details">
          <summary>
            <span
              className="course-check-classification-icon"
              aria-hidden="true"
            >
              {CLASSIFICATION_ICON.details}
            </span>{" "}
            Details
          </summary>
          <div className="decision-exception-list">
            {review.issues
              .filter((issue) => issue.classification === "details")
              .map((issue) => (
                <IssueCard
                  key={`${issue.classification}-${issue.summary}`}
                  issue={issue}
                  compact={false}
                  onChooseAlternative={onChooseAlternative}
                  planId={planId}
                  issueActionContext={issueActionContext}
                  acknowledgedActionIds={acknowledgedActionIds}
                  onAcknowledgeIssue={onAcknowledgeIssue}
                  onExcludeIssueItems={(itemIds) => {
                    setSelectedItemIds(new Set(itemIds));
                    onExcludeIssueItems(itemIds);
                  }}
                  onBeforeFix={onBeforeFix}
                />
              ))}
          </div>
        </details>
      ) : null}

      <section
        className="panel decision-selected-submissions"
        aria-label="Selected submissions"
      >
        <div className="decision-selected-header">
          <h2>Selected submissions</h2>
          <div className="decision-filter-chips" aria-label="Submission filters">
            {FILTERS.map((option) => (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={filter === option.key}
                key={option.key}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="decision-table-wrap">
          <table className="decision-selected-table">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Proposed decision</th>
                <th>Speakers</th>
                <th>Decision readiness</th>
                <th>Draft readiness</th>
                <th>Batch outcome</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.itemId} data-filter={item.filter}>
                  <th scope="row">
                    <label className="decision-submission-label">
                      <input
                        type="checkbox"
                        aria-label={`${item.proposalId}: ${item.proposedDecision}`}
                        checked={selectedItemIds.has(item.itemId)}
                        disabled={item.filter === "skipped"}
                        onChange={() => {
                          setSelectedItemIds((current) => {
                            const next = new Set(current);
                            if (next.has(item.itemId)) next.delete(item.itemId);
                            else next.add(item.itemId);
                            return next;
                          });
                        }}
                      />
                      <span>
                        <strong>{item.proposalLabel}</strong>
                        <span>{item.proposalId}</span>
                      </span>
                    </label>
                  </th>
                  <td>{item.proposedDecision}</td>
                  <td>{item.speakerContext}</td>
                  <td>{item.decisionReadiness}</td>
                  <td>{item.draftReadiness}</td>
                  <td>{item.batchOutcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AppliedResult({ review }: { review: DecisionReviewProjection }) {
  const result = review.result!;
  const counts = result.outcomeCounts;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="course-check-sections course-check-review decision-exception-review">
      <section
        className="panel course-check-result"
        role="region"
        aria-label="Decision results"
      >
        <h2 ref={titleRef} tabIndex={-1}>
          Results
        </h2>
        <p className="lede">{result.summary}</p>
        <div className="decision-result-counts" aria-label="Exact result counts">
          <strong>{counts.processed} processed</strong>
          <span>{counts.failed} failed</span>
          <span>{counts.warned} warned</span>
          <span>{counts.skipped} skipped</span>
          <span>{counts.unchanged} unchanged</span>
        </div>
        <div className="course-check-result-groups">
          <section>
            <h3>Decisions</h3>
            <p>
              {result.decisions.accepted} accepted · {result.decisions.declined} denied
            </p>
          </section>
          <section>
            <h3>Generated records</h3>
            <p>{result.generatedRecords.totalCreated} created</p>
          </section>
          <section>
            <h3>Drafts</h3>
            <p>{result.drafts.label}</p>
          </section>
          <section>
            <h3>External communication</h3>
            <p>{result.externalCommunication.label}</p>
          </section>
        </div>
        <p className="muted">
          Applied {result.appliedAt} by {result.appliedBy}.
        </p>
      </section>
    </div>
  );
}

export function DecisionExceptionReview({
  review,
  onChooseAlternative,
  planId,
  issueActionContext,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
  onBeforeFix,
  compact = false,
}: {
  review: DecisionReviewProjection;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
  compact?: boolean;
} & IssueActionProps) {
  return review.result ? (
    <AppliedResult review={review} />
  ) : (
    <ProposedReview
      review={review}
      compact={compact}
      onChooseAlternative={onChooseAlternative}
      planId={planId}
      issueActionContext={issueActionContext}
      acknowledgedActionIds={acknowledgedActionIds}
      onAcknowledgeIssue={onAcknowledgeIssue}
      onExcludeIssueItems={onExcludeIssueItems}
      onBeforeFix={onBeforeFix}
    />
  );
}
