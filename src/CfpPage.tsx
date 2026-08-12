import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { formatCfpInstant } from "../shared/cfp-timezone";
import { ApiError, fetchCfp, submitProposal } from "./api";
import { CfpRuntime } from "./CfpRuntime";

export function CfpPage() {
  const { eventId } = useParams({ from: "/e/$eventId/cfp" });
  const search = useSearch({ from: "/e/$eventId/cfp" });
  const formId = typeof search.formId === "string" ? search.formId : undefined;
  const navigate = useNavigate();
  const cfp = useQuery({
    queryKey: ["cfp", eventId, formId ?? "default"],
    queryFn: () => fetchCfp(eventId, formId),
  });

  if (cfp.isPending) {
    return (
      <main className="cfp-shell" aria-busy="true">
        <p>Loading call for proposals…</p>
      </main>
    );
  }

  if (cfp.isError) {
    const body =
      cfp.error instanceof ApiError &&
      cfp.error.body &&
      typeof cfp.error.body === "object"
        ? (cfp.error.body as {
            status?: string;
            event?: { name?: string; timezone?: string };
            lifecycle?: {
              state?: string;
              deadlineAt?: string | null;
              timezone?: string;
            };
          })
        : null;
    const closed =
      body?.status === "closed" ||
      (cfp.error instanceof ApiError && cfp.error.status === 410);
    const eventName = body?.event?.name ?? "This event";
    const scheduled = body?.status === "scheduled";
    const timezone = body?.lifecycle?.timezone ?? body?.event?.timezone ?? "UTC";
    const deadline = body?.lifecycle?.deadlineAt
      ? formatCfpInstant(body.lifecycle.deadlineAt, timezone)
      : null;
    return (
      <main className="cfp-shell">
        <section className="error-panel" role="alert">
          <h1>
            {scheduled
              ? "Submissions open soon"
              : closed
              ? "Submissions are closed"
              : "Call for proposals unavailable"}
          </h1>
          <p>
            {scheduled
              ? `${eventName} opens submissions${deadline ? ` on ${deadline}` : " soon"}.`
              : closed
              ? `${eventName}${deadline ? ` closed ${deadline}` : " is not accepting new proposals right now"}. If you already submitted, use the link in your confirmation email to review or edit your proposal.`
              : cfp.error.message}
          </p>
          {closed || scheduled ? (
            <Link to="/">Return to ChartStead</Link>
          ) : (
            <button
              className="primary-action"
              type="button"
              onClick={() => void cfp.refetch()}
            >
              Try again
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="cfp-shell">
      <section className="cfp-panel" aria-labelledby="cfp-title">
        <img src={markOnLightUrl} width="40" height="40" alt="" />
        <p className="eyebrow">Call for proposals</p>
        <h1 id="cfp-title">{cfp.data.event.name}</h1>
        <p>
          Submit a talk without creating an account. You will receive a branded
          confirmation email with a secure link to edit your proposal.
        </p>
        {cfp.data.lifecycle?.deadlineAt ? (
          <p className="cfp-deadline">
            Submissions close {formatCfpInstant(
              cfp.data.lifecycle.deadlineAt,
              cfp.data.lifecycle.timezone,
            )}.
          </p>
        ) : null}

        <CfpRuntime
          key={`${eventId}:${cfp.data.form.id}:${cfp.data.form.definitionVersion}`}
          eventId={eventId}
          form={cfp.data.form}
          mode="public"
          themeAccent={cfp.data.event.themeAccent}
          onSubmit={(answers, form) => submitProposal(eventId, answers, form)}
          onSubmitted={(proposalId) => {
            void navigate({
              to: "/e/$eventId/proposals/$proposalId",
              params: { eventId, proposalId },
            });
          }}
        />

        <p className="cfp-foot">
          Organizers open submissions from the event desk.{" "}
          <Link to="/">Return to ChartStead</Link>
        </p>
      </section>
    </main>
  );
}
