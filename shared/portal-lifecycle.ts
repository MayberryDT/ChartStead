import type { CommunicationEffectStatus } from "./course-check";

/** Speaker/organizer-facing delivery vocabulary (independent of proposal status). */
export type PortalFacingDeliveryStatus =
  | "draft"
  | "queued"
  | "sent"
  | "delivered"
  | "failed";

export type PortalMessageKind = "message" | "calendar_invite";

/**
 * Map ledger effect status to speaker-facing delivery status.
 * Drafts without an effect use status "draft" at the call site.
 */
export function toPortalFacingDeliveryStatus(
  effectStatus: CommunicationEffectStatus | null | undefined,
): PortalFacingDeliveryStatus {
  if (!effectStatus) return "draft";
  switch (effectStatus) {
    case "queued":
    case "retry_scheduled":
      return "queued";
    case "sending":
      return "sent";
    case "succeeded":
      return "delivered";
    case "permanent_failure":
    case "exhausted":
    case "unknown":
      return "failed";
    default:
      return "failed";
  }
}

export function auditEventLabel(type: string, toStatus: string): string {
  switch (type) {
    case "course_check.decision.applied":
      return `applied final outcome ${toStatus}`;
    case "course_check.communication.drafts_created":
      return `froze communication drafts (${toStatus})`;
    case "course_check.communication.send_started":
      return `started message delivery (${toStatus})`;
    case "course_check.communication.effect_retry":
      return `retried a failed delivery (now ${toStatus})`;
    case "course_check.communication.effect_reconciled":
      return `reconciled delivery (${toStatus})`;
    case "course_check.communication.correction_created":
      return `opened a corrective communication (${toStatus})`;
    case "proposal.review.recused":
      return "recorded a conflict / recusal";
    case "proposal.review.changed":
      return `set internal review ${toStatus}`;
    default:
      return toStatus;
  }
}
