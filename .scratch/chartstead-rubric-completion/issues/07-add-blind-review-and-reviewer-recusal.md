# 07 — Add blind review and reviewer recusal

**Status:** done

**Blocked by:** Rubric 06 — privacy and recusal apply to explicit round assignments.

## What to build

Honor per-round anonymization in every reviewer-facing projection and let assigned reviewers declare a conflict of interest or recuse themselves. Organizers retain identity visibility and receive an actionable record of the recusal so the work can be reassigned.

## User stories covered

- Rubric criteria ABS-07 and ABS-12.

## Acceptance criteria

- [x] Enabling blind review removes speaker and co-speaker names, organizations, emails, biographies, and identity-bearing attachments from reviewer projections.
- [x] Organizer views of the same proposal retain complete identity information.
- [x] A reviewer can record a conflict or recusal with an optional private reason and cannot continue reviewing that assignment.
- [x] Recused work becomes visible to organizers for reassignment without revealing another reviewer's private review content.
- [x] API responses and downloadable evidence obey the same anonymization rules as the browser UI.
- [x] Tests cover blind/unblind projection contrast, indirect identity leakage, recusal, reassignment, and cross-reviewer isolation.

## Blocked by

- Rubric 06 — Assign submissions and distribute review work.

## Comments

- 2026-08-12 — Initial blocker recorded; privacy enforcement is required at the projection boundary, not only through hidden UI fields.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 06 (blocked).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-12 implementation update

Implemented per-round blind projection hardening and reviewer recusal enforcement. Reviewer-facing browser and v1 APIs now strip speaker/co-speaker identity, biographies, emails, private notes, attachment/file answers, and supporting uploads during blind rounds. Reviewers can record a round/proposal conflict with a private organizer-visible reason; recused reviewers are blocked from further review writes. Admin proposal projections retain full identity and show recusal records for reassignment, while other reviewers only see their own audit/recusal state.
