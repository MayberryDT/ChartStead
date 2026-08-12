# 13 — Agent connection UX beyond raw API keys

**What to build:** A first-class, organizer-friendly way to connect AI agents to ChartStead Course Check. Course Check 08 scoped API keys remain the kernel. Product surface is simple **API** + **MCP** access (Postiz-style): create a scoped key, copy URL/token/config — no OAuth provider wizard.

**Blocked by:** 08 — Complete agent API control.

**Status:** in-review

- [x] Research comparable products (Postiz public API + MCP with API key header) and choose the simple path.
- [x] Primary connection path: Settings → Automation access with **API** and **MCP** tabs sharing one scoped agent key.
- [x] Preserve Course Check 08 semantics: agent principals, per-event scopes, propose-only default, modes, live revocation, initiating-human provenance.
- [x] Actor labels remain agent-on-behalf-of-human when provenance exists (unchanged CC08 kernel).
- [x] Connection path covers full organizer API parity via bearer API + MCP tool bridge under the same scopes.
- [x] Settings guides create → copy → revoke in plain language; no bare “API key only” buried under Developer access.
- [x] Document API and MCP setup (Claude Code command + Cursor/generic JSON) in `docs/ai-connections.md`.
- [x] Long-lived bearer keys are the primary simple path (not secondary developer-only).
- [x] Competition boundary respected; MCP is this ticket’s productization.
- [x] Contract tests cover API key create/revoke and API-key-authenticated MCP (initialize, tools, list course checks, credential path block, OAuth routes gone).

## Comments

Filed after Course Check 08 human QA: raw API keys work and are correct as a kernel/compatibility layer, but they are a poor primary UX for organizers who want to “give an agent access.” Spec already excluded MCP from the competition build; this ticket owns the friendlier connection model once 08 is done.

- 2026-08-12 — Tyler: create ticket for MCP/other connection UX; keep 08 API keys as interim.
- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-12 — claimed by OpenCode; implementing the personal-assistant connection release from `.research/chartstead-agent-connection-ux-research.md` in worktree `.worktrees/course-check-13-agent-connections`.
- 2026-08-12 — Tyler rejected OAuth/provider wizard + unstyled setup page. Direction: scrap over-engineering; simple API + MCP like Postiz.
- 2026-08-12 — simplified implementation ready for human QA.
  - Demo: http://100.105.117.93:5193/ (Settings nav → Automation access)
  - What to test:
    1. Settings shows **Automation access** with **API** and **MCP** tabs (no assistant wizard / Developer access hide).
    2. API tab: create key, copy token once, see base URL + Bearer header.
    3. MCP tab: copy `/mcp` URL, create token, copy Cursor JSON + Claude Code command.
    4. Revoke removes API and MCP access.
    5. Desktop + mobile Settings layout (no horizontal overflow).
  - Verified: typecheck, build, worker automation tests 6/6, UI settings 4/4, CC08 agent-api 11/11, Playwright desktop+mobile QA, live MCP initialize with created token.
