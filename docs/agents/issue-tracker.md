# Issue tracker: Local Markdown

Issues and specs live as Markdown under `.scratch/`. The board is a live mirror of those files.

## Layout

- One feature per directory: `.scratch/<feature-slug>/`
- Spec: `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` (one file each, from `01`)
- Near the top of each ticket: `**Status:** …` and optional `**Blocked by:** …`
- Conversation under `## Comments`

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
| Ticket is grab-ready | `ready-for-agent` | Open |
| **You start the ticket** (named in this chat) | `in-progress` | In progress |
| Implementation done; waiting on human QA | `in-review` | In progress |
| QA passed / merged / truly finished | `done` | Done |
| Cannot proceed | `blocked` (+ short reason in Comments) | Blocked |

### Agent checklist — do this every ticket session

1. **Before first code edit:** set `**Status:** in-progress` on the issue file.
2. **While working:** keep checklist boxes honest (`- [ ]` / `- [x]`).
3. **When handing to Tyler for QA:** `**Status:** in-review`, demo Tailscale URL, short what-to-test list.
4. **When done for real:** `**Status:** done` and all acceptance boxes checked.
5. **Always write both places** if you use a worktree:
   - worktree: `.scratch/.../issues/<file>.md`
   - board (main): `/home/halla/ChartStead/.scratch/.../issues/<file>.md`  
     (same relative path under competition-build or course-check)

Skipping step 1 is a process bug — the board must show **In progress** while an agent owns the ticket.

## Blocking edges

- `Blocked by: NN, NN` near the top of a ticket.
- Unblocked when every listed ticket is `done`.
- Prefer numeric order among unblocked tickets unless the spec says otherwise.

## Publishing / fetching

- Publish → create/update the Markdown under `.scratch/<feature-slug>/`.
- Fetch → read the issue file path the user (or handoff) names.
