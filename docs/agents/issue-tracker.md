# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Never combine all implementation tickets into one file
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments and conversation history append under a `## Comments` heading

## Live board (local)

Simple status board that re-reads the Markdown files every few seconds:

```bash
npm run issues:board
```

- Board: `http://100.105.117.93:3939/` (Tailscale) or `http://127.0.0.1:3939/` on Halla
- JSON: `/api/board`
- Source: `scripts/issue-board/server.mjs`
- Tracks: competition build + Course Check issue folders

This is a mirror only. Edit the Markdown files; the board follows.

## Publishing and fetching

When a skill says to publish to the issue tracker, create the relevant file under `.scratch/<feature-slug>/`.

When a skill says to fetch a ticket, read the referenced issue file directly. The user will normally pass its path or number.

## Blocking edges

- Record dependencies as `Blocked by: NN, NN` near the top of a ticket.
- A ticket is unblocked when every listed ticket is complete.
- Work unblocked tickets in numeric order unless the spec explicitly prioritizes otherwise.
