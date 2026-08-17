# 64 — Make the Agenda day switcher fit every event date

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

The organizer Agenda top-left day control is a two-slot toggle. It does not fit more than one or two dates, so multi-day events clip or hide days. Competition 61’s AI Engineer World's Fair is four days (June 29–July 2); even a two-day event already strains the box.

Organizers must be able to reach every event day. Replace or rebuild the toggle so the dates fit. Do not change placement, conflicts, or auto-place semantics.

## Acceptance criteria

- [ ] Every event day is visible or otherwise reachable from the Agenda toolbar (2-day and 4-day events).
- [ ] The day control does not clip, overflow the top-left box, or look like a binary toggle when there are more than two dates.
- [ ] Selecting a day still shows that day’s grid, counts, and “selection on another day” cue.
- [ ] Keyboard and 44px targets hold; no page-level horizontal overflow at desktop organizer width.
- [ ] Focused UI tests cover a 4-day event (June 29–July 2) and a 2-day event.
- [ ] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler walkthrough: Agenda is just a toggle; the top-left date box does not fit more than one date. Multi-day events are not supported by the current control.
