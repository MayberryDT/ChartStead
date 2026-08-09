# ChartStead competition build plan

**Status:** Locked via grilling 2026-08-09
**Deadline:** Wednesday 2026-08-12, 10:00 PM Pacific
**Strategy:** Complete vertical slice of Required + Important capabilities as fast as possible, then polish. Enhancements only if time remains.

Research that informed locks (do not re-litigate casually):

- `.research/chartstead-form-builder-options.md`
- `.research/form-builder-micro-ux-pass.md`
- `.research/chartstead-app-wide-building-blocks-micro-ux-research.md`
- `.research/building-blocks-research-prompt.md`

Product requirements live in `context.md`. Design system in `design/DESIGN.md`. Implement the organizer shell and submissions spine against `design/source-of-truth/organizer-submissions.html`.

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
- Reminder automation is human-controlled: surface missing work and prepare context/drafts before adding unattended sending

### Agentic / API

- **Auth’d HTTP API** covering the vertical slice (bonus + automation)
- **No MCP** required
- **No** required in-app LLM assistant

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
5. **The chase stays human-led.** The system identifies missing work, deadlines, and escalation history. It assists message preparation; it does not impersonate the organizer or silently escalate across channels.

---

## 5. Implementation order (spine-first)

1. Skeleton — shell, design tokens/primitives kit, Better Auth, multi-event, seeded demo
2. Data plane — stable IDs, participation snapshots, audit events, DO schema, Airtable template + outbox/pull, R2
3. Forms — hybrid builder + public CFP + submit + confirmation page
4. Real email — submit confirm + signed links + explicit send/delivery state
5. Admin submissions + review — stable permalinks, shared track queues, OpsGrid, approve/maybe/deny without implicit email
6. Accept cascade — speaker + historical participation snapshot + session + tasks
7. Speaker portal — profile, tasks, bio/headshot, missing-work visibility
8. Calendar invites — stable UID lifecycle on accept / schedule
9. Agenda — unplaced/TBD states, day/room, DnD + Move Session, non-blocking conflicts
10. Public program — speakers + schedule + simple embed
11. Important remainder — drafts, reminders, templates, resources, table power
12. API docs polish + optional tiny assist only if spine is solid

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
- Perfect hour estimates as planning gospel — use spine + spikes instead

---

## 8. Next actions

1. Init app monorepo/workspace (Vite React + Worker Hono) under repo root (or `apps/` — pick one layout and stick to it).
2. Land design tokens + primitive wrappers + UX checklist doc agents must follow.
3. Auth + empty shell + demo admin + seed event.
4. DO schema + Airtable template stub + health/sync status.
5. Proceed down spine order; run spikes at first touch of forms/table/agenda.

Do not expand scope without re-grilling the affected decision.
