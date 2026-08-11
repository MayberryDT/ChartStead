# ChartStead Course Check

Status: ready-for-agent

## Problem Statement

Conference-program staff make decisions that cross several operational modules. Final proposal outcomes may create speakers, event-participation history, sessions, onboarding work, communication drafts, calendar intent, and integration writes. A schedule release may change attendee-facing pages, embeds, calendars, and Airtable while incomplete private work remains valid. A message send may resolve hundreds of recipients across co-speaker groups, prior contact, missing addresses, and independent delivery outcomes.

Today, operators commonly reconstruct these consequences from tables, spreadsheets, inboxes, schedules, and provider dashboards. Module-specific confirmation dialogs cannot show the complete result. They also tend to produce inconsistent safety semantics across organizer UI, authenticated API, imports, integrations, background jobs, and AI agents.

ChartStead must make these consequential actions inspectable without imposing ceremony on ordinary conference work. Staff under deadline pressure still need to correct information, record internal review dispositions, draft communication, and save incomplete or conflicting private schedules immediately. The product must preserve partial truth while preventing stale, unauthorized, ambiguous, or corrupting execution.

## Solution

Build **Course Check**, ChartStead's consequence-aware review layer. Course Check shows the exact versioned result of a consequential action before that action applies final outcomes, sends communication, publishes a program, delivers calendars, or writes externally.

The first release covers three linked action families:

1. Final proposal outcomes and acceptance cascades.
2. Speaker communication and calendar delivery.
3. Public-program publication and revision, including related integration writes.

Course Check is not a universal staging step. Ordinary private writes remain immediate through the same authoritative server command path. Course Check appears only where one action fans out across durable records, people, public state, or external systems.

One event-scoped safety kernel provides plan versioning, targeted freshness checks, stage approval, idempotency, transactional internal application, effect outbox creation, per-effect results, retry classification, compensation history, and audit. Three specialized planners preserve decision, communication, and publication semantics. The organizer interface, authenticated API, integrations, and scoped AI agents use the same versioned contract.

## User Stories

