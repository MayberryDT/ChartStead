# Public embed regression polish — 2026-08-15

## Baseline diagnosis

- Speaker Gallery selection dropped `fixture=signal-rail` from TanStack Router search. The renderer switched datasets and all fixture portraits became broken API asset URLs.
- The Gallery's fake `#speaker-*` profile link caused hash navigation with no destination.
- Speakers List rendered its profile after the complete directory, below the fold, instead of in a persistent desktop inspector.
- Sessions selection only changed URL/outline state; it exposed no session detail surface. A decorative square looked like a non-functional checkbox.
- Itinerary session cards only exposed save actions and retained an unnecessary upper-left ChartStead mark.
- Agenda rows relied on dense fixed column assumptions and nested visual wrappers around Base UI selects.

## Pass 1

- Preserve the fixture query key through every Router update.
- Keep Gallery inspector persistent and remove the fake profile link/reset affordance.
- Give Speakers List a compact directory + sticky right inspector, distinct from Gallery's portrait grid.
- Add a shared animated session inspector for Sessions and Itinerary.
- Separate open-details and save actions; remove the decorative checkbox and itinerary header brand.
- Replace the sessions search glyph with a real local SVG and flatten Agenda/Itinerary select wrappers.
- Make Agenda rows content-sized and clipped to their own stacking context.

## Verification targets

- Gallery portraits remain loaded after multiple selections; URL keeps `fixture=signal-rail`; scroll position does not jump.
- Speakers List inspector is alongside the directory at desktop width.
- Sessions and Itinerary open session details from session controls while save remains independent.
- Agenda row bounds never intersect at 1536×1024 and 390×844.
- All focused tests, typecheck, production build, JSON API smoke, and Tailscale listener pass.

## Final evidence

- Gallery after selection: `fixture=signal-rail` retained, 0 broken images, scroll Y remained 0, fake hash link absent.
- Speakers List at 1536×1024: directory x=32–1060; persistent inspector x=1074–1494. The two surfaces are adjacent with no intersection.
- Sessions search: input x=28–701; SVG icon x=42–62 and vertically centered. Session inspector x=1106–1536.
- Itinerary: upper-left brand absent; three direct Base UI select roots; session inspector x=1106–1536.
- Agenda: 9 desktop rows, 0 intersections, 0 overflowing rows, 0 nested `.agenda-select` wrappers; narrow 390×844 also has 0 intersections and 0 overflowing rows.
- Focused UI tests: 21/21.
- `npm run typecheck`: pass, including Wrangler bindings freshness.
- `npm run build`: pass; only the existing large-chunk advisory remains.
- `/api/events`: JSON HTTP 200. Dev listener: `0.0.0.0:5447`.

## Correction pass 2 — attached-image findings

The attached 1873×923 screenshot exposed a verification gap: the prior collision check targeted Agenda list rows, while the visible collision was in the Itinerary time-by-room grid. Direct browser geometry found 12 intersecting card pairs after opening the session inspector.

| Component | State | Transition decision | Correction | Verification | Score | Status |
|---|---|---|---|---|---:|---|
| Itinerary grid | Inspector open, 1873×923 | No transition fit; geometry only | Removed fixed 70px time-row/card heights; rows and cards now expand with content | Playwright intersection count 12 → 0 | 100 | Passing |
| Sessions row | Default, hover, focus, open | Existing inspector reveal only | Removed View button and arrows; one invisible accessible target covers the full row while bookmark remains independent | Overlay bounds 1472×87.5 inside row 1480×89.5; component interaction test | 98 | Passing |
| Speakers List inspector | Desktop | Existing reduced-motion-safe panel reveal | Inspector is fixed to the right edge and fills available viewport height, matching Gallery behavior | x=1056, y=0, 480×980 at 1536×1024 | 96 | Passing |
| Speaker Gallery inspector | Speaker switch | No replay on content replacement | Removed speaker-key remount so the same inspector DOM node survives selection changes | Component identity regression test | 98 | Passing |
| Public embed search icons | Sessions, Speakers List, Gallery, Itinerary | No transition fit | Replaced improvised glyphs/CSS drawing with Lucide `Search` | Component tests find `.lucide-search`; browser visual inspection | 97 | Passing |

Pass-2 regression coverage: `test/e2e/public-embed-regressions.spec.ts` plus focused component tests in `test/ui/public-program.test.tsx`.

## Correction pass 3 — schedule clarity and speaker-surface distinction

The personal schedule is retained because rubric criteria EMB-10 and EMB-11 require exact add/remove membership, reload persistence, and combined calendar export. The core build plan only names a minimal public schedule, and the available Sessionboard reference pack does not establish this as a Sessionboard-parity requirement.

| Component | Before | Correction | Verified result |
|---|---|---|---|
| Sessions List | Bookmark control repeated on every row | Removed row bookmarks; Session Details owns the labeled add/remove action | 0 `.atlas-save` controls; controlled callback coverage passes |
| My Schedule | No functional view; Itinerary button only scrolled to its already-visible rail | Added `My schedule (n)` inspector with exact selected membership, removal, session-detail opening, and combined ICS export | Component test proves exact `ses-1` membership and export URL; 390px inspector occupies the full viewport |
| Schedule Itinerary | Redundant `View my itinerary` action appeared inert | Removed the action; the existing saved-session rail remains the itinerary view | 0 matching buttons; card intersection regression remains 0 |
| Speakers List | Two-column 96px portrait cards visually converged with Gallery | Converted to alphabetized single-column 52px directory rows with compact identity/session metadata | First row 52px portrait and 106.8px height at 1536px; full-height 480px desktop inspector |
| Speaker Gallery | Portrait-first grid lacked enough selected-state contrast | Kept the 120px four-column portrait system and added a pale-blue selected tile/inspector band | Gallery portraits measure 120px and remain visually distinct from directory rows |
| Color hierarchy | Predominantly undifferentiated white surfaces | Added design-token Indigo, Steel Blue, and Schedule Blue to quiet headers, selected rows, focus, and primary schedule actions | Selected directory row computes to `rgb(232, 241, 251)` (`#E8F1FB`); white remains dominant |
| Narrow speaker inspector | Stacked inspector inherited inner padding and measured only 334px wide | Centered a 100vw inspector within the narrow layout | Playwright verifies x ≤ 1 and width ≥ 389 at 390×844 |

### Pass-3 verification

- Focused component suites: 23/23 across public program, Speakers List fixture, and Agenda functionality.
- Browser regressions: 4/4, covering itinerary intersections, desktop inspector height, list/gallery density, and narrow inspector width.
- `npm run typecheck`: pass, including Wrangler bindings freshness.
- `npm run build`: pass; only the existing large-chunk advisory remains.
- Visual evidence: `.scratch/qa/embed-schedule-speaker-distinction/` (local QA captures).
- Repository-wide `npm test`: UI reached 163/167 and stopped on four pre-existing organizer-app assertions in `test/ui/app.test.tsx` (empty-event onboarding copy, speaker-announcement missing-address copy, duplicate `Submissions` headings, and proposals sort URL). This pass changes only public embed renderer/styles/tests; the scoped suites above are green. Because the UI command failed, the aggregate script did not proceed to worker or broad E2E stages.
