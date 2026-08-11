# 10 — Airtable mapping and authenticated HTTP foundation

**What to build:** The optional Airtable mapping/pull foundation and authenticated HTTP infrastructure that Course Check integration effects and complete agent control can use without placing Airtable on the interactive path.

**Blocked by:** 09 — Public program renderer and embed.

**Status:** done

- [x] The application provides a documented ChartStead Airtable base template and explicit field mapping.
- [x] Airtable-side mapped changes are pulled on load or interval with visible last-sync state.
- [x] Airtable wins on pull for explicitly synchronized fields without overwriting unrelated local operational state.
- [x] Unconfigured, rate-limited, or unavailable Airtable leaves the core application usable.
- [x] Administrators can see healthy, pending, delayed, and failed synchronization state with recovery guidance.
- [x] The authenticated HTTP API covers events, forms, submissions, review decisions, speakers, sessions, tasks, communications, agenda placement, and public-program records needed by the vertical slice.
- [x] API authorization follows event roles and never exposes committee or speaker-private data incorrectly.
- [x] API records use stable ChartStead identifiers rather than mutable display fields.
- [x] Contract tests cover mapping, pull precedence, degraded operation, authentication, authorization, stable identifiers, and representative ordinary API workflows.

## Comments

Consequential Airtable writes and inbound consequence classification are owned by Course Check 07. Complete plan, approval, execution, recovery, compensation, and AI-agent parity are owned by Course Check 08.

### Implementation (2026-08-11)

- Branch: `ticket-10-airtable-http-api` merged to `main`
- Settings UI: connect form + **Connect demo Airtable sandbox** (no real Airtable account required)
- Docs: `docs/airtable-base-template.md`, `docs/http-api-v1.md`
- Key paths: `shared/airtable*.ts`, `worker/airtable/`, `worker/api/v1.ts`, `worker/api-keys.ts`, `worker/authz.ts`, `src/SettingsWorkspace.tsx`
- Verified: UI/worker/e2e + human QA of Settings layout and demo sandbox pull
