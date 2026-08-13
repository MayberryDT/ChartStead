# ChartStead full rubric acceptance audit

ChartStead is not ready for external evaluation. The conservative score is 70.9% over 99.3% coverage. 36 of 86 required items fully passed. One required item is missing (EMB-10 personal schedule). 48 items are partial. ABS-14 is not applicable.

This is a manual acceptance audit of the 86 required KillMySaaS criteria. It does not replace a calibrated LLM judge run.

## Environment

| Field | Value |
| --- | --- |
| Hostname | halla |
| Repository | `/home/halla/ChartStead` |
| Branch | `main` |
| Commit | `46bee73c5dd378c3c0e2297078c9e0e83c12a283` |
| Dirty state | Working tree already had substantial uncommitted application and board work. This audit did not implement fixes, change tickets, deploy, commit, merge, or write the prior evaluator run. New files are only this report and `.artifacts/rubric-audit/2026-08-13T01-52-08Z/`. |
| App URL | http://100.105.117.93:5198/demo |
| Server | `npm run dev:demo --host 0.0.0.0 --port 5198` |
| PID / cwd | parent 4006101, vite 4006136, workerd 4006208 · `/home/halla/ChartStead` |
| Listen | `0.0.0.0:5198` |
| Started | 12 Aug 2026 18:08:38 local, about 1 hour 43 minutes before preflight |
| Audit start | 13 Aug 2026 01:50:52 UTC |
| Audit end | 13 Aug 2026 02:10:00 UTC |
| Evidence | `/home/halla/ChartStead/.artifacts/rubric-audit/2026-08-13T01-52-08Z/` |
| YAML source | `/home/halla/killmysaas-evals/specs/01-call-for-papers.yaml` to `06-public-widgets.yaml` |

## Baseline verification

Required item count in live YAML: 86. Required item-weight points: 183. The evaluator README still says 182 and EMB item weight 34. The live specs are authoritative. EMB item weight is 35.

Board at 13 Aug 2026 01:52:37 UTC:

- Rubric completion: 23 of 23 done
- Competition: 26 done, 8 human-tandem visual polish tickets still blocked
- Course Check: 22 done, 2 human-tandem visual tickets still blocked
- Human-tandem tickets left: Competition 12 to 19, Course Check 11 and 12

Health checks against http://100.105.117.93:5198:

| URL | HTTP |
| --- | ---: |
| `/demo` | 200 |
| `/api/health` | 200 `{"status":"ok"}` |
| `/api/v1/health` | 200 |
| `/e/pacific-open-data-summit-2026/cfp` | 200 |
| `/e/pacific-open-data-summit-2026/program` | 200 |
| `/api/events/pacific-open-data-summit-2026/cfp` | 200, lifecycle open |
| `/api/events/pacific-open-data-summit-2026/program` | 200, revision 1 current |

Baseline commands from `/home/halla/ChartStead`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run test:ui` | 27 files, 140 tests passed |
| `npm run test:worker -- --maxWorkers=4` | 2 failed, 263 passed. Failures are 5s timeouts in `test/worker/app.test.ts` rate-limit test and `test/worker/guided-cfp.test.ts` upload-policy test. |
| `npm run test:e2e` | did not run. Playwright refused to start because `http://127.0.0.1:4173/api/health` is already used and `reuseExistingServer` is false. Port 4173 is an existing ChartStead vite on this host. |
| `npm run build` | passed. Vite warned that some chunks exceed 500 kB. |

The app stayed healthy through preflight and the rest of the audit.

## Personas and events

Isolated browser tabs:

| Persona | How authenticated | Context | Isolated from |
| --- | --- | --- | --- |
| Organizer Demo Administrator | `POST /api/demo/personas/organizer/enter` then `/e/:eventId/submissions` | tab `organizer` | reviewer and speaker cookies |
| Track reviewer Platform Track Reviewer | `POST /api/demo/personas/track-reviewer/enter` | tab `reviewer` | organizer cookie |
| Accepted speaker Maya Chen | `POST /api/demo/personas/accepted-speaker/enter` signed portal | tab `speaker-maya` | organizer and reviewer |
| Logged-out attendee | no demo cookie | tabs `public`, `sessions`, `speakers-public`, `agenda-public`, `itinerary`, `gallery`, `embed-public`, `closed-cfp` | all signed contexts |

Fixture identities used in writes:

- Submitter and speaker Priya Raman, `sbek-speaker@example.com`
- Co-speaker Marcus Okafor, `sbek-speaker2@example.com`
- Reviewer Sam Whitfield was not given a live magic-link inbox. The demo track-reviewer persona stood in for reviewer UI and API isolation.
- A second simultaneous reviewer account was not opened.

Events:

| Event | ID | Role in this audit |
| --- | --- | --- |
| Pacific Open Data Summit 2026 | `pacific-open-data-summit-2026` | seeded live desk, 62 submissions after the audit submit |
| DevFlow Conf 2027 — Audit 2026-08-13T01-52-08Z | `devflow-conf-2027-audit-20260813` | new empty event for create, close, and isolation |
| DevFlow Conf 2027 | `devflow-conf-2027` | already existed empty; not reused for writes |
| Forward Summit 2028 | `forward-summit-2028` | second empty event, 0 proposals |
| AI Engineer World's Fair 2026 | `ai-engineer-worlds-fair-2026` | present in the switcher only |

Pacific already contained prior fixture work: Priya and Marcus speakers, Dana Kowalski from CSV, accepted Taming session, Maya portal, and queued confirmation mail. New writes in this audit: event `devflow-conf-2027-audit-20260813`, proposal `SUB-AD216929`, evaluation plan rounds, Priya workflow and logistics, Harbor Hall room overlap then repair, auto-place of Taming to 09:00, embed `embed_0e6158100432422ebb`.

