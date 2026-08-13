# 17 — Complete bulk and automatic task reminders

**Status:** done

**Blocked by:** Rubric 11 — portal invitations and multi-speaker task scope establish the recipient path.

## What to build

Repair general speaker Communication Course Check creation under accumulated event data, add a first-class bulk outstanding-task reminder action, and support due-date-triggered reminder preparation or sending under explicit event policy. Every automated or manual effect must use the existing Course Check, outbox, and audit semantics.

## User stories covered

- Rubric criteria SPK-13, SPK-16, and CNT-08.

## Acceptance criteria

- [x] General selected/filtered speaker communications create and complete a Communication Course Check under realistic accumulated demo state.
- [x] Organizers can select speakers with outstanding tasks and prepare one bulk reminder operation with task titles and due dates resolved per recipient.
- [x] The UI confirms recipient counts and per-recipient queued, sent, delivered, failed, and retry states.
- [x] An event policy can schedule reminders from due dates while defaulting to draft/review and requiring explicit authority for unattended sending.
- [x] Automatic processing is idempotent, suppresses duplicate reminders within a configured window, and records why each recipient qualified.
- [x] Tests cover accumulated-state regression, filtered bulk sends, personalization, scheduled policy, duplicate suppression, failures, retries, and audit history.

## Blocked by

- Rubric 11 — Assign multi-speaker tasks and send portal invitations.

## Comments

- 2026-08-12 — Initial blocker recorded; this ticket owns both the evaluator-observed Messages failure and the literal reminder criteria.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 11 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Added bulk outstanding-task reminder preparation/queueing, reminder automation policy and due-date processing with duplicate suppression, scheduled worker processing, and organizer UI controls. Focused verification: `npx vitest run --config vitest.worker.config.ts test/worker/onboarding.test.ts -t "bulk task reminders"` and `npx esbuild src/OnboardingWorkspace.tsx --bundle --format=esm --platform=browser --log-level=error --outfile=/tmp/onboarding-workspace.js`.
