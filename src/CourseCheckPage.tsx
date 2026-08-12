import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CommunicationEffect,
  CommunicationPlanBody,
  CourseCheckEvidenceSection,
  CourseCheckFinding,
  CourseCheckPlan,
  DecisionReviewProjection,
  DecisionPlanBody,
  PublicationPlanBody,
} from "../shared/course-check";
import type { CourseCheckIssueAction } from "../shared/course-check-actions";
import {
  formatCourseCheckActorLabel,
  linkedPlanIdsFromBody,
  parentPlanIdFromBody,
} from "../shared/course-check";
import {
  ApiError,
  applyCourseCheckPlan,
  createCommunicationCourseCheck,
  createCommunicationCorrection,
  createCommunicationDrafts,
  deferCourseCheckItems,
  executeCourseCheckAirtable,
  fetchCourseCheckPlan,
  reconcileCourseCheckAirtable,
  reconcileCommunicationEffect,
  retryCommunicationEffect,
  reviseCommunicationCourseCheck,
  sendCommunication,
  setCourseCheckAirtableDisposition,
} from "./api";
import { DecisionExceptionReview } from "./course-check/DecisionExceptionReview";
import { createClientId } from "./id";
import {
  DecisionFastPath,
  isDecisionFastPathEligible,
} from "./course-check/DecisionFastPath";
import { IssueActions } from "./course-check/IssueActions";
import {
  repairHref,
  saveCourseCheckReturnContext,
  useCourseCheckReturnContext,
  type CourseCheckReturnContext,
} from "./course-check/useCourseCheckReturnContext";

