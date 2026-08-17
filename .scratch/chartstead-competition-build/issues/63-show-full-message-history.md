# 63 — Show full message history in the Messages inspector

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

The organizer Messages tab must show real communication history. Tyler’s walkthrough: the desk reports open work (for example “3 open”), but clicking a speaker leaves the right pane empty. Organizers need every historical message for that speaker, and a way to see all event messages — not an empty inspector.

Do not change Course Check send, approval, or outbox semantics. This is history visibility.

## Acceptance criteria

- [x] Selecting a speaker loads that speaker’s full communication history in the right inspector (draft, queued, sent, delivered, failed, unknown) instead of an empty pane when history exists.
- [x] There is a working all-history view that lists every event communication, not only the current speaker and not only “open” items.
- [x] Empty states are truthful: no messages to this speaker vs failed load vs filtered-out. Readiness text such as “3 open” is not presented as a message count.
- [x] Clicking a history row still opens message detail; Back / All history return to the list.
- [x] Focused UI tests cover speaker-scoped history, all-history, and the empty-vs-populated inspector.
- [x] A Tailscale demo URL and what-to-test list are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler: scrap Ticket 63 work. Prior behavior was fine; “3 open” confusion was onboarding readiness, not message opens. No code change / no merge. Worktree and branch removed; marked done.

- 2026-08-16 — Tyler: history still wrong/slow. Root cause: Messages UI only listed Course Check communication plans; seeded/sent mail lives in outbox_messages. “3 open” is onboarding tasks, not opened messages. Fixing UI to show all outbound outbox (+ plans) per speaker; skipping inbound speaker→organizer (rabbit hole). Killing extra demos for speed.

- 2026-08-17 — Single-demo QA URL (other batch demos killed to keep host responsive): http://100.105.117.93:5863/demo → Messages. 64–67 merged to main and marked done.

- 2026-08-16 — Still open for Tyler QA (not merged). Demo will be on single port with 63 worktree.

- 2026-08-17 — Tyler walkthrough: Messages says there are three open, but clicking someone shows no messages on the right. Need to see all historical messages.
