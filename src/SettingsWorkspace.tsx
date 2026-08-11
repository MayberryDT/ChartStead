import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import type { AirtableSyncHealth, AirtableSyncState } from "../shared/airtable";
import {
  ApiError,
  connectAirtableSync,
  disconnectAirtableSync,
  fetchAirtableSync,
  pullAirtableSync,
} from "./api";

/** Must match worker/airtable/demo-sandbox.ts */
const DEMO_BASE_ID = "appChartSteadDemo";
const DEMO_TOKEN = "pat_demo_sandbox";

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
