# 67 — Make locked Submissions rows obvious without a tooltip

**Status:** in-review

**Blocked by:** None — can start immediately.

## What to build

On Submissions, some rows can be selected and some cannot. Locked rows (final `programOutcome` already set) gray out the batch checkbox and explain why only in a tooltip. Tyler wants a more obvious treatment than hover text.

Rows must stay openable for inspect. Batch select can stay locked after a final outcome. The reason has to be visible in the row itself.

## Acceptance criteria

- [x] A locked row shows a visible in-row reason (outcome / locked label), not only a `title` tooltip.
- [x] Clicking the row still opens the inspector; only batch checkbox / batch actions stay unavailable.
- [x] Locked rows do not look randomly broken or unclickable; the difference from selectable rows is obvious at a glance.
- [x] Tooltip may remain as extra help; it is not the only explanation.
- [x] Focused UI tests cover locked vs unlocked selection and the visible lock reason.
- [x] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler QA: reject in-row “Outcome locked” (adds vertical space) and grayed/disabled batch checkbox. Direction: add a real **Locked** status (filter + status column) instead. Reverted prior treatment. Now: status column shows Locked when `programOutcome` is set; status filter includes Locked; locked rows omit the batch checkbox (no grayed control, no extra talk-line). Combined demo: http://100.105.117.93:5870/e/ai-engineer-worlds-fair-2026/submissions

- 2026-08-16 — Claimed for unsupervised agent batch (Competition 63–67). Worktree: `.worktrees/competition-67-locked-rows`.

- 2026-08-17 — Tyler walkthrough: Submissions are sometimes selectable and sometimes grayed out. The tooltip explains why; need a more obvious solution than hover text.

- 2026-08-17 — Ready for human QA. Locked rows now show calm in-row copy `Outcome locked · Accepted|Declined` under the talk title; whole-row opacity fade removed so rows still read as openable; batch checkbox stays disabled with optional tooltip. Demo: `http://100.105.117.93:5867/demo` → Submissions. What to test: (1) find a row with final outcome and confirm lock reason is visible without hover; (2) click that row — inspector opens; (3) batch checkbox stays disabled; (4) unlocked rows still select for batch.
