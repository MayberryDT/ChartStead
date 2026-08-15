# Public Embed Schedule and Speaker Distinction Implementation Plan

> **Corrective review, 2026-08-15:** The final accepted direction restores a minimal row bookmark in Sessions List, puts My Schedule directly in the filter row with no count strip, reserves inspector width, adds speaker portraits to Session Details, restores the original three-column Speakers List cards, replaces circular List/inspector masks with rounded rectangles, adds restrained blue structure to the Gallery inspector, and prevents Agenda from mounting the shared Session Details inspector. The earlier row-removal and single-column-directory steps below are historical and no longer authoritative; the companion design spec records the final contract.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the required personal schedule with clear inspector-owned actions, make My Schedule functional, differentiate the speaker directory from the portrait gallery, and add restrained ChartStead-blue hierarchy.

**Architecture:** Keep persisted itinerary IDs in the existing PublicProgramPage TanStack Query/Router boundary. PublicProgramRenderer owns only ephemeral inspector choice and renders one reusable schedule inspector plus the existing session inspector. Speaker List and Gallery share selection state and detail behavior but use separate dense-row and portrait-tile discovery components.

**Tech Stack:** React, TypeScript, Base UI Button, TanStack Router/Query state already present, Lucide React, Vitest/Testing Library, Playwright, CSS design tokens.

## Global Constraints

- Keep browser-local itinerary persistence event/revision scoped and URL-backed.
- Use `#081D3A`, `#2F5D98`, and `#E8F1FB`; white remains dominant and gradients are prohibited.
- Speakers List is dense and information-first; Speaker Gallery is portrait-first.
- No attendee accounts, server persistence, organizer Embed Builder work, or ticket status mutations.
- Preserve reduced-motion, keyboard, public-safe field visibility, and publication-revision behavior.

---

### Task 1: Move Sessions List schedule actions into inspectors

**Files:**
- Modify: `src/PublicProgramRenderer.tsx`
- Modify: `src/styles.css`
- Test: `test/ui/public-program.test.tsx`

**Interfaces:**
- Consumes: existing controlled `itinerarySessionIds`, `onItinerarySessionIdsChange`, `itineraryPending`, and `publicProgramCalendarUrl(eventId, sessionIds, revisionId)`.
- Produces: `SessionInspector` add/remove action and `MyScheduleInspector` exact-membership panel.

- [ ] **Step 1: Write failing component tests**

Add tests which render the Sessions List and assert: no row-level itinerary button exists; opening a session exposes `Add … to my schedule`; activating it updates the controlled ID callback; `My schedule (n)` opens an inspector with only selected sessions; and its calendar link contains the exact selected IDs.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/ui/public-program.test.tsx`

Expected: failures for missing inspector schedule action and missing My Schedule panel, while the existing row bookmark assertion fails after the desired contract is encoded.

- [ ] **Step 3: Implement the minimal behavior**

Add ephemeral schedule-inspector state in `PublicProgramRenderer`; pass saved/pending/toggle props to `SessionInspector`; render a Base UI `My schedule (n)` toolbar button for Sessions List; implement `MyScheduleInspector` using exact saved IDs and `publicProgramCalendarUrl`; remove `AtlasSessionRow` save props/control and simplify its grid.

- [ ] **Step 4: Remove the redundant Itinerary action**

Delete `View my itinerary` from `IndexedItinerary` and its obsolete CSS while retaining the visible rail, grid save buttons, direct card-open behavior, and existing persistence.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run test/ui/public-program.test.tsx`

Expected: all tests pass.

### Task 2: Restore a true directory-versus-gallery distinction

**Files:**
- Modify: `src/PublicProgramRenderer.tsx`
- Modify: `src/styles.css`
- Test: `test/ui/public-program.test.tsx`
- Test: `test/e2e/public-embed-regressions.spec.ts`

**Interfaces:**
- Consumes: existing `SpeakerDirectoryButton`, `SpeakerGalleryButton`, persistent speaker selection, and full-height inspector.
- Produces: single-column compact directory rows with a `data-discovery-mode="directory"` boundary and portrait gallery tiles with `data-discovery-mode="gallery"`.

- [ ] **Step 1: Write failing component and browser tests**

Assert Speakers List exposes directory mode without Gallery cards, Gallery exposes gallery mode without directory rows, desktop directory portraits are materially smaller than Gallery portraits, and both surfaces keep a full-height inspector.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run test/ui/public-program.test.tsx && npx playwright test test/e2e/public-embed-regressions.spec.ts`

Expected: the density/portrait-size browser assertion fails against the current two-column card-like directory.

- [ ] **Step 3: Implement the compact directory**

Remove `View profile` arrow copy, render linked sessions as one compact summary, keep 52px avatars, and change Speakers List to a single-column row list. Leave Gallery tile markup and 120px portrait treatment unchanged.

- [ ] **Step 4: Apply restrained ChartStead-blue hierarchy**

Use Schedule Blue for selected rows and inspector header regions, Steel Blue for active/focus accents and small structural rules, and Indigo for headings. Preserve a white dominant canvas and remove unnecessary outer card borders.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx vitest run test/ui/public-program.test.tsx && npx playwright test test/e2e/public-embed-regressions.spec.ts`

Expected: all focused component and browser tests pass.

### Task 3: Cross-surface verification and closeout

**Files:**
- Modify: `docs/qa/2026-08-15-embed-regression-polish-ledger.md`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: durable QA evidence and a clean product commit.

- [ ] **Step 1: Verify cumulative tests**

Run: `npx vitest run test/ui/public-program.test.tsx test/ui/speakers-list-fixture.test.tsx test/ui/agenda-embed-functional.test.tsx`

- [ ] **Step 2: Verify browser regressions**

Run: `npx playwright test test/e2e/public-embed-regressions.spec.ts`

- [ ] **Step 3: Verify compile and production build**

Run: `npm run typecheck && npm run build`

- [ ] **Step 4: Verify live behavior**

Start or reuse the 0.0.0.0:5447 demo, confirm `/api/events` returns JSON 200, inspect Sessions List/My Schedule, Speakers List, Gallery, Itinerary, and narrow layouts, and record exact measurements/screenshots in the ledger.

- [ ] **Step 5: Commit the implementation**

Run `git diff --check`, stage only product, tests, and durable QA documents, then commit with message `Polish public schedule and speaker discovery`.
