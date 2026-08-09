# ChartStead: Consolidated Sessionboard Replacement Context

Last updated: August 9, 2026

This document consolidates the competition brief, walkthrough video, Sessionboard reference material, and organizer clarifications shared in Discord. It is a living record of what the customer wants and what the competition requires. It is intentionally not an implementation plan.

Where sources differ, newer direct organizer clarifications take precedence over the original brief and walkthrough.

## Source material

- [Competition brief](https://docs.google.com/document/d/1rBHJtiNKHv4i43tdf2Rm0sDEYuIcajhmAPoBKR_Az-A/edit?tab=t.0)
- [Walkthrough and requirements video](https://www.youtube.com/watch?v=vUuK4Knl7oc)
- [Sessionboard](https://www.sessionboard.com/)
- [Sessionboard API introduction](https://sessionboard.mintlify.app/introduction)
- Kill My SaaS Discord announcements, questions, and organizer replies
- [Gene Kim's CFP history and review-model discussion](context/discord/2026-08-09-gene-kim-cfp-history.md)

Project-local source notes are under `context/`. Large exports, screenshots, transcripts, and raw Discord material are kept separately under the gitignored `.context-private/` directory.

## Executive summary

The customer currently pays more than $40,000 per year for Sessionboard. They do not need most of the platform. They primarily need the event-program workflow that takes an event from an open call for speakers to an accepted, scheduled, and properly onboarded speaker lineup.

The product should let an event team:

1. Configure an event.
2. Publish one or more speaker-submission forms.
3. Collect talks, speaker details, and supporting material.
4. Route submissions and reviewers by track.
5. Review and decide on submissions.
6. Convert accepted submissions into speakers, sessions, and onboarding tasks.
7. Communicate with speakers through working email and calendar invitations.
8. Track missing information and incomplete tasks.
9. Build an agenda with rooms, tracks, and conflict detection.
10. Publish or embed the resulting schedule and speaker information.

The goal is not a pixel-perfect Sessionboard clone. The goal is a fast, credible, open-source product that performs the job the customer actually needs.

## Why this product exists

- Sessionboard costs this customer more than $40,000 annually.
- The organizer describes the broader category as ranging from hundreds to hundreds of thousands of dollars per year or event.
- The customer uses mainly the Program side of Sessionboard, not its broader CRM, marketing, content-repurposing, or CMS offering.
- Sessionboard felt noticeably slow during the walkthrough. Responsiveness is an explicit opportunity to outperform it.
- The customer wants an open-source system they can keep, understand, and continue improving instead of remaining dependent on a closed enterprise SaaS vendor.

### Adjacent practitioner evidence

Gene Kim, an experienced conference organizer and competition participant, described almost 15 years of dependence on five poor CFP tools, plus workarounds built with Trello, Zapier, Google Sheets, scraping, and a custom review application. He needed to launch a small CFP quickly and had considered using Basecamp because the existing process was too heavy. This independently reinforces the importance of fast setup, open ownership, exportability, and a complete small-team workflow.

Gene also identified an important design variable: CFP review can range from an academic, blind-assignment process to a small trusted committee where everyone sees everything. He asked the organizer which model applies, how many submissions and committees are typical, and whether tracks map to separate committees. No organizer answer was included, so this is a product question rather than a new requirement.

His preferred historical workflow also emphasized no-account public submission, stable proposal permalinks, full-context notification emails, private committee notes, co-speakers, comment-by-email, and a direct path from acceptance to a public schedule. His later operating principles add four durable lessons: small-committee review behaves like a conversation; scheduling must tolerate incomplete truth; stable IDs and historical snapshots preserve institutional memory; and post-acceptance chasing needs human-controlled assistance. These are useful comparative signals. They do not override the competition scope or establish that scoring, reply-by-email, discussion threads, exports, offline schedules, employer-approval workflow, or indefinite hosting are required.

## Users

### Event administrator

The primary user is a nontechnical event-production professional. Administrators configure events and forms, monitor submissions, coordinate reviewers, accept speakers, chase missing assets, communicate decisions, and build the agenda.

The admin experience is the product priority. The organizer expects to put the product directly in front of real event professionals and have them use it during evaluation.

### Speaker or submitter

A speaker submits a proposed talk, supplies personal and session information, sees whether the proposal was accepted, updates their biography and headshot, completes assigned forms or file requests, and receives emails and calendar invitations.

A submission can involve more than one speaker, but requiring a minimum of two speakers was specifically identified as undesirable in the walkthrough.

### Reviewer

A reviewer evaluates submissions for one or more assigned tracks. The minimum decision workflow is deliberately small: `unreviewed -> approve / maybe / deny`.

### Public attendee

An attendee may view a mobile-friendly speaker gallery or public agenda embedded on the event website. Attendee registration and ticketing are outside the main scope.

## Core domain concepts

| Concept | Meaning in this product |
| --- | --- |
| Event | The conference or program being managed, including dates, basic details, tracks, and rooms. |
| Submission form | A configurable public call-for-speakers form. An event can have multiple forms. |
| Submission or abstract | A proposed talk that has not necessarily been accepted. |
| Speaker or participant | A person attached to a submission or confirmed session. |
| Track | A category selected on a submission and used to assign relevant reviewers and organize the agenda. |
| Reviewer | A committee member responsible for submissions in one or more tracks. |
| Review or decision | An evaluation of a submission. The minimum statuses are unreviewed, approve, maybe, and deny. |
| Session | A confirmed agenda item. It may come from an accepted submission or be entered directly for a guaranteed speaker, such as a sponsor. |
| Task | A speaker-onboarding action such as completing a form, uploading a file, or confirming information. |
| Room | A physical agenda location used for scheduling and conflict detection. |
| Agenda | The scheduled collection of accepted sessions across days, rooms, and tracks. |

## End-to-end workflow

### 1. Configure the event

An administrator creates an event and enters its basic identity, dates, settings, tracks, and rooms. The Sessionboard screenshots include a broader configuration area, but only the data necessary to support submission, onboarding, and scheduling workflows is essential.

### 2. Build the call-for-speakers form

The administrator creates one or more public submission forms. A form can include:

- A welcome screen and explanatory copy.
- Talk title, description, and other abstract information.
- One or more track choices.
- Speaker and co-speaker information.
- Biography, headshot, and supporting-file fields.
- Required fields and ordinary validation.
- Basic conditional logic.
- Submission opening and closing behavior.
- A confirmation page and confirmation email.

Basic conditional logic is sufficient for the MVP. A sophisticated arbitrary rules engine is not required.

The source material also shows or mentions submission limits, draft submissions, reminder emails, cross-field character limits, administrator access, and multilingual forms. English-only is sufficient. Payments and fees are not needed.

### 3. Submit and edit a proposal

The public CFP page allows a speaker to submit a talk without access to the admin application. The form must enforce required fields and produce a working post-submission confirmation.

Submitters can edit their submissions afterward. Some products allow administrators to lock editing at a specified time, but this customer does not actively use that feature, so it is optional.

### 4. Route and review submissions

Submissions select one or more tracks. Reviewers also review one or more tracks, which provides the required category-routing behavior without a complex routing engine.

The minimum workflow is:

1. A submission begins as unreviewed.
2. An assigned reviewer examines it.
3. The reviewer or administrator marks it approve, maybe, or deny.
4. The event team communicates the decision.

The original brief mentions scoring, multiple review rounds, and optional AI assistance. Those remain useful enhancements, but the later organizer clarification establishes that the simple status workflow is enough for the MVP.

A bonus feature would let administrators email the speaker from inside the review flow to request changes or attach feedback to the approval or denial message.

Adjacent practitioner evidence adds two implementation cautions. Every submission needs a stable permalink so committee discussion can point to the proposal itself. Proposal status and speaker notification must also remain separate: administrators may change an internal decision several times before deliberately sending final letters, potentially as a batch.

### 5. Accept a submission

Accepting an abstract should automatically create or confirm:

- The speaker record or records.
- The session record.
- The appropriate onboarding tasks.

This conversion should not require administrators to re-enter the accepted proposal manually.

Direct session entry should also be possible for people already guaranteed a place in the program, such as sponsor speakers.

### 6. Onboard the speaker

The speaker portal shows the speaker's submissions or sessions, acceptance state, profile, and incomplete tasks. Speakers should be able to maintain their own biography and other profile information.

Organizer-provided task examples include:

- Complete a hotel-stay requirements form.
- Complete a flight-reimbursement form.
- Finalize the talk description.
- Finalize the speaker biography and photos.
- Announce participation.
- Invite colleagues using a speaker discount.
- Upload presentation slides or other supporting files.

Sessionboard separates tasks, forms, file requests, resources, and files. The replacement does not necessarily need identical navigation, but it needs to cover the underlying jobs.

Administrators need a clear view of which accepted speakers still have missing biographies, headshots, forms, files, or other incomplete onboarding work.

Long-term practitioner evidence suggests that automated reminders are often abandoned after spam or trust failures. The minimum requirement remains working reminders, but the safer product posture is operator-controlled assisted chasing: prepare the context and message, show escalation history, and let a human decide when and how to send. Employer approval is also a meaningful post-acceptance risk, but an explicit `accepted, employer approval pending` state remains an unconfirmed enhancement.

### 7. Communicate with speakers

Email and calendar delivery must actually work at an MVP level. Stubs or interface-only demonstrations are not sufficient.

The expected communication capabilities include:

- Submission confirmation.
- Acceptance and denial messages.
- Requests for changes or missing information.
- Task and deadline reminders.
- Calendar invitations compatible with Gmail, Outlook, and iCal clients.

Changing an internal proposal status must not implicitly send an acceptance or denial message. Decision communication should be an explicit action, with batch release a useful extension.

Cloudflare email tooling and Resend were mentioned as practical implementation options, not mandatory providers.

Calendar invitations do not need video-meeting links. Room details should be included when known. The normal workflow may send an initial invitation without a room and update it after room assignments are finalized.

### 8. Build the agenda

Accepted sessions become schedulable agenda items. For the MVP, the organizer confirmed that the following is enough:

- Day-based scheduling.
- Room assignment.
- Drag-and-drop placement.
- Conflict detection.

The original brief also requests list, day, week, track, and room views. Those additional views are valuable, but the later clarification narrows the minimum requirement to day/room scheduling with drag-and-drop and conflict detection.

Likely conflicts include:

- A speaker assigned to two simultaneous sessions.
- A room assigned to two simultaneous sessions.
- Potential track or resource conflicts where applicable.

The schedule should preserve partial decisions such as an accepted session with no room or exact time. `TBD`, unplaced sessions, and temporarily unresolved conflicts are valid working states. Conflict detection should surface named, actionable warnings and live counts without blocking a save.

### 9. Publish the program

The source material asks for mobile-friendly public speaker and schedule experiences that can be embedded on an external website.

There is an important scope distinction:

- A usable public CFP page and public schedule/speaker output support the core workflow.
- Recreating Sessionboard's broader CMS and generalized embed-management system is explicitly optional.

### 10. Synchronize with Airtable

Airtable is part of the customer's existing operating environment and earns competition bonus consideration.

The organizer does not require sophisticated two-way synchronization. The clarified expectation is:

- App-created records can land in Airtable so existing new-row automations run.
- The application can periodically or on page load read Airtable-side changes.
- A complex real-time synchronization system is unnecessary for the MVP.

The exact table schema, authentication model, and source-of-truth boundaries have not yet been supplied.

## Requirement priority

### Required for a credible MVP

- Fast, usable administrator interface designed for nontechnical event professionals.
- Basic event configuration.
- Multiple configurable submission forms.
- Basic conditional form logic.
- One or more track selections per submission.
- Public speaker-submission flow.
- Editable submissions.
- Working confirmation page.
- Working submitter confirmation email.
- Abstract/submission list for administrators.
- Track-based reviewer responsibility.
- `unreviewed -> approve / maybe / deny` review flow.
- Acceptance automatically creates the speaker, session, and onboarding tasks.
- Speaker portal with editable profile information.
- Biography and headshot collection.
- Forms, file requests, or equivalent onboarding tasks.
- Administrator visibility into outstanding speaker tasks.
- Working email delivery.
- Working calendar invitations.
- Day and room agenda scheduling.
- Drag-and-drop scheduling.
- Speaker and room conflict detection.

### Important or strongly desired

- Submission close dates and reminders.
- Draft or incomplete submission handling.
- Templated communications.
- Supporting-document and slide uploads.
- Public/mobile speaker gallery.
- Public/mobile schedule.
- Website embedding for speakers and schedules.
- Airtable-backed persistence or practical Airtable synchronization.
- Clear filters, sorting, columns, and statuses in the submission view.
- Portal resource or wiki pages for speaker guidance.
- HTML embeds for existing reference material.

### Useful enhancements

- Scored reviews and rating fields.
- Multiple evaluation rounds.
- In-app requests for submission changes.
- Feedback attached to accept/deny decisions.
- Configurable edit-lock deadlines.
- Administrator notification customization.
- Additional agenda views by week, track, or room.
- Dashboard widgets and reporting.
- Saved table views and configurable columns.
- Generalized CMS/embed tooling.
- API coverage beyond what the main UI needs.
- A small useful agentic feature.

### Explicitly optional or out of scope

- Payment collection.
- Accelevents integration. The original brief requested it, but the organizer later said it can be skipped and is not required.
- Full CRM functionality.
- Marketing campaign functionality.
- Content transcription and repurposing.
- Full Sessionboard CMS recreation.
- AI-assisted evaluation.
- A large agentic system. The admin UI is the priority.
- Multilingual forms; English is enough.
- Video-meeting links in calendar invitations.
- Exact Sessionboard visual fidelity.

## Screen and interaction references

The competition brief contains 37 exported pages and 40 original screenshots covering the following areas.

### Event configuration

- Basic event setup and event settings.
- Program configuration entry points.

### Submission-form builder

- Submission type and participants.
- Welcome-screen content.
- Abstract-information fields.
- Participant-information fields.
- Payments and fees, annotated as not needed.
- Form settings and close date, annotated as important.
- Post-submission confirmation page, annotated as something that must work.
- Submitter confirmation email, annotated as a must-have.
- Administrator notifications, annotated as nice to have.

### Public CFP and speaker portal

- Public call-for-speakers page.
- Submitted session and attached speakers.
- Acceptance or submission state.
- Speaker biography and profile editing.
- Speaker tasks and forms.

### Abstract management

- Status tabs such as all, accepted, pending, queue, declined, withdrawn, and drafts.
- Search, sorting, filtering, saved views, and configurable columns.
- Session fields such as track, tags, speakers, files, location, description, and review ratings.

These screenshots demonstrate the expected density and breadth of an admin table, but not every Sessionboard column is required.

### Agenda

- List, day, week, month, room, and conflict views.
- Session search, filters, drafts, columns, and add-session controls.
- Session placement and room assignment.

### Portals and onboarding

- Task creation.
- Form creation for contacts, groups, or submissions.
- File-request creation and instructions.
- Resource pages and files.

### Embeds and dashboards

- Embed creation and generated embed code, marked optional.
- Submission, participant, evaluation, agenda, and program-health dashboards, marked optional or best effort.

## Product principles inferred from the sources

### Complete the job instead of cloning the interface

The organizer repeatedly says that exact Sessionboard fidelity is not the goal. A different interface is acceptable if it supports the real workflow cleanly.

### Optimize for nontechnical operators

The customer is an event-production team, not a software team. Common actions should be obvious, terminology should match event work, and the application should not require technical knowledge of Airtable, APIs, or automation internals.

### Prefer a working vertical workflow over broad feature coverage

The strongest demonstration is an end-to-end flow that genuinely works: create a form, submit a talk, review it, accept it, onboard the speaker, send communication, and schedule the session.

### Minimize time to first CFP

An experienced organizer reported nearly abandoning a mini-CFP in favor of Basecamp because existing tools made launch feel too heavy. The guided setup, templates, no-account public submission, and signed-link editing path should make a credible CFP launchable in one sitting. This is adjacent-practitioner evidence, not a separately mandated feature set.

### Fit review ceremony to committee scale

Do not import academic bidding, blind-review, rebuttal, and per-proposal assignment machinery into a small trusted committee without evidence that it is needed. Until the organizer clarifies reviewer visibility and committee structure, the least-assumptive interpretation of track routing is that reviewers can see the queue for their assigned tracks while administrators retain event-wide visibility.

### Preserve partial truth

Conference schedules and speaker commitments remain incomplete and contradictory for long periods. Save half-decisions instead of forcing false completeness. Constraints should remain visible and actionable, but should not prevent an operator from recording the current truth.

### Separate state from communication

An internal decision is not the same event as telling a speaker. Statuses can change during deliberation; external messages must be explicit, auditable sends. This protects the team from premature acceptance or denial messages and supports deliberate batch announcements.

### Preserve institutional memory

Stable event, submission, session, speaker, and calendar identifiers are foundational data integrity, not polish. Submission-time facts such as employer and title should remain available even when a speaker later updates their profile. Export UI is not required for the competition spine, but the schema and API should not make reliable export or longitudinal history impossible.

### Assist rather than impersonate

Post-acceptance coordination depends on human judgment about timing, tone, relationship, and escalation medium. Automation should assemble context, identify missing work, and draft the next message while keeping the organizer in control of consequential sends.

### Make it fast

Sessionboard's slowness was called out repeatedly in the walkthrough. Perceived performance and responsive interaction are meaningful differentiators and receive explicit competition bonus consideration.

### Use product judgment

Not every state and edge case is specified. The organizer expects entrants to apply common sense and product judgment. Subjective judgment about what the event team would actually use is also the competition tiebreaker.

## Competition rules and incentives

- Target submission deadline: Wednesday, August 12 at 10:00 PM Pacific.
- A submission requires the organizer's submission form, an open-source repository, a deployed site that can be tested, and a walkthrough.
- Valid serious attempts may request reimbursement for up to $500 of token cost with proof. Usage of Codex Pro or Claude Max subscriptions was explicitly said to count.
- The winning submission receives $10,000.
- The winner will participate in a call or interview for a Latent Space write-up.
- The AI Engineer team, rather than only the organizer, will independently evaluate submissions.
- The tiebreaker favors product decisions that make the result something the customer would actually use or buy.
- Any agent, language, framework, or tool is allowed.
- Mild bonus points were mentioned for Cloudflare infrastructure.
- Bonus points were mentioned for Airtable persistence.
- Very small bonus points were mentioned for hosting on Forge instead of GitHub.
- Speed and performance earn bonus consideration.
- An API earns bonus consideration.
- The organizer planned additional clarification videos and intended to freeze new requirements after the weekend. Later videos or Discord announcements should therefore be checked before finalizing scope.

## Evaluation expectations

The product should be demonstrable to real event professionals without extensive explanation. A strong evaluation path would show that an administrator can:

1. Create or open an event.
2. Configure and publish a CFP form.
3. Submit a realistic talk through the public form.
4. Find that submission in the admin application.
5. Route or expose it to the correct track reviewer.
6. Review and accept it.
7. See the resulting speaker, session, and onboarding tasks.
8. Complete or inspect speaker-portal work.
9. Send a real email and calendar invitation.
10. Place the session on an agenda.
11. Trigger and resolve a scheduling conflict.
12. View the resulting public program.

This is an acceptance-oriented reading of the collected evidence, not a committed build plan.

## Agentic functionality

The Sessionboard marketing site emphasizes agent-native and AI features, but the competition organizer clarified that a small useful agent is enough and the administrator UI is the priority.

No exact agent behavior has been required. A narrow assistant that reduces real administrative work is more aligned with the brief than a broad chatbot added only to claim AI functionality.

## Naming context

The product name is **ChartStead**, always written with an uppercase `C` and `S` and no space. Its canonical descriptor is **“Conference programming and speaker management.”** The name and design direction were finalized after the initial context-gathering pass.

Other contestants announced the names `opensession`, `Program Cue`, and `SuperStage`; ChartStead avoids confusion with those projects while giving the product a distinct navigation-and-stewardship metaphor.

## Known ambiguities and open questions

- What exact event fields are required beyond name, dates, tracks, and rooms?
- Which form-field types and conditional operators are necessary for the demonstration?
- How should reviewers authenticate, and can administrators override their decisions?
- Should reviewers see every submission in their assigned tracks, only individually assigned submissions, or all event submissions?
- What are the typical submission volume, committee count, committee size, and relationship between tracks and committees?
- Are numerical scores needed in addition to approve/maybe/deny for judging?
- If scores are used, is a coverage target such as two ratings per submission needed?
- Do reviewers need private ratings, committee-only notes, speaker-visible discussion, or reply-by-email?
- Should acceptance and denial letters be released individually or in a deliberate batch?
- What precise events trigger reminder emails?
- Should reminders be automatic, operator-approved drafts, or both?
- Which email identity, sending domain, and reply-to behavior should be used?
- How should calendar invitation updates and cancellations behave?
- Which conflict types beyond speaker and room overlap matter?
- What exact Airtable tables, fields, and automations exist?
- Is Airtable mandatory for the winning deployment or only bonus-worthy?
- How much of the public speaker gallery and agenda embedding must be implemented?
- Which incomplete agenda states must be supported, and are conflicts always non-blocking?
- Which exports and historical speaker fields matter to the target customer?
- Does the target workflow need an employer-approval-pending state after acceptance?
- What is the smallest useful agentic feature the customer would value?
- What requirement was described as “nice to have” in an earlier Discord reply whose original question was not included in the copied thread?
- Will the promised follow-up video introduce or freeze any additional requirements?
- What final submission form and judging rubric will be provided?

## Current evidence boundaries

- The Google Doc was successfully exported as PDF and DOCX. All 37 pages and 40 original images are available locally and were visually reviewed.
- The full available YouTube captions, metadata, description, thumbnail, and timestamped transcript were captured locally.
- Discord evidence is partial. It currently consists of user-provided channel copy/paste and screenshots, including direct organizer answers. Unexpanded Discord threads may contain additional clarification.
- Gene Kim's August 9 discussion and operating principles are adjacent-practitioner evidence. His questions to Swyx were unanswered in the supplied chat, and his described workflow is not treated as an organizer requirement.
- The public Sessionboard website describes a much larger product than the competition MVP. Its full feature set should not be mistaken for required scope.

## Short version

Build a fast, polished admin-first event-program tool that lets a nontechnical team collect speaker submissions, review them by track, accept speakers, generate onboarding work, send real communications, and schedule sessions without conflicts. Demonstrate the complete workflow. Skip payments and Accelevents, keep AI small, and do not waste the weekend cloning unrelated Sessionboard features.
