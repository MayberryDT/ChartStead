# 29 — Agenda shell port

**What to build:** Port the existing Agenda workspace into the shared organizer desk shell established by Competition 28. Keep the native day/room grid and its partial/TBD/conflict model; this is a chrome and surface-integration slice, not a replacement scheduler.

**Blocked by:** Competition 28 — Shared organizer desk shell baseline

**Status:** done

- [x] Agenda renders through the shared shell toolbar exactly once and removes its duplicate local command/header bar.
- [x] Day selection, placement counts, publish-program action, and other workspace-level controls have one clear home in the shell slots without losing status or keyboard access.
- [x] The unplaced pool, day/room grid, session inspector, Move Session path, non-blocking conflicts, partial placement, and TBD values remain behaviorally unchanged.
- [x] The grid remains a schedule surface rather than a submissions-table clone; shell density and focus treatment match the Submissions reference.
- [x] Desktop and narrow organizer widths retain usable day/room controls, deliberate overflow behavior, 44px targets, and no accidental page-level horizontal overflow.
- [x] Focused UI/E2E coverage proves direct Agenda navigation, shell presence, day switching, and the keyboard Move Session path.
- [x] Do not take over the subjective visual-polish acceptance owned by human-tandem ticket 13; do not change agenda persistence or calendar-delivery semantics.

## Comments

Filed 2026-08-12 as the agent-owned structural counterpart to human-tandem ticket 13. Start after Competition 28 is complete; it can then run in parallel with tickets 30–33 from the shared-shell commit.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 28 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-12 implementation update

Ported Agenda chrome into the shared Organizer Desk shell seam: counts and day tabs now render in shell tools, Publish program renders in shell actions, and the duplicate local agenda header/command bar was removed. Direct `/e/:eventId/agenda` navigation now accepts `day`, `sessionIds`, and legacy `session` query state; day/session changes replace the Agenda URL without changing agenda persistence or calendar semantics. Focused UI coverage added for shell presence, direct Agenda query navigation, day switching, and existing keyboard Move Session behavior; verified with `npm run test:ui -- agenda.test.tsx`.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
