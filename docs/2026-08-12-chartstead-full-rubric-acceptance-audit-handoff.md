# ChartStead full rubric acceptance audit handoff

## Mission

Run a fresh, manual acceptance audit of all **86 required** KillMySaaS rubric criteria against the current ChartStead competition build. Produce a criterion-by-criterion evidence report that tells Tyler what passes, what is partial, what fails, and what could not be exercised.

This is an **audit-only assignment**. Inspect and exercise the product; do not implement fixes, reopen tickets, alter ticket statuses, deploy, commit, merge, or overwrite the previous evaluator run. If you find a defect, reproduce it, preserve evidence, and report it.

The audit is complete only when every required rubric ID in CFP-01–18, ABS-01–14, SPK-01–16, CNT-01–14, AIA-01–08, and EMB-01–16 has exactly one recorded verdict and supporting evidence. The optional CRM-01–12 area is outside this audit.

## Authoritative context

Read these before interacting with the app:

1. `/home/halla/ChartStead/AGENTS.md`
2. `/home/halla/ChartStead/context.md`
3. `/home/halla/ChartStead/context/BUILD-PLAN.md`
4. `/home/halla/ChartStead/docs/competition-walkthrough.md`
5. `/home/halla/ChartStead/.scratch/chartstead-rubric-completion/spec.md`
6. `/home/halla/killmysaas-evals/README.md`
7. `/home/halla/killmysaas-evals/specs/01-call-for-papers.yaml` through `06-public-widgets.yaml`
8. `/home/halla/killmysaas-evals/fixtures/sample-data.json` and its referenced fixture files

Consult GBrain before repository archaeology. Relevant durable pages:

- `sessions/2026/08/chartstead-ticket-clearance-final-closeout`
- `sessions/2026/08/chartstead-strict-rubric-audit`
- `sessions/2026/08/chartstead-completed-killmysaas-run-audit`
- `sessions/2026/08/chartstead-rubric-completion-track`

The YAML specs are the final authority for exact criterion text, `pass_criteria`, evidence expectations, testability, and manual instructions. This handoff provides the exhaustive index and execution contract, but it does not replace the specs.

## Workspaces and preservation rules

- Application: `/home/halla/ChartStead`
- Evaluator specifications: `/home/halla/killmysaas-evals`
- Prior invalid run, for historical diagnosis only: `/home/halla/killmysaas-evals/runs/2026-08-12T16-41-14`
- Board: `http://100.105.117.93:3939/`

Both repositories may already contain important uncommitted work. Preserve it. Use read-only inspection plus ordinary product interactions. Do not delete `.wrangler/state`, reset a worktree, or mutate the prior run. If clean local application state is essential, create a uniquely named audit event through the UI. Ask Tyler before deleting or resetting persisted state.

Do not run `pnpm run eval` or spend judge-model tokens during this assignment. Do not fill or finalize the previous run's `manual-results.json`; its screenshots and judgements predate the rubric-completion implementation.

## Required output

Create:

```text
/home/halla/ChartStead/docs/audits/<timestamp>-chartstead-full-rubric-acceptance-audit.md
/home/halla/ChartStead/.artifacts/rubric-audit/<timestamp>/
```

The Markdown report must contain:

1. Environment identity: hostname, repository, branch, commit, dirty-state summary, app URL, server process/cwd, and audit timestamps.
2. Baseline verification results.
3. Persona and event setup used.
4. One result row for every required rubric ID.
5. Evidence links or precise evidence references for every row.
6. Area scores, overall score, and coverage.
7. A defect table with reproduction steps and severity.
8. A final readiness verdict and an explicit list of remaining blockers.

Copy the final Markdown report over SSH to:

```text
veelox:/home/tyler/Desktop/Plans/<same-filename>
```

Verify the remote file exists. In the final response provide both the repository link and `file:///home/tyler/Desktop/Plans/<same-filename>` with the exact remote path.

## Verdict contract

Use only these verdicts:

