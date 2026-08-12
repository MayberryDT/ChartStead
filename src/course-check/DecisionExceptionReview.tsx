import { useState } from "react";

import type {
  DecisionReviewIssue,
  DecisionReviewIssueClass,
  DecisionReviewItemFilter,
  DecisionReviewProjection,
} from "../../shared/course-check";

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

function IssueCard({
  issue,
  onChooseAlternative,
}: {
  issue: DecisionReviewIssue;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
}) {
  return (
    <article className="decision-exception" data-classification={issue.classification}>
      <h3>{issue.affectedObjectLabel}</h3>
      <p>{issue.summary}</p>
      {issue.consequence !== issue.summary ? (
        <p className="decision-exception-consequence">{issue.consequence}</p>
      ) : null}
      <p className="decision-exception-scope">{issue.scope}</p>
      {issue.affectedItems.length > 1 ? (
        <ul className="decision-exception-objects" aria-label="Affected submissions">
          {issue.affectedItems.map((item) => (
            <li key={item.itemId}>{item.proposalId}</li>
          ))}
        </ul>
      ) : null}
      {issue.nextStep ? <p className="muted">{issue.nextStep}</p> : null}
      {issue.safeAlternativeLabel ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChooseAlternative(issue)}
        >
          {issue.safeAlternativeLabel}
        </button>
      ) : null}
    </article>
  );
}

function ProposedReview({
  review,
  onChooseAlternative,
}: {
  review: DecisionReviewProjection;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
}) {
  const [filter, setFilter] = useState<DecisionReviewItemFilter | "all">("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const visibleItems = review.items.filter(
    (item) => filter === "all" || item.filter === filter,
  );

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

      {ISSUE_ORDER.filter(({ classification }) => classification !== "details").map(({ classification, title }) => {
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
            <h2 id={`decision-${classification}-title`}>{title}</h2>
            <div className="decision-exception-list">
              {matching.map((issue) => (
                <IssueCard
                  key={`${issue.classification}-${issue.summary}`}
                  issue={issue}
                  onChooseAlternative={onChooseAlternative}
                />
              ))}
            </div>
          </section>
        );
      })}

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
          <summary>Details</summary>
          <div className="decision-exception-list">
            {review.issues
              .filter((issue) => issue.classification === "details")
              .map((issue) => (
                <IssueCard
                  key={`${issue.classification}-${issue.summary}`}
                  issue={issue}
                  onChooseAlternative={onChooseAlternative}
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
  return (
    <div className="course-check-sections course-check-review decision-exception-review">
      <section
        className="panel course-check-result"
        role="region"
        aria-label="Decision results"
      >
        <h2>Results</h2>
        <p className="lede">{result.summary}</p>
        <div className="decision-result-counts" aria-label="Exact result counts">
          <strong>{counts.processed} processed</strong>
          <span>{counts.failed} failed</span>
          <span>{counts.warned} warned</span>
          <span>{counts.skipped} skipped</span>
          <span>{counts.unchanged} unchanged</span>
        </div>
        <div className="course-check-result-groups">
          <section><h3>Decisions</h3><p>{result.decisions.accepted} accepted · {result.decisions.declined} declined</p></section>
          <section><h3>Generated records</h3><p>{result.generatedRecords.totalCreated} created</p></section>
          <section><h3>Drafts</h3><p>{result.drafts.label}</p></section>
          <section><h3>External communication</h3><p>{result.externalCommunication.label}</p></section>
        </div>
        <p className="muted">Applied {result.appliedAt} by {result.appliedBy}.</p>
      </section>
    </div>
  );
}

export function DecisionExceptionReview({
  review,
  onChooseAlternative,
}: {
  review: DecisionReviewProjection;
  onChooseAlternative: (issue: DecisionReviewIssue) => void;
}) {
  return review.result ? (
    <AppliedResult review={review} />
  ) : (
    <ProposedReview review={review} onChooseAlternative={onChooseAlternative} />
  );
}
