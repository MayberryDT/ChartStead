# 17 — Speaker portal visual polish

**What to build:** Bring the speaker-facing portal from Tickets 05/06 up to ChartStead design-system quality. Accepted speakers should understand their profile, participation snapshot, session, tasks, and next step without seeing organizer operations or an anxious checklist wall.

**Blocked by:** 06 — Onboarding and assisted chasing.

**Status:** done

- [x] Portal summary, profile, participation snapshot, session, task states, deadlines, and file actions form a calm, supportive hierarchy.
- [x] Current-profile facts and event-specific participation facts stay visually distinct and understandable without changing snapshot semantics.
- [x] Task completion, uploads, retry/error states, and signed-link expiry/revocation pages have clear next actions and accessible focus behavior.
- [x] Speaker-facing layout stacks cleanly on narrow widths with 44px targets, no clipped focus rings, and restrained event accent treatment.
- [x] Organizer tasks, reminder drafts, decision evidence, tokens, and other private operational information remain absent from every portal state.

## Comments

Filed after Ticket 06 because it extended the Ticket 05 portal. Ticket 18 separately owns the organizer onboarding-and-chasing workspace.

- 2026-08-17 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-16 — Claimed with Tyler for human-tandem polish; status → `in-progress`. Worktree: `.worktrees/competition-17-speaker-portal`.
- 2026-08-16 — Completed speaker portal visual polish and interaction redesign with Tyler: applied bathymetry background, embedded card architecture, speaker-centric copywriting, hero session highlights, profile & headshot editor, distinct event participation snapshot, deliverable task file uploads with real-time feedback, organizer messages outbox, compact task actions, and green status boxes. Status → `done`.