| Verdict | Meaning | Points |
| --- | --- | ---: |
| `PASS` | The complete criterion was exercised successfully and persisted where required. | 1.0 |
| `PARTIAL` | A meaningful portion works, but at least one required behavior or field is absent or broken. | 0.5 |
| `FAIL` | The relevant surface exists but the required behavior fails. | 0 |
| `NOT_FOUND` | The required capability cannot be found after checking the expected and adjacent surfaces. | 0 |
| `BLOCKED` | An external or environmental dependency prevented a fair test. State the exact dependency and attempted checks. | Unjudged |
| `N/A` | Allowed only where the rubric itself makes the item conditional. | Excluded |

Rules:

- Ticket status and automated tests are supporting evidence, never sufficient by themselves for a manual `PASS`.
- A screenshot of a control is insufficient for a persistence, scoping, side-effect, or round-trip criterion. Perform the action and inspect the result.
- A failed search for an expected capability is `NOT_FOUND`, not `BLOCKED`.
- A product error reached through a valid workflow is `FAIL`, not `BLOCKED`.
- Use `N/A` for ABS-14 only if ChartStead makes no AI-review claim in the audited UI or submission materials. If it claims AI review, exercise and score it.
- For email, calendar, ZIP, CSV, file-download, and multi-account criteria, inspect the actual output or the exact rubric-approved durable outbox/log substitute.
- Mark a checklist box `[x]` when the criterion has been audited and its verdict/evidence recorded. A checked box does not mean the product passed.

## Evidence standard

For every criterion record:

```text
ID | Weight | Verdict | App route/surface | Actions performed | Observed result | Evidence | Notes
```

Evidence must be sufficient for a skeptical reviewer:

- `exists`: populated surface and navigation path.
- `crud`: before, saved state, and post-reload state.
- `roundtrip`: source-role write plus destination-role read with matching values.
- `rule`: allowed control case and rejected/flagged violating case.
- `scoping`: authorized view plus unauthorized or other-event contrast.
- `bulk`: selected set, action confirmation, and resulting records/files.
- `side-effect`: real received artifact or rubric-approved durable delivery record.
- `handoff`: source entity plus destination entity with matching metadata and no re-entry.

Name artifacts with their rubric IDs, for example `CFP-02-workshop-visible.png`, `CFP-02-talk-hidden.png`, `ABS-07-reviewer-blind.png`, and `ABS-07-organizer-identified.png`. Record downloads and parsed contents for CSV, ICS, and ZIP evidence.

## Phase 1 — Preflight

- [ ] Verify hostname, repository root, branch, commit, and dirty-state summary.
- [ ] Verify the YAML rubric source contains exactly 86 required criteria and 183 required item-weight points. Note that the evaluator README currently says 182; treat the live YAML specs as authoritative and record this documentation drift.
- [ ] Verify the board reports Rubric completion 23/23 done; record the remaining explicit human-tandem tickets separately.
- [ ] Identify the running ChartStead demo process by port, PID, command, and working directory. Do not assume port 5173 or 5198 is still correct.
- [ ] Confirm the selected server listens on `0.0.0.0` and its Tailscale `/demo` URL returns HTTP 200.
- [ ] Confirm `/api/health`, `/api/v1/health`, the public CFP, and the public program respond before beginning.
- [ ] Run and record `npm run typecheck`, `npm run test:ui`, `npm run test:worker -- --maxWorkers=4`, `npm run test:e2e`, and `npm run build` from the current integrated tree.
- [ ] Create the timestamped report and evidence directory without modifying existing artifacts.

Completion criterion: the report identifies an exact working build and contains baseline command results. If the app cannot remain healthy through preflight, stop and report an environment blocker instead of generating feature verdicts from an unstable target.

## Phase 2 — Clean audit state and personas

Use the evaluator fixture data verbatim wherever the rubric names fixture values. Prefer a new event named `DevFlow Conf 2027 — Audit <timestamp>` if `DevFlow Conf 2027` already contains prior audit state. Create `Forward Summit 2028 — Audit <timestamp>` for cross-event isolation checks.

Prepare distinct contexts for:

