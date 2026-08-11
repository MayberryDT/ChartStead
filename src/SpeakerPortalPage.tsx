import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

import type { PortalOnboardingTask, SpeakerPortalSession } from "../shared/events";
import {
  ApiError,
  completePortalTask,
  fetchSpeakerPortalSession,
  putPortalUpload,
  startPortalUpload,
  updateSpeakerPortalProfile,
} from "./api";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function portalAssetUrl(eventId: string, token: string, assetId: string): string {
  return `/api/events/${eventId}/portal/assets/${assetId}?token=${encodeURIComponent(token)}`;
}

async function uploadPortalFile(
  eventId: string,
  token: string,
  purpose: "headshot" | "task",
  file: File,
  taskId?: string,
): Promise<string> {
  const session = await startPortalUpload(eventId, token, {
    purpose,
    taskId,
    fileName: file.name,
    mime: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  await putPortalUpload(session.uploadUrl, token, file);
  return session.assetId;
}

function PortalFileButton({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="portal-file-picker">
      <input
        ref={inputRef}
        id={inputId}
        className="portal-file-input"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          onFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
    </div>
  );
}

export function SpeakerPortalPage() {
  const { eventId, token } = useParams({ from: "/e/$eventId/portal/$token" });
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["speaker-portal", eventId, token],
    queryFn: () => fetchSpeakerPortalSession(eventId, token),
    retry: false,
  });

  const [name, setName] = useState("");
  const [biography, setBiography] = useState("");
  const [profileSeeded, setProfileSeeded] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [localHeadshotPreview, setLocalHeadshotPreview] = useState<string | null>(
    null,
  );
  const localPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session.data || profileSeeded) return;
    setName(session.data.profile.name);
    setBiography(session.data.profile.biography);
    setProfileSeeded(true);
  }, [session.data, profileSeeded]);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  function setLocalPreview(file: File | null) {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    if (!file) {
      setLocalHeadshotPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    localPreviewRef.current = url;
    setLocalHeadshotPreview(url);
  }

  const saveProfile = useMutation({
    mutationFn: async (patch: {
      biography?: string;
      name?: string;
      headshotAssetId?: string;
    }) => updateSpeakerPortalProfile(eventId, token, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["speaker-portal", eventId, token], data);
    },
    onError: (error) => {
      setProfileMessage(error instanceof ApiError ? error.message : "Save failed.");
    },
  });

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileMessage(null);
    try {
      await saveProfile.mutateAsync({ name, biography });
      setProfileMessage("Profile saved.");
    } catch {
      // message set in onError
    }
  }

  async function onHeadshotChange(file: File | null) {
    if (!file) return;
    setProfileMessage(null);
    setHeadshotBusy(true);
    setLocalPreview(file);
    try {
      const assetId = await uploadPortalFile(eventId, token, "headshot", file);
      // Keep in-progress name/bio drafts; only attach the headshot.
      await saveProfile.mutateAsync({ headshotAssetId: assetId });
      setProfileMessage("Headshot updated.");
    } catch (error) {
      setLocalPreview(null);
      setProfileMessage(
        error instanceof ApiError ? error.message : "Headshot upload failed.",
      );
    } finally {
      setHeadshotBusy(false);
    }
  }

  async function onCompleteManual(task: PortalOnboardingTask) {
    setTaskMessage(null);
    setBusyTaskId(task.id);
    try {
      const data = await completePortalTask(eventId, token, task.id);
      queryClient.setQueryData(["speaker-portal", eventId, token], data);
      setTaskMessage(`Completed: ${task.title}`);
    } catch (error) {
      setTaskMessage(error instanceof ApiError ? error.message : "Could not complete task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onCompleteFile(task: PortalOnboardingTask, file: File | null) {
    if (!file) return;
    setTaskMessage(null);
    setBusyTaskId(task.id);
    try {
      const assetId = await uploadPortalFile(eventId, token, "task", file, task.id);
      const data = await completePortalTask(eventId, token, task.id, { assetId });
      queryClient.setQueryData(["speaker-portal", eventId, token], data);
      setTaskMessage(`Uploaded for: ${task.title}`);
    } catch (error) {
      setTaskMessage(error instanceof ApiError ? error.message : "Upload failed.");
    } finally {
      setBusyTaskId(null);
    }
  }

  if (session.isPending) {
    return (
      <main className="portal-shell" aria-busy="true">
        <p>Opening your speaker portal…</p>
      </main>
    );
  }

  if (session.isError) {
    return (
      <main className="portal-shell">
        <section className="error-panel" role="alert">
          <h1>Portal link unavailable</h1>
          <p>{session.error.message}</p>
          <p>Invalid, expired, or revoked links never expose speaker details.</p>
          <Link className="primary-action" to="/">
            Go to ChartStead
          </Link>
        </section>
      </main>
    );
  }

  const data = session.data as SpeakerPortalSession;
  const openTasks = data.tasks.filter((task) => task.status === "open");
  const doneTasks = data.tasks.filter((task) => task.status !== "open");
  const progress =
    data.tasks.length === 0
      ? 100
      : Math.round((doneTasks.length / data.tasks.length) * 100);
  const headshotPreview =
    localHeadshotPreview ??
    (data.profile.headshotAssetId
      ? portalAssetUrl(eventId, token, data.profile.headshotAssetId)
      : null);

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="eyebrow">Speaker portal</p>
        <h1>{data.eventName}</h1>
        <p>
          Welcome, {name || data.profile.name}. Your acceptance state is{" "}
          <strong>{data.acceptanceState ?? "pending"}</strong>.
        </p>
      </header>

      <section className="portal-summary" aria-label="Portal summary">
        <article className="portal-card">
          <h2>Tasks</h2>
          <p className="portal-metric">
            {openTasks.length} open · {progress}% complete
          </p>
          <p className="portal-muted">
            Next deadline: {formatWhen(data.nextDeadline)}
          </p>
        </article>
        <article className="portal-card">
          <h2>Acceptance</h2>
          <p className="portal-metric">{data.acceptanceState ?? "—"}</p>
          {data.proposal ? (
            <p className="portal-muted">
              {data.proposal.id} · {data.proposal.title}
            </p>
          ) : (
            <p className="portal-muted">Direct program placement</p>
          )}
        </article>
        <article className="portal-card">
          <h2>Session</h2>
          {data.session ? (
            <>
              <p className="portal-metric">{data.session.title}</p>
              <p className="portal-muted">
                {data.session.format || "Session"} ·{" "}
                {formatWhen(data.session.startsAt)} ·{" "}
                {data.session.roomId ? `Room ${data.session.roomId}` : "Room TBD"}
              </p>
            </>
          ) : (
            <p className="portal-muted">No session yet</p>
          )}
        </article>
      </section>

      <div className="portal-grid">
        <section className="portal-card" aria-labelledby="profile-title">
          <h2 id="profile-title">Current profile</h2>
          <p className="portal-muted">
            Living speaker identity. Event participation snapshot stays separate.
          </p>
          <form className="portal-form" onSubmit={onSaveProfile}>
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <label>
              Email
              <input value={data.profile.email} disabled readOnly />
            </label>
            <label>
              Biography
              <textarea
                value={biography}
                onChange={(event) => setBiography(event.target.value)}
                rows={5}
                maxLength={2000}
              />
            </label>
            <div className="portal-headshot-field">
              <span className="portal-field-label">Headshot</span>
              <div className="portal-headshot-row">
                <div className="portal-headshot-preview" aria-live="polite">
                  {headshotPreview ? (
                    <img
                      src={headshotPreview}
                      alt={
                        data.profile.headshotFileName
                          ? `Headshot preview: ${data.profile.headshotFileName}`
                          : "Headshot preview"
                      }
                    />
                  ) : (
                    <span className="portal-muted">No headshot yet</span>
                  )}
                </div>
                <div className="portal-headshot-actions">
                  <PortalFileButton
                    label={
                      headshotBusy
                        ? "Uploading…"
                        : data.profile.headshotAssetId
                          ? "Replace headshot"
                          : "Choose headshot"
                    }
                    accept="image/png,image/jpeg,image/webp"
                    disabled={headshotBusy || saveProfile.isPending}
                    onFile={(file) => void onHeadshotChange(file)}
                  />
                  {data.profile.headshotFileName ? (
                    <p className="portal-muted">{data.profile.headshotFileName}</p>
                  ) : (
                    <p className="portal-muted">PNG, JPEG, or WebP</p>
                  )}
                </div>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending && !headshotBusy ? "Saving…" : "Save profile"}
            </button>
            {profileMessage ? <p className="portal-form-message">{profileMessage}</p> : null}
          </form>
        </section>

        <section className="portal-card" aria-labelledby="participation-title">
          <h2 id="participation-title">This event</h2>
          <p className="portal-muted">
            Snapshot captured for this event’s program history.
          </p>
          <dl className="portal-dl">
            <div>
              <dt>Role</dt>
              <dd>{data.participation.role}</dd>
            </div>
            <div>
              <dt>Title at event</dt>
              <dd>{data.participation.titleAtEvent || "—"}</dd>
            </div>
            <div>
              <dt>Organization at event</dt>
              <dd>{data.participation.organizationAtEvent || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="portal-card portal-span" aria-labelledby="tasks-title">
          <h2 id="tasks-title">Onboarding tasks</h2>
          {taskMessage ? <p className="portal-form-message">{taskMessage}</p> : null}
          {openTasks.length === 0 ? (
            <p className="portal-muted">No open tasks right now.</p>
          ) : (
            <ul className="portal-task-list portal-task-list-active">
              {openTasks.map((task) => (
                <li key={task.id}>
                  <div className="portal-task-main">
                    <strong>{task.title}</strong>
                    <span className="portal-muted">
                      {" "}
                      · due {formatWhen(task.dueAt)}
                      {task.instructions ? ` · ${task.instructions}` : ""}
                    </span>
                    {task.completionRequirement === "file" ? (
                      <PortalFileButton
                        label={busyTaskId === task.id ? "Uploading…" : "Upload file"}
                        disabled={busyTaskId === task.id}
                        onFile={(file) => void onCompleteFile(task, file)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyTaskId === task.id}
                        onClick={() => void onCompleteManual(task)}
                      >
                        {busyTaskId === task.id ? "Saving…" : "Mark complete"}
                      </button>
                    )}
                  </div>
                  <span className="portal-muted portal-task-status">{task.status}</span>
                </li>
              ))}
            </ul>
          )}
          {doneTasks.length > 0 ? (
            <details className="portal-history" open={openTasks.length === 0}>
              <summary>Completed history ({doneTasks.length})</summary>
              <ul className="portal-task-list">
                {doneTasks.map((task) => (
                  <li key={task.id}>
                    <div className="portal-task-main">
                      <strong>{task.title}</strong>
                      {task.asset ? (
                        <span className="portal-muted"> · {task.asset.fileName}</span>
                      ) : null}
                      {task.asset && task.asset.mime.startsWith("image/") ? (
                        <div className="portal-task-thumb">
                          <img
                            src={portalAssetUrl(eventId, token, task.asset.assetId)}
                            alt={`${task.title} upload`}
                          />
                        </div>
                      ) : null}
                      {task.completionRequirement === "file" ? (
                        <PortalFileButton
                          label={busyTaskId === task.id ? "Uploading…" : "Replace file"}
                          disabled={busyTaskId === task.id}
                          onFile={(file) => void onCompleteFile(task, file)}
                        />
                      ) : null}
                    </div>
                    <span className="portal-muted portal-task-status">{task.status}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>

      <p className="portal-footer">Powered by ChartStead</p>
    </main>
  );
}
