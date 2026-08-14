# 41 — Edit advanced review setup from Submissions

**What to build:** Move optional advanced evaluation-plan configuration out of Settings and into the existing Submissions Review flow. The Review Ledger remains a read-only operational summary. While the ledger is open, administrators can open a temporary Review Setup dialog, edit the event's rounds and scorecards, save, and return to the unchanged submissions queue and inspector context.

**Blocked by:** Competition 27 — Submissions tab visual polish; Competition 37 — Settings tab visual polish.

**Status:** in-progress

- [ ] Remove the Evaluation section from Settings without changing the durable evaluation-plan API or existing plan data.
- [ ] Keep the current Review button and Review Ledger behavior; ledger totals, aggregates, recommendations, and CSV results remain derived and read-only.
- [ ] Show a compact administrator-only Setup action only in Review context, not as permanent toolbar clutter.
- [ ] Open Review Setup as an accessible temporary dialog over Submissions; do not replace, resize, or add permanent regions to the submissions table and inspector layout.
- [ ] Let organizers enable or disable advanced review and edit one round at a time: name, state, dates, blind reviewer view, reviewer pool, criteria, order, addition, and removal.
- [ ] Keep scorecard criteria compact until selected for editing; preserve numeric, dropdown, and free-text criteria, required state, guidance, weight, maximum score, and dropdown options.
- [ ] Closing or saving restores the same query, filters, selected proposal or ledger, round, and inspector context.
- [ ] Desktop and narrow layouts have no accidental horizontal overflow; focus trapping, Escape/close behavior, labels, and 44px targets remain accessible.
- [ ] Focused UI and browser tests cover opening from Review, editing and saving a plan, closing without workspace drift, the simple shared-track-queue state, and narrow viewport behavior.

## Comments

- 2026-08-14 — Created and claimed from Tyler's approved direction after Competition 37 QA. This is a separate information-architecture ticket, not a continuation of Settings polish. The implementation must not turn Review Setup into a new tab or full submissions-workspace takeover.
