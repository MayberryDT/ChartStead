# 37 — Settings tab visual polish

**What to build:** Bring the organizer Settings workspace up to Harbor Master Desk quality. Competition 33 established section rhythm and shell ownership; the work surface still needs a dedicated visual/UX polish pass so event configuration, reviewers, Course Check policy, automation access, and Airtable sync feel like one composed desk — not stacked admin panels.

**Blocked by:** Competition 33 — Settings workspace shell port.

**Status:** done

- [x] Event configuration, Reviewers, Course Check policy, automation, and Airtable have a clear section hierarchy, action priority, and scan path.
- [x] Reviewer routing stays owned by Settings; sync health and credential states remain truthful and privacy-safe.
- [x] Forms, tables, and status treatments match `design/DESIGN.md` and the Submissions desk (no pills, visible focus, 44px targets).
- [x] Desktop and narrow layouts stay readable with no accidental horizontal overflow.
- [x] Do not change auth, event configuration persistence, Course Check policy, API-key scope, or Airtable provider semantics.

## Comments

Filed 2026-08-12 to complete per-tab visual-polish coverage. Human-led tandem only; Competition 33 remains the structural shell port.

- 2026-08-13 — frontier-reconcile: Blockers satisfied; remains human-tandem only (not agent-ready).
- 2026-08-13 — Claimed with Tyler in tandem; status → in-progress before polish work.
- 2026-08-13 — First pass: tools-only shell toolbar with section tabs (Event / Reviewers / Evaluation / Course Check / Automation / Airtable); one section at a time; section actions stay in section headers; Airtable health no longer uses pills. Worktree `.worktrees/ticket-37-settings-polish`. Demo: `http://100.105.117.93:5337/e/pacific-open-data-summit-2026/settings`.
- 2026-08-13 — Section filters use Submissions-style `aria-pressed` seg (clear active highlight). Card polish pass: header rhythm, evaluation round layout, automation API/MCP seg (no pills), reviewer nesting, key table, policy checks.
- 2026-08-14 — Reduced each pane to one job-specific title; moved Evaluation/Course Check/Event actions to the bottom; aligned Event track/room composers; removed Airtable demo controls; grouped connect/retry/disconnect; converted all Settings-facing selects and checkboxes to Base UI.
- 2026-08-14 — Ready for human QA at `http://100.105.117.93:5337/e/pacific-open-data-summit-2026/settings`. Verify track/room rows align despite unequal counts; Evaluation has wide Label/Guidance fields, a separate Required/footer row, compact criterion removal, and Reviewer pool heading above its box; check Event and Evaluation at desktop and narrow widths. Typecheck, production build, focused Settings UI tests (4/4), Event workspace E2E (1/1), and zero-overflow browser geometry passed.
- 2026-08-14 — Tyler accepted the Settings polish and closed the ticket. Evaluation placement is intentionally separated into Competition 41; Ticket 37 remains the completed visual baseline and does not absorb that information-architecture change.
