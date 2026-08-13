# 30 — Forms and CFP builder shell port

**What to build:** Port the Forms list and guided CFP builder host surface into the shared organizer desk shell established by Competition 28. Preserve the public CFP and builder behavior; this ticket removes duplicate chrome and makes action ownership explicit.

**Blocked by:** Competition 28 — Shared organizer desk shell baseline

**Status:** done

- [x] Forms list and CFP builder routes render one shared shell toolbar and remove duplicate page-level command headers.
- [x] `Open CFP` has one home in Forms; `Create form` and the active form/builder actions are placed in clear shell slots without duplicate body CTAs.
- [x] Form lifecycle state, published-version context, saved/unsaved/saving/error states, preview/editor navigation, and direct form links remain truthful and usable.
- [x] The list and builder retain keyboard focus, narrow-width stacking, 44px targets, and no horizontal overflow.
- [x] Public CFP rendering and draft-versus-published behavior remain unchanged; no SurveyJS schema or persistence redesign is included.
- [x] Focused tests prove direct Forms and builder navigation, one-toolbar rendering, the single Open CFP home, and preserved create/open flows.
- [x] Do not take over the subjective builder redesign owned by human-tandem ticket 12; do not change CFP publication or submitter semantics.

## Comments

Filed 2026-08-12 as the agent-owned structural counterpart to human-tandem ticket 12. Start after Competition 28 is complete; it can run in parallel with tickets 29, 31, 32, and 33 from the shared-shell commit.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 28 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Ported the Forms list and direct CFP builder route into the shared Organizer Desk shell. The Forms shell owns the single Open CFP and Create form actions; builder actions move into the shell toolbar while the body retains the existing editor, preview, lifecycle, and save/publish behavior. Added a focused Playwright coverage path for list-to-builder shell actions. Browser-smoked `/e/pacific-open-data-summit-2026/forms` and a newly created direct builder URL on the demo server with one `.shell-toolbar`, zero `.builder-header`, single `Open CFP`, and visible All forms/Save draft/Publish actions.
