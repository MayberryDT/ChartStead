import type { AppBindings } from "./types";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

export {
  renderSubmissionConfirmationEmail,
  type SubmissionConfirmationEmailInput,
} from "./emails/submission-confirmation";

/** Resend HTTP transport only. Returns null when delivery is not configured. */
export function createResendSender(env: AppBindings): EmailSender | null {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return null;
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        throw new Error(`Email delivery failed with status ${response.status}.`);
      }
    },
  };
}
