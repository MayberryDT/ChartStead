# 65 — Fix the broken Speakers search field

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

The Speakers tab search control is visually broken. The search icon sits at the top of the toolbar and the input sits outside the box it belongs in. Tyler called it horrible and completely broken.

Match the working topbar search used on Forms / Submissions: one field, icon and input together, inside the control. Do not change directory filter, add-speaker, or CSV-import behavior.

## Acceptance criteria

- [ ] Search icon and text input share one control; the composer is not outside the field box.
- [ ] Layout matches other organizer topbar search fields at the supported desktop width.
- [ ] Typing still filters the directory by name or email; focus and 44px target hold.
- [ ] No horizontal overflow or stacked-icon / escaped-input at the default organizer width.
- [ ] A screenshot or focused layout assertion is recorded; Tailscale demo URL and what-to-test before `in-review`.

## Comments

- 2026-08-17 — Tyler walkthrough: Speakers search is broken — icon at the top, composer outside the box it is supposed to fit in.