## Scores

Scoring matches the evaluator: PASS = 1.0, PARTIAL = 0.5, FAIL and NOT_FOUND = 0, times item weight. Area score is earned weight divided by judged weight. Overall is the area-weighted mean. N/A is excluded. BLOCKED would reduce coverage. There were no BLOCKED items.

| Area | Area weight | Item weight | Judged weight | Earned | Area score | Judged items |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Call for papers | 20% | 38 | 38 | 28.5 | 75.0% | 18/18 |
| Abstract management | 20% | 28 | 27 | 18.0 | 66.7% | 13/14 |
| Speaker management | 15% | 33 | 33 | 26.0 | 78.8% | 16/16 |
| Content management | 15% | 31 | 31 | 18.5 | 59.7% | 14/14 |
| AI agenda and schedule builder | 10% | 18 | 18 | 15.5 | 86.1% | 8/8 |
| Public and embeddable widgets | 20% | 35 | 35 | 23.0 | 65.7% | 16/16 |
| Overall | 100% | 183 | 182 | — | 70.9% | 85/86 judged |

Coverage: 99.3% of required area weight. Headline score is valid because coverage is above 60%.

Verdict counts: 36 PASS, 48 PARTIAL, 0 FAIL, 1 NOT_FOUND, 0 BLOCKED, 1 N/A.

## Results

A checked box means the item was audited, not that it passed.

Checked IDs:

- [x] CFP-01
- [x] CFP-02
- [x] CFP-03
- [x] CFP-04
- [x] CFP-05
- [x] CFP-06
- [x] CFP-07
- [x] CFP-08
- [x] CFP-09
- [x] CFP-10
- [x] CFP-11
- [x] CFP-12
- [x] CFP-13
- [x] CFP-14
- [x] CFP-15
- [x] CFP-16
- [x] CFP-17
- [x] CFP-18
- [x] ABS-01
- [x] ABS-02
- [x] ABS-03
- [x] ABS-04
- [x] ABS-05
- [x] ABS-06
- [x] ABS-07
- [x] ABS-08
- [x] ABS-09
- [x] ABS-10
- [x] ABS-11
- [x] ABS-12
- [x] ABS-13
- [x] ABS-14
- [x] SPK-01
- [x] SPK-02
- [x] SPK-03
- [x] SPK-04
- [x] SPK-05
- [x] SPK-06
- [x] SPK-07
- [x] SPK-08
- [x] SPK-09
- [x] SPK-10
- [x] SPK-11
- [x] SPK-12
- [x] SPK-13
- [x] SPK-14
- [x] SPK-15
- [x] SPK-16
- [x] CNT-01
- [x] CNT-02
- [x] CNT-03
- [x] CNT-04
- [x] CNT-05
- [x] CNT-06
- [x] CNT-07
- [x] CNT-08
- [x] CNT-09
- [x] CNT-10
- [x] CNT-11
- [x] CNT-12
- [x] CNT-13
- [x] CNT-14
- [x] AIA-01
- [x] AIA-02
- [x] AIA-03
- [x] AIA-04
- [x] AIA-05
- [x] AIA-06
- [x] AIA-07
- [x] AIA-08
- [x] EMB-01
- [x] EMB-02
- [x] EMB-03
- [x] EMB-04
- [x] EMB-05
- [x] EMB-06
- [x] EMB-07
- [x] EMB-08
- [x] EMB-09
- [x] EMB-10
- [x] EMB-11
- [x] EMB-12
- [x] EMB-13
- [x] EMB-14
- [x] EMB-15
- [x] EMB-16