1. As an event administrator, I want ordinary profile corrections to save immediately, so that Course Check never obstructs time-sensitive data entry.
2. As an event administrator, I want internal notes to save without a separate plan, so that private coordination remains fast.
3. As a reviewer, I want to change `unreviewed / approve / maybe / deny` immediately, so that reversible deliberation remains conversational.
4. As an event administrator, I want private message drafts to remain freely editable, so that drafting does not imply sending.
5. As an event administrator, I want private schedule moves to save despite conflicts, so that ChartStead records current operational truth.
6. As an event administrator, I want `TBD`, unplaced, and incomplete schedule states to remain valid, so that the application does not force invented completeness.
7. As an event administrator, I want final program outcomes to remain separate from review dispositions, so that committee sentiment does not silently commit the program.
8. As an event administrator, I want applying accepted or declined outcomes to open Course Check, so that I can inspect the exact final batch.
9. As an event administrator, I want acceptance to show every proposal transition, so that I know what internal state will change.
10. As an event administrator, I want acceptance to show which speakers will be created or reused, so that duplicate identities are caught before application.
11. As an event administrator, I want acceptance to show each event-participation snapshot, so that historical title and organization remain accurate.
12. As an event administrator, I want acceptance to show sessions and onboarding tasks that will be created, so that the cascade is predictable.
13. As an event administrator, I want co-speaker identities and portal access included in the plan, so that every participant is handled deliberately.
14. As an event administrator, I want direct guaranteed-speaker creation to use a compact Course Check when it creates connected records, so that sponsor and invited sessions get the same integrity guarantees.
15. As an event administrator, I want one blocked proposal identified inside a batch, so that I can resolve or defer it without losing the remaining work.
16. As an event administrator, I want deferring an item to create a new exact plan version, so that the applied scope never changes silently.
17. As an event administrator, I want the remaining internal batch to apply atomically, so that it cannot leave a half-created acceptance cascade.
18. As an event administrator, I want final decisions to apply without creating or sending communication unless I approve that stage, so that deciding and telling remain separate.
19. As an event administrator, I want a Decision Course Check to create a linked Communication Course Check, so that downstream work remains connected without inheriting approval.
20. As an event administrator, I want communication review organized by proposal or session recipient group, so that co-speakers receive coherent context.
21. As an event administrator, I want exact recipient inclusion reasons, so that I can explain why every person will be contacted.
22. As an event administrator, I want exclusions, missing addresses, duplicate addresses, and shared addresses exposed, so that audience mistakes are corrected before send.
23. As an event administrator, I want prior related communication and delivery state shown, so that I do not resend a decision accidentally.
24. As an event administrator, I want rendered subject, body, attachments, and calendar semantics frozen in the approved plan, so that execution cannot change the message invisibly.
25. As an event administrator, I want each deliverable address tracked independently, so that one failure does not hide or repeat other deliveries.
26. As an event administrator, I want message and calendar sending to remain a separate explicit action, so that draft creation never implies external delivery.
27. As an event administrator, I want calendar creation, update, and cancellation shown with stable UID and next sequence, so that clients do not create duplicate invitations.
28. As an event administrator, I want private schedule work to remain separate from public release, so that incomplete planning never leaks.
29. As an event administrator, I want Program Publication Course Check to compare the working schedule with the current public revision, so that I can inspect the attendee-facing delta.
30. As an event administrator, I want additions, removals, time changes, room changes, speaker changes, and visibility changes shown, so that public impact is scanable.
31. As an event administrator, I want unplaced and private sessions excluded by default, so that only a valid subset becomes public.
32. As an event administrator, I want `TBD` time or room represented honestly where the session is otherwise publishable, so that partial public truth remains possible.
33. As an event administrator, I want known schedule conflicts visible before release, so that I can resolve, exclude, or deliberately override them.
34. As an event administrator, I want a material warning override at publication to require a short reason, so that future staff understand the decision.
35. As an event administrator, I want calendar updates created by publication to enter a linked Communication Course Check, so that publication never silently contacts speakers.
36. As an event administrator, I want Airtable writes caused by a consequential action shown before execution, so that external data changes are deliberate.
37. As an event administrator, I want an unavailable integration isolated from valid internal work, so that Airtable cannot freeze the event operation.
38. As an event administrator, I want ordinary mapped Airtable fields to synchronize without Course Check ceremony, so that routine sync remains useful.
39. As an event administrator, I want inbound Airtable changes that would alter outcomes, communication, or public state to require Course Check or be excluded, so that external edits cannot bypass policy.
40. As an event administrator, I want a stable evidence hierarchy led by irreversible effects and people, so that the most consequential information appears first.
41. As an event administrator, I want clean low-risk sections collapsed, so that Course Check remains concise.
42. As an event administrator, I want warnings and unknowns expanded automatically, so that risks cannot hide in disclosure controls.
43. As an event administrator, I want Course Check to be a dedicated resumable workspace, so that large reviews are not squeezed into confirmation modals.
44. As an event administrator, I want Course Checks shared with the authorized event team, so that another administrator can continue urgent work.
45. As an event administrator, I want every plan action attributed to its actor, so that shared operation remains accountable.
46. As an event administrator, I want a stage-specific verb to approve and begin execution, so that I do not click redundant approve and execute buttons.
47. As an event administrator, I want to leave the page while external work continues, so that large sends and syncs do not hold my browser hostage.
48. As an event administrator, I want durable in-app completion and attention states, so that I can return to accurate execution results.
49. As an event administrator, I want only relevant changes to invalidate a plan, so that unrelated event edits do not create needless rework.
50. As an event administrator, I want changed inputs identified when a plan becomes out of date, so that I know what requires another review.
51. As an event administrator, I want old but unchanged external plans warned after an event-configurable threshold, so that age creates attention without arbitrary rejection.
52. As an event administrator, I want editing a plan to create a new immutable version, so that approval always refers to exact evidence.
53. As an event administrator, I want only dependent stage approvals invalidated, so that editing one message does not reopen applied decisions.
54. As an event administrator, I want authorization checked again at execution, so that revoked authority cannot execute an old approval.
55. As an event administrator, I want missing authority to block without a break-glass bypass, so that role controls remain real.
56. As an event administrator, I want identity ambiguity to block only the affected cascade, so that duplicate people and sessions are not created.
57. As an event administrator, I want soft readiness and schedule warnings to remain overridable, so that ChartStead preserves partial truth.
58. As an event administrator, I want unsafe external effects removable or deferrable, so that unaffected stages can proceed.
59. As an event administrator, I want one execution result per external effect, so that partial failure never appears as a green batch success.
60. As an event administrator, I want transient failures retried with a bounded policy, so that temporary provider outages recover safely.
61. As an event administrator, I want permanent failures surfaced immediately, so that retries do not waste time or duplicate work.
62. As an event administrator, I want unknown outcomes to stop blind retry, so that ambiguous provider responses do not create duplicates.
63. As an event administrator, I want successful effects preserved during retry, so that recovery never repeats completed work.
64. As an event administrator, I want compensation to be a new reviewed action with a reason, so that corrections remain honest and auditable.
65. As an event administrator, I want public rollback to create a new current revision, so that history is never erased.
66. As an event administrator, I want email correction labeled as compensation rather than undo, so that ChartStead never claims sent mail was recalled.
67. As an event administrator, I want optional stricter event policies, so that larger teams can require two-person approval or stronger role separation.
68. As an event administrator, I want stricter policies unable to weaken baseline protections, so that configuration cannot create an unsafe bypass.
69. As an API client, I want a versioned machine-readable Course Check contract, so that automation can inspect exact plans reliably.
70. As an API client, I want stable plan, stage, action, entity, and effect identifiers, so that retries and reconciliation remain deterministic.
71. As an API client, I want idempotency keys at command and effect boundaries, so that repeated requests return or resume existing work.
72. As an AI agent, I want complete API parity with the organizer interface, so that I can operate the full event workflow when authorized.
73. As an AI agent, I want to create, inspect, revise, approve, execute, defer, retry, reconcile, and compensate plans, so that agent control is not artificially partial.
74. As an event administrator, I want agent permissions scoped by event and stage, so that authority can be granted precisely.
75. As an event administrator, I want to grant all Course Check scopes when desired, so that a fully delegated agent can control the application.
76. As an event administrator, I want agent operating modes for propose-only, delegated execution, and autonomous policy execution, so that autonomy is explicit.
77. As an event administrator, I want autonomous consequential behavior disabled until explicitly granted, so that connecting an agent does not imply unsupervised authority.
78. As an auditor, I want agents represented as distinct principals with optional human-request provenance, so that they never silently impersonate users.
79. As an auditor, I want the exact plan digest, approvals, attempts, outcomes, and compensation chain retained, so that execution can be reconstructed.
80. As a privacy administrator, I want secrets and signed links excluded from plans, so that audit artifacts do not become credential stores.
81. As a privacy administrator, I want personal payloads redactable while operational metadata remains, so that privacy handling does not rewrite history falsely.
82. As a reviewer, I want Course Check evidence restricted to my assigned tracks, so that committee privacy remains intact.
83. As a speaker, I want no access to committee plans, recipient reasoning, or internal warnings, so that private operations never leak.
84. As an attendee, I want no exposure to internal Course Check state, so that only approved public revisions are visible.
85. As an evaluator, I want one walkthrough showing acceptance, communication, publication, integration, failure, recovery, and agent control, so that Course Check proves more than a confirmation modal.