- Organizer Jordan Alvarez
- Submitter/speaker Priya Raman
- Reviewer Sam Whitfield
- A second reviewer for isolation checks
- Accepted speaker/portal identity
- Logged-out attendee

Use `/demo` for curated organizer, track-reviewer, and accepted-speaker access where appropriate. Use separate authenticated browser contexts or profiles for simultaneous-role checks; changing one shared cookie back and forth is insufficient evidence for cross-account isolation. Use real inspectable email addresses only when a rubric requires actual inbox delivery, and never write credentials into the report.

Completion criterion: the report lists every persona, how it was authenticated, the event IDs used, and which contexts are isolated from one another.

## Phase 3 — Required criterion checklist

For each line below, open the corresponding YAML entry and follow its exact pass criteria and evidence instructions. Replace `[ ]` with `[x]` only after adding the result row and evidence to the audit report.

### Call for Papers — 18 criteria, area weight 20%

- [ ] **CFP-01 (w3):** Build short-text, long-text, and dropdown fields with required/optional behavior; verify public rendering and required validation.
- [ ] **CFP-02 (w1):** Configure a format/track condition; verify the dependent field appears and disappears in both directions.
- [ ] **CFP-03 (w3):** Open the CFP logged out; verify event identity, deadline, tracks, and formats.
- [ ] **CFP-04 (w2):** Move closure into the past; verify the public portal blocks new submissions with a truthful closed state.
- [ ] **CFP-05 (w3):** Create a submitter account, submit a proposal, see confirmation, and find it with status in the submitter dashboard.
- [ ] **CFP-06 (w3):** Verify organizer receipt of title, abstract, track, format, and custom values exactly as submitted.
- [ ] **CFP-07 (w1):** Save a title-only draft, leave, return, resume, and verify preserved data.
- [ ] **CFP-08 (w1):** Verify submission confirmation delivery with event and proposal reference through an inspectable inbox or rubric-approved outbox.
- [ ] **CFP-09 (w2):** Edit an open submission and verify the organizer sees the exact edited content.
- [ ] **CFP-10 (w2):** Provision and enter a reviewer account; verify reviewer UI and absence of admin authority.
- [ ] **CFP-11 (w2):** Record rating plus comment; verify reviewer completion and matching organizer-visible review.
- [ ] **CFP-12 (w3):** Record one acceptance and one rejection; reload and verify distinct admin statuses.
- [ ] **CFP-13 (w2):** Verify the submitter dashboard shows the matching accepted and rejected decisions.
- [ ] **CFP-14 (w2):** Send or queue accept/reject notifications and verify dispatch confirmation and correct recipient grouping.
- [ ] **CFP-15 (w2):** Verify an accepted proposal becomes an agenda/session record with title, speaker, and track intact without re-entry.
- [ ] **CFP-16 (w2):** Close the CFP and verify the submitter can no longer save edits.
- [ ] **CFP-17 (w2):** Create a second event and verify both coexist in an event list or switcher.
- [ ] **CFP-18 (w2):** Verify submissions, sessions, and speakers from one event do not appear in the other.

Completion criterion: 18 result rows and 18 checked IDs, including speaker/organizer round trips and the second-event contrast.

### Abstract Management — 14 criteria, area weight 20%

