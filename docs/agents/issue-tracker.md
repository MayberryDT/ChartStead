# Issue tracker: Local Markdown

Issues and specs live as Markdown under `.scratch/`. The board is a live mirror of those files.

## Layout

- One feature per directory: `.scratch/<feature-slug>/`
- Spec: `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` (one file each, from `01`)
- Near the top of each ticket: `**Status:** …` and optional `**Blocked by:** …`
- Conversation under `## Comments`

## Tracks

| Track | Path | Qualified id |
| --- | --- | --- |
| Competition build | `.scratch/chartstead-competition-build/` | `Competition NN` |
| Course Check | `.scratch/chartstead-course-check/` | `Course Check NN` |

Absolute main-checkout paths (board source of truth):

- `/home/halla/ChartStead/.scratch/chartstead-competition-build/issues/`
- `/home/halla/ChartStead/.scratch/chartstead-course-check/issues/`

## Live board

```bash
npm run issues:board
```

- Board: `http://100.105.117.93:3939/` (Tailscale)
- Source: `scripts/issue-board/server.mjs`
- **Reads the main checkout only** — not a worktree’s `.scratch/`. Worktree-only edits do not move the board.

## Status lifecycle (required)

Use exactly these `**Status:**` values (case-insensitive; notes in parentheses OK):

| When | Set `**Status:**` to | Board column |
| --- | --- | --- |
| Ticket is grab-ready for an agent | `ready-for-agent` | Open |
| **You start the ticket** (named in this chat) | `in-progress` | In progress |
| Implementation done; waiting on human QA | `in-review` | In progress |
| QA passed / merged / truly finished | `done` | Done |
| Unresolved dependency or external hold | `blocked` (+ short reason in Comments) | Blocked |
| Human-led polish / tandem-only | `blocked — human-tandem only (not agent-ready)` | Blocked |

Do **not** use bare `open`. That is not a working status.

### Forward-only ownership

Once a ticket is `in-progress`, advance only to `in-review` or `done` (or `blocked` if truly stuck). Never move it back to `ready-for-agent`.

## Blocking edges

- Prefer **qualified** cross-track refs: `Competition 08`, `Course Check 03`.
- Same-track numeric refs (`02 — …`) resolve inside that track.
- A ticket is unblocked when every listed blocker is `done` / `complete`.
- **Human-tandem** tickets stay human-tandem even when blockers are done — they never auto-promote to `ready-for-agent`.

## Agent duty (do not skip)

**Do not start a ticket unless Tyler explicitly names it in this conversation.**

When you start, finish, or block a ticket:

1. Update `**Status:**` on the **main checkout** issue path (and the worktree copy if you have one).
2. Update the `- [ ]` / `- [x]` checklist to match real progress.
3. Append a concise dated note under `## Comments`.
4. **Re-scan both tracks (frontier maintenance).** For every non-human-tandem ticket still `blocked`, check whether every declared blocker is now `done`/`complete`. If yes, set that ticket to `ready-for-agent` and comment why. Partially satisfied blockers stay `blocked` (annotate which remain). Never finish a ticket leave-behind that leaves Open empty while the graph has free agent work.
5. Mechanical check (required on closeout):

```bash
npm run issues:reconcile          # dry-run
npm run issues:reconcile:apply    # write main-checkout Markdown
```

Closing a ticket without promoting dependents is a process bug. Treat frontier maintenance as part of the acceptance checklist for every ticket.

### Agent checklist — every ticket session

1. **Before first code edit:** `**Status:** in-progress`.
2. **While working:** keep checklist boxes honest.
3. **Ready for Tyler QA:** `**Status:** in-review`, Tailscale demo URL, short what-to-test list.
4. **Done for real:** `**Status:** done`, all acceptance boxes checked, then **reconcile frontier**.
5. **Always write both places** if you use a worktree:
   - worktree: `.scratch/.../issues/<file>.md`
   - board (main): `/home/halla/ChartStead/.scratch/.../issues/<file>.md`

Skipping step 1 or step 4 is a process bug.

## Publishing / fetching

- Publish → create/update the Markdown under `.scratch/<feature-slug>/`.
- Fetch → read the issue file path the user (or handoff) names.
