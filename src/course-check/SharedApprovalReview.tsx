import type { CourseCheckSharedApprovalProjection } from "../../shared/course-check";

function stageStatusIcon(
  stage: CourseCheckSharedApprovalProjection["currentStage"],
) {
  if (stage.status === "complete") return "✓";
  if (stage.status === "out_of_date" || stage.status === "blocked") return "!";
  if (stage.canExecute || stage.canEndorse) return "→";
  return "•";
}

export function SharedApprovalReview({
  review,
}: {
  review: CourseCheckSharedApprovalProjection;
}) {
  const stage = review.currentStage;
  const showTechnicalDetails = Boolean(
    review.technicalDetails &&
      (review.freshness.state !== "current" ||
        stage.requiredEndorsementCount > 0 ||
        stage.distinctApproverRequired ||
        stage.reasonRequired),
  );

  return (
    <section
      className="panel course-check-shared-approval"
      aria-label="Stage approval"
    >
      <div className="course-check-stage-task-copy">
        <header className="course-check-section-header">
          <div>
            <p className="eyebrow">Current stage</p>
            <h2>{stage.label}</h2>
          </div>
          <span
            className="course-check-stage-badge"
            data-state={stage.status}
          >
            <span aria-hidden="true">{stageStatusIcon(stage)} </span>
            {stage.status.replaceAll("_", " ")}
          </span>
        </header>

        <p>{stage.stateSummary}</p>
        <p className="muted">
          Your access: {stage.canExecute ? "approve and execute" : stage.canEndorse ? "endorse" : stage.canRequestApproval ? "request approval" : "view only"}.
          {stage.availableCommit && !stage.canExecute
            ? ` Available commit: ${stage.availableCommit.label}.`
            : ""}
        </p>
        <ul className="course-check-stage-rules">
          {stage.requiredEndorsementCount > 0 ? (
            <li>
              {stage.endorsementCount} of {stage.requiredEndorsementCount}{" "}
              endorsements recorded
            </li>
          ) : null}
          {stage.distinctApproverRequired ? (
            <li>A different approver is required</li>
          ) : null}
          {stage.reasonRequired ? <li>An approval reason is required</li> : null}
        </ul>

        {review.freshness.changedInputs.length > 0 ? (
          <div className="course-check-freshness-scope" data-state="out_of_date">
            <strong>
              <span aria-hidden="true">! </span>What changed
            </strong>
            <ul>
              {review.freshness.changedInputs.map((input) => (
                <li key={input}>{input}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {review.freshness.preservedStageIds.length > 0 ? (
          <p className="muted">
            {review.freshness.preservedStageIds
              .map((stageId) => `${stageId} remains complete`)
              .join(" · ")}
          </p>
        ) : null}

        <p className="course-check-stage-next-action" role="status" aria-live="polite">
          {review.freshness.state === "current"
            ? stage.nextAction
            : review.freshness.nextAction}
        </p>
        <p className="muted course-check-resume-summary">
          {review.resume.selectionCount} selected · version {review.resume.planVersion} ·{" "}
          {review.resume.completedStageIds.length} completed stages ·{" "}
          {review.resume.outstandingIssueCount} outstanding issues ·{" "}
          {review.resume.activityCount} activity entries
        </p>
      </div>

      {showTechnicalDetails && review.technicalDetails ? (
        <details className="course-check-technical-details">
          <summary>Technical details</summary>
          <dl className="course-check-meta">
            <div>
              <dt>Plan ID</dt>
              <dd className="mono">{review.technicalDetails.planId}</dd>
            </div>
            <div>
              <dt>Plan version</dt>
              <dd>{review.technicalDetails.planVersion}</dd>
            </div>
            <div>
              <dt>Digest</dt>
              <dd className="mono">{review.technicalDetails.digest}</dd>
            </div>
          </dl>
          {review.technicalDetails.sourceRevisions.length > 0 ? (
            <>
              <h3>Source revisions</h3>
              <ul>
                {review.technicalDetails.sourceRevisions.map((revision) => (
                  <li key={revision}>{revision}</li>
                ))}
              </ul>
            </>
          ) : null}
          {review.technicalDetails.policyRules.length > 0 ? (
            <>
              <h3>Policy rules</h3>
              <ul>
                {review.technicalDetails.policyRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
