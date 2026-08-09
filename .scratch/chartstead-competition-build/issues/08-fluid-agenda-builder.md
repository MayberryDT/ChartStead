# 08 — Fluid agenda builder

**What to build:** A schedule workspace that matches spreadsheet fluidity by preserving unplaced and partially known sessions while adding day-and-room placement, accessible movement, live slot math, and named non-blocking conflict assistance.

**Blocked by:** 05 — Acceptance cascade and speaker portal.

**Status:** ready-for-agent

- [ ] Accepted and directly entered sessions appear in an obvious unplaced pool.
- [ ] A session can save without an exact time or room and displays `TBD` rather than fabricated completeness.
- [ ] An organizer can place and move sessions on a day-and-room grid by drag and drop.
- [ ] Every drag action has a keyboard-accessible Move Session alternative.
- [ ] Partial placement and temporarily conflicting placement both persist successfully.
- [ ] The workspace shows live counts for unplaced sessions and active conflicts.
- [ ] Speaker double-booking identifies the speaker and both affected sessions.
- [ ] Room overlap identifies the room and both affected sessions.
- [ ] Conflict UI offers relevant paths such as moving time, moving room, keeping the current placement, or opening the speaker schedule.
- [ ] Conflict warnings never require a blocking modal or prevent saving the current truth.
- [ ] Calendar update intent is produced when a previously invited session changes schedule.
- [ ] The scheduler adapter spike passes all locked quality and license gates or the native fallback is used.
- [ ] Acceptance tests cover unplaced, `TBD`, drag, keyboard move, conflict persistence, conflict repair, and reload.

## Comments
