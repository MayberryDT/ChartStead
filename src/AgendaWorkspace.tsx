import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import type {
  AgendaAutoPlacePreview,
  EventRecord,
  OrganizerSession,
  ScheduleConflict,
  SessionContentRecord,
  SessionContentWorkspaceResponse,
  SessionPlacementPatch,
} from "../shared/events";
import {
  ApiError,
  applyAgendaAutoPlace,
  createPublicationCourseCheck,
  fetchAgenda,
  fetchSessionContentWorkspace,
  previewAgendaAutoPlace,
  restoreSessionContent,
  updateSessionContent,
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

export type AgendaChrome = {
  tools: ReactNode;
  actions: ReactNode;
};

export function AgendaWorkspace({
  event,
  initialDay = null,
  initialSessionIds = [],
  onChromeChange,
}: {
  event: EventRecord;
  initialDay?: string | null;
  initialSessionIds?: string[];
  onChromeChange?: (chrome: AgendaChrome | null) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const agendaQuery = useQuery({
    queryKey: ["agenda", event.id],
    queryFn: () => fetchAgenda(event.id),
  });
  const contentQuery = useQuery({
    queryKey: ["session-content", event.id],
    queryFn: () => fetchSessionContentWorkspace(event.id),
  });
  const days = useMemo(
    () => eachDay(event.startsOn, event.endsOn),
    [event.startsOn, event.endsOn],
  );
  const initialSessionKey = initialSessionIds.join(",");
  const [selectedDay, setSelectedDay] = useState(() =>
    initialDay && days.includes(initialDay) ? initialDay : event.startsOn,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSessionIds[0] ?? null,
  );
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dismissedConflictIds, setDismissedConflictIds] = useState<string[]>([]);
  const [autoPreview, setAutoPreview] = useState<AgendaAutoPlacePreview | null>(null);
  const [autoMode, setAutoMode] = useState<"all" | "selected">("all");
  const [autoIncludeManual, setAutoIncludeManual] = useState(false);

  function contentSaved(session: SessionContentRecord, message: string) {
    queryClient.setQueryData(
      ["session-content", event.id],
      (current: SessionContentWorkspaceResponse | undefined) =>
        current
          ? {
              ...current,
              sessions: current.sessions.map((item) =>
                item.id === session.id ? session : item,
              ),
            }
          : current,
    );
    void queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
    setStatusMessage(message);
  }

  const contentMutation = useMutation({
    mutationFn: (input: {
      sessionId: string;
      expectedVersion: number;
      title?: string;
      abstract?: string;
      publicContent?: string;
      status?: "draft" | "needs-changes" | "approved";
    }) => updateSessionContent(event.id, input.sessionId, input),
    onSuccess: ({ session }) => contentSaved(session, "Session content saved."),
    onError: (error) => {
      setStatusMessage(error instanceof ApiError ? error.message : "Unable to save session content.");
      void contentQuery.refetch();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (input: {
      sessionId: string;
      expectedVersion: number;
      restoreVersion: number;
    }) => restoreSessionContent(event.id, input.sessionId, input),
    onSuccess: ({ session }) => contentSaved(session, "Earlier content restored as a new version."),
    onError: (error) => {
      setStatusMessage(error instanceof ApiError ? error.message : "Unable to restore session content.");
      void contentQuery.refetch();
    },
  });

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

  const previewAutoPlaceMutation = useMutation({
    mutationFn: (input: {
      mode: "all" | "selected";
      includeManual: boolean;
      selectedSessionId: string | null;
    }) => {
      if (input.mode === "selected" && !input.selectedSessionId) {
        throw new Error("Select a session before previewing a selected-session auto-place.");
      }
      return previewAgendaAutoPlace(event.id, {
        selectedSessionIds:
          input.mode === "selected" && input.selectedSessionId
            ? [input.selectedSessionId]
            : undefined,
        includeManual: input.includeManual,
      });
    },
    onSuccess: (preview) => {
      setAutoPreview(preview);
      setStatusMessage(
        `Auto-place preview ready: ${preview.proposals.length} proposed, ${preview.leftovers.length} left for manual placement.`,
      );
    },
    onError: (error) => {
      setStatusMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to preview auto-place.",
      );
    },
  });

  const applyAutoPlaceMutation = useMutation({
    mutationFn: (preview: AgendaAutoPlacePreview) =>
      applyAgendaAutoPlace(event.id, {
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        agendaVersion: preview.agendaVersion,
        idempotencyKey: `ui-auto-place-${event.id}-${preview.previewDigest}-${createClientId()}`,
      }),
    onSuccess: async (result) => {
      setAutoPreview(null);
      queryClient.setQueryData(["agenda", event.id], result.agenda);
      await queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
      setSelectedId(result.appliedSessionIds[0] ?? selectedId);
      setStatusMessage(
        result.idempotent
          ? "Auto-place apply was already recorded; agenda is current."
          : `Auto-placed ${result.appliedSessionIds.length} session${
              result.appliedSessionIds.length === 1 ? "" : "s"
            }. ${result.agenda.counts.conflicts} conflict${
              result.agenda.counts.conflicts === 1 ? "" : "s"
            } active.`,
      );
    },
    onError: (error) => {
      setStatusMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to apply auto-place.",
      );
    },
  });


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
  const selectedContent = contentQuery.data?.sessions.find(
    (session) => session.id === selected?.id,
  );

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

  function syncAgendaUrl(next: { day?: string; selectedId?: string | null }) {
    const day = next.day ?? selectedDay;
    const sessionId = "selectedId" in next ? next.selectedId : selectedId;
    void navigate({
      to: "/e/$eventId/agenda",
      params: { eventId: event.id },
      search: {
        day: day === event.startsOn ? undefined : day,
        sessionIds: sessionId ? sessionId : undefined,
      },
      replace: true,
    });
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    syncAgendaUrl({ day });
  }

  function selectSession(sessionId: string) {
    setSelectedId(sessionId);
    syncAgendaUrl({ selectedId: sessionId });
  }

  useEffect(() => {
    setSelectedId(initialSessionIds[0] ?? null);
  }, [initialSessionKey]);

  useEffect(() => {
    if (initialDay && days.includes(initialDay)) {
      if (selectedDay !== initialDay) setSelectedDay(initialDay);
      return;
    }
    if (!initialSessionIds[0] && selectedDay !== event.startsOn) {
      setSelectedDay(event.startsOn);
      return;
    }
    if (!days.includes(selectedDay)) setSelectedDay(event.startsOn);
  }, [days, event.startsOn, initialDay, initialSessionKey, selectedDay]);

  useEffect(() => {
    if (initialDay) return;
    const firstLinkedSessionId = initialSessionIds[0];
    if (!firstLinkedSessionId) return;
    const linkedSession = sessions.find((session) => session.id === firstLinkedSessionId);
    const linkedDay = linkedSession ? sessionDay(linkedSession) : null;
    if (linkedDay && linkedDay !== selectedDay) setSelectedDay(linkedDay);
  }, [initialDay, initialSessionKey, selectedDay, sessions]);

  function place(sessionId: string, patch: SessionPlacementPatch) {
    placeMutation.mutate({
      sessionId,
      patch: agenda ? { ...patch, expectedAgendaVersion: agenda.version } : patch,
    });
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

  function submitContent(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!selectedContent) return;
    const form = new FormData(eventSubmit.currentTarget);
    contentMutation.mutate({
      sessionId: selectedContent.id,
      expectedVersion: selectedContent.contentVersion,
      title: String(form.get("title") ?? ""),
      abstract: String(form.get("abstract") ?? ""),
      publicContent: String(form.get("publicContent") ?? ""),
    });
  }

  function conflictAction(
    conflict: ScheduleConflict,
    action: ScheduleConflict["actions"][number],
  ) {
    const focusId = conflict.sessionIds[0];
    const focus = sessions.find((session) => session.id === focusId);
    selectSession(focusId);
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

  const counts = agenda?.counts ?? {
    unplaced: 0,
    partial: 0,
    placed: 0,
    conflicts: 0,
  };

  useEffect(() => {
    if (!onChromeChange) return;
    onChromeChange({
      tools: (
        <div className="topbar-tools-inner agenda-shell-tools">
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
                onClick={() => selectDay(day)}
              >
                {dayLabel(day)}
              </button>
            ))}
          </div>
        </div>
      ),
      actions: (
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
      ),
    });
  }, [
    counts.conflicts,
    counts.partial,
    counts.placed,
    counts.unplaced,
    days,
    onChromeChange,
    publishMutation.isPending,
    selectedDay,
  ]);

  useEffect(() => {
    return () => onChromeChange?.(null);
  }, [onChromeChange]);
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



  return (
    <div className="work agenda-work">


      {statusMessage ? (
        <p className="agenda-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      <section className="operations-panel agenda-auto-place" aria-label="Auto-place assistant">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Scheduling assistant</p>
            <h3>Auto-place preview</h3>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={previewAutoPlaceMutation.isPending}
            onClick={() => {
              setStatusMessage(null);
              previewAutoPlaceMutation.mutate({
                mode: autoMode,
                includeManual: autoIncludeManual,
                selectedSessionId: selected?.id ?? null,
              });
            }}
          >
            {previewAutoPlaceMutation.isPending ? "Previewing…" : "Preview auto-place"}
          </button>
        </div>
        <div className="agenda-auto-place-controls">
          <label>
            Scope
            <select
              aria-label="Auto-place scope"
              value={autoMode}
              onChange={(change) => {
                setAutoMode(change.currentTarget.value === "selected" ? "selected" : "all");
                setAutoPreview(null);
              }}
            >
              <option value="all">All eligible unplaced sessions</option>
              <option value="selected">Selected session only</option>
            </select>
          </label>
          <label className="agenda-auto-place-check">
            <input
              type="checkbox"
              checked={autoIncludeManual}
              onChange={(change) => {
                setAutoIncludeManual(change.currentTarget.checked);
                setAutoPreview(null);
              }}
            />
            Include existing manual and partial placements
          </label>
        </div>
        <p className="muted">
          Preview first; apply uses the exact preview digest and agenda version so stale placements are rejected.
        </p>
        {autoPreview ? (
          <div className="agenda-auto-place-preview">
            <p>
              <strong>
                {autoPreview.proposals.length} proposed · {autoPreview.leftovers.length} leftover
                {autoPreview.leftovers.length === 1 ? "" : "s"} · {autoPreview.conflicts.length} current conflict
                {autoPreview.conflicts.length === 1 ? "" : "s"}
              </strong>
              <span> · agenda v{autoPreview.agendaVersion}</span>
            </p>
            {autoPreview.proposals.length > 0 ? (
              <ul className="agenda-auto-place-list" aria-label="Proposed auto-place slots">
                {autoPreview.proposals.map((proposal) => (
                  <li key={proposal.sessionId}>
                    <strong>{proposal.title}</strong> → {proposal.roomName},{" "}
                    {formatClock(proposal.startsAt)}–{formatClock(proposal.endsAt)}
                    <span className="muted"> · {proposal.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">No sessions can be placed by this preview.</p>
            )}
            {autoPreview.leftovers.length > 0 ? (
              <ul className="agenda-auto-place-list" aria-label="Auto-place leftovers">
                {autoPreview.leftovers.map((leftover) => (
                  <li key={leftover.sessionId}>
                    <strong>{leftover.title}</strong> remains {leftover.placementStatus}:{" "}
                    {leftover.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {autoPreview.conflicts.length > 0 ? (
              <ul className="agenda-auto-place-list" aria-label="Existing conflicts before auto-place">
                {autoPreview.conflicts.map((conflict) => (
                  <li key={conflict.id}>{conflict.summary}</li>
                ))}
              </ul>
            ) : null}
            <ul className="agenda-auto-place-list" aria-label="Auto-place assumptions">
              {autoPreview.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
              {autoPreview.manualPlacementPreserved.length > 0 ? (
                <li>
                  Preserved {autoPreview.manualPlacementPreserved.length} manually placed session
                  {autoPreview.manualPlacementPreserved.length === 1 ? "" : "s"}.
                </li>
              ) : null}
            </ul>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={applyAutoPlaceMutation.isPending || autoPreview.proposals.length === 0}
              onClick={() => applyAutoPlaceMutation.mutate(autoPreview)}
            >
              {applyAutoPlaceMutation.isPending ? "Applying…" : "Apply exact preview"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="agenda-layout">
        <aside className="agenda-pool operations-panel" aria-label="Unplaced sessions">
          <div className="panel-heading">
            <h3>Unplaced pool</h3>
            <span className="agenda-pool-count">{pool.length}</span>
          </div>
          {pool.length === 0 ? (
            <p className="empty-state padded">
              {sessions.length === 0 ? "No sessions yet." : "All sessions are fully placed."}
            </p>
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
                    onClick={() => selectSession(session.id)}
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
                          onClick={() => selectSession(session.id)}
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

              {contentQuery.isPending ? (
                <p className="muted">Loading content review…</p>
              ) : contentQuery.isError ? (
                <p className="muted" role="alert">Unable to load content review.</p>
              ) : selectedContent ? (
                <section className="session-content-review" aria-labelledby="session-content-heading">
                  <div>
                    <p className="eyebrow">Content review</p>
                    <h5 id="session-content-heading">Public session content</h5>
                    <p className="muted">
                      Version {selectedContent.contentVersion} · {selectedContent.contentStatus.replace("-", " ")}
                    </p>
                  </div>
                  <form
                    key={`${selectedContent.id}:${selectedContent.contentVersion}`}
                    className="agenda-move-form"
                    onSubmit={submitContent}
                  >
                    <label>
                      Session title
                      <input name="title" defaultValue={selectedContent.title} required />
                    </label>
                    <label>
                      Abstract
                      <textarea name="abstract" defaultValue={selectedContent.abstract} rows={4} />
                    </label>
                    <label>
                      Public content
                      <textarea name="publicContent" defaultValue={selectedContent.publicContent} rows={4} />
                    </label>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={contentMutation.isPending}
                    >
                      {contentMutation.isPending ? "Saving…" : "Save content"}
                    </button>
                  </form>
                  <div className="agenda-inspector-actions" aria-label="Content review status">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={contentMutation.isPending || selectedContent.contentStatus === "needs-changes"}
                      onClick={() => contentMutation.mutate({
                        sessionId: selectedContent.id,
                        expectedVersion: selectedContent.contentVersion,
                        status: "needs-changes",
                      })}
                    >
                      Return for changes
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={contentMutation.isPending || selectedContent.contentStatus === "approved"}
                      onClick={() => contentMutation.mutate({
                        sessionId: selectedContent.id,
                        expectedVersion: selectedContent.contentVersion,
                        status: "approved",
                      })}
                    >
                      Approve content
                    </button>
                  </div>
                  <details className="session-content-history">
                    <summary>Version history ({selectedContent.contentHistory.length})</summary>
                    <ol>
                      {selectedContent.contentHistory.map((entry) => (
                        <li key={entry.id}>
                          <div>
                            <strong>Version {entry.version}</strong>
                            <span>{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</span>
                            <span>{entry.changedFields.join(", ") || "restored snapshot"}</span>
                          </div>
                          {entry.version < selectedContent.contentVersion ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={restoreMutation.isPending}
                              onClick={() => restoreMutation.mutate({
                                sessionId: selectedContent.id,
                                expectedVersion: selectedContent.contentVersion,
                                restoreVersion: entry.version,
                              })}
                            >
                              Restore version {entry.version}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                </section>
              ) : null}

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
