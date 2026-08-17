# 64 — Make the Agenda day switcher fit every event date

**Status:** in-review

**Blocked by:** None — can start immediately.

## What to build

The organizer Agenda top-left day control is a two-slot toggle. It does not fit more than one or two dates, so multi-day events clip or hide days. Competition 61’s AI Engineer World's Fair is four days (June 29–July 2); even a two-day event already strains the box.

Organizers must be able to reach every event day. Replace or rebuild the toggle so the dates fit. Do not change placement, conflicts, or auto-place semantics.

## Acceptance criteria

- [x] Every event day is visible or otherwise reachable from the Agenda toolbar (2-day and 4-day events).
- [x] The day control does not clip, overflow the top-left box, or look like a binary toggle when there are more than two dates.
- [x] Selecting a day still shows that day’s grid, counts, and “selection on another day” cue.
- [x] Keyboard and 44px targets hold; no page-level horizontal overflow at desktop organizer width.
- [x] Focused UI tests cover a 4-day event (June 29–July 2) and a 2-day event.
- [x] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler QA: reject boxed/seg day control (“don’t wrap a box around these buttons; drop them on the toolbar”). Also fix broken public agenda embed day tabs. Reworked organizer control to plain toolbar `btn` day switches (no `.seg` card). Embed: day strip uses auto columns + `max-content` controls column (was fixed 270px / 1fr 1fr). Combined demo: http://100.105.117.93:5870/e/ai-engineer-worlds-fair-2026/agenda — embed: http://100.105.117.93:5870/e/ai-engineer-worlds-fair-2026/program/agenda and http://100.105.117.93:5870/fixtures/agenda-embed

- 2026-08-16 — Claimed for unsupervised agent batch (Competition 63–67). Worktree: `.worktrees/competition-64-agenda-day-switcher`.

- 2026-08-17 — Tyler walkthrough: Agenda is just a toggle; the top-left date box does not fit more than one date. Multi-day events are not supported by the current control.

- 2026-08-17 — in-review. Root cause: public-embed CSS forced `.agenda-day-tabs { grid-template-columns: 1fr 1fr }`, and organizer `.seg { overflow: hidden }` plus a squeezable toolbar column clipped day buttons past two. Fix: scrollable Harbor Ledger segmented day tabs that scale with `days.length` (44px targets, arrow-key tablist), plus the public embed auto-columns rule. Placement/conflicts/auto-place untouched.

**Demo:** http://100.105.117.93:5864/e/ai-engineer-worlds-fair-2026/agenda  
**2-day compare:** http://100.105.117.93:5864/e/pacific-open-data-summit-2026/agenda  

**What to test**
1. World's Fair Agenda: confirm four day tabs (Mon Jun 29–Thu Jul 2) are all visible/reachable; none clipped as a binary toggle.
2. Click each day — grid and counts update for that day.
3. Select a placed session on day 2, switch to day 1 — day 2 keeps the “selection elsewhere” underline cue.
4. Keyboard: focus the day tablist, ArrowLeft/ArrowRight (and Home/End) move selection; targets are 44px.
5. At desktop organizer width, page does not grow a horizontal scrollbar from the day control.
6. Optional: Pacific Open Data Summit Agenda still shows a clean two-day control.
