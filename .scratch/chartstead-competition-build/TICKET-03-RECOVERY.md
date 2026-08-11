# Ticket 03 recovery handoff

**Status:** blocked. Ticket 03 starts only after Ticket 02 has been reviewed and accepted.

This handoff supersedes the `done` status and verification comments in the existing dirty Ticket 03 worktree.

## Start gate

Use the final accepted Ticket 02 state as the Ticket 03 base. The local `main` merge at `4da4865` is an integration snapshot, not evidence that Ticket 02 has been accepted.

If Ticket 02 is not accepted, stop Ticket 03 work and return control to the Ticket 02 review.

## Current repository state

- Local `main` was clean at `4da4865` on 2026-08-11 and was 12 commits ahead of `origin/main`.
- Course Check documentation is independently committed as `09b8daa`.
- Nothing described here was pushed or deployed.
- The old Ticket 02 branch and worktree were deleted after the local merge; its history remains reachable through `4da4865`.
- The existing Ticket 03 worktree is `.worktrees/ticket-03-guided-cfp` on branch `ticket-03-guided-cfp` at `3e64891`.
- That worktree contains substantial modified and untracked implementation WIP. Preserve it as quarantine evidence; it is not the implementation baseline.

## Existing Ticket 03 WIP

Ticket 03 implementation and remediation work existed before the 2026-08-11 Course Check session. Prior context is recorded in GBrain under:

- `sessions/2026/08/chartstead-ticket-03-kickoff`
- `sessions/2026/08/chartstead-ticket-03-review`
- `sessions/2026/08/chartstead-ticket-03-remediation`

Treat those pages as historical evidence. This recovery handoff is authoritative for the current start procedure.

## Accidental 2026-08-11 edits

During a Course Check documentation session, the agent improperly continued work in the Ticket 03 worktree. The edits were not committed.

- `test/e2e/first-proposal.spec.ts`: changed SurveyJS dropdown selection to a bounded, self-verifying retry helper and routed the public submission test through it.
- `src/CfpBuilderPage.tsx`: moved the form-query error branch before the loading fallback. A regression test was added in `test/ui/app.test.tsx`.
- `src/CfpBuilderPage.tsx`: disabled choice editing for protected dropdown fields.
- `shared/cfp-definition.ts`: began reconstructing the generated welcome HTML from escaped text to close a stored-XSS path.
- `worker/app.ts`: began deriving protected `trackId` choices from current event tracks during draft save and publish.
- `test/ui/cfp-definition.test.ts`, `test/ui/app.test.tsx`, and `test/worker/guided-cfp.test.ts`: added tests for welcome HTML safety, read-only track choices, and server-derived track choices.

## Verification boundary

Before the final HTML-safety and track-choice edits:

- `npm test` passed: UI 26, Worker 34, E2E 4.
- `npm run typecheck` passed.
- `npm run deploy:dry` passed.
- The four-test E2E suite passed three consecutive pressure runs after the dropdown-helper change.
- Codex autoreview accepted the builder loading-state bug; its focused regression test passed after the fix.

The final HTML-safety and track-choice implementation edits were **not** retested, typechecked, or rereviewed. Assume the current dirty worktree can fail.

## Ticket 03 start procedure

1. Confirm the owner has accepted Ticket 02 and identify its final commit. Completion criterion: the accepted commit is explicit, not inferred from `main` or a checked ticket box.
2. Inventory both `main` and the quarantined worktree with `git status`, commit history, and diffs. Completion criterion: every dirty or untracked Ticket 03 file is accounted for before mutation.
3. Preserve the quarantined worktree exactly. Use an archival snapshot or clearly named WIP branch before cleanup; never reset or clean away unknown work.
4. Create the real Ticket 03 branch/worktree from the accepted Ticket 02 commit. Completion criterion: its merge base is the accepted Ticket 02 commit and its working tree starts clean.
5. Read the Ticket 03 issue, `context.md`, `context/BUILD-PLAN.md`, design source of truth, and locked form-builder research. Completion criterion: the implementation plan covers every ticket acceptance criterion and locked architecture constraint.
6. Compare the quarantined WIP against the specification. Port only independently reviewed, in-scope slices with tests; do not bulk-copy or merge the dirty branch.
7. Reproduce and resolve the stored-XSS and event-track findings at the server trust boundary. The UI may reinforce those rules but is not the authority.
8. Run focused tests after each ported slice, then `npm test`, `npm run typecheck`, `npm run deploy:dry`, browser QA, and structured review. Completion criterion: all checks pass from the clean Ticket 03 branch with no accepted review findings.

## Hard boundaries

- Course Check is separate work; Ticket 03 must not implement or reinterpret it.
- Existing checked boxes in the quarantined worktree do not establish completion.
- No Ticket 03 commit, merge, push, or deploy is authorized by this handoff.
