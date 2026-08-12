export type CommunicationVisibleStatusKey =
  | "no_draft"
  | "draft_prepared"
  | "ready_to_send"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";

export interface CommunicationVisibleStatus {
  key: CommunicationVisibleStatusKey;
  label:
    | "No draft"
    | "Draft prepared"
    | "Ready to send"
    | "Sending"
    | "Sent"
    | "Delivered"
    | "Bounced"
    | "Failed";
}

export interface CommunicationProgressStep extends CommunicationVisibleStatus {
  state: "complete" | "current" | "pending" | "attention";
}

export interface CommunicationDraftResult {
  title: "Draft prepared" | "Drafts prepared";
  counts: {
    prepared: number;
    omitted: number;
    failed: number;
    unchanged: number;
  };
  noEmailsSent: true;
  statement: string;
  preparedAt: string | null;
}

export interface CommunicationHandoff {
  kind: "outbox" | "submissions" | "sessions" | "draftless";
  label: string;
  href: string;
  count: number;
}

export interface CommunicationOutboxRecipient {
  name: string;
  address: string;
  inclusion: "include" | "exclude" | "missing" | "duplicate" | "shared";
  inclusionReason: string;
  selected: boolean;
  draftPrepared: boolean;
  priorCommunicationCount: number;
  priorCommunications: Array<{
    status: string;
    subject: string;
    sentAt: string | null;
  }>;
}

export interface CommunicationOutboxGroup {
  label: string;
  outcome: "accepted" | "declined" | null;
  draftCount: number;
  proposalHref: string | null;
  sessionHref: string | null;
  recipients: CommunicationOutboxRecipient[];
}

export interface CommunicationDeliveryResult {
  counts: {
    succeeded: number;
    retrying: number;
    failed: number;
    unknown: number;
    reconciled: number;
    corrected: number;
  };
  statement: string;
  effects: Array<{
    address: string;
    outcome: "sending" | "sent" | "retrying" | "bounced" | "failed" | "unknown";
    label: string;
    attemptCount: number;
    corrected: boolean;
  }>;
}

/**
 * Stable organizer-facing communication result. Durable plan data remains the
 * authority; this adapter intentionally omits plan versions, digests, payload
 * identities, effect ids, and provider references.
 */
export interface CommunicationReviewProjection {
  kind: "communication_review";
  currentStatus: CommunicationVisibleStatus;
  progress: CommunicationProgressStep[];
  draftResult: CommunicationDraftResult | null;
  handoffs: CommunicationHandoff[];
  outbox: {
    exactDraftCount: number;
    sourceLabel: string;
    groups: CommunicationOutboxGroup[];
    draftlessGroups: Array<{
      label: string;
      reason: string;
      proposalHref: string | null;
    }>;
  };
  deliveryResult: CommunicationDeliveryResult | null;
  sendAction: {
    stageId: "send-messages";
    label: string;
    effectSummary: string;
  } | null;
  immutableBoundary: string | null;
}
