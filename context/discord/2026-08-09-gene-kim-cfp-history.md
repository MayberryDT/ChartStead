# Discord notes: Gene Kim CFP history and review model

Source: user-provided copy/paste from the **Kill My SaaS** Discord on 2026-08-09.

Related videos:

- [Zoom clip](https://us02web.zoom.us/clips/share/RAKWTK5_RVW6uNpoP4LKvw)
- [YouTube mirror](https://youtu.be/oE49MdbPNYw)

## Evidence status

Gene Kim is an experienced conference organizer and competition participant, not the competition organizer or confirmed ChartStead customer. His account is strong adjacent-practitioner evidence about the problem category. His questions to Swyx were unanswered in the supplied chat, so the workflow he describes must not be treated as a settled competition requirement.

## Practitioner history and urgency

- Gene described almost 15 years of frustration with CFP-management tools and said his conference teams had been held hostage by five poor products.
- He has built workarounds since 2014 with Trello, Zapier, Google Sheets, and a custom submission-review application.
- He used Claude Code and Fable to inspect more than 20,000 Slack messages from 12-13 years of running Enterprise AI Summit and its predecessors.
- He wanted to launch a mini-CFP immediately for Enterprise AI Summit in Charlotte on October 7-8, 2026. The existing process was burdensome enough that he had considered falling back to Basecamp.
- He said one historical product was excellent but went out of business, another was tolerable only after he built a new front end by scraping it, and the category has unusual economics. Details were promised in his video rather than included in the pasted chat.
- He subsequently posted the four operating principles captured below.

## Review-process question

Gene framed CFP review as an ethos continuum:

- `1`: an academic, NeurIPS-like process where reviewers see only assigned work.
- `10`: a committee of friends where everyone sees everything.

He contrasted two models:

### Academic due-process model

The academic model uses bidding, conflict-checked assignments, several independent double-blind reviews, structured scores and text, author rebuttal, gated reviewer discussion, a program-committee meeting or meta-review, and a final decision. Gene argued that this is justified for hundreds of reviewers and fairness at scale, but that CFP SaaS can imitate it unnecessarily for small committees whose members read everything.

### Small shared-committee model

The contrasting workflow, based on the BusyConf experience he described, used a committee of nine with no per-proposal assignments:

- A speaker completed a one-page public proposal form without creating an account.
- The proposal supported Markdown, private notes to the planning committee, and repeatable co-speaker blocks with avatar upload.
- A new-proposal email put the complete proposal, speaker biography, headshot, prior-talk video, custom fields, and existing comments directly in every committee member's inbox.
- The email had one primary action: **View, Comment, and Rate**.
- Committee members rated privately and commented to the committee. A `[pc]` convention marked committee-only remarks.
- Speakers could comment on their own proposals.
- Every comment generated an email to the committee, and reply-by-email was supported.
- Accepted proposals flowed into an activity view and then a drag-and-drop, time-proportional schedule grid.
- The resulting program was published as desktop, mobile/offline-capable, and embeddable views that were described as hosted indefinitely.

This is a comparative workflow and preference signal, not confirmation that ChartStead needs every capability.

## Four operating principles from 24-plus conferences

Gene later posted four AI-assisted summaries derived from 12 years of conference operations, more than 24 conferences, and large Slack and email archives. He described them as replies to another contestant's request for major pain points and wishes.

### 1. Review is a conversation, not a process

Gene's nine-person committee consists of trusted peers who all read every proposal. He said commercial tools repeatedly imposed evaluation plans, assignment matrices, review rounds, and blind scoring intended for fairness at much larger scale, while BusyConf supported the committee's actual conversational workflow.

Three concrete lessons emerged:

- **A proposal permalink is the atomic unit of committee discourse.** A tool without per-submission links forced committee members to refer to Google Sheets row numbers. The committee moved its work to Trello within months.
- **Two sorts covered the core review work.** Sorting by fewest ratings produced the coverage queue and supported a target such as two reads per talk. Sorting by average score descending produced the agenda for the decision meeting.
- **Deciding and telling are separate acts.** Proposal statuses changed throughout the season, but decision letters were sent once in a deliberate batch. Automatically emailing on every status change risks sending premature or contradictory decisions.

### 2. Scheduling must match spreadsheet fluidity

Across roughly 24 events in 12 years, Gene's team never built its schedule inside a CFP tool. A Google Sheet named **Schedule Blocking** outlived four commercial tools over ten years, with slot arithmetic discussed live in Slack.

Gene's explanation was that the schedule remains incomplete and contradictory for much of its life: accepted talks may have no room, keynotes may have only a rough daypart, and known speaker conflicts may remain unresolved for days. A spreadsheet accepts these half-decisions without required fields or blocked saves.

His proposed credible alternative is:

- Treat `TBD` and partial states as valid saved values.
- Surface constraints without enforcing them.
- Show live slot summaries such as `3 unplaced · 1 conflict`.
- Represent a double-booked speaker as a named, actionable warning rather than a modal that blocks saving.

He remains uncertain whether even this is enough to replace the spreadsheet.

### 3. Preserve the event's institutional memory

Gene described severe data degradation across approximately 26 conferences in 15 years:

- Three live systems reported three different talk counts for one long-time speaker: 6, 9, and 12.
- The same 26 conferences appeared as 51 event rows in internal records.
- A Sessionize-to-Sched migration preserved only six speaker fields.
- Review scores, comments, decisions, and reasoning had never been exported from a CFP tool.
- Longitudinal speaker career history survived accidentally through annually re-entered job-title display fields.

His resulting guidance was:

- Give events, speakers, talks, and other durable entities stable identifiers.
- Freeze submission-time facts such as `title_at_time` and `org_at_time` instead of overwriting history with a speaker's current profile.
- Make exports a first-class capability, including `sessions.json`, `speakers.json`, review decisions, and `.ics` files whose UIDs remain stable.

### 4. Assist the post-acceptance chase

Gene described speaker logistics as the deepest operational pain. His source archive included 13,488 messages from the coordinator's Slack channel.

- Slides drew the most chasing, with the median request occurring eight days before the event.
- Co-presenter details were the worst per-field problem; about 90% of mentions required human follow-up, often for someone not yet represented in any system.
- Escalation moved deliberately between media: tool email, personal email, copying Gene, text, then phone call. The medium communicated urgency.
- The archive contained no evidence of a tool successfully handling reminders on the team's behalf. Repeated spam failures led the coordinator back to personal email.

Gene recommended **assisted chasing**, where the tool prepares a draft that a human reviews and sends from their own address, rather than autonomous reminders.

He also identified employer approval as the leading cause of speaker withdrawal. Approval discussion peaked about a month before the event; withdrawals clustered around 29 days before it, with some as late as five days before or after public announcement. He recommended modeling `accepted, employer approval pending` as a real state.

## Questions Gene asked the organizer

The supplied chat contains no answers to these questions:

1. Where does the target review process sit on the blind-assignment to shared-committee continuum?
2. How many submissions are typical?
3. How many review committees are involved, and how many reviewers are on each committee?
4. Do submitters choose tracks, with each track assigned to a separate committee?

## Product implications

These implications are useful without expanding the locked competition scope:

- Do not assume an academic review model. Keep reviewer visibility and assignment policy explicit and avoid burying small committees under bidding, blind review, or per-proposal assignment machinery.
- The existing ChartStead default of routing by track should allow a reviewer to see the relevant track queue, not only individually assigned submissions, unless the organizer says otherwise.
- Give every submission a stable permalink. If ratings are implemented, provide coverage count and average-score sorts before adding elaborate review plans.
- Keep proposal state changes separate from external communication. Decision emails should require a deliberate send action and support batch release.
- Optimize time-to-first-CFP. Templates, a guided setup, a public no-account submission path, and signed edit links address the immediate "launch today" job better than a broad configuration system.
- Treat notification email as part of the working interface. Include enough proposal context and a clear deep link for a reviewer to act without first navigating an admin dashboard.
- Preserve a clean path for co-speakers, private organizer notes, and supporting video links in configurable forms.
- Let agenda drafts preserve incomplete placement and known conflicts. Conflict detection should inform and help repair rather than prevent saving.
- Use stable entity IDs, preserve submission-time speaker facts, and keep calendar UIDs stable across updates. These are inexpensive schema decisions now and expensive migrations later.
- Treat onboarding reminders as operator-controlled communication. Assisted draft generation is more credible for this team than unattended escalation.
- Reply-by-email, speaker-comment threads, full export UI, offline public schedules, indefinite hosting, and employer-approval workflow are potentially valuable later, but are not justified additions to the competition spine without organizer confirmation.
- The failure and lock-in history strengthens the case for open source, exportability, understandable data ownership, and graceful operation when integrations are unavailable.

## Follow-up evidence to capture

- Swyx's answers to the four review-scale questions.
- Any concrete pain points, category economics, or product history from the linked video that are not already represented here.
