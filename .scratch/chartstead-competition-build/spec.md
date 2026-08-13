# ChartStead competition build

Status: ready-for-agent

## Problem Statement

Conference-program teams pay enterprise prices for slow, overbuilt CFP software while still falling back to spreadsheets, email, and custom workarounds. The target customer needs the program-management spine, not a broad event CRM: launch a call for speakers, collect and review proposals, accept speakers, coordinate missing information, communicate reliably, construct a workable agenda, and publish the result.

The product must serve nontechnical event-production professionals under real deadline pressure. It must preserve incomplete work instead of forcing false certainty, keep internal decisions separate from external communication, and retain stable data beyond one event. The competition requires a credible deployed vertical workflow, not a static prototype or a pixel clone of Sessionboard.

## Solution

Build ChartStead as a fast, open-source conference programming and speaker management application. It provides a guided CFP setup, public submission flow, shared track-based review queue, acceptance cascade, speaker portal, operator-controlled communications, day-and-room scheduling, conflict visibility, and public program output.

The organizer application follows the locked Harbor Master Desk visual direction. Operational data uses stable identifiers and historical event-participation snapshots. Email and calendar delivery are real and auditable. Scheduling accepts unplaced and `TBD` states while surfacing constraints without blocking saves. Airtable remains an optional synchronization target rather than the interactive database.

## User Stories

1. As an event administrator, I want to sign in and select an event, so that I can work in the correct program safely.
2. As an event administrator, I want a seeded demonstration event, so that I can evaluate the complete workflow immediately.
3. As an event administrator, I want to create an event with dates, tracks, and rooms, so that proposals and sessions share an operating context.
4. As an event administrator, I want to configure more than one submission form, so that distinct calls can feed the same event.
5. As an event administrator, I want a guided CFP setup, so that I can publish a credible call in one sitting.
6. As an event administrator, I want templates and sensible defaults, so that ordinary CFP fields do not require configuration from scratch.
7. As an event administrator, I want to add proposal, speaker, co-speaker, file, and supporting-link questions, so that the committee receives the information it needs.
8. As an event administrator, I want required fields and basic conditional logic, so that forms remain concise while collecting necessary details.
9. As an event administrator, I want preview and production forms to use the same rendering behavior, so that publication is predictable.
10. As an event administrator, I want to configure opening and closing behavior, so that submissions follow the event timeline.
11. As a speaker, I want to submit a proposal without creating an account, so that participation has minimal friction.
12. As a speaker, I want validation to preserve my entered information, so that correcting one field does not destroy my work.
13. As a speaker, I want to attach co-speakers, a biography, a headshot, files, and supporting links, so that the proposal is complete.
14. As a speaker, I want a confirmation page and real confirmation email, so that I know the submission succeeded.
15. As a speaker, I want a secure signed link to edit my submission, so that I can update it without account setup.
16. As an event administrator, I want each submission to have a stable human-readable identifier and permalink, so that committee discussion can refer to the proposal directly.
17. As a reviewer, I want to see the shared queue for my assigned tracks, so that I can contribute without per-proposal assignment machinery.
18. As a reviewer, I want to search, filter, and sort submissions, so that I can find the next useful review task quickly.
19. As a reviewer, I want to read the full proposal and speaker context together, so that I can make an informed decision.
20. As a reviewer, I want private committee notes, so that internal reasoning does not leak to speakers.
21. As a reviewer, I want to mark a proposal approve, maybe, or deny, so that the committee can deliberate with a lightweight workflow.
22. As a reviewer, I want those internal decisions to remain reversible, so that deliberation does not create premature commitments.
23. As an event administrator, I want changing a review decision not to email the speaker, so that deciding and telling remain separate acts.
24. As an event administrator, I want explicit acceptance and denial send actions, so that consequential communication is deliberate.
25. As an event administrator, I want to see draft, queued, sent, delivered, and failed communication states, so that I know what actually happened.
26. As an event administrator, I want failed sends to retain their context and permit retry, so that delivery problems do not lose work.
27. As an event administrator, I want acceptance to create or confirm speaker, participation, session, and onboarding-task records, so that accepted information is not re-entered.
28. As an event administrator, I want direct session entry for guaranteed speakers, so that sponsors and invited speakers do not need a fictional submission.
29. As an event administrator, I want current speaker identity separated from event-time title and organization, so that historical programs remain accurate.
30. As a speaker, I want a secure portal showing my proposals, sessions, profile, tasks, and deadlines, so that I know what the organizer needs.
31. As a speaker, I want to update my biography and headshot, so that published information is accurate.
32. As a speaker, I want to complete forms and upload requested files, so that onboarding work stays attached to the event.
33. As an event administrator, I want to see who is missing what, how late it is, and the last contact, so that I can prioritize the chase.
34. As an event administrator, I want to prepare and review reminder messages before sending, so that communication retains human judgment and relationship context.
35. As an event administrator, I want employer approval or co-speaker readiness represented as tasks or flags, so that likely withdrawal risks are visible without expanding the proposal decision state machine.
36. As an event administrator, I want real calendar invitations, so that accepted speakers can place sessions on their calendars.
37. As an event administrator, I want calendar invitations to update when time or room changes, so that recipients retain one coherent event.
38. As an event administrator, I want calendar invitation UIDs to remain stable through updates and cancellation, so that calendar clients do not create duplicates.
39. As an event administrator, I want an unplaced-session pool, so that acceptance can precede exact scheduling.
40. As an event administrator, I want room and time to remain `TBD`, so that partial schedule decisions can be saved honestly.
41. As an event administrator, I want to place sessions by day and room using drag and drop, so that agenda construction is fast and spatial.
42. As an event administrator, I want a non-drag Move Session action, so that scheduling remains keyboard-accessible and reliable.
43. As an event administrator, I want speaker and room conflicts identified by name, time, and cause, so that I can understand the constraint.
44. As an event administrator, I want conflicts to remain non-blocking, so that known temporary contradictions do not prevent saving.
45. As an event administrator, I want live counts of unplaced sessions and conflicts, so that I can judge schedule readiness.
46. As an event administrator, I want to publish a mobile-friendly schedule and speaker lineup, so that attendees can use the program.
47. As an event administrator, I want a simple embed of the public program, so that it can appear on an existing event website.
48. As an attendee, I want to filter the public program by useful event dimensions, so that I can find relevant sessions.
49. As an integration owner, I want app-created records synchronized to Airtable, so that existing new-row automations continue to run.
50. As an integration owner, I want Airtable-side changes pulled periodically or on load, so that external edits return to ChartStead without real-time sync complexity.
51. As an event administrator, I want clear degraded sync status, so that Airtable outages do not look like lost application data.
52. As an automation client, I want an authenticated HTTP API over the vertical slice, so that records remain useful outside the interface.
53. As a community owner, I want stable identifiers on events, speakers, submissions, sessions, messages, and tasks, so that data can survive migrations and longitudinal analysis.
54. As an event administrator, I want operational changes to be auditable, so that I can distinguish decisions, sends, schedule changes, and retries.
55. As an evaluator, I want the application to feel fast and coherent with realistic seeded data, so that I can assess the product without extensive explanation.
56. As an evaluator, I want the complete workflow to use real persistence, email, calendar, files, and public output, so that the demonstration proves more than interface breadth.
57. As an event administrator, I want Course Check to show the exact consequences of final decisions, external communication, and public-program release, so that consequential actions remain inspectable without slowing ordinary private work.
58. As an AI operator, I want complete authenticated API parity with the organizer interface, including Course Check approval, execution, retry, and compensation, so that a scoped agent can control the full application safely.

