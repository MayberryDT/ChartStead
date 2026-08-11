# 02 — First proposal end to end

**What to build:** A narrow but real CFP flow in which an organizer can expose one seeded public form, a speaker can submit a proposal without an account, and the organizer can find that persisted proposal in the submissions workspace.

**Blocked by:** 01 — Walking skeleton and seeded event.

**Status:** done

- [x] The seeded event exposes a public CFP route that does not require organizer authentication.
- [x] A speaker can submit a title, abstract, track, speaker identity, biography, and supporting link.
- [x] Required-field and ordinary validation errors preserve entered values and appear next to the relevant fields.
- [x] A successful submit persists the proposal before showing a confirmation page.
- [x] The proposal receives a stable identifier and permanent detail route at creation.
- [x] The organizer submissions screen renders the new proposal using the locked master-detail UI direction.
- [x] Search by title, speaker, or stable proposal ID finds the proposal.
- [x] Speaker-facing data is accessible publicly only where the CFP requires it; committee data remains private.
- [x] An acceptance test covers public submit, confirmation, organizer lookup, and persistence after reload.

## Comments

Implemented on `ticket-02-first-proposal`. Public CFP at `/e/:eventId/cfp`, permanent public detail at `/e/:eventId/proposals/:proposalId`, organizer master-detail at `/e/:eventId/submissions`.
