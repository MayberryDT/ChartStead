# 59 — Human-eye polish leftover auth and setup surfaces

**Status:** done

**Blocked by:** Competition 58

## What to build

Give Tyler a place to inspect the product surfaces that never got a visual-polish ticket. Organizer tabs, embed renderers, and most public embeds already have polish tickets. These leftover setup/auth surfaces do not: production sign-in, create-event / empty workspace, `/demo` personas, reviewer invitation accept, and the submitter dashboard.

## Acceptance criteria

- [x] Production sign-in (Google, magic-link, success, error, no-membership) matches Harbor Ledger, not a leftover scaffold.
- [x] Create-event and first-run empty workspace (Competition 20 waived human QA) are reviewed at desktop and narrow widths.
- [x] `/demo` persona picker is reviewable as a visitor-facing surface, not only as an evaluator utility.
- [x] Reviewer invitation accept and submitter `/my-proposals` dashboard are reviewed; they are not covered by Competition 15–19.
- [x] Keyboard, 44px targets, and no horizontal overflow hold on these routes.
- [x] Notes and screenshots are recorded here.

## Comments

- 2026-08-16 — Board review: visual polish exists for Overview, Submissions, Agenda, Forms, Speakers, Messages, Settings, Embeds, CFP builder, and the five public embeds. Still human-tandem: Competition 15–19 and Course Check 11–12. This ticket covers the leftover auth/setup holes only.
- 2026-08-16 — Competition 18 remains the chasing-board note; Competition 39 already polished the Speakers tab. Do not reopen Speakers here.
- 2026-08-17 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-16 — Claimed with Tyler for human-tandem polish; status → `in-progress`. Worktree: `.worktrees/competition-59-human-eye-auth-setup`. Initialized demo server on port 5190.
- 2026-08-16 — Reviewed and verified directly with Tyler. Production sign-in, /demo persona picker, reviewer invitation, and submitter dashboard confirmed approved. Status → `done`.
