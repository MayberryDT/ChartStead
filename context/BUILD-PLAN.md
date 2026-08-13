# ChartStead competition build plan

**Status:** Spine locked via grilling 2026-08-09; Course Check expansion locked via grilling 2026-08-10
**Deadline:** Wednesday 2026-08-12, 10:00 PM Pacific
**Strategy:** Complete the locked vertical spine and the Course Check differentiator before submission, then polish. The competition timeline does not narrow committed Course Check scope.

Research that informed locks (do not re-litigate casually):

- `.research/chartstead-form-builder-options.md`
- `.research/form-builder-micro-ux-pass.md`
- `.research/chartstead-app-wide-building-blocks-micro-ux-research.md`
- `.research/building-blocks-research-prompt.md`
- `.research/chartstead-post-spine-differentiation-research.md`
- `.research/chartstead-post-spine-differentiation-follow-up.md`
- `.research/chartstead-safety-layer-precedents.md`

Product requirements live in `context.md`. Design system in `design/DESIGN.md`. Cross-screen organizer chrome is locked in `design/ORGANIZER-DESK-CHROME.md`; implement the organizer shell and submissions spine against `design/source-of-truth/organizer-submissions.html`.

---

## 1. Scope

| In slice | Out of slice (unless polish time) |
| --- | --- |
| All **Required for credible MVP** from `context.md` | Scored multi-round review, AI review, full CMS |
| All **Important / strongly desired** from `context.md` | Payments, Accelevents, full CRM/marketing |
| Minimal public speakers + schedule (+ simple embed) | Multilingual, video meeting links in invites |
| Working email + calendar invites (not stubs) | Large in-app agentic chatbot |
| Auth’d HTTP API over the vertical slice | MCP server |
| Airtable **sync** (bonus path), not hot-path DB | Pixel Sessionboard clone |
| **Course Check** across final decision cascades, external communication, and public-program release | Universal workflow DSL or visible review for ordinary edits |
| Full API parity for scoped AI agents, including Course Check approval and execution | Unscoped or bypassing agent authority |
| Direct schedule-conflict consequences in Course Check | Multi-step schedule scenarios or automatic optimization |

**Principle:** Complete the job (end-to-end program workflow). Nontechnical event staff must be able to use it without explanation.

---

## 2. Architecture locks

### Stack

| Layer | Choice |
| --- | --- |
| UI | React + Vite + TypeScript + TanStack Query/Router (+ Form where appropriate) |
| API | Hono on Cloudflare Workers |
| Operational data | Durable Object SQLite (primary for interactive reads/writes) |
| Files | R2 |
| Auth | Better Auth — Google primary, magic-link fallback, long sessions, speaker signed links, demo-admin bypass |
| Email | Resend + React Email + app **outbox** |
| Calendar | Real `.ics` create/update/cancel (library spike-gated; RFC fixtures) |
| Host | Cloudflare (Workers + assets) |

### Tenancy

- Multi-event, **single deploy**
- Seeded demo event
- Event-scoped roles
- Future multi-tenant: add `tenant_id` / org layer later — not built now

### Airtable

- **Not** the hot-path database (rate limits)
- **Operational primary:** DO SQLite
- **When connected:** outbox sync to Airtable + pull on load/interval; **Airtable wins on pull** for synced fields
- App fully works if Airtable is down/unconfigured (degraded sync UI)
- Ship **ChartStead base template** + field map alongside app schema

### Data integrity

- Stable IDs for events, submissions, sessions, speakers, event-speaker participation, tasks, messages, and calendar objects from the first migration
- Speaker profile is current identity; event participation preserves submission-time `title_at_time` and `org_at_time`
- Every submission has a stable permalink suitable for committee discussion and email deep links
- Calendar UIDs remain stable across create, update, reschedule, and cancellation
- Status, review, communication, and schedule changes are independently auditable

### Communication control

- Submission confirmation may send automatically after a successful submit
- Internal review decisions never send acceptance or denial email implicitly
- Consequential messages use explicit, auditable sends; support deliberate batch release when the slice is solid
- Reminder automation defaults to assisted drafting; unattended sending requires an explicit scoped agent policy and the same Course Check evidence, approval, and audit contract

### Agentic / API

- **Auth’d HTTP API** covering the vertical slice (bonus + automation)
- Full API parity: scoped agents can create, inspect, revise, approve, execute, retry, reconcile, defer, and compensate Course Check plans
- Agents are distinct audited principals with event and stage scopes; direct user delegation and opt-in autonomous policies are both supported
- AI output is frozen into a versioned plan before execution; apply never silently invokes a model to change approved content
- **No MCP** required
- **No** required in-app LLM assistant

