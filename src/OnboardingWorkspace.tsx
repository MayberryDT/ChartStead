import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  FilesLibraryItem,
  OnboardingBoardSpeaker,
  OnboardingBulkReminderResult,
  OnboardingReminderDraft,
} from "../shared/events";
import { formatFileSize } from "../shared/onboarding-tasks";
import {
  addOrganizerDeliverableComment,
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
  SpeakerDirectoryToolbar,
  SpeakerParticipation,
  type SpeakerDirectoryFilter,
} from "./SpeakerDirectory";
import { SpeakerCsvImport } from "./SpeakerCsvImport";

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

function FilesLibraryPanel({ eventId }: { eventId: string }) {
  const library = useQuery({
    queryKey: ["onboarding-files-library", eventId],
    queryFn: () => fetchOnboardingFilesLibrary(eventId),
  });
  const [query, setQuery] = useState("");
  const [speakerId, setSpeakerId] = useState("");
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
    <section className="operations-panel files-library" aria-label="Files library">
      <div className="panel-heading">
        <h2>Files library</h2>
        <span>
          {library.data?.files.length ?? 0} latest deliverable{(library.data?.files.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>
      <div className="files-library-controls">
        <label>
          Search files
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Speaker, session, task, or file"
          />
        </label>
        <label>
          Speaker
          <select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
            <option value="">All speakers</option>
            {library.data?.filters.speakers.map((speaker) => (
              <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
            ))}
          </select>
        </label>
        <label>
          Session
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            <option value="">All sessions</option>
            {library.data?.filters.sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.title}</option>
            ))}
          </select>
        </label>
        <label>
          Task status
          <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
            <option value="">Any status</option>
            {library.data?.filters.taskStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          File type
          <select value={fileType} onChange={(event) => setFileType(event.target.value)}>
            <option value="">Any type</option>
            {library.data?.filters.fileTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Due state
          <select value={dueState} onChange={(event) => setDueState(event.target.value)}>
            <option value="">Any due state</option>
            {library.data?.filters.dueStates.map((state) => (
              <option key={state} value={state}>{dueStateLabel(state)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="files-library-export">
        <div>
          <strong>{selectedFiles.length} selected</strong>
          <p className="muted-line">
            Export includes only selected latest versions. No server copy is kept; regenerate if the download expires in your browser.
          </p>
          {selectedFiles.length > 0 ? (
            <p className="muted-line">
              Included versions: {selectedFiles.map((file) => `${file.fileName} v${file.currentVersion}`).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleVisible} disabled={visibleFiles.length === 0}>
            {visibleFiles.every((file) => selectedAssetIds.has(file.assetId)) && visibleFiles.length > 0
              ? "Clear visible"
              : "Select visible"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={selectedAssetIds.size === 0 || exportZip.isPending}
            onClick={() => exportZip.mutate()}
          >
            {exportZip.isPending ? "Preparing ZIP…" : "Export ZIP"}
          </button>
          {exportZip.isError ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportZip.mutate()}>
              Retry export
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
        <p className="empty-state padded">Loading files…</p>
      ) : library.isError ? (
        <p className="empty-state padded" role="alert">{library.error.message}</p>
      ) : grouped.length === 0 ? (
        <p className="empty-state padded">No files match these filters.</p>
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
                    ? "Clear session"
                    : "Select session"}
                </button>
              </div>
              <div className="onboarding-table-wrap">
                <table className="onboarding-table files-library-table">
                  <thead>
                    <tr>
                      <th scope="col">Select</th>
                      <th scope="col">File</th>
                      <th scope="col">Speaker</th>
                      <th scope="col">Task</th>
                      <th scope="col">Uploaded</th>
                      <th scope="col">Type</th>
                      <th scope="col">Version</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.files.map((file) => (
                      <tr key={file.assetId}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${file.fileName}`}
                            checked={selectedAssetIds.has(file.assetId)}
                            onChange={() => toggleFile(file.assetId)}
                          />
                        </td>
                        <td>
                          <strong>{file.fileName}</strong>
                          <span className="muted-line"> {formatFileSize(file.size)}</span>
                          <p className="muted-line">{file.safeExportPath}</p>
                        </td>
                        <td>{file.speaker.name}</td>
                        <td>{file.task.title}</td>
                        <td>{formatWhen(file.uploadedAt)}</td>
                        <td>{file.fileType}</td>
                        <td>v{file.currentVersion} of {file.versionCount}</td>
                        <td>{file.task.status} · {dueStateLabel(file.dueState)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
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
  const [bulkReminderResult, setBulkReminderResult] =
    useState<OnboardingBulkReminderResult | null>(null);
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const speakers = board.data?.speakers ?? [];
  const filteredSpeakers = useMemo(
    () => filterDirectorySpeakers(speakers, speakerSearch, speakerFilter),
    [speakers, speakerSearch, speakerFilter],
  );
  const filteredSpeakersWithOutstanding = filteredSpeakers.filter(
    (speaker) => speaker.openTaskCount > 0,
  );
  const selectedReminderSpeakers = speakers.filter((speaker) =>
    reminderSpeakerIds.has(speaker.speakerId),
  );
  const selected = useMemo(
    () =>
      filteredSpeakers.find((row) => row.speakerId === selectedSpeakerId) ??
      filteredSpeakers[0] ??
      null,
    [filteredSpeakers, selectedSpeakerId],
  );
  const taskAttachments = selected?.taskAttachments ?? [];

  const toggleAddingSpeaker = useCallback(() => {
    setAddingSpeaker((value) => !value);
  }, []);
  const toggleCsvImport = useCallback(() => {
    setCsvImportOpen((value) => !value);
  }, []);

  useEffect(() => {
    if (!onShellToolsChange) return undefined;
    onShellToolsChange(
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
      />,
    );
    return () => onShellToolsChange(null);
  }, [
    addingSpeaker,
    csvImportOpen,
    filteredSpeakers.length,
    onShellToolsChange,
    speakerFilter,
    speakerSearch,
    speakers.length,
    toggleAddingSpeaker,
    toggleCsvImport,
  ]);


  const refresh = async (speakerId?: string) => {
    if (speakerId) setSelectedSpeakerId(speakerId);
    await queryClient.invalidateQueries({ queryKey: ["onboarding-board", eventId] });
  };

  async function onAddDeliverableComment(assetId: string, event: FormEvent) {
    event.preventDefault();
    const body = (commentDrafts[assetId] ?? "").trim();
    if (!body) return;
    try {
      await addOrganizerDeliverableComment(eventId, assetId, body);
      setCommentDrafts((current) => ({ ...current, [assetId]: "" }));
      flash("Comment added.");
      await refresh(selected?.speakerId);
    } catch (error) {
      flash(error instanceof ApiError ? error.message : "Could not add comment.", "error");
    }
  }

  const flash = useCallback((text: string, tone: "success" | "error" = "success") => {
    setMessage(text);
    setMessageTone(tone);
  }, []);

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
        idempotencyKey: `onboarding-task-${crypto.randomUUID()}`,
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
    mutationFn: () =>
      prepareBulkOnboardingReminders(eventId, {
        speakerIds: [...reminderSpeakerIds],
        mode: bulkReminderMode,
        idempotencyKey: `bulk-onboarding-reminder-${crypto.randomUUID()}`,
      }),
    onSuccess: async (result) => {
      setBulkReminderResult(result);
      setReminderSpeakerIds(new Set());
      flash(
        `Bulk reminders: ${result.counts.prepared} prepared, ${result.counts.queued} queued, ${result.counts.failed} failed, ${result.counts.skipped} skipped.`,
        result.counts.failed > 0 ? "error" : "success",
      );
      await refresh();
    },
    onError: (error) => {
      flash(
        error instanceof ApiError ? error.message : "Could not prepare bulk reminders.",
        "error",
      );
    },
  });

  const saveReminderPolicy = useMutation({
    mutationFn: () => {
      const current = reminderPolicy.data;
      return updateOnboardingReminderPolicy(eventId, {
        enabled: !(current?.enabled ?? false),
        mode: current?.mode ?? "draft",
        dueWindowDays: current?.dueWindowDays ?? 0,
        suppressWithinHours: current?.suppressWithinHours ?? 72,
        unattendedSendAuthorized: current?.unattendedSendAuthorized ?? false,
      });
    },
    onSuccess: async (policy) => {
      flash(
        policy.enabled
          ? "Automatic reminder policy enabled. It defaults to draft review unless unattended send authority is explicitly granted."
          : "Automatic reminder policy disabled.",
      );
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
      setBulkReminderResult(result);
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

  if (board.isPending) {
    return (
      <div className="workspace">
        <section className="operations-panel">
          <p className="empty-state padded">Loading onboarding board…</p>
        </section>
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="workspace">
        <section className="operations-panel">
          <p className="empty-state padded" role="alert">
            {board.error.message}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace onboarding-workspace">
      <section className="operations-panel onboarding-board">
        <div className="panel-heading">
          <h2>Speaker directory</h2>
          <span>Identity, participation, and readiness</span>
        </div>
        {onShellToolsChange ? (
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
        ) : (
          <>
            <SpeakerDirectoryToolbar
              eventId={eventId}
              search={speakerSearch}
              filter={speakerFilter}
              visibleCount={filteredSpeakers.length}
              totalCount={speakers.length}
              onSearchChange={setSpeakerSearch}
              onFilterChange={setSpeakerFilter}
              onChanged={refresh}
              onMessage={flash}
            />
            <SpeakerCsvImport eventId={eventId} onChanged={refresh} />
          </>
        )}
        <div className="onboarding-card onboarding-bulk-reminders">
          <div className="onboarding-card-head">
            <h3>Bulk task reminders</h3>
            <span>
              {selectedReminderSpeakers.length} selected · {filteredSpeakersWithOutstanding.length} shown with open tasks
            </span>
          </div>
          <p className="muted-line">
            Select speakers with outstanding work, then prepare one audited reminder operation. Draft mode never sends; send mode only queues through the existing outbox and retry path.
          </p>
          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setReminderSpeakerIds(
                  new Set(filteredSpeakersWithOutstanding.map((speaker) => speaker.speakerId)),
                )
              }
              disabled={filteredSpeakersWithOutstanding.length === 0}
            >
              Select shown outstanding
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setReminderSpeakerIds(new Set())}
              disabled={reminderSpeakerIds.size === 0}
            >
              Clear reminder selection
            </button>
            <label>
              Reminder action
              <select
                value={bulkReminderMode}
                onChange={(event) =>
                  setBulkReminderMode(event.target.value === "send" ? "send" : "draft")
                }
              >
                <option value="draft">Prepare drafts for review</option>
                <option value="send">Queue sends now</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={reminderSpeakerIds.size === 0 || prepareBulkReminder.isPending}
              onClick={() => prepareBulkReminder.mutate()}
            >
              {prepareBulkReminder.isPending
                ? "Preparing…"
                : `Prepare ${reminderSpeakerIds.size} reminder${reminderSpeakerIds.size === 1 ? "" : "s"}`}
            </button>
          </div>
          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saveReminderPolicy.isPending || reminderPolicy.isPending}
              onClick={() => saveReminderPolicy.mutate()}
            >
              {reminderPolicy.data?.enabled ? "Disable automatic due reminders" : "Enable automatic due reminders"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={runDueReminders.isPending || !reminderPolicy.data?.enabled}
              onClick={() => runDueReminders.mutate()}
            >
              Run due reminder policy now
            </button>
            <span className="muted-line">
              Policy: {reminderPolicy.data?.enabled ? "enabled" : "off"} · mode {reminderPolicy.data?.mode ?? "draft"} · suppress {reminderPolicy.data?.suppressWithinHours ?? 72}h
            </span>
          </div>
          {bulkReminderResult ? (
            <div className="onboarding-reminder-result" aria-live="polite">
              <p className="muted-line">
                Last operation: {bulkReminderResult.counts.selected} selected · {bulkReminderResult.counts.prepared} prepared · {bulkReminderResult.counts.queued} queued · {bulkReminderResult.counts.sent} sent · {bulkReminderResult.counts.failed} failed · {bulkReminderResult.counts.retryScheduled} retry scheduled
              </p>
              <ul className="onboarding-history-list">
                {bulkReminderResult.recipients.map((recipient) => (
                  <li key={`${bulkReminderResult.idempotencyKey}-${recipient.speakerId}`}>
                    <strong>{recipient.speakerName}</strong>
                    <div>
                      <span>{contactLabel(recipient.status)}</span>
                      <p className="muted-line">
                        {recipient.reason} Tasks: {recipient.taskSummaries.map((task) => `${task.title}${task.dueAt ? ` (${formatWhen(task.dueAt)})` : ""}`).join(", ") || "none"}.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {message ? (
          <p className="form-message onboarding-flash" data-tone={messageTone ?? undefined}>
            {message}
          </p>
        ) : null}
        {speakers.length === 0 ? (
          <div className="empty-state padded">
            <p>No event speakers yet.</p>
            <p>No onboarding tasks yet.</p>
          </div>
        ) : filteredSpeakers.length === 0 ? (
          <p className="empty-state padded">No speakers match this search and filter.</p>
        ) : (
          <div className="onboarding-table-wrap">
            <table className="onboarding-table">
              <thead>
                <tr>
                  <th scope="col">Remind</th>
                  <th scope="col">Speaker</th>
                  <th scope="col">Missing</th>
                  <th scope="col">Overdue</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Readiness</th>
                  <th scope="col">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpeakers.map((row) => {
                  const isSelected = selected?.speakerId === row.speakerId;
                  return (
                    <tr
                      key={row.speakerId}
                      className={isSelected ? "is-selected" : undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name} for bulk reminder`}
                          checked={reminderSpeakerIds.has(row.speakerId)}
                          disabled={row.openTaskCount === 0}
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
                      <td>
                        <button
                          type="button"
                          className="onboarding-speaker-btn"
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => {
                            setSelectedSpeakerId(row.speakerId);
                            setDraft(null);
                          }}
                        >
                          <strong>{row.name}</strong>
                          <span>{row.email}</span>
                          <span>
                            {row.proposalTitle ?? "Program placement"} · {row.role}
                          </span>
                        </button>
                      </td>
                      <td className="onboarding-num">{row.openTaskCount}</td>
                      <td
                        className={
                          row.overdueCount > 0
                            ? "onboarding-num is-overdue"
                            : "onboarding-num"
                        }
                      >
                        {row.overdueCount}
                      </td>
                      <td
                        className={
                          row.daysUntilNextDue !== null && row.daysUntilNextDue < 0
                            ? "is-overdue"
                            : "muted-line"
                        }
                      >
                        {daysLabel(row.daysUntilNextDue)}
                      </td>
                      <td className="muted-line">
                        {row.readinessFlags.length > 0
                          ? row.readinessFlags
                              .map((flag) => humanFlag(flag))
                              .filter(Boolean)
                              .join(", ")
                          : "None"}
                      </td>
                      <td>
                        {row.lastContactAt ? (
                          <div className="onboarding-contact">
                            <strong>{contactLabel(row.lastContactStatus)}</strong>
                            <span className="muted-line">
                              {formatWhen(row.lastContactAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="muted-line">No contact yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <FilesLibraryPanel eventId={eventId} />

      {selected ? (
        <section className="operations-panel onboarding-detail" aria-label="Speaker detail">
          <div className="panel-heading">
            <h2>{selected.name}</h2>
            <span>
              {selected.email}
              {selected.proposalTitle
                ? ` · ${selected.proposalTitle} · ${selected.role}`
                : ` · ${selected.role}`}
            </span>
          </div>

          <div className="onboarding-detail-body">
            <div className="onboarding-detail-grid">
              <div className="onboarding-detail-col">
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
                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>Missing work</h3>
                    <span>{selected.missingWork.length} open</span>
                  </div>
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
                            <span className={overdue ? "is-overdue" : "muted-line"}>
                              {daysLabel(item.daysUntilDue)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
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
                          <div>
                            <strong>{attachment.fileName}</strong>
                            <p className="muted-line">
                              {attachment.mime} · {formatFileSize(attachment.size)} · uploaded {formatWhen(attachment.uploadedAt)}
                            </p>
                            <p className="muted-line">
                              {attachment.uploader.name} ({attachment.uploader.email}) · {attachment.task.title} · {attachment.speaker.name}
                              {attachment.session ? ` · ${attachment.session.title} (${attachment.session.format})` : " · No session"}
                            </p>
                            <details className="onboarding-deliverable-versions">
                              <summary>
                                Latest version v{attachment.version} · {attachment.versions.length} total
                              </summary>
                              <ol>
                                {attachment.versions.map((version) => (
                                  <li key={version.assetId}>
                                    <div>
                                      <strong>
                                        Version {version.version}
                                        {version.isLatest ? " (latest)" : ""}
                                      </strong>
                                      <span className="muted-line">
                                        {" "}
                                        · {version.fileName} · {formatFileSize(version.size)} · uploaded {formatWhen(version.uploadedAt)}
                                      </span>
                                      <a
                                        className="btn btn-secondary btn-sm"
                                        href={organizerAssetUrl(eventId, version.assetId, "attachment")}
                                      >
                                        Download
                                      </a>
                                    </div>
                                    {version.comments.length > 0 ? (
                                      <ul className="onboarding-deliverable-comments">
                                        {version.comments.map((comment) => (
                                          <li key={comment.id}>
                                            <strong>
                                              {comment.author.name} · {comment.author.role}
                                            </strong>
                                            <span className="muted-line"> · {formatWhen(comment.createdAt)}</span>
                                            <p>{comment.body}</p>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                    <form onSubmit={(event) => void onAddDeliverableComment(version.assetId, event)}>
                                      <label>
                                        Comment on version {version.version}
                                        <textarea
                                          value={commentDrafts[version.assetId] ?? ""}
                                          onChange={(event) =>
                                            setCommentDrafts((current) => ({
                                              ...current,
                                              [version.assetId]: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <button className="btn btn-secondary btn-sm" type="submit">
                                        Add comment
                                      </button>
                                    </form>
                                  </li>
                                ))}
                              </ol>
                            </details>
                          </div>
                          <div className="onboarding-actions">
                            {attachment.previewable ? (
                              <a
                                className="btn btn-secondary btn-sm"
                                href={organizerAssetUrl(eventId, attachment.assetId, "inline")}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Preview
                              </a>
                            ) : null}
                            <a
                              className="btn btn-secondary btn-sm"
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

                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>History</h3>
                  </div>
                  {selected.history.length === 0 ? (
                    <p className="muted-line">No history yet.</p>
                  ) : (
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
                  )}
                </div>
              </div>

              <div className="onboarding-detail-col">
                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>Assign task</h3>
                  </div>
                  <form
                    className="onboarding-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createTask.mutateAsync();
                    }}
                  >
                    <fieldset className="onboarding-speaker-selection">
                      <legend>Speakers</legend>
                      {filteredSpeakers.map((speaker) => (
                        <label key={speaker.speakerId}>
                          <input
                            type="checkbox"
                            checked={taskSpeakerIds.has(speaker.speakerId)}
                            onChange={() => {
                              setTaskSpeakerIds((current) => {
                                const next = new Set(current);
                                if (next.has(speaker.speakerId)) next.delete(speaker.speakerId);
                                else next.add(speaker.speakerId);
                                return next;
                              });
                            }}
                          />
                          {speaker.name}
                        </label>
                      ))}
                    </fieldset>
                    <label>
                      Task type
                      <select
                        value={taskPreset}
                        onChange={(event) => {
                          const next = event.target.value;
                          setTaskPreset(next);
                          const preset =
                            TASK_PRESETS.find((item) => item.value === next) ??
                            TASK_PRESETS[0]!;
                          setTaskRequirement(preset.requirement);
                          if (
                            !taskTitle.trim() ||
                            TASK_PRESETS.some((p) => p.label === taskTitle)
                          ) {
                            setTaskTitle(preset.value === "custom" ? "" : preset.label);
                          }
                        }}
                      >
                        {TASK_PRESETS.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
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
                        rows={3}
                        placeholder="What the speaker needs to finish"
                      />
                    </label>
                    <label>
                      Completion
                      <select
                        value={taskRequirement}
                        onChange={(event) =>
                          setTaskRequirement(
                            event.target.value as "manual" | "file" | "ack",
                          )
                        }
                      >
                        <option value="manual">Mark complete in portal</option>
                        <option value="file">Upload a file</option>
                        <option value="ack">Acknowledgement</option>
                      </select>
                    </label>
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
                    <button
                      className="btn btn-secondary"
                      type="submit"
                      disabled={createTask.isPending}
                    >
                      {createTask.isPending
                        ? "Assigning…"
                        : `Assign to ${taskSpeakerIds.size || 1} speaker${(taskSpeakerIds.size || 1) === 1 ? "" : "s"}`}
                    </button>
                  </form>
                </div>

                <div className="onboarding-card">
                  <div className="onboarding-card-head">
                    <h3>Assisted reminder</h3>
                  </div>
                  <p className="muted-line">
                    Build an editable draft from missing work and deadlines. Preparing a
                    draft never sends mail.
                    {selected.missingWork.length === 0
                      ? " No open tasks right now — draft will be a short check-in."
                      : ""}
                  </p>
                  <div className="onboarding-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void onPrepareReminder()}
                    >
                      Prepare draft
                    </button>
                  </div>
                  {draft ? (
                    <form className="onboarding-form onboarding-draft-form" onSubmit={onSaveDraft}>
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
                          rows={10}
                          disabled={draft.status !== "draft"}
                        />
                      </label>
                      <div className="onboarding-actions">
                        {draft.status === "draft" ? (
                          <>
                            <button className="btn btn-secondary" type="submit">
                              Save edits
                            </button>
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => void onDiscardDraft()}
                            >
                              Discard
                            </button>
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => void onSendDraft()}
                            >
                              Send explicitly
                            </button>
                          </>
                        ) : draft.status === "failed" ? (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => void onSendDraft()}
                          >
                            Retry send
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export type { OnboardingBoardSpeaker };
