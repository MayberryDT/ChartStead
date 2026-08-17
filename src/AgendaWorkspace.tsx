import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  updateSessionContent,
  updateSessionPlacement,
} from "./api";
import { AppSelect } from "./AppSelect";
import { createClientId } from "./id";

type AutoPlaceScope = "all" | "all-manual" | "selected" | "selected-manual";

const SLOT_MINUTES = 30;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;
const DEFAULT_DURATION_MS = 45 * 60 * 1000;
const EMPTY_SESSIONS: OrganizerSession[] = [];
const EMPTY_CONFLICTS: ScheduleConflict[] = [];

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

function placementSummary(session: OrganizerSession): string {
  const room = session.roomName ?? (session.roomId ? "Room set" : null);
  const time =
    session.startsAt || session.endsAt
      ? `${formatClock(session.startsAt)}${
          session.endsAt ? `–${formatClock(session.endsAt)}` : ""
        }`
      : null;
  const day = sessionDay(session);

  if (session.placementStatus === "unplaced") {
    return "Unplaced · room and time TBD";
  }
  if (session.placementStatus === "partial") {
    const parts = [
      room ?? "Room TBD",
      time ?? "Time TBD",
      day && !time ? dayLabel(day) : null,
    ].filter(Boolean);
    return `Partial · ${parts.join(" · ")}`;
  }
  return `${room ?? "Room TBD"} · ${time ?? "Time TBD"}${
    day ? ` · ${dayLabel(day)}` : ""
  }`;
}

