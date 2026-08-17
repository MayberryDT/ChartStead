# 25 — Agent API + MCP parity and activity validation

**What to build:** A thorough, reproducible validation (and gap-closing) pass proving that scoped agents can do everything an authorized human can do through the organizer UI — via both the HTTP API and MCP — and that every consequential change is attributed as **agent on behalf of &lt;person&gt;** in entity history and in the organizer activity-by-actor surface from Course Check 24.

**Blocked by:** Course Check 24 — Organizer activity by actor (per-user history).

**Status:** ready-for-agent

## Problem

Course Check **08** shipped the agent API kernel (scopes, modes, provenance, Course Check stage parity). Course Check **13** shipped simple Automation access (API + MCP sharing one key) and a thin MCP bridge (`chartstead_event_api` plus list/prepare helpers). Existing contract tests cover connection, tool listing, credential-path blocks, and Course Check stage authz — not a full desk-parity audit.

Organizers still need proof that:

1. **API and MCP are equal doors** into the same organizer capabilities a human uses in the UI (not a Course-Check-only subset).
2. Agents remain **distinct principals** with optional initiating-human provenance (`X-ChartStead-Initiating-Human`), producing labels like `Program ops agent (agent on behalf of Tyler)`.
3. Those actions are **findable as activity for that person** (and as the agent) once Course Check **24** ships the organizer activity-by-actor view.

Without this ticket, “agents can run the event” stays an assumption resting on docs and partial tests.

## Context (already shipped — do not rebuild)

| Piece | Where |
| --- | --- |
| Agent API contract | `docs/course-check-agent-api-v1.md`, `docs/http-api-v1.md` |
| Connection UX | Settings → Automation access; `docs/ai-connections.md` |
| MCP tools | `worker/mcp.ts` — `chartstead_event_api`, `chartstead_list_event_work`, `chartstead_prepare_decision`, `chartstead_list_course_checks` |
| Actor label helper | `formatCourseCheckActorLabel` in `shared/course-check.ts` |
| Handoff smoke suite | `docs/course-check-agent-handoff-brief.md` (Course Check decision path only) |
| Existing tests | `test/worker/course-check-agent-api.test.ts`, `test/worker/ai-connections.test.ts` |

## Recommended approach

Treat this as a **parity matrix + live agent suite + activity attribution**, not a greenfield API rewrite.

1. **Inventory** — Walk the organizer desk (submissions/review, speakers/onboarding, sessions/placement, tasks, communications/outbox, program/publication, Course Check stages, Settings that agents may *use* but not *mint credentials for*). For each human action, record the v1 path (method + path) and how MCP reaches it (`chartstead_event_api` or a dedicated tool).
2. **Automate the matrix** — Contract tests that, for every in-scope capability, assert: human session path and agent bearer path produce equivalent durable outcomes; MCP tool call produces the same outcome as the equivalent HTTP call under the same key; propose-only / missing-scope / revoked key still fail closed.
3. **Provenance** — Every mutating matrix row runs twice where relevant: with initiating-human header and without. Assert stored actor `kind === "agent"`, optional `initiatingHuman`, and UI/API label text matches `… (agent on behalf of …)` / `… (agent)`.
4. **Activity (depends on 24)** — After agent mutations, open (or query) the activity-by-actor view for the initiating human **and** filter/search by the agent principal. Confirm consequential actions appear with the same on-behalf-of wording and do not look like silent human impersonation.
5. **Gap-close** — When the matrix finds a UI capability with no agent path, a broken MCP bridge, missing audit fields, or activity that drops agent provenance, fix it in this ticket (or file a tiny follow-up only if truly out of scope). Do not leave “known gaps” undocumented.
6. **Human QA pack** — Short Tailscale script: mint key in Automation access → run MCP (Cursor or Claude Code) and raw API against the same seeded event → confirm desk state + activity-by-actor. Extend `docs/course-check-agent-handoff-brief.md` (or a sibling brief) beyond the single decline smoke test so it covers the matrix’s high-value rows.

## Goals

- [ ] Published **parity matrix** (in-repo doc or test table) covering organizer desk capabilities: each row has UI action → v1 HTTP → MCP path → scopes/mode required → activity/attribution expectation.
- [ ] Automated tests prove **human UI/session, agent HTTP, and agent MCP** produce equivalent authorization, durable state, and audit outcomes for every in-scope row (or explicitly mark intentional non-goals such as credential minting / Airtable credential config, which MCP already blocks).
- [ ] Mutating agent calls with `X-ChartStead-Initiating-Human` show **`{agent name} (agent on behalf of {person})`** in Course Check history, entity history where applicable, and Course Check **24** activity-by-actor.
- [ ] Mutating agent calls **without** initiating human show **`{agent name} (agent)`** and never appear as the human’s bare name.
- [ ] Activity-by-actor for the initiating human includes those agent-on-behalf actions; organizers can tell agent work apart from the human acting directly in the UI.
- [ ] Propose-only, scope denial, live revocation, and MCP credential-path blocks remain covered (regressions caught if 08/13 behavior drifts).
- [ ] Updated agent handoff / QA brief lets a non-developer organizer (or Tyler) run a multi-step API **and** MCP acceptance pass against a Tailscale demo, then verify activity attribution.
- [ ] Any parity holes found during the matrix are fixed (or filed with a clear owner) before this ticket leaves `in-review`.

## Non-goals

- Replacing long-lived bearer keys with OAuth / provider wizards (rejected in Course Check 13).
- Letting agents mint API keys or manage Airtable credentials via MCP (keep the existing hard block).
- Building a full SIEM / export-grade audit product (out of Course Check 24 as well).
- Re-litigating Course Check stage semantics already locked in 08–21.

## Origin

Tyler (2026-08-17): thorough testing of MCP and API agent integration; agents must be able to do everything a human can in the UI; changes must attribute as agent on behalf of the person; blocked on Course Check 24 because activity logging / activity-by-actor is the accountability surface for that attribution.

## Comments

- 2026-08-17 — Filed as Course Check 25. Status `blocked` on Course Check 24 (organizer activity by actor). Approach: parity matrix + automated human/API/MCP equivalence + on-behalf-of activity attribution; gap-close where the matrix fails. Kernel and connection UX from 08/13 are prerequisites already `done`.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
