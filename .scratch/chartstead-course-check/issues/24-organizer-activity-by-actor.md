# 24 — Organizer activity by actor (per-user history)

**What to build:** Let organizers see consequential actions attributed to a specific person — not only per-entity history on a proposal or speaker. Include fixing speaker onboarding history so actor names are visible where they are already stored.

**Blocked by:** Course Check 11 — Course Check interaction model (out of the way).

**Status:** done

## Problem

During Course Check 11 grilling we locked per-proposal Review history clarity into 11, and deferred a broader need: organizers must see **what different users did** across the event.

Today:

- Proposal Review history shows `actorName` per event (soft lean + Course Check apply).
- Speaker onboarding history often stores `actorId` / `actorName` but the UI does not reliably surface who acted.
- There is **no** organizer-wide “actions by user X” view (or filter-by-actor across the desk).

Without that, accountability for Accept/Deny, drafts, sends, and onboarding edits stays buried inside individual records.

## Goals

- [x] Organizer can open or filter an activity view for a chosen team member / actor and see their consequential actions (at minimum: proposal soft leans, final Accept/Deny applies, related Course Check stage outcomes).
- [x] Speaker (and related) entity history UIs show actor attribution where the data already exists.
- [x] Activity remains permission-aware (non-admins must not see other reviewers’ private audit beyond existing policy).
- [x] Plain business language; do not revive Course Check ceremony as the primary framing.

## Non-goals

- Reworking the Course Check 11 in-place Accept/Deny interaction model.
- Visual polish of decision finalize surfaces (**Course Check 12**).
- Full SIEM / export-grade audit product.

## Origin

Course Check 11 grilling Round 4 — **Q15 A+C**: proposal history clarity in 11; organizer-wide “actions by user X” (and speaker actor labels) as a **separate later ticket**.

## Comments

- 2026-08-17 — Tyler confirmed QA; closed to done. Client-side Activity links. Merged on main.

- 2026-08-17 — Expanded Activity to a unified team feed: proposal audits, onboarding, agenda placements, Course Check mutations, evaluation-plan audits, and speaker CSV imports. UI uses summary/label rows + Load more (limit 50). AEWF seed team-activity-v2. Worker 5/5 + UI 2/2.

- 2026-08-17 — Expanding Activity API beyond proposal audits: unified `OrganizerTeamActivityEntry` merge across audit_events, onboarding_history, agenda, course_check_mutations, evaluation_plan audits, and speaker_imports (`listTeamActivityByActor`). Backend-only this pass; UI agent follows.

- 2026-08-17 — Implemented Settings → Activity (team-member filter over proposal audits: soft leans, final Accept/Deny, related follow-through), permission-aware GET /organizer/activity, and onboarding History “by {actorName}”. Worker 4/4 + UI 2/2. Demo: http://100.105.117.93:5824/e/pacific-open-data-summit-2026/settings — ready for human QA (`in-review`).

- 2026-08-17 — Claimed by agent for implementation (organizer activity-by-actor + speaker onboarding actor labels).

- 2026-08-17 — Course Check 11/12 → `done`; blockers cleared → `ready-for-agent`. Tyler deferred starting this ticket for now.
- 2026-08-17 — Filed from Course Check 11 grilling closeout (Tyler asked where the deferred ticket went). Blocked on 11 until that interaction model is done.

- 2026-08-17 — frontier-reconcile: Still blocked on: Course Check 11 (in-review).
