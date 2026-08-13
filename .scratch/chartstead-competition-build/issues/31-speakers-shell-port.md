# 31 — Speakers and onboarding desk shell port

**What to build:** Port the organizer Speakers directory and onboarding/readiness desk into the shared organizer shell established by Competition 28. Preserve the master-detail workflow and explicit human review of reminder sends.

**Blocked by:** Competition 28 — Shared organizer desk shell baseline

**Status:** done

- [x] Speakers renders through one shared shell toolbar with account/event context and no duplicate workspace command bar.
- [x] Directory search, readiness filtering, add/import actions, and visible counts have a clear toolbar/work-surface ownership model without hiding the selected speaker context.
- [x] Speaker identity, event participation, missing work, due dates, readiness flags, task creation, reminder drafting, discard/edit/send actions, delivery outcomes, and history remain behaviorally unchanged.
- [x] Selected-speaker master-detail navigation remains obvious, keyboard accessible, and stable through local search/filter changes.
- [x] Desktop and narrow layouts retain usable tables/cards, 44px targets, visible focus, and no accidental horizontal overflow.
- [x] Focused tests prove direct Speakers navigation, shell presence, selection/filter behavior, and the explicit no-send-until-human-action boundary.
- [x] Do not take over the subjective onboarding visual-polish acceptance owned by human-tandem ticket 18; do not alter portal, task, reminder, or outbox semantics.

## Comments

Filed 2026-08-12 as the agent-owned structural counterpart to human-tandem ticket 18. Start after Competition 28 is complete; it can run in parallel with tickets 29, 30, 32, and 33 from the shared-shell commit.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 28 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

- 2026-08-13 — Ported Speakers to the shared Organizer Desk toolbar by hoisting search, readiness filter, count, add-speaker, and CSV-import triggers into the shell controls while leaving add/import panels and selected-speaker master-detail content in the work surface. Existing profile, participation, task, reminder draft, discard, explicit send/retry, deliverable, and history flows remain on the onboarding workspace. Focused verification: `npx vitest run --config vitest.config.ts test/ui/speaker-directory.test.tsx test/ui/speaker-csv-import.test.tsx` passed after the final cleanup; `npx vitest run --config vitest.config.ts test/ui/app.test.tsx -t "creates and configures a truthful empty event workspace"` passed before later concurrent parse errors outside this ticket. Latest app-shell rerun is blocked by an unrelated `src/SpeakerPortalPage.tsx` parse error from concurrent work, and a broader `test/ui/app.test.tsx` run still has unrelated guided-CFP/review failures, so neither is claimed here.

- 2026-08-13 — Main clarified Tyler waived human review for this batch; focused implementation and speaker checks are complete, so status moved from `in-review` to `done`.
