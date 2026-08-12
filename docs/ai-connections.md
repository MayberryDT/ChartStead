# AI connections

ChartStead's normal organizer path is **Settings → AI connections**. It keeps the selected conference and access boundary visible, creates a distinct agent principal, and never displays the underlying bearer credential to the organizer. Manual API keys remain under **Developer access** for CI and custom automation.

## Access profiles

- **Explore:** event-scoped reads only.
- **Research and prepare (recommended):** reads plus frozen decision, communication-draft, and publication proposals. Final effects still require Course Check.
- **Operate with approval:** full organizer API parity where granted, with delegated execution through the same Course Check stages, freshness checks, audit, and initiating-human provenance as the HTTP API.

Connections use the hosted Streamable HTTP MCP endpoint at `/mcp`, OAuth protected-resource and authorization-server discovery, dynamic client registration with exact redirect validation, a single-use 10-minute authorization code bound to the MCP resource/client/redirect URI, PKCE S256, a one-hour access token, and rotating refresh tokens. Code redemption is conditional so concurrent exchanges have one winner. Disconnecting a connection revokes access and refresh credentials before the next request; expired access reports **Needs sign-in** if refresh fails. Provider directory publication remains a separate distribution step.

## Claude

1. Prerequisite: Claude web or desktop with custom connectors enabled. Team/Enterprise workspaces may require an owner to enable or add the connector.
2. In ChartStead Settings, choose **Claude**, select the conference access profile, and choose **Allow and connect**.
3. Open the secure handoff, copy the displayed `https://…/mcp?connection_id=…` URL, then add it from **Settings → Connectors → Add custom connector**.
4. Complete the ChartStead sign-in and event authorization handoff. Do not paste an API key into a conversation.
5. Ask Claude to list this conference's proposals, then return to ChartStead and choose **Test connection**. The test succeeds only after an authenticated MCP request and makes no change.
6. Recovery: if ChartStead shows **Needs sign-in**, reconnect from Claude's connector settings; **Disconnect** immediately revokes access.

Claude's current custom-connector documentation is the upstream reference: <https://support.claude.com/en/articles/11175166-about-custom-integrations-using-remote-mcp>.

## ChatGPT

1. Prerequisite: an eligible ChatGPT workspace with custom apps/developer mode enabled; a workspace administrator may need to allow the app.
2. In ChartStead Settings, choose **ChatGPT**, select the conference access profile, and choose **Allow and connect**.
3. Open the secure handoff and use the displayed `https://…/mcp?connection_id=…` URL when creating the custom app from the workspace's Apps/developer surface.
4. Complete the ChartStead sign-in and authorization handoff. Review the discovered tools and keep **Important actions** approval enabled.
5. Ask ChatGPT to list this conference's proposals, then return to ChartStead and choose **Test connection**.
6. Recovery: reconnect if the app reports authorization failure; **Disconnect** in ChartStead revokes the connection immediately.

OpenAI's current app and permission documentation is the upstream reference: <https://help.openai.com/en/articles/11487775>.

## Security boundary

- Personal assistants act as a distinct agent on behalf of the initiating organizer.
- Every grant is restricted to the selected event and access profile.
- Reads and preparation do not bypass normal authorization.
- Final decisions, sends, calendar delivery, publication, integrations, retries, reconciliation, and compensation retain Course Check 08 semantics.
- API keys and protocol details are secondary developer controls, not the organizer happy path.
- Connection tests must not report Connected until a host has exchanged the one-time authorization code.

The target remote MCP authorization contract is the official MCP authorization specification: <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>.