### Course Check

**Product name:** Course Check. Keep implementation terms such as planner, effect graph, and manifest out of nontechnical UI.

**First-release action families:**

1. Final proposal outcomes and acceptance cascades.
2. Speaker communication and calendar delivery.
3. Public-program publication or revision, including related Airtable writes.

**Ordinary work stays immediate:** profile corrections, committee notes, reversible `approve / maybe / deny`, message drafting, private schedule movement, and incomplete or conflicting WIP saves use the authoritative command path without a separate Course Check workspace.

**Architecture:** one event-scoped safety kernel owns versioned plans, relevant-input checks, stage approvals, idempotency, transactional internal application, effect outbox creation, per-effect outcomes, retry classification, compensation history, and audit. Closed action-specific planners own decision, communication, and publication semantics. Do not build a generic workflow DSL, plugin stage registry, or full event-sourced read model.

**Approval boundaries:** apply internal outcomes and generated records; create drafts; send messages and calendars; publish attendee-facing changes; execute integration writes. A stage-specific verb records approval of the displayed plan version and starts that stage without a redundant second confirmation.

**Blocking policy:** block only missing authority, relevant changed inputs, unresolved identity ambiguity, durable-integrity violations, and external effects that cannot be previewed safely. Soft warnings remain overridable. Private saves need no reason; overriding a material warning at send, publish, calendar, or integration boundaries records a reason.

**Recovery policy:** internal stages are transactional. External effects are idempotent and independently observable. Retry only classified transient failures; unknown outcomes stop for reconciliation. Compensation is a new reviewed action, never a claim that irreversible effects were undone.

**Shared operation:** Course Checks are resumable event resources rather than personal drafts. Relevant edits create immutable plan versions and invalidate only dependent approvals. Blocked items may be explicitly deferred into a follow-up queue while the remaining exact batch stays atomic.

**API policy:** humans and agents use the same versioned `v1` contract and permission model. Agent operating modes are propose-only, delegated execution, and explicitly granted autonomous policy execution. Event policy may tighten approvals but cannot weaken the baseline kernel.

---

## 3. Forms (CFP)

**Hybrid (locked):**

| Surface | Approach |
| --- | --- |
| Admin builder | Native **guided CFP setup tool** — templates, field cards, sentence conditionals, Basics → Proposal → Speakers → Preview & publish |
| Public + preview | **Same** SurveyJS Form Library runtime |
| Files | Uppy → R2 custom question |
| Storage | ChartStead envelope + restricted SurveyJS JSON; Airtable/DO **draft vs published** snapshots |
| License | SurveyJS **Form Library only** — no Creator |

Spike kill → native public runtime, same admin + checklist. Do not jump to Form.io by default.

---

## 4. Building blocks (app-wide)

See full research; summary:

| Surface | Primary |
| --- | --- |
| Primitives | App-owned kit on **Base UI** (+ selective React Aria); Sonner, cmdk, hotkeys, resizable panels; Radix only as explicit fallback |
| Tables | **`OpsGrid`** → AG Grid Community (no Enterprise); TanStack Table fallback |
| Review / accept / portal / shell | Native domain workflows on primitives + OpsGrid |
| Agenda | Scheduler **adapter**; DayPilot Lite only if quality spike passes; always **Move Session** non-drag path; native constrained grid fallback |
| Public program | Native renderer; embed = same renderer |
| Upload | Single Uppy adapter |
| Auth UI | Better Auth (+ Better Auth UI if tokens fit) |
| Comms | Outbox + React Email + Resend + ICS lifecycle |
| Quality | Repo-wide micro-UX checklist is **law**; preview === production; adapters hide raw vendor APIs |

**Top rules (abbreviated):** no hand-rolled overlays; state tables before components; drag never sole path; save is a visible state machine; list context is product state; toast ≠ errors; happy-path screenshot ≠ done.

### Operating locks

These are implementation constraints, not extra feature surfaces:

