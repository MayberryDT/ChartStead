import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { CourseCheckFinding, CourseCheckPlan } from "../shared/course-check";
import { ApiError, applyCourseCheckPlan, fetchCourseCheckPlan } from "./api";
import { createClientId } from "./id";

function findingTone(severity: CourseCheckFinding["severity"]) {
  if (severity === "blocker") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function PlanBody({ plan }: { plan: CourseCheckPlan }) {
  const body = plan.body;
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
            <dt>Action</dt>
            <dd>{plan.actionType === "decision" ? "Final decision" : "Guaranteed speaker"}</dd>
          </div>
          {body.actionType === "decision" ? (
            <>
              <div>
                <dt>Proposal</dt>
                <dd>{body.proposalId}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>{body.outcome}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Source</dt>
              <dd>{body.sourceLabel}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="panel">
        <h2>Findings</h2>
        <ul className="course-check-findings">
          {body.findings.map((finding) => (
            <li key={finding.id} data-severity={finding.severity}>
              <strong>{finding.severity}</strong>
              <p>{finding.message}</p>
              {finding.recoveryGuidance ? (
                <p className="course-check-recovery">{finding.recoveryGuidance}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>People and records</h2>
        <ul className="course-check-deltas">
          {body.deltas.map((delta, index) => (
            <li key={`${delta.entityType}-${index}`}>
              <span className="course-check-delta-type">
                {delta.entityType} · {delta.action}
              </span>
              <p>{delta.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      {body.speakers.length > 0 ? (
        <section className="panel">
          <h2>Speakers</h2>
          <ul>
            {body.speakers.map((speaker) => (
              <li key={speaker.plannedId}>
                <strong>{speaker.name}</strong> &lt;{speaker.email}&gt; · {speaker.role} ·{" "}
                {speaker.match}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.actionType === "decision" && body.session ? (
        <section className="panel">
          <h2>Session</h2>
          <p>
            {body.session.title} ({body.session.format || "talk"}) · unplaced
          </p>
        </section>
      ) : null}

      {body.actionType === "guaranteed_speaker" ? (
        <section className="panel">
          <h2>Session</h2>
          <p>
            {body.session.title} ({body.session.format || "talk"}) · unplaced
          </p>
        </section>
      ) : null}

      {body.tasks.length > 0 ? (
        <section className="panel">
          <h2>Onboarding tasks</h2>
          <ul>
            {body.tasks.map((task) => (
              <li key={task.plannedId}>{task.title}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2>External effects</h2>
        <p>
          No message, calendar, public-program, or integration delivery is created by Apply
          decision.
        </p>
      </section>
    </div>
  );
}

export function CourseCheckPage() {
  const { eventId, planId } = useParams({
    from: "/e/$eventId/course-checks/$planId",
  });
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const applyKey = useMemo(
    () => `ui-apply-${planId}-${createClientId()}`,
    [planId],
  );

  const planQuery = useQuery({
    queryKey: ["course-check", eventId, planId],
    queryFn: () => fetchCourseCheckPlan(eventId, planId),
  });

  const applyMutation = useMutation({
    mutationFn: (plan: CourseCheckPlan) =>
      applyCourseCheckPlan(eventId, plan.id, {
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: applyKey,
      }),
    onSuccess: (plan) => {
      queryClient.setQueryData(["course-check", eventId, planId], plan);
      void queryClient.invalidateQueries({ queryKey: ["proposals", eventId] });
      setMessage("Decision applied. Internal records updated; no speaker email was sent.");
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
  const blocked = plan.body.findings.some((finding) => finding.severity === "blocker");
  const complete = plan.state === "Complete";

  return (
    <main className="app course-check-page">
      <header className="course-check-header">
        <div>
          <p className="eyebrow">Course Check</p>
          <h1>Review final outcome</h1>
          <p className="lede">
            Inspect the exact versioned result before applying internal program records.
          </p>
        </div>
        <Link
          className="btn btn-secondary btn-sm"
          to="/e/$eventId/submissions"
          params={{ eventId }}
          search={{ q: undefined, status: undefined, track: undefined, sort: undefined }}
        >
          Back to submissions
        </Link>
      </header>

      <PlanBody plan={plan} />

      <footer className="course-check-actions">
        {complete ? (
          <p className="form-message" data-tone="success" role="status">
            Applied {plan.receipt?.appliedAt ? `at ${plan.receipt.appliedAt}` : ""}. Receipt{" "}
            <span className="mono">{plan.receipt?.id.slice(0, 8)}</span>
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked || applyMutation.isPending || !stage}
            onClick={() => {
              setMessage(null);
              applyMutation.mutate(plan);
            }}
          >
            {stage?.verb ?? "Apply decision"}
          </button>
        )}
        {applyMutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {applyMutation.error instanceof ApiError
              ? applyMutation.error.message
              : "Unable to apply Course Check."}
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