function findingTone(severity: CourseCheckFinding["severity"]) {
  if (severity === "blocker") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function EvidenceSectionView({
  section,
  plan,
}: {
  section: CourseCheckEvidenceSection;
  plan: CourseCheckPlan;
}) {
  const findings = plan.body.findings.filter((finding) =>
    section.findingIds.includes(finding.id),
  );
  const deltas = section.deltaIndexes
    .map((index) => plan.body.deltas[index])
    .filter(Boolean);
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const infoCount = findings.filter((finding) => finding.severity === "info").length;
  const severity = blockerCount > 0 ? "blocker" : warningCount > 0 ? "warning" : infoCount > 0 ? "info" : "clean";
  const findingLabel = blockerCount > 0
    ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`
    : warningCount > 0
      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : infoCount > 0
        ? `${infoCount} note${infoCount === 1 ? "" : "s"}`
        : null;

  return (
    <details
      className="course-check-evidence"
      data-kind={section.kind}
      data-severity={severity}
      open={section.defaultExpanded}
    >
      <summary>
        <span className="course-check-disclosure-main">
          <strong>{section.title}</strong>
          <span className="course-check-evidence-summary">{section.summary}</span>
        </span>
        <span className="course-check-disclosure-meta">
          <span>{deltas.length} change{deltas.length === 1 ? "" : "s"}</span>
          {findingLabel ? (
            <span className="course-check-risk-badge" data-severity={severity}>
              {findingLabel}
            </span>
          ) : null}
          <span className="course-check-review-label">Review</span>
          <span className="course-check-chevron" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div className="course-check-evidence-body">
        {findings.length === 0 && deltas.length === 0 ? (
          <p className="muted">Nothing in this section.</p>
        ) : null}
        {findings.length > 0 ? (
          <ul className="course-check-findings">
            {findings.map((finding) => (
              <li key={finding.id} data-severity={finding.severity}>
                <strong>{finding.severity}</strong>
                <p>{finding.message}</p>
                {finding.recoveryGuidance ? (
                  <p className="course-check-recovery">{finding.recoveryGuidance}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {deltas.length > 0 ? (
          <ul className="course-check-deltas">
            {deltas.map((delta, index) => (
              <li key={`${section.kind}-delta-${index}`}>
                <span className="course-check-delta-type">
                  {delta.entityType} · {delta.action}
                  {delta.proposalId ? ` · ${delta.proposalId}` : ""}
                </span>
                <p>{delta.summary}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

function AirtableStage({
  plan,
  isPending,
  onAction,
}: {
  plan: CourseCheckPlan;
  isPending: boolean;
  onAction: (action: "execute" | "reconcile" | "deferred" | "removed") => void;
}) {
  const effects = plan.body.airtable.effects;
  if (effects.length === 0) return null;
  const canCommitIntegration =
    !plan.decisionReview ||
    plan.decisionReview.permittedCommits.some(
      (commit) => commit.stageId === "write-airtable",
    );

  return (
    <section className="course-check-airtable" aria-labelledby="airtable-effects-title">
      <header className="course-check-section-header">
        <div>
          <p className="eyebrow">Optional integration stage</p>
          <h2 id="airtable-effects-title">Write to Airtable</h2>
          <p className="muted">{plan.body.airtable.summary}</p>
        </div>
        <span className="course-check-stage-badge">
          {plan.body.airtable.disposition}
        </span>
      </header>

      <div className="course-check-airtable-effects">
        {effects.map((effect) => (
          <details
            className="course-check-airtable-effect"
            data-state={effect.state}
            key={effect.id}
          >
            <summary>
              <span className="course-check-disclosure-main">
                <strong>{effect.operation} {effect.tableName}</strong>
                <span className="course-check-effect-identity">
                  <span>{effect.kind}</span>
                  <span className="mono" title={effect.chartsteadId}>
                    {effect.chartsteadId}
                  </span>
                </span>
              </span>
              <span className="course-check-disclosure-meta">
                <span className="course-check-airtable-state" data-state={effect.state}>
                  {effect.state.replaceAll("_", " ")}
                </span>
                <span className="course-check-review-label">Review</span>
                <span className="course-check-chevron" aria-hidden="true">⌄</span>
              </span>
            </summary>
            <div className="course-check-airtable-effect-body">
              <dl>
                {Object.entries(effect.fields).map(([field, value]) => (
                  <div key={field}>
                    <dt>{field}</dt>
                    <dd>{String(value ?? "—")}</dd>
                  </div>
                ))}
              </dl>
              {effect.providerRecordId ? (
                <p className="muted">
                  Provider record <span className="mono" title={effect.providerRecordId}>{effect.providerRecordId}</span>
                </p>
              ) : null}
              {effect.lastError ? (
                <p className="form-message" data-tone="error">{effect.lastError}</p>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      {plan.receipt &&
      plan.body.airtable.disposition === "active" &&
      canCommitIntegration ? (
        <div className="course-check-airtable-actions">
          <button type="button" className="btn btn-primary" disabled={isPending} onClick={() => onAction("execute")}>
            Write to Airtable
          </button>
          {effects.some((effect) => effect.state === "unknown") ? (
            <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => onAction("reconcile")}>
              Reconcile unknown writes
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => onAction("deferred")}>
            Defer
          </button>
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={() => onAction("removed")}>
            Remove stage
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DecisionBatchBody({
  plan,
  selectedItemIds,
  onToggleItem,
}: {
  plan: CourseCheckPlan;
  selectedItemIds: Set<string>;
  onToggleItem: (itemId: string) => void;
}) {
  const body = plan.body as DecisionPlanBody;
  const sections =
    body.evidenceSections?.length > 0
      ? body.evidenceSections
      : ([
          {
            kind: "internal" as const,
            title: "Internal record details",
            defaultExpanded: true,
            summary: "Legacy plan without evidence sections.",
            findingIds: body.findings.map((f) => f.id),
            deltaIndexes: body.deltas.map((_, i) => i),
          },
        ] satisfies CourseCheckEvidenceSection[]);

  return (
    <div className="course-check-sections">
      <section className="panel">
        <h2>Plan</h2>
        <dl className="course-check-meta">
          <div>
            <dt>State</dt>
            <dd>{plan.state}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{plan.version}</dd>
          </div>
          <div>
            <dt>Plan reference</dt>
            <dd className="mono">{plan.id.slice(0, 8)}</dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>{formatCourseCheckActorLabel(plan.createdBy)}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>
              {body.aggregateProgress.active} active · {body.aggregateProgress.deferred}{" "}
              deferred · {body.aggregateProgress.applied} applied /{" "}
              {body.aggregateProgress.total}
            </dd>
          </div>
          {body.splitExplanation ? (
            <div>
              <dt>Linked plans</dt>
              <dd>{body.splitExplanation}</dd>
            </div>
          ) : null}
          {body.ageWarning?.active ? (
            <div>
              <dt>Age warning</dt>
              <dd>{body.ageWarning.message}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="panel">
        <h2>Batch decisions</h2>
        <ul className="course-check-batch-items">
          {body.items.map((item) => (
            <li key={item.itemId} data-status={item.status}>
              <label className="course-check-batch-item">
                <input
                  type="checkbox"
                  checked={selectedItemIds.has(item.itemId)}
                  disabled={item.status !== "active"}
                  onChange={() => onToggleItem(item.itemId)}
                />
                <span>
                  <strong>{item.proposalId}</strong> → {item.outcome} · {item.status}
                  {item.deferralReason ? ` · deferred: ${item.deferralReason}` : ""}
                </span>
              </label>
              {item.findings.some((f) => f.severity === "blocker") ? (
                <p className="form-message" data-tone="error">
                  Blocked:{" "}
                  {item.findings
                    .filter((f) => f.severity === "blocker")
                    .map((f) => f.message)
                    .join(" ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Evidence</h2>
        <p className="lede">
          Irreversible effects and people first. All sections stay collapsed until you
          choose to review them; warnings and blockers remain visible in each summary.
        </p>
        <div className="course-check-evidence-list">
          {sections.map((section) => (
            <EvidenceSectionView key={section.kind} section={section} plan={plan} />
          ))}
        </div>
      </section>

      {body.followUpQueue.length > 0 ? (
        <section className="panel">
          <h2>Follow-up queue</h2>
          <ul>
            {body.followUpQueue.map((item) => (
              <li key={item.id}>
                {item.proposalId} ({item.outcome}) — {item.reason} ·{" "}
                {formatCourseCheckActorLabel(item.deferredBy)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <OperationHistoryPanel plan={plan} />

      <section className="panel">
        <h2>External effects</h2>
        <p>
          No message, calendar, public-program, or integration delivery is created by
          Apply decision.
        </p>
      </section>
    </div>
  );
}

function DecisionReviewBody({
  plan,
  review,
  selectedItemIds,
  onToggleItem,
  issueActionContext,
  acknowledgedActionIds,
  onAcknowledgeIssue,
  onExcludeIssueItems,
}: {
  plan: CourseCheckPlan;
  review: DecisionReviewProjection;
  selectedItemIds: Set<string>;
  onToggleItem: (itemId: string) => void;
  issueActionContext: Omit<CourseCheckReturnContext, "focusActionId">;
  acknowledgedActionIds: Set<string>;
  onAcknowledgeIssue: (action: CourseCheckIssueAction) => void;
  onExcludeIssueItems: (itemIds: string[]) => void;
}) {
  const body = plan.body as DecisionPlanBody;
  const result = review.result;
  const itemState = (item: DecisionPlanBody["items"][number]) => {
    if (item.status === "deferred") return "Unchanged";
    if (item.status === "applied") {
      return item.outcome === "accepted" ? "Accepted" : "Declined";
    }
    return item.outcome === "accepted" ? "Will accept" : "Will decline";
  };

  return (
    <div className="course-check-sections course-check-review">
      {result ? (
        <section className="panel course-check-result" aria-labelledby="decision-result-title">
          <h2 id="decision-result-title">Results</h2>
          <p className="lede">{result.summary}</p>
          <div className="course-check-result-groups">
            <section>
              <h3>Decisions</h3>
              <p>
                {result.decisions.accepted} accepted · {result.decisions.declined} declined
              </p>
            </section>
            <section>
              <h3>Generated records</h3>
              <p>
                {result.generatedRecords.totalCreated === 0
                  ? "No related records were created."
                  : `${result.generatedRecords.totalCreated} related ${
                      result.generatedRecords.totalCreated === 1 ? "record was" : "records were"
                    } created.`}
              </p>
              {result.generatedRecords.totalCreated > 0 ? (
                <p className="muted">
                  {result.generatedRecords.speakersCreated} speakers ·{" "}
                  {result.generatedRecords.participationsCreated} participations ·{" "}
                  {result.generatedRecords.sessionsCreated} sessions ·{" "}
                  {result.generatedRecords.tasksCreated} tasks ·{" "}
                  {result.generatedRecords.portalAccessCreated} portal access grants
                </p>
              ) : null}
            </section>
            <section>
              <h3>Unchanged</h3>
              <p>
                {result.unchangedCount === 0
                  ? "No submissions were left unchanged."
                  : `${result.unchangedCount} ${
                      result.unchangedCount === 1 ? "submission was" : "submissions were"
                    } left unchanged.`}
              </p>
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
      ) : (
        <>
          <section className="panel" aria-labelledby="decision-review-summary-title">
            <h2 id="decision-review-summary-title">Review summary</h2>
            <dl className="course-check-review-counts">
              {Object.entries(review.counts).map(([label, count]) => (
                <div key={label}>
                  <dt>{label === "needsAction" ? "Needs action" : label}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
            <p className="course-check-boundary" role="status">
              {review.preCommitBoundary}
            </p>
          </section>

          {review.issues.length > 0 ? (
            <section className="panel" aria-labelledby="decision-review-issues-title">
              <h2 id="decision-review-issues-title">Prioritized issues</h2>
              {review.revalidation?.changedInputs.length ? (
                <div className="course-check-changed-inputs">
                  <h3>What changed</h3>
                  <ul>
                    {review.revalidation.changedInputs.map((input, index) => {
                      const actionId = `changed-input-${index}`;
                      return (
                        <li key={`${input.label}-${input.affectedEntityIds.join("-")}`}>
                          {input.target ? (
                            <a
                              href={repairHref(input.target.href, issueActionContext.returnPath)}
                              data-issue-action-id={actionId}
                              onClick={() =>
                                saveCourseCheckReturnContext(plan.id, {
                                  ...issueActionContext,
                                  focusActionId: actionId,
                                })
                              }
                            >
                              {input.label}
                            </a>
                          ) : (
                            input.label
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="muted">
                    Only affected dependencies must be reviewed again. Completed unaffected work stays intact.
                  </p>
                </div>
              ) : null}
              <ul className="course-check-findings">
                {review.issues.map((issue, index) => (
                  <li key={`${issue.summary}-${index}`} data-severity={issue.severity}>
                    <strong>{issue.severity}</strong>
                    <p>{issue.summary}</p>
                    {issue.nextStep ? (
                      <p className="course-check-recovery">{issue.nextStep}</p>
                    ) : null}
                    <IssueActions
                      planId={plan.id}
                      actions={issue.actions ?? []}
                      context={issueActionContext}
                      acknowledgedActionIds={acknowledgedActionIds}
                      onAcknowledge={onAcknowledgeIssue}
                      onExclude={onExcludeIssueItems}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
        </>
      )}

      <section className="panel" aria-labelledby="decision-items-title">
        <h2 id="decision-items-title">Selected decisions</h2>
        <ul className="course-check-batch-items">
          {body.items.map((item) => (
            <li key={item.itemId} data-status={item.status}>
              <label className="course-check-batch-item">
                <input
                  type="checkbox"
                  aria-label={`${item.proposalId}: ${itemState(item)}`}
                  checked={selectedItemIds.has(item.itemId)}
                  disabled={item.status !== "active"}
                  onChange={() => onToggleItem(item.itemId)}
                />
                <span>
                  <strong>{item.proposalId}</strong> · {itemState(item)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function OperationHistoryPanel({ plan }: { plan: CourseCheckPlan }) {
  const linked = linkedPlanIdsFromBody(plan.body);
  const parentId = parentPlanIdFromBody(plan.body);
  const activity = plan.activity ?? [];
  return (
    <>
      {linked.length > 0 || parentId ? (
        <section className="panel course-check-operation-history" aria-label="Linked operation history">
          <h2>Operation history</h2>
          <p className="muted">
            Linked plans stay navigable as one history. Approval never transfers between them.
          </p>
          <ul>
            {parentId ? (
              <li>
                Parent{" "}
                <Link
                  to="/e/$eventId/course-checks/$planId"
                  params={{ eventId: plan.eventId, planId: parentId }}
                >
                  {parentId.slice(0, 8)}
                </Link>
              </li>
            ) : null}
            {linked.map((id) => (
              <li key={id}>
                Linked{" "}
                <Link
                  to="/e/$eventId/course-checks/$planId"
                  params={{ eventId: plan.eventId, planId: id }}
                >
                  {id.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {activity.length > 0 ? (
        <section className="panel" aria-label="Shared activity">
          <h2>Shared activity</h2>
          <ul className="course-check-activity">
            {activity.map((entry) => (
              <li key={entry.id} data-role={entry.role}>
                <span className="course-check-activity-role">{entry.role}</span>
                {" · "}
                {entry.actor ? formatCourseCheckActorLabel(entry.actor) : "system"}
                {": "}
                {entry.summary}
                {entry.outcome ? ` → ${entry.outcome}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {plan.mutations && plan.mutations.length > 0 ? (
        <section className="panel">
          <h2>Mutation history</h2>
          <ul className="course-check-mutations">
            {plan.mutations.map((mutation) => (
              <li key={mutation.id}>
                v{mutation.fromVersion}→v{mutation.toVersion} · {mutation.kind} ·{" "}
                {formatCourseCheckActorLabel(mutation.actor)}: {mutation.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function GuaranteedBody({ plan }: { plan: CourseCheckPlan }) {
  const body = plan.body;
  if (body.actionType !== "guaranteed_speaker") return null;
  return (
    <div className="course-check-sections">
      <section className="panel">
        <h2>Plan</h2>
        <dl className="course-check-meta">
          <div>
            <dt>State</dt>
            <dd>{plan.state}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{plan.version}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{body.sourceLabel}</dd>
          </div>
        </dl>
      </section>
      {(body.evidenceSections ?? []).map((section) => (
        <EvidenceSectionView key={section.kind} section={section} plan={plan} />
      ))}
      <OperationHistoryPanel plan={plan} />
    </div>
  );
}

function PublicationBody({
  plan,
  overrideReasons,
  onOverrideReason,
}: {
  plan: CourseCheckPlan;
  overrideReasons: Record<string, string>;
  onOverrideReason: (findingId: string, reason: string) => void;
}) {
  const body = plan.body as PublicationPlanBody;
  if (body.actionType !== "publication") return null;
  const materialWarnings = body.findings.filter(
    (finding) => finding.severity === "warning" && finding.materialExternal,
  );
  return (
    <div className="course-check-sections">
      <section className="panel">
        <h2>Program publication</h2>
        <dl className="course-check-meta">
          <div>
            <dt>State</dt>
            <dd>{plan.state}</dd>
          </div>
          <div>
            <dt>Operation</dt>
            <dd>{body.operation}</dd>
          </div>
          <div>
            <dt>Public baseline</dt>
            <dd>
              {body.publicRevisionId
                ? `${body.publicRevisionId} (v${body.publicRevisionVersion})`
                : "None"}
            </dd>
          </div>
          <div>
            <dt>Included sessions</dt>
            <dd>{body.includedSessionIds.length}</dd>
          </div>
          <div>
            <dt>Excluded sessions</dt>
            <dd>{body.excludedSessions.length}</dd>
          </div>
        </dl>
      </section>

      {body.sessionDeltas.length > 0 ? (
        <section className="panel">
          <h2>Public delta</h2>
          <ul className="course-check-deltas">
            {body.sessionDeltas.map((delta) => (
              <li key={delta.sessionId}>
                <span className="course-check-delta-type">
                  {delta.changes.join(", ")} · {delta.sessionId}
                </span>
                <p>{delta.title}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.excludedSessions.length > 0 ? (
        <section className="panel">
          <h2>Kept internal</h2>
          <ul>
            {body.excludedSessions.map((row) => (
              <li key={row.sessionId}>
                <strong>{row.title}</strong> — {row.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {materialWarnings.length > 0 ? (
        <section className="panel">
          <h2>Material override reasons</h2>
          <p className="muted">
            Publishing known material conflicts or an empty subset requires a short reason
            for each warning.
          </p>
          <ul className="course-check-overrides">
            {materialWarnings.map((finding) => (
              <li key={finding.id}>
                <p>{finding.message}</p>
                <label>
                  Override reason
                  <input
                    type="text"
                    value={overrideReasons[finding.id] ?? ""}
                    onChange={(event) =>
                      onOverrideReason(finding.id, event.target.value)
                    }
                    placeholder="Why publish with this known issue?"
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.linkedPlanIds.length > 0 ? (
        <section className="panel">
          <h2>Linked communication</h2>
          <ul>
            {body.linkedPlanIds.map((id) => (
              <li key={id}>
                <Link
                  to="/e/$eventId/course-checks/$planId"
                  params={{ eventId: plan.eventId, planId: id }}
                >
                  {id.slice(0, 8)}
                </Link>{" "}
                — no delivery inherited
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="panel">
          <h2>Linked communication</h2>
          <p>
            Calendar and speaker notifications are not sent by Publish program. Linked
            Communication Course Checks appear after apply when calendar consequences exist.
          </p>
        </section>
      )}

      {(body.evidenceSections ?? []).map((section) => (
        <EvidenceSectionView key={section.kind} section={section} plan={plan} />
      ))}
      <OperationHistoryPanel plan={plan} />
    </div>
  );
}

function effectStatusLabel(status: CommunicationEffect["status"]): string {
  return status.replaceAll("_", " ");
}

function CommunicationEffectCard({
  effect,
  originalSubject,
  busy,
  onRetry,
  onReconcile,
  onCorrection,
}: {
  effect: CommunicationEffect;
  originalSubject: string;
  busy: boolean;
  onRetry: (effectId: string) => void;
  onReconcile: (
    effectId: string,
    outcome: "delivered" | "not_delivered",
    note: string,
    providerReference: string,
  ) => void;
  onCorrection: (
    effectId: string,
    input: { reason: string; subject: string; bodyText: string },
  ) => void;
}) {
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionSubject, setCorrectionSubject] = useState(
    `Correction: ${originalSubject}`,
  );
  const [correctionBody, setCorrectionBody] = useState("");
  const canRetry =
    effect.status === "permanent_failure" || effect.status === "exhausted";

  return (
    <li className="course-check-effect" data-status={effect.status}>
      <div className="course-check-effect-heading">
        <div>
          <strong>{effect.toEmail}</strong>
          <span className="course-check-effect-status" role="status">
            {effectStatusLabel(effect.status)}
          </span>
        </div>
        <span className="mono">{effect.effectId.slice(0, 18)}</span>
      </div>
      <dl className="course-check-effect-meta">
        <div>
          <dt>Attempts</dt>
          <dd>{effect.attemptCount}</dd>
        </div>
        <div>
          <dt>Provider reference</dt>
          <dd className="mono">{effect.providerReference ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Last attempt</dt>
          <dd>{effect.lastAttemptAt ?? "Not attempted"}</dd>
        </div>
        <div>
          <dt>Next attempt</dt>
          <dd>{effect.nextAttemptAt ?? "None scheduled"}</dd>
        </div>
      </dl>
      {effect.lastError ? (
        <p className="form-message" data-tone="error" role="alert">
          {effect.lastError}
        </p>
      ) : null}
      {canRetry ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => onRetry(effect.effectId)}
        >
          Retry this address
        </button>
      ) : null}
      {effect.status === "unknown" ? (
        <div className="course-check-effect-recovery">
          <p>
            Provider outcome is unknown. Check the provider before choosing an outcome;
            this address cannot be retried blindly.
          </p>
          <label className="stack-field">
            Investigation note
            <textarea
              rows={2}
              value={reconciliationNote}
              onChange={(event) => setReconciliationNote(event.target.value)}
            />
          </label>
          <label className="stack-field">
            Provider reference (required if delivered)
            <input
              type="text"
              value={providerReference}
              onChange={(event) => setProviderReference(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !reconciliationNote.trim() || !providerReference.trim()}
              onClick={() =>
                onReconcile(
                  effect.effectId,
                  "delivered",
                  reconciliationNote,
                  providerReference,
                )
              }
            >
              Mark delivered
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !reconciliationNote.trim()}
              onClick={() =>
                onReconcile(
                  effect.effectId,
                  "not_delivered",
                  reconciliationNote,
                  providerReference,
                )
              }
            >
              Mark not delivered
            </button>
          </div>
        </div>
      ) : null}
      {effect.status === "succeeded" ? (
        <details className="course-check-correction">
          <summary>Create a reviewed correction</summary>
          <div>
            <p className="muted">
              The original delivery stays on record. This creates a linked plan that
              must be reviewed, frozen, and sent separately.
            </p>
            <label className="stack-field">
              Why a correction is needed
              <input
                type="text"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
            </label>
            <label className="stack-field">
              Subject
              <input
                type="text"
                value={correctionSubject}
                onChange={(event) => setCorrectionSubject(event.target.value)}
              />
            </label>
            <label className="stack-field">
              Body
              <textarea
                rows={4}
                value={correctionBody}
                onChange={(event) => setCorrectionBody(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={
                busy ||
                !correctionReason.trim() ||
                !correctionSubject.trim() ||
                !correctionBody.trim()
              }
              onClick={() =>
                onCorrection(effect.effectId, {
                  reason: correctionReason,
                  subject: correctionSubject,
                  bodyText: correctionBody,
                })
              }
            >
              Create correction Course Check
            </button>
          </div>
        </details>
      ) : null}
    </li>
  );
}

function CommunicationBody({
  plan,
  subject,
  bodyText,
  selectedRecipientIds,
  onSubjectChange,
  onBodyTextChange,
  onToggleRecipient,
  effectActionPending,
  onRetryEffect,
  onReconcileEffect,
  onCreateCorrection,
}: {
  plan: CourseCheckPlan;
  subject: string;
  bodyText: string;
  selectedRecipientIds: Set<string>;
  onSubjectChange: (value: string) => void;
  onBodyTextChange: (value: string) => void;
  onToggleRecipient: (recipientId: string) => void;
  effectActionPending: boolean;
  onRetryEffect: (effectId: string) => void;
  onReconcileEffect: (
    effectId: string,
    outcome: "delivered" | "not_delivered",
    note: string,
    providerReference: string,
  ) => void;
  onCreateCorrection: (
    effectId: string,
    input: { reason: string; subject: string; bodyText: string },
  ) => void;
}) {
  const body = plan.body as CommunicationPlanBody;
  const draftsFrozen = body.stageVisibility.draft === "complete";
  const communicationIssues = body.findings.filter(
    (finding) =>
      finding.code.startsWith("recipient_") ||
      finding.code === "prior_related_communication",
  );
  const recipientById = new Map(
    body.recipientGroups.flatMap((group) =>
      group.recipients.map((recipient) => [
        recipient.recipientId,
        { recipient, group },
      ] as const),
    ),
  );
  return (
    <div className="course-check-sections">
      {body.source.kind === "linked_decision" ? (
        <section className="panel connected-course-check-progress" aria-label="Connected review progress">
          <h2>Decision and message progress</h2>
          <ol>
            <li data-state="complete"><strong>Decision applied</strong><span>Internal decisions and records are committed.</span></li>
            <li data-state={draftsFrozen ? "complete" : "current"}><strong>{draftsFrozen ? "Drafts created" : "Prepare drafts"}</strong><span>Message content and exact recipients require a separate commit.</span></li>
            <li data-state={body.stageVisibility.send === "complete" ? "complete" : "pending"}><strong>Send messages</strong><span>Sending remains a separate explicit approval.</span></li>
          </ol>
        </section>
      ) : null}

      {communicationIssues.length > 0 ? (
        <section className="panel" aria-labelledby="communication-issues-title">
          <h2 id="communication-issues-title">Message issues</h2>
          <p className="muted">
            These affect draft preparation only. Applied decisions and internal records stay committed.
          </p>
          <ul className="course-check-findings">
            {communicationIssues.map((finding) => {
              const affected = finding.entityRef
                ? recipientById.get(finding.entityRef)
                : undefined;
              const proposalId = affected?.group.proposalId;
              return (
                <li key={finding.id} data-severity={finding.severity}>
                  <strong>{finding.severity === "warning" ? "Check" : "Details"}</strong>
                  <p>{finding.message}</p>
                  {finding.recoveryGuidance ? (
                    <p className="course-check-recovery">{finding.recoveryGuidance}</p>
                  ) : null}
                  <div className="course-check-issue-actions" aria-label="Issue actions">
                    {proposalId &&
                    (finding.code === "recipient_missing_address" ||
                      finding.code === "recipient_invalid_address") ? (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/e/${encodeURIComponent(plan.eventId)}/submissions/${encodeURIComponent(proposalId)}?field=speakerEmail&returnTo=${encodeURIComponent(`/e/${plan.eventId}/course-checks/${body.parentPlanId ?? plan.id}?stage=${plan.id}`)}`}
                      >
                        Correct speaker email
                      </a>
                    ) : null}
                    {affected?.recipient.deliverability === "ok" ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={draftsFrozen}
                        onClick={() => onToggleRecipient(affected.recipient.recipientId)}
                      >
                        {selectedRecipientIds.has(affected.recipient.recipientId)
                          ? "Exclude from drafts"
                          : "Include in drafts"}
                      </button>
                    ) : (
                      <span className="muted">No draft will be created for this recipient.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2>Communication plan</h2>
        <dl className="course-check-meta">
          <div>
            <dt>State</dt>
            <dd>{plan.state}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{plan.version}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {body.source.kind === "linked_decision"
                ? `Linked decision ${body.source.decisionPlanId?.slice(0, 8) ?? ""}`
                : body.source.kind === "compensation"
                  ? `Correction to ${body.compensation?.originalPlanId.slice(0, 8) ?? "delivery"}`
                  : body.source.kind === "publication"
                    ? "Program publication"
                    : "Direct selection"}
            </dd>
          </div>
          <div>
            <dt>Stage visibility</dt>
            <dd>
              decision {body.stageVisibility.decision} · draft {body.stageVisibility.draft}{" "}
              · send {body.stageVisibility.send} · delivery {body.stageVisibility.delivery}
            </dd>
          </div>
        </dl>
        <p className="muted">
          Creating drafts never sends email or calendar invites. Send messages separately
          approves the exact frozen payloads and creates one durable effect per address.
        </p>
        {body.compensation ? (
          <p className="form-message" data-tone="warning">
            Correction for effect {body.compensation.originalEffectId}: {body.compensation.reason}
          </p>
        ) : null}
      </section>

      {body.calendarOps.length > 0 ? (
        <section className="panel">
          <h2>Calendar operations</h2>
          <p className="muted">
            Stable UID lifecycle. Corrections are compensating updates or cancellations —
            sent invites are never rewritten in place.
          </p>
          <ul className="course-check-deltas">
            {body.calendarOps.map((op) => (
              <li key={`${op.sessionId}:${op.kind}:${op.sequence}`}>
                <span className="course-check-delta-type">
                  {op.kind} · seq {op.sequence}
                </span>
                <p>
                  <strong>{op.title}</strong>
                </p>
                <p className="muted">
                  UID {op.uid}
                  {op.timePending
                    ? " · time TBD"
                    : op.startsAt && op.endsAt
                      ? ` · ${op.startsAt.slice(0, 16)} → ${op.endsAt.slice(0, 16)}`
                      : ""}
                  {op.locationPending
                    ? " · location pending"
                    : op.roomName
                      ? ` · ${op.roomName}`
                      : ""}
                  {" · "}
                  {op.recipients.length} recipient
                  {op.recipients.length === 1 ? "" : "s"} · reversibility{" "}
                  {op.reversibility.replaceAll("_", " ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel course-check-message-content">
        <h2>Message content</h2>
        <label className="stack-field">
          Subject
          <input
            type="text"
            value={subject}
            disabled={draftsFrozen || Boolean(body.redacted)}
            onChange={(event) => onSubjectChange(event.target.value)}
          />
        </label>
        <label className="stack-field">
          Body
          <textarea
            rows={8}
            value={bodyText}
            disabled={draftsFrozen || Boolean(body.redacted)}
            onChange={(event) => onBodyTextChange(event.target.value)}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Recipient groups</h2>
        {body.recipientGroups.map((group) => (
          <div key={group.groupId} className="course-check-recipient-group">
            <h3>
              {group.label}
              {group.outcome ? ` · ${group.outcome}` : ""}
              {group.sessionId ? ` · session ${group.sessionId.slice(0, 8)}` : ""}
            </h3>
            <ul className="course-check-recipients">
              {group.recipients.map((recipient) => (
                <li key={recipient.recipientId} data-inclusion={recipient.inclusion}>
                  <label className="course-check-batch-item">
                    <input
                      type="checkbox"
                      checked={selectedRecipientIds.has(recipient.recipientId)}
                      disabled={
                        draftsFrozen ||
                        Boolean(body.redacted) ||
                        recipient.deliverability !== "ok"
                      }
                      onChange={() => onToggleRecipient(recipient.recipientId)}
                    />
                    <span>
                      <strong>
                        {recipient.name} &lt;{recipient.address || "no address"}&gt;
                      </strong>{" "}
                      · {recipient.role} · {recipient.inclusion} ·{" "}
                      {recipient.deliverability}
                      <br />
                      <span className="muted">{recipient.inclusionReason}</span>
                      {recipient.priorCommunications.length > 0 ? (
                        <>
                          <br />
                          <span className="muted">
                            Prior:{" "}
                            {recipient.priorCommunications
                              .map(
                                (prior) =>
                                  `${prior.status} “${prior.subject}” (${prior.createdAt.slice(0, 10)})`,
                              )
                              .join("; ")}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {body.drafts.length > 0 ? (
        <section className="panel">
          <h2>Frozen drafts</h2>
          <ul className="course-check-deltas">
            {body.drafts.map((draft) => (
              <li key={draft.draftId}>
                <span className="course-check-delta-type">
                  {draft.status} · {draft.toEmail}
                </span>
                <p>
                  <strong>{draft.subject}</strong>
                </p>
                <p className="muted">{draft.bodyText}</p>
                {draft.calendarIntent && draft.calendarIntent.operation !== "none" ? (
                  <p className="muted">
                    Calendar {draft.calendarIntent.operation} · UID{" "}
                    {draft.calendarIntent.uid} · seq {draft.calendarIntent.sequence}
                    {draft.calendarIntent.locationPending
                      ? " · location pending"
                      : draft.calendarIntent.location
                        ? ` · ${draft.calendarIntent.location}`
                        : ""}
                    {draft.attachmentRefs.length > 0
                      ? ` · attachment ${draft.attachmentRefs.join(", ")}`
                      : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.effects.length > 0 ? (
        <section className="panel">
          <h2>Delivery effects</h2>
          <p className="lede">
            {body.deliverySummary.succeeded} succeeded · {body.deliverySummary.queued}{" "}
            queued · {body.deliverySummary.sending} sending ·{" "}
            {body.deliverySummary.retryScheduled} retry scheduled ·{" "}
            {body.deliverySummary.failed} failed · {body.deliverySummary.unknown}{" "}
            unknown
          </p>
          <ul className="course-check-effects">
            {body.effects.map((effect) => (
              <CommunicationEffectCard
                key={effect.effectId}
                effect={effect}
                originalSubject={body.subject}
                busy={effectActionPending}
                onRetry={onRetryEffect}
                onReconcile={onReconcileEffect}
                onCorrection={onCreateCorrection}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {(body.evidenceSections ?? []).length > 0 ? (
        <details className="panel decision-exception-details">
          <summary>Details</summary>
          <div className="course-check-evidence-list">
            {(body.evidenceSections ?? []).map((section) => (
              <EvidenceSectionView key={section.kind} section={section} plan={plan} />
            ))}
          </div>
        </details>
      ) : null}

      <OperationHistoryPanel plan={plan} />
    </div>
  );
}

export function CourseCheckPage() {
  const { eventId, planId } = useParams({
    from: "/e/$eventId/course-checks/$planId",
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const originSearch = useSearch({
    from: "/e/$eventId/course-checks/$planId",
  });
  const activePlanId = originSearch.stage ?? planId;
  const [message, setMessage] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [deferReason, setDeferReason] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(
    new Set(),
  );
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>(
    {},
  );
  const [issueFilter, setIssueFilter] = useState("all");
  const [expandedIssueIds, setExpandedIssueIds] = useState<string[]>([]);
  const [focusDeferReason, setFocusDeferReason] = useState(false);
  const [acknowledgedActionIds, setAcknowledgedActionIds] = useState<Set<string>>(
    new Set(),
  );
  const applyKey = useMemo(
    () => `ui-apply-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );
  const deferKey = useMemo(
    () => `ui-defer-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );
  const draftsKey = useMemo(
    () => `ui-drafts-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );
  const reviseKey = useMemo(
    () => `ui-revise-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );
  const linkCommKey = useMemo(
    () => `ui-link-comm-${planId}-${createClientId()}`,
    [planId],
  );
  const airtableKey = useMemo(
    () => `ui-airtable-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );
  const sendKey = useMemo(
    () => `ui-send-${activePlanId}-${createClientId()}`,
    [activePlanId],
  );

  const planQuery = useQuery({
    queryKey: ["course-check", eventId, activePlanId],
    queryFn: () => fetchCourseCheckPlan(eventId, activePlanId),
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!current || current.body.actionType !== "communication") return false;
      const summary = current.body.deliverySummary;
      return summary.queued + summary.sending + summary.retryScheduled > 0
        ? 2_000
        : false;
    },
  });

  useEffect(() => {
    const next = planQuery.data;
    if (!next || next.body.actionType !== "communication") return;
    setSubject(next.body.subject);
    setBodyText(next.body.bodyText);
    setSelectedRecipientIds(
      new Set(
        next.body.recipientGroups.flatMap((group) =>
          group.recipients.filter((r) => r.selected).map((r) => r.recipientId),
        ),
      ),
    );
  }, [planQuery.data?.id, planQuery.data?.version, planQuery.data?.digest]);

  const restoreReviewContext = useCallback((context: CourseCheckReturnContext) => {
    setSelectedItemIds(new Set(context.selectedItemIds));
    setIssueFilter(context.issueFilter);
    setExpandedIssueIds(context.expandedIssueIds);
    setSubject(context.subject);
    setBodyText(context.bodyText);
    setSelectedRecipientIds(new Set(context.selectedRecipientIds));
    setOverrideReasons(context.overrideReasons);
    setAcknowledgedActionIds(new Set(context.acknowledgedIssueIds));
  }, []);
  useCourseCheckReturnContext(
    activePlanId,
    Boolean(planQuery.data),
    restoreReviewContext,
  );

  useEffect(() => {
    if (!focusDeferReason || selectedItemIds.size === 0) return;
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Why defer these items?"]',
    );
    if (!input) return;
    input.focus();
    setFocusDeferReason(false);
  }, [focusDeferReason, selectedItemIds]);

  const applyMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) => {
      const stageId =
        current.body.actionType === "publication"
          ? current.body.stages.find((stage) => stage.status === "ready")?.id ??
            current.body.stages[0]?.id ??
            "publish-program"
          : "apply-decision";
      const softWarningOverrides =
        current.body.actionType === "publication"
          ? current.body.findings
              .filter((finding) => finding.severity === "warning" && finding.materialExternal)
              .map((finding) => ({
                findingId: finding.id,
                reason: overrideReasons[finding.id] ?? null,
              }))
          : undefined;
      return applyCourseCheckPlan(eventId, current.id, {
        planVersion: current.version,
        digest: current.digest,
        stageId,
        idempotencyKey: applyKey,
        softWarningOverrides,
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      void queryClient.invalidateQueries({ queryKey: ["proposals", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["public-program", eventId] });
      setMessage(
        next.body.actionType === "publication"
          ? next.state === "Complete"
            ? "Program publication applied. Linked communication plans stay separate."
            : `Publication ${next.state}.`
          : next.state === "Partially complete"
            ? "Remaining batch applied. Deferred items stay in the follow-up queue."
            : "Decision applied. Internal records updated; no speaker email was sent.",
      );
    },
  });

  const deferMutation = useMutation({
    mutationFn: ({
      current,
      itemIds,
      reason,
    }: {
      current: CourseCheckPlan;
      itemIds: string[];
      reason: string;
    }) =>
      deferCourseCheckItems(eventId, current.id, {
        planVersion: current.version,
        digest: current.digest,
        itemIds,
        reason,
        idempotencyKey: `${deferKey}-${itemIds.join(",")}`,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setSelectedItemIds(new Set());
      setDeferReason("");
      if (
        next.body.actionType === "decision" &&
        next.body.aggregateProgress.active > 0
      ) {
        setMessage("Deferred items moved to follow-up. Applying the remaining decisions…");
        applyMutation.mutate(next);
      } else {
        setMessage("All selected decisions were deferred to follow-up.");
        void navigate({
          to: "/e/$eventId/submissions",
          params: { eventId },
          search: { q: undefined, status: undefined, track: undefined, sort: undefined },
        });
      }
    },
  });

  const reviseMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) => {
      if (current.body.actionType !== "communication") {
        throw new Error("Not a communication plan");
      }
      const recipientSelection = current.body.recipientGroups.flatMap((group) =>
        group.recipients.map((recipient) => ({
          recipientId: recipient.recipientId,
          selected: selectedRecipientIds.has(recipient.recipientId),
        })),
      );
      return reviseCommunicationCourseCheck(eventId, current.id, {
        planVersion: current.version,
        digest: current.digest,
        subject,
        bodyText,
        recipientSelection,
        idempotencyKey: `${reviseKey}-${current.version}`,
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setMessage("Saved a new communication plan version. Draft approval cleared.");
    },
  });

  const draftsMutation = useMutation({
    mutationFn: async (current: CourseCheckPlan) => {
      if (current.body.actionType !== "communication") {
        throw new Error("Not a communication plan");
      }
      let working = current;
      const contentChanged =
        subject !== current.body.subject || bodyText !== current.body.bodyText;
      const selectionChanged = current.body.recipientGroups.some((group) =>
        group.recipients.some(
          (recipient) =>
            selectedRecipientIds.has(recipient.recipientId) !== recipient.selected,
        ),
      );
      if (contentChanged || selectionChanged) {
        working = await reviseCommunicationCourseCheck(eventId, current.id, {
          planVersion: current.version,
          digest: current.digest,
          subject,
          bodyText,
          recipientSelection: current.body.recipientGroups.flatMap((group) =>
            group.recipients.map((recipient) => ({
              recipientId: recipient.recipientId,
              selected: selectedRecipientIds.has(recipient.recipientId),
            })),
          ),
          idempotencyKey: `${reviseKey}-pre-draft-${current.version}`,
        });
      }
      const materialWarnings = working.body.findings.filter(
        (finding) => finding.severity === "warning" && finding.materialExternal,
      );
      return createCommunicationDrafts(eventId, working.id, {
        planVersion: working.version,
        digest: working.digest,
        stageId: "create-drafts",
        idempotencyKey: draftsKey,
        softWarningOverrides: materialWarnings.map((finding) => ({
          findingId: finding.id,
          reason: "Reviewed prior communication; proceeding with draft freeze.",
        })),
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      void queryClient.invalidateQueries({ queryKey: ["course-checks", eventId] });
      setMessage("Drafts frozen. Review the exact payloads, then send when ready.");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) => {
      if (current.body.actionType !== "communication") {
        throw new Error("Not a communication plan");
      }
      return sendCommunication(eventId, current.id, {
        planVersion: current.version,
        digest: current.digest,
        stageId: "send-messages",
        idempotencyKey: sendKey,
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setMessage(
        "Delivery intent is durable. Each address now has an independent effect record.",
      );
    },
  });

  const retryEffectMutation = useMutation({
    mutationFn: (effectId: string) =>
      retryCommunicationEffect(
        eventId,
        activePlanId,
        effectId,
        `ui-retry-${effectId}-${createClientId()}`,
      ),
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setMessage("The selected address is queued for a new bounded delivery attempt.");
    },
  });

  const reconcileEffectMutation = useMutation({
    mutationFn: (input: {
      effectId: string;
      outcome: "delivered" | "not_delivered";
      note: string;
      providerReference: string;
    }) =>
      reconcileCommunicationEffect(eventId, activePlanId, input.effectId, {
        outcome: input.outcome,
        note: input.note,
        providerReference: input.providerReference || undefined,
        idempotencyKey: `ui-reconcile-${input.effectId}-${createClientId()}`,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setMessage("The unknown provider outcome was reconciled and recorded.");
    },
  });

  const correctionMutation = useMutation({
    mutationFn: (input: {
      effectId: string;
      reason: string;
      subject: string;
      bodyText: string;
    }) =>
      createCommunicationCorrection(eventId, activePlanId, input.effectId, {
        reason: input.reason,
        subject: input.subject,
        bodyText: input.bodyText,
        idempotencyKey: `ui-correction-${input.effectId}-${createClientId()}`,
      }),
    onSuccess: (next) => {
      window.location.assign(`/e/${eventId}/course-checks/${next.id}`);
    },
  });

  const linkCommunicationMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) =>
      createCommunicationCourseCheck(eventId, {
        decisionPlanId: current.id,
        idempotencyKey: linkCommKey,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, next.id], next);
      void navigate({
        to: "/e/$eventId/course-checks/$planId",
        params: { eventId, planId },
        search: {
          q: originSearch.q,
          status: originSearch.status,
          track: originSearch.track,
          sort: originSearch.sort,
          stage: next.id,
        },
        replace: true,
      });
    },
  });

  const airtableMutation = useMutation({
    mutationFn: (input: {
      plan: CourseCheckPlan;
      action: "execute" | "reconcile" | "deferred" | "removed";
    }) => {
      const key = `${airtableKey}-${input.action}`;
      if (input.action === "execute") {
        return executeCourseCheckAirtable(eventId, input.plan, key);
      }
      if (input.action === "reconcile") {
        return reconcileCourseCheckAirtable(eventId, input.plan, key);
      }
      return setCourseCheckAirtableDisposition(eventId, input.plan, input.action, key);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, activePlanId], next);
      setMessage("Airtable stage updated. Internal ChartStead work remains committed.");
    },
  });

  if (planQuery.isLoading) {
    return (
      <main className="course-check-page">
        <p>Loading Course Check…</p>
      </main>
    );
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <main className="course-check-page">
        <p className="form-message" data-tone="error" role="alert">
          {planQuery.error instanceof Error
            ? planQuery.error.message
            : "Course Check not found."}
        </p>
        <Link
          to="/e/$eventId/submissions"
          params={{ eventId }}
          search={{ q: undefined, status: undefined, track: undefined, sort: undefined }}
        >
          Back to submissions
        </Link>
      </main>
    );
  }

  const currentPlan = planQuery.data;
  const isDecision = currentPlan.body.actionType === "decision";
  const isCommunication = currentPlan.body.actionType === "communication";
  const isPublication = currentPlan.body.actionType === "publication";
  const communicationBody = isCommunication
    ? (currentPlan.body as CommunicationPlanBody)
    : null;
  const publicationBody = isPublication
    ? (currentPlan.body as PublicationPlanBody)
    : null;
  const decisionReview = isDecision ? currentPlan.decisionReview ?? null : null;
  const issueActionContext = {
    returnPath: `/e/${eventId}/course-checks/${planId}`,
    selectedItemIds: [...selectedItemIds],
    issueFilter,
    expandedIssueIds,
    subject,
    bodyText,
    selectedRecipientIds: [...selectedRecipientIds],
    overrideReasons,
    acknowledgedIssueIds: [...acknowledgedActionIds],
    scrollY: typeof window === "undefined" ? 0 : window.scrollY,
  };
  const blocked = currentPlan.body.findings.some(
    (finding) => finding.severity === "blocker",
  );
  const decisionComplete =
    currentPlan.state === "Complete" || currentPlan.state === "Partially complete";
  const draftsComplete =
    Boolean(communicationBody) &&
    communicationBody!.stageVisibility.draft === "complete" &&
    communicationBody!.drafts.length > 0;
  const deliveryStarted = Boolean(communicationBody?.effects.length);
  const createDraftsStage = currentPlan.body.stages.find(
    (stage) => stage.id === "create-drafts",
  );
  const applyStage = currentPlan.body.stages.find(
    (stage) => stage.id === "apply-decision",
  );

  if (
    isDecision &&
    decisionReview &&
    isDecisionFastPathEligible(currentPlan, decisionReview)
  ) {
    const returnToSubmissions = (clearSelection: boolean) => {
      if (clearSelection) {
        sessionStorage.removeItem(`chartstead:decision-batch:${eventId}`);
      }
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId },
        search: {
          q: originSearch.q,
          status: originSearch.status,
          track: originSearch.track,
          sort: originSearch.sort,
        },
      });
    };
    const applyError = applyMutation.error;
    const fastPathError = applyMutation.isError
      ? applyError instanceof ApiError
        ? applyError.message
        : "Unable to apply these decisions."
      : linkCommunicationMutation.isError
        ? linkCommunicationMutation.error instanceof ApiError
          ? linkCommunicationMutation.error.message
          : "Unable to prepare communication drafts."
        : null;

    return (
      <DecisionFastPath
        plan={currentPlan}
        review={decisionReview}
        busy={applyMutation.isPending || linkCommunicationMutation.isPending}
        error={fastPathError}
        onCancel={() => returnToSubmissions(false)}
        onConfirm={() => {
          setMessage(null);
          applyMutation.mutate(currentPlan);
        }}
        onPrepareDrafts={() => {
          setMessage(null);
          linkCommunicationMutation.mutate(currentPlan);
        }}
        onReturnToSubmissions={() => returnToSubmissions(true)}
      />
    );
  }

  return (
    <main className="course-check-page">
      <header className="course-check-header">
        <div className="course-check-header-copy">
          <p className="eyebrow">Course Check</p>
          <h1>
            {isCommunication
              ? communicationBody?.source.kind === "linked_decision"
                ? communicationBody.templateKind === "acceptance"
                  ? "Prepare acceptance messages"
                  : communicationBody.templateKind === "decline"
                    ? "Prepare decline messages"
                    : "Prepare decision messages"
                : "Communication workspace"
              : isPublication
                ? "Program publication workspace"
                : isDecision
                  ? decisionReview?.title ?? "Shared decision workspace"
                  : "Course Check workspace"}
          </h1>
          <p className="lede">
            {isCommunication
              ? communicationBody?.source.kind === "linked_decision"
                ? "Continue the decision review here: edit message content, check exact recipients, then separately create drafts. No messages are sent at this stage."
                : "Review exact recipients, approve delivery, and recover every address from the delivery results."
              : isPublication
                ? "Inspect the public program changes before you publish, unpublish, or restore. Communication stays separate."
                : decisionReview?.courseCheckSummary ??
                  "Shared Course Check workspace. Another authorized administrator can open this exact batch and continue."}
          </p>
        </div>
        <div className="course-check-header-tools">
          {decisionReview ? (
            <p className="course-check-freshness" data-state={decisionReview.freshness.state}>
              {decisionReview.freshness.label}
            </p>
          ) : (
            <div className="course-check-header-status">
              <span className="course-check-plan-state" data-state={currentPlan.state}>
                {currentPlan.state}
              </span>
              <span className="mono" title={currentPlan.id}>#{currentPlan.id.slice(0, 8)}</span>
            </div>
          )}
          <Link
            className="btn btn-secondary btn-sm"
            to="/e/$eventId/submissions"
            params={{ eventId }}
            search={{ q: undefined, status: undefined, track: undefined, sort: undefined }}
          >
            Back to submissions
          </Link>
        </div>
      </header>

      {currentPlan.state === "Out of date" ? (
        <p className="form-message" data-tone="warning" role="status">
          This Course Check is out of date. A relevant input changed after it was
          reviewed. Refresh the plan or open a new Course Check, then approve the
          updated exact result before applying.
        </p>
      ) : null}

      {isDecision ? (
        decisionReview ? (
          <DecisionExceptionReview
            review={decisionReview}
            planId={currentPlan.id}
            onChooseAlternative={(issue) => {
              setSelectedItemIds(
                new Set(issue.affectedItems.map((item) => item.itemId)),
              );
              setMessage(
                `${issue.safeAlternativeLabel}: ${issue.affectedObjectLabel}.`,
              );
            }}
            issueActionContext={issueActionContext}
            acknowledgedActionIds={acknowledgedActionIds}
            onAcknowledgeIssue={(action) => {
              setAcknowledgedActionIds((current) => new Set(current).add(action.id));
            }}
            onExcludeIssueItems={(itemIds) => {
              setSelectedItemIds(new Set(itemIds));
              setFocusDeferReason(true);
            }}
          />
        ) : (
          <DecisionBatchBody
            plan={currentPlan}
            selectedItemIds={selectedItemIds}
            onToggleItem={(itemId) => {
              setSelectedItemIds((current) => {
                const next = new Set(current);
                if (next.has(itemId)) next.delete(itemId);
                else next.add(itemId);
                return next;
              });
            }}
          />
        )
      ) : isCommunication ? (
        <CommunicationBody
          plan={currentPlan}
          subject={subject}
          bodyText={bodyText}
          selectedRecipientIds={selectedRecipientIds}
          onSubjectChange={setSubject}
          onBodyTextChange={setBodyText}
          onToggleRecipient={(recipientId) => {
            setSelectedRecipientIds((current) => {
              const next = new Set(current);
              if (next.has(recipientId)) next.delete(recipientId);
              else next.add(recipientId);
              return next;
            });
          }}
          effectActionPending={
            retryEffectMutation.isPending ||
            reconcileEffectMutation.isPending ||
            correctionMutation.isPending
          }
          onRetryEffect={(effectId) => {
            setMessage(null);
            retryEffectMutation.mutate(effectId);
          }}
          onReconcileEffect={(effectId, outcome, note, providerReference) => {
            setMessage(null);
            reconcileEffectMutation.mutate({
              effectId,
              outcome,
              note,
              providerReference,
            });
          }}
          onCreateCorrection={(effectId, input) => {
            setMessage(null);
            correctionMutation.mutate({ effectId, ...input });
          }}
        />
      ) : isPublication ? (
        <PublicationBody
          plan={currentPlan}
          overrideReasons={overrideReasons}
          onOverrideReason={(findingId, reason) => {
            setOverrideReasons((current) => ({ ...current, [findingId]: reason }));
          }}
        />
      ) : (
        <GuaranteedBody plan={currentPlan} />
      )}

      <AirtableStage
        plan={currentPlan}
        isPending={airtableMutation.isPending}
        onAction={(action) => airtableMutation.mutate({ plan: currentPlan, action })}
      />

      <footer className="course-check-actions">
        {isDecision && decisionComplete ? (
          <>
            {!decisionReview ? (
              <p className="form-message" data-tone="success" role="status">
                {currentPlan.state}
                {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
                {currentPlan.receipt
                  ? ` by ${formatCourseCheckActorLabel(currentPlan.receipt.actor)}`
                  : ""}
              </p>
            ) : null}
            {!decisionReview || decisionReview.canStartDraftPreparation ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={linkCommunicationMutation.isPending}
                onClick={() => {
                  setMessage(null);
                  linkCommunicationMutation.mutate(currentPlan);
                }}
              >
                {decisionReview
                  ? "Prepare communication drafts"
                  : "Open communication Course Check"}
              </button>
            ) : null}
          </>
        ) : null}

        {isDecision &&
        !decisionComplete &&
        (!decisionReview ||
          decisionReview.canDeferItems ||
          decisionReview.primaryActionLabel) ? (
          <>
            {decisionReview ? (
              <p className="course-check-action-scope" aria-live="polite">
                {decisionReview.partialExecution.eligibleCount} eligible ·{" "}
                {decisionReview.partialExecution.skippedCount} will stay unchanged
              </p>
            ) : null}
            {!decisionReview || selectedItemIds.size > 0 ? (
              <div className="course-check-defer">
                <label>
                  Defer selected blocked items
                  <input
                    type="text"
                    value={deferReason}
                    onChange={(event) => setDeferReason(event.target.value)}
                    placeholder="Why defer these items?"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    selectedItemIds.size === 0 ||
                    !deferReason.trim() ||
                    deferMutation.isPending
                  }
                  onClick={() => {
                    setMessage(null);
                    deferMutation.mutate({
                      current: currentPlan,
                      itemIds: [...selectedItemIds],
                      reason: deferReason.trim(),
                    });
                  }}
                >
                  Defer to follow-up
                </button>
              </div>
            ) : null}
            {!decisionReview || decisionReview.primaryActionLabel ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  decisionReview
                    ? !decisionReview.partialExecution.canExecute ||
                      applyMutation.isPending ||
                      deferMutation.isPending
                    : blocked || applyMutation.isPending || !applyStage
                }
                onClick={() => {
                  setMessage(null);
                  const requiredDeferredItemIds =
                    decisionReview?.partialExecution.requiredDeferredItemIds ?? [];
                  if (requiredDeferredItemIds.length > 0) {
                    deferMutation.mutate({
                      current: currentPlan,
                      itemIds: requiredDeferredItemIds,
                      reason:
                        "Leave these decisions unchanged and process the eligible submissions.",
                    });
                    return;
                  }
                  applyMutation.mutate(currentPlan);
                }}
              >
                {decisionReview?.partialExecution.primaryActionLabel ??
                  decisionReview?.primaryActionLabel ??
                  applyStage?.verb ??
                  "Apply decision"}
              </button>
            ) : null}
          </>
        ) : null}

        {isCommunication && !draftsComplete ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={
                reviseMutation.isPending || Boolean(communicationBody?.redacted)
              }
              onClick={() => {
                setMessage(null);
                reviseMutation.mutate(currentPlan);
              }}
            >
              Save content revision
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                blocked ||
                draftsMutation.isPending ||
                !createDraftsStage ||
                Boolean(communicationBody?.redacted)
              }
              onClick={() => {
                setMessage(null);
                draftsMutation.mutate(currentPlan);
              }}
            >
              {createDraftsStage?.verb ?? "Create drafts"}
            </button>
          </>
        ) : null}

        {isCommunication && draftsComplete && !deliveryStarted ? (
          <>
            <p className="form-message" data-tone="success" role="status">
              Drafts frozen. Sending will approve these exact messages and track one
              delivery result per address.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={sendMutation.isPending || Boolean(communicationBody?.redacted)}
              onClick={() => {
                setMessage(null);
                sendMutation.mutate(currentPlan);
              }}
            >
              Send messages
            </button>
          </>
        ) : null}

        {isCommunication && deliveryStarted ? (
          <p
            className="form-message"
            data-tone={
              currentPlan.state === "Complete"
                ? "success"
                : currentPlan.state === "Needs attention"
                  ? "error"
                  : "warning"
            }
            role="status"
          >
            Delivery {communicationBody?.stageVisibility.delivery.replaceAll("_", " ")}
            {communicationBody
              ? ` · ${communicationBody.deliverySummary.succeeded}/${communicationBody.deliverySummary.total} succeeded`
              : ""}
          </p>
        ) : null}

        {isPublication && decisionComplete ? (
          <p className="form-message" data-tone="success" role="status">
            {currentPlan.state}
            {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
            {currentPlan.receipt
              ? ` by ${formatCourseCheckActorLabel(currentPlan.receipt.actor)}`
              : ""}
            . Receipt <span className="mono">{currentPlan.receipt?.id.slice(0, 8)}</span>
            {publicationBody && publicationBody.linkedPlanIds.length > 0
              ? ` · ${publicationBody.linkedPlanIds.length} linked communication plan(s)`
              : ""}
          </p>
        ) : null}

        {isPublication && !decisionComplete ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              blocked ||
              applyMutation.isPending ||
              !(
                currentPlan.body.stages.find((s) => s.status === "ready") ??
                currentPlan.body.stages[0]
              )
            }
            onClick={() => {
              setMessage(null);
              applyMutation.mutate(currentPlan);
            }}
          >
            {(
              currentPlan.body.stages.find((s) => s.status === "ready") ??
              currentPlan.body.stages[0]
            )?.verb ?? "Publish program"}
          </button>
        ) : null}

        {!isDecision && !isCommunication && !isPublication && decisionComplete ? (
          <p className="form-message" data-tone="success" role="status">
            {currentPlan.state}
            {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
            {currentPlan.receipt
              ? ` by ${formatCourseCheckActorLabel(currentPlan.receipt.actor)}`
              : ""}
            . Receipt <span className="mono">{currentPlan.receipt?.id.slice(0, 8)}</span>
          </p>
        ) : null}

        {!isDecision && !isCommunication && !isPublication && !decisionComplete ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked || applyMutation.isPending || !applyStage}
            onClick={() => {
              setMessage(null);
              applyMutation.mutate(currentPlan);
            }}
          >
            {applyStage?.verb ?? "Apply decision"}
          </button>
        ) : null}

        {applyMutation.isError ||
        deferMutation.isError ||
        reviseMutation.isError ||
        draftsMutation.isError ||
        sendMutation.isError ||
        retryEffectMutation.isError ||
        reconcileEffectMutation.isError ||
        correctionMutation.isError ||
        linkCommunicationMutation.isError ||
        airtableMutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {(
              applyMutation.error ??
              deferMutation.error ??
              reviseMutation.error ??
              draftsMutation.error ??
              sendMutation.error ??
              retryEffectMutation.error ??
              reconcileEffectMutation.error ??
              correctionMutation.error ??
              linkCommunicationMutation.error ??
              airtableMutation.error
            ) instanceof ApiError
              ? (
                  (applyMutation.error ??
                    deferMutation.error ??
                    reviseMutation.error ??
                    draftsMutation.error ??
                    sendMutation.error ??
                    retryEffectMutation.error ??
                    reconcileEffectMutation.error ??
                    correctionMutation.error ??
                    linkCommunicationMutation.error ??
                    airtableMutation.error) as ApiError
                ).message
              : "Unable to update Course Check."}
          </p>
        ) : null}
        {message ? (
          <p className="form-message" data-tone="success" role="status">
            {message}
          </p>
        ) : null}
        {currentPlan.body.findings
          .filter((finding) => finding.severity === "blocker")
          .map((finding) => (
            <p
              key={finding.id}
              className="form-message"
              data-tone={findingTone(finding.severity)}
              role="alert"
            >
              {finding.message}
              {finding.recoveryGuidance ? ` ${finding.recoveryGuidance}` : ""}
            </p>
          ))}
      </footer>
    </main>
  );
}
