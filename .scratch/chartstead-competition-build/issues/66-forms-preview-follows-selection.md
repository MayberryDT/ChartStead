# 66 — Make the Forms preview follow the selected form

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

The Forms tab right pane is supposed to preview the form selected in the list. Tyler’s walkthrough: changing the selection never changes the preview; it is always the same form.

Selecting a row must show that form’s name and definition. Do not change builder, publish, or draft-versus-published semantics.

## Acceptance criteria

- [x] Clicking a different form in the list updates the right preview to that form (name, fields, welcome copy).
- [x] A stale previous preview is not left looking like the current selection; show a clear swap or loading state while the new form loads.
- [x] Invalid drafts still explain that they cannot preview; that empty state is for the selected form only.
- [x] Focused UI tests use two forms with different names/fields and assert the preview matches the selection.
- [x] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler QA approved. Merged to `main`. Status → done.

- 2026-08-16 — Tyler QA: forms preview is fine. Keeping as-is on combined review demo http://100.105.117.93:5870/e/ai-engineer-worlds-fair-2026/forms

- 2026-08-16 — Claimed for unsupervised agent batch (Competition 63–67). Worktree: `.worktrees/competition-66-forms-preview`.

- 2026-08-17 — Tyler walkthrough: Forms preview on the right never changes when selecting different forms. It is supposed to preview the selected form.

- 2026-08-17 — Ready for human QA. Root cause: `FormInspector` used `keepPreviousData` so the prior SurveyJS preview stayed mounted as if it were the new selection, and the pane never surfaced `form.name` (demo forms also share identical default definitions). Fix: drop placeholder reuse, key inspector/`CfpRuntime` by selected `formId`, show loading instead of stale preview, and render name + welcome in the inspector chrome. Demo: `http://100.105.117.93:5866/demo` → Forms. What to test: (1) select Lightning talks vs Main CFP vs Workshop CFP — preview header name updates; (2) while a slow load would show “Loading form…”, cached switches clear the previous survey immediately; (3) open an invalid draft if present — empty state is for that row only; (4) builder/publish entry points unchanged.
