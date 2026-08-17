import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import type { SubmitterProposalDraft, SubmitterProposalStatus } from "../shared/events";
import {
  ApiError,
  claimSubmitterProposal,
  fetchSubmitterDashboard,
} from "./api";
import { authClient } from "./auth-client";

const statusLabel: Record<SubmitterProposalStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Not selected",
};

function draftMeta(draft: SubmitterProposalDraft): string {
  const updated = new Date(draft.updatedAt).toLocaleDateString();
  const lifecycle =
    draft.lifecycle.state === "open"
      ? "ready to submit"
      : draft.lifecycle.state === "scheduled"
        ? "opens later"
        : "submissions closed";
  return `${draft.formName} · saved ${updated} · ${lifecycle}`;
}

export function SubmitterDashboardPage() {
  const { eventId } = useParams({ from: "/e/$eventId/my-proposals" });
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const dashboard = useQuery({
    queryKey: ["submitter-dashboard", eventId],
    queryFn: () => fetchSubmitterDashboard(eventId),
    enabled: Boolean(session.data?.user),
  });
  const claim = useMutation({
    mutationFn: (proposalId: string) => claimSubmitterProposal(eventId, proposalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["submitter-dashboard", eventId] }),
  });

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const result = await authClient.signIn.magicLink({
      email,
      name: "CFP submitter",
      callbackURL: `${window.location.pathname}${window.location.search}`,
    });
    setSending(false);
    setMessage(
      result.error
        ? result.error.message ?? "Unable to send an account link."
        : "Check your email to sign in or create your submitter account.",
    );
  }

  return (
    <main className="cfp-shell">
      <section className="cfp-panel submitter-dashboard" aria-labelledby="submitter-dashboard-title">
        <img src={markOnLightUrl} width="40" height="40" alt="" />
        <p className="eyebrow">Submitter dashboard</p>
        <h1 id="submitter-dashboard-title">My proposals</h1>
        {!session.data?.user ? (
          <>
            <p>Sign in with the email used for your proposal to see and claim submissions for this event.</p>
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
              <label htmlFor="submitter-dashboard-email">Email address</label>
              <div>
                <input
                  id="submitter-dashboard-email"
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
            {message ? <p className="form-message" role="status">{message}</p> : null}
          </>
        ) : dashboard.isPending ? (
          <p aria-busy="true">Loading your proposals...</p>
        ) : dashboard.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {dashboard.error instanceof ApiError
              ? dashboard.error.message
              : "Unable to load your proposals."}
          </p>
        ) : (
          <>
            <p>Signed in as {dashboard.data.user.email}.</p>
            {(dashboard.data.drafts ?? []).length === 0 &&
            dashboard.data.proposals.length === 0 ? (
              <p>You have no proposal drafts or submissions for this event yet.</p>
            ) : null}
            {(dashboard.data.drafts ?? []).length > 0 ? (
              <>
                <h2>Drafts</h2>
                <ul className="submitter-proposal-list">
                  {(dashboard.data.drafts ?? []).map((draft) => (
                    <li key={draft.id}>
                      <div>
                        <strong>{draft.title}</strong>
                        <span>{draftMeta(draft)}</span>
                      </div>
                      <span className="submitter-status status-draft">
                        {draft.formVersionStale ? "Draft - review form updates" : "Draft"}
                      </span>
                      <Link
                        className="secondary-action"
                        to="/e/$eventId/cfp"
                        params={{ eventId }}
                        search={{ draftId: draft.id }}
                      >
                        Resume draft
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {dashboard.data.proposals.length > 0 ? (
              <>
                <h2>Submitted proposals</h2>
                <ul className="submitter-proposal-list">
                  {dashboard.data.proposals.map((proposal) => (
                    <li key={proposal.id}>
                      <div>
                        <strong>{proposal.title}</strong>
                        <span>{proposal.trackName} · submitted {new Date(proposal.submittedAt).toLocaleDateString()}</span>
                      </div>
                      <span className={`submitter-status status-${proposal.status}`}>
                        {statusLabel[proposal.status]}
                      </span>
                      {proposal.claimable ? (
                        <button
                          className="secondary-action"
                          type="button"
                          disabled={claim.isPending}
                          onClick={() => claim.mutate(proposal.id)}
                        >
                          {claim.isPending ? "Claiming..." : "Claim proposal"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {claim.isError ? (
              <p className="form-message" data-tone="error" role="alert">
                {claim.error instanceof Error ? claim.error.message : "Unable to claim proposal."}
              </p>
            ) : null}
          </>
        )}
        <p className="cfp-foot">
          <Link to="/e/$eventId/cfp" params={{ eventId }} search={{}}>
            Submit another proposal
          </Link>
        </p>
      </section>
    </main>
  );
}
