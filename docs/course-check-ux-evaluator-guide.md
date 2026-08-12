# Course Check evaluator guide

This pack supports reproducible automated checks and a future facilitated usability session. Seeded scenarios, browser automation, and agent runs are **product-behavior evidence only**. They are not human usability evidence and must never be reported as participant findings.

## Participant profile

Recruit 5–6 people resembling ChartStead's primary administrator:

- conference or event program administrators;
- association, event-production, or operations staff;
- regular users of spreadsheets and email who are not software specialists.

Include at least one person unfamiliar with ChartStead and at least one person with lower confidence using complex software.

## Session setup

Use only the deterministic fixtures in `shared/course-check-validation.ts`. Do not use production proposals, names, email addresses, message bodies, credentials, or signed links. Start each task from a fresh scenario and record only the allowlisted evidence export from `/api/events/:eventId/course-checks/ux-evidence` plus neutral observer notes.

Tell participants: “Please work as you normally would. I am testing the product, not you. Think aloud if that is comfortable. I may ask what you expect before you choose an action, but I will not tell you which action to choose.”

## Six neutral task prompts

1. **Clean batch:** “These 20 proposals have no reported issues. Accept the batch and tell me what you expect to change before you confirm.”
2. **Missing contact:** “Accept the valid proposals in this group. One speaker has no contact address. Handle that item in the way you think is safest.”
3. **Recipient ambiguity:** “Prepare the acceptance messages for these co-speakers. They share an address and a prior acceptance message is on record. Stop when the drafts are ready for review.”
4. **Mixed batch:** “Apply the eligible decisions while leaving the two blocked submissions unchanged.”
5. **Stale data:** “A speaker record changed after this review was prepared. Continue only when you believe the result is based on current information.”
6. **Outcome check:** “Without changing anything else, explain which decisions changed, which records and drafts now exist, which items stayed unchanged, and whether any external message was sent.”

## Neutral observation questions

- “What do you think this page is for?”
- “What, if anything, has already changed?”
- “What do you expect this action to affect?”
- “What is the difference between this blocker and this warning?”
- “What will happen to the item you skip?”
- “Where would you go to correct this issue?”
- “What do you expect to see after you continue?”

Do not ask whether participants “like Course Check,” suggest an action, define the state for them, or treat completion speed as success when the final explanation is wrong.

## Comprehension questions

After each task, ask without showing the expected answer:

1. How many decisions changed?
2. Which records were created or reused?
3. Are there message drafts? If so, how many?
4. Which items stayed unchanged, and why?
5. Were any external messages sent?
6. Is any provider outcome still pending or unknown?
7. What would be the safest next action?

## Success thresholds

- At least 5 of 6 participants explain final effects correctly without prompting.
- No participant believes draft creation sent a message.
- At least 5 of 6 complete the clean batch without assistance.
- Every issue is repaired, acknowledged, or excluded within two context changes.
- The clean path median is under 30 seconds after selection.
- At least 4 of 6 prefer the consolidated review to the prior sequential flow when both are tested.
- No blocker is bypassed accidentally.
- Warnings do not prevent a valid partial batch.

## Kill conditions

Reconsider the consolidated presentation if representative participants consistently:

- overlook the final-effect summary;
- cannot distinguish decisions from drafts;
- prefer focused inline previews;
- become less accurate when decision and message issues share a page; or
- require more time than the prior flow for ordinary batches.

The safety kernel remains authoritative even if the presentation changes again.

## Evidence handling and report language

The privacy-safe export contains stable classifications, counts, durations, context-change counts, repair paths, errors, stage outcomes, abandonment, and resume events. It never contains actor identity, proposal content, speaker names, addresses, message bodies, provider credentials, or signed links.

Use these labels in reports:

- **Automated acceptance evidence:** assertions from worker, UI, and browser task scripts.
- **Seeded behavior evidence:** aggregated events from deterministic fixtures or agent runs.
- **Human usability evidence:** observations from recruited representative participants only.

If no representative participant session occurred, write: “No human usability session was run. The results below demonstrate seeded product behavior, not user comprehension or preference.”
