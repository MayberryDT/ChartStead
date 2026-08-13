# 34 — Organizer desk parity verification

**What to build:** Run the final integration and verification pass after the shared shell and surface ports land. Use Submissions as the reference route and verify every organizer route against `design/ORGANIZER-DESK-CHROME.md` without expanding the feature scope.

**Blocked by:** Competition 29 — Agenda shell port; Competition 30 — Forms and CFP builder shell port; Competition 31 — Speakers and onboarding desk shell port; Competition 32 — Messages workspace shell port; Competition 33 — Settings workspace shell port

**Status:** done

- [x] Route matrix covers Overview, Submissions, Forms, CFP builder, Speakers, Agenda, Messages, and Settings at desktop and narrow organizer widths.
- [x] Every route has exactly one shared `.shell-toolbar`, consistent sidebar account/event context, deliberate work-surface framing, and no nested workspace command bar.
- [x] Action ownership is checked end-to-end: CFP in Forms, reviewer routing in Settings, queue batch actions in queue chrome, account/event in the rail, and consequential sends behind Course Check or explicit organizer action.
- [x] Loading, empty, error, partial/TBD, disabled, selected, and recoverable states remain understandable; local filter/sort changes do not wipe active work surfaces.
- [x] Keyboard smoke covers navigation, shell controls, table/grid/list selection, forms, inspector actions, and the Agenda non-drag Move Session path.
- [x] Focused tests, typecheck, build, and the relevant E2E/browser checks pass; failures are fixed or documented with an exact blocker rather than hidden.
- [x] A Tailscale-reachable demo is started or reused, `ss -tlnp` confirms a non-loopback listener, and the ticket comment records the URL plus a concise what-to-test list.
- [x] Human-tandem tickets 12–19 remain separate; do not mark them done, rewrite their acceptance criteria, or convert their ownership during verification.

## Comments

Filed 2026-08-12 as the final gate for the agent-owned Organizer Desk Chrome lane. This ticket should begin only after tickets 29–33 have each reached a verified implementation state. It is the integration verifier, not a reason to reopen unrelated functional tickets.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 29 (blocked); Competition 30 (blocked); Competition 31 (blocked); Competition 32 (blocked); Competition 33 (blocked).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 parity verification

Status moved to `done` after Tyler waived human review and the final organizer-desk parity pass completed in the main checkout.

Parity checklist:

- Overview: one shared `.shell-toolbar`, account and event context remain in the sidebar rail, no nested page command bar, no desktop or narrow page overflow.
- Submissions: one shared `.shell-toolbar`; search/filter/sort and stable batch chrome stay in the queue toolbar; local queue changes do not wipe the loaded table or selection context.
- Forms list: one shared `.shell-toolbar`; exactly one `Open CFP` home and one `Create form` home in shell actions; no body-level duplicate command bar.
- CFP builder: direct `/forms/:formId` route now renders inside `OrganizerShell`; builder title, save state, All forms/Open CFP/Save draft/Publish actions live in shell actions; no `.builder-header`; standalone `CfpBuilderPage` tests still render the builder chrome for isolated unit coverage.
- Speakers: one shared `.shell-toolbar`; directory search, readiness filter, add speaker, CSV import, and counts are hoisted into shell tools; selected-speaker detail, tasks, reminders, explicit send/edit/discard, files, comments, and history remain in the work surface.
- Agenda: one shared `.shell-toolbar`; placement counts, day tabs, and Publish program live in shell slots; unplaced pool, day/room grid, inspector, conflicts, partial/TBD truth, and keyboard Move Session path remain in the work surface. Narrow day tab targets were corrected to 44px.
- Messages: one shared `.shell-toolbar`; readiness filters, counts, Select visible, and Review in Course Check live in shell tools; compose, token preview, guidance, focused-plan result, and history remain in the work surface. Review handoff does not create frozen drafts or send.
- Settings: one shared `.shell-toolbar`; Event configuration, Reviewers, evaluation plan, Course Check policy, automation access, and Airtable sync are stable sections; reviewer routing remains owned only by Settings.
- Human-tandem tickets 12–19 were not changed or reclassified.

Verification:

- Focused UI tests passed: `npm run test:ui -- test/ui/organizer-shell.test.tsx test/ui/agenda.test.tsx test/ui/app.test.tsx -t "shows the seeded event|renders direct Settings routes|creates and configures a truthful empty event workspace|builds an exact speaker announcement|uses the shared shell toolbar|OrganizerShell"` — 9 passed.
- Focused CFP builder behavior tests passed after preserving isolated builder chrome: `npm run test:ui -- test/ui/app.test.tsx -t "shows the organizer form fetch error|configures event-local opening|keeps event track choices|does not let a stale save|disables publish while|publishes the current draft|ignores stale draft-save|adds moves and removes|prevents removing protected|toggles required|shows Save failed|blocks navigation"` — 12 passed.
- Browser desktop route matrix on `http://127.0.0.1:5198`: Overview, Submissions, Forms, CFP builder, Speakers, Agenda, Messages, and Settings each reported exactly one `.shell-toolbar`, no `.builder-header`, no `.agenda-toolbar`, no `.messages-intro`, and no page-level horizontal overflow. Ownership checks passed for Submissions batch/search, Forms Open CFP/Create form, Builder All forms/Open CFP/Save draft/Publish, Speakers shell directory toolbar, Agenda day tabs/Publish/Move Session, Messages filter/Select visible/Course Check review, and Settings reviewer section.
- Browser narrow route matrix at 390×844: Overview, Submissions, Forms, Speakers, Agenda, Messages, and Settings each reported one `.shell-toolbar`, no page-level horizontal overflow, and 44px-or-larger shell controls. Deliberate toolbar horizontal overflow/scroll remained on dense routes.
- Demo reused: `http://100.105.117.93:5198/` (`npm run dev:demo -- --host 0.0.0.0 --port 5198`). Listener confirmed with `ss -tlnp`: `0.0.0.0:5198`.

What to test: navigate all organizer routes at desktop and narrow widths; verify shell/sidebar context is stable, each route has one toolbar, Forms/Builder actions are in the shell, Speakers/Messages filters preserve selections locally, Agenda day switching and Move Session still work, Settings owns reviewer routing, and Course Check remains the only consequential communications/publication handoff.
