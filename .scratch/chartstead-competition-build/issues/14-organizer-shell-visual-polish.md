# 14 — Organizer shell visual polish

**What to build:** Bring the signed-in organizer shell from Ticket 01 up to ChartStead design-system quality. The shell, event switcher, top bar, auth boundary, and common loading/error states must feel like one composed Harbor Master Desk rather than framework chrome around individual workspaces.

**Blocked by:** 01 — Walking skeleton and seeded event.

**Status:** done

- [x] Event switcher, primary navigation, top-bar actions, and content frame have a clear visual hierarchy at desktop and narrow organizer widths.
- [x] Signed-in, signed-out, loading, empty, and recoverable-error states use deliberate ChartStead surfaces, type, focus treatment, and action priority.
- [x] Shared controls retain keyboard-visible focus, 44px narrow-width targets, and no clipped or horizontally overflowing chrome.
- [x] Shell treatment follows `design/DESIGN.md`: primary indigo structure, steel-blue secondary actions/focus, restrained radii, and no generic dashboard or pill language.

## Comments

- 2026-08-17 — Tyler: confirm closed on main board. Prior done closeout lived only on tmp/wip-before-67 (park-before-67) and never merged; restored to done.

Filed after Ticket 01 functional completion. Human-led visual and interaction polish only; do not alter Better Auth, event membership, seed, or worker behavior without a separate functional ticket.

- 2026-08-13 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-13 — Claimed with Tyler in tandem; status → in-progress. Worktree: `.worktrees/ticket-14-organizer-shell-polish`.
- 2026-08-13 — **Done (tandem).** Shell quality already landed via Comp 28 + polish-as-you-go on other desks. This closeout: loading skeleton uses harbor `.shell-toolbar` (not legacy `.topbar`); AGENTS.md + README require local D1 migrations + `/api/events` JSON smoke before any worktree demo URL (fixes recurring `Unexpected token 'I', "Internal S"...` failure). Human QA waived by Tyler on live shell. Demo was `http://100.105.117.93:5214/demo`.
