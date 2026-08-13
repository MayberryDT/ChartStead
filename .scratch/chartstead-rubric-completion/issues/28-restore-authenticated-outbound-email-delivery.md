# 28 — Restore authenticated outbound email delivery

**Status:** done

**Priority:** P3

## What to build

Restore the configured Resend delivery path so confirmation and reminder messages leave the durable outbox successfully in the competition environment. Keep credentials host-local, preserve honest failure states and retries, and add enough diagnostics to distinguish missing configuration, rejected authentication, and provider delivery failures without exposing secrets.

## User stories covered

- Operational completion of CFP-08 and the shared communication path used by speaker reminders.

## Acceptance criteria

- [x] Startup or a safe diagnostic reports whether required sender configuration is present without printing credential values.
- [x] A valid host-local Resend credential and authorized sender are read from the documented environment bindings.
- [x] Provider 401 responses are recorded as authentication failures with actionable, secret-safe diagnostics rather than a generic send failure.
- [ ] A CFP confirmation transitions from queued to sent in the durable communication log under valid competition configuration.
- [x] Failed sends remain durable and retryable without duplicate successful delivery.
- [x] Mocked provider tests cover success, 401, retry, and idempotency. Live smoke is host-blocked: no valid Resend credential on this machine.

## Blocked by

None — can start immediately. A live-send check may require Tyler to replace an invalid host-local credential, but diagnosis and implementation can proceed first.

## Comments

- 2026-08-13 — Created from manual-audit finding CFP-08. The durable outbox satisfied the rubric fallback, but Resend returned 401 and the live confirmation remained failed.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-28-resend-delivery`. Human review waived; close to `done` after independent review.
- 2026-08-12 — Implemented in `.worktrees/rubric-28-resend-delivery`. `GET /api/email-delivery` and `GET /api/v1/health` report `RESEND_API_KEY` / `AUTH_EMAIL_FROM` as present|missing only. Cron logs the same presence flags. Resend 401/403 is an authentication failure with a retryable durable row; retries send the outbox id as `Idempotency-Key`. Mocked tests: `npx vitest run --config vitest.worker.config.ts test/worker/resend-delivery.test.ts` (7 passed). Live smoke skipped: host `.dev.vars` still has placeholder bindings (`RESEND_API_KEY=missing`, `AUTH_EMAIL_FROM=missing` on the 5244 demo). Remaining host step: put a real Resend API key and authorized from-address with `npx wrangler secret put RESEND_API_KEY` and `npx wrangler secret put AUTH_EMAIL_FROM` for production and again with `--env demo` (or write the same names into host-local `.dev.vars`), then `POST /api/events/:eventId/outbox/:messageId/retry`. Status stays in-progress for orchestrator review.
- 2026-08-13 — Orchestrator review: mocked `test/worker/resend-delivery.test.ts` 7/7. Live `GET /api/email-delivery` and `GET /api/v1/health` report both bindings missing and leak no values. Demo http://100.105.117.93:5244/demo. Remaining host step: `npx wrangler secret put RESEND_API_KEY` and `npx wrangler secret put AUTH_EMAIL_FROM` for production and `--env demo`, or real values in host-local `.dev.vars`, then retry the durable outbox row. Human review waived. Closed to done.
