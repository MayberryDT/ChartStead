# 15 — Clean Decision Course Check fast path

**What to build:** Give an issue-free final-decision batch one lightweight, action-specific review and confirmation that exposes the exact consequences without routing the organizer through empty evidence or exception machinery.

**Blocked by:** Course Check 14 — Truthful decision review projection and receipts.

**Status:** in-progress

## Source

`.research/chartstead-course-check-ux-research.md`, especially sections 5.2, 5.3, 9.1, 9.4, and the fast-path acceptance checklist.

## Acceptance criteria

- [x] A clean single decision or realistic batch opens a compact review surface instead of the full exception workspace while retaining a durable, resumable Course Check resource underneath.
- [x] The surface shows the exact decision, session, speaker, onboarding-task, communication-draft, and external-effect counts relevant to that action.
- [x] Empty issue groups and repeated **all clear** panels do not render; one quiet **Course Check found no issues** message is sufficient.
- [x] The primary action uses live counts and exact consequences, and no generic confirmation verb remains on the clean path.
- [x] Cancel returns to the originating submissions context without changing records.
- [x] Confirmation produces the persistent truthful receipt defined by Course Check 14 and an obvious route back to ordinary work.
- [x] The compact treatment is selected by issue severity and interaction complexity, not a hard-coded issue-count threshold alone; complex or policy-gated work can still use the durable full page.
- [x] Keyboard focus, small-screen layout, and browser history work without losing the selected batch.
- [x] Tests cover clean accepted, declined, and mixed-outcome batches, zero empty accordions, no implicit draft creation or send, and correct return behavior.

## Comments

- 2026-08-12 — Blocked only by the agent-ready Course Check 14 foundation. Final visual polish remains in separate human-tandem tickets and is not a dependency.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-12 — Started in the overnight parallel frontier after Course Check 14; automated verification is required, with demos/review/QA deferred per Tyler's instruction.

- 2026-08-12 — Implemented the compact issue-free decision fast path with exact live consequences, truthful receipt, preserved submissions origin/selection, responsive focus/history behavior, and full-workspace fallback for stale, split, deferred, policy-gated, or external-stage work. Verified typecheck; 81 UI tests; 22 focused decision/projection/batch worker tests; 4 Course Check browser tests including 390×844 history/selection coverage; and production build. Status remains in-progress for parent closeout; no demo or QA request started.
