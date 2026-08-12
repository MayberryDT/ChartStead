# 18 — Connected decision-to-draft Course Check workspace

**What to build:** Present final decisions and their downstream communication preparation as one uninterrupted organizer journey with one prioritized review context, while retaining separate authoritative commits for decision application and immutable draft creation.

**Blocked by:** Course Check 15 — Clean Decision Course Check fast path; Course Check 16 — Exception-first batches and partial processing; Course Check 17 — Direct repair actions and preserved review context.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially the executive flow, sections 5.4, 7, and migration step 2, amended by the locked independent-approval boundaries in `context.md`.

## Acceptance criteria

- [x] The organizer no longer finishes a Decision Course Check and encounters a second unfamiliar **Open communication Course Check** destination; the connected workspace advances in place and preserves context.
- [x] Decision and prospective communication issues appear in one prioritized review model with clearly separated effect groups and stage ownership.
- [x] Applying decisions commits only final outcomes and generated internal records; it does not inherit approval for, freeze, or send communication.
- [x] After decisions apply, the same workspace exposes editable message content, recipient reasoning, and the separately authorized **Create drafts** action without a false-completion dead end.
- [x] A communication issue blocks only its affected draft or delivery effect unless event policy explicitly requires an all-or-nothing batch; eligible decisions remain applicable.
- [x] Missing email, missing template, prior communication, duplicate/shared addresses, and co-speaker grouping each expose the direct actions and safe alternatives defined by Course Check 17.
- [x] Clean communication preparation remains compact, while complex recipients, policy gates, or multiple issue types expand the durable workspace.
- [x] Stage-specific permissions, endorsements, digests, idempotency, freshness, and audit remain authoritative and separately visible when relevant.
- [x] Browser navigation, shared URLs, reload, and another authorized administrator resume the exact current stage without replaying completed work.
- [x] Contract, UI, worker, and browser tests prove separate commits, a continuous presentation, partial draft eligibility, no inherited approval, and no external provider call before **Send messages**.

## Comments

- 2026-08-12 — **One coherent workspace** intentionally does not mean one commit. This implements the research direction without weakening ChartStead's locked safety boundaries.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started after Course Check 17 integrated; automated verification remains required, with demos, reviews, and human QA deferred per Tyler's instruction.

- 2026-08-12 — Implemented the connected decision-to-draft presentation with a stable root workspace URL, shareable/reload-safe active stage, explicit decision/draft/send ownership, prioritized recipient exceptions and direct repair/exclusion paths, compact clean states, and independently authorized draft creation. Focused UI 20/20, focused worker 19/19, connected browser 1/1, full UI 88/88, three load-timed worker cases passed 39/39 with a 15-second allowance, typecheck/build passed. Marked done under Tyler's instruction to defer demos, reviews, and human QA.
