# 03 — Communication drafts and recipient reasoning

**What to build:** A linked Communication Course Check that turns applied outcomes or selected speaker work into editable drafts with exact co-speaker recipient reasoning and no external delivery until separately approved.

**Blocked by:** 02 — Batch decisions and shared workspace.

**Status:** ready-for-agent

- [ ] A completed Decision Course Check can create a linked Communication Course Check without transferring approval.
- [ ] Staff can also start a Communication Course Check directly from an authorized selection of proposals, sessions, speakers, or tasks.
- [ ] Recipient review groups all relevant speakers for one proposal or session while preserving address-level deliverability.
- [ ] Every included recipient has a plain-language inclusion reason.
- [ ] Missing, excluded, duplicate, and shared addresses remain visible with their reasons.
- [ ] Prior related communication, provider state, and previous acceptance or decline sends appear before draft approval.
- [ ] Staff can edit subject and body content before creating durable drafts.
- [ ] Editing content or recipient selection creates a new immutable plan version and invalidates only dependent draft/send approval.
- [ ] `Create drafts` freezes rendered subject, body, recipients, attachment references, and calendar intent without sending anything.
- [ ] Draft creation is transactional and idempotent across the complete selected scope.
- [ ] Decision state, draft state, send state, and delivery state remain independently visible.
- [ ] Reviewers without communication authority cannot inspect private recipient or draft evidence.
- [ ] Tests cover co-speaker grouping, recipient reasons, exclusions, prior sends, edits, stale recipients/templates, role projection, exact frozen payloads, and absence of provider calls.
