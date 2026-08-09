# UI source of truth

**Status:** Locked direction — Harbor Master Desk (2026-08-09)

This folder is the **visual implementation source of truth** for ChartStead product UI. When code and these files disagree, update the code to match these files (or deliberately revise these files first).

## Hierarchy (read in this order)

| Layer | Path | Role |
| --- | --- | --- |
| 1. Written system | [`../DESIGN.md`](../DESIGN.md) | Tokens, principles, voice, do/don’t |
| 2. **Visual truth** | **This folder** | Locked shell + screen HTML agents implement against |
| 3. Exploration | [`../prototypes/`](../prototypes/) | Direction experiments — **not** canonical |
| 4. Mood only | [`../references/marketing/`](../references/marketing/) | Hierarchy/tone cues — not pixel specs |

## Locked files

| File | What it defines |
| --- | --- |
| [`organizer-submissions.html`](organizer-submissions.html) | Organizer shell (sidebar, top bar) + submissions master-detail + inspector. **Primary reference for app chrome and this spine screen.** |

## Rules for implementers

1. Match structure, spacing, hierarchy, and interaction feel from the HTML — do not restyle from memory.
2. Use tokens and rules from `DESIGN.md` (colors, type, elevation). Where HTML shape choices are sharper than the written radius scale (hard edges, no pills), **prefer the HTML** until `DESIGN.md` is updated.
3. Real brand mark only: `../assets/brand/chartstead-mark-on-dark.png` (sidebar) / `…-on-light.png` (light surfaces).
4. Do not add sidebar chart-grid textures, glassmorphism, or pill chips.
5. New screens should extend this shell, not invent a second navigation system.

## Behavioral contract

The HTML locks visual direction; it is not the complete product specification. Implement interactions against [`../../context.md`](../../context.md), [`../../context/BUILD-PLAN.md`](../../context/BUILD-PLAN.md), and [`../DESIGN.md`](../DESIGN.md), including these cross-screen rules:

- Submission IDs and detail routes are stable permalinks.
- The reviewer queue is shared within assigned tracks; individual assignment and academic review machinery are out of scope.
- `Approve`, `Maybe`, and `Deny` change internal committee state only. Sending a speaker decision is a separate, explicit action.
- Agenda drafts accept unplaced sessions, `TBD`, and unresolved conflicts. Warnings help the operator; they do not block saving.
- Current speaker profiles do not overwrite submission-time title and organization history.
- Calendar UIDs stay stable through updates and cancellation.
- Reminder and escalation interfaces assist a human rather than sending consequential messages silently.

The source-of-truth submissions screen already demonstrates stable submission IDs, shared track routing, committee notes, internal decisions, and export placement. Preserve those semantics when converting the HTML to application code.

## How to view

Serve the `design/` directory (so asset paths resolve):

```bash
# from repo: design/
python3 -m http.server 8765 --bind 0.0.0.0
```

Open: `http://100.105.117.93:8765/source-of-truth/organizer-submissions.html`
(or localhost if you are on the same machine)

## Revising the truth

- Direction exploration stays in `prototypes/`.
- When a direction is chosen, port it here and note the date/status at the top of this README.
- Do not silently drift the live app away from these files.
