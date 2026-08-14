import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import type { AirtableSyncHealth, AirtableSyncState } from "../shared/airtable";
import type { EvaluationScorecardCriterion, EvaluationPlan, EventRecord, ReviewerAssignment } from "../shared/events";
import {
  COURSE_CHECK_SCOPES,
  type AgentOperatingMode,
  type CourseCheckScope,
} from "../shared/agent-api";
import type { EventCourseCheckPolicy } from "../shared/course-check";
import {
  ApiError,
  connectAirtableSync,
  createEventApiKey,
  disconnectAirtableSync,
  fetchEvaluationPlan,
  fetchAirtableSync,
  fetchReviewerAssignments,
  fetchCourseCheckPolicy,
  listEventApiKeys,
  pullAirtableSync,
  saveEvaluationPlan,
  setEvaluationPlanEnabled,
  updateCourseCheckPolicy,
  updateEventApiKey,
  type EvaluationPlanRoundInput,
  type CreatedEventApiKey,
  type EventApiKeySummary,
} from "./api";
import { EventConfigurationCard } from "./EventWorkspaceManagement";
import { SettingsCheckbox, SettingsSelectField, SettingsTextField } from "./SettingsFields";
import { ReviewerRouting } from "./SubmissionsWorkspace";

const MODE_LABELS: Record<AgentOperatingMode, string> = {
  propose_only: "Propose only",
  delegated_execution: "Delegated execution",
  autonomous_policy: "Autonomous policy",
};

const SCOPE_LABELS: Record<CourseCheckScope, string> = {
  decisions: "Decisions",
  drafts: "Drafts",
  sends: "Sends",
  calendars: "Calendars",
  publication: "Publication",
  integrations: "Integrations",
  retries: "Retries",
  reconciliation: "Reconciliation",
  compensation: "Compensation",
};

function healthLabel(health: AirtableSyncHealth): string {
  switch (health) {
    case "unconfigured":
      return "Not connected";
    case "healthy":
      return "Healthy";
    case "pending":
      return "Pending";
    case "delayed":
      return "Delayed";
    case "failed":
      return "Failed";
  }
}

function healthTone(health: AirtableSyncHealth): string {
  switch (health) {
    case "healthy":
      return "settings-status settings-status-ok";
    case "pending":
      return "settings-status settings-status-pending";
    case "delayed":
      return "settings-status settings-status-delayed";
    case "failed":
      return "settings-status settings-status-failed";
    default:
      return "settings-status";
  }
}

export type SettingsSectionId =
  | "event"
  | "reviewers"
  | "evaluation"
  | "course-check"
  | "automation"
  | "airtable";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
};

export type SettingsChrome = {
  section: SettingsSectionId;
  sections: SettingsSection[];
  onSectionChange: (section: SettingsSectionId) => void;
};

const EVENT_SECTIONS: SettingsSection[] = [
  { id: "event", label: "Event" },
  { id: "reviewers", label: "Reviewers" },
  { id: "evaluation", label: "Evaluation" },
  { id: "course-check", label: "Course Check" },
  { id: "automation", label: "Automation" },
  { id: "airtable", label: "Airtable" },
];

const EVENTLESS_SECTIONS: SettingsSection[] = [
  { id: "course-check", label: "Course Check" },
  { id: "automation", label: "Automation" },
  { id: "airtable", label: "Airtable" },
];

