# Organizer Desk Chrome

**Status:** Canonical cross-screen organizer contract, locked 2026-08-12

This contract extends [`DESIGN.md`](DESIGN.md) and the visual reference in [`source-of-truth/organizer-submissions.html`](source-of-truth/organizer-submissions.html). It captures the shell and work-surface rules established by Competition 27 so future organizer screens can be polished by agents without reconstructing decisions from screenshots or a handoff.

Product behavior remains governed by [`../context.md`](../context.md), [`../context/BUILD-PLAN.md`](../context/BUILD-PLAN.md), and [`source-of-truth/README.md`](source-of-truth/README.md).

## Reference surface

Submissions is the reference organizer desk. Match its density, interaction feel, and chrome before introducing a new pattern. The reference implementation is the signed-in organizer Submissions route, not the public CFP, speaker portal, or published program.

## Shell contract

1. **Separate frame from work.** The shell toolbar uses the calm harbor-blue surface and border. The work surface remains white or subtly muted. Do not merge them into one undifferentiated panel.
2. **Use one shell toolbar.** Every organizer workspace gets one `.shell-toolbar` with slots for identity, tools, and actions. Do not add a second workspace toolbar underneath it.
3. **Let navigation carry identity.** Dense workspaces may omit a repeated large page title when the active sidebar item already identifies the surface. Keep useful context in the toolbar when it changes an operator decision.
4. **Give every action one home.** `Open CFP` belongs to Forms. Reviewer routing belongs to Settings. Queue batch actions belong to the queue shell toolbar. Do not duplicate these actions in a page body and the shell.
5. **Keep account context in the rail.** The signed-in account and role sit above the event switcher in the sidebar. Do not add a redundant operator avatar or account block to the top bar.
6. **Fit controls to their content.** Selects and filters should not stretch merely to consume available width. Search may flex; track and other bounded selects should fit their labels within the available viewport.
7. **Preserve narrow-width usability.** Controls may wrap or scroll as a deliberate group, but the shell must retain visible focus, 44px interaction targets at narrow widths, and no accidental page-level horizontal overflow.

## Work-surface contract

1. **Tables are operational objects.** Use stable column names, explicit widths where needed, aligned loading and empty states, and compact rows that preserve scanability.
2. **Rows are useful hit targets.** A proposal row opens its inspector from the row, not only from a small title link. Selection controls must remain independently clickable.
3. **Sort belongs in headers.** Sortable columns expose their state and direction in the header. Do not hide the primary queue sort behind a separate sort dropdown.
4. **Batch chrome is stable.** When the role permits batch work, the batch region remains visible and disabled when there is no selection. It must not pop into the layout and move the table.
5. **Selection is explicit.** Header select-all and row selection use clear checkbox affordances, keyboard focus, and a visible selected-row treatment.
6. **Status is readable.** Status uses stable text and restrained semantic color. It must not imply an irreversible external communication when the action only changes internal state.
7. **Local queue changes stay local.** Search, filter, and sort over an already-loaded event queue update immediately. Do not wipe the table or show a full-page loading state for a local view change.
8. **Preserve partial truth.** Empty, loading, error, unresolved, and partially complete states explain what is true and what the operator can do next. Do not replace uncertain state with invented completeness.

## Surface ownership

| Concern | Home |
| --- | --- |
| Event navigation and account identity | Sidebar shell |
| Workspace identity and workspace-level tools | Shell toolbar |
| Submission search, status, track, sort, selection, and batch decisions | Submissions queue |
| CFP opening and form management | Forms |
| Reviewer routing | Settings |
| Proposal body, speaker context, notes, audit, and reversible decisions | Submission inspector |

## Performance boundary

Client-side queue filtering and sorting are the reference behavior while the full event queue is loaded. If the queue becomes paginated or virtualized, preserve the same interaction contract: local changes remain immediate, and server fetching must not destroy the current table layout or selection context.

## Validation

An organizer polish slice is not complete until it has been checked at desktop and narrow widths, with keyboard focus, empty/loading/error states, direct navigation, and the relevant shell ownership rules. Submissions remains the comparison surface when a new screen needs a choice that this contract does not specify.

## Change rule

If the product intentionally changes this contract, update this document and the source-of-truth HTML first, then update the implementation and affected ticket acceptance criteria. Do not silently make a live screen the new reference.