## Implementation Decisions

- Build a multi-event, single-deployment application with event-scoped roles. Do not introduce tenant organizations or billing for the competition.
- Use React, Vite, and TypeScript for the user interface, with TanStack routing and server-state management.
- Use a Hono API on Cloudflare Workers, Durable Object SQLite for interactive operational data, and R2 for uploaded files.
- Use Better Auth with Google as the primary organizer path, magic-link fallback, long sessions, speaker signed links, and a deliberate demo-admin bypass.
- Use Resend and React Email behind an application outbox. Persist message intent, recipient, template data, send status, provider identifiers, failures, and retries.
- Treat submission confirmation as eligible for automatic send after successful persistence. Treat acceptance, denial, and escalation messages as explicit Course Check stages executed by an authorized organizer or deliberately scoped agent.
- Use real iCalendar create, update, and cancel semantics. Persist stable UID and sequence state independently from mutable schedule details.
- Give all durable entities stable application identifiers at creation. Never derive identity from names, email addresses, table rows, or mutable Airtable record ordering.
- Separate the current speaker profile from event participation. Preserve submission-time title and organization on participation records.
- Keep proposal review state, external communication state, session readiness, onboarding task state, and agenda placement as separate concepts rather than one overloaded status.
- Route reviewers by one or more tracks. Reviewers see the shared queue for those tracks; administrators retain event-wide visibility.
- Keep the required review workflow to unreviewed, approve, maybe, and deny. Ratings and committee coverage sorts are the first optional review extension, not a prerequisite.
- Use a native guided CFP setup over a restricted SurveyJS schema. Public preview and published forms share the SurveyJS Form Library runtime. Do not use SurveyJS Creator.
- Store draft and published form snapshots in a ChartStead-owned envelope so editing the builder does not silently alter a live form.
- Use one upload adapter backed by Uppy and R2 for CFP and portal files.
- Build dense organizer tables through an application-owned operations-grid adapter, with AG Grid Community accepted only if its quality spike passes without Enterprise features.
- Build scheduling through an application-owned scheduler adapter. Accept DayPilot Lite only if it supports the locked visual treatment, unplaced and partial states, non-blocking conflicts, and a keyboard-accessible move path.
- Preserve unplaced sessions, missing room/time, and unresolved conflicts as valid saved states. Constraint detection informs and assists; it does not reject the save.
- Use a native public-program renderer for full-page and embedded output so both surfaces share behavior.
- Keep Airtable out of the interactive request path. Synchronize through an outbox and load/interval pull, surface degraded state, and keep the application usable when Airtable is unavailable.
- Expose authenticated HTTP endpoints over the same application services used by the interface. Do not build MCP for the competition.
- Follow the locked Harbor Master Desk shell, submissions master-detail screen, tokens, and interaction language. Extend that shell rather than inventing parallel navigation or visual systems.
- Preserve list context as product state. Dragging is never the sole path, save state remains visible, field errors stay near fields, and toasts never substitute for durable error or delivery state.
- Seed realistic event, track, room, speaker, proposal, onboarding, communication, and conflict data early enough that each vertical slice remains demonstrable.