### Call for papers

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| CFP-01 | 3 | PASS | /e/pacific-open-data-summit-2026/forms/main-cfp and /cfp | Opened builder and public CFP. Submitted empty public form. | Builder has short text, long text, dropdown, required flags. Public form shows required Key takeaway plus Audience level dropdown. Empty submit blocked with visible errors. | screenshots/CFP-01-builder.webp, CFP-01-forms-list.webp, CFP-01-required-validation.webp | Live published form already includes the three field types. |
| CFP-02 | 1 | PASS | /e/pacific-open-data-summit-2026/cfp | Selected Workshop then Talk on Session format. | Workshop duration and Workshop prerequisites appeared for Workshop and disappeared for Talk. | screenshots/CFP-02-workshop-visible.webp, CFP-02-talk-hidden.webp | App vocabulary Talk/Workshop/Panel is allowed. |
| CFP-03 | 3 | PARTIAL | /e/pacific-open-data-summit-2026/cfp logged out | Loaded public CFP and opened track and format lists. | Event name and deadline 30 Apr 2027 11.59pm PDT visible. Tracks are Platform, Program Ops, Design Systems, Community, Course Check Demo. Formats are Talk, Workshop, Panel. | screenshots/CFP-03-public-cfp.webp, CFP-03-track-options.webp, CFP-03-format-options.webp | Portal works, but options do not match the DevFlow fixture track and duration-labelled format lists. |
| CFP-04 | 2 | PASS | /e/devflow-conf-2027-audit-20260813/cfp | Created audit event, published Main CFP, POSTed close, opened public CFP logged out. | Public portal returns closed state. UI: Submissions are closed. No new-proposal form. API 410. | screenshots/CFP-04-closed.webp | Closed a new audit event so the seeded Pacific CFP stayed open. |
| CFP-05 | 3 | PARTIAL | POST /api/events/.../proposals and /proposals/SUB-AD216929 | Submitted the Taming 40-Minute CI fixture as Priya plus Marcus without signing in. | 201 created SUB-AD216929. Confirmation page shows Thanks - your proposal is in, stable ID, title, speaker, track. Submitter dashboard GET is 401 without a magic-link session. | screenshots/CFP-05-confirmation.webp | Account create is email magic link only. No inspectable inbox in this audit, so dashboard listing was not completed. |
| CFP-06 | 3 | PASS | /e/.../submissions and GET organizer proposal SUB-AD216929 | Opened organizer detail after submit. | Title, abstract including the 2026 sentence, track Platform, format talk, customQuestion1 takeaway, customQuestion2 intermediate, and Marcus Okafor as co-speaker match the submit. | API organizer proposal SUB-AD216929; submissions list in organizer snapshot | Custom labels appear under generated question names. |
| CFP-07 | 1 | PARTIAL | /e/.../cfp Save draft and /my-proposals | Inspected public CFP and dashboard route. | Save draft is offered only after submitter sign-in. Dashboard exists at /my-proposals. Logged-out GET /submitter/proposals returns 401. | CFP-03 public CFP copy; API 401 on submitter proposals | Draft resume was not completed because magic-link mail was not available. |
| CFP-08 | 1 | PASS | GET /api/v1/events/.../communications | Submitted SUB-AD216929 and read the outbox. | Row outbox-SUB-AD216929 kind submission_confirmation to sbek-speaker@example.com subject Proposal received: Taming 40-Minute CI... Confirmation page claims an email is on its way. Delivery status failed with Email delivery failed with status 401. | API communications row outbox-SUB-AD216929 | Rubric allows an inspectable outbox substitute. Actual inbox delivery failed. |
| CFP-09 | 2 | PARTIAL | /e/.../edit/:token and organizer detail | Submitted already-edited abstract. Inspected edit path in code and confirmation copy. | Organizer already sees Updated: now includes 2026 benchmark data because it was in the original submit. Dashboard has no Edit. Edit is the confirmation-email token URL. | CFP-05 confirmation; organizer answers abstract | Post-submit edit then organizer reread was not a separate write. |
| CFP-10 | 2 | PARTIAL | /demo track reviewer then /e/.../submissions?track=platform | Entered isolated reviewer cookie. Opened queue and Settings. | Identity Platform Track Reviewer. Queue is Platform only, 18 rows. Settings reviewer routing and evaluation plan show Administrator access required. Sidebar still includes Forms, Speakers, Agenda, Messages, Embeds, Settings. | screenshots/CFP-10-reviewer-queue-loaded.webp, CFP-10-reviewer-settings-blocked.webp | Reviewer APIs are blocked. Admin navigation is still visible. |
| CFP-11 | 2 | PARTIAL | Reviewer proposal inspector | Opened reviewer queue and attempted PATCH review. | Lightweight Approve/Maybe/Deny plus committee note exist. PATCH with status approved returned Unknown review status. Advanced numeric scorecard was not submitted. | CFP-10 queue; API review 400 | Rating 4 plus fixture comment were not stored in this run. |
| CFP-12 | 3 | PASS | /e/pacific-open-data-summit-2026/submissions | Loaded organizer submissions and status filters. | Distinct persisted statuses: Approve on Taming SUB-7BC7AB9A and Deny on Coastal sensors SUB-PODS0050, plus Unreviewed and Maybe rows. Batch Accept/Decline present. | organizer submissions snapshot | Statuses survive reload of the live desk. |
| CFP-13 | 2 | PARTIAL | /e/.../my-proposals | Inspected dashboard route and status mapping. | Dashboard exists and maps accepted or not selected. Could not sign in as Priya. Organizer side already has accepted and denied rows. | Submitter dashboard 401; proposals mapping in worker/proposals.ts | Speaker-side accepted versus rejected pair not seen in an authenticated Priya session. |
| CFP-14 | 2 | PARTIAL | /e/.../messages | Opened Messages. | Compose plus Course Check handoff exists. History includes Your session has been accepted (1 recipient) and a program update (4 recipients). Accept/reject notify for the new pair was not sent. | screenshots/SPK-13-messages.webp | Dispatch confirmation for this audit's accept/reject set was not produced. |
| CFP-15 | 2 | PASS | /e/.../agenda and GET /sessions | Inspected organizer sessions after prior acceptance. | Session Taming 40-Minute CI lists Priya Raman and Platform with no re-entry. Maya session also present. | AIA-01 agenda text; sessions API | Handoff already present in the live store. |
| CFP-16 | 2 | PARTIAL | Closed audit CFP plus edit API contract | Closed the new event CFP. Inspected edit-lock behaviour in the worker. | New submissions blocked when closed. Edit token GET is 410 after close. Did not prove Priya cannot save an existing Pacific proposal after close. | screenshots/CFP-04-closed.webp; worker submitter edit 410 | Lock exists; not replayed on the live Pacific submission. |
| CFP-17 | 2 | PASS | POST /api/events and event switcher | Created DevFlow Conf 2027 — Audit 2026-08-13T01-52-08Z. Listed events. | 201 created. Switcher now has Pacific, AI Engineer World's Fair, DevFlow Conf 2027, the audit event, and Forward Summit 2028. | screenshots/CFP-17-new-audit-event.webp | Used a unique audit slug because DevFlow Conf 2027 already existed. |
| CFP-18 | 2 | PASS | /e/devflow-conf-2027-audit-20260813/submissions and Forward proposals API | Opened the new event desk and listed Forward proposals. | Audit event Submissions 0. Forward proposals []. Pacific still has 62. | screenshots/CFP-17-new-audit-event.webp; API fwdCount 0 | No cross-event leakage observed. |
### Abstract management

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| ABS-01 | 3 | PASS | /e/.../settings Advanced evaluation plan and PUT /evaluation-plan | Saved two named rounds then GET reload. | Initial Review 2026-08-01 to 2026-10-15 and Final Review 2026-10-16 to 2026-11-30 persisted with distinct scorecards. | screenshots/ABS-settings-loaded.webp; GET evaluation-plan after PUT | Plan was null before this save. |
| ABS-02 | 2 | PASS | PUT /evaluation-plan reviewerPool | Configured pools on the two rounds. | Round 1 pool is demo-track-reviewer. Round 2 pool is empty. Reload kept the split. | GET evaluation-plan reloadRounds | Round membership is per-round, not global. |
| ABS-03 | 3 | PARTIAL | Settings scorecard editor and PUT plan | Saved numeric, dropdown, and free-text criteria on round 1. | Four criteria stored. Reviewer did not submit those typed values in this run. | planPut nCrit 4 | Editor and persistence work. Reviewer typed-value roundtrip not completed. |
| ABS-04 | 1 | PARTIAL | Scorecard weights on Initial Review | Saved Originality weight 2 and Relevance weight 1. | Weights persist. UI says aggregates are normalised to 0–100. No 4-and-2 scored row to check arithmetic. | planPut criteria; settings copy | Cannot confirm 66.67 versus a raw 3.33 without completed scores. |
| ABS-05 | 3 | PARTIAL | Reviewer queue and assignment APIs | Opened the Platform reviewer queue. Inspected assignment endpoints. | Without using exact assignments after enabling the plan, the reviewer still sees the whole Platform track (18). Assignment GET/PATCH/distribute exist. | screenshots/CFP-10-reviewer-queue-loaded.webp | Exact assigned-set scoping was not proven live. |
| ABS-06 | 2 | PARTIAL | Settings assignment card and POST .../distribute | Inspected UI and worker routes. | Per-reviewer cap, preview, and distribute exist. Not executed against a fresh set in this run. | worker/app.ts assignment preview/distribute | Tooling present; workload result not freshly generated. |
| ABS-07 | 2 | PARTIAL | Initial Review Blind reviewer view | Enabled anonymization=blind on round 1. | Setting persisted. Did not reopen the reviewer inspector after enable to prove Priya/Marcus/Latticework are hidden. | reloadRounds anon blind | Blind config exists; live contrast screenshots were not taken after enable. |
| ABS-08 | 2 | PARTIAL | Settings Review progress | Read progress before enabling the plan. | Shared track queue: 0 of 17 complete, 17 outstanding, Platform Track Reviewer 0/17. After-plan recount not recaptured. | ABS-settings-loaded progress text | Counts exist and were non-zero outstanding. Real-time 0 then 2 of 2 not shown. |
| ABS-09 | 1 | PARTIAL | Settings Prepare reminder drafts | Observed the reminder controls. | Prepare reminder drafts and Queue reviewed reminders exist. No send was triggered. | ABS-settings-loaded | Confirmation/delivery not produced in this run. |
| ABS-10 | 3 | PARTIAL | Submissions Review results plus Aggregate sort | Loaded results table and CSV. | Table has Submission, Speakers, Completion, Recommendation, Aggregate, with sort on Aggregate. All visible aggregates are Incomplete/Unscored, so 5.0 versus 3.33 reorder was not shown. | organizer submissions snapshot; ABS-13 CSV | Sort control exists; scored reorder not exercised. |
| ABS-11 | 2 | PASS | Organizer results and SUB-AD216929 detail | Inspected speakers on Taming rows. | Marcus Okafor appears as co-speaker beside Priya Raman on results and on the new submission. Harbor data trusts also shows primary and co-speaker roles. | organizer results table; proposal speakers | Role labels are present. |
| ABS-12 | 1 | PARTIAL | Proposal inspector recusal control | Searched UI and worker recusal POST. | Record conflict / recusal exists for reviewers. Not clicked in this run. | worker recusal route; AbsSurface map | Capability found; prevention after recusal not freshly proven. |
| ABS-13 | 2 | PASS | /api/events/.../review-results.csv | Downloaded and parsed the CSV. | Filename pacific-open-data-summit-2026-review-results.csv. Columns include proposal_id, title, speakers with roles, review_completion, recommendation, aggregate_score. Rows match the on-screen unscored/not_started state. | downloads/ABS-13-review-results.csv, ABS-13-headers.txt | No completed numeric criteria to compare beyond recommendation and status. |
| ABS-14 | 1 | N/A | src/, context.md, rubric-completion spec, Settings, Submissions | Searched UI copy, APIs, and submission materials for an AI-review claim. | No AI review, triage, or evaluator control. Product docs say AI-assisted evaluation is out of scope. | src grep empty; context.md; .scratch/chartstead-rubric-completion/spec.md | N/A is allowed when the product makes no AI-review claim. |
### Speaker management

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| SPK-01 | 3 | PASS | /e/.../speakers | Opened the roster. | Priya, Maya, Dana, Marcus listed with identity and readiness. Search and workflow/readiness filters exist. | screenshots/SPK-01-roster.webp | 4 speakers at first load. |
| SPK-02 | 3 | PASS | Speakers Add speaker and profile edit | Inspected add form and Priya profile. | Add speaker accepts name, email, bio. Priya biography still contains SBEK-ORG-EDIT-01 after reload of the live event. | SPK-01-roster biography text | Prior organizer edit persisted in the current store. |
| SPK-03 | 2 | PASS | Speakers Import CSV | Inspected roster for the fixture extra row. | Dana Kowalski dana.speaker@sbek-test.example.com is present with invited status. Import CSV control is on the roster. | SPK-01-roster; GET /speakers | Matches the fixture CSV new-person signal. |
| SPK-04 | 2 | PASS | PATCH /speakers/:id/participation | Set Priya workflow to confirmed and reloaded onboarding. | workflowStatus confirmed after save and after GET reload. Filter list includes Invited/Confirmed/Preparing/Ready/Withdrawn. | API priyaReload.workflow | Status is event-scoped participation. |
| SPK-05 | 2 | PARTIAL | Speakers Assign task | Inspected multi-speaker assign form and current tasks. | Form can assign one task to Priya, Maya, Dana, Marcus. Priya has the three general tasks. Marcus has none of those general tasks. | SPK-01-roster missing work; GET /tasks | Multi-assign UI exists; the two-speaker independent set was not created in this run. |
| SPK-06 | 2 | PARTIAL | /e/.../messages portal invitation | Opened Messages compose. | Personalize as speaker portal invitation exists. Course Check reviews before send. Invitation was not sent this run. Maya portal is reachable from /demo. | screenshots/SPK-13-messages.webp | Delivery record for a fresh invite was not created. |
| SPK-07 | 3 | PASS | /demo accepted speaker → /portal/:token | Opened Maya Chen portal in its own tab. | Welcome, Maya Chen. Session Building trustworthy public-data platforms. No Priya, Marcus, or Dana content. URL is a signed portal token. | screenshots/SPK-07-maya-portal.webp | Separate browser tab from organizer. |
| SPK-08 | 3 | PARTIAL | Maya portal profile and organizer Priya record | Inspected portal profile fields and organizer biography. | Portal edits biography, HTTPS social links, and headshot. Maya already has headshot.png. Worker portal PATCH drops socialLinks. Organizer Priya bio persisted. | SPK-07-maya-portal; SpkCntSurface worker note | Social-link half fails if saved only from the portal. |
| SPK-09 | 2 | PARTIAL | Maya portal tasks | Read portal completion state. | Maya 1 open, 67% complete, 2 completed history items. Priya's three general tasks remain open. | SPK-07-maya-portal | Portal completion works. The fixture three-task pair was not completed in this run. |
| SPK-10 | 2 | PARTIAL | Maya portal headshot and organizer files library | Compared portal file with organizer library. | Portal shows headshot.png and Open. Organizer files library: 0 latest deliverables. Profile headshots are not in the library. | SPK-07; onboarding/files filesCount 0 | Download of a task deliverable was not exercised. |
| SPK-11 | 2 | PASS | Organizer speaker detail and Maya portal | Compared session titles. | Priya organizer row shows Taming 40-Minute CI. Maya portal shows Building trustworthy public-data platforms. | SPK-01-roster; SPK-07-maya-portal | Each speaker sees their own linked session. |
| SPK-12 | 2 | PASS | Speakers list-level missing/open counts | Read roster progress without opening every record. | Priya 6 open, Maya 1 open, Dana 0, Marcus 0. Filters for outstanding and ready exist. | SPK-01-roster | List-level completion is visible. |
| SPK-13 | 2 | PARTIAL | /e/.../messages | Opened audience compose and history. | Select visible speakers, subject/body, Review in Course Check, history with recipient counts. Welcome send was not executed. | screenshots/SPK-13-messages.webp | Logged send for a new welcome was not produced. |
| SPK-14 | 1 | PASS | Messages compose substitutions | Read template help and preview empty state. | Available substitutions: {{speaker_name}}, {{proposal_title}}, {{event_name}}. Preview requires a selected speaker. | SPK-13-messages | Portal URL token is only added for invitation mode. |
| SPK-15 | 1 | PASS | PATCH participation travel/logistics | Saved Priya travel and logistics, then GET onboarding. | travelPreferences Vegetarian; arriving May 11. logistics tshirt M and hotel need downtown block after reload. | API priyaReload | Event-scoped. |
| SPK-16 | 1 | PARTIAL | Speakers automatic due reminders | Read policy controls. | Enable automatic due reminders and Run due reminder policy now exist. Policy: off, mode draft, suppress 72h. No 24-hour wait and no automatic send observed. | SPK-01-roster policy line | Capability present; automatic cycle not proven. |
### Content management

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| CNT-01 | 3 | PARTIAL | Speakers Assign task file type | Inspected task presets. | Slide deck upload and Upload a file completion exist, with due date and multi-speaker assign. Fixture file tasks were not created in this run. | SPK-01-roster ASSIGN TASK | UI present; fixture pair not saved here. |
| CNT-02 | 3 | PARTIAL | Maya portal onboarding tasks | Inspected portal upload task. | Upload headshot task with due 5 Oct 2026 and Upload file control. slides.pdf was not uploaded. | SPK-07-maya-portal | Portal records uploads against a task; this run did not attach slides. |
| CNT-03 | 3 | PASS | Maya portal versus organizer routes | Compared portal content and reviewer/organizer access. | Portal shows only Maya. Speaker access is token URL, not admin session. Reviewer Settings writes are administrator-only. | SPK-07; CFP-10 settings 403 | Admin capability is not granted to speaker or reviewer principals. |
| CNT-04 | 2 | PARTIAL | Portal/organizer version list | Inspected files library and portal history. | Versioning is implemented. Library has 0 files. No second slides upload, so two versions were not shown. | onboarding/files filesCount 0 | Capability found; version pair not produced. |
| CNT-05 | 2 | PARTIAL | Asset comments APIs and UI | Inspected comment surfaces in mapping and library. | Comment thread UI/API exist for speaker and organizer. No comment was posted. | SpkCntSurface comment routes | Cross-role thread not created in this run. |
| CNT-06 | 1 | PASS | Maya portal upload copy and public CFP file field | Read visible constraint text. | Portal: Accepted .jpg .jpeg .png .webp · Max 5 MB. Public CFP: Optional. PDF or image up to 5 MB. | SPK-07-maya-portal; CFP-03 public CFP | Constraints are visible at the upload control. |
| CNT-07 | 3 | PARTIAL | Speakers dashboard and filters | Loaded speakers with missing-work table. | Per-speaker open/overdue/next due and filters work. Uploads are 0 so complete-versus-incomplete file state was not shown. | SPK-01-roster | Status tracking exists; upload reflection not shown. |
| CNT-08 | 2 | PARTIAL | Speakers Bulk task reminders | Read the bulk reminder card. | Select shown outstanding, Prepare drafts, Queue sends now. Not executed. | SPK-01-roster BULK TASK REMINDERS | Send confirmation not produced. |
| CNT-09 | 2 | PARTIAL | Agenda session inspector | Opened Agenda content review. | Title and abstract fields, Save content, version 1 approved. No new UPDATED: title was saved. | screenshots/AIA-01-agenda.webp CONTENT REVIEW | Central edit exists; fresh persist cycle not run. |
| CNT-10 | 2 | PASS | Organizer speaker profile | Read Priya current profile after earlier edit. | Biography includes SBEK-ORG-EDIT-01. Replace headshot exists. Event-time title snapshot is separate. | SPK-01-roster CURRENT PROFILE | Organizer profile edit persists. |
| CNT-11 | 2 | PARTIAL | Agenda Version history | Inspected history panel. | Version history (1) and restore control exist. Did not restore a prior version as a new row. | AIA-01-agenda | Attribution panel present; restore not executed. |
| CNT-12 | 3 | PARTIAL | Agenda content status versus /program | Compared private sessions with public program. | Private sessions are approved and placed. Public program still shows seed revision 1 Ada/Grace/Katherine sessions, not Taming at 09:00. Gate exists in publication planner. | program revision pubrev_..._seed; afterApply placements | Unapproved exclusion not proven against a live publish of these sessions. |
| CNT-13 | 1 | PARTIAL | Speakers Files library | Opened the library. | Central library with speaker/session/status/type/due filters exists. 0 latest deliverables. | SPK-01-roster Files library | Empty because no task files were uploaded. |
| CNT-14 | 2 | PARTIAL | Files library Export ZIP | Observed export controls. | Select visible and Export ZIP exist. Copy says only selected latest versions. No ZIP was generated. | SPK-01-roster Export ZIP | Parsed ZIP evidence is missing. |
### AI agenda and schedule builder

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| AIA-01 | 3 | PASS | /e/.../agenda | Opened the builder. | Wed 7 Oct and Thu 8 Oct tabs, 09:00–17:30 slots, Harbor Hall / Compass Room / Chart Room / TBD, unplaced pool. | screenshots/AIA-01-agenda.webp | Two-day event, not three fixture days. |
| AIA-02 | 2 | PASS | Settings rooms/tracks and agenda grid | Inspected existing rooms and added rooms/tracks on the audit event. | Pacific rooms are usable in the grid. Audit event accepted Main Stage and Room 2A plus fixture tracks via PATCH configuration. | Settings rooms; cfgStatus 200 | Creation is in Settings, then immediately usable. |
| AIA-03 | 3 | PASS | PATCH /sessions/:id | Placed Taming in Harbor Hall at 2026-10-07T17:00Z then read sessions again. | Placement persisted. Later auto-place moved it to 09:00 after a temporary unplace. | API p1 session; afterApply | Reload was a fresh GET. |
| AIA-04 | 3 | PARTIAL | Agenda conflicts | Overlapped Maya and Priya in Harbor Hall at 17:00. Could not attach Priya to a second session from Agenda. | Room overlap warning fired. Speaker double-book detector exists in shared/schedule-conflicts.ts but was not shown for one speaker. | API p2 conflicts room_overlap | No agenda UI to put the same speaker in two sessions. |
| AIA-05 | 2 | PASS | Same room overlapping times | Placed Maya onto Priya's Harbor Hall 17:00 slot. | Visible specific warning: Room overlap in Harbor Hall naming both titles. Placement saved with the warning. | API p2 conflicts summary | Flagged, not blocked, which the rubric allows. |
| AIA-06 | 2 | PASS | PATCH Maya to Compass Room 18:00 | Moved Maya, then GET sessions. | Conflicts []. Maya compass-room 18:00. Later Taming auto-placed 09:00 Harbor Hall. | API move; afterMoveConflicts [] | Warnings cleared after the move. |
| AIA-07 | 2 | PARTIAL | Agenda Publish program and /program | Opened Publish program and public program. | Publish program opens Publication Course Check. Public program is already published revision 1 seed data, not the working placements. | AIA-01 Publish program; GET /program | Handoff exists; this run did not apply a new publish. |
| AIA-08 | 1 | PASS | POST /agenda/auto-place/preview and apply | Unplaced Taming, previewed, applied. | Preview placed Taming at Harbor Hall 09:00. Apply 200 appliedSessionIds contains that session. GET shows placed. | API preview/apply/afterApply | One-action assisted placement worked. |
### Public and embeddable widgets

