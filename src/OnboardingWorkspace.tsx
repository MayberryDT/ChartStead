import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type {
  FilesLibraryItem,
  OnboardingBoardSpeaker,
  OnboardingReminderDraft,
} from "../shared/events";
import { formatFileSize } from "../shared/onboarding-tasks";
import {
  ApiError,
  createOnboardingTasks,
  discardOnboardingReminder,
  exportOnboardingFilesZip,
  fetchOnboardingBoard,
  fetchOnboardingFilesLibrary,
  fetchOnboardingReminderPolicy,
  prepareOnboardingReminder,
  prepareBulkOnboardingReminders,
  processDueOnboardingReminders,
  sendOnboardingReminder,
  updateOnboardingReminderPolicy,
  updateOnboardingReminder,
} from "./api";
import {
  SpeakerDirectoryAddPanel,
  SpeakerDirectoryControls,
  filterDirectorySpeakers,
  SpeakerCurrentProfile,
  SpeakerParticipation,
  speakerWorkflowLabels,
  type SpeakerDirectoryFilter,
} from "./SpeakerDirectory";
import { AppSelect } from "./AppSelect";
import { createClientId } from "./id";
import { SpeakerCsvImport } from "./SpeakerCsvImport";

/** Server rejects larger batches; keep the toolbar from offering an impossible Prepare. */
const BULK_REMINDER_SPEAKER_LIMIT = 100;

function reminderErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function daysLabel(days: number | null): string {
  if (days === null) return "No due date";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function humanFlag(flag: string | null | undefined): string | null {
  if (!flag) return null;
  const known: Record<string, string> = {
    employer_approval: "Employer approval",
    co_speaker_details: "Co-speaker details",
  };
  if (known[flag]) return known[flag];
  return flag
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanHistoryType(type: string): string {
  const known: Record<string, string> = {
    profile_updated: "Profile updated",
    directory_speaker_added: "Added to speaker directory",
    task_created: "Task created",
    task_completed: "Task completed",
    reminder_draft_created: "Reminder draft prepared",
    reminder_discarded: "Reminder discarded",
    reminder_queued: "Reminder queued",
    reminder_sent: "Reminder sent",
    reminder_send_failed: "Reminder failed",
  };
  if (known[type]) return known[type];
  return type
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contactLabel(status: string | null | undefined): string {
  if (!status) return "—";
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "queued") return "Queued";
  if (status === "prepared") return "Prepared";
  if (status === "retry_scheduled") return "Retry scheduled";
  if (status === "draft") return "Draft";
  if (status === "discarded") return "Discarded";
  return status;
}

function organizerAssetUrl(
  eventId: string,
  assetId: string,
  disposition: "inline" | "attachment",
): string {
  return `/api/events/${eventId}/onboarding/assets/${assetId}?disposition=${disposition}`;
}

function dueStateLabel(state: string): string {
  if (state === "on-time") return "On time";
  if (state === "late") return "Late";
  if (state === "no-due-date") return "No due date";
  return state;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string): string {
  if (role === "primary") return "Primary";
  if (role === "co") return "Co-speaker";
  if (role === "invited") return "Invited";
  return role;
}

function roleFlagClass(role: string): string {
  if (role === "primary") return "flag flag-role-primary";
  if (role === "co") return "flag flag-role-co";
  return "flag flag-role-invited";
}

function workflowFlagClass(status: string): string {
  if (status === "ready") return "flag flag-workflow-ready";
  if (status === "preparing") return "flag flag-workflow-preparing";
  if (status === "confirmed") return "flag flag-workflow-confirmed";
  if (status === "withdrawn") return "flag flag-workflow-withdrawn";
  return "flag flag-workflow-invited";
}

function FilesLibraryPanel({
  eventId,
  focusSpeakerId,
}: {
  eventId: string;
  focusSpeakerId?: string;
}) {
  const library = useQuery({
    queryKey: ["onboarding-files-library", eventId],
    queryFn: () => fetchOnboardingFilesLibrary(eventId),
  });
  const [query, setQuery] = useState("");
  const [speakerId, setSpeakerId] = useState(focusSpeakerId ?? "");

  useEffect(() => {
    if (focusSpeakerId) setSpeakerId(focusSpeakerId);
  }, [focusSpeakerId]);
  const [sessionId, setSessionId] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [fileType, setFileType] = useState("");
  const [dueState, setDueState] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [exportReceipt, setExportReceipt] = useState<string | null>(null);

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (library.data?.files ?? []).filter((file) => {
      const haystack = [
        file.fileName,
        file.fileType,
        file.speaker.name,
        file.speaker.email,
        file.session?.title ?? "No session",
        file.task.title,
      ].join(" ").toLowerCase();
      return (
        (!needle || haystack.includes(needle)) &&
        (!speakerId || file.speaker.id === speakerId) &&
        (!sessionId || file.session?.id === sessionId) &&
        (!taskStatus || file.task.status === taskStatus) &&
        (!fileType || file.fileType === fileType) &&
        (!dueState || file.dueState === dueState)
      );
    });
  }, [dueState, fileType, library.data?.files, query, sessionId, speakerId, taskStatus]);

  const selectedFiles = useMemo(
    () => (library.data?.files ?? []).filter((file) => selectedAssetIds.has(file.assetId)),
    [library.data?.files, selectedAssetIds],
  );

  const exportZip = useMutation({
    mutationFn: async () =>
      exportOnboardingFilesZip(eventId, { assetIds: [...selectedAssetIds] }),
    onSuccess: (result) => {
      setExportReceipt(
        `ZIP ready: ${result.fileCount} latest version${result.fileCount === 1 ? "" : "s"} in ${result.filename}.`,
      );
      downloadBlob(result.blob, result.filename);
    },
  });

  function toggleFile(assetId: string) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = visibleFiles.every((file) => next.has(file.assetId));
      for (const file of visibleFiles) {
        if (allVisibleSelected) next.delete(file.assetId);
        else next.add(file.assetId);
      }
      return next;
    });
  }

  function toggleSessionFiles(groupSessionId: string | null, files: FilesLibraryItem[]) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      const groupFiles = files.filter((file) => (file.session?.id ?? "") === (groupSessionId ?? ""));
      const allSelected = groupFiles.every((file) => next.has(file.assetId));
      for (const file of groupFiles) {
        if (allSelected) next.delete(file.assetId);
        else next.add(file.assetId);
      }
      return next;
    });
  }

  const grouped = useMemo(() => {
    const groups: Array<{ sessionId: string | null; title: string; files: FilesLibraryItem[] }> = [];
    for (const file of visibleFiles) {
      const key = file.session?.id ?? null;
      let group = groups.find((candidate) => candidate.sessionId === key);
      if (!group) {
        group = {
          sessionId: key,
          title: file.session?.title ?? "No session",
          files: [],
        };
        groups.push(group);
      }
      group.files.push(file);
    }
    return groups;
  }, [visibleFiles]);

  return (
    <div className="files-library files-library-compact" aria-label="Files library">
      <div className="files-library-toolbar">
        <label className="field search-field files-library-search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
          />
        </label>
        <AppSelect
          label="Session"
          value={sessionId}
          options={[
            { value: "", label: "All sessions" },
            ...(library.data?.filters.sessions.map((session) => ({
              value: session.id,
              label: session.title,
            })) ?? []),
          ]}
          onValueChange={setSessionId}
        />
        <AppSelect
          label="Type"
          value={fileType}
          options={[
            { value: "", label: "Any type" },
            ...(library.data?.filters.fileTypes.map((type) => ({
              value: type,
              label: type,
            })) ?? []),
          ]}
          onValueChange={setFileType}
        />
      </div>
      <div className="files-library-export">
        <span className="files-library-count">
          {selectedFiles.length} selected · {visibleFiles.length} shown
        </span>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleVisible} disabled={visibleFiles.length === 0}>
            {visibleFiles.every((file) => selectedAssetIds.has(file.assetId)) && visibleFiles.length > 0
              ? "Clear"
              : "Select shown"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={selectedAssetIds.size === 0 || exportZip.isPending}
            onClick={() => exportZip.mutate()}
          >
            {exportZip.isPending ? "Preparing…" : "Export ZIP"}
          </button>
          {exportZip.isError ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportZip.mutate()}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
      {exportZip.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {exportZip.error instanceof ApiError ? exportZip.error.message : "ZIP export failed."}
        </p>
      ) : exportReceipt ? (
        <p className="form-message" data-tone="success">{exportReceipt}</p>
      ) : null}
      {library.isPending ? (
        <p className="files-library-empty">Loading files…</p>
      ) : library.isError ? (
        <p className="files-library-empty" role="alert">{library.error.message}</p>
      ) : (library.data?.files.length ?? 0) === 0 ? (
        <p className="files-library-empty">No deliverable files uploaded yet.</p>
      ) : grouped.length === 0 ? (
        <p className="files-library-empty">Nothing matches the current filters.</p>
      ) : (
        <div className="files-library-groups">
          {grouped.map((group) => (
            <section key={group.sessionId ?? "no-session"} className="files-library-group">
              <div className="files-library-group-heading">
                <h3>{group.title}</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleSessionFiles(group.sessionId, visibleFiles)}
                >
                  {group.files.every((file) => selectedAssetIds.has(file.assetId))
                    ? "Clear"
                    : "Select"}
                </button>
              </div>
              <ul className="files-library-list">
                {group.files.map((file) => (
                  <li key={file.assetId}>
                    <label className="files-library-row">
                      <input
                        className="batch-check"
                        type="checkbox"
                        aria-label={`Select ${file.fileName}`}
                        checked={selectedAssetIds.has(file.assetId)}
                        onChange={() => toggleFile(file.assetId)}
                      />
                      <span className="files-library-file">
                        <strong>{file.fileName}</strong>
                        <span className="muted-line">
                          {file.task.title} · v{file.currentVersion} · {formatFileSize(file.size)}
                        </span>
                      </span>
                      <span className="muted-line files-library-meta">
                        {formatWhen(file.uploadedAt)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const TASK_PRESETS = [
  {
    value: "custom",
    label: "Custom task",
    kind: "custom",
    requirement: "manual" as const,
    flag: "",
  },
  {
    value: "employer_approval",
    label: "Employer approval",
    kind: "employer_approval",
    requirement: "file" as const,
    flag: "employer_approval",
  },
  {
    value: "co_speaker_details",
    label: "Co-speaker details",
    kind: "co_speaker_details",
    requirement: "manual" as const,
    flag: "co_speaker_details",
  },
  {
    value: "slides",
    label: "Slide deck upload",
    kind: "slides",
    requirement: "file" as const,
    flag: "",
  },
];

type SpeakerSort =
  | "name-asc"
  | "name-desc"
  | "missing-desc"
  | "missing-asc"
  | "overdue-desc"
  | "overdue-asc"
  | "due-asc"
  | "due-desc"
  | "contact-desc"
  | "contact-asc";

type SpeakerCol = "talk" | "missing" | "overdue" | "due" | "readiness" | "contact";

const SPEAKER_COL_DEFAULTS: Record<SpeakerCol, number> = {
  talk: 260,
  missing: 84,
  overdue: 84,
  due: 118,
  readiness: 140,
  contact: 132,
};

const SPEAKER_COL_MIN: Record<SpeakerCol, number> = {
  talk: 180,
  missing: 72,
  overdue: 72,
  due: 100,
  readiness: 112,
  contact: 112,
};

const SPEAKER_COL_STORAGE = "chartstead:speaker-cols:v1";

function loadSpeakerColWidths(): Record<SpeakerCol, number> {
  try {
    const raw = localStorage.getItem(SPEAKER_COL_STORAGE);
    if (!raw) return { ...SPEAKER_COL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<SpeakerCol, number>>;
    return {
      talk: Math.max(SPEAKER_COL_MIN.talk, Number(parsed.talk) || SPEAKER_COL_DEFAULTS.talk),
      missing: Math.max(
        SPEAKER_COL_MIN.missing,
        Number(parsed.missing) || SPEAKER_COL_DEFAULTS.missing,
      ),
      overdue: Math.max(
        SPEAKER_COL_MIN.overdue,
        Number(parsed.overdue) || SPEAKER_COL_DEFAULTS.overdue,
      ),
      due: Math.max(SPEAKER_COL_MIN.due, Number(parsed.due) || SPEAKER_COL_DEFAULTS.due),
      readiness: Math.max(
        SPEAKER_COL_MIN.readiness,
        Number(parsed.readiness) || SPEAKER_COL_DEFAULTS.readiness,
      ),
      contact: Math.max(
        SPEAKER_COL_MIN.contact,
        Number(parsed.contact) || SPEAKER_COL_DEFAULTS.contact,
      ),
    };
  } catch {
    return { ...SPEAKER_COL_DEFAULTS };
  }
}

function toggleSpeakerSort(current: SpeakerSort, column: SpeakerCol): SpeakerSort {
  if (column === "talk") return current === "name-asc" ? "name-desc" : "name-asc";
  if (column === "missing") return current === "missing-desc" ? "missing-asc" : "missing-desc";
  if (column === "overdue") return current === "overdue-desc" ? "overdue-asc" : "overdue-desc";
  if (column === "due") return current === "due-asc" ? "due-desc" : "due-asc";
  if (column === "readiness") return current === "name-asc" ? "name-desc" : "name-asc";
  return current === "contact-desc" ? "contact-asc" : "contact-desc";
}

function speakerSortAria(current: SpeakerSort, column: SpeakerCol) {
  if (column === "talk") {
    if (current === "name-asc") return "ascending" as const;
    if (current === "name-desc") return "descending" as const;
  }
  if (column === "missing") {
    if (current === "missing-asc") return "ascending" as const;
    if (current === "missing-desc") return "descending" as const;
  }
  if (column === "overdue") {
    if (current === "overdue-asc") return "ascending" as const;
    if (current === "overdue-desc") return "descending" as const;
  }
  if (column === "due") {
    if (current === "due-asc") return "ascending" as const;
    if (current === "due-desc") return "descending" as const;
  }
  if (column === "contact") {
    if (current === "contact-asc") return "ascending" as const;
    if (current === "contact-desc") return "descending" as const;
  }
  return undefined;
}

function sortDirectorySpeakers(
  speakers: OnboardingBoardSpeaker[],
  sort: SpeakerSort,
): OnboardingBoardSpeaker[] {
  const next = [...speakers];
  const dueValue = (speaker: OnboardingBoardSpeaker) => {
    if (speaker.daysUntilNextDue === null) return Number.POSITIVE_INFINITY;
    return speaker.daysUntilNextDue;
  };
  const contactValue = (speaker: OnboardingBoardSpeaker) => {
    if (!speaker.lastContactAt) return 0;
    const time = Date.parse(speaker.lastContactAt);
    return Number.isNaN(time) ? 0 : time;
  };
  switch (sort) {
    case "name-desc":
      next.sort((a, b) => b.name.localeCompare(a.name) || a.speakerId.localeCompare(b.speakerId));
      break;
    case "missing-desc":
      next.sort(
        (a, b) =>
          b.openTaskCount - a.openTaskCount ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "missing-asc":
      next.sort(
        (a, b) =>
          a.openTaskCount - b.openTaskCount ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "overdue-desc":
      next.sort(
        (a, b) =>
          b.overdueCount - a.overdueCount ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "overdue-asc":
      next.sort(
        (a, b) =>
          a.overdueCount - b.overdueCount ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "due-asc":
      next.sort(
        (a, b) =>
          dueValue(a) - dueValue(b) ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "due-desc":
      next.sort(
        (a, b) =>
          dueValue(b) - dueValue(a) ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "contact-desc":
      next.sort(
        (a, b) =>
          contactValue(b) - contactValue(a) ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "contact-asc":
      next.sort(
        (a, b) =>
          contactValue(a) - contactValue(b) ||
          a.name.localeCompare(b.name) ||
          a.speakerId.localeCompare(b.speakerId),
      );
      break;
    case "name-asc":
    default:
      next.sort((a, b) => a.name.localeCompare(b.name) || a.speakerId.localeCompare(b.speakerId));
      break;
  }
  return next;
}

export function OnboardingWorkspace({
  eventId,
  onShellToolsChange,
}: {
  eventId: string;
  onShellToolsChange?: (tools: ReactNode | null) => void;
}) {
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: ["onboarding-board", eventId],
    queryFn: () => fetchOnboardingBoard(eventId),
  });
  const reminderPolicy = useQuery({
    queryKey: ["onboarding-reminder-policy", eventId],
    queryFn: () => fetchOnboardingReminderPolicy(eventId),
  });
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [taskSpeakerIds, setTaskSpeakerIds] = useState<Set<string>>(new Set());
  const [reminderSpeakerIds, setReminderSpeakerIds] = useState<Set<string>>(new Set());
  const [bulkReminderMode, setBulkReminderMode] = useState<"draft" | "send">("draft");
  const [draft, setDraft] = useState<OnboardingReminderDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskPreset, setTaskPreset] = useState(TASK_PRESETS[0]!.value);
  const [taskRequirement, setTaskRequirement] = useState<"manual" | "file" | "ack">(
    "manual",
  );
  const [taskDueAt, setTaskDueAt] = useState("");
  const [speakerSearch, setSpeakerSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<SpeakerDirectoryFilter>("all");
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [filesLibraryOpen, setFilesLibraryOpen] = useState(false);
  const [speakerSort, setSpeakerSort] = useState<SpeakerSort>("name-asc");
  const [inspectorWidth, setInspectorWidth] = useState(640);
  const [queuePaneWidth, setQueuePaneWidth] = useState(0);
  const [colWidths, setColWidths] = useState<Record<SpeakerCol, number>>(loadSpeakerColWidths);
  const inspectorWidthRef = useRef(inspectorWidth);
  const colWidthsRef = useRef(colWidths);
  const tableRef = useRef<HTMLTableElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  inspectorWidthRef.current = inspectorWidth;
  colWidthsRef.current = colWidths;

  useEffect(() => {
    localStorage.setItem(SPEAKER_COL_STORAGE, JSON.stringify(colWidths));
  }, [colWidths]);

  const speakers = board.data?.speakers ?? [];
  const filteredSpeakers = useMemo(
    () =>
      sortDirectorySpeakers(
        filterDirectorySpeakers(speakers, speakerSearch, speakerFilter),
        speakerSort,
      ),
    [speakers, speakerSearch, speakerFilter, speakerSort],
  );
  const filteredSpeakersWithOutstanding = filteredSpeakers.filter(
    (speaker) => speaker.openTaskCount > 0,
  );
  const selected = useMemo(
    () => filteredSpeakers.find((row) => row.speakerId === selectedSpeakerId) ?? null,
    [filteredSpeakers, selectedSpeakerId],
  );
  const taskAttachments = selected?.taskAttachments ?? [];

  useEffect(() => {
    if (filteredSpeakers.length === 0) {
      if (selectedSpeakerId !== null) setSelectedSpeakerId(null);
      return;
    }
    const stillVisible = filteredSpeakers.some((row) => row.speakerId === selectedSpeakerId);
    if (!stillVisible) {
      setSelectedSpeakerId(filteredSpeakers[0]!.speakerId);
    }
  }, [filteredSpeakers, selectedSpeakerId]);

  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [policyMode, setPolicyMode] = useState<"draft" | "send">("draft");
  const [policyDueWindowDays, setPolicyDueWindowDays] = useState(0);
  const [policySuppressHours, setPolicySuppressHours] = useState(72);

  useEffect(() => {
    const policy = reminderPolicy.data;
    if (!policy) return;
    setPolicyEnabled(policy.enabled);
    setPolicyMode(policy.mode);
    setPolicyDueWindowDays(policy.dueWindowDays);
    setPolicySuppressHours(policy.suppressWithinHours);
  }, [reminderPolicy.data]);

  function startColResize(column: SpeakerCol, pointer: ReactPointerEvent<HTMLSpanElement>) {
    pointer.preventDefault();
    pointer.stopPropagation();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const header = handle.closest("th");
    const colEl = tableRef.current?.querySelector<HTMLTableColElement>(`col.col-${column}`);
    const startX = pointer.clientX;
    const startWidth = header?.getBoundingClientRect().width ?? colWidthsRef.current[column];
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      nextWidth = Math.max(SPEAKER_COL_MIN[column], Math.round(startWidth + event.clientX - startX));
      if (colEl) colEl.style.width = `${nextWidth}px`;
    };
    const stop = () => {
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      setColWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  const leadingFixed = 36 + 40;
  const trailingFixed =
    colWidths.missing +
    colWidths.overdue +
    colWidths.due +
    colWidths.readiness +
    colWidths.contact;

  function queueFloorWidth(widths: Record<SpeakerCol, number> = colWidths) {
    return (
      leadingFixed +
      SPEAKER_COL_MIN.talk +
      widths.missing +
      widths.overdue +
      widths.due +
      widths.readiness +
      widths.contact
    );
  }

  function clampInspectorWidth(
    desired: number,
    splitWidth: number,
    widths: Record<SpeakerCol, number> = colWidths,
  ) {
    const floor = queueFloorWidth(widths);
    const maxWidth = Math.max(280, Math.floor(splitWidth - 8 - floor));
    return Math.min(maxWidth, Math.max(280, Math.min(desired, maxWidth)));
  }

  const talkDisplayWidth = (() => {
    if (queuePaneWidth <= 0) return colWidths.talk;
    const roomForTalk = queuePaneWidth - leadingFixed - trailingFixed;
    if (roomForTalk >= colWidths.talk) return colWidths.talk;
    return Math.max(SPEAKER_COL_MIN.talk, roomForTalk);
  })();

  useEffect(() => {
    const splitEl = splitRef.current;
    if (!splitEl) return;
    const apply = () => {
      const splitWidth = splitEl.getBoundingClientRect().width;
      const next = clampInspectorWidth(
        inspectorWidthRef.current,
        splitWidth,
        colWidthsRef.current,
      );
      if (next !== inspectorWidthRef.current) {
        inspectorWidthRef.current = next;
        setInspectorWidth(next);
      }
      splitEl.style.setProperty("--inspector-width", `${next}px`);
      setQueuePaneWidth(Math.max(0, Math.round(splitWidth - 8 - next)));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(splitEl);
    return () => observer.disconnect();
  }, [
    colWidths.talk,
    colWidths.missing,
    colWidths.overdue,
    colWidths.due,
    colWidths.readiness,
    colWidths.contact,
  ]);

  const toggleAddingSpeaker = useCallback(() => {
    setAddingSpeaker((value) => !value);
  }, []);
  const toggleCsvImport = useCallback(() => {
    setCsvImportOpen((value) => !value);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTaskSpeakerIds(new Set([selected.speakerId]));
  }, [selected?.speakerId]);

  const refresh = async (speakerId?: string) => {
    if (speakerId) setSelectedSpeakerId(speakerId);
    await queryClient.invalidateQueries({ queryKey: ["onboarding-board", eventId] });
  };

  const flashTimerRef = useRef<number | null>(null);
  const flash = useCallback((text: string, tone: "success" | "error" = "success") => {
    setMessage(text);
    setMessageTone(tone);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      setMessageTone(null);
      flashTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const activePreset =
    TASK_PRESETS.find((preset) => preset.value === taskPreset) ?? TASK_PRESETS[0]!;

  const createTask = useMutation({
    mutationFn: async () => {
      const speakerIds = [...taskSpeakerIds];
      if (speakerIds.length === 0 && selected) speakerIds.push(selected.speakerId);
      if (speakerIds.length === 0) throw new Error("Select at least one speaker.");
      return createOnboardingTasks(eventId, {
        speakerIds,
        title: taskTitle.trim() || activePreset.label,
        instructions: taskInstructions,
        kind: activePreset.kind,
        completionRequirement: taskRequirement,
        readinessFlag: activePreset.flag || null,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        idempotencyKey: `onboarding-task-${createClientId()}`,
      });
    },
    onSuccess: async (result) => {
      setTaskTitle("");
      setTaskInstructions("");
      setTaskDueAt("");
      setTaskPreset(TASK_PRESETS[0]!.value);
      setTaskRequirement("manual");
      setTaskSpeakerIds(new Set());
      flash(`Assigned ${result.tasks.length} independent task${result.tasks.length === 1 ? "" : "s"}.`);
      await refresh();
    },
    onError: (error) => {
      flash(error instanceof ApiError ? error.message : "Could not create task.", "error");
    },
  });

  const prepareBulkReminder = useMutation({
    mutationFn: () => {
      const speakerIds = [...reminderSpeakerIds];
      if (speakerIds.length > BULK_REMINDER_SPEAKER_LIMIT) {
        throw new ApiError(
          `Choose ${BULK_REMINDER_SPEAKER_LIMIT} speakers or fewer per reminder operation. You have ${speakerIds.length} selected.`,
          400,
        );
      }
      return prepareBulkOnboardingReminders(eventId, {
        speakerIds,
        mode: bulkReminderMode,
        idempotencyKey: `bulk-onboarding-reminder-${createClientId()}`,
      });
    },
    onSuccess: async (result) => {
      setReminderSpeakerIds(new Set());
      const verb = bulkReminderMode === "send" ? "queued" : "drafted";
      flash(
        `Task reminders ${verb}: ${result.counts.prepared} prepared, ${result.counts.queued} queued, ${result.counts.failed} failed, ${result.counts.skipped} skipped. Open a speaker → History to review.`,
        result.counts.failed > 0 ? "error" : "success",
      );
      await refresh();
    },
    onError: (error) => {
      flash(reminderErrorMessage(error, "Could not prepare bulk reminders."), "error");
    },
  });

  const saveReminderPolicy = useMutation({
    mutationFn: () =>
      updateOnboardingReminderPolicy(eventId, {
        enabled: policyEnabled,
        mode: policyMode,
        dueWindowDays: Math.max(0, Math.floor(policyDueWindowDays)),
        suppressWithinHours: Math.max(1, Math.floor(policySuppressHours)),
        unattendedSendAuthorized:
          policyMode === "send"
            ? (reminderPolicy.data?.unattendedSendAuthorized ?? false)
            : false,
      }),
    onSuccess: async () => {
      flash("Automatic reminder settings saved.");
      await queryClient.invalidateQueries({
        queryKey: ["onboarding-reminder-policy", eventId],
      });
    },
    onError: (error) => {
      flash(
        error instanceof ApiError ? error.message : "Could not update reminder policy.",
        "error",
      );
    },
  });

  const runDueReminders = useMutation({
    mutationFn: () => processDueOnboardingReminders(eventId),
    onSuccess: async (result) => {
      flash(
        `Due reminder policy processed ${result.counts.selected} speaker${result.counts.selected === 1 ? "" : "s"}: ${result.counts.prepared} draft(s), ${result.counts.queued} queued.`,
      );
      await refresh();
    },
    onError: (error) => {
      flash(
        error instanceof ApiError ? error.message : "Could not process due reminders.",
        "error",
      );
    },
  });

  async function onPrepareReminder() {
    if (!selected) return;
    try {
      await refresh();
      const prepared = await prepareOnboardingReminder(eventId, selected.speakerId);
      setDraft(prepared);
      flash(
        selected.missingWork.length === 0
          ? "Draft prepared (no open tasks listed). Nothing was sent."
          : "Draft prepared. Nothing was sent.",
      );
      await refresh();
    } catch (error) {
      flash(
        error instanceof ApiError ? error.message : "Could not prepare draft.",
        "error",
      );
      await refresh();
    }
  }

  async function onSaveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      const updated = await updateOnboardingReminder(eventId, draft.id, {
        subject: draft.subject,
        bodyText: draft.bodyText,
      });
      setDraft(updated);
      flash("Draft saved.");
    } catch (error) {
      flash(error instanceof ApiError ? error.message : "Could not save draft.", "error");
    }
  }

  async function onDiscardDraft() {
    if (!draft) return;
    try {
      const discarded = await discardOnboardingReminder(eventId, draft.id);
      setDraft(discarded.status === "discarded" ? null : discarded);
      flash("Draft discarded.");
      await refresh();
    } catch (error) {
      flash(
        error instanceof ApiError ? error.message : "Could not discard draft.",
        "error",
      );
    }
  }

  async function onSendDraft() {
    if (!draft) return;
    try {
      const sent = await sendOnboardingReminder(eventId, draft.id);
      setDraft(sent);
      if (sent.status === "sent") {
        flash("Reminder sent.");
      } else if (sent.status === "failed") {
        flash(
          `Send failed${sent.lastError ? `: ${sent.lastError}` : "."} Outcome kept in history.`,
          "error",
        );
      } else {
        flash(`Send finished with status: ${sent.status}.`);
      }
      await refresh();
    } catch (error) {
      flash(
        error instanceof ApiError ? error.message : "Could not send reminder.",
        "error",
      );
    }
  }

  const selectedCount = reminderSpeakerIds.size;
  const outstandingSpeakerIds = filteredSpeakersWithOutstanding.map(
    (speaker) => speaker.speakerId,
  );
  const outstandingKey = outstandingSpeakerIds.join(",");
  const selectableOutstandingIds = outstandingSpeakerIds.slice(
    0,
    BULK_REMINDER_SPEAKER_LIMIT,
  );
  const allOutstandingSelected =
    selectableOutstandingIds.length > 0 &&
    selectableOutstandingIds.every((speakerId) => reminderSpeakerIds.has(speakerId)) &&
    reminderSpeakerIds.size === selectableOutstandingIds.length;
  const overBulkLimit = selectedCount > BULK_REMINDER_SPEAKER_LIMIT;

  function selectOutstandingSpeakers() {
    const next = new Set(selectableOutstandingIds);
    setReminderSpeakerIds(next);
    if (outstandingSpeakerIds.length > BULK_REMINDER_SPEAKER_LIMIT) {
      flash(
        `Selected the first ${BULK_REMINDER_SPEAKER_LIMIT} of ${outstandingSpeakerIds.length} speakers with open tasks (batch limit). Clear and pick another set for the rest.`,
        "error",
      );
    }
  }

  const batchChrome = (
    <div
      className={`topbar-batch${selectedCount === 0 ? " topbar-batch-idle" : ""}`}
      role="region"
      aria-label="Bulk task reminders"
    >
      <strong className="topbar-batch-count">
        {selectedCount === 0
          ? "None selected"
          : overBulkLimit
            ? `${selectedCount} selected · max ${BULK_REMINDER_SPEAKER_LIMIT}`
            : `${selectedCount} selected`}
      </strong>
      <AppSelect
        label="Action"
        ariaLabel="Reminder action"
        value={bulkReminderMode}
        options={[
          { value: "draft", label: "Prepare drafts for review" },
          { value: "send", label: "Queue sends now" },
        ]}
        onValueChange={(value) =>
          setBulkReminderMode(value === "send" ? "send" : "draft")
        }
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={selectedCount === 0 || overBulkLimit || prepareBulkReminder.isPending}
        title={
          overBulkLimit
            ? `Choose ${BULK_REMINDER_SPEAKER_LIMIT} speakers or fewer per reminder operation.`
            : undefined
        }
        onClick={() => prepareBulkReminder.mutate()}
      >
        {prepareBulkReminder.isPending
          ? "Preparing…"
          : bulkReminderMode === "send"
            ? "Queue sends"
            : "Prepare drafts"}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={selectableOutstandingIds.length === 0 || allOutstandingSelected}
        onClick={selectOutstandingSpeakers}
      >
        Select outstanding
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={selectedCount === 0}
        onClick={() => setReminderSpeakerIds(new Set())}
      >
        Clear
      </button>
    </div>
  );

  const directoryChrome = (
    <div className="topbar-tools-inner">
      <SpeakerDirectoryControls
        search={speakerSearch}
        filter={speakerFilter}
        visibleCount={filteredSpeakers.length}
        totalCount={speakers.length}
        addOpen={addingSpeaker}
        importOpen={csvImportOpen}
        onSearchChange={setSpeakerSearch}
        onFilterChange={setSpeakerFilter}
        onToggleAdd={toggleAddingSpeaker}
        onToggleImport={toggleCsvImport}
      />
      <span className="topbar-tools-spacer" aria-hidden="true" />
      {batchChrome}
    </div>
  );

  useEffect(() => {
    if (!onShellToolsChange) return undefined;
    onShellToolsChange(directoryChrome);
    // directoryChrome is rebuilt each render from the primitives below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid setState loops from fresh JSX
  }, [
    addingSpeaker,
    allOutstandingSelected,
    bulkReminderMode,
    csvImportOpen,
    filteredSpeakers.length,
    onShellToolsChange,
    outstandingKey,
    overBulkLimit,
    prepareBulkReminder.isPending,
    selectedCount,
    speakerFilter,
    speakerSearch,
    speakers.length,
    toggleAddingSpeaker,
    toggleCsvImport,
  ]);

  useEffect(() => {
    if (!onShellToolsChange) return undefined;
    return () => onShellToolsChange(null);
  }, [onShellToolsChange]);

  function startInspectorResize(pointer: ReactPointerEvent<HTMLDivElement>) {
    pointer.preventDefault();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const splitEl = handle.parentElement;
    const startX = pointer.clientX;
    const startWidth = inspectorWidthRef.current;
    const widths = colWidthsRef.current;
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      const splitWidth = splitEl?.getBoundingClientRect().width ?? window.innerWidth;
      nextWidth = clampInspectorWidth(
        startWidth + startX - event.clientX,
        splitWidth,
        widths,
      );
      if (splitEl) {
        splitEl.style.setProperty("--inspector-width", `${nextWidth}px`);
        setQueuePaneWidth(Math.max(0, Math.round(splitWidth - 8 - nextWidth)));
      }
    };
    const stop = () => {
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      inspectorWidthRef.current = nextWidth;
      setInspectorWidth(nextWidth);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  function sortHeader(column: SpeakerCol, label: string) {
    const aria = speakerSortAria(speakerSort, column);
    const sortable = column !== "readiness";
    return (
      <th scope="col" className={`col-${column}`} aria-sort={aria}>
        {sortable ? (
          <button
            type="button"
            className="th-sort"
            onClick={() => setSpeakerSort((current) => toggleSpeakerSort(current, column))}
          >
            {label}
            <span className="th-sort-ind" aria-hidden="true">
              {aria === "ascending" ? "↑" : aria === "descending" ? "↓" : ""}
            </span>
          </button>
        ) : (
          label
        )}
        <span
          className="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          onPointerDown={(event) => startColResize(column, event)}
        />
      </th>
    );
  }

  if (board.isPending) {
    return (
      <div className="work" aria-label="Speakers workspace">
        <p className="empty-state">Loading speakers…</p>
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="work" aria-label="Speakers workspace">
        <div className="submission-error" role="alert">
          <strong>Unable to load speakers.</strong>
          <span>{board.error.message}</span>
        </div>
      </div>
    );
  }

  const overlays = (
    <>
      <SpeakerDirectoryAddPanel
        eventId={eventId}
        open={addingSpeaker}
        onClose={() => setAddingSpeaker(false)}
        onChanged={refresh}
        onMessage={flash}
      />
      <SpeakerCsvImport
        eventId={eventId}
        onChanged={refresh}
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        hideTrigger
      />
    </>
  );

  return (
    <div className="work onboarding-workspace" aria-label="Speakers workspace">
      <h2 className="sr-only">Speaker directory</h2>
      {onShellToolsChange ? null : (
        <div className="toolbar speaker-fallback-toolbar">
          {directoryChrome}
        </div>
      )}
      {overlays}
      {message ? (
        <div
          className="onboarding-toast"
          data-tone={messageTone ?? undefined}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}
      <div
        ref={splitRef}
        className="split"
        style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <div className="table-wrap">
        {speakers.length === 0 ? (
          <p className="empty-state">No event speakers yet.</p>
        ) : filteredSpeakers.length === 0 ? (
          <p className="empty-state">
            No speakers match this search and filter. Try another name, email, or readiness filter.
          </p>
        ) : (
            <table
              ref={tableRef}
              className="grid grid-queue"
              aria-label="Speaker directory"
              style={{ minWidth: queueFloorWidth() }}
            >
              <colgroup>
                <col className="col-batch" />
                <col className="col-avatar" />
                <col className="col-talk" style={{ width: talkDisplayWidth }} />
                <col className="col-missing" style={{ width: colWidths.missing }} />
                <col className="col-overdue" style={{ width: colWidths.overdue }} />
                <col className="col-due" style={{ width: colWidths.due }} />
                <col className="col-readiness" style={{ width: colWidths.readiness }} />
                <col className="col-contact" style={{ width: colWidths.contact }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="col-batch">
                    <input
                      className="batch-check"
                      type="checkbox"
                      aria-label="Select all visible speakers with outstanding work"
                      checked={allOutstandingSelected}
                      disabled={filteredSpeakersWithOutstanding.length === 0}
                      ref={(node) => {
                        if (!node) return;
                        node.indeterminate =
                          selectedCount > 0 &&
                          !allOutstandingSelected &&
                          filteredSpeakersWithOutstanding.some((speaker) =>
                            reminderSpeakerIds.has(speaker.speakerId),
                          );
                      }}
                      onChange={() => {
                        setReminderSpeakerIds((current) => {
                          if (allOutstandingSelected) return new Set();
                          return new Set(
                            filteredSpeakersWithOutstanding.map((speaker) => speaker.speakerId),
                          );
                        });
                      }}
                    />
                  </th>
                  <th scope="col" className="col-avatar">
                    <span className="visually-hidden">Speaker</span>
                  </th>
                  {sortHeader("talk", "Speaker")}
                  {sortHeader("missing", "Missing")}
                  {sortHeader("overdue", "Overdue")}
                  {sortHeader("due", "Next due")}
                  {sortHeader("readiness", "Readiness")}
                  {sortHeader("contact", "Last contact")}
                </tr>
              </thead>
              <tbody>
                {filteredSpeakers.map((row) => {
                  const isSelected = selected?.speakerId === row.speakerId;
                  return (
                    <tr
                      key={row.speakerId}
                      className={`proposal-row${isSelected ? " is-selected" : ""}`}
                      aria-selected={isSelected}
                    >
                      <td className="col-batch">
                        <input
                          className="batch-check"
                          type="checkbox"
                          aria-label={`Select ${row.name} for bulk reminder`}
                          checked={reminderSpeakerIds.has(row.speakerId)}
                          disabled={row.openTaskCount === 0}
                          onClick={(click) => click.stopPropagation()}
                          onChange={() => {
                            setReminderSpeakerIds((current) => {
                              const next = new Set(current);
                              if (next.has(row.speakerId)) next.delete(row.speakerId);
                              else next.add(row.speakerId);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="col-avatar">
                        <span className="avatar" aria-hidden="true">
                          {row.headshotAssetId ? (
                            <img
                              src={`/api/events/${eventId}/speakers/${row.speakerId}/headshot?asset=${encodeURIComponent(row.headshotAssetId)}`}
                              alt=""
                            />
                          ) : (
                            initials(row.name)
                          )}
                        </span>
                      </td>
                      <td className="col-talk">
                        <button
                          type="button"
                          className="proposal-row-link onboarding-speaker-btn"
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => {
                            setSelectedSpeakerId(row.speakerId);
                            setDraft(null);
                          }}
                        >
                          <span className="talk">{row.name}</span>
                          <span className="talk-sub">
                            {row.email} · {row.proposalTitle ?? "Program placement"}
                          </span>
                          <span className="speaker-row-flags">
                            <span className={roleFlagClass(row.role)}>{roleLabel(row.role)}</span>
                            <span className={workflowFlagClass(row.workflowStatus)}>
                              {speakerWorkflowLabels[row.workflowStatus] ?? row.workflowStatus}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="col-missing onboarding-num">{row.openTaskCount}</td>
                      <td className="col-overdue onboarding-num">{row.overdueCount}</td>
                      <td className="col-due muted">
                        {row.daysUntilNextDue !== null && row.daysUntilNextDue < 0 ? (
                          <span className="due-label is-due-soon">
                            {daysLabel(row.daysUntilNextDue)}
                          </span>
                        ) : (
                          daysLabel(row.daysUntilNextDue)
                        )}
                      </td>
                      <td className="col-readiness muted">
                        {row.readinessFlags.length > 0
                          ? row.readinessFlags
                              .map((flag) => humanFlag(flag))
                              .filter(Boolean)
                              .join(", ")
                          : "None"}
                      </td>
                      <td className="col-contact">
                        {row.lastContactAt ? (
                          <div className="onboarding-contact">
                            <strong>{contactLabel(row.lastContactStatus)}</strong>
                            <span className="muted">
                              {formatWhen(row.lastContactAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="muted">No contact yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        )}
        </div>
        <div
          className="inspector-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize speaker inspector"
          aria-valuenow={inspectorWidth}
          tabIndex={0}
          onPointerDown={startInspectorResize}
          onKeyDown={(event) => {
            const splitWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              const next = clampInspectorWidth(inspectorWidthRef.current + 24, splitWidth);
              inspectorWidthRef.current = next;
              setInspectorWidth(next);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              const next = clampInspectorWidth(inspectorWidthRef.current - 24, splitWidth);
              inspectorWidthRef.current = next;
              setInspectorWidth(next);
            }
          }}
        />
        <aside
          className={`inspector${selected ? " has-selection" : ""}`}
          aria-label="Speaker detail"
        >
      {selected ? (
        <div className="inspector-content speaker-inspector">
          <header className="speaker-inspector-head">
            <div className="avatar avatar-lg" aria-hidden="true">
              {selected.headshotAssetId ? (
                <img
                  src={`/api/events/${eventId}/speakers/${selected.speakerId}/headshot?asset=${encodeURIComponent(selected.headshotAssetId)}`}
                  alt=""
                />
              ) : (
                initials(selected.name)
              )}
            </div>
            <div className="speaker-inspector-identity">
              <h2>{selected.name}</h2>
              <div className="speaker-row-flags">
                <span className={roleFlagClass(selected.role)}>{roleLabel(selected.role)}</span>
                <span className={workflowFlagClass(selected.workflowStatus)}>
                  {speakerWorkflowLabels[selected.workflowStatus] ?? selected.workflowStatus}
                </span>
                {selected.proposalTitle ? (
                  <span className="speaker-inspector-placement">{selected.proposalTitle}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="inspector-close btn btn-secondary btn-sm"
              onClick={() => {
                setDraft(null);
                setSelectedSpeakerId(filteredSpeakers[0]?.speakerId ?? null);
              }}
            >
              Close
            </button>
          </header>

          <div className="inspector-body">
            <div className="onboarding-detail-col">
                <details
                  className="onboarding-disclosure onboarding-disclosure-card"
                  open={selected.missingWork.length > 0 && selected.missingWork.length <= 6}
                >
                  <summary>
                    <span>Missing work</span>
                    <span className="muted-line">{selected.missingWork.length} open</span>
                  </summary>
                  <div className="onboarding-disclosure-body">
                    {selected.missingWork.length === 0 ? (
                      <p className="muted-line">Nothing open for this speaker.</p>
                    ) : (
                      <ul className="onboarding-missing-list">
                        {selected.missingWork.map((item) => {
                          const overdue =
                            item.daysUntilDue !== null && item.daysUntilDue < 0;
                          return (
                            <li key={item.taskId}>
                              <div className="onboarding-missing-main">
                                <strong>{item.title}</strong>
                                {item.readinessFlag ? (
                                  <span className="muted-line">
                                    {humanFlag(item.readinessFlag)}
                                  </span>
                                ) : null}
                              </div>
                              <span className="muted-line">
                                {overdue ? (
                                  <span className="is-due-soon">
                                    {daysLabel(item.daysUntilDue)}
                                  </span>
                                ) : (
                                  daysLabel(item.daysUntilDue)
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </details>

                <SpeakerCurrentProfile
                  key={selected.speakerId}
                  eventId={eventId}
                  speaker={selected}
                  onChanged={refresh}
                  onMessage={flash}
                />
                <SpeakerParticipation
                  key={`${selected.speakerId}-participation`}
                  eventId={eventId}
                  speaker={selected}
                  onChanged={() => refresh(selected.speakerId)}
                  onMessage={flash}
                />

                <details className="onboarding-disclosure">
                  <summary>
                    <span>Assign task</span>
                    <span className="muted-line">To {selected.name} by default</span>
                  </summary>
                  <form
                    className="onboarding-form is-compact"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createTask.mutateAsync();
                    }}
                  >
                    <p className="speaker-assign-target">
                      Assigning to <strong>{selected.name}</strong>
                      {taskSpeakerIds.size > 1
                        ? ` + ${taskSpeakerIds.size - 1} other${taskSpeakerIds.size - 1 === 1 ? "" : "s"}`
                        : ""}
                    </p>
                    {filteredSpeakers.length > 1 ? (
                      <div>
                        <p className="muted-line" style={{ marginBottom: 6 }}>
                          Also include
                        </p>
                        <div className="speaker-include-list" role="group" aria-label="Additional speakers">
                          {filteredSpeakers
                            .filter((speaker) => speaker.speakerId !== selected.speakerId)
                            .map((speaker) => {
                              const pressed = taskSpeakerIds.has(speaker.speakerId);
                              return (
                                <button
                                  key={speaker.speakerId}
                                  type="button"
                                  className="speaker-include-box"
                                  aria-pressed={pressed}
                                  onClick={() => {
                                    setTaskSpeakerIds((current) => {
                                      const next = new Set(current);
                                      next.add(selected.speakerId);
                                      if (next.has(speaker.speakerId)) next.delete(speaker.speakerId);
                                      else next.add(speaker.speakerId);
                                      return next;
                                    });
                                  }}
                                >
                                  {speaker.name}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}
                    <AppSelect
                      label="Task type"
                      value={taskPreset}
                      options={TASK_PRESETS.map((preset) => ({
                        value: preset.value,
                        label: preset.label,
                      }))}
                      onValueChange={(next) => {
                        setTaskPreset(next);
                        const preset =
                          TASK_PRESETS.find((item) => item.value === next) ??
                          TASK_PRESETS[0]!;
                        setTaskRequirement(preset.requirement);
                        if (
                          !taskTitle.trim() ||
                          TASK_PRESETS.some((item) => item.label === taskTitle)
                        ) {
                          setTaskTitle(preset.value === "custom" ? "" : preset.label);
                        }
                      }}
                    />
                    <label>
                      Title
                      <input
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        placeholder={activePreset.label}
                        required
                      />
                    </label>
                    <label>
                      Instructions
                      <textarea
                        value={taskInstructions}
                        onChange={(event) => setTaskInstructions(event.target.value)}
                        rows={2}
                        placeholder="What the speaker needs to finish"
                      />
                    </label>
                    <AppSelect
                      label="Completion"
                      value={taskRequirement}
                      options={[
                        { value: "manual", label: "Mark complete in portal" },
                        { value: "file", label: "Upload a file" },
                        { value: "ack", label: "Acknowledgement" },
                      ]}
                      onValueChange={(value) =>
                        setTaskRequirement(value as "manual" | "file" | "ack")
                      }
                    />
                    <label>
                      Due
                      <input
                        type="datetime-local"
                        value={taskDueAt}
                        onChange={(event) => setTaskDueAt(event.target.value)}
                      />
                    </label>
                    {activePreset.flag ? (
                      <p className="muted-line">
                        Adds readiness flag: {humanFlag(activePreset.flag)}
                      </p>
                    ) : null}
                    <div className="onboarding-actions onboarding-actions-end">
                      <button
                        className="btn btn-primary btn-sm"
                        type="submit"
                        disabled={createTask.isPending}
                      >
                        {createTask.isPending
                          ? "Assigning…"
                          : `Assign to ${Math.max(taskSpeakerIds.size, 1)} speaker${Math.max(taskSpeakerIds.size, 1) === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </form>
                </details>

                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>Assisted reminder</h3>
                    {draft ? <span>{contactLabel(draft.status)}</span> : null}
                  </div>
                  {!draft ? (
                    <div className="onboarding-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void onPrepareReminder()}
                      >
                        Prepare draft
                      </button>
                    </div>
                  ) : (
                    <form className="onboarding-form is-compact onboarding-draft-form" onSubmit={onSaveDraft}>
                      <p className="muted-line">
                        Status: <strong>{contactLabel(draft.status)}</strong>
                        {draft.lastError ? ` · ${draft.lastError}` : ""}
                      </p>
                      <label>
                        Subject
                        <input
                          value={draft.subject}
                          onChange={(event) =>
                            setDraft({ ...draft, subject: event.target.value })
                          }
                          disabled={draft.status !== "draft"}
                        />
                      </label>
                      <label>
                        Body
                        <textarea
                          value={draft.bodyText}
                          onChange={(event) =>
                            setDraft({ ...draft, bodyText: event.target.value })
                          }
                          rows={6}
                          disabled={draft.status !== "draft"}
                        />
                      </label>
                      <div className="onboarding-actions onboarding-actions-end">
                        {draft.status === "draft" ? (
                          <>
                            <button className="btn btn-secondary btn-sm" type="submit">
                              Save edits
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              onClick={() => void onDiscardDraft()}
                            >
                              Discard
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => void onSendDraft()}
                            >
                              Send explicitly
                            </button>
                          </>
                        ) : draft.status === "failed" ? (
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={() => void onSendDraft()}
                          >
                            Retry send
                          </button>
                        ) : null}
                      </div>
                    </form>
                  )}
                </div>

                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>Deliverables</h3>
                    <span>{taskAttachments.length} files</span>
                  </div>
                  {taskAttachments.length === 0 ? (
                    <p className="muted-line">No task files uploaded yet.</p>
                  ) : (
                    <ul className="onboarding-deliverable-list">
                      {taskAttachments.map((attachment) => (
                        <li key={attachment.assetId}>
                          <div className="onboarding-deliverable-main">
                            <strong>{attachment.fileName}</strong>
                            <p className="muted-line">
                              {formatFileSize(attachment.size)} · {attachment.task.title} ·{" "}
                              {formatWhen(attachment.uploadedAt)}
                            </p>
                          </div>
                          <div className="onboarding-deliverable-actions">
                            {attachment.previewable ? (
                              <a
                                className="btn btn-secondary btn-xs"
                                href={organizerAssetUrl(eventId, attachment.assetId, "inline")}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Preview
                              </a>
                            ) : null}
                            <a
                              className="btn btn-secondary btn-xs"
                              href={organizerAssetUrl(eventId, attachment.assetId, "attachment")}
                            >
                              Download
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <details
                  className="onboarding-disclosure onboarding-disclosure-card"
                  open={selected.history.length > 0 && selected.history.length <= 5}
                >
                  <summary>
                    <span>History</span>
                    <span className="muted-line">{selected.history.length} entries</span>
                  </summary>
                  <div className="onboarding-disclosure-body">
                    {selected.history.length === 0 ? (
                      <p className="muted-line">No history yet.</p>
                    ) : (
                      <div className="onboarding-history-scroll">
                        <ul className="onboarding-history-list">
                          {selected.history.map((entry) => (
                            <li key={entry.id}>
                              <time dateTime={entry.createdAt}>
                                {formatWhen(entry.createdAt)}
                              </time>
                              <div>
                                <strong>{humanHistoryType(entry.type)}</strong>
                                <p>{entry.summary}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>

                <div className="onboarding-inspector-utilities">
                  <details className="onboarding-disclosure">
                    <summary>
                      <span>Automatic reminders</span>
                    </summary>
                    <form
                      className="onboarding-form is-compact onboarding-disclosure-body onboarding-policy-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveReminderPolicy.mutate();
                      }}
                    >
                      <label className="onboarding-check-row">
                        <input
                          className="batch-check"
                          type="checkbox"
                          checked={policyEnabled}
                          onChange={(event) => setPolicyEnabled(event.target.checked)}
                        />
                        <span>Enable automatic due reminders</span>
                      </label>
                      <AppSelect
                        label="When due"
                        value={policyMode}
                        options={[
                          { value: "draft", label: "Prepare drafts for review" },
                          { value: "send", label: "Queue sends automatically" },
                        ]}
                        onValueChange={(value) =>
                          setPolicyMode(value === "send" ? "send" : "draft")
                        }
                      />
                      <label>
                        Due window (days)
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={policyDueWindowDays}
                          onChange={(event) =>
                            setPolicyDueWindowDays(Number(event.target.value) || 0)
                          }
                        />
                      </label>
                      <label>
                        Suppress within (hours)
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={policySuppressHours}
                          onChange={(event) =>
                            setPolicySuppressHours(Number(event.target.value) || 1)
                          }
                        />
                      </label>
                      <div className="onboarding-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={saveReminderPolicy.isPending || reminderPolicy.isPending}
                        >
                          {saveReminderPolicy.isPending ? "Saving…" : "Save settings"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={runDueReminders.isPending || !policyEnabled}
                          onClick={() => runDueReminders.mutate()}
                        >
                          Run due now
                        </button>
                      </div>
                    </form>
                  </details>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm files-library-open"
                    onClick={() => setFilesLibraryOpen(true)}
                  >
                    Open files library
                  </button>
                </div>
              </div>
            </div>
          </div>
      ) : (
        <div className="inspector-body">
          <p className="empty-state">Select a speaker to inspect profile, tasks, and files.</p>
        </div>
      )}
        </aside>
      </div>
      {filesLibraryOpen ? (
        <div
          className="event-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFilesLibraryOpen(false);
          }}
        >
          <section
            className="event-dialog files-library-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="files-library-title"
          >
            <div className="event-dialog-heading">
              <div>
                <p className="eyebrow">Deliverables</p>
                <h2 id="files-library-title">Files library</h2>
                <p>
                  {selected
                    ? `Latest uploads for ${selected.name} and the wider event roster.`
                    : "Latest speaker deliverables for this event."}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setFilesLibraryOpen(false)}
              >
                Close
              </button>
            </div>
            <FilesLibraryPanel
              eventId={eventId}
              focusSpeakerId={selected?.speakerId}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

export type { OnboardingBoardSpeaker };
