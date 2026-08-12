import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import type { AirtableSyncHealth, AirtableSyncState } from "../shared/airtable";
import {
  COURSE_CHECK_SCOPES,
  type AgentOperatingMode,
  type CourseCheckScope,
} from "../shared/agent-api";
import {
  ApiError,
  connectAirtableSync,
  createAiConnection,
  createEventApiKey,
  disconnectAirtableSync,
  fetchAirtableSync,
  listEventApiKeys,
  listAiConnections,
  pullAirtableSync,
  revokeAiConnection,
  testAiConnection,
  updateEventApiKey,
  type CreatedEventApiKey,
  type EventApiKeySummary,
  type AiAccessProfile,
  type AiConnectionProvider,
  type AiConnectionSummary,
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

function AgentApiKeysCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("Program ops agent");
  const [mode, setMode] = useState<AgentOperatingMode>("propose_only");
  const [grantAll, setGrantAll] = useState(false);
  const [scopes, setScopes] = useState<CourseCheckScope[]>(["decisions", "drafts"]);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [revealed, setRevealed] = useState<CreatedEventApiKey | null>(null);
  const [copied, setCopied] = useState(false);

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
      setCopied(false);
      setTone("success");
      setMessage(
        "Agent key created. Copy the token now — ChartStead only shows it once.",
      );
      await queryClient.invalidateQueries({ queryKey: ["event-api-keys", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(error instanceof ApiError ? error.message : "Unable to create agent key.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => updateEventApiKey(eventId, keyId, { revoke: true }),
    onSuccess: async () => {
      setTone("success");
      setMessage("Key revoked. It cannot call the API on the next request.");
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
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
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

  async function copyToken() {
    if (!revealed?.token) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
    } catch {
      setTone("error");
      setMessage("Could not copy automatically — select the token and copy manually.");
    }
  }

  const keys: EventApiKeySummary[] = (keysQuery.data?.apiKeys ?? []).filter(
    (key) => key.principalKind === "agent" && !key.revokedAt,
  );

  return (
    <section className="settings-card" aria-labelledby="agent-api-heading">
      <div className="settings-card-header">
        <div>
          <h3 id="agent-api-heading">Agent API keys</h3>
          <p className="muted">
            Give a scoped AI agent the same Course Check path as organizers. New keys are
            propose-only with no stages until you grant them. The secret token is shown once.
          </p>
        </div>
      </div>

      <form className="settings-form settings-form-wide" onSubmit={onCreate}>
        <p className="settings-form-legend">Create agent key</p>

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
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending}
          >
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
            <button type="button" className="btn btn-secondary" onClick={() => void copyToken()}>
              {copied ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRevealed(null)}
            >
              Hide
            </button>
          </div>
          <p className="muted">
            Base URL for agents:{" "}
            <code>{typeof window !== "undefined" ? window.location.origin : ""}</code>
            {" · "}
            Header: <code>Authorization: Bearer …</code>
          </p>
        </div>
      ) : null}

      {keysQuery.isPending ? (
        <p className="empty-state padded">Loading agent keys…</p>
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
                            `Revoke “${key.name}”? The agent loses access on the next call.`,
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

const PROVIDERS: Array<{ id: AiConnectionProvider; name: string; detail: string; verified: string }> = [
  { id: "claude", name: "Claude", detail: "Custom connector through Claude settings", verified: "Guided setup" },
  { id: "chatgpt", name: "ChatGPT", detail: "Custom app through workspace settings", verified: "Workspace plan may be required" },
  { id: "copilot", name: "Microsoft Copilot", detail: "Organization approval may be required", verified: "Not yet verified" },
  { id: "other", name: "Other compatible assistant", detail: "Standards-based connection", verified: "Advanced" },
];

const PROVIDER_DESTINATIONS: Partial<Record<AiConnectionProvider, string>> = {
  claude: "https://claude.ai",
  chatgpt: "https://chatgpt.com",
  copilot: "https://m365.cloud.microsoft/chat",
};

function AiConnectionsCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"overview" | "provider" | "access" | "success">("overview");
  const [provider, setProvider] = useState<AiConnectionProvider>("claude");
  const [accessProfile, setAccessProfile] = useState<AiAccessProfile>("research_prepare");
  const [active, setActive] = useState<AiConnectionSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const connectionsQuery = useQuery({
    queryKey: ["ai-connections", eventId],
    queryFn: () => listAiConnections(eventId),
  });
  const createMutation = useMutation({
    mutationFn: () => createAiConnection(eventId, { provider, accessProfile, approvalPolicy: "important_actions" }),
    onSuccess: async ({ connection }) => {
      setActive(connection);
      setMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["ai-connections", eventId] });
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : "Unable to connect assistant."),
  });
  const testMutation = useMutation({
    mutationFn: (id: string) => testAiConnection(eventId, id),
    onSuccess: async ({ connection }) => {
      setActive(connection);
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["ai-connections", eventId] });
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : "Connection test failed."),
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAiConnection(eventId, id),
    onSuccess: async (_, id) => {
      if (active?.id === id) {
        setActive(null);
        setStep("overview");
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-connections", eventId] });
    },
  });
  const providerName = PROVIDERS.find((entry) => entry.id === provider)?.name ?? "Assistant";
  const providerDestination = active ? PROVIDER_DESTINATIONS[active.provider] : undefined;

  return (
    <section className="settings-card ai-connections" aria-labelledby="ai-connections-heading">
      <div className="ai-connections-hero">
        <div>
          <p className="settings-eyebrow">AI connections</p>
          <h3 id="ai-connections-heading">Use your AI assistant with ChartStead.</h3>
          <p>Connect ChatGPT, Claude, or Copilot to this conference. ChartStead controls what it can access and asks before important actions.</p>
        </div>
        {step === "overview" ? <button className="btn btn-primary" type="button" onClick={() => setStep("provider")}>Choose an assistant</button> : null}
      </div>

      {step === "provider" ? (
        <div className="assistant-step">
          <div className="step-heading"><span>1 of 2</span><h4>Where do you want to use ChartStead?</h4></div>
          <div className="provider-grid">
            {PROVIDERS.map((entry) => <button type="button" aria-label={entry.name} key={entry.id} className="provider-card" onClick={() => { setProvider(entry.id); setStep("access"); }}>
              <strong>{entry.name}</strong><span>{entry.detail}</span><small>{entry.verified}</small>
            </button>)}
          </div>
        </div>
      ) : null}

      {step === "access" ? (
        <div className="assistant-step">
          <div className="step-heading"><span>2 of 2</span><h4>Choose what {providerName} can do</h4></div>
          <div className="access-grid">
            {([
              ["explore", "Explore", "View, search, summarize, and identify missing information."],
              ["research_prepare", "Research and prepare", "Prepare frozen decision reviews and inspect the work needed before messages, schedules, or publication change."],
              ["operate_with_approval", "Operate with approval", "Use granted Course Check stages after review. Sends, calendars, publication, and integration effects remain separately controlled."],
            ] as const).map(([id, label, copy]) => <label className={`access-card ${accessProfile === id ? "selected" : ""}`} key={id}>
              <input type="radio" name="access-profile" value={id} checked={accessProfile === id} onChange={() => setAccessProfile(id)} />
              <span><strong>{label}{id === "research_prepare" ? " — recommended" : ""}</strong><small>{copy}</small></span>
            </label>)}
          </div>
          <div className="boundary-review">
            <div><strong>This connection can</strong><p>View this conference and prepare editable drafts or proposed changes.</p></div>
            <div><strong>ChartStead will ask before</strong><p>Final decisions, messages, calendar invitations, public release, or broad destructive actions.</p></div>
            <div><strong>This connection cannot</strong><p>Access other conferences, manage users or credentials, or bypass Course Check.</p></div>
          </div>
          <div className="settings-actions"><button type="button" className="btn btn-primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Connecting…" : "Allow and connect"}</button><button type="button" className="btn btn-ghost" onClick={() => setStep("provider")}>Back</button></div>
        </div>
      ) : null}

      {active && step !== "success" ? <div className="connection-handoff" role="status"><strong>{providerName} is ready to authorize</strong><p>Open the provider handoff and let the assistant exchange its one-time authorization. Return here after the assistant has read this conference. No bearer secret is displayed or copied.</p><div className="settings-actions">{active.authorizationUrl ? <a className="btn btn-primary" href={active.authorizationUrl} target="_blank" rel="noreferrer">Open secure handoff</a> : null}<button type="button" className="btn btn-secondary" disabled={testMutation.isPending} onClick={() => testMutation.mutate(active.id)}>{testMutation.isPending ? "Testing…" : "Test connection"}</button></div></div> : null}
      {step === "success" && active ? <div className="connection-success" role="status"><strong>{active.name} is connected</strong><p>It can research and prepare work for this conference. Important actions still require approval. No changes were made during the test.</p><div className="settings-actions">{providerDestination ? <a className="btn btn-primary" href={providerDestination} target="_blank" rel="noreferrer">Open {active.name}</a> : null}<button type="button" className="btn btn-secondary" onClick={() => setStep("overview")}>View connection</button></div></div> : null}
      {message ? <p className="form-message error" role="alert">{message}</p> : null}

      {(connectionsQuery.data?.connections.length ?? 0) > 0 ? <div className="connection-list"><h4>Existing connections</h4>{connectionsQuery.data?.connections.map(connection => <div className="connection-row" key={connection.id}><div><strong>{connection.name}</strong><span>Personal assistant · {connection.accessProfile === "research_prepare" ? "Research and prepare" : connection.accessProfile.replaceAll("_", " ")}</span></div><span className={`connection-status ${connection.status}`}>{connection.status === "connected" ? "Connected" : connection.status === "needs_sign_in" ? "Needs sign-in" : connection.status === "paused" ? "Paused" : "Connection not tested"}</span><div className="settings-actions">{connection.status === "connection_not_tested" || connection.status === "needs_sign_in" ? <a className="btn btn-secondary" href={`/api/v1/ai-connections/setup?connectionId=${encodeURIComponent(connection.id)}`} target="_blank" rel="noreferrer">{connection.status === "needs_sign_in" ? "Reconnect" : "Continue setup"}</a> : null}<button type="button" className="btn btn-ghost" onClick={() => revokeMutation.mutate(connection.id)}>Disconnect</button></div></div>)}</div> : null}
    </section>
  );
}

export function SettingsWorkspace({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formTone, setFormTone] = useState<"success" | "error">("success");
  const [developerOpen, setDeveloperOpen] = useState(false);

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
          <AiConnectionsCard eventId={eventId} />
          <section className="settings-card developer-access" aria-labelledby="developer-access-heading">
            <div className="settings-card-header"><div><h3 id="developer-access-heading">Developer access</h3><p className="muted">API keys, service credentials, webhooks, and custom automation. Use this only when your system cannot connect through the guided assistant flow.</p></div><button type="button" className="btn btn-secondary" onClick={() => setDeveloperOpen(current => !current)}>{developerOpen ? "Close developer access" : "Open developer access"}</button></div>
            {developerOpen ? <AgentApiKeysCard eventId={eventId} /> : null}
          </section>

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
