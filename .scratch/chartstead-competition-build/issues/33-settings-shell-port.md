# 33 — Settings workspace shell port

**What to build:** Port Settings into the shared organizer desk shell established by Competition 28 and establish a consistent section rhythm for event configuration, reviewers, Course Check policy, automation access, and Airtable sync. Preserve all credential and mutation boundaries.

**Blocked by:** Competition 28 — Shared organizer desk shell baseline

**Status:** done

- [x] Settings renders through one shared shell toolbar and does not introduce a second settings toolbar or competing page header.
- [x] Event configuration, Reviewers, Course Check policy, automation access, and Airtable sync read as intentional sections with stable heading hierarchy and clear action priority.
- [x] Reviewer routing remains owned by Settings; no duplicate reviewer action is added to another organizer surface.
- [x] Sync health, pull/connect/disconnect states, errors, retry guidance, saved-token messaging, and demo sandbox behavior remain truthful and privacy-safe.
- [x] Desktop and narrow layouts retain readable forms/cards, 44px targets, visible focus, and no accidental horizontal overflow.
- [x] Focused tests prove direct Settings navigation, shell presence, reviewer section visibility, and preserved Airtable action outcomes without exposing secrets.
- [x] Do not change auth, event configuration persistence, Course Check policy, API-key scope, or Airtable provider semantics.

## Comments

Filed 2026-08-12 as the agent-owned Settings slice in the new parallel polish lane. Start after Competition 28 is complete; it can run in parallel with tickets 29–32 from the shared-shell commit.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 28 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-12 implementation update

Ported Settings to rely on the shared Organizer Desk toolbar as the only page header, promoted settings cards to a consistent section hierarchy, preserved reviewer routing plus Airtable/demo/API-key behavior, and added/updated focused shell assertions. Moved to `in-review`.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
