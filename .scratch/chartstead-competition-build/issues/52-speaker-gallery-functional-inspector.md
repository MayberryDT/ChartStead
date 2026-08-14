# 52 — Make the Speaker Gallery and inspector fully functional

**Status:** done

**Blocked by:** Competition 46

## Parent

Competition 46 — Premium Speaker Gallery embed

## What to build

Complete the Signal Rail gallery interaction model. Selecting any speaker must update a persistent inspector with real public-safe speaker details and linked sessions. Base UI and TanStack Router/Query must own the relevant selection, controls, data, navigation, and recovery behavior.

## Acceptance criteria

- [ ] Clicking or keyboard-activating any speaker selects exactly that speaker and updates the inspector without appending a second detail surface below the gallery.
- [ ] Selected speaker is deep-linkable/restorable through TanStack Router search state; invalid or hidden speaker IDs fail safely to a deterministic selection.
- [ ] TanStack Query owns directory/detail loading, pinned/current revision changes, stale state, errors, and retries without fixture-only overlays.
- [ ] Search, track, role, clear, close/back behavior where responsive, profile, and linked-session actions all work against stable public targets.
- [ ] Base UI supplies appropriate buttons, selects, tooltips, and responsive disclosure/dialog primitives while desktop retains a persistent inspector.
- [ ] Missing portrait, missing biography, no expertise, no linked sessions, filtered-empty, disabled, loading, and error states are usable and public-safe.
- [ ] Tests cover selection by pointer/keyboard, URL restoration, rapid selection, filter-selection reconciliation, privacy, revision pinning, focus management, and desktop/narrow behavior.
- [ ] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Functional inspector completed test-first: controlled and URL-backed selection, deterministic filter fallback, Base UI speaker actions, functional search/track/role/clear, public profile/session targets, persistent inspector, and public-safe fallback states. Focused tests and build pass. Competition 57 may start.
- 2026-08-14 — Continued in fresh isolated worktree `/home/halla/ChartStead/.worktrees/ticket-52-57-speaker-gallery-functional` on branch `ticket-52-57-speaker-gallery-functional`, based on accepted embed-polish integration commit `9b25c5f`.

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement and motion are Competition 57.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 46 (in-review).
