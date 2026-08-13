# 29 — Stabilize the acceptance-test baseline

**Status:** done

**Priority:** P3

## What to build

Make the standard acceptance commands deterministic on Halla and in CI. The full worker suite must pass at its documented concurrency, and Playwright must own or safely reuse an explicitly verified ChartStead server instead of failing whenever the default port is already occupied.

## User stories covered

- Acceptance-audit baseline reliability; no direct product-rubric criterion.

## Acceptance criteria

- [x] The rate-limit case in `test/worker/app.test.ts` and upload-policy case in `test/worker/guided-cfp.test.ts` pass within stable, justified time bounds under `--maxWorkers=4`.
- [x] The fix removes timing races or test isolation problems instead of only increasing every global timeout.
- [x] `npm run test:worker -- --maxWorkers=4` passes from a clean invocation repeatedly.
- [x] The E2E web-server configuration detects whether port 4173 is free, owns a dedicated alternate port, or safely reuses a server only after verifying it is the expected ChartStead instance.
- [x] `npm run test:e2e` starts and completes when another ChartStead development server already occupies port 4173.
- [x] The repository documents the deterministic local and CI commands used by the next rubric acceptance audit.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-13 — Created from the manual-audit baseline. Two worker tests timed out at 5 seconds under four workers, and Playwright refused to start because an existing ChartStead Vite process owned port 4173 with `reuseExistingServer` disabled.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-29-test-baseline`. Human review waived; close to `done` after independent review.
- 2026-08-13 — Isolated quota cases onto dedicated event DOs (`submission-rate-limit-isolation-2026`, `upload-policy-isolation-2026`) so they no longer serialize behind the shared seed DOs under `--maxWorkers=4`. Per-test timeout is 15s only on those sequential HTTP loops, not a global raise. `npm run test:worker -- --maxWorkers=4` passed twice clean (40 files / 265 tests). Playwright now probes 4173, owns 4273+ when occupied, and reuses only a verified ChartStead (`/api/health` + `/api/v1/health`). With Halla :4173 still owned by pid 3790331, `test:e2e` started an isolated server at 4273 (walking-skeleton 1/1 pass; full suite 28/34). Six remaining failures are product UI (axe contrast, review-results overlay intercepting clicks, speaker-directory selector), not port ownership. Docs: README “Acceptance-test baseline” + audit-handoff Phase 1. Status left in-progress for orchestrator review.
- 2026-08-13 — Orchestrator review: quota cases isolated onto dedicated event DOs; rate-limit and upload-policy pass under `--maxWorkers=4`. Playwright owns 4273+ when 4173 is occupied and only reuses a verified ChartStead. Agent evidence: worker suite 265/265 twice; walking-skeleton e2e 1/1 on 4273 while 4173 stayed occupied. Residual: full e2e 28/34 from unrelated product UI, not port ownership. Human review waived. Closed to done.
