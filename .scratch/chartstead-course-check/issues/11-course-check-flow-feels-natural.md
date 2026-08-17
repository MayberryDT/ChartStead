# 11 — Course Check interaction model (out of the way)

**What to build:** Redesign how Decision Course Check interacts with the organizer so the safety kernel stays, the ceremony dies, and ordinary finalize feels like normal desk work. Implement the locked interaction model below end to end (logic + language + chrome cleanup). Visual polish of the resulting surfaces is **Course Check 12**.

**Blocked by:** Course Check 01 — Single Decision Course Check tracer.

**Status:** in-review

**Demo:** http://100.105.117.93:5811/demo → Enter as organizer → Submissions

## Problem

The spine shipped a working safety kernel, but the organizer experience still leaks that machinery as a separate journey (or leftover controls that assume one). Staff should never “go do Course Check.” Course Check should protect the business action.

A second confusion: soft committee leaning (`approve` / `deny`) and final program outcomes (`accepted` / `declined`) share overlapping words, while “Locked” and missing batch checkboxes secretly mean “Course Check already applied.” That is unintelligible.

Research lock: `.research/chartstead-course-check-ux-research.md` — **Keep the safety kernel. Remove the safety ceremony.**

## Locked interaction model (grilling complete — implemented)

### North star

- Course Check is a **background safety service**, not a destination or primary verb.
- One business action → compact confirm when clean / in-place interrupt when dirty → one explicit commit → one truthful result.
- **11** = interaction model + logic + language wiring. **12** = polish every visual layer of what 11 ships.

### Decision language (two layers)

| Layer | Human labels | Behavior |
| --- | --- | --- |
| Soft (committee lean) | **Unreviewed · Recommend · Not recommend** | Immediate; **not** Course Check. **Maybe removed** from product language. |
| Final (program outcome) | Buttons **Accept** / **Deny** → status **Accepted** / **Denied** | Runs Course Check; **this is the lock**. No separate “Locked” status. |

- Selectable for finalize only when no final outcome yet; UI explains why a row isn’t selectable.
- After finalize: **hide/disable** soft controls; status shows only Accepted/Denied.
- History keeps past soft votes + Course Check apply with actors.
- Existing stored `maybe` → show as **Unreviewed**.
- Rename depth: humans-read surfaces; storage enums mapped (`approve`/`deny`/`accepted`/`declined`/`maybe`).

### Finalize flow (Accept / Deny, single or batch)

1. Staff select eligible proposals → **Accept** or **Deny**.
2. Kernel plans in the background (no navigate to `/course-checks/…` as primary path).
3. **Clean:** compact confirmation overlay.
4. **Dirty:** side sheet with exception review.
5. **Commit:** decisions + cascade + prepare drafts; never send.
6. **Result:** persistent banner on Submissions.
7. Close mid-review → resume banner.
8. `/course-checks/$planId` remains for deep-link / agents / repair.

## Goals

- [x] Implement the locked interaction model above (confirm + side sheet + result + resume).
- [x] Retarget Submissions single + batch Accept/Deny so staff never enter a branded Course Check journey as the primary path.
- [x] Remove/rewrite leftover Course Check–ceremony chrome to match the model.
- [x] Wire two-layer decision language across the app; remove fake **Locked** status; map enums; drop Maybe from UI.
- [x] After finalize: hide/disable soft controls; status = Accepted/Denied; Review history wording clear for soft + Course Check apply.
- [x] Truthful consequences: blockers vs warnings; **No emails were sent** when drafts prepared.
- [x] HTTP/API / kernel parity — presentation adapter, not a second decision path.
- [x] Hand **12** a concrete surface inventory ready for visual polish.

## Surfaces for Course Check 12 (visual polish inventory)

1. Submissions status filter chips (Unreviewed / Recommend / Not recommend) + Accepted/Denied row flags
2. Batch toolbar Accept / Deny + selection count chrome
3. Inspector committee-leaning footer + Final program outcome panel
4. `DecisionFinalizeOverlay` compact confirm dialog
5. `DecisionFinalizeOverlay` exception side sheet (wraps `DecisionExceptionReview`)
6. Persistent result banner + resume banner on Submissions
7. Settings “Decision safeguards” card (if reachable) + Speakers add-speaker help copy
8. Demoted `/course-checks/` page chrome still reachable via deep link (eyebrow/title density)

## What to test

- [ ] Soft buttons are Recommend / Not recommend / Unreviewed — no Maybe; no Locked filter
- [ ] Finalized rows show Accepted or Denied; checkbox missing with clear title; soft footer hidden
- [ ] Single Accept / Deny opens in-place confirm (clean) or inspector review (dirty) — does **not** navigate away as the primary path
- [ ] Dirty warning cards show only **Accept** and **Fix** (no Keep / Skip / Change placement clutter)
- [ ] Fix for placement opens Agenda **without** a full page reload; grid looks correct (rooms as columns)
- [ ] Fix for placement opens Agenda (highlights session when it already exists) + Return to decision review
- [ ] Batch Accept / Deny same behavior; counts in confirm, not toolbar verb
- [ ] Apply prepares drafts; result is a toast; no emails sent
- [ ] Cancel discards the review; Fix persists and resumes when returning
- [ ] Review history distinguishes committee leaning vs final outcome apply

## Non-goals

- Visual polish / design-system pass (**Course Check 12**).
- Mandatory Course Check desk tab / attention inbox as the default exception home.
- Storage enum migration; kernel contract changes; ordinary soft disposition *permissions* reshuffle.
- Publication / Airtable / full send redesign; per-user global activity feed.

## Comments

- 2026-08-17 — Tyler QA: Fix used hard `<a href>` (full reload) + agenda grid CSS was missing since Ticket 17. Restored `.agenda-layout` CSS; Fix/Return now client-navigate via TanStack (same pattern as sidebar). Research: `.scratch/chartstead-course-check/research-in-app-deeplink-navigation.md`.
- 2026-08-17 — Tyler QA: warning cards → only **Accept** + **Fix**; Fix routes to Agenda (session highlight when possible) / source record; footer Accept/Cancel apply or discard all. Resume only after Fix return.
- 2026-08-17 — QA fix pass: finalize lives in **inspector** (table viewport untouched); resume banner removed (close discards); results are **toasts**; copy/buttons shortened; compact exception review. Course Check 12 in-progress with 11.
- 2026-08-17 — Tyler QA: review must live in inspector (not table viewport); kill resume banner (auto-discard on close; toasts only); cut slop copy; compact buttons. Doing visual polish with Course Check 12 in same pass. Status stays in-review / building.
- 2026-08-17 — Filed **Course Check 24** (organizer activity by actor / per-user history + speaker actor labels) — the deferred Q15 later ticket from grilling.
- 2026-08-17 — Implementation ready for human QA. Demo http://100.105.117.93:5811/demo. Status → in-review. Surface inventory handed to 12.
- 2026-08-17 — Tyler: confirm — build. Implementing locked interaction model.
- 2026-08-17 — Tyler: Round 6 — Q20 **A**; Q21 **A**. Grilling complete.
- 2026-08-17 — Tyler: Rounds 1–5 locked (research north star; compact confirm; side sheet; 11=model / 12=visuals; Recommend/Not recommend vs Accept/Deny; drop Maybe; strip ceremony).
- 2026-08-17 — Tyler named Course Check 11 in session; status → in-progress.
- 2026-08-11 — Original notes superseded by 2026-08-17 model.
