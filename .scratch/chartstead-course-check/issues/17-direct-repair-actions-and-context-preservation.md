# 17 — Direct repair actions and preserved review context

**What to build:** Make every Course Check issue an actionable index into a safe repair, precise source record, explicit alternative, acknowledgement, or exclusion while preserving the organizer's batch and review context throughout correction and recheck.

**Blocked by:** Course Check 14 — Truthful decision review projection and receipts.

**Status:** blocked

## Source

`.research/chartstead-course-check-ux-research.md`, especially sections 6.1–6.3, rule 9, section 8.4, and the Issues and Navigation acceptance checklists.

## Acceptance criteria

- [ ] The shared Course Check contract exposes stable issue actions with a specific label, action kind, target, affected entity IDs, and resulting-effect summary; the UI never invents an action unsupported by the rule.
- [ ] Narrow, safe changes such as selecting a template, choosing an existing address, including or excluding a recipient, acknowledging a warning, or skipping an item can be completed inline.
- [ ] Substantial record changes such as editing a speaker, resolving identity, changing placement, or repairing an integration conflict open the exact source object and field rather than a generic management page.
- [ ] Every issue offers at least one valid path: direct repair, exact deep link, safe alternate effect, acknowledgement where policy permits, or explicit exclusion.
- [ ] Returning from a repair restores the selected batch, filters, scroll position, expanded issue, draft choices, and keyboard focus.
- [ ] Revalidation runs over the smallest dependency-safe scope; shared identity, template, policy, recipient, schedule, and integration dependencies can invalidate every affected item rather than promising unsafe row-only checking.
- [ ] Unaffected stages and previously completed commits remain intact when their frozen inputs and policy authority have not changed.
- [ ] Changed inputs are named in business language and link back to the affected object where the viewer has permission.
- [ ] Role boundaries and redaction apply to actions and targets so a reviewer cannot infer or edit restricted recipient, committee, or integration data.
- [ ] Tests cover inline repair, deep repair and return, bulk repair, alternative effects, exclusion, shared-dependency invalidation, unauthorized targets, and keyboard focus restoration.

## Comments

- 2026-08-12 — May execute in parallel with Course Check 15 and 16 after Course Check 14; it does not depend on human visual direction.
