import { Button } from "@base-ui/react/button";
import { FormEvent, useEffect, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { authClient } from "./auth-client";

export type AuthStatus = {
  configured: boolean;
  google: boolean;
  magicLink: boolean;
};

export async function signOutAndReturn(): Promise<void> {
  await authClient.signOut();
  window.location.assign("/");
}

export function humanizeAuthError(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "access_denied") {
    return "Google sign-in was cancelled. You can try again or use an email link.";
  }
  if (value.includes("session") || value.includes("expired")) {
    return "Your session expired. Sign in again to open your event desk.";
  }
  if (value.includes("not configured") || value.includes("magic-link email")) {
    return "Email sign-in is not configured for this environment.";
  }
  if (value.includes("google")) {
    return "Google sign-in failed. Try again or use an email link.";
  }
  return raw.trim() || "Sign-in failed. Try again.";
}

export function useAuthStatus(): AuthStatus | null {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    void fetch("/api/auth-status")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AuthStatus;
      })
      .then((next) => {
        if (next) setStatus(next);
      })
      .catch(() => undefined);
  }, []);

  return status;
}

export function AuthMethodButtons({
  callbackURL,
  name,
  emailInputId,
  emailLabel,
  emailButtonLabel = "Email sign-in link",
  googleLabel = "Continue with Google",
  showGoogle = true,
}: {
  callbackURL: string;
  name?: string;
  emailInputId: string;
  emailLabel: string;
  emailButtonLabel?: string;
  googleLabel?: string;
  showGoogle?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [sending, setSending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const status = useAuthStatus();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("error_description") ?? params.get("error");
    if (raw) {
      setTone("error");
      setMessage(humanizeAuthError(raw));
    }
  }, []);

  const authReady = status?.configured !== false;
  const googleReady = !status || status.google;
  const magicReady = !status || status.magicLink;

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status && !status.magicLink) {
      setTone("error");
      setMessage("Email sign-in is not configured for this environment.");
      return;
    }
    setSending(true);
    const result = await authClient.signIn.magicLink({
      email,
      name,
      callbackURL,
    });
    setSending(false);
    if (result.error) {
      setTone("error");
      setMessage(humanizeAuthError(result.error.message ?? "Unable to send sign-in link."));
      return;
    }
    setTone("success");
    setMessage("Check your email for a secure sign-in link.");
  }

  async function continueWithGoogle() {
    if (status && !status.google) {
      setTone("error");
      setMessage("Google sign-in is not configured for this environment.");
      return;
    }
    setGoogleBusy(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
    });
    setGoogleBusy(false);
    if (result.error) {
      setTone("error");
      setMessage(
        humanizeAuthError(result.error.message ?? "Google sign-in failed. Try again or use an email link."),
      );
    }
  }

  return (
    <>
      {status && !status.configured ? (
        <p className="form-message" data-tone="error" role="status">
          Authentication is not configured for this environment.
        </p>
      ) : null}
      {showGoogle ? (
        <>
          <Button
            className="primary-action"
            disabled={!authReady || !googleReady || googleBusy}
            focusableWhenDisabled
            onClick={() => void continueWithGoogle()}
          >
            {googleBusy ? "Continuing…" : googleLabel}
          </Button>
          {!googleReady ? (
            <p className="form-message" data-tone="error" role="status">
              Google sign-in is not configured for this environment.
            </p>
          ) : null}
          <div className="sign-in-divider">
            <span>or use a secure email link</span>
          </div>
        </>
      ) : null}
      <form className="magic-link-form" onSubmit={requestMagicLink}>
        <label htmlFor={emailInputId}>{emailLabel}</label>
        <div>
          <input
            id={emailInputId}
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(change) => setEmail(change.target.value)}
          />
          <Button
            className="secondary-action"
            type="submit"
            disabled={sending || !authReady || !magicReady}
            focusableWhenDisabled
          >
            {sending ? "Sending…" : emailButtonLabel}
          </Button>
        </div>
      </form>
      {!magicReady ? (
        <p className="form-message" data-tone="error" role="status">
          Email sign-in is not configured for this environment.
        </p>
      ) : null}
      {message ? (
        <p className="form-message" data-tone={tone} role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}

export function NoAccessPanel({ displayName }: { displayName: string }) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await signOutAndReturn();
  }

  return (
    <main className="sign-in-shell">
      <section className="error-panel" aria-labelledby="no-access-title">
        <p className="eyebrow">Signed in</p>
        <h1 id="no-access-title">This account has no event access.</h1>
        <p>
          {displayName} is signed in, but no organizer memberships are assigned
          yet. This is not a guest workspace. Ask an event administrator to grant
          access, or sign out and use a different account.
        </p>
        <Button
          className="primary-action"
          disabled={signingOut}
          focusableWhenDisabled
          onClick={() => void signOut()}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </section>
    </main>
  );
}

export function SignIn() {
  return (
    <main className="sign-in-shell">
      <section className="sign-in-panel" aria-labelledby="sign-in-title">
        <img src={markOnLightUrl} width="48" height="48" alt="" />
        <p className="eyebrow">ChartStead</p>
        <h1 id="sign-in-title">Conference programming and speaker management.</h1>
        <p>Sign in to open your event desk. Production access is granted per event.</p>
        <AuthMethodButtons
          callbackURL="/"
          emailInputId="email"
          emailLabel="Work email"
          emailButtonLabel="Email sign-in link"
        />
      </section>
    </main>
  );
}
