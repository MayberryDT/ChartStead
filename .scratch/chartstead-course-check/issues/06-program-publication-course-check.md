# 06 — Program Publication Course Check

**What to build:** A deliberate public-program release path that compares private working state with the current public revision, publishes an exact valid subset, and prepares but never silently sends downstream calendar communication.

**Blocked by:** 02 — Batch decisions and shared workspace; Competition 08 — Fluid agenda builder; Competition 09 — Published program renderer and embed.

**Status:** done

- [x] The working schedule remains continuously editable and may contain unplaced, TBD, incomplete, private, or conflicting sessions.
- [x] `Publish program` opens Program Publication Course Check rather than changing public state directly.
- [x] The plan compares immutable working and public revisions and shows additions, removals, time changes, room changes, speaker changes, and visibility changes.
- [x] The valid public subset is selected by default while unplaced, private, and unpublishable sessions remain internal.
- [x] A publishable session requires accepted visible state, public title/description, and at least one approved public speaker identity; time and room may remain TBD.
- [x] Known conflicts and incomplete public fields remain visible and never leak private onboarding, committee, or plan data.
- [x] Publishing a known material conflict requires an explicit override reason and exact affected-session evidence.
- [x] `Publish program` records approval and atomically creates a new immutable public revision and audit history.
- [x] Unpublish and restore operations create new reviewed public revisions rather than deleting history.
- [x] Calendar and speaker-notification consequences create linked Communication Course Checks without inherited approval or implicit delivery.
- [x] Public full-page, embed, feed, and add-to-calendar surfaces resolve from the same approved current revision.
- [x] Tests cover valid subset, TBD, conflict override, privacy filtering, out-of-date working/public revisions, unpublish, restore, cache/feed effects, and linked communication.

## Comments

Blocked by Course Check 02 — Batch decisions and shared workspace. Competition Tickets 08 and 09 are done.

- 2026-08-11 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-11 — Claimed by agent on branch `course-check-06-program-publication` (worktree `.worktrees/course-check-06-program-publication`).
- 2026-08-11 — Implementation ready for human QA.
  - Worktree: `.worktrees/course-check-06-program-publication`
  - Branch: `course-check-06-program-publication`
  - Demo: http://100.105.117.93:5186/e/pacific-open-data-summit-2026/agenda
  - Verified: typecheck, build, publication + public-program + decision/batch worker tests (34)
- 2026-08-11 — Merged to main (`17047e0`). Course Check 06 done.
