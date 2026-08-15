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
