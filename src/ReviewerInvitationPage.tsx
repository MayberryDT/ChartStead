import { Button } from "@base-ui/react/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { acceptReviewerInvitation, fetchReviewerInvitation } from "./api";
import { authClient } from "./auth-client";
import { AuthMethodButtons } from "./SignIn";

export function ReviewerInvitationPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const session = authClient.useSession();
  const query = useQuery({
    queryKey: ["reviewer-invitation", token],
    queryFn: () => fetchReviewerInvitation(token),
    retry: false,
  });
  const acceptMutation = useMutation({
    mutationFn: () => acceptReviewerInvitation(token),
    onSuccess: (result) => {
      void navigate({ to: result.queuePath });
    },
  });

  return (
    <main className="sign-in-shell">
      <section className="sign-in-panel reviewer-invitation-panel" aria-labelledby="reviewer-invitation-title">
        <img src={markOnLightUrl} width="48" height="48" alt="" />
        <p className="eyebrow">Reviewer invitation</p>
        {query.isPending ? <h1 id="reviewer-invitation-title">Opening invitation…</h1> : null}
        {query.isError ? (
          <>
            <h1 id="reviewer-invitation-title">This invitation is unavailable.</h1>
            <p role="alert">It may have expired, been revoked, or already been used.</p>
          </>
        ) : null}
        {query.data ? (
          <>
            <h1 id="reviewer-invitation-title">Review proposals for {query.data.eventName}</h1>
            <p>
              This invitation is for <strong>{query.data.emailHint}</strong> and grants reviewer access only to:
            </p>
            <ul className="reviewer-invitation-tracks">
              {query.data.tracks.map((track) => <li key={track.id}>{track.name}</li>)}
            </ul>
            {query.data.status !== "pending" ? (
              <p role="status">This invitation is {query.data.status}.</p>
            ) : session.data?.user ? (
              <Button
                className="primary-action"
                disabled={acceptMutation.isPending}
                focusableWhenDisabled
                onClick={() => acceptMutation.mutate()}
              >
                {acceptMutation.isPending ? "Joining queue…" : "Accept and open review queue"}
              </Button>
            ) : (
              <AuthMethodButtons
                callbackURL={window.location.pathname}
                emailInputId="reviewer-invitation-email"
                emailLabel="Sign in with the invited email"
                emailButtonLabel="Email sign-in link"
              />
            )}
            {acceptMutation.isError ? (
              <p className="form-message" data-tone="error" role="alert">
                {acceptMutation.error.message}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
