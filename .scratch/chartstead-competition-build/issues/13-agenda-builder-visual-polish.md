# 13 — Agenda builder visual polish

**What to build:** Bring the organizer fluid agenda workspace up to ChartStead design-system quality. Ticket 08 made placement, conflicts, TBD, drag, keyboard Move Session, and calendar intent functionally complete; the schedule surface still needs a dedicated visual/UX polish pass so day navigation, pool, grid, and inspector read as one intentional Harbor Master Desk tool.

**Blocked by:** 08 — Fluid agenda builder.

**Status:** blocked — human-tandem only (not agent-ready)

- [ ] Day tabs, counts, and toolbar hierarchy are immediately scannable (joined segmented day control, clear selected day, no “unstyled button” look).
- [ ] Unplaced pool and grid session cards match schedule-block language: track pastel, left accent, dense type, no pills, no action buttons on the drag surface.
- [ ] Inspector is the sole home for Move Session / placement form; selecting a card makes the next keyboard action obvious.
- [ ] Partial TBD placement (room without time, time without room) is understandable in pool + inspector without inventing completeness.
- [ ] Placed sessions that land on another day are discoverable (selected-day affordance or “on another day” cue) so form placement does not feel like a disappearance.
- [ ] Conflict panel uses error-container treatment only on affected records; repair actions stay compact and non-modal.
- [ ] Grid density, drop-target feedback, and empty cells feel precise rather than sparse or accidental.
- [ ] Mobile/narrow organizer widths: usable stack, 44px targets, no horizontal overflow on the day/room grid chrome.
- [ ] Visual QA against `design/DESIGN.md` (no pills rule, schedule tokens, shell patterns).

## Comments

Filed from Ticket 08 human QA (2026-08-11): drag/drop, counts, conflict persistence, and keyboard move work; day tabs, pills, card chrome, and overall agenda readability need a human-led polish pass. Functional acceptance for Ticket 08 stays separate — this ticket is visual/UX quality only.

Same rule as Ticket 12: not solo agent-ready; polish is human-tandem.

- 2026-08-13 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
