CREATE TABLE "reviewer_track_assignments" (
  "event_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "track_id" TEXT NOT NULL,
  PRIMARY KEY ("event_id", "user_id", "track_id"),
  FOREIGN KEY ("event_id", "user_id")
    REFERENCES "event_memberships"("event_id", "user_id") ON DELETE CASCADE
);

CREATE INDEX "reviewer_track_assignments_user_event_idx"
  ON "reviewer_track_assignments" ("user_id", "event_id");