- [ ] **ABS-01 (w3):** Configure at least two independent review rounds with names, dates, and scorecards; reload to verify persistence.
- [ ] **ABS-02 (w2):** Give rounds different reviewer pools and verify round-one access does not imply round-two access.
- [ ] **ABS-03 (w3):** Configure numeric, dropdown, and free-text criteria; verify reviewer rendering and persisted values.
- [ ] **ABS-04 (w1):** Configure criterion weights and verify the displayed aggregate matches the weighted inputs.
- [ ] **ABS-05 (w3):** Assign exact submissions to one reviewer and verify their queue contains exactly that set.
- [ ] **ABS-06 (w2):** Exercise reviewer caps, auto-distribution, or track-filtered bulk assignment and verify the resulting workload.
- [ ] **ABS-07 (w2):** Enable anonymization; contrast a fully blind reviewer view with an identified organizer view.
- [ ] **ABS-08 (w2):** Complete reviews and verify per-reviewer progress counts/percentages update accurately.
- [ ] **ABS-09 (w1):** Select reviewers with outstanding work, send a bulk reminder, and verify confirmation/delivery evidence.
- [ ] **ABS-10 (w3):** Verify organizer aggregate scores and sorting by score.
- [ ] **ABS-11 (w2):** Submit co-presenters with role labels and verify the roles in organizer review/results views.
- [ ] **ABS-12 (w1):** Recuse a reviewer for conflict and verify review prevention plus organizer reassignment visibility.
- [ ] **ABS-13 (w2):** Export review results; parse the downloaded file and compare scores, recommendation, and status with the UI.
- [ ] **ABS-14 (w1):** If AI review is claimed, verify numeric score, substantive rationale, distinguishable human override, and persistence; otherwise record `N/A` with claim-search evidence.

Completion criterion: 14 result rows and 14 checked IDs. ABS-14 is the only conditionally excludable required item.

### Speaker Management — 16 criteria, area weight 15%

- [ ] **SPK-01 (w3):** Verify a populated speaker roster with identity information and working search/filter.
- [ ] **SPK-02 (w3):** Add and edit a speaker profile; reload to verify persistence.
- [ ] **SPK-03 (w2):** Import the fixture CSV and verify mapped speakers, validation, and deduplication behavior.
- [ ] **SPK-04 (w2):** Change a speaker workflow status, reload, and filter by that status.
- [ ] **SPK-05 (w2):** Create one general/action task with a due date for multiple speakers and verify independent assignments.
- [ ] **SPK-06 (w2):** Send a personalized portal invitation/onboarding email and verify its delivery record or inspectable inbox.
- [ ] **SPK-07 (w3):** Open two speaker portals and verify each exposes only that speaker's content.
- [ ] **SPK-08 (w3):** Update biography, social links, and headshot in the portal; verify matching organizer records.
- [ ] **SPK-09 (w2):** Complete a general task in the portal and verify persistent completion plus organizer progress.
- [ ] **SPK-10 (w2):** Upload a deliverable as speaker; verify organizer metadata, preview/download, and file contents.
- [ ] **SPK-11 (w2):** Verify the same session assignments on organizer speaker detail and speaker portal.
- [ ] **SPK-12 (w2):** Verify list-level task completion updates when a portal task is completed.
- [ ] **SPK-13 (w2):** Send a general bulk email to a selected/filtered group and verify recipient scope and logged send.
- [ ] **SPK-14 (w1):** Use merge fields and verify recipient-specific rendered values.
- [ ] **SPK-15 (w1):** Save travel preferences or custom logistics fields and verify event-scoped persistence.
- [ ] **SPK-16 (w1):** Exercise due-date-based automatic reminders with time/policy evidence and verify only incomplete speakers qualify.

Completion criterion: 16 result rows and 16 checked IDs, with at least two distinct speaker identities for scoping evidence.

### Content Management — 14 criteria, area weight 15%

- [ ] **CNT-01 (w3):** Create a file-request task with instructions, due date, and speaker assignment.
- [ ] **CNT-02 (w3):** Verify the portal shows the task/deadline and records an uploaded file against the correct task/session.
- [ ] **CNT-03 (w3):** Verify speaker access is limited to owned sessions/tasks and admin routes are blocked.
- [ ] **CNT-04 (w2):** Re-upload a deliverable; verify a new latest version and accessible prior version.
- [ ] **CNT-05 (w2):** Add file comments from both roles and verify author, timestamp, and cross-role visibility.
- [ ] **CNT-06 (w1):** Verify the upload UI communicates and enforces accepted types and/or maximum size.
- [ ] **CNT-07 (w3):** Verify the deliverables dashboard tracks per-speaker/per-task status, due dates, filtering, and uploads.
- [ ] **CNT-08 (w2):** Trigger bulk reminders for outstanding tasks and verify send confirmation plus recipient scope.
- [ ] **CNT-09 (w2):** Edit session title and abstract centrally; reload to verify persistence.
- [ ] **CNT-10 (w2):** Edit speaker bio and headshot as organizer; reload and compare with speaker/public projections.
- [ ] **CNT-11 (w2):** Verify attributed content version history and restore a prior version as a new auditable version.
- [ ] **CNT-12 (w3):** Set content approval states and verify unapproved sessions are excluded from public output while private schedule data remains.
- [ ] **CNT-13 (w1):** Verify a central files library with session/speaker/date/version metadata and useful filters.
- [ ] **CNT-14 (w2):** Generate a multi-selection ZIP; inspect grouping and verify it contains only selected latest versions.

