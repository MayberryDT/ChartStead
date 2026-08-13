# 26 — Complete the reviewer-only scoring acceptance path

**Status:** done

**Priority:** P2

## What to build

Give a track reviewer one coherent, role-scoped review journey: the shell only exposes reviewer-appropriate destinations, and the visible review controls submit an accepted status vocabulary plus rating and comment that persist and reappear after reload. Organizer authorization remains enforced independently of navigation visibility.

## User stories covered

- Rubric criteria CFP-10 and CFP-11.

## Acceptance criteria

- [x] A track reviewer sees the review queue and reviewer-appropriate navigation, with organizer-only Forms, Speakers, Agenda, Messages, Embeds, and Settings destinations absent.
- [x] Direct organizer URLs and mutations remain server-authorized and reject the reviewer even if manually requested.
- [x] The rendered review form and API use one documented status vocabulary; every offered decision can be stored successfully.
- [x] A reviewer can save rating 4 plus the rubric fixture comment and see both after a full reload.
- [x] The organizer can see the stored decision, rating, comment, reviewer identity, and timestamp without exposing other reviewers' private drafts.
- [x] Role, mutation, persistence, reload, and live competition-persona acceptance checks cover the exact audited path.


## Blocked by

None — can start immediately.

## Comments

- 2026-08-13 — Created from manual-audit findings CFP-10 and CFP-11. The reviewer was correctly blocked from admin writes but still saw organizer navigation, and the live review mutation returned `Unknown review status` without storing rating or comment.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-26-reviewer-scoring`. Human review waived; close to `done` after independent review.
- 2026-08-12 — Implementation complete in `.worktrees/rubric-26-reviewer-scoring`, left **in-progress** for orchestrator review. Reviewer nav is Overview + Submissions only; organizer destinations stay server-403. Review PATCH accepts `unreviewed|approve|maybe|deny` plus aliases `approved`/`denied`. Lightweight rating 4 + fixture comment persist without an advanced scorecard. Demo `http://100.105.117.93:5242/demo`. Focused tests: organizer-shell 5/5, review + demo-personas + evaluation-plans 21/21 plus added draft-isolation case. Do not mark done.
- 2026-08-13 — Orchestrator review: live track-reviewer persona at http://100.105.117.93:5242/demo shows Overview + Submissions only. Forms API 403. PATCH `approved` + rating 4 + fixture comment stored as `approve` and scorecard overall=4 after reload. Focused UI 5/5 and worker review/demo-personas 14/14. Human review waived. Closed to done.

