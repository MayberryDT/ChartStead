# 49 — Make every Speakers List interaction truthful

**Status:** in-progress

**Blocked by:** Competition 43

## Parent

Competition 43 — Premium Speakers List embed

## What to build

Complete the Speakers List behavior using Base UI controls and TanStack Router/Query wherever they own the interaction. Search, track, role, clear, profile, and linked-session actions must operate on real public-safe speaker data rather than fixture-only or decorative handlers.

## Acceptance criteria

- [ ] Search, track, role, and clear controls filter the real public speaker directory, update counts, and restore useful state through TanStack Router search params.
- [ ] Loading, revision changes, errors, retries, and public-directory fetching use TanStack Query without stale fixture overlays or silent failures.
- [ ] Base UI supplies appropriate buttons, selects, tooltips, and disclosure primitives; all actions have accessible names, keyboard behavior, and visible focus.
- [ ] Profile and linked-session actions resolve to stable public targets and never expose hidden speaker fields or unpublished relationships.
- [ ] Missing portrait, missing biography, no linked sessions, filtered-empty, disabled, and error states remain usable and truthful.
- [ ] Current-following versus pinned revision, field visibility, embed resolution, and privacy boundaries have focused regression coverage.
- [ ] Browser tests exercise every visible control, URL restoration, keyboard use, pointer use, loading/error recovery, and narrow behavior.
- [ ] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement is Competition 54.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 43 (in-review).