Completion criterion: 14 result rows and 14 checked IDs, including parsed file/ZIP evidence rather than screenshots alone.

### AI Agenda and Schedule Builder — 8 criteria, area weight 10%

- [ ] **AIA-01 (w3):** Verify a multi-day builder with time plus room/track structure and day navigation.
- [ ] **AIA-02 (w2):** Create a room and track and verify both immediately become usable in agenda work.
- [ ] **AIA-03 (w3):** Place an unscheduled session at an exact day/time/room and verify persistence after reload.
- [ ] **AIA-04 (w3):** Overlap two sessions sharing a speaker and verify a visible, specific double-booking warning.
- [ ] **AIA-05 (w2):** Overlap sessions in one room and verify blocking or a visible room-conflict warning.
- [ ] **AIA-06 (w2):** Move sessions to resolve conflicts; verify new placement, cleared warnings, and persistence.
- [ ] **AIA-07 (w2):** Publish the agenda and verify success plus attendee-facing handoff of scheduled data.
- [ ] **AIA-08 (w1):** Run one-action auto-placement and verify at least one previously unscheduled session is placed.

Completion criterion: 8 result rows and 8 checked IDs, with before/after/reload evidence for placement and conflict repair.

### Public and Embeddable Widgets — 16 criteria, area weight 20%

- [ ] **EMB-01 (w3):** Verify Sessions List cards contain all required fields and working Show more behavior.
- [ ] **EMB-02 (w2):** Search by title word and speaker surname; verify narrowed cards and result count.
- [ ] **EMB-03 (w2):** Apply track, format, and location facets and verify every visible result matches.
- [ ] **EMB-04 (w3):** Verify an alphabetized Speakers List with headshot, name, job title, and company.
- [ ] **EMB-05 (w2):** Search speakers and open detail with biography plus sessions including time and room.
- [ ] **EMB-06 (w3):** Verify a per-day/time agenda structure with sessions at the correct time/room and visible title plus track/format.
- [ ] **EMB-07 (w2):** Switch agenda days and verify both date label and session set change.
- [ ] **EMB-08 (w2):** Open agenda session detail with complete fields, then close/back to the intact agenda.
- [ ] **EMB-09 (w2):** Verify chronological itinerary day sections and complete session/speaker metadata.
- [ ] **EMB-10 (w1):** Add and remove sessions from a personal schedule and verify its contents exactly match selections.
- [ ] **EMB-11 (w1):** Reload to verify personal-schedule persistence and inspect its calendar/export artifact.
- [ ] **EMB-12 (w2):** Verify an alphabetized searchable Speaker Gallery with photos and graceful missing-data states.
- [ ] **EMB-13 (w1):** Open gallery detail with complete speaker/session data and close back to preserved gallery state.
- [ ] **EMB-14 (w3):** Verify all five populated surfaces are reachable outside organizer admin through public or embed routes.
- [ ] **EMB-15 (w3):** Create and save per-widget embed configurations; retrieve and inspect snippets/feed URLs and options.
- [ ] **EMB-16 (w3):** Compare one session across organizer, five public surfaces, and embeds; verify title/time/room/track consistency and documented revision behavior.

Completion criterion: 16 result rows and 16 checked IDs. Capture evidence from every distinct surface; one combined public page cannot stand in for unvisited routes.

## Phase 4 — Completeness and scoring

Before drawing conclusions, mechanically validate the report:

