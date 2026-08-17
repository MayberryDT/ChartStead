# 12 — Batch Course Check workspace visual overhaul

**What to build:** A complete visual and interaction overhaul of the shared Decision Course Check workspace from Course Check 02 so batch review, deferral, evidence scanning, and apply feel like deliberate ChartStead product UI rather than a functional scaffold.

**Blocked by:** Course Check 02 — Batch decisions and shared workspace.

**Status:** blocked — human-tandem only (not agent-ready)

- [ ] Course Check page uses the organizer shell language (Harbor Master Desk): top context, clear primary action, restrained panels, design tokens from `design/DESIGN.md` / source-of-truth.
- [ ] Locked evidence order is visually scanable: irreversible → people → public → operational → integration → internal, with clean sections quietly collapsed and risk sections unmistakably expanded.
- [ ] Batch item list, defer controls, follow-up queue, mutation history, and Apply decision hierarchy read at a glance on desktop; mobile remains legible for status/recovery.
- [ ] Multi-select batch entry from submissions matches shell density and does not look bolted on.
- [ ] States Draft / Needs review / Ready / In progress / Partially complete / Needs attention / Complete / Superseded / Out of date have distinct, calm visual treatment.
- [ ] No second decision path: polish stays on the existing HTTP/API Course Check contract.

## Non-goals

- Changing safety-kernel semantics, digests, deferral rules, or stage freshness.
- Communication, calendar, publication, or Airtable Course Check surfaces (later tickets).
- Solo agent “pretty CSS” without human tandem on the live board.

## Comments

- 2026-08-11 — Tyler after Course Check 02 QA: function is fine; the shared batch workspace **looks horrible** and needs a full visual overhaul. Human-tandem only.
- Related single-decision flow polish remains Course Check 11; this ticket owns the batch/shared workspace surface shipped in 02.

- 2026-08-17 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
