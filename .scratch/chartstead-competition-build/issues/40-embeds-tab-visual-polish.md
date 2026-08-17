# 40 — Embeds tab visual polish

**What to build:** Bring the organizer Embeds workspace (`/e/:eventId/embeds`, `EmbedManagerWorkspace`) up to Harbor Master Desk quality. Rubric 23 made the five-widget embed manager functionally complete; the work surface still reads as a three-panel admin form with card list, status pills, and nested panel titles. Saved configs, configuration, install code, and live preview should feel like Submissions — one operational desk, not a leftover settings page.

**Blocked by:** Rubric 23 — Distribute five widgets through an embed manager. Competition 09 — Public program renderer and embed.

**Status:** done

- [x] Saved embeds scan as an operational list/table: name, widget, revision binding (current vs pinned), and live/disabled state are immediately scannable.
- [x] Selecting a config opens a clear master-detail editor; New embed has one obvious home (prefer shell tools, not a second workspace toolbar).
- [x] Widget, theme, revision source, filters, and field visibility use desk controls (AppSelect / restrained groups) instead of generic stacked admin chrome where it helps scanability.
- [x] Install code (iframe + feed URL + open public) is first-class once a config is saved; copy feedback does not shove layout.
- [x] Live public-safe preview stays honest to draft filters/fields/theme without organizer nav leaking into the preview frame.
- [x] Status uses restrained text/flags, not pills. Loading, empty, and error states match desk density and explain the next useful action.
- [x] Desktop and narrow layouts retain 44px targets, visible focus, and no accidental page-level horizontal overflow.
- [x] Visual QA against `design/DESIGN.md` and `design/ORGANIZER-DESK-CHROME.md`, with Submissions as the comparison desk.
- [x] Do not change public embed resolution, revision pinning, feed semantics, or the public program visual polish owned by Competition 19.

## Comments

Filed 2026-08-13 after Tyler named the Embeds tab as the next human-tandem polish surface. Competition 19 remains public program + public embed frame only. Rubric 23 remains the functional embed-manager implementation.

- 2026-08-13 — Started with Tyler in tandem; status → in-progress before polish work. Claimed in this session. Clarifying layout/scope with Tyler before code.
- 2026-08-13 — Worktree `.worktrees/ticket-40-embeds-tab-polish` on branch `ticket-40-embeds-tab-polish`. Layout exploration via UI design direction skill: 10 implemented directions in `design/prototypes/embeds-tab-layout-directions.html`. Demo: `http://100.105.117.93:5340/embeds-tab-layout-directions.html`.
- 2026-08-13 — Tyler picked Direction **01 Harbor Ledger** for Embeds (Forms twin). Direction **04 Widget Catalog** parked for Overview (not this ticket). Implemented desk: operational table + resizable inspector + preview dock; shell tools (search/status) + New embed / Disable; flags not pills; AppSelect; toast copy/save. Demo: `http://100.105.117.93:5341/e/pacific-open-data-summit-2026/embeds`.
- 2026-08-13 — Layout pass: removed bottom preview dock. List = table + right inspector (summary, Install, public-safe preview). Builder mode = config left + live preview right (Back / Save in shell), same twin as Forms list→builder.
- 2026-08-13 — Split seed fix (same class as Forms/Submissions): stable callback ref + ResizeObserver, 50/50 CSS until px seed, min-floor only so preferred col widths cannot block half-width. Verified 512/512 on 1032px split.
- 2026-08-14 — Tyler locked the five public embed visual references before implementation: Sessions List D05 Atlas Modules; Speakers List D05 Atlas Modules; Agenda D05 Atlas Modules with the top-left “ChartStead Agenda” control removed; Schedule Itinerary D04 Indexed Folio; Speaker Gallery D03 Signal Rail. Canonical assets and implementation caveats now live in `design/source-of-truth/embeds/`. No renderer implementation was changed in this pass.
- 2026-08-14 — Tyler accepted the Embed Manager tab polish and directed ticket closeout. Status → `done`; final visual-QA criterion checked. Fresh verification in `.worktrees/ticket-40-embeds-tab-polish`: `npx tsc --noEmit -p tsconfig.json` passed; production `npm run build` passed; focused `test/ui/public-program.test.tsx` passed 10/10; local demo migrations were current; `/api/events` returned JSON 200; Embeds route returned 200 locally and over Tailscale. Demo: `http://100.105.117.93:5341/e/pacific-open-data-summit-2026/embeds`. What to test: saved-embed table and selection inspector; New embed builder split; Widget/theme/revision/filter/field controls; install code and copy feedback; live preview containment; desktop/narrow resizing and focus targets.
