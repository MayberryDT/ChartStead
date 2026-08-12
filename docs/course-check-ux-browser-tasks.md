# Course Check seeded browser task scripts

These six scripts use the deterministic descriptors in `shared/course-check-validation.ts`. Run each from fresh seeded state. Record the privacy-safe evidence export after every task. Passing scripts are automated product-behavior evidence, never human usability evidence.

## Assertions shared by every script

1. Open the exact Course Check plan URL.
2. Assert the business-action title and pre-action boundary.
3. Assert each visible issue classification and declared action.
4. Perform only the task's declared action.
5. Reload the plan URL to prove durable state.
6. Assert decisions changed, records created/reused, drafts present, items unchanged, and external messages sent against `expectedTruth`.
7. Fetch `/api/events/:eventId/course-checks/ux-evidence`; assert the scenario journey contains no personal fields and is labeled `seeded_or_product_behavior_not_human_usability`.

## Scenario scripts

- `clean-20`: choose the compact confirmation; assert 20 accepted, related record count positive, zero drafts, zero unchanged, zero email sent, and action-to-commit duration captured.
- `missing-contact`: use repair or explicit exclusion; assert 9 decisions applied, one unchanged, zero drafts, zero email sent, and an issue-action classification of fix or exclude.
- `recipient-ambiguity`: acknowledge shared-address/prior-message evidence and freeze exact drafts; assert drafts exist and zero external messages were sent.
- `mixed-eligible-skipped`: continue with eligible items; assert 6 decisions applied and exactly 2 unchanged, with exclusion evidence recorded once idempotently.
- `stale-recheck`: change the relevant fixture revision, assert Out of date, recheck affected dependencies, and assert no decision or delivery occurs from the stale plan.
- `outcome-comprehension`: after durable completion, assert the result surface independently states decisions, records, drafts, unchanged items, and “No emails were sent.”

The executable worker and browser contracts import the same descriptors so task wording and expected truth cannot drift silently.
