# 03 — Guided CFP publishing and submitter follow-up

> **Quarantined WIP:** Before acting on this file, read `/home/halla/ChartStead/.scratch/chartstead-competition-build/TICKET-03-RECOVERY.md`. Its start gate and verification boundary supersede the status and comments below.

**What to build:** A guided organizer workflow for configuring and publishing multiple CFP forms, with draft-versus-published safety, basic conditional behavior, uploads, real confirmation email, and secure signed-link editing for submitters.

**Blocked by:** 02 — First proposal end to end.

**Status:** quarantined-wip

- [x] An organizer can create, name, preview, publish, close, and reopen more than one CFP form for an event.
- [x] The guided builder covers welcome content, proposal fields, track choices, speaker and repeatable co-speaker information, supporting links, and files.
- [x] The supported field set has required settings, ordinary validation, and sentence-readable basic conditions.
- [x] Preview and public production forms use the same runtime and event theme behavior.
- [x] Editing a draft does not alter the published form until the organizer explicitly republishes it.
- [x] A speaker can upload and replace an allowed file with clear progress, limits, and failure recovery.
- [x] Successful submission queues and sends a real branded confirmation email with one clear action.
- [x] The confirmation email contains a secure signed link through which the submitter can edit the proposal.
- [x] Invalid, expired, or revoked signed links fail safely without exposing proposal data.
- [x] Tests cover draft/published separation, conditional behavior, upload failure, confirmation delivery state, and signed-link authorization.

## Comments

Implemented on branch `ticket-03-guided-cfp` atop Ticket 02 (`3e64891`).

### 2026-08-10 remediation verification

Worktree: `.worktrees/ticket-03-guided-cfp`. **No commit / push / merge / deploy** (not authorized).

**Gate A:** signed-token fail-closed + 503 without signing secret; canonical `CfpDefinitionV1`; definition-driven answers + `answers_json`; authoritative uploads (policy, stream PUT, claim); safe `SubmitterEditSession` + full edit via `CfpRuntime`. Security follow-ups: `canonicalizeCfpDefinition`, sanitized object keys, PATCH body bound, closed-form upload block, conditional claim.

**Gate B:** Uppy 5.2.0 (`UppyAssetQuestion`, Strict Mode-safe lifecycle); guided builder revision save machine + field/condition controls; immutable version names + event `themeAccent`; React Email confirmation + outbox retries (1m/5m/30m/2h/12h) + cron `*/5`.

**Commands (exit 0):**
- `npm test` — UI 25, Worker 34, E2E 4
- `npm run typecheck`
- `npm run build` (expected large-chunk warning only)
- `npm run deploy:dry`

**Not proven:** live Resend provider delivery (tests inject sender). Deployment still needs `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and R2 `ASSETS` buckets.

**Review URL (when demo bound 0.0.0.0):** `http://100.105.117.93:4173/e/pacific-open-data-summit-2026/cfp`
