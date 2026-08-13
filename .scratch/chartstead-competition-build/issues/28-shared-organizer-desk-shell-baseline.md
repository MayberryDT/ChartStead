# 28 — Shared organizer desk shell baseline

**What to build:** Implement the approved `design/ORGANIZER-DESK-CHROME.md` contract as shared organizer-shell code. Competition 27 / Submissions is the visual and interaction reference; this ticket owns the reusable shell seam and route-wide structural parity, not a new visual direction.

**Status:** done

- [x] A shared shell-toolbar primitive or slot API owns the harbor-blue frame and identity/tools/actions regions; each organizer route renders one shell toolbar, never a nested workspace command bar.
- [x] Overview, Submissions, Forms, Speakers, Agenda, Messages, and Settings all retain the same sidebar account context, event switcher, navigation, focus treatment, and responsive shell behavior.
- [x] Existing action ownership is preserved and made explicit: Forms owns CFP opening, Settings owns reviewer routing, queue surfaces own batch work, and the sidebar owns account/event context.
- [x] Route workspaces receive a consistent white/subtle work surface with deliberate loading, empty, and recoverable-error framing; local queue/filter changes do not cause a full workspace loading wipe.
- [x] Shared shell code is covered by focused tests for one-toolbar-per-route, direct organizer navigation, keyboard-visible focus, and narrow-width behavior.
- [x] Functional boundaries remain unchanged: do not alter auth, event membership, submission decisions, Course Check semantics, speaker/task mutations, agenda persistence, messages delivery, or settings credentials.
- [x] Do not change the status or acceptance ownership of human-tandem polish tickets 12–19; this ticket supplies their shared structural seam only.

## Comments

Filed 2026-08-12 after Tyler approved the Organizer Desk Chrome Showcase. This is the first agent-owned ticket in the new parallel polish lane. Start it before tickets 29–33; once its seam is stable, those surface ports can run in parallel from its commit.

- 2026-08-12 — Started in isolated worktree for shared shell implementation and review.
- 2026-08-12 — Ready for human QA. Verified the shared `OrganizerShell` across Overview, Submissions, Forms, Speakers, Agenda, Messages, and Settings; Forms owns Open CFP, Settings owns reviewer routing, and Submissions owns queue batch actions. Demo: `http://100.105.117.93:5188/`. Check organizer navigation, the narrow Submissions toolbar, and visible keyboard focus. UI 120/120, focused shared-shell/UI 36/36, typecheck, build, and focused guided-CFP worker tests 23/23 pass. Full E2E could not start because another process owns its fixed `127.0.0.1:4173` port.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
