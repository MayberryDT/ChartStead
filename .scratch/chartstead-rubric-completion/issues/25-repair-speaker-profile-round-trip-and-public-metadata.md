# 25 — Repair speaker profile round trip and public metadata

**Status:** done

**Priority:** P2

## What to build

Make professional speaker data survive the complete portal-to-organizer-to-public journey. A speaker's validated social links must persist when saved through the portal, while the competition fixture and published projection must provide populated job title and company values anywhere the rubric requires them.

## User stories covered

- Rubric criteria SPK-08, EMB-01, EMB-04, and EMB-12.

## Acceptance criteria

- [x] Saving documented HTTPS social links in the speaker portal persists them and shows the same values after reload.
- [x] Organizer speaker detail reads the persisted links without overwriting biography, headshot, event-time title, or organization snapshots.
- [x] Publishing preserves public-safe social links, job title, and company while continuing to exclude private speaker data.
- [x] The competition demo fixture includes populated title and company values for the speakers used by Sessions List, Speakers List, and Speaker Gallery acceptance checks.
- [x] All three public surfaces render the populated professional metadata from the canonical published projection.
- [x] Worker, UI, and fresh browser acceptance checks prove the portal save round trip and public rendering.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-13 — Created from manual-audit findings SPK-08 and EMB-01/04/12. The live portal dropped `socialLinks`, and public fixtures rendered missing-title/company fallbacks. This remediation ticket does not reopen or modify Rubrics 12, 19, or 20.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-25-speaker-metadata`. Human review waived; close to `done` after independent review.
- 2026-08-13 — Worktree implementation (leave in-progress). Portal PATCH now forwards validated HTTPS `socialLinks`. Organizer detail reads persisted links without rewriting biography, headshot, or event-time snapshots. Seed/public projection fills Ada/Grace/Katherine title+company. Focused tests: `npx vitest run --config vitest.config.ts test/ui/speaker-portal-profile.test.tsx test/ui/public-program.test.tsx test/ui/public-program-helpers.test.ts` (17 pass); `npx vitest run --config vitest.worker.config.ts test/worker/onboarding.test.ts test/worker/speaker-directory.test.ts test/worker/public-program.test.ts` (26 pass). Browser: sessions/speakers/gallery at :5241 show populated title · company, no pending fallbacks. Demo `http://100.105.117.93:5241/e/pacific-open-data-summit-2026/program/speakers` bound `0.0.0.0:5241`. Residual: Course Check still plans empty `organizationSnapshot` for newly accepted speakers until a later publish; this ticket did not reopen Rubrics 12/19/20.
- 2026-08-13 — Independent finish pass (leave in-progress). Restored publish privacy `email` assertion; tightened leftover organizer/headshot and seed-speaker tests. Files: `worker/app.ts`, `src/api.ts`, `shared/public-program.ts`, `worker/event-store.ts`, `test/worker/onboarding.test.ts`, `test/worker/speaker-directory.test.ts`, `test/worker/public-program.test.ts`, `test/ui/public-program-helpers.test.ts`, `test/ui/public-program.test.tsx`, `test/ui/speaker-portal-profile.test.tsx`. Tests: `npm run test:worker -- test/worker/onboarding.test.ts test/worker/speaker-directory.test.ts test/worker/public-program.test.ts` (26 pass); `npm run test:ui -- test/ui/public-program-helpers.test.ts` (6 pass). Browser-checked `/program/sessions`, `/program/speakers`, `/program/speaker-gallery` — Ada/Grace/Katherine show populated title · company, no pending fallbacks. Demo `http://100.105.117.93:5241/e/pacific-open-data-summit-2026/program/speakers` on `0.0.0.0:5241`.
- 2026-08-13 — Orchestrator review: live speakers/sessions/gallery at http://100.105.117.93:5241 show Ada/Grace/Katherine title · company with no pending fallbacks. Focused UI 17/17 and worker 26/26. Human review waived. Closed to done.
