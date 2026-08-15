# 49 — Make every Speakers List interaction truthful

**Status:** done

**Blocked by:** Competition 43

## Parent

Competition 43 — Premium Speakers List embed

## What to build

Complete the Speakers List behavior using Base UI controls and TanStack Router/Query wherever they own the interaction. Search, track, role, clear, profile, and linked-session actions must operate on real public-safe speaker data rather than fixture-only or decorative handlers.

## Acceptance criteria

- [x] Search, track, role, and clear controls filter the real public speaker directory, update counts, and restore useful state through TanStack Router search params.
- [x] Loading, revision changes, errors, retries, and public-directory fetching use TanStack Query without stale fixture overlays or silent failures.
- [x] Base UI supplies appropriate buttons, selects, tooltips, and disclosure primitives; all actions have accessible names, keyboard behavior, and visible focus.
- [x] Profile and linked-session actions resolve to stable public targets and never expose hidden speaker fields or unpublished relationships.
- [x] Missing portrait, missing biography, no linked sessions, filtered-empty, disabled, and error states remain usable and truthful.
- [x] Current-following versus pinned revision, field visibility, embed resolution, and privacy boundaries have focused regression coverage.
- [x] Browser tests exercise every visible control, URL restoration, keyboard use, pointer use, loading/error recovery, and narrow behavior.
- [x] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Complete on the shared interaction wave: Base UI track/role controls, URL-restored selection/filter state, accessible profile/session actions, retry behavior, and focused coverage. Verified at `http://100.105.117.93:5447/fixtures/embeds/speakers-list`.

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement is Competition 54.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 43 (in-review).
