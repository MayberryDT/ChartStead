# 27 — Submissions tab visual polish

**What to build:** Bring the organizer Submissions workspace (Ticket 02 master-detail, extended by Ticket 04 review actions) up to ChartStead design-system quality against `design/source-of-truth/organizer-submissions.html`. Queue scan, filters, inspector reading order, and reversible review controls should feel like the Harbor Master Desk — not a generic admin table.

**Blocked by:** 02 — First proposal end to end.

**Status:** done

- [x] Queue density, stable IDs, track chips, status, and speaker identity are immediately legible; outcomes do not look final before deliberate action.
- [x] Master-detail layout, toolbar filters/search/sort, empty/error/loading states, and narrow-width behavior match the locked SOT and `design/DESIGN.md` (tables, no pills, focus, 44px targets).
- [x] Inspector has a clear reading order: submission body → speaker context → internal notes → audit → reversible review actions; internal-only chrome is distinct from public material.
- [x] Keyboard and permalink navigation stay understandable; no horizontal overflow; shell chrome remains Ticket 14’s concern except where Submissions owns local work-surface styling.
- [x] Visual QA against `design/source-of-truth/organizer-submissions.html` and organizer shell / table / focus rules — functional review semantics and privacy boundaries unchanged.

## Comments

Filed 2026-08-12 for speedrun human-tandem visual polish. Ticket 16 remains the shared review-queue polish pass if we split later; this ticket owns the primary Submissions nav tab (`/e/:eventId/submissions`).

- 2026-08-12 — Started with Tyler in tandem; status → in-progress before polish work.
- 2026-08-12 — Demo: `http://100.105.117.93:5270/e/pacific-open-data-summit-2026/submissions` (`CLOUDFLARE_ENV=demo`, port 5270).
- 2026-08-12 — **Done (tandem polish).** Reference desk for global chrome:
  - Shared `shell-toolbar` (harbor blue strip); tools-only on Submissions (no title).
  - Queue: named cols, full-row open, header sort, select-all, fit track select, client-side filter/sort (no loading wipe).
  - Batch actions always visible (idle/disabled); Accept/Decline/Clear right-aligned.
  - Forms nav tab; Open CFP only on Forms; Reviewers moved to Settings.
  - Account session in sidebar above Event; no topbar operator.
  - Temporary `src/polish/` annotations removed on closeout.
  - Handoff for global port: `file:///home/tyler/Desktop/Plans/2026-08-12-chartstead-ticket-27-submissions-polish-handoff.md` (also `/tmp/opencode/2026-08-12-chartstead-ticket-27-submissions-polish-handoff.md`).
  - Next: codify ORGANIZER-DESK-CHROME + port tickets 14 → 13 → speakers/messages (Tyler names ticket).
