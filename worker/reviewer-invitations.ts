import type {
  OutboxMessage,
  ReviewerInvitation,
  ReviewerInvitationDeliveryState,
  ReviewerInvitationStatus,
} from "../shared/events";

export const REVIEWER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type ReviewerInvitationRow = {
  id: string;
  event_id: string;
  email: string;
  token_hash: string;
  track_ids_json: string;
  status: "pending" | "accepted" | "revoked";
  outbox_id: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface StoredReviewerInvitation {
  id: string;
  eventId: string;
  email: string;
  tokenHash: string;
  trackIds: string[];
  status: "pending" | "accepted" | "revoked";
  outboxId: string;
  expiresAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: ReviewerInvitationRow): StoredReviewerInvitation {
  return {
    id: row.id,
    eventId: row.event_id,
    email: row.email,
    tokenHash: row.token_hash,
    trackIds: JSON.parse(row.track_ids_json) as string[],
    status: row.status,
    outboxId: row.outbox_id,
    expiresAt: row.expires_at,
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createInvitationToken(): Promise<{
  token: string;
  tokenHash: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return { token, tokenHash: await hashInvitationToken(token) };
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function insertReviewerInvitation(
  database: D1Database,
  invitation: StoredReviewerInvitation,
): Promise<void> {
  await database.prepare(
    `INSERT INTO reviewer_invitations
      (id, event_id, email, token_hash, track_ids_json, status, outbox_id,
       expires_at, accepted_by_user_id, accepted_at, revoked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      invitation.id,
      invitation.eventId,
      invitation.email,
      invitation.tokenHash,
      JSON.stringify(invitation.trackIds),
      invitation.status,
      invitation.outboxId,
      invitation.expiresAt,
      invitation.acceptedByUserId,
      invitation.acceptedAt,
      invitation.revokedAt,
      invitation.createdAt,
      invitation.updatedAt,
    )
    .run();
}

export async function listReviewerInvitations(
  database: D1Database,
  eventId: string,
): Promise<StoredReviewerInvitation[]> {
  const rows = await database.prepare(
    `SELECT * FROM reviewer_invitations
     WHERE event_id = ?
     ORDER BY created_at DESC, id DESC`,
  )
    .bind(eventId)
    .all<ReviewerInvitationRow>();
  return rows.results.map(mapRow);
}

export async function getReviewerInvitationByToken(
  database: D1Database,
  token: string,
): Promise<StoredReviewerInvitation | null> {
  const tokenHash = await hashInvitationToken(token);
  const row = await database.prepare(
    `SELECT * FROM reviewer_invitations WHERE token_hash = ? LIMIT 1`,
  )
    .bind(tokenHash)
    .first<ReviewerInvitationRow>();
  return row ? mapRow(row) : null;
}

export async function getReviewerInvitationById(
  database: D1Database,
  eventId: string,
  invitationId: string,
): Promise<StoredReviewerInvitation | null> {
  const row = await database.prepare(
    `SELECT * FROM reviewer_invitations
     WHERE event_id = ? AND id = ? LIMIT 1`,
  )
    .bind(eventId, invitationId)
    .first<ReviewerInvitationRow>();
  return row ? mapRow(row) : null;
}

export function effectiveInvitationStatus(
  invitation: StoredReviewerInvitation,
  now = new Date(),
): ReviewerInvitationStatus {
  if (invitation.status !== "pending") return invitation.status;
  return invitation.expiresAt <= now.toISOString() ? "expired" : "pending";
}

export function invitationDeliveryState(
  outbox: OutboxMessage | null,
): ReviewerInvitationDeliveryState {
  if (!outbox || outbox.status === "queued" || outbox.status === "sending") {
    return "queued";
  }
  if (outbox.status === "sent") return "delivered";
  return outbox.nextAttemptAt ? "retryable" : "failed";
}

export function projectReviewerInvitation(
  invitation: StoredReviewerInvitation,
  outbox: OutboxMessage | null,
  now = new Date(),
): ReviewerInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    trackIds: invitation.trackIds,
    status: effectiveInvitationStatus(invitation, now),
    deliveryState: invitationDeliveryState(outbox),
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
  };
}

export async function revokeReviewerInvitation(
  database: D1Database,
  eventId: string,
  invitationId: string,
  nowIso: string,
): Promise<boolean> {
  const result = await database.prepare(
    `UPDATE reviewer_invitations
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE event_id = ? AND id = ? AND status = 'pending'`,
  )
    .bind(nowIso, nowIso, eventId, invitationId)
    .run();
  return result.meta.changes > 0;
}

export async function markReviewerInvitationAccepted(
  database: D1Database,
  invitationId: string,
  userId: string,
  nowIso: string,
): Promise<boolean> {
  const result = await database.prepare(
    `UPDATE reviewer_invitations
     SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending' AND expires_at > ?`,
  )
    .bind(userId, nowIso, nowIso, invitationId, nowIso)
    .run();
  return result.meta.changes > 0;
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
