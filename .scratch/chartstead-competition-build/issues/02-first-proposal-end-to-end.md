# 02 — First proposal end to end

**What to build:** A narrow but real CFP flow in which an organizer can expose one seeded public form, a speaker can submit a proposal without an account, and the organizer can find that persisted proposal in the submissions workspace.

**Blocked by:** 01 — Walking skeleton and seeded event.

**Status:** ready-for-agent

- [ ] The seeded event exposes a public CFP route that does not require organizer authentication.
- [ ] A speaker can submit a title, abstract, track, speaker identity, biography, and supporting link.
- [ ] Required-field and ordinary validation errors preserve entered values and appear next to the relevant fields.
- [ ] A successful submit persists the proposal before showing a confirmation page.
- [ ] The proposal receives a stable identifier and permanent detail route at creation.
- [ ] The organizer submissions screen renders the new proposal using the locked master-detail UI direction.
- [ ] Search by title, speaker, or stable proposal ID finds the proposal.
- [ ] Speaker-facing data is accessible publicly only where the CFP requires it; committee data remains private.
- [ ] An acceptance test covers public submit, confirmation, organizer lookup, and persistence after reload.

## Comments
