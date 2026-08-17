# 63 — Show full message history in the Messages inspector

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

The organizer Messages tab must show real communication history. Tyler’s walkthrough: the desk reports open work (for example “3 open”), but clicking a speaker leaves the right pane empty. Organizers need every historical message for that speaker, and a way to see all event messages — not an empty inspector.

Do not change Course Check send, approval, or outbox semantics. This is history visibility.

## Acceptance criteria

- [ ] Selecting a speaker loads that speaker’s full communication history in the right inspector (draft, queued, sent, delivered, failed, unknown) instead of an empty pane when history exists.
- [ ] There is a working all-history view that lists every event communication, not only the current speaker and not only “open” items.
- [ ] Empty states are truthful: no messages to this speaker vs failed load vs filtered-out. Readiness text such as “3 open” is not presented as a message count.
- [ ] Clicking a history row still opens message detail; Back / All history return to the list.
- [ ] Focused UI tests cover speaker-scoped history, all-history, and the empty-vs-populated inspector.
- [ ] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler walkthrough: Messages says there are three open, but clicking someone shows no messages on the right. Need to see all historical messages.
