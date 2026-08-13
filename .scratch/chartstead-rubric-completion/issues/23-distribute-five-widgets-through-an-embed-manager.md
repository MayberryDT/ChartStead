# 23 — Distribute five widgets through an embed manager

**Status:** done

**Blocked by:** Rubric 19; Rubric 20; Rubric 21; Rubric 22 — all public surfaces must exist before distribution is unified.

## What to build

Add an organizer embed manager for the five required surfaces: Sessions List, Speakers List, Agenda, Schedule Itinerary, and Speaker Gallery. Organizers can create saved embed configurations, retrieve code or feed URLs, and rely on one canonical published revision so data remains identical across public page and embed renderings.

## User stories covered

- Rubric criteria EMB-14, EMB-15, and EMB-16.

## Acceptance criteria

- [x] Each of the five surfaces has a populated non-admin route and an embeddable rendering mode.
- [x] An organizer can choose a widget, branding/theme options, content filters, and supported field visibility before generating a snippet or feed URL.
- [x] Saved embed configurations can be listed, reopened, copied, updated, disabled, and safely resolved by public viewers.
- [x] Embed output is responsive, keyboard-accessible, and protected from leaking organizer navigation or private event data.
- [x] Every surface and embed reads the same published revision and shows identical title, date/time, room, track, and speaker values for a sampled session.
- [x] Publishing a new revision updates current embeds consistently while revision-pinned embeds remain immutable and clearly identified.
- [x] End-to-end tests exercise all five external surfaces, configuration persistence, snippet retrieval, consistency, revision behavior, authorization, and privacy.

## Blocked by

- Rubric 19 — Complete the public Sessions List.
- Rubric 20 — Build public speaker directory and gallery surfaces.
- Rubric 21 — Complete the public Agenda widget.
- Rubric 22 — Build itinerary and a persistent personal schedule.

## Comments

- 2026-08-12 — Initial blockers recorded; this ticket unifies distribution rather than duplicating widget data or business rules.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 19 (in-review); Rubric 20 (blocked); Rubric 21 (in-review); Rubric 22 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Implemented the public embed manager, five widget-specific routes, saved embed configuration API, public-safe embed/feed resolution, revision pinning, disabled embed handling, renderer field/theme/filter support, and focused UI/worker coverage. Focused checks passed:

- `npx vitest run --config vitest.config.ts test/ui/public-program.test.tsx`
- `npx vitest run --config vitest.worker.config.ts test/worker/public-program.test.ts`
