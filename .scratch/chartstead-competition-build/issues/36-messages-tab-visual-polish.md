# 36 — Messages tab visual polish

**What to build:** Bring the organizer Messages workspace up to Harbor Master Desk quality. Competition 26 and 32 made audience, compose, Course Check handoff, and delivery history functionally complete and shell-ported; the work surface still needs a dedicated visual/UX polish pass so audience, compose, preview, and history read as one intentional desk — not a stacked form.

**Blocked by:** 26 — Send general speaker communications through Course Check. Competition 32 — Messages workspace shell port.

**Status:** in-progress

- [ ] Audience selection, recipient counts, missing-address explanations, and compose/preview hierarchy are immediately scannable.
- [ ] Draft, queued, sent, delivered, and failed states stay truthful and distinct from review decisions; Course Check remains the only send boundary.
- [ ] History, retry context, and empty/error/loading states match desk density and `design/DESIGN.md` (no pills, visible focus, 44px targets).
- [ ] Desktop and narrow layouts keep compose/history relationships readable with no accidental horizontal overflow.
- [ ] Do not change Course Check approval, execution, retry, compensation, or provider semantics.

## Comments

Filed 2026-08-12 to complete per-tab visual-polish coverage. Human-led tandem only; Competition 32 remains the structural shell port.

- 2026-08-13 — Claimed with Tyler in tandem; status → in-progress before polish work.
- 2026-08-13 — Worktree `.worktrees/ticket-36-messages-polish` (`ticket-36-messages-polish`). First cut: tools-only shell toolbar (no Messages title/subtitle). Layout + guidance options in temp HTML for tandem pick. Status text (no pills) and full-row history open locked.
- 2026-08-13 — Tyler picked **Layout B** (compose primary). No guidance banner (Submissions density). Implementing audience dense list + compose/preview split + full-row history; plain status tones; Submissions as chrome reference.
- 2026-08-13 — Layout pivot: Submissions-style split (audience left, history inspector right). Compose modal for one recipient. Multi-select and Course Check chrome removed from Messages desk.
