import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FormEvent, useMemo, useState } from "react";

import type {
  EventRecord,
  OrganizerSession,
  ScheduleConflict,
  SessionPlacementPatch,
} from "../shared/events";
import {
  ApiError,
  createPublicationCourseCheck,
  fetchAgenda,
  updateSessionPlacement,
} from "./api";
import { createClientId } from "./id";

const SLOT_MINUTES = 30;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;
const DEFAULT_DURATION_MS = 45 * 60 * 1000;

function eachDay(startsOn: string, endsOn: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function timeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}

function formatClock(iso: string | null): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function sessionDay(session: OrganizerSession): string | null {
  return session.startsAt ? session.startsAt.slice(0, 10) : null;
}

function sessionSlot(session: OrganizerSession): string | null {
  if (!session.startsAt) return null;
  const date = new Date(session.startsAt);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes() < 30 ? 0 : 30;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function trackClass(trackId: string): string {
  const known = ["platform", "program-ops", "design-systems", "community", "agents", "models"];
  if (known.includes(trackId)) return `track-${trackId}`;
  const index = (trackId.charCodeAt(0) % 4) + 1;
  return `track-${index}`;
}

function toIso(day: string, slot: string): string {
  return `${day}T${slot}:00.000Z`;
}

function endsFromStart(startsAt: string, previousEndsAt: string | null): string {
  if (previousEndsAt && Date.parse(previousEndsAt) > Date.parse(startsAt)) {
    return previousEndsAt;
  }
  return new Date(Date.parse(startsAt) + DEFAULT_DURATION_MS).toISOString();
}

function actionLabel(action: ScheduleConflict["actions"][number]): string {
  switch (action) {
    case "move_time":
      return "Find another time";
    case "move_room":
      return "Move room";
    case "keep_placement":
      return "Keep this session";
    case "open_speaker_schedule":
      return "Open speaker schedule";
  }
}

export function AgendaWorkspace({ event }: { event: EventRecord }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const agendaQuery = useQuery({
    queryKey: ["agenda", event.id],
    queryFn: () => fetchAgenda(event.id),
  });
  const [selectedDay, setSelectedDay] = useState(event.startsOn);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dismissedConflictIds, setDismissedConflictIds] = useState<string[]>([]);

  const placeMutation = useMutation({
    mutationFn: (input: { sessionId: string; patch: SessionPlacementPatch }) =>
      updateSessionPlacement(event.id, input.sessionId, input.patch),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
      setSelectedId(result.session.id);
      const conflictCount = result.counts.conflicts;
      setStatusMessage(
        conflictCount > 0
          ? `Saved with ${conflictCount} active conflict${conflictCount === 1 ? "" : "s"}.`
          : "Placement saved.",
      );
    },
    onError: (error) => {
      setStatusMessage(
        error instanceof ApiError ? error.message : "Unable to save placement.",
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      createPublicationCourseCheck(event.id, {
        operation: "publish",
        idempotencyKey: `ui-publish-${event.id}-${createClientId()}`,
      }),
    onSuccess: (plan) => {
      void navigate({
        to: "/e/$eventId/course-checks/$planId",
        params: { eventId: event.id, planId: plan.id },
      });
    },
    onError: (error) => {
      setStatusMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to open Program Publication Course Check.",
      );
    },
  });

  const days = useMemo(
    () => eachDay(event.startsOn, event.endsOn),
    [event.startsOn, event.endsOn],
  );
  const slots = useMemo(() => timeSlots(), []);
  const rooms = event.rooms;
  const roomColumns = useMemo(
    () => [...rooms, { id: "__tbd__", name: "TBD room", readiness: "pending" as const }],
    [rooms],
  );

  const agenda = agendaQuery.data;
  const sessions = agenda?.sessions ?? [];
  const selected =
    sessions.find((session) => session.id === selectedId) ??
    sessions.find((session) => session.placementStatus !== "placed") ??
    sessions[0] ??
    null;

  const visibleConflicts = (agenda?.conflicts ?? []).filter(
    (conflict) => !dismissedConflictIds.includes(conflict.id),
  );

  const pool = sessions.filter((session) => session.placementStatus !== "placed");
  const daySessions = sessions.filter((session) => {
    if (!session.startsAt || !session.endsAt) return false;
    return sessionDay(session) === selectedDay;
  });

  function cellSessions(roomId: string, slot: string): OrganizerSession[] {
    return daySessions.filter((session) => {
      const sessionRoom = session.roomId ?? "__tbd__";
      return sessionRoom === roomId && sessionSlot(session) === slot;
    });
  }

  function place(sessionId: string, patch: SessionPlacementPatch) {
    placeMutation.mutate({ sessionId, patch });
  }

  function onDropSession(sessionId: string, roomId: string, slot: string) {
    const existing = sessions.find((session) => session.id === sessionId);
    if (!existing) return;
    const startsAt = toIso(selectedDay, slot);
    const patch: SessionPlacementPatch = {
      roomId: roomId === "__tbd__" ? null : roomId,
      startsAt,
      endsAt: endsFromStart(startsAt, existing.endsAt),
    };
    place(sessionId, patch);
    setDragOverKey(null);
  }

  function submitMove(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!selected) return;
    const form = new FormData(eventSubmit.currentTarget);
    const roomIdRaw = String(form.get("roomId") ?? "");
    const day = String(form.get("day") ?? selectedDay);
    const slot = String(form.get("slot") ?? "09:00");
    const durationMinutes = Number(form.get("duration") ?? 45);
    const startsAt = toIso(day, slot);
    const endsAt = new Date(
      Date.parse(startsAt) + Math.max(15, durationMinutes) * 60 * 1000,
    ).toISOString();
    place(selected.id, {
      roomId: roomIdRaw === "" || roomIdRaw === "__tbd__" ? null : roomIdRaw,
      startsAt,
      endsAt,
    });
    setMoveOpen(false);
  }

  function clearPlacement(sessionId: string) {
    place(sessionId, { roomId: null, startsAt: null, endsAt: null });
  }

  function conflictAction(
    conflict: ScheduleConflict,
    action: ScheduleConflict["actions"][number],
  ) {
    const focusId = conflict.sessionIds[0];
    const focus = sessions.find((session) => session.id === focusId);
    setSelectedId(focusId);
    if (action === "keep_placement") {
      setDismissedConflictIds((ids) =>
        ids.includes(conflict.id) ? ids : [...ids, conflict.id],
      );
      setStatusMessage("Kept current placement. Conflict remains saved.");
      return;
    }
    if (action === "open_speaker_schedule") {
      setStatusMessage(
        conflict.speakerName
          ? `Showing sessions involving ${conflict.speakerName}.`
          : "Showing speaker schedule context.",
      );
      return;
    }
    if (action === "move_room" && focus) {
      const alternate =
        rooms.find((room) => room.id !== focus.roomId)?.id ?? null;
      if (alternate) {
        place(focus.id, { roomId: alternate });
        return;
      }
    }
    setMoveOpen(true);
  }

  if (agendaQuery.isPending) {
    return (
      <div className="work agenda-work">
        <p className="empty-state padded">Loading agenda…</p>
      </div>
    );
  }

  if (agendaQuery.isError) {
    return (
      <div className="work agenda-work">
        <section className="operations-panel" role="alert">
          <p className="empty-state padded">
            {agendaQuery.error instanceof ApiError
              ? agendaQuery.error.message
              : "Unable to load the agenda."}
          </p>
        </section>
      </div>
    );
  }

  const counts = agenda?.counts ?? {
    unplaced: 0,
    partial: 0,
    placed: 0,
    conflicts: 0,
  };

  return (
    <div className="work agenda-work">
      <div className="agenda-toolbar">
        <div>
          <p className="eyebrow">Schedule builder</p>
          <h2>Agenda</h2>
        </div>
        <p className="agenda-counts" aria-live="polite">
          <strong>
            {counts.unplaced + counts.partial} unplaced · {counts.conflicts} conflict
            {counts.conflicts === 1 ? "" : "s"}
          </strong>
          <span>
            {counts.placed} placed · native day/room grid
          </span>
        </p>
        <div className="agenda-day-tabs seg" role="tablist" aria-label="Event days">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === selectedDay}
              onClick={() => setSelectedDay(day)}
            >
              {dayLabel(day)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={publishMutation.isPending}
          onClick={() => {
            setStatusMessage(null);
            publishMutation.mutate();
          }}
        >
          {publishMutation.isPending ? "Opening…" : "Publish program"}
        </button>
      </div>

      {statusMessage ? (
        <p className="agenda-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      <div className="agenda-layout">
        <aside className="agenda-pool operations-panel" aria-label="Unplaced sessions">
          <div className="panel-heading">
            <h3>Unplaced pool</h3>
            <span className="agenda-pool-count">{pool.length}</span>
          </div>
          {pool.length === 0 ? (
            <p className="empty-state padded">All sessions are fully placed.</p>
          ) : (
            <ul className="agenda-pool-list">
              {pool.map((session) => (
                <li key={session.id}>
                  <article
                    className={`agenda-session-card ${trackClass(session.trackId)} ${
                      selected?.id === session.id ? "is-selected" : ""
                    }`}
                    draggable
                    onDragStart={(drag) => {
                      drag.dataTransfer.setData("text/session-id", session.id);
                      drag.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setSelectedId(session.id)}
                  >
                    <strong className="agenda-session-title">{session.title}</strong>
                    <p className="agenda-session-speakers">
                      {session.speakers.map((speaker) => speaker.name).join(", ") ||
                        "No speakers"}
                    </p>
                    <p className="agenda-meta">
                      {session.placementStatus === "unplaced"
                        ? "Unplaced · room and time TBD"
                        : `${session.roomName ?? "Room TBD"} · ${
                            session.startsAt
                              ? `${formatClock(session.startsAt)}${
                                  session.endsAt ? `–${formatClock(session.endsAt)}` : ""
                                }`
                              : "Time TBD"
                          }`}
                    </p>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section
          className="agenda-grid-wrap operations-panel"
          aria-label="Day and room grid"
          tabIndex={0}
        >
          <div className="panel-heading">
            <h3>{dayLabel(selectedDay)} · rooms</h3>
            <span className="agenda-hint">Drag onto a slot, or select a session and use Move Session</span>
          </div>
          <div
            className="agenda-grid"
            style={{
              gridTemplateColumns: `72px repeat(${roomColumns.length}, minmax(140px, 1fr))`,
            }}
          >
            <div className="agenda-grid-corner" />
            {roomColumns.map((room) => (
              <div key={room.id} className="agenda-grid-room">
                {room.name}
              </div>
            ))}
            {slots.map((slot) => (
              <div key={`row-${slot}`} className="agenda-grid-row-contents">
                <div className="agenda-grid-time">{slot}</div>
                {roomColumns.map((room) => {
                  const key = `${room.id}:${slot}`;
                  const cell = cellSessions(room.id, slot);
                  return (
                    <div
                      key={key}
                      className={`agenda-grid-cell ${
                        dragOverKey === key ? "is-drop-target" : ""
                      }`}
                      data-drop-room={room.id}
                      data-drop-slot={slot}
                      onDragOver={(drag) => {
                        drag.preventDefault();
                        setDragOverKey(key);
                      }}
                      onDragLeave={() => {
                        setDragOverKey((current) => (current === key ? null : current));
                      }}
                      onDrop={(drag) => {
                        drag.preventDefault();
                        const sessionId = drag.dataTransfer.getData("text/session-id");
                        if (sessionId) onDropSession(sessionId, room.id, slot);
                      }}
                    >
                      {cell.map((session) => (
                        <article
                          key={session.id}
                          className={`agenda-session-card compact ${trackClass(
                            session.trackId,
                          )} ${selected?.id === session.id ? "is-selected" : ""} ${
                            (agenda?.conflicts ?? []).some((conflict) =>
                              conflict.sessionIds.includes(session.id),
                            )
                              ? "has-conflict"
                              : ""
                          }`}
                          draggable
                          onDragStart={(drag) => {
                            drag.dataTransfer.setData("text/session-id", session.id);
                            drag.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => setSelectedId(session.id)}
                        >
                          <strong className="agenda-session-title">{session.title}</strong>
                          <span className="agenda-meta">
                            {session.speakers[0]?.name ?? "Speaker TBD"} ·{" "}
                            {formatClock(session.startsAt)}
                          </span>
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <aside className="agenda-inspector operations-panel" aria-label="Session inspector">
          <div className="panel-heading">
            <h3>Session</h3>
          </div>
          {!selected ? (
            <p className="empty-state padded">Select a session to inspect placement.</p>
          ) : (
            <div className="agenda-inspector-body">
              <h4>{selected.title}</h4>
              <dl className="agenda-dl">
                <div>
                  <dt>Speakers</dt>
                  <dd>
                    {selected.speakers.map((speaker) => speaker.name).join(", ") || "TBD"}
                  </dd>
                </div>
                <div>
                  <dt>Track</dt>
                  <dd>{selected.trackName || selected.trackId || "TBD"}</dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>{selected.roomName ?? "TBD"}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>
                    {selected.startsAt || selected.endsAt
                      ? `${formatClock(selected.startsAt)} – ${formatClock(selected.endsAt)}`
                      : "TBD"}
                  </dd>
                </div>
                <div>
                  <dt>Placement</dt>
                  <dd className="agenda-placement-status">
                    {selected.placementStatus === "unplaced"
                      ? "Unplaced"
                      : selected.placementStatus === "partial"
                        ? "Partial · TBD fields remain"
                        : "Placed"}
                  </dd>
                </div>
              </dl>
              <div className="agenda-inspector-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setMoveOpen(true)}
                >
                  Move Session
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => clearPlacement(selected.id)}
                >
                  Return to pool
                </button>
              </div>

              {moveOpen ? (
                <form className="agenda-move-form" onSubmit={submitMove}>
                  <h5>Move Session</h5>
                  <label>
                    Day
                    <select name="day" defaultValue={sessionDay(selected) ?? selectedDay}>
                      {days.map((day) => (
                        <option key={day} value={day}>
                          {dayLabel(day)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start
                    <select name="slot" defaultValue={sessionSlot(selected) ?? "10:00"}>
                      {slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Room
                    <select name="roomId" defaultValue={selected.roomId ?? "__tbd__"}>
                      <option value="__tbd__">TBD room</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Duration (minutes)
                    <input
                      name="duration"
                      type="number"
                      min={15}
                      step={15}
                      defaultValue={45}
                    />
                  </label>
                  <div className="agenda-inspector-actions">
                    <button type="submit" className="btn btn-primary btn-sm">
                      Save placement
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setMoveOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          )}

          <div className="agenda-conflicts">
            <div className="panel-heading">
              <h3>Conflicts</h3>
              <span>{visibleConflicts.length}</span>
            </div>
            {visibleConflicts.length === 0 ? (
              <p className="empty-state padded">No active conflicts.</p>
            ) : (
              <ul className="agenda-conflict-list">
                {visibleConflicts.map((conflict) => (
                  <li key={conflict.id} className="agenda-conflict-card">
                    <p>{conflict.summary}</p>
                    <div className="agenda-conflict-actions">
                      {conflict.actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => conflictAction(conflict, action)}
                        >
                          {actionLabel(action)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
