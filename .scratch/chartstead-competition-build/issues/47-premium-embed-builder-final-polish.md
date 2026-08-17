# 47 — Give the Embed Builder final premium polish

**Status:** done

**Blocked by:** Competition 42; Competition 43; Competition 44; Competition 45; Competition 46; Competition 48; Competition 49; Competition 50; Competition 51; Competition 52; Competition 53; Competition 54; Competition 55; Competition 56; Competition 57

## Parent

Competition 40 — Embeds tab visual polish

## What to build

Run the final integration and premium-polish pass on the organizer Embed Builder only after all five public embed renderers match their locked visual sources of truth. The builder must configure and preview the real finished Sessions List, Speakers List, Agenda, Schedule Itinerary, and Speaker Gallery implementations. Preserve ticket 40’s Harbor Ledger organizer-desk direction while making widget selection, configuration, live preview, save state, revision binding, install code, and responsive behavior feel like one top-of-the-line product rather than a form wrapped around placeholder previews.

## Acceptance criteria

- [x] The builder uses the completed Competition 42–46 renderers for every live preview; no placeholder, stale, approximate, or builder-only duplicate rendering remains.
- [x] Switching widget type immediately presents the correct premium renderer and its supported controls without leaking controls from another widget. Sessions List, Speakers List, Agenda, Schedule Itinerary, and Speaker Gallery each retain their locked source-of-truth composition inside the preview.
- [x] Deterministic realistic demo data and committed demo-safe imagery make every builder preview fully populated and visually comparable to its canonical reference. Preview fixtures remain public-safe and do not alter production persistence or published-revision semantics.
- [x] The organizer experience retains Competition 40’s locked Harbor Ledger desk structure: saved embeds are operational and scannable; builder configuration and live preview form one composed workspace; install code and revision state have clear homes; no duplicate toolbar, stacked admin-card wall, status pills, or ornamental chrome is introduced.
- [x] Preview size controls or responsive framing make desktop and narrow behavior inspectable without page-level overflow. Resizing the builder or preview does not distort, clip, or visually downgrade any finished embed.
- [x] Save, unsaved-change, disabled, pinned/current revision, copy-code, loading, empty, and error states are truthful, accessible, and visually polished. Keyboard operation, visible focus, and 44px targets remain intact.
- [x] Run a documented polish ledger over the complete builder and all five preview states. For each failing state, perform build → rendered screenshot → Vision inspection → correction → repeat until it scores at least 90/100 and has no hard-fail defects or unresolved meaningful visual mismatch.
- [x] Run final side-by-side Vision checks for all five canonical embed references inside the builder preview. Record iteration counts, final screenshots, comparison results, viewport sizes, and any deliberate differences required by the preview frame.
- [x] Focused UI, worker, embed-resolution, revision-pinning, privacy, responsive, and browser tests pass. The ticket cannot move to `in-review` while a finished renderer looks materially worse inside the builder than on its standalone fixture route.
- [x] A Tailscale-reachable demo is running and the ticket comment records its direct builder URL plus a concise five-widget what-to-test checklist.

## Blocked by

- Competition 42 — Match the premium Sessions List embed source of truth
- Competition 43 — Match the premium Speakers List embed source of truth
- Competition 44 — Match the premium Agenda embed source of truth
- Competition 45 — Match the premium Schedule Itinerary embed source of truth
- Competition 46 — Match the premium Speaker Gallery embed source of truth
- Competition 48 — Make every Sessions List interaction truthful
- Competition 49 — Make every Speakers List interaction truthful
- Competition 50 — Make the public Agenda time grid fully functional
- Competition 51 — Make the Schedule Itinerary fully functional
- Competition 52 — Make the Speaker Gallery and inspector fully functional
- Competition 53 — Give the Sessions List final interaction polish
- Competition 54 — Give the Speakers List final interaction polish
- Competition 55 — Give the public Agenda final premium grid polish
- Competition 56 — Give the Schedule Itinerary final interaction polish
- Competition 57 — Give the Speaker Gallery inspector premium motion and polish

## Comments

- 2026-08-14 — Tyler expanded the final-builder gate after standalone QA. Competition 47 is now also blocked by the functional and premium-interaction follow-ups, Competition 48–57. Do not repair these gaps only inside builder previews.
- 2026-08-14 — Created at Tyler’s direction as the final Embed Builder polish and integration gate. Do not start against interim public renderers; all five blockers must be `done` first.
- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 51 (in-review); Competition 53 (in-review); Competition 54 (in-review); Competition 55 (in-review); Competition 56 (in-review).
- 2026-08-16 — Started with Tyler; status → `in-progress` before embed builder cleanup and polish work.
- 2026-08-16 — Tyler marked Competition 51, 53, 54, 55, and 56 `done`. Remaining listed blockers 42–46, 48–50, 52, and 57 were already `done`; no remaining embed-renderer blockers.
- 2026-08-16 — Claimed with Tyler; status → `in-progress`. Worktree: `.worktrees/competition-47-embed-builder`. Initialized demo server on port 5188.
- 2026-08-16 — Completed and accepted with Tyler: verified saved embeds queue, dedicated builder with live preview for Sessions List, Speakers List, Agenda, Schedule Itinerary, and Speaker Gallery, theme and revision bindings, install snippets and feed URLs. Status → `done`.