## Implementation Decisions

- Use **Course Check** as the customer-facing capability name. Use literal stage actions such as `Review changes`, `Apply decisions`, `Create drafts`, `Send messages`, `Publish program`, and `Write to Airtable`.
- Keep implementation terms such as manifest, effect graph, planner, safety kernel, and control plane out of nontechnical interface copy.
- Treat reversible review disposition and final program outcome as separate concepts. `unreviewed / approve / maybe / deny` remains immediate internal review. Accepted or declined final outcomes use Decision Course Check.
- Use three linked Course Check action types: decision cascade, speaker communication, and program publication. Do not build one giant cross-module plan or transfer approval between linked plans.
- Use one event-scoped safety kernel with closed action types. The kernel owns plan lifecycle, targeted freshness, approval, internal transactions, idempotency, external-effect state, retry, reconciliation, compensation history, and audit.
- Keep action-specific planning behind specialized decision, communication, and publication modules. Do not expose a caller-defined workflow graph, generic effect language, stage plug-in registry, or full event-sourced query architecture.
- Keep UI, authenticated HTTP API, import, integration, background, and AI-agent callers on the same authoritative command and Course Check path.
- Classify commands explicitly as ordinary, decision cascade, external communication, public release, or related integration effect. Unknown action types fail closed until classified deliberately.
- Execute ordinary commands in one interaction without a separate Course Check workspace. Their server path still performs authorization, validation, targeted revision checking, persistence, and required audit.
- Build plans from local event state. Planning must not depend on live email, calendar, Airtable, or other network availability.
- Freeze each plan version's normalized request, relevant input revisions, derived deltas, findings, stage scope, rendered external payloads, effect identities, and digest.
- Mark only dependent stages out of date when a relevant input changes. Recheck authority and revisions immediately before every stage execution.
- Show an age warning for unchanged external plans after an event-configurable threshold with a 24-hour default. Age never replaces revision checks and is not a hard block.
- Store Course Checks as shared resumable event resources. Every mutation creates a new immutable version; no caller edits a reviewed version in place.
- Record stage approval and execution through one explicit stage-specific command. The approved digest and plan version are stored before or atomically with stage start.
- Use these independently approved consequence boundaries: internal final outcomes and generated records; communication draft creation; email and calendar delivery; public publication; integration writes.
- Permit authorized administrators to self-approve. Support stricter event policies, including two-person approval, without making them the baseline.
- Restrict hard blockers to missing authority, relevant revision mismatch, unresolved identity ambiguity, durable invariant violation, and external effects that cannot be previewed safely.
- Do not provide a universal hard-block override. Resolve authority, refresh stale plans, resolve identity, correct invalid data, or remove/defer unsafe effects.
- Permit soft-warning overrides. Require a reason only when a material warning is overridden at send, calendar, publication, or integration boundaries.
- Let operators defer blocked items explicitly. Deferral produces a new exact plan version and a follow-up queue item; remaining internal changes still commit atomically.
- Apply internal record changes, audit events, idempotency receipts, and external-effect outbox rows in one Durable Object SQLite transaction. Perform no network I/O inside that transaction.
- Persist one independently observable effect per deliverable address, calendar operation, public revision, or integration write. Recipient groups remain the review unit while address-level outcomes remain visible.
- Use stable effect identity and frozen payloads for retry. Never regenerate content from current records during retry.
- Retry only classified transient failures with bounded backoff. Persist permanent failures and exhausted retries for staff action.
- Represent ambiguous provider outcomes as `Needs attention`. Reconcile provider state before allowing another delivery attempt when duplication is possible.
- Model compensation as a new Course Check related to the original effect. Require original action scope, compensation permission, and a reason. Compensation may itself fail and must remain observable.
- Use immutable public-program revisions. Publishing, unpublishing, or restoring older content creates a new current revision rather than deleting release history.
- Keep private schedule conflicts and incomplete state saveable. Public Course Check defaults to a valid subset, keeps unplaced/private sessions excluded, shows conflicts, and requires a reason to publish a known material conflict.
- Require publishable sessions to have accepted visible state, public title/description, and at least one approved public speaker identity. Time and room may remain `TBD`; private onboarding details never become public.
- Defer staff-directed multi-move schedule scenarios and automatic schedule optimization to Schedule Resilience. First-release Course Check shows direct conflict and release consequences only.
- Allow ordinary inbound Airtable field sync with audit. Consequential inbound mappings must create Course Check or be excluded from automatic sync.
- Version the agent-facing contract as `v1` with closed action discriminators, stable IDs, plan/stage revisions, digest, findings, effects, approvals, receipts, and idempotency keys.
- Give AI agents distinct principals with event and stage scopes. Support propose-only, delegated execution, and explicitly granted autonomous policy execution.
- Permit administrators to grant every Course Check scope while retaining the expanded scoped grant and immediate revocation.
- Freeze AI-generated actions and content into the versioned plan. Applying an approved plan never invokes a model to change it invisibly.
- Present evidence in this order: irreversible effects, people affected, public changes, operational warnings, integration effects, internal record details.
- Use user-facing plan states `Draft`, `Needs review`, `Ready`, `In progress`, `Partially complete`, `Needs attention`, `Complete`, `Superseded`, and `Out of date`.
- Continue external execution durably after browser navigation or Worker eviction. Surface state in the shared Course Check workspace and event activity history.
- Retain immutable operational metadata, stable references, plan digests, approvals, attempts, outcomes, and compensation chains. Apply role-aware redaction and never store credentials or signed links.
- Support realistic event-scale batches as one reviewed scope while chunking external dispatch. When a safe transactional or review limit is exceeded, split into linked exact plans with an explanation.