| ID | Weight | Verdict | App route or surface | Actions performed | Observed result | Evidence | Notes |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| EMB-01 | 3 | PARTIAL | /e/.../program/sessions | Loaded Sessions List. | Four cards with title, description, date/time or TBD, room, speakers, format, track. Speaker job title and company are Title/company not provided. Show more was not confirmed to expand. | screenshots/EMB-01-sessions-list.webp | Required speaker title/company fields are empty in the published seed. |
| EMB-02 | 2 | PASS | Sessions List search | Searched keynote then Hopper. | keynote left Opening keynote. Hopper left Program ops and Closing circle. Counts changed. | screenshots/EMB-02-search-title.webp, EMB-02-search-speaker.webp | Title word and speaker surname both work. |
| EMB-03 | 2 | PASS | Sessions List Track facet | Set Track to Platform. | Showing 2 of 4 sessions: Opening keynote and Hands-on only. Both are Platform. | screenshots/EMB-03-track-filter.webp | Format and Location facets also exist. |
| EMB-04 | 3 | PARTIAL | /e/.../program/speakers | Loaded Speakers List. | Distinct directory. Order Hopper, Johnson, Lovelace. Initials fallback. Job title and company are Professional details pending. | screenshots/EMB-04-speakers-list.webp | Alphabetical by surname holds; title/company missing. |
| EMB-05 | 2 | PARTIAL | Speakers List search and detail | Loaded speakers page. Click on Ada Lovelace stalled. | Search box exists. Combined agenda already shows speaker plus session time/room. Dedicated detail screenshot was not captured. | EMB-04; EMB-06 speakers pane | Bio plus per-speaker sessions not fully opened. |
| EMB-06 | 3 | PASS | /e/.../program/agenda | Loaded public Agenda. | Day/time list with sessions at Harbor Hall 3pm, Compass Room 4pm, TBD workshop, Thursday 5pm. Title plus track/format visible. | screenshots/EMB-06-public-agenda.webp | Time-slotted list is allowed. Not a room-column grid. |
| EMB-07 | 2 | PARTIAL | Agenda day filter | Observed day options. | Wed 7 Oct, Thu 8 Oct, Time TBD options exist. Day switcher was not clicked to prove the label and set both change. | EMB-06-public-agenda | Control present; day-to-day reread not captured. |
| EMB-08 | 2 | PARTIAL | Sessions List click Opening keynote | Clicked the keynote card. | List stayed a list. Combined agenda has a Session detail pane. Full start-end plus Back was not captured. | screenshots/EMB-08-session-detail.webp | Detail chrome exists on the combined agenda, not proven on this click. |
| EMB-09 | 2 | PASS | /e/.../program/itinerary | Loaded itinerary. | Day sections Wed, Thu, Time TBD. Times ascend. Cards include track, title, room, speakers. | screenshots/EMB-09-itinerary.webp | TBD workshop is in a Time TBD section. |
| EMB-10 | 1 | NOT_FOUND | Itinerary, sessions, agenda, gallery | Searched UI copy and src/PublicProgramRenderer.tsx for personal schedule, star, bookmark, my schedule. | No add/star/My Schedule control. Selecting a card only highlights it. src has no personalSchedule symbols. | screenshots/EMB-09-itinerary.webp; src grep empty | Required personal-schedule capability is absent. |
| EMB-11 | 1 | PARTIAL | Per-session calendar.ics | Downloaded one-session and two-session ICS. No personal schedule to reload. | Single ICS has Opening keynote, 7 Oct 2026 15:00–15:45Z, Harbor Hall. Multi ICS has two VEVENTs. Personal schedule persist does not exist. | downloads/EMB-11-session.ics, EMB-11-multi.ics | Calendar artefact works; personal-schedule persist does not. |
| EMB-12 | 2 | PARTIAL | /e/.../program/speaker-gallery | Loaded gallery. | Visual cards with initials, name, pending professional details. Search box present. Order Hopper, Johnson, Lovelace. | screenshots/EMB-12-gallery.webp | Missing title/company. Photo-less fallback works. |
| EMB-13 | 1 | PARTIAL | Gallery cards | Loaded gallery. Did not open a card. | Gallery exists. Detail behaviour is shared with the speakers renderer. Close-back state not captured. | EMB-12-gallery.webp | Detail plus restore not exercised. |
| EMB-14 | 3 | PASS | /program/sessions, /speakers, /agenda, /itinerary, /speaker-gallery logged out | Opened all five routes without an organizer cookie. | Each route rendered populated Pacific seed content outside the admin shell. | EMB-01, EMB-04, EMB-06, EMB-09, EMB-12 | Anonymous access works. |
| EMB-15 | 3 | PARTIAL | /e/.../embeds and /embed/embed_0e6158100432422ebb | POSTed Sessions List embed, opened public URL, fetched feed.json. | Saved Audit Sessions List. iframe snippet, publicUrl, feedUrl recorded. Public embed renders the four sessions. Formats are iframe HTML plus JSON only. | screenshots/EMB-15-embeds.webp, EMB-15-public-embed.webp; embed_0e6158100432422ebb | Missing XML, basic HTML, script tag, and iCal format pickers. |
| EMB-16 | 3 | PARTIAL | Organizer sessions versus five public surfaces and embed | Compared one seed session across surfaces. Compared working agenda placements with public. | Opening keynote title, 3pm, Harbor Hall, Platform match across sessions, agenda, itinerary, and embed. Working Taming 09:00 Harbor Hall does not appear publicly until a new Publication Course Check. | GET /program; afterApply; embed feed | Published snapshot is consistent. Live agenda edits do not propagate without republish. |

