import type { CommunicationReviewProjection } from "../../shared/course-check";

function statusTone(
  state: CommunicationReviewProjection["progress"][number]["state"],
) {
  if (state === "attention") return "error";
  if (state === "current") return "warning";
  if (state === "complete") return "success";
  return "neutral";
}

export function CommunicationResultPanel({
  review,
  showOutboxDetails = false,
  onSend,
}: {
  review: CommunicationReviewProjection;
  showOutboxDetails?: boolean;
  onSend?: () => void;
}) {
  return (
    <section
      className="panel communication-result"
      aria-labelledby="communication-result-title"
    >
      <header className="course-check-section-header">
        <div>
          <p className="eyebrow">Communication status</p>
          <h2 id="communication-result-title">{review.currentStatus.label}</h2>
        </div>
      </header>

      <ol className="connected-course-check-progress" aria-label="Communication progress">
        {review.progress.map((step) => (
          <li key={step.key} data-state={step.state}>
            <strong>{step.label}</strong>
            <span
              className="course-check-stage-badge"
              data-tone={statusTone(step.state)}
            >
              {step.state}
            </span>
          </li>
        ))}
      </ol>

      {review.draftResult ? (
        <div className="course-check-result" role="status">
          <h3>{review.draftResult.title}</h3>
          <p>{review.draftResult.statement}</p>
          <div className="decision-result-counts" aria-label="Exact draft result counts">
            <strong>{review.draftResult.counts.prepared} prepared</strong>
            <span>{review.draftResult.counts.omitted} omitted</span>
            <span>{review.draftResult.counts.failed} failed</span>
            <span>{review.draftResult.counts.unchanged} unchanged</span>
          </div>
          <p className="course-check-boundary">No emails were sent.</p>
        </div>
      ) : (
        <p className="course-check-boundary">No draft has been prepared. No emails were sent.</p>
      )}

      {review.deliveryResult ? (
        <section aria-labelledby="communication-delivery-result-title">
          <h3 id="communication-delivery-result-title">Delivery results</h3>
          <p>{review.deliveryResult.statement}</p>
          <ul className="course-check-effects">
            {review.deliveryResult.effects.map((effect, index) => (
              <li key={`${effect.address}:${index}`} data-status={effect.outcome}>
                <strong>{effect.address}</strong>
                <span>{effect.label}</span>
                <span>{effect.attemptCount} attempt{effect.attemptCount === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.immutableBoundary ? (
        <p className="form-message" data-tone="info">
          {review.immutableBoundary}
        </p>
      ) : null}

      <nav className="button-row" aria-label="Communication follow-up">
        {review.handoffs.map((handoff) => (
          <a
            className={handoff.kind === "outbox" ? "btn btn-primary" : "btn btn-secondary"}
            href={handoff.href}
            key={handoff.kind}
          >
            {handoff.label}
          </a>
        ))}
      </nav>

      {showOutboxDetails ? (
        <section aria-label="Exact Outbox draft set" className="communication-outbox-set">
          <header className="course-check-section-header">
            <div>
              <p className="eyebrow">Outbox</p>
              <h3>
                {review.outbox.exactDraftCount} frozen draft
                {review.outbox.exactDraftCount === 1 ? "" : "s"}
              </h3>
              <p>{review.outbox.sourceLabel}</p>
            </div>
          </header>
          {review.outbox.groups.map((group) => (
            <article className="course-check-recipient-group" key={group.label}>
              <h4>{group.label}</h4>
              <p>
                {group.draftCount} draft{group.draftCount === 1 ? "" : "s"}
                {group.outcome ? ` · ${group.outcome}` : ""}
              </p>
              <div className="button-row">
                {group.proposalHref ? <a href={group.proposalHref}>View submission</a> : null}
                {group.sessionHref ? <a href={group.sessionHref}>View session</a> : null}
              </div>
              <ul className="course-check-recipients">
                {group.recipients.map((recipient, index) => (
                  <li key={`${recipient.address}:${index}`} data-inclusion={recipient.inclusion}>
                    <strong>{recipient.name} &lt;{recipient.address || "no address"}&gt;</strong>
                    <p>{recipient.inclusionReason}</p>
                    {recipient.priorCommunications.length > 0 ? (
                      <p className="muted">
                        Prior: {recipient.priorCommunications.map((prior) =>
                          `${prior.status} “${prior.subject}”${prior.sentAt ? ` (${prior.sentAt.slice(0, 10)})` : ""}`,
                        ).join("; ")}
                      </p>
                    ) : (
                      <p className="muted">No prior related communication.</p>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {review.outbox.draftlessGroups.length > 0 ? (
            <section id="draftless-items">
              <h4>Draftless items</h4>
              <ul>
                {review.outbox.draftlessGroups.map((group) => (
                  <li key={group.label}>
                    {group.proposalHref ? <a href={group.proposalHref}>{group.label}</a> : <strong>{group.label}</strong>}
                    {": "}{group.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}

      {review.sendAction && onSend ? (
        <div className="course-check-actions">
          <p>{review.sendAction.effectSummary} This is a separate approval.</p>
          <button type="button" className="btn btn-primary" onClick={onSend}>
            {review.sendAction.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}
