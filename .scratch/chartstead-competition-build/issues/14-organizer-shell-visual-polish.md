# 14 — Organizer shell visual polish

**What to build:** Bring the signed-in organizer shell from Ticket 01 up to ChartStead design-system quality. The shell, event switcher, top bar, auth boundary, and common loading/error states must feel like one composed Harbor Master Desk rather than framework chrome around individual workspaces.

**Blocked by:** 01 — Walking skeleton and seeded event.

**Status:** blocked — human-tandem only (not agent-ready)

- [ ] Event switcher, primary navigation, top-bar actions, and content frame have a clear visual hierarchy at desktop and narrow organizer widths.
- [ ] Signed-in, signed-out, loading, empty, and recoverable-error states use deliberate ChartStead surfaces, type, focus treatment, and action priority.
- [ ] Shared controls retain keyboard-visible focus, 44px narrow-width targets, and no clipped or horizontally overflowing chrome.
- [ ] Shell treatment follows `design/DESIGN.md`: primary indigo structure, steel-blue secondary actions/focus, restrained radii, and no generic dashboard or pill language.

## Comments

Filed after Ticket 01 functional completion. Human-led visual and interaction polish only; do not alter Better Auth, event membership, seed, or worker behavior without a separate functional ticket.

- 2026-08-13 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
