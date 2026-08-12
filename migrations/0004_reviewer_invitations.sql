CREATE TABLE "reviewer_invitations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "event_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "track_ids_json" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'accepted', 'revoked')),
  "outbox_id" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "accepted_by_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "accepted_at" TEXT,
  "revoked_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE INDEX "reviewer_invitations_event_created_idx"
  ON "reviewer_invitations" ("event_id", "created_at" DESC);

CREATE INDEX "reviewer_invitations_email_idx"
  ON "reviewer_invitations" ("event_id", "email");
