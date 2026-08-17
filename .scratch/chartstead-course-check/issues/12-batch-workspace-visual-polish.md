# 12 — Polish every visual layer of the Course Check interaction model

**What to build:** After Course Check 11 locks and ships the out-of-the-way interaction model, human-tandem scan and polish **every visual surface** that model uses — compact confirm, in-place exception interrupt, truthful result, and any related Submissions/desk chrome — so they read as finished Harbor Master Desk UI, not functional leftovers.

**Blocked by:** Course Check 11 — Course Check interaction model (out of the way); Course Check 02 — Batch decisions and shared workspace.

**Status:** in-progress

## Problem

Ticket 11 defines *how* Course Check talks to the user and the logic behind it. Even a correct interaction model can still look unfinished: density, hierarchy, motion, tokens, scan order, and calm severity treatment. This ticket is the visual pass over whatever 11 ships — not a second interaction redesign.

## Goals

- [ ] Inventory every user-visible surface produced or retargeted by Course Check 11 (confirm sheet, exception interrupt, result state, entry chrome, related Settings/Agents copy if still visible).
- [ ] Polish each surface against `design/DESIGN.md` / source-of-truth / organizer desk chrome: spacing, typography, hierarchy, severity without color-only cues, collapsed clean detail vs expanded risk.
- [ ] Batch and single-decision entry chrome match desk density and no longer look bolted on.
- [ ] States and counts (ready / needs action / skipped / drafts / no email sent) are calm and scannable at a glance on desktop; mobile remains legible for status/recovery.
- [ ] No second decision path and no reopening of 11’s interaction decisions unless a visual treatment proves the model unusable (escalate back to 11 / Tyler).

## Surface inventory (from Course Check 11)

1. Submissions status filter chips + Accepted/Denied row flags
2. Batch toolbar Accept / Deny + selection count chrome
3. Inspector committee-leaning footer + Final program outcome panel
4. Compact confirm dialog (`DecisionFinalizeOverlay`)
5. Exception side sheet (wraps `DecisionExceptionReview`)
6. Persistent result banner + resume banner on Submissions
7. Settings “Decision safeguards” card + Speakers add-speaker help copy
8. Demoted `/course-checks/` page chrome (deep link / repair)

## Non-goals

- Redesigning the interaction model, verbs, or clean/exception logic (**Course Check 11**).
- Changing safety-kernel semantics, digests, deferral rules, or stage freshness.
- Solo agent “pretty CSS” without human tandem on the live board.

## Comments

- 2026-08-17 — With 11: warning cards reduced to Accept + Fix; Fix → Agenda with session highlight pulse when the session exists.
- 2026-08-17 — Tyler: during 11 QA, pull visual + placement into this pass with 11 (inspector-hosted review, kill resume banner above table, concise copy, compact buttons). Status → in-progress.
- 2026-08-17 — Course Check 11 → in-review with surface inventory above. This ticket stays human-tandem; still blocked until 11 is done (visual polish of the shipped model).
- 2026-08-17 — Tyler: retarget this ticket. **11** lays out Course Check ↔ user interaction and logic; **12** scans every visual layer of that model and polishes it. Status remains human-tandem. Blocked by 11 (plus historical 02).
- 2026-08-11 — Tyler after Course Check 02 QA: function is fine; the shared batch workspace **looks horrible** and needs a full visual overhaul. Human-tandem only. (Original framing superseded by 2026-08-17 split.)
- Related interaction-model work is Course Check 11; this ticket owns visual polish only.
- 2026-08-17 — frontier-reconcile: Still blocked on: Course Check 11 (in-review).
