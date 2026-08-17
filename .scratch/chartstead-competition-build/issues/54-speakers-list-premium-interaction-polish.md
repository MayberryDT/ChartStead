# 54 — Give the Speakers List final interaction polish

**Status:** done

**Blocked by:** Competition 49

## Parent

Competition 49 — Speakers List functional interactions

## What to build

Give the functional Speakers List a final minimal premium pass while preserving its Atlas Modules directory structure.

## Acceptance criteria

- [x] Remove card-inside-card framing, excess whitespace, oversized search framing, and ornamental separators that do not improve scanning.
- [x] Search, filters, clear, profile, and linked-session actions have a coherent restrained button/link hierarchy and 44px targets.
- [x] Filtering, result changes, hover/focus, portrait loading, and responsive rearrangement use premium reduced-motion-safe transitions.
- [x] Portrait crops, name/role/organization hierarchy, linked-session wrapping, and row/column density remain consistent across realistic content extremes.
- [x] One quiet centered `Powered by ChartStead` attribution sits at the bottom without a separate bar and matches all other embeds exactly.
- [x] Missing portraits, filtered-empty, loading, error, focus, hover, and narrow states receive a documented multi-pass visual review.
- [x] Exact desktop and narrow screenshots show no clipping, overflow, nested-card wall, or ambiguous action treatment.
- [x] A Tailscale demo and what-to-test checklist are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler: confirm closed on main board. Prior done closeout lived only on tmp/wip-before-67 (park-before-67) and never merged; restored to done.

- 2026-08-16 — Tyler confirmed complete; status → `done`.
- 2026-08-14 — Ready for QA at `http://100.105.117.93:5447/fixtures/embeds/speakers-list`. Test search/track/role/clear, profile and linked-session actions, portrait/missing-data states, focus, density, and centered attribution.

- 2026-08-14 — Created from Tyler's premium consumer-facing polish notes.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 49 (blocked — waiting for competition 43).