1. **Review is a shared queue.** Reviewers see submissions for their assigned tracks; do not build bidding, blind rounds, or per-proposal assignment without new organizer evidence. Each proposal has a permalink. Ratings, if added after the spine, start with coverage count and average-score sorts.
2. **Deciding and telling are separate.** `approve / maybe / deny` updates internal state only. Speaker notification is a separate action with its own draft, send, delivery, and failure state.
3. **Scheduling preserves partial truth.** Unplaced sessions, unknown rooms/times, `TBD`, and unresolved conflicts must save. Conflicts are named, actionable warnings with live counts, never save-blocking modals.
4. **The data survives the event.** Stable IDs, historical participation snapshots, stable calendar UIDs, and API-accessible records are schema requirements even if polished export screens wait.
5. **The chase stays authority-controlled.** The system identifies missing work, deadlines, and escalation history. It assists message preparation by default; a scoped agent may execute only through explicit event policy and never impersonates an organizer or bypasses Course Check.
6. **Course Check is not a universal staging tax.** Routine private truth saves immediately. Final cascades, external sends, public release, and related external writes use focused review through one authoritative server path.
7. **Agents do not bypass consequence review.** Scoped AI agents may control every organizer capability through the API, including approval and execution, but they use the same frozen plans, stage permissions, idempotency, effect states, and audit history.

---

## 5. Implementation order (spine-first)

1. Skeleton — shell, design tokens/primitives kit, Better Auth, multi-event, seeded demo
2. Data plane — stable IDs, participation snapshots, audit events, DO schema, Airtable template + outbox/pull, R2
3. Forms — hybrid builder + public CFP + submit + confirmation page
4. Real email — submit confirm + signed links + explicit send/delivery state
5. Admin submissions + review — stable permalinks, shared track queues, OpsGrid, approve/maybe/deny without implicit email; add record revisions, explicit commands, and audit seams without visible Course Check ceremony
6. Course Check foundation + accept cascade — versioned decision plans, relevant-input checks, stage approval, idempotent speaker + historical participation snapshot + session + tasks
7. Speaker portal — profile, tasks, bio/headshot, missing-work visibility
8. Communication Course Check + calendar invites — recipient reasoning, drafts, explicit send, per-effect results, stable UID lifecycle on accept / schedule
9. Agenda — unplaced/TBD states, day/room, DnD + Move Session, non-blocking conflicts
10. Publication Course Check + public program — versioned public delta, valid subset, speakers + schedule + simple embed; calendar communication remains linked and separately approved
11. Airtable + complete HTTP API — integration effects, inbound consequence classification, documented versioned Course Check API, full scoped agent parity
12. Course Check integration + killer demo — shared resumable workspace, cross-plan links, stale versions, deferral, partial failure, reconciliation, compensation, and agent-controlled walkthrough
13. Important remainder — reminders, templates, resources, table power
14. API docs, seeded agent examples, accessibility/performance polish

Seed rich demo data early so every step is walkthrough-ready.

---

## 6. Spikes (evidence-gated)

| Spike | Commit if | Kill if → fallback |
| --- | --- | --- |
| SurveyJS public runtime + Uppy + theme | Kill gates in form micro-UX research | Native CFP runtime |
| AG Grid `OpsGrid` shell | Keyboard, a11y, ChartStead chrome, no Enterprise leak | TanStack Table |
| DayPilot Lite schedule adapter | Theme, unplaced/TBD states, non-blocking conflicts, external pool, keyboard Move Session, Lite-only license clean | Native day/room grid |
| Better Auth on Workers + Google + magic link + demo admin | Cookie/session E2E | Narrow custom views on same engine |
| ICS library on Workers | Stable UID create/update/cancel golden fixtures for Gmail/Apple/Outlook | Minimal RFC serializer |

---

## 7. Explicit non-goals (competition)

- Full multi-tenant SaaS orgs/billing
- Sessionboard CMS / marketing / CRM / transcription
- Payments, Accelevents
- SurveyJS Creator, AG Grid Enterprise, license-unclear premium schedulers
- MCP, large in-app agent
- Generic workflow DSL, universal visible planning for low-risk edits, or caller-defined effect graphs
- Hotel-style multi-move schedule scenarios, automatic agenda optimization, or the full Schedule Resilience workbench
- Perfect rollback of sent communication, consumed calendar updates, cached public feeds, or third-party writes
- Perfect hour estimates as planning gospel — use spine + spikes instead

---

## 8. Next actions

1. Finish Ticket 03 remediation without pulling review or Course Check behavior into that branch.
2. Build Ticket 04 reversible review on explicit versioned command/audit seams while keeping routine review immediate.
3. Establish the Course Check kernel with Ticket 05's acceptance cascade as the first complete plan/review/apply tracer.
4. Extend the same kernel through communication, calendar, publication, Airtable, and authenticated agent control in spine order.
5. Complete the dedicated Course Check integration and killer-demo slice before competition hardening.

Do not expand scope without re-grilling the affected decision.
