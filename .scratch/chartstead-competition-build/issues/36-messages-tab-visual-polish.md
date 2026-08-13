# 36 — Messages tab visual polish

**What to build:** Bring the organizer Messages workspace up to Harbor Master Desk quality. Competition 26 and 32 made audience, compose, Course Check handoff, and delivery history functionally complete and shell-ported; the work surface still needs a dedicated visual/UX polish pass so audience, compose, preview, and history read as one intentional desk — not a stacked form.

**Blocked by:** 26 — Send general speaker communications through Course Check. Competition 32 — Messages workspace shell port.

**Status:** done

- [x] Audience selection, recipient counts, missing-address explanations, and compose/preview hierarchy are immediately scannable.
- [x] Draft, queued, sent, delivered, and failed states stay truthful and distinct from review decisions; Course Check remains the only send boundary.
- [x] History, retry context, and empty/error/loading states match desk density and `design/DESIGN.md` (no pills, visible focus, 44px targets).
- [x] Desktop and narrow layouts keep compose/history relationships readable with no accidental horizontal overflow.
- [x] Do not change Course Check approval, execution, retry, compensation, or provider semantics.

## Comments

Filed 2026-08-12 to complete per-tab visual-polish coverage. Human-led tandem only; Competition 32 remains the structural shell port.

- 2026-08-13 — Claimed with Tyler in tandem; status → in-progress before polish work.
- 2026-08-13 — Worktree `.worktrees/ticket-36-messages-polish` (`ticket-36-messages-polish`). Tools-only shell toolbar. Layout pivoted to Submissions-style split: audience left, history inspector right, single-recipient compose modal via Message.
- 2026-08-13 — Header sort, column resize, inspector resize (Submissions patterns). Plain status text; no multi-select; no Course Check chrome on the Messages desk. Prepare message still creates communication plan under the hood.
- 2026-08-13 — **Done.** Merged to `main` after tandem polish.
