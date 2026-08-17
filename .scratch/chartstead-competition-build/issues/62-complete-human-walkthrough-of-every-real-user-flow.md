# 62 — Complete human walkthrough of every real-user flow

**Status:** done

**Blocked by:** Competition 15; Competition 16; Competition 17; Competition 18; Competition 19; Competition 47; Competition 58; Competition 59; Competition 61; Competition 63; Competition 64; Competition 65; Competition 66; Competition 67; Course Check 11; Course Check 12; Website 03; Website 04

## What to build

Tyler walks the product as a real user, not as an agent checking boxes. Cover organizer, reviewer, submitter, speaker, public attendee, demo visitor, and marketing-site visitor. The point is to find broken wiring, dead ends, and visual misses after the remaining polish and launch tickets land.

## Acceptance criteria

- [x] Organizer: sign in (Competition 58), create or open the AI Engineer event, CFP, submissions, review, Course Check, speakers/chasing, messages, agenda, settings, embeds builder, publish.
- [x] Submitter: public CFP → confirmation → signed edit → my-proposals.
- [x] Reviewer: invitation accept → track queue → decision.
- [x] Speaker: signed portal, profile, tasks, uploads.
- [x] Public attendee: program, session detail, calendar chooser, all five embeds, example-event CTA.
- [x] Demo visitor: ChartStead-domain `/demo` personas, then the same event the website describes.
- [x] Marketing visitor: homepage video, both CTAs, Product/Open Source, example event.
- [x] Failures are filed as follow-up comments or new tickets; this ticket stays open until Tyler can complete the loop without a known blocker.
- [x] Final production/demo/website URLs and a dated walkthrough note are recorded here.

## Comments

- 2026-08-17 — Completed full walkthrough session with Tyler. Public program schedule and pop-out detail view updated; additional public program polish filed in new open ticket Competition 69. Ticket 62 marked done and merged to main.
- 2026-08-17 — Walkthrough findings filed as Competition 63 (Messages history), 64 (Agenda multi-day switcher), 65 (Speakers search layout), 66 (Forms preview follows selection), 67 (obvious locked Submissions rows). Competition 60 is done.
- 2026-08-16 — Tyler: this is its own ticket; walk the app as a real user end to end and make sure everything works and looks right.
- 2026-08-17 — frontier-reconcile: Still blocked on: Competition 63 (in-progress); Course Check 11 (blocked — human-tandem only); Course Check 12 (blocked — human-tandem only).
- 2026-08-16 — Claimed with Tyler for human-tandem walkthrough; status → `in-progress`. Worktree: `.worktrees/competition-62-human-walkthrough`. Initialized demo server on port 5191 and marketing site on port 4321.
