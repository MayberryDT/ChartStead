# 11 — Make Decision Course Check feel natural

**What to build:** Polish the Decision Course Check organizer path so accept/decline → review → apply feels like a normal staff action rather than a clunky detour.

**Blocked by:** Course Check 01 — Single Decision Course Check tracer.

**Status:** open

## Problem

Human QA on the Course Check 01 tracer found the path functional once fixed, but the flow still feels awkward: leaving the submissions inspector for a separate workspace, scanning dense plan evidence, and returning without a strong sense of “done and back to work.”

## Goals

- [ ] Keep the consequence review (exact deltas, blockers/warnings, no implicit send) without making ordinary final outcomes feel heavy.
- [ ] Improve entry/exit from submissions: clear next action, less context loss, obvious return to the proposal after apply.
- [ ] Tighten copy and hierarchy so nontechnical staff know what will change and what will not (especially no email).
- [ ] Reduce visual/layout clunk on the Course Check page (shell consistency, scan order, collapsed clean sections).
- [ ] Preserve HTTP/API parity; UX polish must not invent a second decision path.

## Non-goals

- Batch decisions, communication stages, or publication (later Course Check tickets).
- Changing the safety kernel contract or ordinary review dispositions.

## Comments

- 2026-08-11 — Tyler: after Course Check 01 demo QA, file this so we come back once the tracer works. Working is enough for now; natural flow is the follow-up.
