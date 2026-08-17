# 65 — Fix the broken Speakers search field

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

The Speakers tab search control is visually broken. The search icon sits at the top of the toolbar and the input sits outside the box it belongs in. Tyler called it horrible and completely broken.

Match the working topbar search used on Forms / Submissions: one field, icon and input together, inside the control. Do not change directory filter, add-speaker, or CSV-import behavior.

## Acceptance criteria

- [x] Search icon and text input share one control; the composer is not outside the field box.
- [x] Layout matches other organizer topbar search fields at the supported desktop width.
- [x] Typing still filters the directory by name or email; focus and 44px target hold.
- [x] No horizontal overflow or stacked-icon / escaped-input at the default organizer width.
- [x] A screenshot or focused layout assertion is recorded; Tailscale demo URL and what-to-test before `in-review`.

## Comments

- 2026-08-16 — Tyler QA approved. Merged to `main`. Status → done.

- 2026-08-16 — Tyler QA: speakers search looks good. Keeping as-is on combined review demo http://100.105.117.93:5870/e/ai-engineer-worlds-fair-2026/speakers

- 2026-08-16 — Claimed for unsupervised agent batch (Competition 63–67). Worktree: `.worktrees/competition-65-speakers-search`.

- 2026-08-17 — Tyler walkthrough: Speakers search is broken — icon at the top, composer outside the box it is supposed to fit in.

- 2026-08-17 — Fix: `.speaker-directory-tools label` forced `display: grid` (and re-boxed `input`) over the shared `.field` flex search control. Scoped those rules with `:not(.field)` and restored Forms-matching flex chrome for `.topbar-search`. Layout assertion + screenshots under worktree `tmp/ticket-65-*.png`. Demo: `http://100.105.117.93:5865/demo` → Enter as organizer → Speakers (`/e/ai-engineer-worlds-fair-2026/speakers`). Frontier: no non-human-tandem blocked tickets newly unblocked.
