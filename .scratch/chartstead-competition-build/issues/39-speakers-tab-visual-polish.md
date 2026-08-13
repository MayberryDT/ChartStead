# 39 — Speakers tab visual polish

**What to build:** Bring the organizer Speakers workspace (`/e/:eventId/speakers`) up to Harbor Master Desk quality. Competition 24/25/31 made directory, import, and shell ownership functionally complete; the work surface still reads as a stacked onboarding board. Directory scan, selected-speaker context, add/import, and readiness should feel like Submissions — one desk, not a leftover admin form.

**Blocked by:** 24 — Manage the organizer speaker directory. 25 — Import speakers from CSV. Competition 31 — Speakers and onboarding desk shell port.

**Status:** done

- [x] Directory is an operational table: name/email, placement, missing work, overdue, next due, readiness, and last contact are immediately scannable.
- [x] Full row opens the selected speaker; header sort works locally without wiping the list; reminder selection stays independently clickable.
- [x] Selected-speaker master-detail has a clear reading order: current profile vs event participation, missing work, tasks, deliverables, reminder draft/send, history.
- [x] Add-speaker and CSV-import panels live in the work surface without a second toolbar or a duplicate page title. Bulk reminder chrome does not shove the directory off-screen.
- [x] Loading, empty, filtered-empty, and error states match desk density and explain the next useful action.
- [x] Desktop and narrow layouts retain 44px targets, visible focus, and no accidental page-level horizontal overflow.
- [x] Visual QA against `design/DESIGN.md` and `design/ORGANIZER-DESK-CHROME.md`, with Submissions as the comparison desk. Status uses restrained text/flags, not pills.
- [x] Chasing, task create, and reminder draft/send are in scope for this tandem pass. Do not change portal, task, reminder, outbox, or identity-match semantics.

## Comments

Filed 2026-08-12 after Tyler named the Speakers tab as the next human-tandem polish surface. Ticket 18 was the earlier global design-standard pass; this ticket is the actual human-tandem Speakers desk. Ticket 17 remains speaker-portal-only. Competition 31 remains the structural shell port.

- 2026-08-12 — Ticket filed; clarifying scope with Tyler before any code. Worktree: `.worktrees/ticket-39-speakers-tab-polish`.
- 2026-08-12 — Tyler: whole Speakers tab (directory, add/import, bulk reminders, selected-speaker detail). Ticket 18 is not a later split — this is the tandem pass. Status → in-progress.

- 2026-08-13 — Tandem Speakers polish complete and merged to main. Master-detail desk, AppSelect, resizable/sortable queue, inspector cleanup, toast feedback, files modal, native checkboxes.