## Testing Decisions

- The primary acceptance seam is the user-visible HTTP application. Tests exercise the complete workflow through deployed-equivalent routes and interfaces rather than mocking internal modules.
- A complete acceptance path creates or opens an event, publishes a CFP, submits a realistic proposal, finds it in the assigned track queue, changes an internal review decision without sending email, accepts it, verifies the cascade, completes speaker work, sends real communication through a test-safe provider boundary, schedules the session, surfaces and resolves a conflict, and renders the public program.
- Test behavior and durable outcomes, not component implementation details or vendor-library internals.
- Contract-test the email outbox and provider adapter for explicit sends, delivery-state transitions, failure retention, and retry idempotency.
- Validate iCalendar output with golden fixtures covering create, time and room update, cancellation, stable UID, and increasing sequence values for Gmail, Outlook, and Apple-compatible clients.
- Contract-test Airtable mapping, push outbox, pull precedence, retry behavior, and degraded operation without requiring Airtable for unrelated application tests.
- Contract-test file upload authorization, metadata, replacement, and failure behavior at the application upload boundary.
- Test form draft-versus-published behavior through the public runtime so preview and production cannot diverge silently.
- Test reviewer authorization and visibility at the HTTP boundary: reviewers see assigned-track queues, administrators see the event, and speakers cannot see committee notes.
- Test acceptance idempotency so retries cannot duplicate speakers, participation records, sessions, or tasks.
- Test schedule persistence with unplaced, `TBD`, and conflicting sessions. Verify conflicts produce named warnings without blocking writes.
- Test public schedule and speaker output at desktop and mobile viewport sizes, including simple embed rendering.
- Use focused unit tests only for isolated serializers, conflict calculations, conditional-form evaluation, and state machines where the public seam would make failures hard to localize.
- Run accessibility checks on the locked shell, submission form, review workspace, portal tasks, scheduler alternatives, and public program. Verify keyboard operation for every required non-drag path.
- Run performance checks against realistic seeded data, prioritizing submission-list responsiveness and avoiding unnecessary Airtable-bound reads.

## Out of Scope

- Payments and fees
- Accelevents integration
- Full CRM, marketing automation, content transcription, or repurposing
- Full Sessionboard CMS or generalized embed management
- Multilingual forms
- Video-meeting links in calendar invitations
- Academic bidding, double-blind review, rebuttals, meta-review, and multi-round evaluation plans
- Individually assigned proposals unless direct organizer clarification changes the shared-track model
- AI-assisted proposal evaluation or a large in-app chatbot
- Autonomous multichannel escalation, reply-by-email, or unsupervised reminder campaigns
- A complete employer-approval workflow beyond an optional readiness task or flag
- Full export-management UI, offline public schedules, or indefinite hosting guarantees
- Multi-tenant organizations, subscription billing, and generalized SaaS administration
- Pixel-for-pixel Sessionboard recreation
- MCP server

## Further Notes

- Canonical requirements and evidence boundaries are in `context.md`.
- Locked architecture, implementation order, spikes, and operating constraints are in `context/BUILD-PLAN.md`.
- Visual implementation follows `design/source-of-truth/organizer-submissions.html` and the cross-screen rules in `design/ORGANIZER-DESK-CHROME.md`; behavioral rules remain in the context, build plan, and design system.
- Gene Kim's conference history is high-value adjacent-practitioner evidence, not a replacement for direct organizer requirements.
- The implementation order remains spine-first. This specification adds invariants inside existing steps rather than adding parallel feature tracks.
- The committed Course Check expansion is specified in `.scratch/chartstead-course-check/spec.md` and sequenced in `context/BUILD-PLAN.md`; it extends rather than replaces this competition spine.
- The competition target is Wednesday, August 12, 2026 at 10:00 PM Pacific. Favor a complete, real vertical path over broad incomplete coverage.