## Defects

| ID | Severity | Expected | Actual | Reproduction | Focused test contrast |
| --- | --- | --- | --- | --- | --- |
| EMB-10 | P1 | Attendee can add and remove sessions and see a personal schedule with exactly those sessions | No star, bookmark, or My Schedule control on itinerary, sessions, agenda, or gallery | Open http://100.105.117.93:5198/e/pacific-open-data-summit-2026/program/itinerary logged out. Cards have no add control. `src/PublicProgramRenderer.tsx` has no personal-schedule symbols. | Rubric 22 is marked done on the board. The live renderer does not implement the criterion. |
| EMB-16 | P2 | Organizer agenda edits appear on public widgets without regenerating the embed | Public programme is immutable revision `pubrev_pacific-open-data-summit-2026_seed`. Taming at 09:00 Harbor Hall is private only until Publication Course Check apply | Place a session on `/agenda`, reload `/program/sessions`. Seed Ada/Grace/Katherine sessions remain. | Publication tests require apply before the public snapshot changes. This is by design and fails the rubric’s no-republish half. |
| EMB-01 / EMB-04 / EMB-12 | P2 | Speaker cards show job title and company | Published seed speakers render Title/company not provided or Professional details pending | Open `/program/sessions` and `/program/speakers` | Public-program tests pass with pending professional details. The rubric wants populated title and company. |
| CFP-05 / CFP-07 / CFP-13 | P2 | Submitter can create an account, save a draft, and see accepted and rejected rows on a dashboard | Account is magic-link only. No inspectable inbox. Dashboard GET is 401 while logged out. Confirmation page works. | Submit on `/cfp`. Open `/my-proposals` without a session. | Submitter-dashboard tests cover the signed-in path. They do not give this audit a live Priya session. |
| CFP-10 | P2 | Reviewer dashboard with no organizer navigation | Platform Track Reviewer queue is track-scoped and Settings writes fail, but the full organizer nav remains | Enter as track reviewer. Open Settings. Routing shows Administrator access required. Sidebar still lists Forms, Speakers, Agenda, Messages, Embeds, Settings. | Demo-persona tests check role, not nav absence. |
| CFP-11 | P2 | Reviewer records rating 4 plus the fixture comment | Lightweight Approve/Maybe/Deny exists. PATCH `status: approved` returned Unknown review status. Scorecard values were not stored. | As track reviewer, PATCH `/api/events/pacific-open-data-summit-2026/organizer/proposals/SUB-AD216929/review` | Review tests use `approved`/`maybe`/`denied` vocabulary on the organizer path. The live reviewer PATCH rejected `approved`. |
| CFP-08 | P3 | Confirmation mail arrives or a durable outbox row exists | Outbox row exists. Resend returned 401. Status failed. | Submit SUB-AD216929. Read GET `/api/v1/events/pacific-open-data-summit-2026/communications` | Outbox tests treat queued or failed as honest when secrets fail. |
| SPK-08 | P2 | Portal social links persist to the organizer record | Worker `PATCH /portal/profile` ignores `socialLinks`. Bio and headshot can persist. | Save LinkedIn from Maya’s portal, reload organizer speaker detail | Portal tests may cover biography and headshot only. |
| SPK-16 | P2 | Automatic due-date reminders go to incomplete speakers | Policy exists, default off and draft. Cron is `*/5`. No automatic send observed. | Speakers page: policy off · mode draft · suppress 72h | Reminder worker tests exist. Live policy was not enabled. |
| CNT-12 | P2 | Unapproved sessions stay off the public agenda | Gate exists in publication planning. This run did not publish the working placements, so public still shows seed revision 1 | Compare GET `/sessions` after auto-place with GET `/program` | Publication Course Check tests cover the gate. |
| CNT-04 / CNT-05 / CNT-14 | P2 | Version history, comments, and a ZIP of latest files | Surfaces exist. Library has 0 files. No ZIP downloaded. | Speakers → Files library | Focused worker tests cover versions, comments, and ZIP. Live Pacific library is empty. |
| AIA-04 | P2 | Overlapping sessions for the same speaker show a speaker double-book warning | Room overlap warning works. Agenda cannot attach Priya to a second session, so speaker double-book was not shown | Place two sessions in one room. There is no speaker-list editor on Agenda. | `detectScheduleConflicts` includes `speaker_double_book`. |
| ABS-05 | P2 | Reviewer queue contains exactly the assigned set | After enabling the plan, assignment UI exists. The demo reviewer still saw the whole Platform track in this run | Enter as track reviewer. Queue listed 18 Platform rows including Docs-adjacent titles were not isolated to two assignments | Evaluation-plan tests cover exact assignment when the plan is used. |
| Worker baseline | P3 | Worker suite passes | 2 timeouts under `--maxWorkers=4` | Re-run the two named tests alone to see if they pass in isolation | Known load-sensitive timeouts, not used as PASS evidence. |

