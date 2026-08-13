# ChartStead rubric completion

**Status:** ready-for-agent

## Problem statement

The competition build delivers ChartStead's deliberate product spine, but the KillMySaaS evaluator grades a broader functional contract than the original MVP plan. Exact SessionBoard visual fidelity is not required; the missing behaviors still affect competitive coverage. The completed 2026-08-12 audit classified 35 of 86 required criteria as implemented, 22 as partial or defective, 28 as absent, and one as not applicable.

## Goal

Close every applicable partial or missing criterion in evaluator areas CFP, abstract management, speaker management, content management, agenda, and public widgets without discarding ChartStead's existing product strengths. New functionality must integrate with the current event-scoped data model, signed-link speaker access, Course Check consequence boundary, stable identifiers, audit history, and public-program revision model.

## Scope rules

- Functional rubric behavior is in scope; pixel imitation and SessionBoard-specific styling are not.
- Preserve the accountless CFP path while adding an optional authenticated submitter workspace.
- Preserve the lightweight shared track queue while adding advanced review plans as an opt-in path.
- Preserve assisted, authority-controlled communication. Automatic reminders must use explicit event policy and the existing Course Check/outbox safety boundary.
- Extend the shared public-program data contract instead of creating divergent data sources for each widget.
- Every ticket is a vertical slice with persistence, authorization, API, UI, and focused acceptance tests where those layers apply.
- ABS-14 remains not applicable unless ChartStead begins claiming AI-assisted proposal triage.

## Success criteria

- Every applicable criterion in `/home/halla/killmysaas-evals/specs/01-06` maps to implemented behavior and durable automated or manual evidence.
- Existing competition and Course Check workflows remain operational.
- All new event data stays event-scoped and respects existing role boundaries.
- Public surfaces use consistent session and speaker values from the same published revision.
- The issue dependency frontier stays mechanically reconciled through `npm run issues:reconcile`.

## Ticket map

- Rubric 01-03: CFP condition repair, submitter workspace, and saved drafts.
- Rubric 04-09: advanced review plans, scorecards, assignments, privacy, progress, and results.
- Rubric 10-17: speaker lifecycle, onboarding, deliverables, content governance, files, and reminders.
- Rubric 18: agenda placement hardening and assisted scheduling.
- Rubric 19-23: sessions, speakers, agenda, itinerary, personal schedule, and embed distribution.
- Rubric 24-29: acceptance-audit remediation for personal schedule, speaker data, reviewer flow, public-widget freshness, outbound email, and the test baseline.

## Source evidence

- Rubric definitions: `/home/halla/killmysaas-evals/specs/01-06`
- Completed evaluator run: `/home/halla/killmysaas-evals/runs/2026-08-12T16-41-14`
- Durable audit: `sessions/2026/08/chartstead-strict-rubric-audit`
- Full manual acceptance audit: `docs/audits/2026-08-13T01-52-08Z-chartstead-full-rubric-acceptance-audit.md`
- Durable manual-audit record: `sessions/2026/08/chartstead-full-rubric-acceptance-audit`
- Existing product decisions: `context.md` and `context/BUILD-PLAN.md`
