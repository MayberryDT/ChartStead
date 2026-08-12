import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import type { AirtableSyncHealth, AirtableSyncState } from "../shared/airtable";
import {
  COURSE_CHECK_SCOPES,
  type AgentOperatingMode,
  type CourseCheckScope,
} from "../shared/agent-api";
import type { EventCourseCheckPolicy } from "../shared/course-check";
import {
  ApiError,
  connectAirtableSync,
  createEventApiKey,
  disconnectAirtableSync,
  fetchAirtableSync,
  fetchCourseCheckPolicy,
  listEventApiKeys,
  pullAirtableSync,
  updateCourseCheckPolicy,
  updateEventApiKey,
  type CreatedEventApiKey,
  type EventApiKeySummary,
} from "./api";

/** Must match worker/airtable/demo-sandbox.ts */
const DEMO_BASE_ID = "appChartSteadDemo";
const DEMO_TOKEN = "pat_demo_sandbox";

const MODE_LABELS: Record<AgentOperatingMode, string> = {
  propose_only: "Propose only",
  delegated_execution: "Delegated execution",
  autonomous_policy: "Autonomous policy",
};

const SCOPE_LABELS: Record<CourseCheckScope, string> = {
  decisions: "Decisions",
  drafts: "Drafts",
  sends: "Sends",
  calendars: "Calendars",
  publication: "Publication",
  integrations: "Integrations",
  retries: "Retries",
  reconciliation: "Reconciliation",
  compensation: "Compensation",
};

function healthLabel(health: AirtableSyncHealth): string {
  switch (health) {
    case "unconfigured":
      return "Not connected";
    case "healthy":
      return "Healthy";
    case "pending":
      return "Pending";
    case "delayed":
      return "Delayed";
    case "failed":
      return "Failed";
  }
}

