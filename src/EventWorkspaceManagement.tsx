import { useMutation } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import type { EventRecord } from "../shared/events";
import {
  ApiError,
  createEventWorkspace,
  updateEventConfiguration,
} from "./api";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function CreateEventDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (event: EventRecord) => void;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [timezone, setTimezone] = useState("America/Denver");

  const create = useMutation({
    mutationFn: () =>
      createEventWorkspace({ id, name, startsOn, endsOn, timezone }),
    onSuccess: (event) => {
      onCreated(event);
      setName("");
      setId("");
      setIdEdited(false);
      setStartsOn("");
      setEndsOn("");
      setTimezone("America/Denver");
    },
  });

  if (!open) return null;

  return (
    <div className="event-dialog-backdrop">
      <section
        className="event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-event-title"
      >
        <div className="event-dialog-heading">
          <div>
            <p className="eyebrow">New workspace</p>
            <h2 id="create-event-title">Create event</h2>
            <p>Establish the event first. Tracks and rooms can be configured next.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        <form
          className="event-create-form"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            create.mutate();
          }}
        >
          <label className="settings-label">
            Event name
            <input
              className="settings-input"
              value={name}
              required
              autoFocus
              onChange={(change) => {
                setName(change.target.value);
                if (!idEdited) setId(slugify(change.target.value));
              }}
            />
          </label>
          <label className="settings-label">
            Event identifier
            <input
              className="settings-input"
              value={id}
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={(change) => {
                setIdEdited(true);
                setId(change.target.value);
              }}
            />
            <span className="field-help">Permanent URL identifier; lowercase letters, numbers, and hyphens.</span>
          </label>
          <div className="event-create-dates">
            <label className="settings-label">
              Start date
              <input
                className="settings-input"
                type="date"
                value={startsOn}
                required
                onChange={(change) => setStartsOn(change.target.value)}
              />
            </label>
            <label className="settings-label">
              End date
              <input
                className="settings-input"
                type="date"
                value={endsOn}
                required
                onChange={(change) => setEndsOn(change.target.value)}
              />
            </label>
          </div>
          <label className="settings-label">
            Timezone
            <select
              className="settings-input"
              value={timezone}
              onChange={(change) => setTimezone(change.target.value)}
            >
              {TIMEZONES.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {create.isError ? (
            <p className="form-message error" role="alert">
              {errorMessage(create.error, "Unable to create event workspace.")}
            </p>
          ) : null}
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function EventConfigurationCard({
  event,
  onUpdated,
}: {
  event: EventRecord;
  onUpdated: (event: EventRecord) => void;
}) {
  const [name, setName] = useState(event.name);
  const [startsOn, setStartsOn] = useState(event.startsOn);
  const [endsOn, setEndsOn] = useState(event.endsOn);
  const [timezone, setTimezone] = useState(event.timezone);
  const [tracks, setTracks] = useState(event.tracks);
  const [rooms, setRooms] = useState(event.rooms);
  const [newTrackName, setNewTrackName] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(event.name);
    setStartsOn(event.startsOn);
    setEndsOn(event.endsOn);
    setTimezone(event.timezone);
    setTracks(event.tracks);
    setRooms(event.rooms);
  }, [event]);

  const save = useMutation({
    mutationFn: () =>
      updateEventConfiguration(event.id, {
        name,
        startsOn,
        endsOn,
        timezone,
        tracks: tracks.map(({ id, name: trackName }) => ({ id, name: trackName })),
        rooms,
      }),
    onSuccess: (updated) => {
      setMessage("Event configuration saved.");
      onUpdated(updated);
    },
    onError: (error) => {
      setMessage(errorMessage(error, "Unable to save event configuration."));
    },
  });

  function addTrack() {
    const id = slugify(newTrackName);
    if (!id) return;
    if (tracks.some((track) => track.id === id)) {
      setMessage(`Track identifier “${id}” is already in use.`);
      return;
    }
    setTracks([...tracks, { id, name: newTrackName.trim(), proposalCount: 0 }]);
    setNewTrackName("");
    setMessage(null);
  }

  function addRoom() {
    const id = slugify(newRoomName);
    if (!id) return;
    if (rooms.some((room) => room.id === id)) {
      setMessage(`Room identifier “${id}” is already in use.`);
      return;
    }
    setRooms([...rooms, { id, name: newRoomName.trim(), readiness: "ready" }]);
    setNewRoomName("");
    setMessage(null);
  }

  return (
    <section className="settings-card event-configuration-card" aria-labelledby="event-configuration-heading">
      <div className="settings-card-header">
        <div>
          <h2 id="event-configuration-heading">Event configuration</h2>
          <p className="muted">
            Dates and timezone drive the workspace. Permanent identifiers keep links stable.
          </p>
        </div>
        <code>{event.id}</code>
      </div>
      <form
        className="settings-form"
        onSubmit={(formEvent: FormEvent) => {
          formEvent.preventDefault();
          setMessage(null);
          save.mutate();
        }}
      >
        <div className="event-config-details">
          <label className="settings-label">
            Event name
            <input className="settings-input" value={name} onChange={(change) => setName(change.target.value)} />
          </label>
          <label className="settings-label">
            Start date
            <input className="settings-input" type="date" value={startsOn} onChange={(change) => setStartsOn(change.target.value)} />
          </label>
          <label className="settings-label">
            End date
            <input className="settings-input" type="date" value={endsOn} onChange={(change) => setEndsOn(change.target.value)} />
          </label>
          <label className="settings-label">
            Timezone
            <select className="settings-input" value={timezone} onChange={(change) => setTimezone(change.target.value)}>
              {TIMEZONES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>

        <div className="event-resource-grid">
          <fieldset>
            <legend>Tracks</legend>
            <p className="muted">Submission and reviewer routing categories.</p>
            <div className="event-resource-list">
              {tracks.length === 0 ? <p className="empty-state">No tracks configured yet.</p> : null}
              {tracks.map((track) => (
                <div className="event-resource-row" key={track.id}>
                  <label>
                    <span>Track name {track.id}</span>
                    <input
                      className="settings-input"
                      value={track.name}
                      onChange={(change) => setTracks(tracks.map((candidate) => candidate.id === track.id ? { ...candidate, name: change.target.value } : candidate))}
                    />
                  </label>
                  <code>{track.id}</code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTracks(tracks.filter((candidate) => candidate.id !== track.id))}>
                    Remove track {track.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="event-resource-add">
              <label className="settings-label">
                New track name
                <input className="settings-input" value={newTrackName} onChange={(change) => setNewTrackName(change.target.value)} />
              </label>
              <button type="button" className="btn btn-secondary" disabled={!newTrackName.trim()} onClick={addTrack}>Add track</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Rooms</legend>
            <p className="muted">Physical or virtual agenda locations.</p>
            <div className="event-resource-list">
              {rooms.length === 0 ? <p className="empty-state">No rooms configured yet.</p> : null}
              {rooms.map((room) => (
                <div className="event-resource-row" key={room.id}>
                  <label>
                    <span>Room name {room.id}</span>
                    <input
                      className="settings-input"
                      value={room.name}
                      onChange={(change) => setRooms(rooms.map((candidate) => candidate.id === room.id ? { ...candidate, name: change.target.value } : candidate))}
                    />
                  </label>
                  <code>{room.id}</code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRooms(rooms.filter((candidate) => candidate.id !== room.id))}>
                    Remove room {room.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="event-resource-add">
              <label className="settings-label">
                New room name
                <input className="settings-input" value={newRoomName} onChange={(change) => setNewRoomName(change.target.value)} />
              </label>
              <button type="button" className="btn btn-secondary" disabled={!newRoomName.trim()} onClick={addRoom}>Add room</button>
            </div>
          </fieldset>
        </div>

        {message ? (
          <p className={`form-message ${save.isError ? "error" : "success"}`} role="status">
            {message}
          </p>
        ) : null}
        <div className="settings-actions">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save event configuration"}
          </button>
        </div>
      </form>
    </section>
  );
}