## Remaining blockers

These items change the readiness verdict if left as they are:

1. EMB-10 personal schedule is absent.
2. EMB-16 public widgets do not follow live agenda edits without a new Publication Course Check.
3. Published speaker title and company fields are empty, which keeps EMB-01, EMB-04, and EMB-12 partial.
4. Submitter magic-link mail is not inspectable here, so CFP-05, CFP-07, and CFP-13 cannot be full passes.
5. Reviewer scorecard rating plus comment was not stored (CFP-11) and exact assignment scoping was not proven (ABS-05).
6. Portal social links are dropped on save (SPK-08).
7. Files library is empty on the live demo, so CNT version, comment, and ZIP criteria stay partial until a file is uploaded.

Smallest list that would move the verdict from not ready to conditionally ready:

1. Ship a personal schedule that persists and can add and remove sessions.
2. Confirm Tyler accepts the remaining named partials, especially public snapshot republish, empty speaker title/company, magic-link submitter mail, and outbox-not-inbox mail.

## Readiness verdict

Not ready.

A required capability is missing (EMB-10). There is no P0 privacy breach in the checks that ran. Several P2 gaps remain in submitter identity, review depth, files, and public-widget completeness.

## Preservation

No application implementation, ticket status, deployment, commit, merge, or prior evaluator-run artefact was changed. `pnpm run eval` was not run. `manual-results.json` was not written.

