# 38 — Forms tab visual polish

**What to build:** Bring the organizer Forms list (`/e/:eventId/forms`) up to Harbor Master Desk quality. Competition 30 ported the list into the shared shell; the work surface is still a card wall with status pills. Forms should scan like Submissions — named columns, full-row open, readable status, honest empty/loading/error — not a leftover admin card list.

**Blocked by:** Competition 30 — Forms and CFP builder shell port.

**Status:** done

- [x] Forms list is an operational table: form name, lifecycle status, published version, and last updated are immediately scannable.
- [x] Status uses restrained text/flag treatment, not pill chips. Draft / Published / Closed stay truthful and do not imply a public send.
- [x] Full row opens the builder; header sort works locally without wiping the list.
- [x] Loading, empty, and error states match desk density and explain the next useful action. Create form lives in the list toolbar; there is no global Open CFP.
- [x] Desktop and narrow layouts retain 44px targets, visible focus, and no accidental page-level horizontal overflow.
- [x] Visual QA against `design/DESIGN.md` and `design/ORGANIZER-DESK-CHROME.md`, with Submissions as the comparison desk.
- [x] Do not take over the subjective builder redesign owned by human-tandem ticket 12. Do not change CFP publication, draft-versus-published, or submitter semantics.

## Comments

Filed 2026-08-12 after Tyler named the Forms tab as the next human-tandem polish surface. Ticket 12 remains builder-only; this ticket owns the Forms list work surface.

- 2026-08-12 — Started with Tyler in tandem; status → in-progress before polish work.
- 2026-08-12 — First pass in `.worktrees/ticket-38-forms-tab-polish`: card wall + pills replaced with a Forms table (Form / Status / Version / Updated), full-row open, local header sort. Demo: `http://100.105.117.93:5272/e/pacific-open-data-summit-2026/forms`.
- 2026-08-12 — Tyler: drop Forms title/subtitle and global Open CFP; Create form on the left; builder toolbar gets Back + Save/Publish/Close/View; status uses colored rectangular flags.
- 2026-08-13 — Clean land worktree `.worktrees/ticket-38-forms-land` (branch `ticket-38-forms-land`): Forms desk table + command bar + selection actions; builder chrome lifts into shell tools/actions; half-width preview seeds when the split mounts (not on first render). Tyler QA green. Merged to `main` as `6673f7d`. Status → done.
