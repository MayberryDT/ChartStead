# 26 — Send general speaker communications through Course Check

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Replace the organizer Messages placeholder with a complete general speaker-announcement path built on the existing Communication Course Check and delivery outbox. Organizers should select an event-scoped audience, write and preview the message, review exact recipients, send deliberately, and understand every resulting delivery state without confusing a draft with a send.

## User stories covered

- Competition build stories 24–26, 33–34, 54–56, and 57.

## Acceptance criteria

- [x] Messages opens a functional event-scoped workspace rather than the current competition-spine placeholder.
- [x] An organizer can select individual speakers or a filtered readiness group and see exact inclusions, exclusions, and missing addresses.
- [x] The organizer can compose subject and body content and preview recipient-specific substitutions before creating drafts.
- [x] Creating drafts never sends; the resulting Communication Course Check freezes message content and the exact recipient set for review.
- [x] An authorized explicit send uses the existing outbox and records queued, sent, delivered, failed, unknown, retry, and compensation outcomes truthfully.
- [x] Communication history remains visible from Messages and the relevant organizer or speaker context without exposing another speaker's private data.
- [x] Stale recipient data, changed message content, invalid addresses, and duplicate send attempts are detected before external delivery.
- [x] UI, HTTP, provider-boundary, and portal tests cover selection, preview, draft, approval, send, partial failure, retry, and authorization.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred.
- 2026-08-12 — Implemented the event-scoped Messages workspace on the locked organizer shell, exact individual/readiness-group audience selection, recipient substitutions, communication history, and a non-sending handoff into the authoritative Communication Course Check. Direct speaker scope no longer expands silently to co-speakers; draft freeze renders and freezes each recipient payload; stale speaker identity/address data blocks drafts while the existing explicit send, outbox, retry, reconciliation, compensation, redaction, and idempotency boundaries remain authoritative. Verification: UI 82/82 passed; ticket worker communication/delivery 18/18 passed; the full worker run reached 185/186 because the unrelated guided-CFP upload test exceeded its five-second timeout, then that test passed alone. The competition-spine browser file passed 3/3 and the broad browser suite passed 17/18; its sole failure is the pre-existing Agenda card contrast violation (ratios 3.78–4.1 against 4.5). Typecheck and production build passed. Status intentionally remains in-progress for parent integration.
- 2026-08-12 — Parent integration rebased the Messages work over the completed speaker directory without losing either route or organizer-shell context. Post-rebase verification passed typecheck, the integrated organizer UI file (28/28), and the focused Communication Course Check worker file (10/10). Tyler explicitly deferred demos, reviews, and human QA for this batch, so the ticket is closed on automated acceptance evidence.
