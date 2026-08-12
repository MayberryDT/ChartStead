import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type {
  CommunicationPlanBody,
  CourseCheckEvidenceSection,
  CourseCheckFinding,
  CourseCheckPlan,
  DecisionPlanBody,
  PublicationPlanBody,
} from "../shared/course-check";
import {
  ApiError,
  applyCourseCheckPlan,
  createCommunicationCourseCheck,
  createCommunicationDrafts,
  deferCourseCheckItems,
  executeCourseCheckAirtable,
  fetchCourseCheckPlan,
  reconcileCourseCheckAirtable,
  reviseCommunicationCourseCheck,
  setCourseCheckAirtableDisposition,
} from "./api";
import { createClientId } from "./id";

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

      {plan.receipt && plan.body.airtable.disposition === "active" ? (
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
            <dd>{plan.createdBy.displayName}</dd>
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
                {item.deferredBy.displayName}
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
                {mutation.actor.displayName}: {mutation.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
    </div>
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
}: {
  plan: CourseCheckPlan;
  subject: string;
  bodyText: string;
  selectedRecipientIds: Set<string>;
  onSubjectChange: (value: string) => void;
  onBodyTextChange: (value: string) => void;
  onToggleRecipient: (recipientId: string) => void;
}) {
  const body = plan.body as CommunicationPlanBody;
  const draftsFrozen = body.stageVisibility.draft === "complete";
  return (
    <div className="course-check-sections">
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
          Creating drafts never sends email. Send messages is a separate later action.
        </p>
      </section>

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
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2>Evidence</h2>
        <div className="course-check-evidence-list">
          {(body.evidenceSections ?? []).map((section) => (
            <EvidenceSectionView key={section.kind} section={section} plan={plan} />
          ))}
        </div>
      </section>

      {plan.mutations && plan.mutations.length > 0 ? (
        <section className="panel">
          <h2>Mutation history</h2>
          <ul className="course-check-mutations">
            {plan.mutations.map((mutation) => (
              <li key={mutation.id}>
                v{mutation.fromVersion}→v{mutation.toVersion} · {mutation.kind} ·{" "}
                {mutation.actor.displayName}: {mutation.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function CourseCheckPage() {
  const { eventId, planId } = useParams({
    from: "/e/$eventId/course-checks/$planId",
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const applyKey = useMemo(
    () => `ui-apply-${planId}-${createClientId()}`,
    [planId],
  );
  const deferKey = useMemo(
    () => `ui-defer-${planId}-${createClientId()}`,
    [planId],
  );
  const draftsKey = useMemo(
    () => `ui-drafts-${planId}-${createClientId()}`,
    [planId],
  );
  const reviseKey = useMemo(
    () => `ui-revise-${planId}-${createClientId()}`,
    [planId],
  );
  const linkCommKey = useMemo(
    () => `ui-link-comm-${planId}-${createClientId()}`,
    [planId],
  );
  const airtableKey = useMemo(
    () => `ui-airtable-${planId}-${createClientId()}`,
    [planId],
  );

  const planQuery = useQuery({
    queryKey: ["course-check", eventId, planId],
    queryFn: () => fetchCourseCheckPlan(eventId, planId),
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
      queryClient.setQueryData(["course-check", eventId, planId], next);
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
      if (
        next.body.actionType === "decision" &&
        (next.state === "Complete" || next.state === "Partially complete")
      ) {
        linkCommunicationMutation.mutate(next);
      }
    },
  });

  const deferMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) =>
      deferCourseCheckItems(eventId, current.id, {
        planVersion: current.version,
        digest: current.digest,
        itemIds: [...selectedItemIds],
        reason: deferReason.trim(),
        idempotencyKey: `${deferKey}-${[...selectedItemIds].join(",")}`,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["course-check", eventId, planId], next);
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
      queryClient.setQueryData(["course-check", eventId, planId], next);
      setMessage("Saved a new immutable communication plan version. Draft approval cleared.");
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
      queryClient.setQueryData(["course-check", eventId, planId], next);
      void queryClient.invalidateQueries({ queryKey: ["course-checks", eventId] });
      void navigate({
        to: "/e/$eventId/submissions",
        params: { eventId },
        search: { q: undefined, status: undefined, track: undefined, sort: undefined },
      });
    },
  });

  const linkCommunicationMutation = useMutation({
    mutationFn: (current: CourseCheckPlan) =>
      createCommunicationCourseCheck(eventId, {
        decisionPlanId: current.id,
        idempotencyKey: linkCommKey,
      }),
    onSuccess: (next) => {
      void navigate({
        to: "/e/$eventId/course-checks/$planId",
        params: { eventId, planId: next.id },
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
      queryClient.setQueryData(["course-check", eventId, planId], next);
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
  const blocked = currentPlan.body.findings.some(
    (finding) => finding.severity === "blocker",
  );
  const decisionComplete =
    currentPlan.state === "Complete" || currentPlan.state === "Partially complete";
  const draftsComplete =
    Boolean(communicationBody) &&
    communicationBody!.stageVisibility.draft === "complete" &&
    communicationBody!.drafts.length > 0;
  const createDraftsStage = currentPlan.body.stages.find(
    (stage) => stage.id === "create-drafts",
  );
  const applyStage = currentPlan.body.stages.find(
    (stage) => stage.id === "apply-decision",
  );

  return (
    <main className="course-check-page">
      <header className="course-check-header">
        <div className="course-check-header-copy">
          <p className="eyebrow">Course Check</p>
          <h1>
            {isCommunication
              ? "Communication workspace"
              : isPublication
                ? "Program publication workspace"
                : isDecision
                  ? "Shared decision workspace"
                  : "Course Check workspace"}
          </h1>
          <p className="lede">
            {isCommunication
              ? "Review recipients and freeze message drafts. Sending remains a separate approved action."
              : isPublication
                ? "Inspect the public program delta before publish, unpublish, or restore. Communication stays separate."
                : "Resumable event resource. Another authorized administrator can inspect and continue this exact versioned batch."}
          </p>
        </div>
        <div className="course-check-header-tools">
          <div className="course-check-header-status">
            <span className="course-check-plan-state" data-state={currentPlan.state}>
              {currentPlan.state}
            </span>
            <span className="mono" title={currentPlan.id}>#{currentPlan.id.slice(0, 8)}</span>
          </div>
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

      {isDecision ? (
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
            <p className="form-message" data-tone="success" role="status">
              {currentPlan.state}
              {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
              . Receipt <span className="mono">{currentPlan.receipt?.id.slice(0, 8)}</span>
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={linkCommunicationMutation.isPending}
              onClick={() => {
                setMessage(null);
                linkCommunicationMutation.mutate(currentPlan);
              }}
            >
              Open communication Course Check
            </button>
          </>
        ) : null}

        {isDecision && !decisionComplete ? (
          <>
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
                  deferMutation.mutate(currentPlan);
                }}
              >
                Defer to follow-up
              </button>
            </div>
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

        {isCommunication && draftsComplete ? (
          <p className="form-message" data-tone="success" role="status">
            Drafts frozen
            {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
            . Send messages remains a separate stage.
          </p>
        ) : null}

        {isPublication && decisionComplete ? (
          <p className="form-message" data-tone="success" role="status">
            {currentPlan.state}
            {currentPlan.receipt?.appliedAt ? ` at ${currentPlan.receipt.appliedAt}` : ""}
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
        linkCommunicationMutation.isError ||
        airtableMutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {(
              applyMutation.error ??
              deferMutation.error ??
              reviseMutation.error ??
              draftsMutation.error ??
              linkCommunicationMutation.error ??
              airtableMutation.error
            ) instanceof ApiError
              ? (
                  (applyMutation.error ??
                    deferMutation.error ??
                    reviseMutation.error ??
                    draftsMutation.error ??
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
