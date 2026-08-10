import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { fetchPublicProposal } from "./api";

export function ProposalDetailPage() {
  const { eventId, proposalId } = useParams({
    from: "/e/$eventId/proposals/$proposalId",
  });
  const query = useQuery({
    queryKey: ["proposal", eventId, proposalId],
    queryFn: () => fetchPublicProposal(eventId, proposalId),
  });

  if (query.isPending) {
    return (
      <main className="cfp-shell" aria-busy="true">
        <p>Loading proposal…</p>
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="cfp-shell">
        <section className="error-panel" role="alert">
          <h1>Proposal not found</h1>
          <p>{query.error.message}</p>
          <Link className="primary-action" to="/e/$eventId/cfp" params={{ eventId }}>
            Back to CFP
          </Link>
        </section>
      </main>
    );
  }

  const proposal = query.data;

  return (
    <main className="cfp-shell">
      <section className="cfp-panel confirmation-panel" aria-labelledby="confirm-title">
        <img src={markOnLightUrl} width="40" height="40" alt="" />
        <p className="eyebrow">Submission received</p>
        <h1 id="confirm-title">Thanks — your proposal is in.</h1>
        <p>
          Keep this permanent page for your records. Organizers can find the
          proposal by title, speaker, or stable ID.
        </p>
        <dl className="confirm-meta">
          <div>
            <dt>Proposal ID</dt>
            <dd>
              <code>{proposal.id}</code>
            </dd>
          </div>
          <div>
            <dt>Title</dt>
            <dd>{proposal.title}</dd>
          </div>
          <div>
            <dt>Speaker</dt>
            <dd>{proposal.speakerName}</dd>
          </div>
          <div>
            <dt>Track</dt>
            <dd>{proposal.trackName}</dd>
          </div>
        </dl>
        <div className="confirm-actions">
          <Link className="primary-action" to="/e/$eventId/cfp" params={{ eventId }}>
            Submit another proposal
          </Link>
          <Link className="text-link" to="/">
            Organizer desk
          </Link>
        </div>
      </section>
    </main>
  );
}
