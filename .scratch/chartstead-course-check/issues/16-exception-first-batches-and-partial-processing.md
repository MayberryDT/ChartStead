# 16 — Exception-first batches and partial processing

**What to build:** Turn an issue-bearing Decision Course Check into an exception-first batch review where blockers, warnings, safe alternatives, eligible work, and skipped outcomes are immediately understandable and valid work can proceed without being held hostage by unrelated problems.

**Blocked by:** Course Check 14 — Truthful decision review projection and receipts.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially sections 4, 5.3–5.5, 6, 9.2–9.4, and the partial-processing acceptance checklist.

## Acceptance criteria

- [x] Findings project into four user-facing classes with distinct behavior: **Needs action**, **Check**, **Details**, and **Could not check**.
- [x] The review opens with prioritized exceptions, followed by a concise always-visible **What will happen** summary; selected-item detail and technical evidence use progressive disclosure.
- [x] Every issue names the affected proposal, speaker, recipient group, message, session, or effect and explains both the consequence of leaving it unchanged and whether it blocks one item, one effect, or the permitted commit.
- [x] Repeated issues with an identical resolution can be grouped and acted on in bulk without hiding the affected objects.
- [x] The selected-submissions table supports **Needs action**, **Check**, **Ready**, and **Skipped** filters and shows proposed decision, speaker context, decision readiness, draft readiness, and batch outcome.
- [x] Valid items can proceed while ineligible items remain unchanged when policy permits; identity, authority, freshness, and durable-integrity blockers remain non-bypassable for their affected scope.
- [x] Generic **Defer** language is replaced by consequence-specific outcomes such as **Leave decision unchanged**, **Accept without a draft**, **Review later**, or **Remove from this batch**.
- [x] The sticky action area names the exact eligible and skipped counts and remains disabled only when every permitted execution option is blocked.
- [x] The persistent result enumerates processed, failed, warned, skipped, and unchanged outcomes without presenting partial success as complete batch success.
- [x] Contract, UI, and browser tests cover grouped exceptions, warnings, unavailable checks, safe partial execution, non-bypassable blockers, and exact result counts.

## Comments

- 2026-08-12 — This is functional agent work. Course Check 12 may later polish the batch surface, but does not block this ticket.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-12 — Started in the overnight parallel frontier after Course Check 14; automated verification is required, with demos/review/QA deferred per Tyler's instruction.
- 2026-08-12 — Implemented exception-first projection and review UI with grouped affected objects, four behavior classes, selected-submission filters, consequence-specific alternatives, safe defer-then-apply partial execution, and persistent exact outcome counts. Verification: typecheck and build passed; full UI 76/76 and worker 185/185 passed; focused Course Check browser file 4/4 passed. A broad E2E run reached 16/17 with this ticket's scenario passing; its unrelated failure was the older single-decision test selecting a proposal already finalized by earlier persisted suite state. Status intentionally remains in-progress for root closeout.
- 2026-08-12 — Closed without a demo/review/QA pause per Tyler's instruction. Root independently re-ran typecheck plus 12 focused worker and 9 focused UI tests before merge; all passed.
