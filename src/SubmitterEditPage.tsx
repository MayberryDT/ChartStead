import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import {
  fetchSubmitterEditSession,
  updateSubmitterProposal,
} from "./api";
import { CfpRuntime } from "./CfpRuntime";

export function SubmitterEditPage() {
  const { eventId, token } = useParams({ from: "/e/$eventId/edit/$token" });
  const session = useQuery({
    queryKey: ["submitter-edit", eventId, token],
    queryFn: () => fetchSubmitterEditSession(eventId, token),
    retry: false,
  });

  if (session.isPending) {
    return (
      <main className="cfp-shell" aria-busy="true">
        <p>Checking your edit link…</p>
      </main>
    );
  }

  if (session.isError) {
    return (
      <main className="cfp-shell">
        <section className="error-panel" role="alert">
          <h1>Edit link unavailable</h1>
          <p>{session.error.message}</p>
          <p>Invalid, expired, or revoked links never expose proposal details.</p>
          <Link className="primary-action" to="/">
            Go to ChartStead
          </Link>
        </section>
      </main>
    );
  }

  const data = session.data;

  return (
    <main className="cfp-shell">
      <section className="cfp-panel" aria-labelledby="edit-title">
        <p className="eyebrow">Secure edit link</p>
        <h1 id="edit-title">Edit proposal {data.proposalId}</h1>
        <p>
          Update your submission. This link is signed and can expire or be
          revoked.
        </p>

        <CfpRuntime
          key={`${data.proposalId}:${data.form.id}:${data.form.definitionVersion}`}
          eventId={eventId}
          form={data.form}
          mode="edit"
          initialAnswers={data.answers}
          completeText="Save changes"
          onSubmit={async (answers) => {
            await updateSubmitterProposal(
              eventId,
              data.proposalId,
              token,
              answers,
            );
            return { id: data.proposalId };
          }}
        />
      </section>
    </main>
  );
}
