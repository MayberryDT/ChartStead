# 10 — Airtable synchronization and HTTP API

**What to build:** An optional Airtable bridge and authenticated HTTP API that expose the completed program workflow without placing Airtable on the interactive path or making the application unavailable when synchronization fails.

**Blocked by:** 09 — Published program and embed.

**Status:** ready-for-agent

- [ ] The application provides a documented ChartStead Airtable base template and explicit field mapping.
- [ ] App-created mapped records enter a durable sync outbox and reach Airtable idempotently.
- [ ] Airtable-side mapped changes are pulled on load or interval with visible last-sync state.
- [ ] Airtable wins on pull for explicitly synchronized fields without overwriting unrelated local operational state.
- [ ] Unconfigured, rate-limited, or unavailable Airtable leaves the core application usable.
- [ ] Administrators can see healthy, pending, delayed, and failed synchronization state with recovery guidance.
- [ ] The authenticated HTTP API covers events, forms, submissions, review decisions, speakers, sessions, tasks, communications, agenda placement, and public-program records needed by the vertical slice.
- [ ] API authorization follows event roles and never exposes committee or speaker-private data incorrectly.
- [ ] API records use stable ChartStead identifiers rather than mutable display fields.
- [ ] Contract tests cover mapping, push retry, pull precedence, degraded operation, authorization, and representative API workflows.

## Comments
