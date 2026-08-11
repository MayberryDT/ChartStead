# 11 — Make Decision Course Check feel natural

**What to build:** Polish the Decision Course Check organizer path so accept/decline → review → apply looks and feels like a normal staff action rather than a clunky, ugly detour.

**Blocked by:** Course Check 01 — Single Decision Course Check tracer.

**Status:** blocked — human-tandem only (not agent-ready)

## Problem

Human QA on the Course Check 01 tracer confirmed the path **works**, but both the **flow** and the **look** are poor:

- Leaving the submissions inspector for a separate workspace feels awkward.
- The Course Check screen itself looks bad / unfinished (layout, hierarchy, density, missing organizer-shell polish).
- Scanning dense plan evidence is hard; return after apply lacks a clear “done and back to work” moment.

Function is good enough to continue the spine. Visual + flow polish is deferred here.

## Goals

- [ ] Keep the consequence review (exact deltas, blockers/warnings, no implicit send) without making ordinary final outcomes feel heavy.
- [ ] Improve entry/exit from submissions: clear next action, less context loss, obvious return to the proposal after apply.
- [ ] Tighten copy and hierarchy so nontechnical staff know what will change and what will not (especially no email).
- [ ] Fix the visual design of the Course Check page: organizer shell consistency, spacing, typography, scan order, collapsed clean sections, evidence hierarchy that matches design system.
- [ ] Preserve HTTP/API parity; UX polish must not invent a second decision path.

## Non-goals

- Batch shared-workspace visual overhaul (Course Check 12).
- Communication stages or publication (later Course Check tickets).
- Changing the safety kernel contract or ordinary review dispositions.

## Comments

- 2026-08-11 — Tyler: after Course Check 01 demo QA, file this so we come back once the tracer works. Working is enough for now; natural flow is the follow-up.
- 2026-08-11 — Tyler: Course Check works end-to-end now, but the screen **looks horrible**. Fold look + flow into this one issue; continue spine and return later.
- 2026-08-11 — After Course Check 02 ship: batch/shared workspace visual overhaul is **12** (human-tandem). This ticket stays single-decision entry/exit + flow.
- 2026-08-11 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
