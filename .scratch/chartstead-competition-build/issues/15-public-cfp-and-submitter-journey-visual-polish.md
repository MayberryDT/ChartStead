# 15 — Public CFP and submitter journey visual polish
**What to build:** Bring the public CFP, confirmation, proposal detail, and signed submitter-edit journey from Tickets 02/03 to a consistent public ChartStead experience. Ticket 12 owns the organizer builder; this ticket owns the submitter-facing path around the already-functional runtime.

**Blocked by:** 03 — Guided CFP publishing and submitter follow-up.
**Status:** done

- [x] Public CFP landing, guided questions, validation, upload/retry, confirmation, and signed edit states feel like one calm no-account journey.
- [x] Hierarchy distinguishes event identity, explanatory copy, primary progress/action, and recovery states without exposing organizer vocabulary.
- [x] Proposal detail and signed edit pages make safe next actions obvious while retaining the privacy boundary and no-email-leak guarantees.
- [x] Mobile and narrow widths have no horizontal overflow, retain visible focus, and keep primary submit/edit actions comfortably tappable.
- [x] Event accent is restrained to allowed public treatments; ChartStead structure, accessibility, and the current functional CFP runtime remain intact.

## Comments

Filed to cover Ticket 02's public submitter journey after Ticket 03 made it canonical. Ticket 12 remains the separate human-tandem polish pass for the organizer CFP builder.

- 2026-08-16 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-16 — Claimed with Tyler for human-tandem polish; status → `in-progress`. Worktree: `.worktrees/competition-15-public-cfp`.
- 2026-08-16 — Completed visual polish with Tyler: removed card outlines and question boxes across SurveyJS components, expanded inputs and dropdowns to full width without right-side clipping, fixed submitter account spacing and deadline callout, cleaned up confirmation/proposal detail key-value table, and added Google Sign-In layout with secure email link fallback on both the CFP and Submitter Dashboard (`/my-proposals`). All CFP and submitter UI tests passing. Status → `done`.