## Testing Decisions

- Treat the authenticated HTTP application and event-scoped Course Check contract as the highest acceptance seam. UI, external clients, and agents must produce equivalent durable outcomes through the same command behavior.
- Test external behavior and persisted truth rather than planner helper implementation, React component details, or provider-library internals.
- Add contract tests proving ordinary profile, note, review, draft, and private schedule writes complete without visible Course Check ceremony.
- Add decision-plan acceptance tests for final outcomes, speaker reuse, co-speaker identities, event-participation snapshots, session/task creation, exact deltas, and no implicit communication.
- Test atomic internal decision application by forcing failures at each record boundary and verifying no partial cascade or effect rows survive.
- Test deferral by removing one blocked item, producing a new immutable plan version, applying the remaining exact scope, and retaining a follow-up item.
- Test relevant-change detection with proposal, identity, task-template, role, message-template, recipient, schedule, public-revision, and integration-mapping revisions.
- Test that unrelated event changes do not invalidate plans.
- Test stage-scoped invalidation: message edits reopen communication approval but not completed decision application; integration removal reopens only integration approval.
- Test authorization at both plan creation and execution, including revoked roles and reviewer track boundaries.
- Test agent principals and every event/stage scope, all-scope grants, immediate revocation, propose-only, delegated execution, and autonomous policy execution.
- Test that AI-generated plans execute frozen normalized actions and rendered payloads without an apply-time model call.
- Test recipient grouping, inclusion/exclusion reasons, duplicate/shared addresses, missing addresses, prior sends, and address-level outcomes.
- Contract-test email adapters with stable idempotency, provider references, transient retry, permanent failure, exhausted retry, and ambiguous outcomes.
- Contract-test calendar create/update/cancel with stable UID, increasing sequence, frozen payload, retries, and compensating correction.
- Test publication against immutable WIP and public revisions, added/changed/removed sessions, valid-subset defaults, `TBD`, conflict overrides, unpublish, and restoration as a new revision.
- Test that publication never exposes committee notes, private tasks, unpublished speakers, signed links, or redacted plan data.
- Test Airtable outbox writes, ordinary inbound mapping, consequential mapping rejection/Course Check routing, degraded service, retry, and compensation.
- Test transaction/outbox consistency by crashing after local application, before dispatch, during dispatch, and after provider success but before local outcome recording.
- Test alarm or worker re-entry with at-least-once execution and verify completed effects never repeat.
- Test `Needs attention` reconciliation paths without blind retry.
- Test compensation for reversible internal state, corrective public revision, calendar cancellation/update, corrective message, and Airtable corrective write without claiming impossible rollback.
- Test shared-plan concurrency: two administrators revise or execute the same plan, one result wins, and the other receives an exact out-of-date response.
- Test old-plan warnings independently from revision invalidation.
- Test plan and audit redaction for administrators, reviewers, scoped agents, speakers, and public users.
- Test batches at realistic event size and above the configured split threshold, including exact linked scopes and aggregate progress.
- Run accessibility tests over evidence hierarchy, disclosures, warning override reason, stage controls, effect tables, status announcements, and keyboard-only operation.
- Run desktop and mobile browser checks. Organizer execution is desktop-priority, but review status and recovery must remain legible on mobile.
- Keep complete judge-demo acceptance coverage: batch outcomes, generated records, communication draft/send separation, out-of-date invalidation, private conflict, public delta, calendar/Airtable effects, one partial failure, safe retry, compensation history, and equivalent scoped-agent execution.

