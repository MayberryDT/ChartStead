# Public Embed Functional Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Competition 48–52 so every visible control across the five standalone public embeds works through accessible Base UI primitives and the existing TanStack Router/Query architecture.

**Architecture:** Keep `PublicProgramPage` as the TanStack boundary for URL state and public-program queries. Extract shared public embed controls and itinerary state into focused modules, while each widget renderer retains its distinct visual composition. Public itinerary state is URL-backed and client-persisted; no organizer mutation authority is introduced.

**Tech Stack:** React 19, TypeScript, Base UI 1.7, TanStack Router 1.170, TanStack Query 5.101, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve current-following and revision-pinned behavior, field visibility, feeds, and public privacy.
- Base UI supplies suitable buttons, selects, tabs, tooltips, and dialogs/disclosures.
- TanStack Router owns shareable filters, selected session, selected speaker, and itinerary IDs.
- TanStack Query continues to own public program and managed embed server state, retries, and errors.
- All pointer actions have keyboard equivalents, accessible names, visible focus, and truthful pending/empty/error states.

---

### Task 1: Shared URL and interaction primitives

**Files:**
- Create: `src/PublicEmbedControls.tsx`
- Modify: `src/PublicProgramPage.tsx`
- Modify: `src/router.tsx`
- Test: `test/ui/public-program-page.test.tsx`

**Interfaces:**
- Produces: `PublicEmbedButton`, `PublicEmbedSelect`, and `PublicEmbedTabs` wrappers around Base UI.
- Produces: URL fields `speaker`, `itinerary`, and the existing filter/session fields through `programSearch`.

- [ ] Write failing tests proving URL restoration for selected speaker and comma-separated itinerary IDs, retry controls on query errors, and Base UI-backed accessible controls.
- [ ] Run `npx vitest run test/ui/public-program-page.test.tsx` and confirm the new assertions fail.
- [ ] Add the shared primitives and extend validated router/search serialization without dropping revision/widget/filter state.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit the shared boundary.

### Task 2: Sessions List and Speakers List behavior

**Files:**
- Modify: `src/PublicProgramRenderer.tsx`
- Modify: `src/PublicProgramPage.tsx`
- Test: `test/ui/public-program.test.tsx`

**Interfaces:**
- Consumes: shared Base UI controls and controlled URL state.
- Produces: working session navigation, itinerary toggles, role/track filters, profile/session navigation, and clear actions.

- [ ] Add failing tests for every Sessions and Speakers control, itinerary duplicate prevention, URL-preserved filtering, missing portrait, and filtered-empty recovery.
- [ ] Run focused tests and verify failures.
- [ ] Replace native/ad hoc controls with shared Base UI wrappers; wire session/profile actions and controlled itinerary state.
- [ ] Run focused tests and confirm passing behavior.
- [ ] Commit Competition 48–49 functionality.

### Task 3: Public Agenda duration-safe interaction grid

**Files:**
- Create: `src/publicAgendaLayout.ts`
- Modify: `src/PublicProgramRenderer.tsx`
- Test: `test/ui/public-agenda-layout.test.ts`
- Test: `test/ui/public-program.test.tsx`

**Interfaces:**
- Produces: `layoutPublicAgendaSessions(sessions)` returning collision-free rows with duration-derived minimum heights and overlap lanes.
- Consumes: shared Base UI tabs/selects/buttons and controlled itinerary state.

- [ ] Write failing pure layout tests for simultaneous sessions, variable durations, gaps, and TBD rows plus component tests for all filters and itinerary actions.
- [ ] Run the new tests and verify failure.
- [ ] Implement the public-safe layout helper and wire the Agenda renderer without importing organizer mutation APIs.
- [ ] Run layout and renderer tests; confirm no overlap and all controls pass.
- [ ] Commit Competition 50 functionality.

### Task 4: Schedule Itinerary persistence and controls

**Files:**
- Modify: `src/PublicProgramRenderer.tsx`
- Modify: `src/PublicProgramPage.tsx`
- Test: `test/ui/public-program.test.tsx`

**Interfaces:**
- Consumes: controlled itinerary IDs from Router state and shared controls.
- Produces: atomic schedule/rail save state, stable day/filter state, and truthful empty/disabled/error behavior.

- [ ] Write failing tests for three saved items, add/remove synchronization, reload restoration, day/filter preservation, duplicate prevention, and disabled empty itinerary.
- [ ] Run focused tests and verify failure.
- [ ] Make `IndexedItinerary` fully controlled when URL state is present and preserve fixture fallback only for standalone deterministic captures.
- [ ] Run focused tests and confirm passing behavior.
- [ ] Commit Competition 51 functionality.

### Task 5: Speaker Gallery persistent inspector behavior

**Files:**
- Modify: `src/PublicProgramRenderer.tsx`
- Modify: `src/PublicProgramPage.tsx`
- Test: `test/ui/public-program.test.tsx`

**Interfaces:**
- Consumes: controlled `speaker` URL state and shared Base UI controls.
- Produces: persistent desktop inspector, deterministic valid selection, filter-selection reconciliation, stable profile/session targets, and narrow disclosure semantics.

- [ ] Write failing tests for pointer/keyboard selection, URL restoration, invalid/filtered IDs, rapid reselection, inspector persistence, and linked-session actions.
- [ ] Run focused tests and verify failure.
- [ ] Control gallery selection from Router state and prevent any duplicate below-gallery detail rendering.
- [ ] Run focused tests and confirm passing behavior.
- [ ] Commit Competition 52 functionality.

### Task 6: Integrated verification and board handoff

**Files:**
- Modify: `.scratch/chartstead-competition-build/issues/48-sessions-list-functional-interactions.md`
- Modify: `.scratch/chartstead-competition-build/issues/49-speakers-list-functional-interactions.md`
- Modify: `.scratch/chartstead-competition-build/issues/50-agenda-functional-time-grid.md`
- Modify: `.scratch/chartstead-competition-build/issues/51-itinerary-functional-interactions.md`
- Modify: `.scratch/chartstead-competition-build/issues/52-speaker-gallery-functional-inspector.md`

- [ ] Run focused UI tests, full public-program worker regressions, typecheck, and build.
- [ ] Start a combined demo on `0.0.0.0`, smoke `/api/events`, and exercise all five routes in a browser.
- [ ] Record direct Tailscale URLs and what-to-test lists; move 48–52 to `in-review` only when every advertised control works.
- [ ] Run issue reconciliation so 53–57 promote only after their functional blockers are genuinely done.
