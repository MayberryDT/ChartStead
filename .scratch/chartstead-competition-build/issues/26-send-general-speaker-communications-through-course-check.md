# 26 — Send general speaker communications through Course Check

**Status:** in-progress

**Blocked by:** None — can start immediately.

## What to build

Replace the organizer Messages placeholder with a complete general speaker-announcement path built on the existing Communication Course Check and delivery outbox. Organizers should select an event-scoped audience, write and preview the message, review exact recipients, send deliberately, and understand every resulting delivery state without confusing a draft with a send.

## User stories covered

- Competition build stories 24–26, 33–34, 54–56, and 57.

## Acceptance criteria

- [ ] Messages opens a functional event-scoped workspace rather than the current competition-spine placeholder.
- [ ] An organizer can select individual speakers or a filtered readiness group and see exact inclusions, exclusions, and missing addresses.
- [ ] The organizer can compose subject and body content and preview recipient-specific substitutions before creating drafts.
- [ ] Creating drafts never sends; the resulting Communication Course Check freezes message content and the exact recipient set for review.
- [ ] An authorized explicit send uses the existing outbox and records queued, sent, delivered, failed, unknown, retry, and compensation outcomes truthfully.
- [ ] Communication history remains visible from Messages and the relevant organizer or speaker context without exposing another speaker's private data.
- [ ] Stale recipient data, changed message content, invalid addresses, and duplicate send attempts are detected before external delivery.
- [ ] UI, HTTP, provider-boundary, and portal tests cover selection, preview, draft, approval, send, partial failure, retry, and authorization.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred.
