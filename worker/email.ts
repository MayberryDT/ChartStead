import type { AppBindings } from "./types";

export interface OutboundEmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: OutboundEmailAttachment[];
}

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

export interface CommunicationOutboundEmail extends OutboundEmail {
  /** Stable effect identity forwarded to the provider's idempotency boundary. */
  idempotencyKey: string;
}

export type CommunicationSendResult =
  | { outcome: "sent"; providerReference: string }
  | { outcome: "transient_failure"; error: string }
  | { outcome: "permanent_failure"; error: string }
  | { outcome: "unknown"; error: string; providerReference?: string | null };

export interface CommunicationEmailSender {
  send(message: CommunicationOutboundEmail): Promise<CommunicationSendResult>;
}

export {
  renderMagicLinkEmail,
  type MagicLinkEmailInput,
} from "./emails/magic-link";
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

function providerError(status: number, fallback: string): CommunicationSendResult {
  if (status === 408 || status === 429 || status >= 500) {
    return { outcome: "transient_failure", error: fallback };
  }
  return { outcome: "permanent_failure", error: fallback };
}

/** Resend transport for Course Check effects with provider idempotency and references. */
export function createResendCommunicationSender(
  env: AppBindings,
): CommunicationEmailSender | null {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return null;
  return {
    async send(message) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: env.AUTH_EMAIL_FROM,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.attachments && message.attachments.length > 0
              ? {
                  attachments: message.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content: btoa(attachment.content),
                    content_type: attachment.contentType,
                  })),
                }
              : {}),
          }),
        });
      } catch {
        return {
          outcome: "unknown",
          error:
            "The provider connection ended without a delivery outcome. Reconcile before retrying.",
        };
      }

      if (!response.ok) {
        return providerError(
          response.status,
          `Email provider rejected delivery with status ${response.status}.`,
        );
      }
      const payload = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      if (!payload || typeof payload.id !== "string" || !payload.id) {
        return {
          outcome: "unknown",
          error:
            "The provider accepted the request without a usable delivery reference. Reconcile before retrying.",
        };
      }
      return { outcome: "sent", providerReference: payload.id };
    },
  };
}
