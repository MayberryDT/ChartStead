# 03 — Guided CFP publishing and submitter follow-up

**What to build:** A guided organizer workflow for configuring and publishing multiple CFP forms, with draft-versus-published safety, basic conditional behavior, uploads, real confirmation email, and secure signed-link editing for submitters.

**Blocked by:** 02 — First proposal end to end.

**Status:** done (merged to `main`)

- [x] An organizer can create, name, preview, publish, close, and reopen more than one CFP form for an event.
- [x] The guided builder covers welcome content, proposal fields, track choices, speaker and repeatable co-speaker information, supporting links, and files.
- [x] The supported field set has required settings, ordinary validation, and sentence-readable basic conditions.
- [x] Preview and public production forms use the same runtime and event theme behavior.
- [x] Editing a draft does not alter the published form until the organizer explicitly republishes it.
- [x] A speaker can upload and replace an allowed file with clear progress, limits, and failure recovery.
- [x] Successful submission queues and sends a real branded confirmation email with one clear action.
- [x] The confirmation email contains a secure signed link through which the submitter can edit the proposal.
- [x] Invalid, expired, or revoked signed links fail safely without exposing proposal data.
- [x] Tests cover draft/published separation, conditional behavior, upload failure, confirmation delivery state, and signed-link authorization.

## Comments

Implemented on branch `ticket-03-guided-cfp` (`2cf33f8`), merged to `main`.
