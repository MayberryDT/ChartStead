# 67 — Make locked Submissions rows obvious without a tooltip

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

On Submissions, some rows can be selected and some cannot. Locked rows (final `programOutcome` already set) gray out the batch checkbox and explain why only in a tooltip. Tyler wants a more obvious treatment than hover text.

Rows must stay openable for inspect. Batch select can stay locked after a final outcome. The reason has to be visible in the row itself.

## Acceptance criteria

- [ ] A locked row shows a visible in-row reason (outcome / locked label), not only a `title` tooltip.
- [ ] Clicking the row still opens the inspector; only batch checkbox / batch actions stay unavailable.
- [ ] Locked rows do not look randomly broken or unclickable; the difference from selectable rows is obvious at a glance.
- [ ] Tooltip may remain as extra help; it is not the only explanation.
- [ ] Focused UI tests cover locked vs unlocked selection and the visible lock reason.
- [ ] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler walkthrough: Submissions are sometimes selectable and sometimes grayed out. The tooltip explains why; need a more obvious solution than hover text.
