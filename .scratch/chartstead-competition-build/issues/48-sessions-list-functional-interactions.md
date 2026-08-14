# 48 — Make every Sessions List interaction truthful

**Status:** in-progress

**Blocked by:** Competition 42

## Parent

Competition 42 — Premium Sessions List embed

## What to build

Complete the Sessions List functional surface. Replace ad hoc controls with Base UI primitives where applicable and use TanStack Router and Query for shareable filters, public-program state, itinerary mutations, pending/error recovery, and navigation. Every visible search, filter, clear, session, and itinerary action must work against the real public-safe program contract.

## Acceptance criteria

- [ ] Search, track, room/type where exposed, clear filters, and result counts update correctly and remain deep-linkable where useful through TanStack Router search state.
- [ ] Public-program loading, revision selection, errors, retries, and itinerary mutations use TanStack Query with truthful pending, success, rollback, and invalidation behavior.
- [ ] Selects, buttons, toggles, tooltips, and any disclosure use Base UI primitives when a suitable primitive exists; no clickable `div`, fake button, or unlabelled icon action remains.
- [ ] View-session navigation opens the correct stable public session target and keyboard activation matches pointer activation.
- [ ] Save/remove itinerary is real, persists through filtering and reload under the existing public itinerary contract, prevents duplicate saves, and exposes pressed/pending/error state.
- [ ] Current-following and revision-pinned embeds retain their semantics; field visibility, public privacy, feeds, and filtered-empty behavior regressions are covered.
- [ ] Focused UI/browser tests exercise every control, URL restoration, keyboard focus, loading, error/retry, empty, disabled, and narrow behavior.
- [ ] A Tailscale demo and concise interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement is Competition 53.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 42 (in-review).
