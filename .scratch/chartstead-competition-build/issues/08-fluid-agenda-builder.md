# 08 — Fluid agenda builder

**What to build:** A schedule workspace that matches spreadsheet fluidity by preserving unplaced and partially known sessions while adding day-and-room placement, accessible movement, live slot math, and named non-blocking conflict assistance.

**Blocked by:** 05 — Acceptance cascade and speaker portal.

**Status:** done

- [x] Accepted and directly entered sessions appear in an obvious unplaced pool.
- [x] A session can save without an exact time or room and displays `TBD` rather than fabricated completeness.
- [x] An organizer can place and move sessions on a day-and-room grid by drag and drop.
- [x] Every drag action has a keyboard-accessible Move Session alternative.
- [x] Partial placement and temporarily conflicting placement both persist successfully.
- [x] The workspace shows live counts for unplaced sessions and active conflicts.
- [x] Speaker double-booking identifies the speaker and both affected sessions.
- [x] Room overlap identifies the room and both affected sessions.
- [x] Conflict UI offers relevant paths such as moving time, moving room, keeping the current placement, or opening the speaker schedule.
- [x] Conflict warnings never require a blocking modal or prevent saving the current truth.
- [x] Calendar update intent is produced when a previously invited session changes schedule.
- [x] The scheduler adapter spike passes all locked quality and license gates or the native fallback is used.
- [x] Acceptance tests cover unplaced, `TBD`, drag, keyboard move, conflict persistence, conflict repair, and reload.

## Comments

### Spike decision (2026-08-11)

**Native day/room grid chosen** (DayPilot Lite not adopted).

Evidence gates from BUILD-PLAN:
- Theme / Harbor Master Desk track pastels: native CSS tokens (`--schedule-*`)
- Unplaced pool + TBD labels: first-class placement status
- Non-blocking conflicts: detect after save; never 4xx for conflict-only
- External pool drag + keyboard Move Session: both paths call same PATCH
- Lite-only license clean: no vendor scheduler dependency added

### Implementation notes

- Branch/worktree: `ticket-08-fluid-agenda` / `.worktrees/ticket-08-fluid-agenda`
- APIs: `GET/PATCH /api/events/:eventId/sessions[/:sessionId]` (admin)
- Conflict engine: `shared/schedule-conflicts.ts`
- Calendar: durable `calendar_intents` create/update rows + stable `calendar_uid` / sequence (no provider send)
- UI: `/e/$eventId/agenda` → `AgendaWorkspace`