## Out of Scope

- A visible Course Check for every ordinary field edit or private WIP action.
- A generic workflow DSL, caller-authored effect graph, stage plug-in marketplace, or universal action registry.
- Full event sourcing or replay-based primary read models.
- Multi-step hotel-style schedule scenario branches in the first release.
- Automatic agenda optimization or autonomous movement of sessions.
- Learned speaker risk scores, autonomous proposal evaluation, or automatic accept/reject recommendations.
- A required chat-first organizer interface.
- MCP server support for the competition build.
- Perfect rollback of sent email, consumed calendar invitations, cached public feeds, or third-party writes.
- Silent break-glass execution around permission, freshness, identity, integrity, or unpreviewable-effect blockers.
- Automatic inheritance of approval between linked decision, communication, publication, or compensation plans.

## Further Notes

- Product authority remains `context.md`; architecture and sequencing remain in `context/BUILD-PLAN.md`.
- The evidence base remains `.research/chartstead-post-spine-differentiation-research.md`, `.research/chartstead-post-spine-differentiation-follow-up.md`, and `.research/chartstead-safety-layer-precedents.md`. Do not overwrite those reports with the committed decision.
- The interactive design explainer is `outputs/chartstead-safety-explainer.html`.
- The closest combined precedents are Git candidate snapshots and deltas, OpenTofu plan/apply, Kubernetes authoritative admission and dry-run, pretalx conference outbox/release behavior, Debezium transactional outbox, and Temporal durable retry/compensation.
- Course Check should remain legible to nontechnical event professionals. The hotel-room chain analogy is useful for explaining private partial truth versus external confirmation, but multi-step chain planning belongs to later Schedule Resilience work.
- The locked competition spine remains required. Course Check instruments and connects it rather than replacing any CFP, review, acceptance, portal, communication, scheduling, public-program, Airtable, or API capability.
