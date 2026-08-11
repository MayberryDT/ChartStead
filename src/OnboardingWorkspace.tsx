import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";

import type {
  OnboardingBoardSpeaker,
  OnboardingReminderDraft,
} from "../shared/events";
import {
  ApiError,
  createOnboardingTask,
  discardOnboardingReminder,
  fetchOnboardingBoard,
  prepareOnboardingReminder,
  sendOnboardingReminder,
  updateOnboardingReminder,
} from "./api";

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
  if (status === "draft") return "Draft";
  if (status === "discarded") return "Discarded";
  return status;
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

export function OnboardingWorkspace({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: ["onboarding-board", eventId],
    queryFn: () => fetchOnboardingBoard(eventId),
  });
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
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

  const speakers = board.data?.speakers ?? [];
  const selected = useMemo(
    () =>
      speakers.find((row) => row.speakerId === selectedSpeakerId) ??
      speakers[0] ??
      null,
    [speakers, selectedSpeakerId],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["onboarding-board", eventId] });
  };

  function flash(text: string, tone: "success" | "error" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  const activePreset =
    TASK_PRESETS.find((preset) => preset.value === taskPreset) ?? TASK_PRESETS[0]!;

  const createTask = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a speaker first.");
      return createOnboardingTask(eventId, {
        speakerId: selected.speakerId,
        title: taskTitle.trim() || activePreset.label,
        instructions: taskInstructions,
        kind: activePreset.kind,
        completionRequirement: taskRequirement,
        readinessFlag: activePreset.flag || null,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
      });
    },
    onSuccess: async () => {
      setTaskTitle("");
      setTaskInstructions("");
      setTaskDueAt("");
      setTaskPreset(TASK_PRESETS[0]!.value);
      setTaskRequirement("manual");
      flash("Task created.");
      await refresh();
    },
    onError: (error) => {
      flash(error instanceof ApiError ? error.message : "Could not create task.", "error");
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
          <h2>Speaker readiness</h2>
          <span>
            {speakers.length} speaker{speakers.length === 1 ? "" : "s"}
          </span>
        </div>
        {message ? (
          <p className="form-message onboarding-flash" data-tone={messageTone ?? undefined}>
            {message}
          </p>
        ) : null}
        {speakers.length === 0 ? (
          <p className="empty-state padded">No accepted speakers yet.</p>
        ) : (
          <div className="onboarding-table-wrap">
            <table className="onboarding-table">
              <thead>
                <tr>
                  <th scope="col">Speaker</th>
                  <th scope="col">Missing</th>
                  <th scope="col">Overdue</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Readiness</th>
                  <th scope="col">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {speakers.map((row) => {
                  const isSelected = selected?.speakerId === row.speakerId;
                  return (
                    <tr
                      key={row.speakerId}
                      className={isSelected ? "is-selected" : undefined}
                    >
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
                    <h3>Create task</h3>
                  </div>
                  <form
                    className="onboarding-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createTask.mutateAsync();
                    }}
                  >
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
                      {createTask.isPending ? "Creating…" : "Create task"}
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