export function SettingsCommandBar({ chrome }: { chrome: SettingsChrome | null }) {
  if (!chrome) {
    return (
      <div className="topbar-tools-inner settings-shell-tools" aria-busy="true">
        <span className="muted">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="topbar-tools-inner settings-shell-tools">
      <div className="seg settings-section-seg" role="group" aria-label="Settings section">
        {chrome.sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={chrome.section === section.id}
            onClick={() => chrome.onSectionChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDropdownOptions(id: string) {
  return [
    { id: `${id}-strong`, label: "Strong", score: 5 },
    { id: `${id}-weak`, label: "Weak", score: 1 },
  ];
}

function defaultScorecard(ref: string) {
  return {
    criteria: [
      {
        id: `${ref}-overall`,
        type: "numeric" as const,
        label: "Overall score",
        guidance: "Rate the proposal against this round's goals.",
        required: true,
        weight: 1,
        maxScore: 5,
        options: [],
      },
      {
        id: `${ref}-comments`,
        type: "text" as const,
        label: "Reviewer comments",
        guidance: "Capture strengths, concerns, and discussion notes.",
        required: false,
        weight: null,
        maxScore: null,
        options: [],
      },
    ],
    calculationDescription:
      "Weighted numeric and scored dropdown criteria are normalized to a 0–100 aggregate; free-text and unscored choices are excluded.",
  };
}

function blankRound(position: number) {
  return {
    id: undefined,
    name: position === 0 ? "Initial review" : "Final review",
    state: "draft" as const,
    startsOn: today(),
    endsOn: today(),
    scorecardRef: position === 0 ? "initial-scorecard" : "final-scorecard",
    reviewerPool: [] as string[],
    anonymization: "none" as const,
    scorecard: defaultScorecard(position === 0 ? "initial-scorecard" : "final-scorecard"),
  };
}

type EvaluationPlanDraft = {
  enabled: boolean;
  version: number;
  rounds: EvaluationPlanRoundInput[];
};

function evaluationPlanDraft(plan: EvaluationPlan | null): EvaluationPlanDraft | null {
  if (!plan) return null;
  return {
    enabled: plan.enabled,
    version: plan.version,
    rounds: plan.rounds.map((round) => ({
      id: round.id,
      name: round.name,
      state: round.state,
      startsOn: round.startsOn,
      endsOn: round.endsOn,
      scorecardRef: round.scorecardRef,
      scorecard: round.scorecard,
      reviewerPool: round.reviewerPool,
      anonymization: round.anonymization,
    })),
  };
}

function EvaluationPlanCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EvaluationPlanDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const planQuery = useQuery({
    queryKey: ["evaluation-plan", eventId],
    queryFn: () => fetchEvaluationPlan(eventId),
  });
  const reviewersQuery = useQuery({
    queryKey: ["reviewers", eventId],
    queryFn: () => fetchReviewerAssignments(eventId),
  });
  useEffect(() => setDraft(evaluationPlanDraft(planQuery.data?.plan ?? null)), [planQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveEvaluationPlan(eventId, {
        rounds: draft?.rounds ?? [blankRound(0), blankRound(1)],
        expectedVersion: draft?.version,
        enabled: draft?.enabled ?? true,
      }),
    onSuccess: ({ plan }) => {
      setDraft(evaluationPlanDraft(plan));
      setMessage("Evaluation plan saved.");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plan", eventId] });
    },
  });
  const enabledMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setEvaluationPlanEnabled(eventId, {
        enabled,
        expectedVersion: draft?.version,
      }),
    onSuccess: ({ plan }) => {
      setDraft(evaluationPlanDraft(plan));
      setMessage(plan?.enabled ? "Advanced review enabled." : "Advanced review disabled.");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plan", eventId] });
    },
  });
  const rounds = draft?.rounds ?? [blankRound(0), blankRound(1)];
  const reviewers = reviewersQuery.data?.reviewers ?? [];

  function updateRound(index: number, patch: Partial<EvaluationPlanRoundInput>) {
    setDraft((current) => ({
      enabled: current?.enabled ?? true,
      version: current?.version ?? 0,
      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...patch } : candidate,
      ),
    }));
  }

  function updateCriterion(
    roundIndex: number,
    criterionIndex: number,
    patch: Partial<EvaluationScorecardCriterion>,
  ) {
    const round = rounds[roundIndex];
    const scorecard = round.scorecard ?? defaultScorecard(round.scorecardRef);
    updateRound(roundIndex, {
      scorecard: {
        ...scorecard,
        criteria: scorecard.criteria.map((criterion, index) =>
          index === criterionIndex ? { ...criterion, ...patch } : criterion,
        ),
      },
    });
  }

  function addCriterion(roundIndex: number, type: EvaluationScorecardCriterion["type"]) {
    const round = rounds[roundIndex];
    const scorecard = round.scorecard ?? defaultScorecard(round.scorecardRef);
    const id = `${round.scorecardRef}-${type}-${scorecard.criteria.length + 1}`;
    updateRound(roundIndex, {
      scorecard: {
        ...scorecard,
        criteria: [
          ...scorecard.criteria,
          {
            id,
            type,
            label: type === "text" ? "Comments" : type === "dropdown" ? "Recommendation fit" : "Score",
            guidance: "",
            required: false,
            weight: type === "text" ? null : 1,
            maxScore: type === "text" ? null : 5,
            options: type === "dropdown" ? defaultDropdownOptions(id) : [],
          },
        ],
      },
    });
  }

  return (
    <section className="settings-card" aria-label="Evaluation">
      <h2>Proposal evaluation rounds</h2>
      {planQuery.isPending || reviewersQuery.isPending ? (
        <p className="empty-state padded">Loading evaluation configuration…</p>
      ) : planQuery.isError || reviewersQuery.isError ? (
        <p className="form-message error" role="alert">
          Unable to load evaluation configuration.
        </p>
      ) : (
        <form
          id="evaluation-plan-form"
          className="evaluation-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            saveMutation.mutate();
          }}
        >
          {rounds.map((round, index) => (
            <fieldset className="evaluation-round-card" key={round.id ?? `new-${index}`}>
              <legend>Round {index + 1}</legend>
              <div className="evaluation-round-fields">
                <SettingsTextField
                  label="Name"
                  required
                  value={round.name}
                  onChange={(name) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true,
                      version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, name } : candidate,
                      ),
                    }))
                  }
                />
                <SettingsTextField
                  label="Opens"
                  type="date"
                  required
                  value={round.startsOn}
                  onChange={(startsOn) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true,
                      version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, startsOn } : candidate,
                      ),
                    }))
                  }
                />
                <SettingsTextField
                  label="Closes"
                  type="date"
                  required
                  value={round.endsOn}
                  onChange={(endsOn) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true,
                      version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, endsOn } : candidate,
                      ),
                    }))
                  }
                />
                <SettingsTextField
                  label="Scorecard"
                  required
                  value={round.scorecardRef}
                  onChange={(scorecardRef) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true,
                      version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, scorecardRef } : candidate,
                      ),
                    }))
                  }
                />
              </div>
              <fieldset className="evaluation-scorecard-editor">
                <legend>Criteria</legend>
                {(round.scorecard?.criteria ?? []).map((criterion, criterionIndex) => (
                  <div className="evaluation-scorecard-criterion" key={criterion.id}>
                    <div className="evaluation-criterion-primary">
                      <SettingsTextField
                        label="Label"
                        required
                        value={criterion.label}
                        onChange={(label) =>
                          updateCriterion(index, criterionIndex, { label })
                        }
                      />
                      <SettingsTextField
                        label="Guidance"
                        value={criterion.guidance}
                        onChange={(guidance) =>
                          updateCriterion(index, criterionIndex, { guidance })
                        }
                      />
                    </div>
                    <div className="evaluation-criterion-metadata">
                      <SettingsSelectField
                        label="Type"
                        value={criterion.type}
                        onChange={(nextTypeRaw) => {
                          const nextType = nextTypeRaw as EvaluationScorecardCriterion["type"];
                          const options =
                            nextType === "dropdown" && criterion.options.length === 0
                              ? defaultDropdownOptions(criterion.id)
                              : nextType === "dropdown"
                                ? criterion.options
                                : [];
                          updateCriterion(index, criterionIndex, {
                            type: nextType,
                            weight: nextType === "text" ? null : (criterion.weight ?? 1),
                            maxScore: nextType === "text" ? null : (criterion.maxScore ?? 5),
                            options,
                          });
                        }}
                        options={[
                          { value: "numeric", label: "Numeric" },
                          { value: "dropdown", label: "Dropdown" },
                          { value: "text", label: "Text" },
                        ]}
                      />
                      {criterion.type !== "text" ? (
                        <>
                          <SettingsTextField
                            label="Weight"
                            type="number"
                            value={String(criterion.weight ?? 0)}
                            onChange={(value) =>
                              updateCriterion(index, criterionIndex, {
                                weight: Number(value),
                              })
                            }
                          />
                          <SettingsTextField
                            label="Max score"
                            type="number"
                            value={String(criterion.maxScore ?? 5)}
                            onChange={(value) =>
                              updateCriterion(index, criterionIndex, {
                                maxScore: Number(value),
                              })
                            }
                          />
                        </>
                      ) : null}
                    </div>
                    {criterion.type === "dropdown" ? (
                      <div className="evaluation-scorecard-options">
                        {criterion.options.map((option, optionIndex) => (
                          <div key={option.id} className="event-resource-row">
                            <SettingsTextField
                              label={`Option ${optionIndex + 1} label`}
                              value={option.label}
                              onChange={(label) =>
                                updateCriterion(index, criterionIndex, {
                                  options: criterion.options.map((candidate, candidateIndex) =>
                                    candidateIndex === optionIndex
                                      ? { ...candidate, label }
                                      : candidate,
                                  ),
                                })
                              }
                            />
                            <SettingsTextField
                              label={`Option ${optionIndex + 1} score`}
                              type="number"
                              value={option.score == null ? "" : String(option.score)}
                              onChange={(value) => {
                                const nextScore = value === "" ? null : Number(value);
                                updateCriterion(index, criterionIndex, {
                                  options: criterion.options.map((candidate, candidateIndex) =>
                                    candidateIndex === optionIndex
                                      ? { ...candidate, score: nextScore }
                                      : candidate,
                                  ),
                                });
                              }}
                            />
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              disabled={criterion.options.length <= 1}
                              onClick={() =>
                                updateCriterion(index, criterionIndex, {
                                  options: criterion.options.filter(
                                    (_, candidateIndex) => candidateIndex !== optionIndex,
                                  ),
                                })
                              }
                            >
                              Remove option
                            </button>
                          </div>
                        ))}
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => {
                            const optionId = `${criterion.id}-option-${criterion.options.length + 1}`;
                            updateCriterion(index, criterionIndex, {
                              options: [
                                ...criterion.options,
                                {
                                  id: optionId,
                                  label: `Option ${criterion.options.length + 1}`,
                                  score: null,
                                },
                              ],
                            });
                          }}
                        >
                          Add dropdown option
                        </button>
                      </div>
                    ) : null}
                    <div className="evaluation-criterion-footer">
                      <SettingsCheckbox
                        label="Required"
                        checked={criterion.required}
                        onChange={(required) =>
                          updateCriterion(index, criterionIndex, { required })
                        }
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        disabled={(round.scorecard?.criteria.length ?? 0) <= 1}
                        onClick={() => {
                          const scorecard = round.scorecard ?? defaultScorecard(round.scorecardRef);
                          updateRound(index, {
                            scorecard: {
                              ...scorecard,
                              criteria: scorecard.criteria.filter(
                                (_, candidateIndex) => candidateIndex !== criterionIndex,
                              ),
                            },
                          });
                        }}
                      >
                        Remove criterion
                      </button>
                    </div>
                  </div>
                ))}
                <div className="evaluation-plan-actions">
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => addCriterion(index, "numeric")}>
                    Add numeric
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => addCriterion(index, "dropdown")}>
                    Add dropdown
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => addCriterion(index, "text")}>
                    Add free text
                  </button>
                </div>
              </fieldset>
              <SettingsSelectField
                label="State"
                value={round.state ?? "draft"}
                onChange={(state) =>
                  setDraft((current) => ({
                    enabled: current?.enabled ?? true,
                    version: current?.version ?? 0,
                    rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, state: state as "draft" | "open" | "closed" }
                        : candidate,
                    ),
                  }))
                }
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ]}
              />
              <SettingsCheckbox
                label="Blind reviewer view"
                checked={round.anonymization === "blind"}
                onChange={(checked) =>
                  setDraft((current) => ({
                    enabled: current?.enabled ?? true,
                    version: current?.version ?? 0,
                    rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, anonymization: checked ? "blind" : "none" }
                        : candidate,
                    ),
                  }))
                }
              />
              <section className="evaluation-reviewer-pool">
                <h3>Reviewer pool</h3>
                <div className="evaluation-reviewer-list">
                  {reviewers.length === 0 ? <span className="muted">Add reviewers first.</span> : null}
                  {reviewers.map((reviewer: ReviewerAssignment) => (
                    <SettingsCheckbox
                      key={reviewer.id}
                      label={reviewer.name}
                      checked={round.reviewerPool.includes(reviewer.id)}
                      onChange={(checked) =>
                        setDraft((current) => ({
                          enabled: current?.enabled ?? true,
                          version: current?.version ?? 0,
                          rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  reviewerPool: checked
                                    ? [...candidate.reviewerPool, reviewer.id]
                                    : candidate.reviewerPool.filter((id) => id !== reviewer.id),
                                }
                              : candidate,
                          ),
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
              <div className="evaluation-round-order">
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={index === 0}
                  onClick={() =>
                    setDraft((current) => {
                      const next = [...(current?.rounds ?? rounds)];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return { enabled: current?.enabled ?? true, version: current?.version ?? 0, rounds: next };
                    })
                  }
                >
                  Move up
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={index === rounds.length - 1}
                  onClick={() =>
                    setDraft((current) => {
                      const next = [...(current?.rounds ?? rounds)];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      return { enabled: current?.enabled ?? true, version: current?.version ?? 0, rounds: next };
                    })
                  }
                >
                  Move down
                </button>
              </div>
              {rounds.length > 2 ? (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).filter((_, candidateIndex) => candidateIndex !== index),
                    }))
                  }
                >
                  Remove round
                </button>
              ) : null}
            </fieldset>
          ))}
          <div className="evaluation-plan-actions evaluation-plan-actions-bottom">
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  enabled: current?.enabled ?? true, version: current?.version ?? 0,
                  rounds: [...(current?.rounds ?? rounds), blankRound(rounds.length)],
                }))
              }
            >
              Add round
            </button>
            <span className="topbar-tools-spacer" aria-hidden="true" />
            {draft ? (
              <span className={`settings-status ${draft.enabled ? "settings-status-ok" : ""}`}>
                {draft.enabled ? "Enabled" : "Disabled"}
              </span>
            ) : null}
            {draft ? (
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={enabledMutation.isPending}
                onClick={() => enabledMutation.mutate(!draft.enabled)}
              >
                {draft.enabled ? "Disable" : "Enable"}
              </button>
            ) : null}
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={saveMutation.isPending || planQuery.isPending}
            >
              {saveMutation.isPending ? "Saving…" : draft ? "Save rounds" : "Create evaluation plan"}
            </button>
          </div>
          {saveMutation.isError || enabledMutation.isError ? (
            <p className="form-message error" role="alert">
              {(saveMutation.error ?? enabledMutation.error)?.message ?? "Unable to save evaluation plan."}
            </p>
          ) : message ? <p className="form-message success" role="status">{message}</p> : null}
        </form>
      )}
    </section>
  );
}

function CourseCheckPolicyCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const policyQuery = useQuery({
    queryKey: ["course-check-policy", eventId],
    queryFn: () => fetchCourseCheckPolicy(eventId),
  });
  const [draft, setDraft] = useState<EventCourseCheckPolicy | null>(null);
  useEffect(() => {
    if (policyQuery.data) setDraft(policyQuery.data);
  }, [policyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (policy: EventCourseCheckPolicy) =>
      updateCourseCheckPolicy(eventId, policy),
    onSuccess: (policy) => {
      setDraft(policy);
      setTone("success");
      setMessage("Course Check policy saved. Baseline protections remain in force.");
      void queryClient.invalidateQueries({ queryKey: ["course-check-policy", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(
        error instanceof ApiError ? error.message : "Unable to save Course Check policy.",
      );
    },
  });

  if (!draft) {
    return (
      <section className="settings-card" aria-label="Course Check">
        <p className="empty-state padded">
          {policyQuery.isError ? "Unable to load policy." : "Loading…"}
        </p>
      </section>
    );
  }

  return (
    <section className="settings-card settings-card-compact" aria-label="Course Check">
      <h2>Course Check safeguards</h2>
      <form
        id="course-check-policy-form"
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          saveMutation.mutate(draft);
        }}
      >
        <SettingsCheckbox
          label="Two-person approval"
          checked={draft.requireTwoPersonApproval}
          onChange={(requireTwoPersonApproval) =>
            setDraft({ ...draft, requireTwoPersonApproval })
          }
        />
        <SettingsCheckbox
          label="Approver must differ from requester"
          checked={draft.requireDistinctApprover}
          onChange={(requireDistinctApprover) =>
            setDraft({ ...draft, requireDistinctApprover })
          }
        />
        <SettingsCheckbox
          label="Reason required on approve"
          checked={draft.requireReasonOnApprove}
          onChange={(requireReasonOnApprove) =>
            setDraft({ ...draft, requireReasonOnApprove })
          }
        />
        <SettingsSelectField
          label="Max agent mode"
          value={draft.maxAgentMode}
          onChange={(maxAgentMode) =>
            setDraft({ ...draft, maxAgentMode: maxAgentMode as AgentOperatingMode })
          }
          options={[
            { value: "propose_only", label: "Propose only" },
            { value: "delegated_execution", label: "Delegated execution" },
            { value: "autonomous_policy", label: "Autonomous policy" },
          ]}
        />
        {message ? (
          <p className={`form-message ${tone === "error" ? "error" : "success"}`} role="status">
            {message}
          </p>
        ) : null}
        <div className="settings-card-actions settings-card-actions-end">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AutomationAccessCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"api" | "mcp">("api");
  const [name, setName] = useState("Program ops agent");
  const [mode, setMode] = useState<AgentOperatingMode>("propose_only");
  const [grantAll, setGrantAll] = useState(false);
  const [scopes, setScopes] = useState<CourseCheckScope[]>(["decisions", "drafts"]);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [revealed, setRevealed] = useState<CreatedEventApiKey | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | "config" | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/mcp`;

  const keysQuery = useQuery({
    queryKey: ["event-api-keys", eventId],
    queryFn: () => listEventApiKeys(eventId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createEventApiKey(eventId, {
        name: name.trim() || "Agent",
        principalKind: "agent",
        agentMode: mode,
        courseCheckScopes: grantAll ? ["all"] : scopes,
      }),
    onSuccess: async (result) => {
      setRevealed(result.apiKey);
      setCopied(null);
      setTone("success");
      setMessage("Key created. Copy the secret now — ChartStead only shows it once.");
      await queryClient.invalidateQueries({ queryKey: ["event-api-keys", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(error instanceof ApiError ? error.message : "Unable to create key.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => updateEventApiKey(eventId, keyId, { revoke: true }),
    onSuccess: async () => {
      setTone("success");
      setMessage("Key revoked. It cannot call the API or MCP on the next request.");
      await queryClient.invalidateQueries({ queryKey: ["event-api-keys", eventId] });
    },
    onError: (error) => {
      setTone("error");
      setMessage(error instanceof ApiError ? error.message : "Unable to revoke key.");
    },
  });

  function toggleScope(scope: CourseCheckScope) {
    setGrantAll(false);
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!grantAll && scopes.length === 0) {
      setTone("error");
      setMessage("Choose at least one Course Check scope, or grant all stages.");
      return;
    }
    createMutation.mutate();
  }

  async function copyText(value: string, kind: "token" | "url" | "config") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setTone("error");
      setMessage("Could not copy automatically — select the text and copy manually.");
    }
  }

  const keys: EventApiKeySummary[] = (keysQuery.data?.apiKeys ?? []).filter(
    (key) => key.principalKind === "agent" && !key.revokedAt,
  );

  const mcpConfig = revealed?.token
    ? JSON.stringify(
        {
          mcpServers: {
            chartstead: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${revealed.token}` },
            },
          },
        },
        null,
        2,
      )
    : JSON.stringify(
        {
          mcpServers: {
            chartstead: {
              url: mcpUrl,
              headers: { Authorization: "Bearer cs_live_…" },
            },
          },
        },
        null,
        2,
      );

  const claudeCommand = revealed?.token
    ? `claude mcp add --transport http chartstead ${mcpUrl} --header "Authorization: Bearer ${revealed.token}"`
    : `claude mcp add --transport http chartstead ${mcpUrl} --header "Authorization: Bearer cs_live_…"`;

  return (
    <section className="settings-card automation-access" aria-label="Automation">
      <h2>Connect your agent</h2>
      <div className="seg automation-method-seg" role="group" aria-label="Access method">
        <button type="button" aria-pressed={tab === "api"} onClick={() => setTab("api")}>
          API
        </button>
        <button type="button" aria-pressed={tab === "mcp"} onClick={() => setTab("mcp")}>
          MCP
        </button>
      </div>

      {tab === "api" ? (
        <div role="tabpanel" className="automation-panel">
          <form className="settings-form settings-form-wide" onSubmit={onCreate}>
            <SettingsTextField
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Program ops agent"
              autoComplete="off"
            />
            <SettingsSelectField
              label="Mode"
              value={mode}
              onChange={(next) => setMode(next as AgentOperatingMode)}
              options={[
                { value: "propose_only", label: "Propose only" },
                { value: "delegated_execution", label: "Delegated execution" },
                { value: "autonomous_policy", label: "Autonomous policy" },
              ]}
            />
            <fieldset className="settings-scope-fieldset">
              <legend className="settings-field-label">Stages</legend>
              <SettingsCheckbox
                label="All stages"
                checked={grantAll}
                onChange={(next) => {
                  setGrantAll(next);
                  if (next) setScopes([...COURSE_CHECK_SCOPES]);
                }}
              />
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <SettingsCheckbox
                    key={scope}
                    label={SCOPE_LABELS[scope]}
                    checked={grantAll || scopes.includes(scope)}
                    disabled={grantAll}
                    onChange={() => toggleScope(scope)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create API key"}
              </button>
            </div>
          </form>

          {revealed ? (
            <div className="settings-token-reveal" role="status">
              <strong>Copy this token now</strong>
              <p className="muted">
                {revealed.name} · {MODE_LABELS[revealed.agentMode ?? "propose_only"]} ·{" "}
                {revealed.courseCheckScopes.length === 0
                  ? "no stages"
                  : revealed.courseCheckScopes.join(", ")}
              </p>
              <code className="settings-token-value">{revealed.token}</code>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copyText(revealed.token, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRevealed(null)}>
                  Hide
                </button>
              </div>
              <p className="muted">
                Base URL: <code>{origin}/api/v1</code>
                {" · "}
                Header: <code>Authorization: Bearer …</code>
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="automation-panel">
          <div className="mcp-field">
            <label className="settings-field-label" htmlFor="mcp-url">
              MCP URL
            </label>
            <div className="mcp-copy-row">
              <code id="mcp-url" className="settings-token-value">
                {mcpUrl || "/mcp"}
              </code>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyText(mcpUrl, "url")}
              >
                {copied === "url" ? "Copied" : "Copy URL"}
              </button>
            </div>
          </div>

          <form className="settings-form settings-form-wide" onSubmit={onCreate}>
            <SettingsTextField
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Claude Code"
              autoComplete="off"
            />
            <SettingsSelectField
              label="Mode"
              value={mode}
              onChange={(next) => setMode(next as AgentOperatingMode)}
              options={[
                { value: "propose_only", label: "Propose only" },
                { value: "delegated_execution", label: "Delegated execution" },
                { value: "autonomous_policy", label: "Autonomous policy" },
              ]}
            />
            <fieldset className="settings-scope-fieldset">
              <legend className="settings-field-label">Stages</legend>
              <SettingsCheckbox
                label="All stages"
                checked={grantAll}
                onChange={(next) => {
                  setGrantAll(next);
                  if (next) setScopes([...COURSE_CHECK_SCOPES]);
                }}
              />
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <SettingsCheckbox
                    key={scope}
                    label={SCOPE_LABELS[scope]}
                    checked={grantAll || scopes.includes(scope)}
                    disabled={grantAll}
                    onChange={() => toggleScope(scope)}
                  />
                ))}
              </div>
            </fieldset>
            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create MCP token"}
              </button>
            </div>
          </form>

          {revealed ? (
            <div className="settings-token-reveal" role="status">
              <strong>Token (shown once)</strong>
              <code className="settings-token-value">{revealed.token}</code>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copyText(revealed.token, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mcp-config-block">
            <strong>MCP config</strong>
            <pre className="mcp-config-pre">{mcpConfig}</pre>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyText(mcpConfig, "config")}
              >
                {copied === "config" ? "Copied" : "Copy config"}
              </button>
            </div>
          </div>

          <div className="mcp-config-block">
            <strong>Claude Code</strong>
            <pre className="mcp-config-pre">{claudeCommand}</pre>
          </div>

        </div>
      )}

      {keysQuery.isPending ? (
        <p className="empty-state padded">Loading keys…</p>
      ) : keysQuery.error instanceof ApiError ? (
        <p className="form-message error" role="alert">
          {keysQuery.error.message}
        </p>
      ) : keys.length === 0 ? (
        <p className="muted">No active agent keys for this event yet.</p>
      ) : (
        <div className="settings-key-table-wrap">
          <table className="settings-key-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Mode</th>
                <th scope="col">Scopes</th>
                <th scope="col">Prefix</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>{key.agentMode ? MODE_LABELS[key.agentMode] : "—"}</td>
                  <td>
                    {key.courseCheckScopes.length === 0
                      ? "None"
                      : key.courseCheckScopes.length === COURSE_CHECK_SCOPES.length
                        ? "All stages"
                        : key.courseCheckScopes
                            .map((scope) => SCOPE_LABELS[scope as CourseCheckScope] ?? scope)
                            .join(", ")}
                  </td>
                  <td>
                    <code>{key.keyPrefix}…</code>
                  </td>
                  <td>{formatTimestamp(key.lastUsedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={revokeMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke “${key.name}”? The agent loses API and MCP access on the next call.`,
                          )
                        ) {
                          revokeMutation.mutate(key.id);
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message ? (
        <p className={`form-message ${tone}`} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function SettingsWorkspace({
  event,
  eventId: legacyEventId,
  onEventUpdated = () => {},
  onChromeChange,
}: {
  event?: EventRecord;
  eventId?: string;
  onEventUpdated?: (event: EventRecord) => void;
  onChromeChange?: (chrome: SettingsChrome | null) => void;
}) {
  const eventId = event?.id ?? legacyEventId ?? "";
  const sections = event ? EVENT_SECTIONS : EVENTLESS_SECTIONS;
  const [section, setSection] = useState<SettingsSectionId>(sections[0]!.id);
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formTone, setFormTone] = useState<"success" | "error">("success");

  useEffect(() => {
    if (!sections.some((candidate) => candidate.id === section)) {
      setSection(sections[0]!.id);
    }
  }, [section, sections]);

  useEffect(() => {
    if (!onChromeChange) return;
    onChromeChange({
      section,
      sections,
      onSectionChange: setSection,
    });
    return () => onChromeChange(null);
  }, [onChromeChange, section, sections]);

  const syncQuery = useQuery({
    queryKey: ["airtable-sync", eventId],
    queryFn: () => fetchAirtableSync(eventId),
  });

  const sync: AirtableSyncState | undefined = syncQuery.data?.sync;

  useEffect(() => {
    if (sync?.baseId) setBaseId(sync.baseId);
  }, [sync?.baseId]);

  const connectMutation = useMutation({
    mutationFn: (input: { baseId: string; accessToken: string }) =>
      connectAirtableSync(eventId, input),
    onSuccess: async (result) => {
      setAccessToken("");
      const ok = result.pull.ok && result.sync.health === "healthy";
      setFormTone(ok ? "success" : "error");
      setFormMessage(
        ok
          ? `Connected. Pull applied ${result.pull.changes.length} mapped change(s). Check Submissions — titles may show “(from Airtable demo)”.`
          : `Saved, but pull reported ${result.sync.health}: ${result.pull.error ?? result.sync.guidance ?? "see status"}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to connect Airtable.",
      );
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => pullAirtableSync(eventId),
    onSuccess: async (result) => {
      const ok = result.pull.ok && result.sync.health === "healthy";
      setFormTone(ok ? "success" : "error");
      setFormMessage(
        ok
          ? `Pull finished healthy (${result.pull.changes.length} change(s)).`
          : `Pull finished: ${healthLabel(result.sync.health)}. ${result.pull.error ?? ""}`.trim(),
      );
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to pull from Airtable.",
      );
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectAirtableSync(eventId),
    onSuccess: async () => {
      setAccessToken("");
      setBaseId("");
      setFormTone("success");
      setFormMessage("Airtable disconnected for this event.");
      await queryClient.invalidateQueries({ queryKey: ["airtable-sync", eventId] });
    },
    onError: (error) => {
      setFormTone("error");
      setFormMessage(
        error instanceof ApiError ? error.message : "Unable to disconnect Airtable.",
      );
    },
  });

  function onConnect(event: FormEvent) {
    event.preventDefault();
    setFormMessage(null);
    connectMutation.mutate({
      baseId: baseId.trim(),
      accessToken: accessToken.trim(),
    });
  }

  const busy =
    connectMutation.isPending ||
    pullMutation.isPending ||
    disconnectMutation.isPending;

  const canSubmit =
    Boolean(baseId.trim()) &&
    (Boolean(accessToken.trim()) || Boolean(sync?.hasAccessToken));

  const airtableSection = (
    <section className="settings-card settings-card-compact" aria-label="Airtable">
      <h2>Airtable sync</h2>
      {sync ? (
        <p className={healthTone(sync.health)}>{healthLabel(sync.health)}</p>
      ) : null}

      {syncQuery.isPending ? (
        <p className="empty-state padded">Loading sync status…</p>
      ) : syncQuery.error instanceof ApiError ? (
        <p className="form-message error" role="alert">
          {syncQuery.error.message}
        </p>
      ) : (
        <>
          <form className="settings-form" onSubmit={onConnect}>
            <SettingsTextField
              label="Base ID"
              id="airtable-base-id"
              name="baseId"
              value={baseId}
              onChange={setBaseId}
              placeholder="appXXXXXXXXXXXXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <SettingsTextField
              label={sync?.hasAccessToken ? "Token (blank keeps current)" : "Token"}
              id="airtable-access-token"
              name="accessToken"
              type="password"
              value={accessToken}
              onChange={setAccessToken}
              placeholder={sync?.hasAccessToken ? "••••••••" : "patXXXXXXXX…."}
              autoComplete="off"
              spellCheck={false}
            />

            <div className="settings-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !canSubmit}
              >
                {connectMutation.isPending ? "Connecting…" : "Connect and pull"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !sync?.configured}
                onClick={() => {
                  setFormMessage(null);
                  pullMutation.mutate();
                }}
              >
                {pullMutation.isPending ? "Pulling…" : "Retry pull"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !sync?.configured}
                onClick={() => {
                  setFormMessage(null);
                  disconnectMutation.mutate();
                }}
              >
                Disconnect
              </button>
            </div>
          </form>

          {sync ? (
            <dl className="settings-meta">
              <div>
                <dt>Last pull</dt>
                <dd>{formatTimestamp(sync.lastPullAt)}</dd>
              </div>
              <div>
                <dt>Last success</dt>
                <dd>{formatTimestamp(sync.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt>Base</dt>
                <dd>{sync.baseId ?? "—"}</dd>
              </div>
              <div>
                <dt>Token</dt>
                <dd>{sync.hasAccessToken ? "Saved for this event" : "Not saved"}</dd>
              </div>
              {sync.lastError ? (
                <div className="settings-meta-wide">
                  <dt>Last error</dt>
                  <dd>{sync.lastError}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {sync?.guidance ? (
            <p className="settings-guidance" role="status">
              {sync.guidance}
            </p>
          ) : null}

          {formMessage ? (
            <p className={`form-message ${formTone}`} role="status">
              {formMessage}
            </p>
          ) : null}
        </>
      )}
    </section>
  );

  return (
    <div className="workspace settings-workspace" aria-label="Settings sections">
      {!onChromeChange ? (
        <div className="settings-local-tabs">
          <SettingsCommandBar
            chrome={{
              section,
              sections,
              onSectionChange: setSection,
            }}
          />
        </div>
      ) : null}
      <div className="settings-stack settings-stack-single">
        {section === "event" && event ? (
          <EventConfigurationCard event={event} onUpdated={onEventUpdated} />
        ) : null}
        {section === "reviewers" && event ? (
          <section className="settings-card" aria-label="Reviewers">
            <h2>Reviewer access</h2>
            <ReviewerRouting event={event} />
          </section>
        ) : null}
        {section === "evaluation" && event ? (
          <EvaluationPlanCard eventId={event.id} />
        ) : null}
        {section === "course-check" ? <CourseCheckPolicyCard eventId={eventId} /> : null}
        {section === "automation" ? <AutomationAccessCard eventId={eventId} /> : null}
        {section === "airtable" ? airtableSection : null}
      </div>
    </div>
  );
}
