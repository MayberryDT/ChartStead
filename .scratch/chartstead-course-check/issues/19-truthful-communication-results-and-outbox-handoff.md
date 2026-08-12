# 19 — Truthful communication results and Outbox handoff

**What to build:** Make communication preparation and delivery state explicit from draft absence through final provider outcome, with persistent exact results and a natural Outbox follow-up that never suggests prepared drafts were sent.

**Blocked by:** Course Check 18 — Connected decision-to-draft Course Check workspace.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially sections 7, 8.2, 9.5, and the Messages and Completion acceptance checklists.

## Acceptance criteria

- [x] Communication uses the visible progression **No draft → Draft prepared → Ready to send → Sending → Sent / Delivered / Bounced / Failed**, mapped truthfully to durable internal and provider state.
- [x] Draft creation produces a persistent result with exact prepared, omitted, failed, and unchanged counts plus an explicit **No emails were sent** statement.
- [x] The result provides direct routes to review drafts in Outbox, return to submissions, inspect affected sessions, and view skipped or draftless items.
- [x] Outbox opens on the exact draft set and preserves recipient groups, inclusion reasons, prior communication, and source links from the connected workspace.
- [x] **Send messages** remains a separate explicit approval of the frozen payloads; no transition, route change, or result state triggers it implicitly.
- [x] Delivery results report exact succeeded, retrying, failed, unknown, reconciled, and corrected effects instead of a generic complete or failed batch.
- [x] A sent message is never described as editable, recalled, or undone; correction remains a new linked reviewed action.
- [x] Completion remains available after reload and in event activity history rather than relying on a transient toast.
- [x] Tests cover draft-only completion, mixed draft eligibility, Outbox handoff, explicit send, partial provider outcomes, retry/reconciliation, correction, and truthful state after reload.

## Comments

- 2026-08-12 — Functional completion and Outbox continuity are agent-owned. Morning human-tandem tickets can polish presentation without blocking this behavior.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started after the connected decision-to-draft workspace integrated; demos, reviews, and human QA are deferred while automated acceptance verification remains required.

- 2026-08-12 — Implementation verified after rebasing onto `02bc661` (Course Check 20). Focused Worker: 26/26; focused UI: 54/54; broad UI: 111/111; Course Check browser walkthrough: 10/10; typecheck and production build passed. Full Worker passed 228/230, with only two 5-second timeout flakes under concurrent load; the affected killer walkthrough passed 2/2 and the documented guided-CFP suite passed 23/23 on sequential reruns. The shared approval projection now preserves the dependency-safe partial-decision commit declared by the decision projection. No demo, review agent, or human QA was run per scope.

- 2026-08-12 — Parent-integration closeout: implementation commit `89aac57` is clean and based on integrated Course Check 20 (`02bc661`); automated acceptance gates above remain the completion evidence. Marked `done` at parent request.
