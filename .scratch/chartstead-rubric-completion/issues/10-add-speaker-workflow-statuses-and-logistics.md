# 10 — Add speaker workflow statuses and logistics

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Extend each event participation with an organizer-controlled workflow status and persistent logistics information. Status and logistics must remain event-specific historical facts rather than overwriting the speaker's reusable identity profile.

## User stories covered

- Rubric criteria SPK-04 and SPK-15.

## Acceptance criteria

- [x] Organizers can set and change a documented speaker workflow status from the directory or speaker detail.
- [x] The directory displays and filters by workflow status independently from derived task readiness.
- [x] Organizers can store travel preferences and configurable logistics fields on the event participation.
- [x] Reloading, importing, or editing the current speaker profile does not erase event-specific status or logistics.
- [x] API responses preserve current identity versus event-time participation boundaries.
- [x] Tests cover status transitions, filtering, logistics persistence, event isolation, and profile-edit compatibility.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created to add explicit workflow state without overloading existing task-readiness flags.
- 2026-08-12 — Started in isolated worktree for speaker workflow status and logistics implementation and review.
- 2026-08-12 — Ready for human QA. Verified focused speaker worker/UI tests, speaker-directory browser flow, typecheck, and production build. Demo: http://100.105.117.93:5183/ — open Speakers, filter by workflow independently of readiness, edit event details, then confirm profile edits preserve participation logistics.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
