# 66 — Make the Forms preview follow the selected form

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

The Forms tab right pane is supposed to preview the form selected in the list. Tyler’s walkthrough: changing the selection never changes the preview; it is always the same form.

Selecting a row must show that form’s name and definition. Do not change builder, publish, or draft-versus-published semantics.

## Acceptance criteria

- [ ] Clicking a different form in the list updates the right preview to that form (name, fields, welcome copy).
- [ ] A stale previous preview is not left looking like the current selection; show a clear swap or loading state while the new form loads.
- [ ] Invalid drafts still explain that they cannot preview; that empty state is for the selected form only.
- [ ] Focused UI tests use two forms with different names/fields and assert the preview matches the selection.
- [ ] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler walkthrough: Forms preview on the right never changes when selecting different forms. It is supposed to preview the selected form.
