# 13 — Inspect and download speaker deliverables

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Complete the organizer side of the existing task-upload path. Speakers must see accepted file types and size limits at the point of upload, and organizers must be able to inspect the resulting task attachment, metadata, preview where safe, and download the stored object through authorized routes.

## User stories covered

- Rubric criteria SPK-10 and CNT-06.

## Acceptance criteria

- [x] File-request tasks carry or resolve documented accepted MIME types, extensions, and maximum size.
- [x] The speaker upload control displays those constraints before file selection and returns actionable validation errors.
- [x] Organizer speaker/task detail shows file name, type, size, upload time, uploader, task, speaker, and session context.
- [x] Authorized organizers can preview supported media and download the original object; unauthorized and cross-event access is rejected.
- [x] Replacing a task attachment updates the organizer-visible latest attachment without losing audit evidence needed by Rubric 14.
- [x] Tests cover constraint display/enforcement, metadata, download authorization, replacement, and event isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created around the existing R2/task upload path; it must not introduce a second asset store.
- 2026-08-12 — Started in isolated worktree for deliverable constraints, inspection, and authorized download implementation and review.
- 2026-08-12 — Ready for human QA at `http://100.105.117.93:5205/e/pacific-open-data-summit-2026/speakers`. Test task constraint copy and validation in the speaker portal, then inspect the latest task file metadata, preview, and download in the organizer speaker detail. Focused UI 1/1 and worker 6/6 tests, typecheck, and `git diff --check` pass.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
