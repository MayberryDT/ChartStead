# 01 — Fix conditional CFP field reactivity

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Make published and preview CFP forms recompute conditional-field visibility whenever the controlling format, track, or answer changes. A dependent field must appear only while its condition is true, disappear again when the answer changes, and never leave stale hidden values in organizer-visible submission data unless the form explicitly preserves them.

## User stories covered

- Rubric criterion CFP-02.

## Acceptance criteria

- [x] A builder can configure a field to appear for one selected format or track value.
- [x] The same condition behaves identically in preview and the logged-out public form.
- [x] Changing the controlling answer in either direction immediately updates field visibility.
- [x] A hidden required field cannot block submission, and stale hidden values are handled consistently and documented.
- [x] Focused UI and submission-validation tests cover show, hide, switch-back, validation, and persisted organizer output.

Hidden conditional answers are cleared as soon as SurveyJS hides them and are independently ignored and stripped by server-side validation. They are never persisted to organizer-visible submission data.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created from the strict competition rubric audit and the conditional-field defect observed in the completed evaluator run.
- 2026-08-12 — Started in isolated worktree for conditional CFP reactivity implementation and review.
- 2026-08-12 — Ready for QA: SurveyJS clears hidden values in preview, public, and edit runtimes; server validation also drops stale hidden values before persistence. Focused runtime, builder, and submission tests pass; typecheck and production build pass.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
