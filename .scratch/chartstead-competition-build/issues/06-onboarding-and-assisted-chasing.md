# 06 — Onboarding and assisted chasing

**What to build:** A speaker-onboarding workflow in which speakers maintain profiles and complete requested work while organizers see missing information, lateness, readiness risks, and editable reminder drafts without autonomous escalation.

**Blocked by:** 05 — Acceptance cascade and speaker portal.

**Status:** done

- [x] A speaker can edit biography, headshot, and other allowed profile fields from the portal.
- [x] A speaker can complete organizer-created forms and upload or replace requested files.
- [x] The portal keeps incomplete tasks prominent and retains completed work in history.
- [x] An organizer can create tasks with instructions, due dates, assignees, and completion requirements.
- [x] The organizer view shows who is missing what, days until or past due, readiness flags, and last contact.
- [x] Co-speaker details and employer approval can be represented as explicit tasks or readiness flags without altering proposal decision state.
- [x] An organizer can generate or prepare a reminder draft containing the relevant missing work and deadline context.
- [x] The organizer can edit, discard, or explicitly send the draft; creating it never sends automatically.
- [x] Send attempts and outcomes append to communication and task history.
- [x] Authorization tests protect speaker files, private task data, and other speakers' portal records.
- [x] Acceptance tests cover task completion, file replacement, overdue prioritization, draft preparation, explicit send, and failure retention.

## Comments

Shipped on `ticket-06-onboarding`, human QA pass 2026-08-11.

- Portal mutations: profile name/bio/headshot (preview), task complete, file upload/replace
- Organizer Speakers workspace: readiness board, task create, assisted reminder drafts
- Draft create never sends; edit/discard/explicit send via outbox `onboarding_reminder`
- Live Resend delivery not configured in local demo (expected failed/queued without provider)
- Worker tests: `test/worker/onboarding.test.ts`