function healthTone(health: AirtableSyncHealth): string {
  switch (health) {
    case "healthy":
      return "sync-pill sync-pill-ok";
    case "pending":
      return "sync-pill sync-pill-pending";
    case "delayed":
      return "sync-pill sync-pill-delayed";
    case "failed":
      return "sync-pill sync-pill-failed";
    default:
      return "sync-pill";
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CourseCheckPolicyCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const policyQuery = useQuery({
    queryKey: ["course-check-policy", eventId],
    queryFn: () => fetchCourseCheckPolicy(eventId),
  });
  const [draft, setDraft] = useState<EventCourseCheckPolicy | null>(null);
  useEffect(() => {
    if (policyQuery.data) setDraft(policyQuery.data);
  }, [policyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (policy: EventCourseCheckPolicy) =>
      updateCourseCheckPolicy(eventId, policy),
    onSuccess: (policy) => {
      setDraft(policy);
      setTone("success");
      setMessage("Course Check policy saved. Baseline protections remain in force.");
      void queryClient.invalidateQueries({ queryKey: ["course-check-policy", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(
        error instanceof ApiError ? error.message : "Unable to save Course Check policy.",
      );
    },
  });

  if (!draft) {
    return (
      <section className="settings-card" aria-labelledby="cc-policy-heading">
        <h3 id="cc-policy-heading">Course Check policy</h3>
        <p className="muted">{policyQuery.isError ? "Unable to load policy." : "Loading…"}</p>
      </section>
    );
  }

  return (
    <section className="settings-card" aria-labelledby="cc-policy-heading">
      <div className="settings-card-header">
        <div>
          <h3 id="cc-policy-heading">Course Check policy</h3>
          <p className="muted">
            Optional stricter approvals. Policy can only add gates — it cannot turn off
            plan matching, authorization, freshness checks, or hard safety blocks.
          </p>
        </div>
      </div>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          saveMutation.mutate(draft);
        }}
      >
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireTwoPersonApproval}
            onChange={(e) =>
              setDraft({ ...draft, requireTwoPersonApproval: e.target.checked })
            }
          />
          <span>Require two-person approval before stage execution</span>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireDistinctApprover}
            onChange={(e) =>
              setDraft({ ...draft, requireDistinctApprover: e.target.checked })
            }
          />
          <span>Approver must differ from the plan requester</span>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireReasonOnApprove}
            onChange={(e) =>
              setDraft({ ...draft, requireReasonOnApprove: e.target.checked })
            }
          />
          <span>Require a reason on every stage approval</span>
        </label>
        <label className="settings-label" htmlFor="cc-max-agent-mode">
          Maximum agent operating mode
        </label>
        <select
          id="cc-max-agent-mode"
          className="settings-input"
          value={draft.maxAgentMode}
          onChange={(e) =>
            setDraft({
              ...draft,
              maxAgentMode: e.target.value as AgentOperatingMode,
            })
          }
        >
          <option value="propose_only">Propose only</option>
          <option value="delegated_execution">Delegated execution</option>
          <option value="autonomous_policy">Autonomous policy</option>
        </select>
        <div className="settings-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save policy"}
          </button>
        </div>
        {message ? (
          <p className={`form-message ${tone === "error" ? "error" : "success"}`} role="status">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function AutomationAccessCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"api" | "mcp">("api");
  const [name, setName] = useState("Program ops agent");
  const [mode, setMode] = useState<AgentOperatingMode>("propose_only");
  const [grantAll, setGrantAll] = useState(false);
  const [scopes, setScopes] = useState<CourseCheckScope[]>(["decisions", "drafts"]);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [revealed, setRevealed] = useState<CreatedEventApiKey | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | "config" | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/mcp`;

  const keysQuery = useQuery({
    queryKey: ["event-api-keys", eventId],
    queryFn: () => listEventApiKeys(eventId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createEventApiKey(eventId, {
        name: name.trim() || "Agent",
        principalKind: "agent",
        agentMode: mode,
        courseCheckScopes: grantAll ? ["all"] : scopes,
      }),
    onSuccess: async (result) => {
      setRevealed(result.apiKey);
      setCopied(null);
      setTone("success");
      setMessage("Key created. Copy the secret now — ChartStead only shows it once.");
      await queryClient.invalidateQueries({ queryKey: ["event-api-keys", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(error instanceof ApiError ? error.message : "Unable to create key.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => updateEventApiKey(eventId, keyId, { revoke: true }),
    onSuccess: async () => {
      setTone("success");
      setMessage("Key revoked. It cannot call the API or MCP on the next request.");
      await queryClient.invalidateQueries({ queryKey: ["event-api-keys", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(error instanceof ApiError ? error.message : "Unable to revoke key.");
    },
  });

  function toggleScope(scope: CourseCheckScope) {
    setGrantAll(false);
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!grantAll && scopes.length === 0) {
      setTone("error");
      setMessage("Choose at least one Course Check scope, or grant all stages.");
      return;
    }
    createMutation.mutate();
  }

  async function copyText(value: string, kind: "token" | "url" | "config") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setTone("error");
      setMessage("Could not copy automatically — select the text and copy manually.");
    }
  }

  const keys: EventApiKeySummary[] = (keysQuery.data?.apiKeys ?? []).filter(
    (key) => key.principalKind === "agent" && !key.revokedAt,
  );

  const mcpConfig = revealed?.token
    ? JSON.stringify(
        {
          mcpServers: {
            chartstead: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${revealed.token}` },
            },
          },
        },
        null,
        2,
      )
    : JSON.stringify(
        {
          mcpServers: {
            chartstead: {
              url: mcpUrl,
              headers: { Authorization: "Bearer cs_live_…" },
            },
          },
        },
        null,
        2,
      );

  const claudeCommand = revealed?.token
    ? `claude mcp add --transport http chartstead ${mcpUrl} --header "Authorization: Bearer ${revealed.token}"`
    : `claude mcp add --transport http chartstead ${mcpUrl} --header "Authorization: Bearer cs_live_…"`;

  return (
    <section className="settings-card automation-access" aria-labelledby="automation-access-heading">
      <div className="settings-card-header">
        <div>
          <h3 id="automation-access-heading">Automation access</h3>
          <p className="muted">
            Give integrations and AI agents scoped access to this conference. Same key works for the
            HTTP API and MCP. Secrets are shown once.
          </p>
        </div>
      </div>

      <div className="automation-tabs" role="tablist" aria-label="Access method">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "api"}
          className={`automation-tab ${tab === "api" ? "active" : ""}`}
          onClick={() => setTab("api")}
        >
          API
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mcp"}
          className={`automation-tab ${tab === "mcp" ? "active" : ""}`}
          onClick={() => setTab("mcp")}
        >
          MCP
        </button>
      </div>

      {tab === "api" ? (
        <div role="tabpanel" className="automation-panel">
          <p className="muted">
            Use the HTTP API for scripts, n8n, Make, or custom agents. Send{" "}
            <code>Authorization: Bearer &lt;token&gt;</code> to{" "}
            <code>{origin || "https://your-host"}/api/v1/…</code>.
          </p>

          <form className="settings-form settings-form-wide" onSubmit={onCreate}>
            <p className="settings-form-legend">Create API key</p>

            <label className="settings-label" htmlFor="agent-key-name">
              Name
            </label>
            <input
              id="agent-key-name"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Program ops agent"
              autoComplete="off"
            />

            <label className="settings-label" htmlFor="agent-key-mode">
              Operating mode
            </label>
            <select
              id="agent-key-mode"
              className="settings-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentOperatingMode)}
            >
              <option value="propose_only">Propose only — create and revise plans</option>
              <option value="delegated_execution">
                Delegated execution — may apply granted stages
              </option>
              <option value="autonomous_policy">
                Autonomous policy — explicit unsupervised execution
              </option>
            </select>

            <fieldset className="settings-scope-fieldset">
              <legend className="settings-label">Course Check stages</legend>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={grantAll}
                  onChange={(e) => {
                    setGrantAll(e.target.checked);
                    if (e.target.checked) setScopes([...COURSE_CHECK_SCOPES]);
                  }}
                />
                <span>All stages (stored as expanded individual scopes)</span>
              </label>
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <label key={scope} className="settings-check">
                    <input
                      type="checkbox"
                      checked={grantAll || scopes.includes(scope)}
                      disabled={grantAll}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{SCOPE_LABELS[scope]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create API key"}
              </button>
            </div>
          </form>

          {revealed ? (
            <div className="settings-token-reveal" role="status">
              <strong>Copy this token now</strong>
              <p className="muted">
                {revealed.name} · {MODE_LABELS[revealed.agentMode ?? "propose_only"]} ·{" "}
                {revealed.courseCheckScopes.length === 0
                  ? "no stages"
                  : revealed.courseCheckScopes.join(", ")}
              </p>
              <code className="settings-token-value">{revealed.token}</code>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copyText(revealed.token, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRevealed(null)}>
                  Hide
                </button>
              </div>
              <p className="muted">
                Base URL: <code>{origin}/api/v1</code>
                {" · "}
                Header: <code>Authorization: Bearer …</code>
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="automation-panel">
          <p className="muted">
            Connect Claude Code, Cursor, Codex, or any MCP client with the same agent API key. No
            OAuth wizard — paste the server URL and Authorization header.
          </p>

          <div className="mcp-field">
            <label className="settings-label" htmlFor="mcp-url">
              MCP server URL
            </label>
            <div className="mcp-copy-row">
              <code id="mcp-url" className="settings-token-value">
                {mcpUrl || "/mcp"}
              </code>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyText(mcpUrl, "url")}
              >
                {copied === "url" ? "Copied" : "Copy URL"}
              </button>
            </div>
          </div>

          <form className="settings-form settings-form-wide" onSubmit={onCreate}>
            <p className="settings-form-legend">Create an MCP token</p>
            <p className="muted">
              This creates the same scoped agent key used by the API tab. Defaults stay propose-only
              until you grant stages.
            </p>
            <label className="settings-label" htmlFor="mcp-key-name">
              Name
            </label>
            <input
              id="mcp-key-name"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Code"
              autoComplete="off"
            />
            <label className="settings-label" htmlFor="mcp-key-mode">
              Operating mode
            </label>
            <select
              id="mcp-key-mode"
              className="settings-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentOperatingMode)}
            >
              <option value="propose_only">Propose only — create and revise plans</option>
              <option value="delegated_execution">
                Delegated execution — may apply granted stages
              </option>
              <option value="autonomous_policy">
                Autonomous policy — explicit unsupervised execution
              </option>
            </select>
            <fieldset className="settings-scope-fieldset">
              <legend className="settings-label">Course Check stages</legend>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={grantAll}
                  onChange={(e) => {
                    setGrantAll(e.target.checked);
                    if (e.target.checked) setScopes([...COURSE_CHECK_SCOPES]);
                  }}
                />
                <span>All stages</span>
              </label>
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <label key={scope} className="settings-check">
                    <input
                      type="checkbox"
                      checked={grantAll || scopes.includes(scope)}
                      disabled={grantAll}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{SCOPE_LABELS[scope]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create MCP token"}
              </button>
            </div>
          </form>

          {revealed ? (
            <div className="settings-token-reveal" role="status">
              <strong>Token (shown once)</strong>
              <code className="settings-token-value">{revealed.token}</code>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copyText(revealed.token, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mcp-config-block">
            <strong>Cursor / generic MCP config</strong>
            <p className="muted">Add to <code>.cursor/mcp.json</code> or your client’s MCP settings.</p>
            <pre className="mcp-config-pre">{mcpConfig}</pre>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyText(mcpConfig, "config")}
              >
                {copied === "config" ? "Copied" : "Copy config"}
              </button>
            </div>
          </div>

          <div className="mcp-config-block">
            <strong>Claude Code</strong>
            <pre className="mcp-config-pre">{claudeCommand}</pre>
          </div>

          <p className="muted">
            Treat the token like a password. Revoke it below when access should end.
          </p>
        </div>
      )}

      {keysQuery.isPending ? (
        <p className="empty-state padded">Loading keys…</p>
      ) : keysQuery.error instanceof ApiError ? (
        <p className="form-message error" role="alert">
          {keysQuery.error.message}
        </p>
      ) : keys.length === 0 ? (
        <p className="muted">No active agent keys for this event yet.</p>
      ) : (
        <div className="settings-key-table-wrap">
          <table className="settings-key-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Mode</th>
                <th scope="col">Scopes</th>
                <th scope="col">Prefix</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>{key.agentMode ? MODE_LABELS[key.agentMode] : "—"}</td>
                  <td>
                    {key.courseCheckScopes.length === 0
                      ? "None"
                      : key.courseCheckScopes.length === COURSE_CHECK_SCOPES.length
                        ? "All stages"
                        : key.courseCheckScopes
                            .map((scope) => SCOPE_LABELS[scope as CourseCheckScope] ?? scope)
                            .join(", ")}
                  </td>
                  <td>
                    <code>{key.keyPrefix}…</code>
                  </td>
                  <td>{formatTimestamp(key.lastUsedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={revokeMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke “${key.name}”? The agent loses API and MCP access on the next call.`,
                          )
                        ) {
                          revokeMutation.mutate(key.id);
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message ? (
        <p className={`form-message ${tone}`} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function SettingsWorkspace({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formTone, setFormTone] = useState<"success" | "error">("success");

  const syncQuery = useQuery({
    queryKey: ["airtable-sync", eventId],
    queryFn: () => fetchAirtableSync(eventId),
  });

  const sync: AirtableSyncState | undefined = syncQuery.data?.sync;

  useEffect(() => {
    if (sync?.baseId) setBaseId(sync.baseId);
  }, [sync?.baseId]);

  const connectMutation = useMutation({
    mutationFn: (input: { baseId: string; accessToken: string }) =>
      connectAirtableSync(eventId, input),
    onSuccess: async (result) => {
      setAccessToken("");
      const ok = result.pull.ok && result.sync.health === "healthy";
      setFormTone(ok ? "success" : "error");
      setFormMessage(
        ok
          ? `Connected. Pull applied ${result.pull.changes.length} mapped change(s). Check Submissions — titles may show “(from Airtable demo)”.`
          : `Saved, but pull reported ${result.sync.health}: ${result.pull.error ?? result.sync.guidance ?? "see status"}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to connect Airtable.",
      );
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => pullAirtableSync(eventId),
    onSuccess: async (result) => {
      const ok = result.pull.ok && result.sync.health === "healthy";
      setFormTone(ok ? "success" : "error");
      setFormMessage(
        ok
          ? `Pull finished healthy (${result.pull.changes.length} change(s)).`
          : `Pull finished: ${healthLabel(result.sync.health)}. ${result.pull.error ?? ""}`.trim(),
      );
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to pull from Airtable.",
      );
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectAirtableSync(eventId),
    onSuccess: async () => {
      setAccessToken("");
      setBaseId("");
      setFormTone("success");
      setFormMessage("Airtable disconnected for this event.");
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to disconnect Airtable.",
      );
    },
  });

  function onConnect(event: FormEvent) {
    event.preventDefault();
    setFormMessage(null);
    connectMutation.mutate({
      baseId: baseId.trim(),
      accessToken: accessToken.trim(),
    });
  }

  function onDemoSandbox() {
    setFormMessage(null);
    setBaseId(DEMO_BASE_ID);
    setAccessToken(DEMO_TOKEN);
    connectMutation.mutate({
      baseId: DEMO_BASE_ID,
      accessToken: DEMO_TOKEN,
    });
  }

  const busy =
    connectMutation.isPending ||
    pullMutation.isPending ||
    disconnectMutation.isPending;

  const canSubmit =
    Boolean(baseId.trim()) &&
    (Boolean(accessToken.trim()) || Boolean(sync?.hasAccessToken));

  return (
    <div className="workspace">
      <section className="operations-panel">
        <div className="panel-heading">
          <h2>Settings</h2>
        </div>
        <div className="settings-stack">
          <CourseCheckPolicyCard eventId={eventId} />
          <AutomationAccessCard eventId={eventId} />

          <section className="settings-card" aria-labelledby="airtable-sync-heading">
            <div className="settings-card-header">
              <div>
                <h3 id="airtable-sync-heading">Airtable sync</h3>
                <p className="muted">
                  Optional. Pull mapped fields from a ChartStead Program base. Core ChartStead
                  work stays available when Airtable is offline.
                </p>
              </div>
              {sync ? (
                <span className={healthTone(sync.health)}>{healthLabel(sync.health)}</span>
              ) : null}
            </div>

            {syncQuery.isPending ? (
              <p className="empty-state padded">Loading sync status…</p>
            ) : syncQuery.error instanceof ApiError ? (
              <p className="form-message error" role="alert">
                {syncQuery.error.message}
              </p>
            ) : (
              <>
                <div className="settings-demo-callout">
                  <strong>No Airtable account?</strong>
                  <p>
                    Use the built-in sandbox. It fakes a connected base and pulls a visible title
                    change onto a few submissions so you can verify the flow end-to-end.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={onDemoSandbox}
                  >
                    {connectMutation.isPending
                      ? "Connecting demo…"
                      : "Connect demo Airtable sandbox"}
                  </button>
                </div>

                <form className="settings-form" onSubmit={onConnect}>
                  <p className="settings-form-legend">Or connect a real Airtable base</p>
                  <label className="settings-label" htmlFor="airtable-base-id">
                    Base ID
                  </label>
                  <input
                    id="airtable-base-id"
                    className="settings-input"
                    name="baseId"
                    value={baseId}
                    onChange={(e) => setBaseId(e.target.value)}
                    placeholder="appXXXXXXXXXXXXXX"
                    autoComplete="off"
                    spellCheck={false}
                  />

                  <label className="settings-label" htmlFor="airtable-access-token">
                    Personal access token
                    {sync?.hasAccessToken ? " (leave blank to keep current)" : ""}
                  </label>
                  <input
                    id="airtable-access-token"
                    className="settings-input"
                    name="accessToken"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={
                      sync?.hasAccessToken ? "•••••••• (saved)" : "patXXXXXXXX…."
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />

                  <div className="settings-actions">
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={busy || !canSubmit}
                    >
                      {connectMutation.isPending ? "Connecting…" : "Connect and pull"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !sync?.configured}
                      onClick={() => {
                        setFormMessage(null);
                        pullMutation.mutate();
                      }}
                    >
                      {pullMutation.isPending ? "Pulling…" : "Retry pull"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || !sync?.configured}
                      onClick={() => {
                        setFormMessage(null);
                        disconnectMutation.mutate();
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </form>

                {sync ? (
                  <dl className="settings-meta">
                    <div>
                      <dt>Last pull</dt>
                      <dd>{formatTimestamp(sync.lastPullAt)}</dd>
                    </div>
                    <div>
                      <dt>Last success</dt>
                      <dd>{formatTimestamp(sync.lastSuccessAt)}</dd>
                    </div>
                    <div>
                      <dt>Base</dt>
                      <dd>{sync.baseId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Token</dt>
                      <dd>{sync.hasAccessToken ? "Saved for this event" : "Not saved"}</dd>
                    </div>
                    {sync.lastError ? (
                      <div className="settings-meta-wide">
                        <dt>Last error</dt>
                        <dd>{sync.lastError}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {sync?.guidance ? (
                  <p className="settings-guidance" role="status">
                    {sync.guidance}
                  </p>
                ) : null}

                {formMessage ? (
                  <p className={`form-message ${formTone}`} role="status">
                    {formMessage}
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
