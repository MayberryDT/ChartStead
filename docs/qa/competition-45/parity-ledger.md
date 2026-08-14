# Competition 45 — Schedule Itinerary parity ledger

Reference: `design/source-of-truth/embeds/schedule-itinerary.png` (1536×1024)

Capture command:

`npx playwright screenshot --viewport-size=1536,1024 --wait-for-timeout=500 http://127.0.0.1:5445/fixtures/itinerary-embed docs/qa/competition-45/itinerary-final-1536x1024.png`

## Iteration 1

- Structure: time-by-room grid, fixed itinerary rail, event heading, filters, room headers, time axis, saved card, legend, and footer were present.
- Mismatches: rows were too tall to fit the working day; track legend inherited unrelated global backgrounds; only one day tab was visible; track cards were predominantly blue.
- Corrections: tightened row/card geometry, reset legend surfaces, added a stable second-day fixture, and mapped all six fixture track IDs to their intended pastel treatments.

## Iteration 2

- Structure/alignment: matched the reference's 280px folio rail and four-room grid; controls and column divisions aligned cleanly.
- Mismatches: the final two schedule rows fell below the 1024px capture and card copy was slightly oversized for the target density.
- Corrections: set deterministic 70px time rows, border-box cards, and compact card typography while preserving 44px interactive controls.

## Iteration 3 — final

- Final evidence: `itinerary-final-1536x1024.png`.
- Vision comparison: no meaningful remaining mismatch in overall Indexed Folio structure, rail/grid alignment, scale, spacing, typography hierarchy, token colors, borders, control placement, selected bookmark state, or program density. Incidental fixture copy and the exact generated-mark raster are non-authoritative under the embed SOT contract; the implementation uses the ChartStead wordmark treatment and public-safe deterministic copy.
- State coverage inspected: saved/unsaved, breaks, schedule gaps, overlaps, pending/TBD, empty filter result, disabled itinerary action, focus-visible controls, and narrow reflow.

Iterations: **3**.
