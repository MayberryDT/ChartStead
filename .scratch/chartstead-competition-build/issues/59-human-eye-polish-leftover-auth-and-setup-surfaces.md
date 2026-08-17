# 59 — Human-eye polish leftover auth and setup surfaces

**Status:** in-progress

**Blocked by:** Competition 58

## What to build

Give Tyler a place to inspect the product surfaces that never got a visual-polish ticket. Organizer tabs, embed renderers, and most public embeds already have polish tickets. These leftover setup/auth surfaces do not: production sign-in, create-event / empty workspace, `/demo` personas, reviewer invitation accept, and the submitter dashboard.

## Acceptance criteria

- [ ] Production sign-in (Google, magic-link, success, error, no-membership) matches Harbor Ledger, not a leftover scaffold.
- [ ] Create-event and first-run empty workspace (Competition 20 waived human QA) are reviewed at desktop and narrow widths.
- [ ] `/demo` persona picker is reviewable as a visitor-facing surface, not only as an evaluator utility.
- [ ] Reviewer invitation accept and submitter `/my-proposals` dashboard are reviewed; they are not covered by Competition 15–19.
- [ ] Keyboard, 44px targets, and no horizontal overflow hold on these routes.
- [ ] Notes and screenshots are recorded here.

## Comments

- 2026-08-16 — Board review: visual polish exists for Overview, Submissions, Agenda, Forms, Speakers, Messages, Settings, Embeds, CFP builder, and the five public embeds. Still human-tandem: Competition 15–19 and Course Check 11–12. This ticket covers the leftover auth/setup holes only.
- 2026-08-16 — Competition 18 remains the chasing-board note; Competition 39 already polished the Speakers tab. Do not reopen Speakers here.
- 2026-08-17 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-16 — Claimed with Tyler for human-tandem polish; status → `in-progress`. Worktree: `.worktrees/competition-59-human-eye-auth-setup`. Initialized demo server on port 5190.