- [ ] Exactly 86 required rubric IDs appear in the results table.
- [ ] Counts are CFP 18, ABS 14, SPK 16, CNT 14, AIA 8, EMB 16.
- [ ] No required ID is duplicated.
- [ ] Every ID has a verdict, actions performed, observed result, and evidence reference.
- [ ] Every `PASS` satisfies the exact YAML `pass_criteria`, not merely the shorthand in this handoff.
- [ ] Every `PARTIAL`, `FAIL`, or `NOT_FOUND` has concise reproduction or search notes.
- [ ] Every `BLOCKED` names an external/environmental dependency and the attempts made.
- [ ] ABS-14 `N/A`, if used, includes evidence that no AI-review claim exists.

Compute scores exactly like the evaluator:

1. Within each area, item points are `PASS=1`, `PARTIAL=0.5`, `FAIL/NOT_FOUND=0`, multiplied by item weight.
2. Divide earned item weight by judged item weight for the area.
3. Combine area percentages using CFP 20%, ABS 20%, SPK 15%, CNT 15%, AIA 10%, and EMB 20%.
4. Report coverage separately. `BLOCKED` items reduce coverage and do not become passes.
5. Report both the conservative overall score and the count of full passes. Do not claim competition readiness while any applicable required item is unjudged.

Use a mechanical ID check such as:

```bash
rg -o '\b(CFP|ABS|SPK|CNT|AIA|EMB)-[0-9]{2}\b' <report.md> \
  | sort | uniq -c
```

Inspect the output rather than trusting the command's exit code. The result section, not citations or prose elsewhere, must contain one canonical row per ID.

Completion criterion: 100% of applicable required criteria have evidence-backed verdicts, the counts reconcile to 86, and the scoring arithmetic is reproducible from the report.

## Phase 5 — Defect handling and final verdict

For every non-pass result:

1. Repeat the shortest valid workflow once in a fresh page or role context.
2. Record expected versus actual behavior.
3. Capture the route, persona, relevant entity IDs, timestamp, console/network symptom if visible, and artifact references.
4. Check whether a focused automated test contradicts the observation; report the contradiction without changing code.
5. Classify severity:
   - `P0`: data/privacy/authorization breach or destructive corruption.
   - `P1`: required competition workflow cannot complete.
   - `P2`: required criterion partial, unreliable, or materially undiscoverable.
   - `P3`: evidence/polish issue that does not prevent the criterion.

Final verdict vocabulary:

- **Ready for external evaluation:** all applicable required items are `PASS`, or Tyler explicitly accepts named partials, with no P0/P1 defects and 100% coverage.
- **Conditionally ready:** no P0/P1 defects, but one or more specific partials or external checks remain.
- **Not ready:** any P0/P1 defect, missing required capability, or material unjudged area remains.

Do not create implementation tickets unless Tyler separately asks. End the report with the smallest prioritized list of defects that would change the readiness verdict.

## Final response checklist

- [ ] State the readiness verdict first.
- [ ] State required coverage, overall score, and pass/partial/fail/blocked/N/A counts.
- [ ] Name the highest-severity defects and affected rubric IDs.
- [ ] Link the repository report and evidence directory.
- [ ] Link the verified Veelox copy with `file:///home/tyler/Desktop/Plans/<filename>` and state its exact path.
- [ ] Cite the GBrain closeout slug created for the audit.
- [ ] Confirm no application implementation, ticket status, deployment, commit, or prior evaluator-run artifact was changed.

## Copy-paste kickoff

```text
Run the complete ChartStead full rubric acceptance audit described in:

/home/halla/ChartStead/docs/2026-08-12-chartstead-full-rubric-acceptance-audit-handoff.md

Audit all 86 required criteria manually against the current integrated competition build. Follow the exact YAML pass criteria, produce evidence for every item, and do not implement fixes or run the LLM evaluator. Do not stop at the old generated manual checklist. Complete the report, mechanically verify criterion coverage and scoring, copy the final report to Veelox Plans, and return the readiness verdict with links.
```
