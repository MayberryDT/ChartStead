# 12 — Guided CFP builder visual polish

**What to build:** Bring the organizer guided CFP builder up to ChartStead design-system quality. Ticket 03 made the builder functionally complete (canonical definition, fields, conditions, race-safe save); the UI still reads as a rough internal tool rather than a finished organizer surface.

**Blocked by:** 03 — Guided CFP publishing and submitter follow-up.

**Status:** in-progress

- [ ] Builder layout matches `design/DESIGN.md` and organizer shell patterns (spacing, type scale, panel chrome, no generic “admin form” look).
- [ ] Field cards, add-field controls, and condition controls are visually clear: hierarchy, grouping, and affordances are obvious without SurveyJS vocabulary.
- [ ] Save states (Saved / Unsaved changes / Saving / Save failed + Retry) sit cleanly in the header and remain readable on narrow widths.
- [ ] Preview pane and editor pane feel intentional side-by-side (or stacked on smaller widths) with shared event accent treatment only where design allows.
- [ ] Adding a field always lands the user on the new card (scroll/focus) and keeps keyboard flow usable.
- [ ] Protected vs editable controls are visually distinct without looking disabled-by-accident.
- [ ] Mobile/narrow organizer widths: no horizontal overflow, 44px targets, no clipped focus rings.
- [ ] Public runtime form is already in good shape — do not regress public CFP polish while restyling the builder.
- [ ] Visual QA against design tokens (steel blue secondary CTAs/focus, primary indigo structure, no off-palette purple for controls).

## Comments

Filed from Ticket 03 human QA (2026-08-10): end-user public form is solid after remediation; builder still “pretty bad” and needs a dedicated polish pass. Functional acceptance for Ticket 03 is separate — this ticket is visual/UX quality only.

2026-08-11 — Not agent-ready. Polish work is human-led with an agent in tandem; do not grab this as a solo agent ticket. Same rule for future polish issues.

- 2026-08-13 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-13 — Started with Tyler in tandem alongside Competition 38. Status → in-progress. Builder chrome, step buttons, toasts, and Preview & publish are in this ticket; field-card redesign still open.
- 2026-08-13 — Tyler feedback: strip instructional copy (speakers / required-settings / same-runtime preview blurb); restore 50/50 editor↔preview; differentiate builder (tool surface, blue rail) vs live form canvas (agenda-style desk density). Save status chip in toolbar. Demo: `http://100.105.117.93:5278/demo` → organizer → Forms → open a form.
- 2026-08-13 — Builder chrome landed with Forms desk merge (`6673f7d` on `main`): seg step toggles, field-card Basics/Speakers, AppSelect conditions, Form preview pane. Ticket remains human-tandem for any further field-card redesign.
