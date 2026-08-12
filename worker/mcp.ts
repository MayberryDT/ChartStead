import type { OrganizerPrincipal } from "../shared/events";

const PROTOCOL_VERSION = "2025-11-25";

type V1Requester = (path: string, init?: RequestInit) => Promise<Response>;

export async function handleMcpRequest(input: {
  request: Request;
  principal: OrganizerPrincipal;
  requestV1: V1Requester;
}): Promise<Response> {
  const origin = input.request.headers.get("origin");
  const allowedOrigins = new Set([
    new URL(input.request.url).origin,
    "https://claude.ai",
    "https://chatgpt.com",
  ]);
  if (origin && !allowedOrigins.has(origin)) {
    return jsonRpcError(null, -32000, "Untrusted Origin header.", 403);
  }
  if (input.request.method === "GET") return new Response(null, { status: 405 });
  if (input.request.method !== "POST") return new Response(null, { status: 405 });
  const accept = input.request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return jsonRpcError(null, -32600, "Accept must include application/json and text/event-stream.", 400);
  }
  const message = await input.request.json().catch(() => null) as {
    jsonrpc?: unknown;
    id?: string | number | null;
    method?: unknown;
    params?: unknown;
  } | null;
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return jsonRpcError(message?.id ?? null, -32600, "Invalid JSON-RPC request.", 400);
  }
  const requestedVersion = input.request.headers.get("mcp-protocol-version");
  if (message.method !== "initialize" && requestedVersion && requestedVersion !== PROTOCOL_VERSION) {
    return jsonRpcError(message.id ?? null, -32600, "Unsupported MCP protocol version.", 400);
  }
  if (message.id === undefined) return new Response(null, { status: 202 });
  if (message.method === "initialize") {
    return jsonRpcResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "chartstead", title: "ChartStead", version: "0.1.0" },
      instructions:
        "Call ChartStead organizer tools with the event id you are authorized for. Course Check scopes and agent mode from the API key still apply.",
    });
  }
  if (message.method === "ping") return jsonRpcResult(message.id, {});
  if (message.method === "tools/list") return jsonRpcResult(message.id, { tools: mcpTools() });
  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object"
      ? message.params as { name?: unknown; arguments?: unknown }
      : {};
    if (typeof params.name !== "string") return jsonRpcError(message.id, -32602, "Tool name is required.");
    return callTool(message.id, params.name, params.arguments, input.principal, input.requestV1);
  }
  return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
}

function mcpTools() {
  return [
    {
      name: "chartstead_event_api",
      title: "Use the conference organizer API",
      description:
        "Call an event-scoped ChartStead v1 organizer endpoint. Course Check scopes and agent mode from the API key remain enforced.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          method: { type: "string", enum: ["GET", "POST", "PATCH"] },
          path: {
            type: "string",
            description:
              "Path below /events/{eventId}, such as /submissions, /sessions/session-id, or /course-checks.",
          },
          body: { type: "object" },
          idempotencyKey: { type: "string" },
        },
        required: ["eventId", "method", "path"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
      name: "chartstead_list_event_work",
      title: "List conference program work",
      description:
        "Read proposals, speakers, sessions, tasks, or communications for the authorized conference.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          resource: {
            type: "string",
            enum: ["submissions", "speakers", "sessions", "tasks", "communications", "program"],
          },
        },
        required: ["eventId", "resource"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "chartstead_prepare_decision",
      title: "Prepare a proposal decision",
      description:
        "Create a frozen Course Check proposal decision for human review. Does not apply the decision or notify speakers.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          proposalId: { type: "string" },
          outcome: { type: "string", enum: ["accepted", "declined"] },
          idempotencyKey: { type: "string" },
        },
        required: ["eventId", "proposalId", "outcome", "idempotencyKey"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
      name: "chartstead_list_course_checks",
      title: "List Course Checks",
      description: "List resumable Course Checks and their current review or result state.",
      inputSchema: {
        type: "object",
        properties: { eventId: { type: "string" } },
        required: ["eventId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

async function callTool(
  id: string | number | null,
  name: string,
  rawArguments: unknown,
  principal: OrganizerPrincipal,
  requestV1: V1Requester,
): Promise<Response> {
  const args = rawArguments && typeof rawArguments === "object" ? rawArguments as Record<string, unknown> : {};
  const eventId = typeof args.eventId === "string" ? args.eventId : "";
  if (!eventId || !principal.eventIds.includes(eventId)) {
    return toolError(id, "Choose an event authorized for this API key.");
  }
  let response: Response;
  if (name === "chartstead_event_api") {
    const method = typeof args.method === "string" ? args.method : "";
    const path = typeof args.path === "string" ? args.path : "";
    let decodedPath = "";
    try {
      decodedPath = decodeURIComponent(path);
    } catch {
      /* rejected below */
    }
    const eventPrefix = `/events/${encodeURIComponent(eventId)}`;
    const normalizedPath = decodedPath
      ? new URL(`${eventPrefix}${decodedPath}`, "https://chartstead.invalid").pathname
      : "";
    if (
      !["GET", "POST", "PATCH"].includes(method) ||
      !decodedPath.startsWith("/") ||
      decodedPath.includes("..") ||
      decodedPath.includes("\\") ||
      decodedPath.includes("?") ||
      decodedPath.includes("#") ||
      !normalizedPath.startsWith(`${eventPrefix}/`)
    ) {
      return toolError(id, "Choose a supported method and a relative event API path.");
    }
    if (/^\/(?:api-keys|integrations)(?:\/|$)/.test(decodedPath)) {
      return toolError(id, "Agents cannot manage credentials or integration configuration.");
    }
    const headers = new Headers();
    if (method !== "GET") headers.set("content-type", "application/json");
    if (typeof args.idempotencyKey === "string") headers.set("idempotency-key", args.idempotencyKey);
    response = await requestV1(normalizedPath, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(args.body ?? {}),
    });
  } else if (name === "chartstead_list_event_work") {
    const resource = typeof args.resource === "string" ? args.resource : "";
    if (!["submissions", "speakers", "sessions", "tasks", "communications", "program"].includes(resource)) {
      return toolError(id, "Choose a supported event resource.");
    }
    response = await requestV1(`/events/${encodeURIComponent(eventId)}/${resource}`);
  } else if (name === "chartstead_list_course_checks") {
    response = await requestV1(`/events/${encodeURIComponent(eventId)}/course-checks`);
  } else if (name === "chartstead_prepare_decision") {
    response = await requestV1(`/events/${encodeURIComponent(eventId)}/course-checks/decisions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": String(args.idempotencyKey ?? ""),
      },
      body: JSON.stringify({
        proposalId: args.proposalId,
        outcome: args.outcome,
        idempotencyKey: args.idempotencyKey,
      }),
    });
  } else {
    return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
  }
  const body = await response.json().catch(() => ({ error: "ChartStead returned an unreadable response." }));
  if (!response.ok) return toolError(id, JSON.stringify(body));
  return jsonRpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    isError: false,
  });
}

function jsonRpcResult(id: string | number | null, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: string | number | null, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

function toolError(id: string | number | null, message: string): Response {
  return jsonRpcResult(id, { content: [{ type: "text", text: message }], isError: true });
}
