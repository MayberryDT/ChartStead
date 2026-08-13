import { FormEvent, useEffect, useRef, useState } from "react";

import type {
  OnboardingBoardSpeaker,
  SpeakerDirectoryCreateInput,
  SpeakerDirectoryIdentityMatch,
  SpeakerSocialLinks,
  SpeakerWorkflowStatus,
} from "../shared/events";
import { EMPTY_SPEAKER_SOCIAL_LINKS } from "../shared/speaker-profile";
import {
  ApiError,
  createDirectorySpeaker,
  uploadDirectorySpeakerHeadshot,
  updateDirectorySpeaker,
  updateSpeakerParticipation,
} from "./api";

export type SpeakerDirectoryFilter =
  | "all"
  | "ready"
  | "outstanding"
  | "overdue"
  | "flagged"
  | SpeakerWorkflowStatus;

export const speakerWorkflowLabels: Record<SpeakerWorkflowStatus, string> = {
  invited: "Invited",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  withdrawn: "Withdrawn",
};

export function filterDirectorySpeakers(
  speakers: OnboardingBoardSpeaker[],
  search: string,
  filter: SpeakerDirectoryFilter,
): OnboardingBoardSpeaker[] {
  const query = search.trim().toLocaleLowerCase();
  return speakers.filter((speaker) => {
    const matchesQuery =
      !query ||
      speaker.name.toLocaleLowerCase().includes(query) ||
      speaker.email.toLocaleLowerCase().includes(query);
    if (!matchesQuery) return false;
    if (filter === "ready") return speaker.openTaskCount === 0;
    if (filter === "outstanding") return speaker.openTaskCount > 0;
    if (filter === "overdue") return speaker.overdueCount > 0;
    if (filter === "flagged") return speaker.readinessFlags.length > 0;
    if (filter !== "all") return speaker.workflowStatus === filter;
    return true;
  });
}

interface DirectoryControlsProps {
  search: string;
  filter: SpeakerDirectoryFilter;
  visibleCount: number;
  totalCount: number;
  addOpen: boolean;
  importOpen?: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: SpeakerDirectoryFilter) => void;
  onToggleAdd: () => void;
  onToggleImport?: () => void;
}

interface DirectoryToolbarProps {
  eventId: string;
  search: string;
  filter: SpeakerDirectoryFilter;
  visibleCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: SpeakerDirectoryFilter) => void;
  onChanged: (speakerId?: string) => Promise<void>;
  onMessage: (message: string, tone?: "success" | "error") => void;
}

interface DirectoryAddPanelProps {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onChanged: (speakerId?: string) => Promise<void>;
  onMessage: (message: string, tone?: "success" | "error") => void;
}

const emptyAdd: SpeakerDirectoryCreateInput = {
  name: "",
  email: "",
  biography: "",
  titleSnapshot: "",
  organizationSnapshot: "",
  role: "invited",
};

