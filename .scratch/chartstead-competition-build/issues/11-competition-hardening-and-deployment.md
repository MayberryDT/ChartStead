# 11 — Competition hardening and deployment

**What to build:** A submission-ready ChartStead deployment that demonstrates the complete required workflow with realistic data, reliable providers, accessible interaction, responsive performance, concise operational documentation, and only the highest-value remaining enhancements that fit after the spine is solid.

**Blocked by:** 03 — Guided CFP publishing and submitter follow-up; 04 — Shared track review queue; 06 — Onboarding and assisted chasing; 07 — Decision communication and calendar integration verification; 09 — Public program renderer and embed; 10 — Airtable mapping and authenticated HTTP foundation; Course Check 10 — Course Check killer demo and hardening.

**Status:** done

- [x] The seeded event supports one uninterrupted walkthrough from CFP setup through public program publication.
- [x] Real email, calendar, file, database, public output, and configured Airtable behavior are verified in the deployed environment.
- [x] The application remains demonstrable when Airtable is disabled or unavailable.
- [x] Desktop and mobile checks cover all public and speaker surfaces; organizer workflows remain usable at their supported widths.
- [x] Keyboard and automated accessibility checks cover required forms, queues, dialogs, task flows, schedule movement, and public pages.
- [x] Performance checks with realistic seeded volume show responsive submission-list, review, and schedule interactions.
- [x] Loading, empty, error, retry, and partial states preserve context and provide clear next actions.
- [x] Security checks cover role boundaries, signed-link expiry/revocation, upload authorization, public-data filtering, and demo bypass isolation.
- [x] Deployment, environment variables, migrations, seed/reset, provider setup, verification, and walkthrough commands are documented without secrets.
- [x] API documentation covers authenticated vertical-slice operations and representative examples.
- [x] If time remains after all checks pass, implement the smallest high-value remainder: review coverage sorts, draft handling, communication templates, resources, or table power.
- [x] The open-source repository, deployed URL, competition form material, and walkthrough are ready before the deadline.

## Comments

Blocked pending Competition 07 — Decision communication and calendar integration verification, Competition 10 — Airtable mapping and authenticated HTTP foundation, and Course Check 10 — Course Check killer demo and hardening. All other declared competition dependencies are done.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Claimed by agent; starting competition hardening and deployment in worktree `ticket-11-hardening-deploy`.

- 2026-08-12 — **in-review** for human QA.
  - Worktree: `.worktrees/ticket-11-hardening-deploy` · branch `ticket-11-hardening-deploy`
  - Docs: `docs/competition-walkthrough.md`, `docs/competition-submission.md`, expanded README + `docs/http-api-v1.md`
  - Evidence: competition spine e2e, axe a11y smoke, mobile surfaces, perf smoke, demo-isolation worker tests
  - Hardening fixes: agenda tab ARIA, inspector contrast, scrollable agenda grid focus, Airtable pull table name (`event_participations`), seed-count test drift
  - Verify: typecheck pass; UI 72; worker 175; e2e 14
  - Demo: http://100.105.117.93:5211/

- 2026-08-12 — **done**: fast-forward merged `ticket-11-hardening-deploy` → `main` as `10e038c`.