function sessionHasConflict(
  sessionId: string,
  conflicts: ScheduleConflict[],
): boolean {
  return conflicts.some((conflict) => conflict.sessionIds.includes(sessionId));
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
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(
    initialSessionIds[0] ?? null,
  );
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedConflictIds, setDismissedConflictIds] = useState<string[]>([]);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [exitingConflictIds, setExitingConflictIds] = useState<string[]>([]);
  const [conflictAutoPlacingId, setConflictAutoPlacingId] = useState<string | null>(
    null,
  );
  const [autoPreview, setAutoPreview] = useState<AgendaAutoPlacePreview | null>(null);
  const [autoScope, setAutoScope] = useState<AutoPlaceScope>("all");
  const [moveDay, setMoveDay] = useState(event.startsOn);
  const [moveSlot, setMoveSlot] = useState("10:00");
  const [moveRoomId, setMoveRoomId] = useState("__tbd__");
  const [moveDuration, setMoveDuration] = useState("45");

  function showToast(message: string) {
    setToast(message);
  }

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
    showToast(message);
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
      showToast(error instanceof ApiError ? error.message : "Unable to save session content.");
      void contentQuery.refetch();
    },
  });

  const placeMutation = useMutation({
    mutationFn: (input: { sessionId: string; patch: SessionPlacementPatch }) =>
      updateSessionPlacement(event.id, input.sessionId, input.patch),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
      setSelectedId(result.session.id);
      const placedDay = sessionDay(result.session);
      const dayNote =
        placedDay && placedDay !== selectedDay
          ? ` on ${dayLabel(placedDay)}`
          : "";
      const conflictCount = result.counts.conflicts;
      showToast(
        conflictCount > 0
          ? `Saved${dayNote} with ${conflictCount} active conflict${conflictCount === 1 ? "" : "s"}.`
          : `Placement saved${dayNote}.`,
      );
    },
    onError: (error) => {
      showToast(error instanceof ApiError ? error.message : "Unable to save placement.");
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
      showToast(
        error instanceof ApiError
          ? error.message
          : "Unable to open Program Publication Course Check.",
      );
    },
  });

  const previewAutoPlaceMutation = useMutation({
    mutationFn: (input: {
      scope: AutoPlaceScope;
      selectedSessionId: string | null;
      selectedSessionIds?: string[];
    }) => {
      const mode =
        input.scope === "selected" || input.scope === "selected-manual"
          ? "selected"
          : "all";
      const includeManual =
        input.scope === "all-manual" || input.scope === "selected-manual";
      const selectedIds =
        input.selectedSessionIds && input.selectedSessionIds.length > 0
          ? input.selectedSessionIds
          : input.selectedSessionId
            ? [input.selectedSessionId]
            : [];
      if (mode === "selected" && selectedIds.length === 0) {
        throw new Error("Select a session before previewing a selected-session auto-place.");
      }
      return previewAgendaAutoPlace(event.id, {
        selectedSessionIds: mode === "selected" ? selectedIds : undefined,
        includeManual,
      });
    },
    onSuccess: (preview) => {
      setAutoPreview(preview);
    },
    onError: (error) => {
      showToast(
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
      if (result.agenda.counts.conflicts === 0) setConflictsOpen(false);
      queryClient.setQueryData(["agenda", event.id], result.agenda);
      await queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
      setSelectedId(result.appliedSessionIds[0] ?? selectedId);
      showToast(
        result.idempotent
          ? "Auto-place already recorded; agenda is current."
          : `Auto-placed ${result.appliedSessionIds.length} session${
              result.appliedSessionIds.length === 1 ? "" : "s"
            }. ${result.agenda.counts.conflicts} conflict${
              result.agenda.counts.conflicts === 1 ? "" : "s"
            } active.`,
      );
    },
    onError: (error) => {
      showToast(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to apply auto-place.",
      );
    },
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const slots = useMemo(() => timeSlots(), []);
  const rooms = event.rooms;
  const roomColumns = useMemo(
    () => [...rooms, { id: "__tbd__", name: "TBD room", readiness: "pending" as const }],
    [rooms],
  );

  const agenda = agendaQuery.data;
  const sessions = agenda?.sessions ?? EMPTY_SESSIONS;
  const conflicts = agenda?.conflicts ?? EMPTY_CONFLICTS;
  const selected =
    sessions.find((session) => session.id === selectedId) ??
    sessions.find((session) => session.placementStatus !== "placed") ??
    sessions[0] ??
    null;
  const selectedContent = contentQuery.data?.sessions.find(
    (session) => session.id === selected?.id,
  );

  const visibleConflicts = conflicts.filter(
    (conflict) => !dismissedConflictIds.includes(conflict.id),
  );

  useEffect(() => {
    if (visibleConflicts.length === 0 && conflictsOpen) {
      setConflictsOpen(false);
    }
  }, [visibleConflicts.length, conflictsOpen]);

  const pool = sessions.filter((session) => session.placementStatus !== "placed");
  const daySessions = sessions.filter((session) => {
    if (!session.startsAt || !session.endsAt) return false;
    return sessionDay(session) === selectedDay;
  });
  const dayCountKey = useMemo(
    () =>
      days
        .map((day) => {
          const count = sessions.filter((session) => {
            const sessionOnDay = sessionDay(session) === day;
            return (
              sessionOnDay &&
              (session.placementStatus === "placed" ||
                session.placementStatus === "partial")
            );
          }).length;
          return `${day}:${count}`;
        })
        .join("|"),
    [days, sessions],
  );
  const daySessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const part of dayCountKey.split("|")) {
      if (!part) continue;
      const [day, count] = part.split(":");
      if (day) counts.set(day, Number(count) || 0);
    }
    return counts;
  }, [dayCountKey]);
  const selectedSessionDay = selected ? sessionDay(selected) : null;
  const selectedOnOtherDay = Boolean(
    selected &&
      selectedSessionDay &&
      selectedSessionDay !== selectedDay &&
      selected.placementStatus !== "unplaced",
  );

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

  function stepDay(delta: -1 | 1) {
    const index = days.indexOf(selectedDay);
    if (index < 0) return;
    const next = days[index + delta];
    if (!next) return;
    selectDay(next);
  }

  function selectSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    setSelectedId(sessionId);
    setMoveOpen(true);
    if (session) {
      setMoveDay(sessionDay(session) ?? selectedDay);
      setMoveSlot(sessionSlot(session) ?? "10:00");
      setMoveRoomId(session.roomId ?? "__tbd__");
      if (session.startsAt && session.endsAt) {
        const minutes = Math.max(
          15,
          Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60000),
        );
        setMoveDuration(String(minutes));
      } else {
        setMoveDuration("45");
      }
    }
    syncAgendaUrl({ selectedId: sessionId });
  }

  useEffect(() => {
    setSelectedId(initialSessionIds[0] ?? null);
    setHighlightSessionId(initialSessionIds[0] ?? null);
  }, [initialSessionKey]);

  useEffect(() => {
    if (!highlightSessionId) return;
    const timer = window.setTimeout(() => setHighlightSessionId(null), 2800);
    return () => window.clearTimeout(timer);
  }, [highlightSessionId]);

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
    if (linkedSession) setMoveOpen(true);
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
    const startsAt = toIso(moveDay, moveSlot);
    const endsAt = new Date(
      Date.parse(startsAt) + Math.max(15, Number(moveDuration) || 45) * 60 * 1000,
    ).toISOString();
    place(selected.id, {
      roomId: moveRoomId === "" || moveRoomId === "__tbd__" ? null : moveRoomId,
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

  function fixConflict(conflict: ScheduleConflict) {
    const focusId = conflict.sessionIds[0];
    if (!focusId) return;
    setConflictsOpen(false);
    setHighlightSessionId(focusId);
    selectSession(focusId);
  }

  async function autoPlaceConflict(conflict: ScheduleConflict) {
    const selectedSessionIds = conflict.sessionIds.filter(Boolean);
    if (selectedSessionIds.length === 0) {
      showToast("No sessions on this conflict to auto-place.");
      return;
    }
    if (conflictAutoPlacingId) return;
    setConflictAutoPlacingId(conflict.id);
    setExitingConflictIds((ids) =>
      ids.includes(conflict.id) ? ids : [...ids, conflict.id],
    );
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      const preview = await previewAgendaAutoPlace(event.id, {
        selectedSessionIds,
        includeManual: true,
      });
      const result = await applyAgendaAutoPlace(event.id, {
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        agendaVersion: preview.agendaVersion,
        idempotencyKey: `ui-conflict-auto-${event.id}-${conflict.id}-${createClientId()}`,
      });
      queryClient.setQueryData(["agenda", event.id], result.agenda);
      await queryClient.invalidateQueries({ queryKey: ["agenda", event.id] });
      setDismissedConflictIds((ids) =>
        ids.includes(conflict.id) ? ids : [...ids, conflict.id],
      );
      showToast(
        result.idempotent
          ? "Auto-place already recorded; agenda is current."
          : `Auto-placed ${result.appliedSessionIds.length || selectedSessionIds.length} session${
              (result.appliedSessionIds.length || selectedSessionIds.length) === 1
                ? ""
                : "s"
            }.`,
      );
      if (result.agenda.counts.conflicts === 0) setConflictsOpen(false);
    } catch (error) {
      setExitingConflictIds((ids) => ids.filter((id) => id !== conflict.id));
      showToast(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to auto-place this conflict.",
      );
    } finally {
      setConflictAutoPlacingId(null);
      setExitingConflictIds((ids) => ids.filter((id) => id !== conflict.id));
    }
  }

  const counts = agenda?.counts ?? {
    unplaced: 0,
    partial: 0,
    placed: 0,
    conflicts: 0,
  };

  useEffect(() => {
    if (!onChromeChange) return;
    const dayIndex = days.indexOf(selectedDay);
    const selectedDayCount = daySessionCounts.get(selectedDay) ?? 0;
    const hostsSelectionElsewhere = Boolean(
      selectedSessionDay && selectedSessionDay !== selectedDay,
    );
    onChromeChange({
      tools: (
        <div className="topbar-tools-inner agenda-shell-tools">
          <div className="agenda-shell-left">
            <div
              className="agenda-day-nav"
              role="group"
              aria-label="Event day"
              data-day-count={days.length}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm agenda-day-step"
                aria-label="Previous day"
                disabled={dayIndex <= 0}
                onClick={() => stepDay(-1)}
              >
                ‹
              </button>
              <div
                className={`agenda-day-current${
                  hostsSelectionElsewhere ? " has-selection-elsewhere" : ""
                }`}
                data-day={selectedDay}
              >
                <span className="agenda-day-label">{dayLabel(selectedDay)}</span>
                <span className="agenda-day-count">{selectedDayCount}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm agenda-day-step"
                aria-label="Next day"
                disabled={dayIndex < 0 || dayIndex >= days.length - 1}
                onClick={() => stepDay(1)}
              >
                ›
              </button>
            </div>
            <div className="topbar-track agenda-auto-scope">
              <AppSelect
                label="Scope"
                ariaLabel="Auto-place scope"
                hideLabel
                value={autoScope}
                options={[
                  { value: "all", label: "Unplaced" },
                  { value: "all-manual", label: "Unplaced +" },
                  { value: "selected", label: "Selected" },
                  { value: "selected-manual", label: "Selected +" },
                ]}
                onValueChange={(value) => {
                  setAutoScope(value as AutoPlaceScope);
                  setAutoPreview(null);
                }}
              />
            </div>
          </div>
          <div className="agenda-counts" aria-live="polite">
            <span className="agenda-metric is-unplaced" aria-label={`${counts.unplaced + counts.partial} unplaced`}>
              <strong>{counts.unplaced + counts.partial}</strong>
              <span>unplaced</span>
            </span>
            <span className="agenda-metric is-placed" aria-label={`${counts.placed} placed`}>
              <strong>{counts.placed}</strong>
              <span>placed</span>
            </span>
            <span
              className={`agenda-metric is-conflicts${counts.conflicts > 0 ? " has-value" : ""}`}
              aria-label={`${counts.conflicts} conflicts`}
            >
              <strong>{counts.conflicts}</strong>
              <span>conflicts</span>
            </span>
          </div>
          <div className="agenda-shell-right">
            {visibleConflicts.length > 0 ? (
              <button
                type="button"
                className="btn btn-secondary agenda-toolbar-btn agenda-fix-conflicts"
                onClick={() => setConflictsOpen(true)}
              >
                Fix Conflicts
                <span className="agenda-fix-conflicts-count" aria-hidden="true">
                  {visibleConflicts.length}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary agenda-toolbar-btn"
              disabled={previewAutoPlaceMutation.isPending}
              onClick={() => {
                previewAutoPlaceMutation.mutate({
                  scope: autoScope,
                  selectedSessionId: selected?.id ?? null,
                });
              }}
            >
              {previewAutoPlaceMutation.isPending ? "Working…" : "Auto-place"}
            </button>
          </div>
        </div>
      ),
      actions: (
        <button
          type="button"
          className="btn btn-primary agenda-toolbar-btn"
          disabled={publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
        >
          {publishMutation.isPending ? "Opening…" : "Publish program"}
        </button>
      ),
    });
  }, [
    applyAutoPlaceMutation.isPending,
    autoPreview,
    autoScope,
    counts.conflicts,
    counts.partial,
    counts.placed,
    counts.unplaced,
    dayCountKey,
    daySessionCounts,
    days,
    onChromeChange,
    previewAutoPlaceMutation.isPending,
    publishMutation.isPending,
    selected?.id,
    selectedDay,
    selectedSessionDay,
    visibleConflicts.length,
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
      {toast ? (
        <div className="agenda-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {autoPreview ? (
        <div className="dialog-backdrop" aria-hidden="true" />
      ) : null}
      {autoPreview ? (
        <div className="dialog-viewport">
          <div
            className="routing-dialog agenda-auto-place-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-auto-place-title"
          >
            <div className="routing-dialog-header">
              <div>
                <p className="eyebrow">Scheduling assistant</p>
                <h2 id="agenda-auto-place-title">Auto-place preview</h2>
                <p>
                  {autoPreview.proposals.length} proposed · {autoPreview.leftovers.length} leftover
                  {autoPreview.leftovers.length === 1 ? "" : "s"} · {autoPreview.conflicts.length}{" "}
                  current conflict
                  {autoPreview.conflicts.length === 1 ? "" : "s"} · agenda v
                  {autoPreview.agendaVersion}
                </p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close auto-place preview"
                onClick={() => setAutoPreview(null)}
              >
                ×
              </button>
            </div>
            <div className="agenda-auto-place-dialog-body">
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
              <ul className="agenda-auto-place-list" aria-label="Auto-place assumptions">
                {autoPreview.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
                {autoPreview.manualPlacementPreserved.length > 0 ? (
                  <li>
                    Preserved {autoPreview.manualPlacementPreserved.length} manually placed
                    session
                    {autoPreview.manualPlacementPreserved.length === 1 ? "" : "s"}.
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="agenda-auto-place-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAutoPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  applyAutoPlaceMutation.isPending || autoPreview.proposals.length === 0
                }
                onClick={() => applyAutoPlaceMutation.mutate(autoPreview)}
              >
                {applyAutoPlaceMutation.isPending
                  ? "Applying…"
                  : `Apply ${autoPreview.proposals.length} placement${
                      autoPreview.proposals.length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {conflictsOpen && visibleConflicts.length > 0 ? (
        <div className="dialog-backdrop" aria-hidden="true" />
      ) : null}
      {conflictsOpen && visibleConflicts.length > 0 ? (
        <div className="dialog-viewport">
          <div
            className="routing-dialog agenda-conflicts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-conflicts-title"
          >
            <div className="routing-dialog-header">
              <div>
                <p className="eyebrow">Schedule conflicts</p>
                <h2 id="agenda-conflicts-title">Fix Conflicts</h2>
                <p>
                  {visibleConflicts.length} conflict
                  {visibleConflicts.length === 1 ? "" : "s"} need a placement decision.
                </p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close conflicts"
                onClick={() => setConflictsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="agenda-conflicts-dialog-body">
              <ul className="agenda-conflict-list" aria-label="Conflicts">
                {visibleConflicts.map((conflict) => {
                  const exiting = exitingConflictIds.includes(conflict.id);
                  const busy = conflictAutoPlacingId === conflict.id;
                  return (
                    <li
                      key={conflict.id}
                      className={`agenda-conflict-card${exiting ? " is-exiting" : ""}`}
                    >
                      <p>{conflict.summary}</p>
                      {conflict.sessionTitles.length > 0 ? (
                        <p className="muted agenda-conflict-sessions">
                          {conflict.sessionTitles.join(" · ")}
                        </p>
                      ) : null}
                      <div className="agenda-conflict-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={Boolean(conflictAutoPlacingId)}
                          onClick={() => void autoPlaceConflict(conflict)}
                        >
                          {busy ? "Auto-placing…" : "Auto-place"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={Boolean(conflictAutoPlacingId)}
                          onClick={() => fixConflict(conflict)}
                        >
                          Fix
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="agenda-auto-place-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConflictsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="agenda-layout">
        <aside className="agenda-pool" aria-label="Unplaced sessions">
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
                    } ${session.placementStatus === "partial" ? "is-partial" : ""} ${
                      sessionHasConflict(session.id, conflicts) ? "has-conflict" : ""
                    } ${highlightSessionId === session.id ? "is-highlight" : ""}`}
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
                    <p className="agenda-meta">{placementSummary(session)}</p>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section
          className="agenda-grid-wrap"
          aria-label="Day and room grid"
          tabIndex={0}
        >
          <div
            className="agenda-grid"
            style={{
              gridTemplateColumns: `56px repeat(${roomColumns.length}, minmax(168px, 1fr))`,
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
                      } ${cell.length === 0 ? "is-empty" : ""} ${
                        cell.length > 1 ? "is-multi" : ""
                      }`}
                      data-drop-room={room.id}
                      data-drop-slot={slot}
                      data-session-count={cell.length || undefined}
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
                            sessionHasConflict(session.id, conflicts) ? "has-conflict" : ""
                          } ${highlightSessionId === session.id ? "is-highlight" : ""}`}
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

        <aside className="agenda-inspector" aria-label="Session inspector">
          {!selected ? (
            <p className="empty-state padded">Select a session to place it.</p>
          ) : (
            <div className="agenda-inspector-body">
              <header className="agenda-inspector-header">
                <h3>{selected.title}</h3>
                <p className="agenda-inspector-who">
                  {selected.speakers.map((speaker) => speaker.name).join(", ") || "Speakers TBD"}
                  {selected.trackName ? ` · ${selected.trackName}` : ""}
                </p>
              </header>

              <dl className="inspector-meta agenda-dl">
                <div>
                  <dt>Placement</dt>
                  <dd
                    className={`agenda-placement-status is-${selected.placementStatus}`}
                  >
                    {selected.placementStatus === "unplaced"
                      ? "Unplaced"
                      : selected.placementStatus === "partial"
                        ? "Partial · TBD fields remain"
                        : selectedOnOtherDay && selectedSessionDay
                          ? `Placed · ${dayLabel(selectedSessionDay)}`
                          : "Placed"}
                  </dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd className={!selected.roomName ? "is-tbd" : undefined}>
                    {selected.roomName ?? "TBD"}
                  </dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd className={!selected.startsAt && !selected.endsAt ? "is-tbd" : undefined}>
                    {selected.startsAt || selected.endsAt
                      ? `${formatClock(selected.startsAt)} – ${formatClock(selected.endsAt)}`
                      : "TBD"}
                  </dd>
                </div>
                <div>
                  <dt>Day</dt>
                  <dd className={!selectedSessionDay ? "is-tbd" : undefined}>
                    {selectedSessionDay ? dayLabel(selectedSessionDay) : "TBD"}
                  </dd>
                </div>
              </dl>

              <div className="agenda-inspector-actions agenda-inspector-primary">
                {!moveOpen ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setMoveOpen(true)}
                  >
                    Move Session
                  </button>
                ) : null}
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
                  <div className="agenda-move-form-heading">
                    <h4>Move Session</h4>
                  </div>
                  <div className="agenda-field">
                    <span className="agenda-field-label">Day</span>
                    <AppSelect
                      label="Day"
                      ariaLabel="Day"
                      value={moveDay}
                      options={days.map((day) => ({
                        value: day,
                        label: dayLabel(day),
                      }))}
                      onValueChange={setMoveDay}
                    />
                  </div>
                  <div className="agenda-field">
                    <span className="agenda-field-label">Start</span>
                    <AppSelect
                      label="Start"
                      ariaLabel="Start"
                      value={moveSlot}
                      options={slots.map((slot) => ({ value: slot, label: slot }))}
                      onValueChange={setMoveSlot}
                    />
                  </div>
                  <div className="agenda-field">
                    <span className="agenda-field-label">Room</span>
                    <AppSelect
                      label="Room"
                      ariaLabel="Room"
                      value={moveRoomId}
                      options={[
                        { value: "__tbd__", label: "TBD room" },
                        ...rooms.map((room) => ({
                          value: room.id,
                          label: room.name,
                        })),
                      ]}
                      onValueChange={setMoveRoomId}
                    />
                  </div>
                  <div className="agenda-field">
                    <span className="agenda-field-label">Duration</span>
                    <AppSelect
                      label="Duration"
                      ariaLabel="Duration"
                      value={moveDuration}
                      options={["15", "30", "45", "60", "75", "90"].map((mins) => ({
                        value: mins,
                        label: `${mins} min`,
                      }))}
                      onValueChange={setMoveDuration}
                    />
                  </div>
                  <div className="agenda-inspector-actions">
                    <button type="submit" className="btn btn-primary btn-sm">
                      Save placement
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setMoveOpen(false)}
                    >
                      Collapse
                    </button>
                  </div>
                </form>
              ) : null}

              {contentQuery.isPending ? (
                <p className="muted">Loading content review…</p>
              ) : contentQuery.isError ? (
                <p className="muted" role="alert">
                  Unable to load content review.
                </p>
              ) : selectedContent ? (
                <section
                  className="session-content-review"
                  aria-labelledby="session-content-heading"
                >
                  <div>
                    <p className="eyebrow">Content review</p>
                    <h4 id="session-content-heading">Public session content</h4>
                    <p className="muted">
                      Version {selectedContent.contentVersion} ·{" "}
                      {selectedContent.contentStatus.replace("-", " ")}
                    </p>
                  </div>
                  <form
                    key={`${selectedContent.id}:${selectedContent.contentVersion}`}
                    className="agenda-content-form"
                    onSubmit={submitContent}
                  >
                    <label>
                      Session title
                      <input name="title" defaultValue={selectedContent.title} required />
                    </label>
                    <label>
                      Abstract
                      <textarea
                        name="abstract"
                        defaultValue={selectedContent.abstract}
                        rows={4}
                      />
                    </label>
                    <label>
                      Public content
                      <textarea
                        name="publicContent"
                        defaultValue={selectedContent.publicContent}
                        rows={4}
                      />
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
                      disabled={
                        contentMutation.isPending ||
                        selectedContent.contentStatus === "needs-changes"
                      }
                      onClick={() =>
                        contentMutation.mutate({
                          sessionId: selectedContent.id,
                          expectedVersion: selectedContent.contentVersion,
                          status: "needs-changes",
                        })
                      }
                    >
                      Return for changes
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={
                        contentMutation.isPending ||
                        selectedContent.contentStatus === "approved"
                      }
                      onClick={() =>
                        contentMutation.mutate({
                          sessionId: selectedContent.id,
                          expectedVersion: selectedContent.contentVersion,
                          status: "approved",
                        })
                      }
                    >
                      Approve content
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
