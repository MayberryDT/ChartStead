import { FormEvent, useState } from "react";

import type {
  OnboardingBoardSpeaker,
  SpeakerDirectoryCreateInput,
  SpeakerDirectoryIdentityMatch,
} from "../shared/events";
import {
  ApiError,
  createDirectorySpeaker,
  updateDirectorySpeaker,
} from "./api";

export type SpeakerDirectoryFilter =
  | "all"
  | "ready"
  | "outstanding"
  | "overdue"
  | "flagged";

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
    return true;
  });
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

const emptyAdd: SpeakerDirectoryCreateInput = {
  name: "",
  email: "",
  biography: "",
  titleSnapshot: "",
  organizationSnapshot: "",
  role: "invited",
};

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
  const [input, setInput] = useState<SpeakerDirectoryCreateInput>(emptyAdd);
  const [matches, setMatches] = useState<SpeakerDirectoryIdentityMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(overrides: Partial<SpeakerDirectoryCreateInput> = {}) {
    setPending(true);
    setError(null);
    try {
      const result = await createDirectorySpeaker(eventId, { ...input, ...overrides });
      setAdding(false);
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

  const countLabel =
    visibleCount === totalCount
      ? `${totalCount} speaker${totalCount === 1 ? "" : "s"}`
      : `${visibleCount} of ${totalCount} speakers`;

  return (
    <>
      <div className="speaker-directory-tools">
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
          <span>Readiness filter</span>
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
          </select>
        </label>
        <span className="speaker-directory-count" aria-live="polite">
          {countLabel}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setAdding((value) => !value);
            setMatches([]);
            setError(null);
          }}
        >
          {adding ? "Close add form" : "Add speaker"}
        </button>
      </div>

      {adding ? (
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
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
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
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await updateDirectorySpeaker(eventId, speaker.speakerId, {
        name,
        email,
        biography,
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
        </dl>
      )}
    </div>
  );
}
