# 35 — Overview tab visual polish

**What to build:** Bring the organizer Overview work surface up to Harbor Master Desk quality. Ticket 01 left a metric strip and tracks/rooms lists; Competition 28 put that surface in the shared shell. Overview should now read as the event’s operational home — what needs attention, what is true, and the next useful move — not a leftover walking-skeleton dashboard.

**Blocked by:** 01 — Walking skeleton and seeded event. Competition 28 — Shared organizer desk shell baseline.

**Status:** done

- [x] Overview answers operational questions first: unreviewed work, program setup, and next useful actions. Metrics stay one compact row, not decorative cards.
- [x] Tracks and rooms are scannable and useful (counts, readiness, empty/pending truth) and lead into the owning workspace instead of dead-end lists.
- [x] Loading, empty, and partial-setup states explain what is true and what to do next. No invented completeness (accepted/unplaced/conflicts only if those numbers already exist).
- [x] Event-scoped Overview URL, toolbar identity, and work-surface hierarchy match `design/ORGANIZER-DESK-CHROME.md`. Sidebar already names the surface; do not add a second toolbar or duplicate Forms/Submissions primary actions.
- [x] Desktop and narrow layouts retain 44px targets, visible focus, and no accidental horizontal overflow.
- [x] Visual QA against `design/DESIGN.md` (summary metrics, no pills, restrained status) and Submissions as the comparison desk. Do not change auth, event membership, review, Course Check, or worker semantics.

## Comments

Filed 2026-08-12 after Tyler named Overview as the next human-tandem polish surface. Ticket 14 remains shell chrome; this ticket owns the Overview work surface (`/` today, event-scoped route as part of the pass).

- 2026-08-12 — Started with Tyler in tandem; status → in-progress before polish work.
- 2026-08-12 — Worktree: `.worktrees/ticket-35-overview-desk` then `.worktrees/ticket-35-overview-v2` against harbor-blue desk.
- 2026-08-12 — **Done (tandem polish).** No Overview title toolbar. Metric row: unreviewed, submissions, unplaced, speaker work. Attention list jumps to owning surfaces. Event dates live in a sidebar card under account; event switcher drops visible “Event” label and gives the name two-line room. Merged to main.
