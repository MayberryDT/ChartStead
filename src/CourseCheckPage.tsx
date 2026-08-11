import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type {
  CourseCheckEvidenceSection,
  CourseCheckFinding,
  CourseCheckPlan,
  DecisionPlanBody,
  PublicationPlanBody,
} from "../shared/course-check";
import {
  ApiError,
  applyCourseCheckPlan,
  deferCourseCheckItems,
  fetchCourseCheckPlan,
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
  const [open, setOpen] = useState(section.defaultExpanded);
  const findings = plan.body.findings.filter((finding) =>
    section.findingIds.includes(finding.id),
  );
  const deltas = section.deltaIndexes
    .map((index) => plan.body.deltas[index])
    .filter(Boolean);

  return (
    <details
      className="course-check-evidence"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      data-kind={section.kind}
      data-expanded={section.defaultExpanded ? "risk" : "clean"}
    >
      <summary>
        <strong>{section.title}</strong>
        <span className="course-check-evidence-summary">{section.summary}</span>
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
          Irreversible effects and people first. Clean sections stay collapsed; blockers
          and warnings expand automatically.
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

export function CourseCheckPage() {
  const { eventId, planId } = useParams({
    from: "/e/$eventId/course-checks/$planId",
  });
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [deferReason, setDeferReason] = useState("");
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const applyKey = useMemo(
    () => `ui-apply-${planId}-${createClientId()}`,
    [planId],
  );
  const deferKey = useMemo(
    () => `ui-defer-${planId}-${createClientId()}`,
    [planId],
  );

  const planQuery = useQuery({
    queryKey: ["course-check", eventId, planId],
    queryFn: () => fetchCourseCheckPlan(eventId, planId),
  });

  const applyMutation = useMutation({
    mutationFn: (plan: CourseCheckPlan) => {
      const stageId = plan.body.stages[0]?.id ?? "apply-decision";
      const materialIds = plan.body.findings
        .filter((finding) => finding.severity === "warning" && finding.materialExternal)
        .map((finding) => finding.id);
      const softWarningOverrides =
        plan.body.actionType === "publication"
          ? materialIds.map((findingId) => ({
              findingId,
              reason: overrideReasons[findingId] ?? "",
            }))
          : undefined;
      return applyCourseCheckPlan(eventId, plan.id, {
        planVersion: plan.version,
        digest: plan.digest,
        stageId,
        idempotencyKey: applyKey,
        softWarningOverrides,
      });
    },
    onSuccess: (plan) => {
      queryClient.setQueryData(["course-check", eventId, planId], plan);
      void queryClient.invalidateQueries({ queryKey: ["proposals", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["agenda", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["public-program", eventId] });
      setMessage(
        plan.state === "Partially complete"
          ? "Remaining batch applied. Deferred items stay in the follow-up queue."
          : plan.body.actionType === "publication"
            ? "Program published as a new immutable public revision. No speaker messages were sent."
            : "Decision applied. Internal records updated; no speaker email was sent.",
      );
    },
  });

  const deferMutation = useMutation({
    mutationFn: (plan: CourseCheckPlan) =>
      deferCourseCheckItems(eventId, plan.id, {
        planVersion: plan.version,
        digest: plan.digest,
        itemIds: [...selectedItemIds],
        reason: deferReason.trim(),
        idempotencyKey: `${deferKey}-${[...selectedItemIds].join(",")}`,
      }),
    onSuccess: (plan) => {
      queryClient.setQueryData(["course-check", eventId, planId], plan);
      setSelectedItemIds(new Set());
      setDeferReason("");
      setMessage("Deferred items moved to the follow-up queue as a new plan version.");
    },
  });

  if (planQuery.isLoading) {
    return (
      <main className="app course-check-page">
        <p>Loading Course Check…</p>
      </main>
    );
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <main className="app course-check-page">
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

  const plan = planQuery.data;
  const stage = plan.body.stages[0];
  const blocked =
    plan.body.findings.some((finding) => finding.severity === "blocker") ||
    plan.state === "Out of date";
  const complete = plan.state === "Complete" || plan.state === "Partially complete";
  const isDecision = plan.body.actionType === "decision";
  const isPublication = plan.body.actionType === "publication";
  const materialReady =
    !isPublication ||
    plan.body.findings
      .filter((finding) => finding.severity === "warning" && finding.materialExternal)
      .every((finding) => (overrideReasons[finding.id] ?? "").trim().length > 0);
  const backTo =
    isPublication
      ? ({ to: "/e/$eventId/agenda" as const, label: "Back to agenda" })
      : ({
          to: "/e/$eventId/submissions" as const,
          label: "Back to submissions",
        });

  return (
    <main className="app course-check-page">
      <header className="course-check-header">
        <div>
          <p className="eyebrow">Course Check</p>
          <h1>
            {isPublication
              ? "Program publication workspace"
              : "Shared decision workspace"}
          </h1>
          <p className="lede">
            Resumable event resource. Another authorized administrator can inspect and
            continue this exact versioned plan.
          </p>
        </div>
        {isPublication ? (
          <Link className="btn btn-secondary btn-sm" to="/e/$eventId/agenda" params={{ eventId }}>
            {backTo.label}
          </Link>
        ) : (
          <Link
            className="btn btn-secondary btn-sm"
            to="/e/$eventId/submissions"
            params={{ eventId }}
            search={{ q: undefined, status: undefined, track: undefined, sort: undefined }}
          >
            {backTo.label}
          </Link>
        )}
      </header>

      {isDecision ? (
        <DecisionBatchBody
          plan={plan}
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
      ) : isPublication ? (
        <PublicationBody
          plan={plan}
          overrideReasons={overrideReasons}
          onOverrideReason={(findingId, reason) =>
            setOverrideReasons((current) => ({ ...current, [findingId]: reason }))
          }
        />
      ) : (
        <GuaranteedBody plan={plan} />
      )}

      <footer className="course-check-actions">
        {complete ? (
          <p className="form-message" data-tone="success" role="status">
            {plan.state}
            {plan.receipt?.appliedAt ? ` at ${plan.receipt.appliedAt}` : ""}. Receipt{" "}
            <span className="mono">{plan.receipt?.id.slice(0, 8)}</span>
            {isPublication && plan.body.actionType === "publication" && plan.body.linkedPlanIds.length > 0
              ? ` · ${plan.body.linkedPlanIds.length} linked communication plan(s)`
              : ""}
          </p>
        ) : (
          <>
            {isDecision ? (
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
                    deferMutation.mutate(plan);
                  }}
                >
                  Defer to follow-up
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                blocked ||
                applyMutation.isPending ||
                !stage ||
                !materialReady
              }
              onClick={() => {
                setMessage(null);
                applyMutation.mutate(plan);
              }}
            >
              {stage?.verb ?? "Apply decision"}
            </button>
          </>
        )}
        {applyMutation.isError || deferMutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {(applyMutation.error ?? deferMutation.error) instanceof ApiError
              ? ((applyMutation.error ?? deferMutation.error) as ApiError).message
              : "Unable to update Course Check."}
          </p>
        ) : null}
        {message ? (
          <p className="form-message" data-tone="success" role="status">
            {message}
          </p>
        ) : null}
        {plan.body.findings
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
