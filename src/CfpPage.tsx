import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { formatCfpInstant } from "../shared/cfp-timezone";
import { ApiError, fetchCfp, fetchSubmitterDraft, saveProposalDraft, submitProposal } from "./api";
import { authClient } from "./auth-client";
import { CfpRuntime } from "./CfpRuntime";

export function CfpPage() {
  const { eventId } = useParams({ from: "/e/$eventId/cfp" });
  const search = useSearch({ from: "/e/$eventId/cfp" });
  const formId = typeof search.formId === "string" ? search.formId : undefined;
  const searchDraftId = typeof search.draftId === "string" ? search.draftId : undefined;
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(searchDraftId);
  const [activeDraftUpdatedAt, setActiveDraftUpdatedAt] = useState<string | null>(null);
  const cfp = useQuery({
    queryKey: ["cfp", eventId, formId ?? "default"],
    queryFn: () => fetchCfp(eventId, formId),
    enabled: !activeDraftId,
  });
  const draft = useQuery({
    queryKey: ["submitter-draft", eventId, activeDraftId],
    queryFn: () => fetchSubmitterDraft(eventId, activeDraftId!),
    enabled: Boolean(activeDraftId),
  });
  const activeQuery = activeDraftId ? draft : cfp;

  if (activeQuery.isPending) {
    return (
      <main className="cfp-shell" aria-busy="true">
        <p>Loading proposal draft…</p>
      </main>
    );
  }

  if (activeQuery.isError) {
    const error = activeQuery.error;
    const body =
      error instanceof ApiError &&
      error.body &&
      typeof error.body === "object"
        ? (error.body as {
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
      (error instanceof ApiError && error.status === 410);
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
            {activeDraftId
              ? "Draft unavailable"
              : scheduled
                ? "Submissions open soon"
                : closed
                  ? "Submissions are closed"
                  : "Call for proposals unavailable"}
          </h1>
          <p>
            {activeDraftId
              ? error.message
              : scheduled
                ? `${eventName} opens submissions${deadline ? ` on ${deadline}` : " soon"}.`
                : closed
                  ? `${eventName}${deadline ? ` closed ${deadline}` : " is not accepting new proposals right now"}. If you already submitted, use the link in your confirmation email to review or edit your proposal.`
                  : error.message}
          </p>
          {closed || scheduled || activeDraftId ? (
            <Link to="/e/$eventId/my-proposals" params={{ eventId }}>
              My proposals
            </Link>
          ) : (
            <button
              className="primary-action"
              type="button"
              onClick={() => void activeQuery.refetch()}
            >
              Try again
            </button>
          )}
        </section>
      </main>
    );
  }

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const result = await authClient.signIn.magicLink({
      email,
      name: "CFP submitter",
      callbackURL: `${window.location.pathname}${window.location.search}`,
    });
    setSending(false);
    setAccountMessage(
      result.error
        ? result.error.message ?? "Unable to send an account link."
        : "Check your email to sign in or create your submitter account.",
    );
  }

  const data = activeDraftId ? draft.data! : cfp.data!;
  const draftMeta = activeDraftId ? draft.data!.draft : null;
  const lifecycle = data.lifecycle;
  const finalSubmissionOpen = lifecycle.state === "open";

  return (
    <main className="cfp-shell">
      <section className="cfp-panel" aria-labelledby="cfp-title">
        <img src={markOnLightUrl} width="40" height="40" alt="" />
        <p className="eyebrow">Call for proposals</p>
        <h1 id="cfp-title">{data.event.name}</h1>
        <p>
          Submit a talk and save an authenticated draft before every final
          required field is ready. Final submission still uses the published CFP validation.
        </p>
        {data.lifecycle?.deadlineAt ? (
          <p className="cfp-deadline">
            Submissions close {formatCfpInstant(
              data.lifecycle.deadlineAt,
              data.lifecycle.timezone,
            )}.
          </p>
        ) : null}

        <section className="cfp-account" aria-label="Submitter account">
          {session.data?.user ? (
            <p>
              {activeDraftId ? "Resuming" : "Submitting"} as <strong>{session.data.user.email}</strong>.
              Drafts and submitted proposals appear in{" "}
              <Link to="/e/$eventId/my-proposals" params={{ eventId }}>
                My proposals
              </Link>.
            </p>
          ) : (
            <>
              <p>
                Want to save and resume a draft? Sign in or create an optional submitter account. It only gives access to your own proposals.
              </p>
              <button
                className="primary-action"
                type="button"
                onClick={() =>
                  void authClient.signIn.social({
                    provider: "google",
                    callbackURL: `${window.location.pathname}${window.location.search}`,
                  })
                }
              >
                Continue with Google
              </button>
              <div className="sign-in-divider">
                <span>or use a secure email link</span>
              </div>
              <form className="magic-link-form" onSubmit={requestMagicLink}>
                <label htmlFor="cfp-account-email">Email address</label>
                <div>
                  <input
                    id="cfp-account-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(change) => setEmail(change.target.value)}
                  />
                  <button className="secondary-action" type="submit" disabled={sending}>
                    {sending ? "Sending..." : "Email account link"}
                  </button>
                </div>
              </form>
              {accountMessage ? <p className="form-message" role="status">{accountMessage}</p> : null}
            </>
          )}
        </section>

        {draftMeta?.formVersionStale ? (
          <p className="form-message" data-tone="error" role="status">
            This draft uses version {draftMeta.formDefinitionVersion} of {draftMeta.formName}.
            Organizers have published version {draftMeta.latestFormDefinitionVersion}; review before submitting.
          </p>
        ) : null}
        {!finalSubmissionOpen && activeDraftId ? (
          <p className="form-message" data-tone="error" role="status">
            Submissions are closed. Your draft remains readable here, but final submission is disabled.
          </p>
        ) : null}

        <CfpRuntime
          key={`${eventId}:${activeDraftId ?? "new"}:${data.form.id}:${data.form.definitionVersion}`}
          eventId={eventId}
          form={data.form}
          mode={finalSubmissionOpen ? "public" : "draft"}
          themeAccent={data.event.themeAccent}
          initialAnswers={activeDraftId ? draft.data?.answers : undefined}
          draftUpdatedAt={activeDraftUpdatedAt ?? draftMeta?.updatedAt ?? null}
          saveDraftText={activeDraftId ? "Save draft changes" : "Save draft"}
          onSaveDraft={
            session.data?.user
              ? async (answers, form) => {
                  const saved = await saveProposalDraft(
                    eventId,
                    {
                      formId: form.id,
                      formDefinitionVersion: form.definitionVersion,
                      answers,
                      expectedUpdatedAt: activeDraftUpdatedAt ?? draftMeta?.updatedAt ?? undefined,
                    },
                    activeDraftId,
                  );
                  setActiveDraftUpdatedAt(saved.updatedAt);
                  if (!activeDraftId) {
                    setActiveDraftId(saved.id);
                    void navigate({
                      to: "/e/$eventId/cfp",
                      params: { eventId },
                      search: { draftId: saved.id },
                      replace: true,
                    });
                  }
                  return saved;
                }
              : undefined
          }
          onSubmit={
            finalSubmissionOpen
              ? (answers, form) => submitProposal(eventId, answers, form, activeDraftId)
              : undefined
          }
          onSubmitted={(proposalId) => {
            void navigate({
              to: "/e/$eventId/proposals/$proposalId",
              params: { eventId, proposalId },
            });
          }}
        />

        <p className="cfp-foot">
          <Link to="/e/$eventId/my-proposals" params={{ eventId }}>
            My proposals
          </Link>{" "}
          ·{" "}
          Organizers open submissions from the event desk.{" "}
          <Link to="/">Return to ChartStead</Link>
        </p>
      </section>
    </main>
  );
}
