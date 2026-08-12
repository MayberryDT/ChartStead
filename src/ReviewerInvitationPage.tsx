import { Button } from "@base-ui/react/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { acceptReviewerInvitation, fetchReviewerInvitation } from "./api";
import { authClient } from "./auth-client";

export function ReviewerInvitationPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
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

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const callbackURL = window.location.pathname;
    const result = await authClient.signIn.magicLink({ email, callbackURL });
    setSending(false);
    setMessage(
      result.error
        ? result.error.message ?? "Unable to send sign-in link."
        : "Check your email for a secure sign-in link, then return here.",
    );
  }

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
              <form className="magic-link-form" onSubmit={requestMagicLink}>
                <label htmlFor="reviewer-invitation-email">Sign in with the invited email</label>
                <div>
                  <input
                    id="reviewer-invitation-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(change) => setEmail(change.target.value)}
                  />
                  <Button className="secondary-action" type="submit" disabled={sending} focusableWhenDisabled>
                    {sending ? "Sending…" : "Email sign-in link"}
                  </Button>
                </div>
              </form>
            )}
            {message ? <p className="form-message" role="status">{message}</p> : null}
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
