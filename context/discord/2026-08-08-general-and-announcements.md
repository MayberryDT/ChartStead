# Discord notes: general chat and announcements

Source: user-provided copy/paste from the **Kill My SaaS** Discord on 2026-08-08.

This is a partial channel view. Several thread starters are visible without their questions or replies, so unmatched answers are not treated as settled requirements.

## Organizer clarifications

- Use normal product judgment for unspecified workflows. Specific flows can be requested from the organizer, who may record follow-up video.
- The end users are nontechnical event-production professionals. The evaluation includes putting the product in front of them and having them actually use it, so clarity and polish matter.
- Airtable does not need sophisticated two-way synchronization. The organizer says read-only handling of Airtable-side changes is fine: periodic or load-time reads can pick them up. App-created records still need to land in Airtable so the team's existing new-row automations can run.
- A submission form can offer one or more track choices, and the system can support multiple forms.
- Submitters can edit their submissions. A configurable edit-lock time is common but not something this customer really uses.
- Calendar invitations do not need a video link. Include room details when known; the initial invite often has no room and is updated after rooms are assigned.
- Basic form conditional logic is sufficient for now.
- Submissions select one or more tracks, and reviewers can be assigned to review one or more tracks.
- The minimum review workflow is `unreviewed -> approve / maybe / deny`. In-app email for change requests or decision feedback is a bonus.
- Accepting an abstract should automatically create the related speaker, session, and onboarding tasks.
- Example onboarding tasks are: hotel-stay form, flight-reimbursement form, finalize talk description, finalize biography/photos, announce participation, and invite colleagues using a speaker discount.
- Email and calendar-invite delivery must actually work at an MVP level; stubs are not sufficient. Cloudflare email or Resend were suggested as practical options.
- Accelevents integration may be skipped; it is not required for the competition MVP.
- Day/room scheduling with drag-and-drop and conflict detection is sufficient.
- A small useful agentic feature is sufficient; the admin UI is the priority.
- One organizer response says an unspecified item is “nice to have,” but the original question is missing from this paste, so it cannot be mapped safely.
- The organizer expects many registrations but fewer serious submissions.

## Official announcements

- Competition brief: [Google Doc](https://docs.google.com/document/d/1rBHJtiNKHv4i43tdf2Rm0sDEYuIcajhmAPoBKR_Az-A/edit?tab=t.0)
- Walkthrough: [YouTube](https://youtu.be/vUuK4Knl7oc)
- Product being replaced: [Sessionboard](https://www.sessionboard.com/)
- The organizer intends to mirror in-person questions into Discord for fairness.

## Competitive observations

- Reported project names already in use include **opensession**, **Program Cue**, and **SuperStage**.
- The project was subsequently named **ChartStead**, avoiding the overlap with the announced `opensession` name.
- Participants mentioned Cloudflare, Hono, Inertia, Airtable, and Cloudflare MCP, but those messages are implementation chatter rather than customer requirements.

Private source transcriptions are stored under `.context-private/discord/`; requirement-bearing organizer messages are preserved verbatim.
