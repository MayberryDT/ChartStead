import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";

import type {
  PortalMessage,
  PortalMessageStatus,
  PortalOnboardingTask,
  SpeakerPortalSession,
  SpeakerSocialLinks,
} from "../shared/events";
import { EMPTY_SPEAKER_SOCIAL_LINKS } from "../shared/speaker-profile";
import {
  fileMatchesOnboardingConstraints,
  formatFileSize,
} from "../shared/onboarding-tasks";
import {
  addPortalDeliverableComment,
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

function messageStatusLabel(status: PortalMessageStatus): string {
  switch (status) {
    case "draft":
      return "Preparing";
    case "queued":
      return "Queued";
    case "sent":
      return "Sending";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Needs attention";
    default:
      return status;
  }
}

function calendarOpLabel(message: PortalMessage): string | null {
  if (!message.calendar) return null;
  const op =
    message.calendar.operation === "create"
      ? "Invite"
      : message.calendar.operation === "update"
        ? "Update"
        : "Cancellation";
  const location = message.calendar.locationPending
    ? " · Location pending"
    : message.calendar.location
      ? ` · ${message.calendar.location}`
      : "";
  return `${op}${location}`;
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
  className = "btn btn-secondary btn-sm",
}: {
  label: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  className?: string;
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
        className={className}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} aria-hidden="true" />
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
  const [socialLinks, setSocialLinks] = useState<SpeakerSocialLinks>({
    ...EMPTY_SPEAKER_SOCIAL_LINKS,
  });
  const [profileSeeded, setProfileSeeded] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [taskMessage, setTaskMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [localHeadshotPreview, setLocalHeadshotPreview] = useState<string | null>(null);
  const localPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session.data || profileSeeded) return;
    setName(session.data.profile.name);
    setBiography(session.data.profile.biography);
    setSocialLinks(session.data.profile.socialLinks ?? { ...EMPTY_SPEAKER_SOCIAL_LINKS });
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
      socialLinks?: SpeakerSocialLinks;
      headshotAssetId?: string;
    }) => updateSpeakerPortalProfile(eventId, token, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["speaker-portal", eventId, token], data);
    },
    onError: (error) => {
      setProfileMessage({
        text: error instanceof ApiError ? error.message : "Save failed.",
        error: true,
      });
    },
  });

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileMessage(null);
    try {
      await saveProfile.mutateAsync({ name, biography, socialLinks });
      setProfileMessage({ text: "Profile saved." });
    } catch {
      // handled in onError
    }
  }

  async function onHeadshotChange(file: File | null) {
    if (!file) return;
    setProfileMessage(null);
    setHeadshotBusy(true);
    setLocalPreview(file);
    try {
      const assetId = await uploadPortalFile(eventId, token, "headshot", file);
      await saveProfile.mutateAsync({ headshotAssetId: assetId });
      setProfileMessage({ text: "Headshot updated." });
    } catch (error) {
      setLocalPreview(null);
      setProfileMessage({
        text: error instanceof ApiError ? error.message : "Headshot upload failed.",
        error: true,
      });
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
      setTaskMessage({ text: `Completed: ${task.title}` });
    } catch (error) {
      setTaskMessage({
        text: error instanceof ApiError ? error.message : "Could not complete task.",
        error: true,
      });
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onCompleteFile(task: PortalOnboardingTask, file: File | null) {
    if (!file) return;
    setTaskMessage(null);
    if (task.fileConstraints) {
      const validationError = fileMatchesOnboardingConstraints(file, task.fileConstraints);
      if (validationError) {
        setTaskMessage({ text: validationError, error: true });
        return;
      }
    }
    setBusyTaskId(task.id);
    try {
      const assetId = await uploadPortalFile(eventId, token, "task", file, task.id);
      const data = await completePortalTask(eventId, token, task.id, { assetId });
      queryClient.setQueryData(["speaker-portal", eventId, token], data);
      setTaskMessage({ text: `Uploaded for: ${task.title}` });
    } catch (error) {
      setTaskMessage({
        text: error instanceof ApiError ? error.message : "Upload failed.",
        error: true,
      });
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onAddDeliverableComment(assetId: string, event: FormEvent) {
    event.preventDefault();
    const body = (commentDrafts[assetId] ?? "").trim();
    if (!body) return;
    setTaskMessage(null);
    try {
      await addPortalDeliverableComment(eventId, token, assetId, body);
      setCommentDrafts((current) => ({ ...current, [assetId]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["speaker-portal", eventId, token] });
      setTaskMessage({ text: "Comment added." });
    } catch (error) {
      setTaskMessage({
        text: error instanceof ApiError ? error.message : "Could not add comment.",
        error: true,
      });
    }
  }

  if (session.isPending) {
    return (
      <main className="portal-shell" aria-busy="true">
        <div className="portal-container">
          <section className="portal-header-card">
            <p className="eyebrow">
              <ShieldCheck size={14} aria-hidden="true" /> Speaker portal
            </p>
            <h1>Opening your speaker portal…</h1>
            <p className="portal-welcome-text">Loading your accepted session and onboarding details.</p>
          </section>
        </div>
      </main>
    );
  }

  if (session.isError) {
    return (
      <main className="portal-shell">
        <div className="portal-container">
          <section className="error-panel" role="alert">
            <p className="eyebrow">
              <ShieldCheck size={14} aria-hidden="true" /> Private link
            </p>
            <h1>Portal link unavailable</h1>
            <p>{session.error.message}</p>
            <p className="portal-muted">Invalid, expired, or revoked links never expose speaker details.</p>
            <div style={{ marginTop: "20px" }}>
              <Link className="primary-action" to="/">
                Go to ChartStead
              </Link>
            </div>
          </section>
        </div>
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
      <div className="portal-container">
        {/* Header Hero Banner */}
        <header className="portal-header-card">
          <div className="portal-header-top">
            <p className="eyebrow">
              <ShieldCheck size={14} aria-hidden="true" /> Speaker portal
            </p>
            <span className="portal-status-box portal-status-box-success">
              <CheckCircle2 size={13} aria-hidden="true" /> {data.acceptanceState ?? "accepted"}
            </span>
          </div>
          <h1>{data.eventName}</h1>
          <p className="portal-welcome-text">
            Welcome, <strong>{name || data.profile.name}</strong>. Your acceptance state is{" "}
            <strong>{data.acceptanceState ?? "accepted"}</strong>. Use this private portal to manage your profile, session materials, onboarding tasks, and organizer communication.
          </p>
        </header>

        {/* Hero Quick Overview Metrics */}
        <section className="portal-hero-metrics" aria-label="Portal summary">
          <article className="portal-metric-card">
            <div className="portal-metric-header">
              <Calendar size={14} aria-hidden="true" />
              <span>Session</span>
            </div>
            {data.session ? (
              <>
                <p className="portal-metric-title">{data.session.title}</p>
                <p className="portal-metric-detail">
                  {data.session.format ? `${data.session.format.charAt(0).toUpperCase() + data.session.format.slice(1)}` : "Talk"} ·{" "}
                  {data.session.trackId ? `Track ${data.session.trackId}` : "Track TBD"} ·{" "}
                  {data.session.roomId ? `Room ${data.session.roomId}` : "Room TBD"} ·{" "}
                  {data.session.startsAt ? formatWhen(data.session.startsAt) : "Schedule TBD"}
                </p>
              </>
            ) : (
              <>
                <p className="portal-metric-title">Session assignment in progress</p>
                <p className="portal-metric-detail">Organizers will confirm room and scheduling details shortly.</p>
              </>
            )}
          </article>

          <article className="portal-metric-card">
            <div className="portal-metric-header">
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>Tasks</span>
            </div>
            <p className="portal-metric-title">
              {openTasks.length} open · {progress}% complete
            </p>
            <p className="portal-metric-detail">
              Next deadline: {formatWhen(data.nextDeadline)}
            </p>
          </article>

          <article className="portal-metric-card">
            <div className="portal-metric-header">
              <MessageSquare size={14} aria-hidden="true" />
              <span>Messages</span>
            </div>
            <p className="portal-metric-title">
              {data.messages?.length ?? 0}
            </p>
            <p className="portal-metric-detail">
              Independent of acceptance — a decision does not mean a message was sent.
            </p>
          </article>
        </section>

        {/* Main Content 2-Column Grid */}
        <div className="portal-content-grid">
          {/* Card 1: Speaker Profile Form */}
          <section className="portal-card" aria-labelledby="profile-title">
            <div className="portal-card-header">
              <h2 id="profile-title">Current profile</h2>
              <p>
                Living speaker identity. Event participation snapshot stays separate.
              </p>
            </div>

            <form className="portal-form" onSubmit={onSaveProfile}>
              <div className="portal-field">
                <label htmlFor="portal-name">Name</label>
                <input
                  id="portal-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div className="portal-field">
                <label htmlFor="portal-email">Email</label>
                <input id="portal-email" value={data.profile.email} disabled readOnly />
                <span className="portal-field-hint">Locked to your speaker invitation</span>
              </div>

              <div className="portal-field">
                <label htmlFor="portal-bio">Biography</label>
                <textarea
                  id="portal-bio"
                  value={biography}
                  onChange={(event) => setBiography(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Living biography"
                />
              </div>

              {/* Headshot Field */}
              <div className="portal-headshot-field">
                <label className="portal-field-label">Headshot</label>
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
                      <div className="portal-headshot-placeholder">
                        <User size={28} aria-hidden="true" />
                        <span>No headshot yet</span>
                      </div>
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
                      <span className="portal-headshot-filename">{data.profile.headshotFileName}</span>
                    ) : (
                      <span className="portal-field-hint">PNG, JPEG, or WebP</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Social / Professional Links */}
              <fieldset className="profile-social-links">
                <legend>Professional links</legend>
                <p>Use public HTTPS links only.</p>
                <div className="portal-social-grid">
                  <div className="portal-field">
                    <label htmlFor="portal-linkedin">LinkedIn URL</label>
                    <input
                      id="portal-linkedin"
                      type="url"
                      inputMode="url"
                      placeholder="https://linkedin.com/in/name"
                      value={socialLinks.linkedin}
                      onChange={(event) =>
                        setSocialLinks({ ...socialLinks, linkedin: event.target.value })
                      }
                      maxLength={500}
                    />
                  </div>

                  <div className="portal-field">
                    <label htmlFor="portal-x">X URL</label>
                    <input
                      id="portal-x"
                      type="url"
                      inputMode="url"
                      placeholder="https://x.com/name"
                      value={socialLinks.x}
                      onChange={(event) =>
                        setSocialLinks({ ...socialLinks, x: event.target.value })
                      }
                      maxLength={500}
                    />
                  </div>

                  <div className="portal-field">
                    <label htmlFor="portal-github">GitHub URL</label>
                    <input
                      id="portal-github"
                      type="url"
                      inputMode="url"
                      placeholder="https://github.com/name"
                      value={socialLinks.github}
                      onChange={(event) =>
                        setSocialLinks({ ...socialLinks, github: event.target.value })
                      }
                      maxLength={500}
                    />
                  </div>

                  <div className="portal-field">
                    <label htmlFor="portal-website">Website URL</label>
                    <input
                      id="portal-website"
                      type="url"
                      inputMode="url"
                      placeholder="https://example.com"
                      value={socialLinks.website}
                      onChange={(event) =>
                        setSocialLinks({ ...socialLinks, website: event.target.value })
                      }
                      maxLength={500}
                    />
                  </div>
                </div>
              </fieldset>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={saveProfile.isPending || headshotBusy}
                >
                  {saveProfile.isPending && !headshotBusy ? "Saving…" : "Save profile"}
                </button>
              </div>

              {profileMessage ? (
                <p
                  className="portal-form-message"
                  style={{
                    color: profileMessage.error ? "var(--error, #b91c1c)" : "var(--on-success-container, #087a4d)",
                    background: profileMessage.error ? "var(--error-container, #fdecea)" : "var(--success-container, #e9f8f1)",
                    borderColor: profileMessage.error ? "color-mix(in srgb, var(--error) 30%, transparent)" : "color-mix(in srgb, var(--on-success-container) 30%, transparent)",
                  }}
                  role="status"
                >
                  {profileMessage.text}
                </p>
              ) : null}
            </form>
          </section>

          {/* Card 2: Event Participation Snapshot */}
          <section className="portal-card" aria-labelledby="participation-title">
            <div className="portal-card-header">
              <h2 id="participation-title">This event</h2>
              <p>Snapshot captured for this event’s program history.</p>
            </div>

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
              <div>
                <dt>Proposal</dt>
                <dd>
                  {data.proposal ? (
                    <span>
                      <code>{data.proposal.id}</code> · {data.proposal.title}
                    </span>
                  ) : (
                    "Direct program placement"
                  )}
                </dd>
              </div>
              <div>
                <dt>Acceptance</dt>
                <dd>{data.acceptanceState ?? "accepted"}</dd>
              </div>
              <div>
                <dt>Session Track</dt>
                <dd>{data.session?.trackId ? data.session.trackId : "Track TBD"}</dd>
              </div>
              <div>
                <dt>Assigned Room</dt>
                <dd>{data.session?.roomId ? `Room ${data.session.roomId}` : "Room assignment in progress"}</dd>
              </div>
            </dl>
          </section>

          {/* Card 3: Onboarding Tasks & Deliverables (Full Width) */}
          <section className="portal-card portal-span" aria-labelledby="tasks-title">
            <div className="portal-card-header">
              <h2 id="tasks-title">Onboarding tasks</h2>
              <p>
                Complete these items before the deadlines to ensure your slides, AV requirements, and session details are ready for showtime.
              </p>
            </div>

            {taskMessage ? (
              <p
                className="portal-form-message"
                style={{
                  color: taskMessage.error ? "var(--error, #b91c1c)" : "var(--on-success-container, #087a4d)",
                  background: taskMessage.error ? "var(--error-container, #fdecea)" : "var(--success-container, #e9f8f1)",
                  borderColor: taskMessage.error ? "color-mix(in srgb, var(--error) 30%, transparent)" : "color-mix(in srgb, var(--on-success-container) 30%, transparent)",
                }}
                role="status"
              >
                {taskMessage.text}
              </p>
            ) : null}

            {openTasks.length === 0 ? (
              <p className="portal-muted">No open tasks right now.</p>
            ) : (
              <ul className="portal-task-list portal-task-list-active">
                {openTasks.map((task) => (
                  <li key={task.id} className="portal-task-item">
                    <div className="portal-task-content">
                      <strong className="portal-task-title">{task.title}</strong>
                      <span className="portal-task-meta">
                        Due {formatWhen(task.dueAt)}
                        {task.instructions ? ` · ${task.instructions}` : ""}
                      </span>

                      {task.completionRequirement === "file" && task.fileConstraints ? (
                        <p className="portal-file-constraints">
                          Accepted: {task.fileConstraints.acceptExtensions.join(", ")} · Max {formatFileSize(task.fileConstraints.maxBytes)}
                        </p>
                      ) : null}
                    </div>

                    <div className="portal-task-action">
                      {task.completionRequirement === "file" ? (
                        <PortalFileButton
                          label={busyTaskId === task.id ? "Uploading…" : "Upload file"}
                          accept={task.fileConstraints?.acceptExtensions.join(",")}
                          disabled={busyTaskId === task.id}
                          onFile={(file) => void onCompleteFile(task, file)}
                          className="btn btn-secondary btn-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyTaskId === task.id}
                          onClick={() => void onCompleteManual(task)}
                        >
                          <Check size={14} aria-hidden="true" />
                          {busyTaskId === task.id ? "Saving…" : "Mark complete"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {doneTasks.length > 0 ? (
              <details className="portal-history" open={openTasks.length === 0}>
                <summary>Completed history ({doneTasks.length})</summary>
                <ul className="portal-task-list">
                  {doneTasks.map((task) => (
                    <li key={task.id} className="portal-task-item portal-task-completed">
                      <div className="portal-task-content">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong className="portal-task-title">{task.title}</strong>
                          <span className="portal-status-box portal-status-box-success" style={{ fontSize: "10.5px", padding: "1px 6px" }}>
                            Completed
                          </span>
                        </div>
                        {task.asset ? (
                          <span className="portal-task-meta">
                            Attached file: <strong>{task.asset.fileName}</strong>
                          </span>
                        ) : null}
                        {task.asset && task.asset.mime.startsWith("image/") ? (
                          <div className="portal-task-thumb">
                            <img
                              src={portalAssetUrl(eventId, token, task.asset.assetId)}
                              alt={`${task.title} upload`}
                            />
                          </div>
                        ) : null}
                        {task.asset ? (
                          <details className="portal-deliverable-versions">
                            <summary>
                              Latest version v{task.asset.version} · {task.asset.versions.length} {task.asset.versions.length === 1 ? "version" : "versions"}
                            </summary>
                            <ol>
                              {task.asset.versions.map((version) => (
                                <li key={version.assetId} style={{ marginBottom: "12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                    <strong>
                                      Version {version.version}
                                      {version.isLatest ? " (latest)" : ""}
                                    </strong>
                                    <span className="portal-muted">
                                      {version.fileName} · {formatFileSize(version.size)} · uploaded {formatWhen(version.uploadedAt)}
                                    </span>
                                    <a
                                      className="btn btn-secondary btn-sm"
                                      style={{ textDecoration: "none" }}
                                      href={portalAssetUrl(eventId, token, version.assetId)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Download size={12} aria-hidden="true" /> Download
                                    </a>
                                  </div>

                                  {version.comments.length > 0 ? (
                                    <ul className="portal-deliverable-comments">
                                      {version.comments.map((comment) => (
                                        <li key={comment.id}>
                                          <strong>
                                            {comment.author.name} · {comment.author.role}
                                          </strong>
                                          <span className="portal-muted"> · {formatWhen(comment.createdAt)}</span>
                                          <p>{comment.body}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}

                                  <form
                                    onSubmit={(event) => void onAddDeliverableComment(version.assetId, event)}
                                    style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}
                                  >
                                    <label htmlFor={`comment-${version.assetId}`} style={{ fontSize: "12.5px" }}>
                                      Comment on version {version.version}
                                    </label>
                                    <textarea
                                      id={`comment-${version.assetId}`}
                                      rows={2}
                                      value={commentDrafts[version.assetId] ?? ""}
                                      onChange={(event) =>
                                        setCommentDrafts((current) => ({
                                          ...current,
                                          [version.assetId]: event.target.value,
                                        }))
                                      }
                                      placeholder="Write feedback, question, or note..."
                                    />
                                    <div>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        type="submit"
                                      >
                                        Add comment
                                      </button>
                                    </div>
                                  </form>
                                </li>
                              ))}
                            </ol>
                          </details>
                        ) : null}
                      </div>

                      {task.completionRequirement === "file" ? (
                        <div className="portal-task-action">
                          <PortalFileButton
                            label={busyTaskId === task.id ? "Uploading…" : "Replace file"}
                            accept={task.fileConstraints?.acceptExtensions.join(",")}
                            disabled={busyTaskId === task.id}
                            onFile={(file) => void onCompleteFile(task, file)}
                            className="btn btn-secondary btn-sm"
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          {/* Card 4: Messages & Calendar (Full Width) */}
          <section className="portal-card portal-span" aria-labelledby="messages-title">
            <div className="portal-card-header">
              <h2 id="messages-title">Messages &amp; calendar</h2>
              <p>
                Delivery state is separate from your acceptance. Drafts are not yet sent.
              </p>
            </div>

            {(data.messages ?? []).length === 0 ? (
              <p className="portal-muted">No organizer messages yet.</p>
            ) : (
              <ul className="portal-message-list">
                {(data.messages ?? []).map((message) => (
                  <li key={message.id} className="portal-message-item">
                    <div className="portal-message-main">
                      <strong className="portal-message-subject">{message.subject}</strong>
                      <span className={`portal-status-chip portal-status-${message.status}`}>
                        {messageStatusLabel(message.status)}
                      </span>
                    </div>
                    <p className="portal-message-meta">
                      {message.kind === "calendar_invite"
                        ? calendarOpLabel(message)
                        : "Message"}
                      {" · "}
                      {formatWhen(message.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Branded Footer */}
        <p className="portal-footer">Powered by ChartStead</p>
      </div>
    </main>
  );
}