export function SpeakerDirectoryControls({
  search,
  filter,
  visibleCount,
  totalCount,
  addOpen,
  importOpen = false,
  onSearchChange,
  onFilterChange,
  onToggleAdd,
  onToggleImport,
}: DirectoryControlsProps) {
  const countLabel =
    visibleCount === totalCount
      ? `${totalCount} speaker${totalCount === 1 ? "" : "s"}`
      : `${visibleCount} of ${totalCount} speakers`;

  return (
    <div
      className="speaker-directory-tools"
      role="toolbar"
      aria-label="Speaker directory controls"
    >
      <label className="speaker-directory-search">
        <span>Search speakers</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Name or email"
        />
      </label>
      <label>
        <span>Directory filter</span>
        <select
          value={filter}
          onChange={(event) =>
            onFilterChange(event.target.value as SpeakerDirectoryFilter)
          }
        >
          <option value="all">All speakers</option>
          <option value="ready">Ready — no open work</option>
          <option value="outstanding">Outstanding work</option>
          <option value="overdue">Overdue work</option>
          <option value="flagged">Readiness flags</option>
          <optgroup label="Workflow status">
            {Object.entries(speakerWorkflowLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <span className="speaker-directory-count" aria-live="polite">
        {countLabel}
      </span>
      <button type="button" className="btn btn-primary" onClick={onToggleAdd}>
        {addOpen ? "Close add form" : "Add speaker"}
      </button>
      {onToggleImport ? (
        <button type="button" className="btn btn-secondary" onClick={onToggleImport}>
          {importOpen ? "Close CSV import" : "Import CSV"}
        </button>
      ) : null}
    </div>
  );
}

export function SpeakerDirectoryAddPanel({
  eventId,
  open,
  onClose,
  onChanged,
  onMessage,
}: DirectoryAddPanelProps) {
  const [input, setInput] = useState<SpeakerDirectoryCreateInput>(emptyAdd);
  const [matches, setMatches] = useState<SpeakerDirectoryIdentityMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMatches([]);
    setError(null);
  }, [open]);

  async function submit(overrides: Partial<SpeakerDirectoryCreateInput> = {}) {
    setPending(true);
    setError(null);
    try {
      const result = await createDirectorySpeaker(eventId, { ...input, ...overrides });
      onClose();
      setMatches([]);
      setInput(emptyAdd);
      onMessage(
        result.reused
          ? "Existing speaker identity linked to this event. No session was created."
          : "Speaker added to this event. No session was created.",
      );
      await onChanged(result.speaker.speakerId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const body = cause.body as {
          matches?: SpeakerDirectoryIdentityMatch[];
        } | undefined;
        setMatches(body?.matches ?? []);
      }
      setError(cause instanceof ApiError ? cause.message : "Could not add speaker.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  if (!open) return null;

  return (
    <form className="speaker-directory-form" aria-label="Add speaker" onSubmit={onSubmit}>
      <div className="speaker-directory-form-head">
        <div>
          <h3>Add event speaker</h3>
          <p>
            This creates an identity and event participation only. Link a direct or
            guaranteed-speaker session through Course Check.
          </p>
        </div>
      </div>
      <div className="speaker-directory-form-grid">
        <label>
          Name
          <input
            required
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={input.email}
            onChange={(event) => setInput({ ...input, email: event.target.value })}
          />
        </label>
        <label>
          Title at this event
          <input
            required
            value={input.titleSnapshot}
            onChange={(event) =>
              setInput({ ...input, titleSnapshot: event.target.value })
            }
          />
        </label>
        <label>
          Organization at this event
          <input
            required
            value={input.organizationSnapshot}
            onChange={(event) =>
              setInput({ ...input, organizationSnapshot: event.target.value })
            }
          />
        </label>
        <label>
          Event role
          <select
            value={input.role}
            onChange={(event) => setInput({ ...input, role: event.target.value })}
          >
            <option value="invited">Invited speaker</option>
            <option value="primary">Primary speaker</option>
            <option value="co">Co-speaker</option>
          </select>
        </label>
        <label className="speaker-directory-bio">
          Biography
          <textarea
            rows={3}
            value={input.biography}
            onChange={(event) =>
              setInput({ ...input, biography: event.target.value })
            }
          />
        </label>
      </div>
      {error ? <p className="form-message" data-tone="error">{error}</p> : null}
      {matches.length > 0 ? (
        <div className="speaker-identity-choice">
          <strong>Matching speaker identity</strong>
          <p>Choose deliberately whether to reuse a current identity.</p>
          <ul>
            {matches.map((match) => (
              <li key={match.speakerId}>
                <span>
                  <strong>{match.name}</strong> · {match.email} · matched by {match.signal}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() => void submit({ reuseSpeakerId: match.speakerId })}
                >
                  Reuse {match.name}
                </button>
              </li>
            ))}
          </ul>
          {matches.every((match) => match.signal !== "email") ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => void submit({ createNewIdentity: true })}
            >
              Create a separate identity
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="onboarding-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Check and add"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SpeakerDirectoryToolbar({
  eventId,
  search,
  filter,
  visibleCount,
  totalCount,
  onSearchChange,
  onFilterChange,
  onChanged,
  onMessage,
}: DirectoryToolbarProps) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <SpeakerDirectoryControls
        search={search}
        filter={filter}
        visibleCount={visibleCount}
        totalCount={totalCount}
        addOpen={adding}
        onSearchChange={onSearchChange}
        onFilterChange={onFilterChange}
        onToggleAdd={() => setAdding((value) => !value)}
      />
      <SpeakerDirectoryAddPanel
        eventId={eventId}
        open={adding}
        onClose={() => setAdding(false)}
        onChanged={onChanged}
        onMessage={onMessage}
      />
    </>
  );
}

export function SpeakerCurrentProfile({
  eventId,
  speaker,
  onChanged,
  onMessage,
}: {
  eventId: string;
  speaker: OnboardingBoardSpeaker;
  onChanged: () => Promise<void>;
  onMessage: (message: string, tone?: "success" | "error") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(speaker.name);
  const [email, setEmail] = useState(speaker.email);
  const [biography, setBiography] = useState(speaker.biography);
  const [socialLinks, setSocialLinks] = useState<SpeakerSocialLinks>(
    speaker.socialLinks ?? { ...EMPTY_SPEAKER_SOCIAL_LINKS },
  );
  const [pending, setPending] = useState(false);
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [localHeadshotPreview, setLocalHeadshotPreview] = useState<string | null>(null);
  const localPreviewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    },
    [],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await updateDirectorySpeaker(eventId, speaker.speakerId, {
        name,
        email,
        biography,
        socialLinks,
      });
      setEditing(false);
      onMessage("Current speaker profile updated. Event-time details were preserved.");
      await onChanged();
    } catch (cause) {
      onMessage(
        cause instanceof ApiError ? cause.message : "Could not update speaker.",
        "error",
      );
    } finally {
      setPending(false);
    }
  }

  async function onHeadshotChange(file: File | null) {
    if (!file) return;
    setHeadshotBusy(true);
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    localPreviewRef.current = URL.createObjectURL(file);
    setLocalHeadshotPreview(localPreviewRef.current);
    try {
      const headshotAssetId = await uploadDirectorySpeakerHeadshot(eventId, speaker.speakerId, file);
      await updateDirectorySpeaker(eventId, speaker.speakerId, { headshotAssetId });
      onMessage("Current speaker headshot updated.");
      await onChanged();
    } catch (cause) {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
      setLocalHeadshotPreview(null);
      onMessage(cause instanceof ApiError ? cause.message : "Could not upload headshot.", "error");
    } finally {
      setHeadshotBusy(false);
    }
  }

  const headshotPreview =
    localHeadshotPreview ??
    (speaker.headshotAssetId
      ? `/api/events/${eventId}/speakers/${speaker.speakerId}/headshot?asset=${encodeURIComponent(speaker.headshotAssetId)}`
      : null);
  const profileLinks = Object.entries(speaker.socialLinks ?? {}).filter(([, value]) => Boolean(value));

  return (
    <div className="onboarding-card">
      <div className="onboarding-card-head">
        <h3>Current profile</h3>
        {!editing ? (
          <button
            type="button"
            className="btn btn-ghost speaker-profile-edit"
            onClick={() => {
              setName(speaker.name);
              setEmail(speaker.email);
              setBiography(speaker.biography);
              setSocialLinks(speaker.socialLinks ?? { ...EMPTY_SPEAKER_SOCIAL_LINKS });
              setEditing(true);
            }}
          >
            Edit current profile
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="onboarding-form" aria-label="Edit current profile" onSubmit={onSubmit}>
          <p className="speaker-snapshot-note">
            Event-time snapshot: <strong>{speaker.titleSnapshot} · {speaker.organizationSnapshot}</strong>.
            These preserved details will not change.
          </p>
          <label>
            Name
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Email
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
            <label>
              Biography
              <textarea rows={4} value={biography} onChange={(event) => setBiography(event.target.value)} />
            </label>
            <fieldset className="profile-social-links">
              <legend>Professional links</legend>
              <p>Only public HTTPS links are accepted.</p>
              <label>
                LinkedIn URL
                <input
                  type="url"
                  value={socialLinks.linkedin}
                  onChange={(event) =>
                    setSocialLinks({ ...socialLinks, linkedin: event.target.value })
                  }
                  maxLength={500}
                />
              </label>
              <label>
                X URL
                <input
                  type="url"
                  value={socialLinks.x}
                  onChange={(event) => setSocialLinks({ ...socialLinks, x: event.target.value })}
                  maxLength={500}
                />
              </label>
              <label>
                GitHub URL
                <input
                  type="url"
                  value={socialLinks.github}
                  onChange={(event) =>
                    setSocialLinks({ ...socialLinks, github: event.target.value })
                  }
                  maxLength={500}
                />
              </label>
              <label>
                Website URL
                <input
                  type="url"
                  value={socialLinks.website}
                  onChange={(event) =>
                    setSocialLinks({ ...socialLinks, website: event.target.value })
                  }
                  maxLength={500}
                />
              </label>
            </fieldset>
            <div className="speaker-profile-headshot">
              <span>Headshot</span>
              <div className="portal-headshot-row">
                <div className="portal-headshot-preview" aria-live="polite">
                  {headshotPreview ? <img src={headshotPreview} alt="Current speaker headshot" /> : <span>No headshot yet</span>}
                </div>
                <label className="speaker-profile-upload">
                  <span>{headshotBusy ? "Uploading headshot…" : "Replace headshot"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={headshotBusy || pending}
                    onChange={(event) => void onHeadshotChange(event.target.files?.[0] ?? null)}
                  />
                  <small>PNG, JPEG, or WebP. Up to 5 MB.</small>
                </label>
              </div>
            </div>
          <div className="onboarding-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="speaker-profile-summary">
          <div><dt>Email</dt><dd>{speaker.email}</dd></div>
          <div><dt>Event-time details</dt><dd>{speaker.titleSnapshot} · {speaker.organizationSnapshot}</dd></div>
          <div><dt>Biography</dt><dd>{speaker.biography || "Not provided"}</dd></div>
          <div>
            <dt>Professional links</dt>
            <dd>
              {profileLinks.length > 0 ? (
                <ul className="speaker-profile-links">
                  {profileLinks.map(([label, url]) => (
                    <li key={label}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>
                  ))}
                </ul>
              ) : "Not provided"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const workflowStatuses = Object.keys(speakerWorkflowLabels) as SpeakerWorkflowStatus[];

export function SpeakerParticipation({
  eventId,
  speaker,
  onChanged,
  onMessage,
}: {
  eventId: string;
  speaker: OnboardingBoardSpeaker;
  onChanged: () => Promise<void>;
  onMessage: (message: string, tone?: "success" | "error") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<SpeakerWorkflowStatus>(
    speaker.workflowStatus,
  );
  const [travelPreferences, setTravelPreferences] = useState(speaker.travelPreferences);
  const [logisticsText, setLogisticsText] = useState(
    Object.entries(speaker.logistics)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n"),
  );
  const [pending, setPending] = useState(false);

  function startEditing() {
    setWorkflowStatus(speaker.workflowStatus);
    setTravelPreferences(speaker.travelPreferences);
    setLogisticsText(
      Object.entries(speaker.logistics)
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n"),
    );
    setEditing(true);
  }

  function parseLogistics(): Record<string, string> | null {
    const entries: Array<[string, string]> = [];
    for (const line of logisticsText.split("\n")) {
      if (!line.trim()) continue;
      const separator = line.indexOf(":");
      if (separator < 1 || !line.slice(separator + 1).trim()) return null;
      entries.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
    }
    return Object.fromEntries(entries);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const logistics = parseLogistics();
    if (!logistics) {
      onMessage("Use one logistics field per line in the form Label: value.", "error");
      return;
    }
    setPending(true);
    try {
      await updateSpeakerParticipation(eventId, speaker.speakerId, {
        workflowStatus,
        travelPreferences,
        logistics,
      });
      setEditing(false);
      onMessage("Event participation saved. Current identity profile was not changed.");
      await onChanged();
    } catch (cause) {
      onMessage(
        cause instanceof ApiError ? cause.message : "Could not update event participation.",
        "error",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="onboarding-card">
      <div className="onboarding-card-head">
        <h3>Event participation</h3>
        {!editing ? (
          <button type="button" className="btn btn-ghost speaker-profile-edit" onClick={startEditing}>
            Edit event details
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="onboarding-form" aria-label="Edit event participation" onSubmit={onSubmit}>
          <p className="speaker-snapshot-note">
            These event-specific details do not change the current speaker profile.
          </p>
          <label>
            Workflow status
            <select
              value={workflowStatus}
              onChange={(event) => setWorkflowStatus(event.target.value as SpeakerWorkflowStatus)}
            >
              {workflowStatuses.map((status) => (
                <option key={status} value={status}>
                  {speakerWorkflowLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Travel preferences
            <textarea
              rows={3}
              value={travelPreferences}
              onChange={(event) => setTravelPreferences(event.target.value)}
            />
          </label>
          <label>
            Logistics fields
            <textarea
              rows={4}
              value={logisticsText}
              onChange={(event) => setLogisticsText(event.target.value)}
              placeholder={"Arrival: Tuesday after 3pm\nHotel: 2 nights"}
            />
          </label>
          <p className="muted-line">One field per line: Label: value.</p>
          <div className="onboarding-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save event details"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="speaker-profile-summary">
          <div><dt>Workflow</dt><dd>{speakerWorkflowLabels[speaker.workflowStatus]}</dd></div>
          <div><dt>Travel</dt><dd>{speaker.travelPreferences || "Not recorded"}</dd></div>
          <div>
            <dt>Logistics</dt>
            <dd>
              {Object.keys(speaker.logistics).length === 0
                ? "Not recorded"
                : Object.entries(speaker.logistics)
                    .map(([label, value]) => `${label}: ${value}`)
                    .join(" · ")}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
