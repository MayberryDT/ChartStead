# 10 — Airtable mapping and authenticated HTTP foundation

**What to build:** The optional Airtable mapping/pull foundation and authenticated HTTP infrastructure that Course Check integration effects and complete agent control can use without placing Airtable on the interactive path.

**Blocked by:** 09 — Public program renderer and embed.

**Status:** ready-for-agent

- [ ] The application provides a documented ChartStead Airtable base template and explicit field mapping.
- [ ] Airtable-side mapped changes are pulled on load or interval with visible last-sync state.
- [ ] Airtable wins on pull for explicitly synchronized fields without overwriting unrelated local operational state.
- [ ] Unconfigured, rate-limited, or unavailable Airtable leaves the core application usable.
- [ ] Administrators can see healthy, pending, delayed, and failed synchronization state with recovery guidance.
- [ ] The authenticated HTTP API covers events, forms, submissions, review decisions, speakers, sessions, tasks, communications, agenda placement, and public-program records needed by the vertical slice.
- [ ] API authorization follows event roles and never exposes committee or speaker-private data incorrectly.
- [ ] API records use stable ChartStead identifiers rather than mutable display fields.
- [ ] Contract tests cover mapping, pull precedence, degraded operation, authentication, authorization, stable identifiers, and representative ordinary API workflows.

## Comments

Consequential Airtable writes and inbound consequence classification are owned by Course Check 07. Complete plan, approval, execution, recovery, compensation, and AI-agent parity are owned by Course Check 08.
