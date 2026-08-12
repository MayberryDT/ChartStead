# 13 — Agent connection UX beyond raw API keys

**What to build:** A first-class, organizer-friendly way to connect AI agents to ChartStead Course Check that does not depend on copying long-lived bearer tokens out of Settings. Keep the existing v1 HTTP + scoped-key foundation as the compatibility layer; add a connection experience that matches how staff actually use Claude, ChatGPT, Cursor, and similar clients.

**Blocked by:** 08 — Complete agent API control.

**Status:** in-review

- [x] Research how comparable products connect agents (MCP OAuth / remote MCP, Claude connectors, ChatGPT custom GPT actions, Linear/GitHub/Notion bot installs, device-code or one-click “Connect Claude”, short-lived tokens + refresh) and record a short recommendation with tradeoffs.
- [x] Choose a primary connection path for ChartStead organizers (likely remote MCP and/or OAuth client credentials for agent hosts) without requiring staff to paste `cs_live_…` secrets into chat.
- [x] Preserve Course Check 08 semantics: distinct agent principals, per-event stage scopes, propose-only by default, delegated vs autonomous modes, live revocation, initiating-human provenance, frozen plans, no privileged bypass.
- [x] Actor labels always read as agent-on-behalf-of-human in organizer UI (never bare agent name alone when provenance exists).
- [x] Connection path covers **full organizer API parity** (ordinary writes + Course Check), not Course Check alone — same capability surface as an authorized admin when scopes allow.
- [x] Settings (or a dedicated Agents surface) guides connect → grant stages/mode → verify → revoke in plain language; no bare “API key” as the only happy path.
- [x] Optional: one-click “test connection” that runs a read-only Course Check list and shows success/failure in the UI.
- [x] Document how to connect at least two real agent hosts (e.g. Claude Code / Claude desktop MCP, Cursor, or ChatGPT) with screenshots-level steps.
- [x] Long-lived bearer keys remain available as an advanced/fallback control for CI and custom automation, clearly labeled secondary.
- [x] Competition-build boundary respected: MCP was out of scope for the competition spine; this ticket is the deliberate post-08 productization of agent connection UX.
- [x] Contract tests cover connect, scope grant, revoke, and at least one agent-host-shaped session (MCP tool or OAuth token exchange) producing the same Course Check outcomes as the v1 HTTP path.

## Comments

Filed after Course Check 08 human QA: raw API keys work and are correct as a kernel/compatibility layer, but they are a poor primary UX for organizers who want to “give an agent access.” Spec already excluded MCP from the competition build; this ticket owns the friendlier connection model once 08 is done.

- 2026-08-12 — Tyler: create ticket for MCP/other connection UX; keep 08 API keys as interim.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-12 — claimed by OpenCode; implementing the personal-assistant connection release from `.research/chartstead-agent-connection-ux-research.md` in worktree `.worktrees/course-check-13-agent-connections`.
- 2026-08-12 — ready for human QA. Remote Streamable HTTP MCP + OAuth/DCR/PKCE/refresh, event access profiles, MCP activity verification, lifecycle inventory/revoke, Claude + ChatGPT custom-connector guides, and Developer access fallback implemented. Demo: http://100.105.117.93:5193/ (Settings). Worker 164/165 under full-suite load due existing guided-CFP upload test 5s timeout; that exact test passes alone. UI 73/73, E2E 5/5, build/typecheck pass.
