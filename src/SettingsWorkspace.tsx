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
import { ReviewerRouting } from "./SubmissionsWorkspace";

/** Must match worker/airtable/demo-sandbox.ts */
const DEMO_BASE_ID = "appChartSteadDemo";
const DEMO_TOKEN = "pat_demo_sandbox";

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
      return "sync-pill sync-pill-ok";
    case "pending":
      return "sync-pill sync-pill-pending";
    case "delayed":
      return "sync-pill sync-pill-delayed";
    case "failed":
      return "sync-pill sync-pill-failed";
    default:
      return "sync-pill";
  }
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
    <section className="settings-card" aria-labelledby="evaluation-plan-heading">
      <div className="settings-card-header">
        <div>
          <h2 id="evaluation-plan-heading">Advanced evaluation plan</h2>
          <p className="muted">
            Optional named rounds. Turn this on only when reviewers need round-specific access;
            otherwise the shared track queue stays in use.
          </p>
        </div>
        {draft ? (
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={enabledMutation.isPending}
            onClick={() => enabledMutation.mutate(!draft.enabled)}
          >
            {draft.enabled ? "Disable advanced review" : "Enable advanced review"}
          </button>
        ) : null}
      </div>
      {planQuery.isPending || reviewersQuery.isPending ? (
        <p className="muted">Loading evaluation configuration…</p>
      ) : planQuery.isError || reviewersQuery.isError ? (
        <p className="form-message error" role="alert">
          Unable to load evaluation configuration.
        </p>
      ) : (
        <form
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
              <label>
                Name
                <input
                  required
                  value={round.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true,
                      version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, name: event.target.value } : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Opens
                <input
                  required
                  type="date"
                  value={round.startsOn}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, startsOn: event.target.value } : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Closes
                <input
                  required
                  type="date"
                  value={round.endsOn}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, endsOn: event.target.value } : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Scorecard reference
                <input
                  required
                  value={round.scorecardRef}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, scorecardRef: event.target.value } : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <fieldset className="evaluation-scorecard-editor">
                <legend>Scorecard criteria</legend>
                <p className="muted">
                  {round.scorecard?.calculationDescription ??
                    "Weighted numeric and scored dropdown criteria are normalized into the aggregate."}
                </p>
                {(round.scorecard?.criteria ?? []).map((criterion, criterionIndex) => (
                  <div className="evaluation-scorecard-criterion" key={criterion.id}>
                    <label>
                      Criterion label
                      <input
                        required
                        value={criterion.label}
                        onChange={(event) =>
                          updateCriterion(index, criterionIndex, { label: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Type
                      <select
                        value={criterion.type}
                        onChange={(event) => {
                          const nextType = event.target.value as EvaluationScorecardCriterion["type"];
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
                      >
                        <option value="numeric">Numeric rating</option>
                        <option value="dropdown">Dropdown choice</option>
                        <option value="text">Free text</option>
                      </select>
                    </label>
                    <label>
                      Guidance
                      <input
                        value={criterion.guidance}
                        onChange={(event) =>
                          updateCriterion(index, criterionIndex, { guidance: event.target.value })
                        }
                      />
                    </label>
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={criterion.required}
                        onChange={(event) =>
                          updateCriterion(index, criterionIndex, { required: event.target.checked })
                        }
                      />
                      <span>Required</span>
                    </label>
                    {criterion.type !== "text" ? (
                      <>
                        <label>
                          Weight
                          <input
                            min="0"
                            step="0.1"
                            type="number"
                            value={criterion.weight ?? 0}
                            onChange={(event) =>
                              updateCriterion(index, criterionIndex, {
                                weight: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Max score
                          <input
                            min="1"
                            step="1"
                            type="number"
                            value={criterion.maxScore ?? 5}
                            onChange={(event) =>
                              updateCriterion(index, criterionIndex, {
                                maxScore: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {criterion.type === "dropdown" ? (
                      <div className="evaluation-scorecard-options">
                        {criterion.options.map((option, optionIndex) => (
                          <div key={option.id}>
                            <input
                              aria-label={`Option ${optionIndex + 1} label`}
                              value={option.label}
                              onChange={(event) =>
                                updateCriterion(index, criterionIndex, {
                                  options: criterion.options.map((candidate, candidateIndex) =>
                                    candidateIndex === optionIndex
                                      ? { ...candidate, label: event.target.value }
                                      : candidate,
                                  ),
                                })
                              }
                            />
                            <input
                              aria-label={`Option ${optionIndex + 1} score`}
                              min="0"
                              type="number"
                              value={option.score ?? ""}
                              onChange={(event) => {
                                const nextScore = event.target.value === "" ? null : Number(event.target.value);
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
              <label>
                State
                <select
                  value={round.state}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, state: event.target.value as "draft" | "open" | "closed" }
                          : candidate,
                      ),
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={round.anonymization === "blind"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      enabled: current?.enabled ?? true, version: current?.version ?? 0,
                      rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, anonymization: event.target.checked ? "blind" : "none" }
                          : candidate,
                      ),
                    }))
                  }
                />
                <span>Blind reviewer view</span>
              </label>
              <fieldset className="evaluation-reviewer-pool">
                <legend>Reviewer pool</legend>
                {reviewers.length === 0 ? <span className="muted">Add reviewers above first.</span> : null}
                {reviewers.map((reviewer: ReviewerAssignment) => (
                  <label key={reviewer.id}>
                    <input
                      type="checkbox"
                      checked={round.reviewerPool.includes(reviewer.id)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          enabled: current?.enabled ?? true, version: current?.version ?? 0,
                          rounds: (current?.rounds ?? rounds).map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  reviewerPool: event.target.checked
                                    ? [...candidate.reviewerPool, reviewer.id]
                                    : candidate.reviewerPool.filter((id) => id !== reviewer.id),
                                }
                              : candidate,
                          ),
                        }))
                      }
                    />
                    {reviewer.name}
                  </label>
                ))}
              </fieldset>
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
          <div className="evaluation-plan-actions">
            <button
              className="btn btn-secondary"
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
            <button className="btn btn-primary" type="submit" disabled={saveMutation.isPending}>
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
      <section className="settings-card" aria-labelledby="cc-policy-heading">
        <h2 id="cc-policy-heading">Course Check policy</h2>
        <p className="muted">{policyQuery.isError ? "Unable to load policy." : "Loading…"}</p>
      </section>
    );
  }

  return (
    <section className="settings-card" aria-labelledby="cc-policy-heading">
      <div className="settings-card-header">
        <div>
          <h2 id="cc-policy-heading">Course Check policy</h2>
          <p className="muted">
            Optional stricter approvals. Policy can only add gates — it cannot turn off
            plan matching, authorization, freshness checks, or hard safety blocks.
          </p>
        </div>
      </div>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          saveMutation.mutate(draft);
        }}
      >
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireTwoPersonApproval}
            onChange={(e) =>
              setDraft({ ...draft, requireTwoPersonApproval: e.target.checked })
            }
          />
          <span>Require two-person approval before stage execution</span>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireDistinctApprover}
            onChange={(e) =>
              setDraft({ ...draft, requireDistinctApprover: e.target.checked })
            }
          />
          <span>Approver must differ from the plan requester</span>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.requireReasonOnApprove}
            onChange={(e) =>
              setDraft({ ...draft, requireReasonOnApprove: e.target.checked })
            }
          />
          <span>Require a reason on every stage approval</span>
        </label>
        <label className="settings-label" htmlFor="cc-max-agent-mode">
          Maximum agent operating mode
        </label>
        <select
          id="cc-max-agent-mode"
          className="settings-input"
          value={draft.maxAgentMode}
          onChange={(e) =>
            setDraft({
              ...draft,
              maxAgentMode: e.target.value as AgentOperatingMode,
            })
          }
        >
          <option value="propose_only">Propose only</option>
          <option value="delegated_execution">Delegated execution</option>
          <option value="autonomous_policy">Autonomous policy</option>
        </select>
        <div className="settings-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save policy"}
          </button>
        </div>
        {message ? (
          <p className={`form-message ${tone === "error" ? "error" : "success"}`} role="status">
            {message}
          </p>
        ) : null}
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
    <section className="settings-card automation-access" aria-labelledby="automation-access-heading">
      <div className="settings-card-header">
        <div>
          <h2 id="automation-access-heading">Automation access</h2>
          <p className="muted">
            Give integrations and AI agents scoped access to this conference. Same key works for the
            HTTP API and MCP. Secrets are shown once.
          </p>
        </div>
      </div>

      <div className="automation-tabs" role="tablist" aria-label="Access method">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "api"}
          className={`automation-tab ${tab === "api" ? "active" : ""}`}
          onClick={() => setTab("api")}
        >
          API
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mcp"}
          className={`automation-tab ${tab === "mcp" ? "active" : ""}`}
          onClick={() => setTab("mcp")}
        >
          MCP
        </button>
      </div>

      {tab === "api" ? (
        <div role="tabpanel" className="automation-panel">
          <p className="muted">
            Use the HTTP API for scripts, n8n, Make, or custom agents. Send{" "}
            <code>Authorization: Bearer &lt;token&gt;</code> to{" "}
            <code>{origin || "https://your-host"}/api/v1/…</code>.
          </p>

          <form className="settings-form settings-form-wide" onSubmit={onCreate}>
            <p className="settings-form-legend">Create API key</p>

            <label className="settings-label" htmlFor="agent-key-name">
              Name
            </label>
            <input
              id="agent-key-name"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Program ops agent"
              autoComplete="off"
            />

            <label className="settings-label" htmlFor="agent-key-mode">
              Operating mode
            </label>
            <select
              id="agent-key-mode"
              className="settings-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentOperatingMode)}
            >
              <option value="propose_only">Propose only — create and revise plans</option>
              <option value="delegated_execution">
                Delegated execution — may apply granted stages
              </option>
              <option value="autonomous_policy">
                Autonomous policy — explicit unsupervised execution
              </option>
            </select>

            <fieldset className="settings-scope-fieldset">
              <legend className="settings-label">Course Check stages</legend>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={grantAll}
                  onChange={(e) => {
                    setGrantAll(e.target.checked);
                    if (e.target.checked) setScopes([...COURSE_CHECK_SCOPES]);
                  }}
                />
                <span>All stages (stored as expanded individual scopes)</span>
              </label>
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <label key={scope} className="settings-check">
                    <input
                      type="checkbox"
                      checked={grantAll || scopes.includes(scope)}
                      disabled={grantAll}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{SCOPE_LABELS[scope]}</span>
                  </label>
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
          <p className="muted">
            Connect Claude Code, Cursor, Codex, or any MCP client with the same agent API key. No
            OAuth wizard — paste the server URL and Authorization header.
          </p>

          <div className="mcp-field">
            <label className="settings-label" htmlFor="mcp-url">
              MCP server URL
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
            <p className="settings-form-legend">Create an MCP token</p>
            <p className="muted">
              This creates the same scoped agent key used by the API tab. Defaults stay propose-only
              until you grant stages.
            </p>
            <label className="settings-label" htmlFor="mcp-key-name">
              Name
            </label>
            <input
              id="mcp-key-name"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Code"
              autoComplete="off"
            />
            <label className="settings-label" htmlFor="mcp-key-mode">
              Operating mode
            </label>
            <select
              id="mcp-key-mode"
              className="settings-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentOperatingMode)}
            >
              <option value="propose_only">Propose only — create and revise plans</option>
              <option value="delegated_execution">
                Delegated execution — may apply granted stages
              </option>
              <option value="autonomous_policy">
                Autonomous policy — explicit unsupervised execution
              </option>
            </select>
            <fieldset className="settings-scope-fieldset">
              <legend className="settings-label">Course Check stages</legend>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={grantAll}
                  onChange={(e) => {
                    setGrantAll(e.target.checked);
                    if (e.target.checked) setScopes([...COURSE_CHECK_SCOPES]);
                  }}
                />
                <span>All stages</span>
              </label>
              <div className="settings-scope-grid">
                {COURSE_CHECK_SCOPES.map((scope) => (
                  <label key={scope} className="settings-check">
                    <input
                      type="checkbox"
                      checked={grantAll || scopes.includes(scope)}
                      disabled={grantAll}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{SCOPE_LABELS[scope]}</span>
                  </label>
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
            <strong>Cursor / generic MCP config</strong>
            <p className="muted">Add to <code>.cursor/mcp.json</code> or your client’s MCP settings.</p>
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

          <p className="muted">
            Treat the token like a password. Revoke it below when access should end.
          </p>
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
}: {
  event?: EventRecord;
  eventId?: string;
  onEventUpdated?: (event: EventRecord) => void;
}) {
  const eventId = event?.id ?? legacyEventId ?? "";
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formTone, setFormTone] = useState<"success" | "error">("success");

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

  function onDemoSandbox() {
    setFormMessage(null);
    setBaseId(DEMO_BASE_ID);
    setAccessToken(DEMO_TOKEN);
    connectMutation.mutate({
      baseId: DEMO_BASE_ID,
      accessToken: DEMO_TOKEN,
    });
  }

  const busy =
    connectMutation.isPending ||
    pullMutation.isPending ||
    disconnectMutation.isPending;

  const canSubmit =
    Boolean(baseId.trim()) &&
    (Boolean(accessToken.trim()) || Boolean(sync?.hasAccessToken));

  return (
    <div className="workspace settings-workspace" aria-label="Settings sections">
      <div className="settings-stack">
        {event ? (
          <EventConfigurationCard event={event} onUpdated={onEventUpdated} />
        ) : null}
        {event ? (
          <section className="settings-card" aria-labelledby="reviewers-heading">
            <div className="settings-card-header">
              <div>
                <h2 id="reviewers-heading">Reviewers</h2>
                <p className="muted">
                  Grant or remove track access for signed-in reviewers. Invitations and
                  track assignments stay event-scoped.
                </p>
              </div>
            </div>
            <ReviewerRouting event={event} />
          </section>
        ) : null}
        {event ? <EvaluationPlanCard eventId={event.id} /> : null}
        <CourseCheckPolicyCard eventId={eventId} />
        <AutomationAccessCard eventId={eventId} />

        <section className="settings-card" aria-labelledby="airtable-sync-heading">
          <div className="settings-card-header">
            <div>
              <h2 id="airtable-sync-heading">Airtable sync</h2>
              <p className="muted">
                Optional. Pull mapped fields from a ChartStead Program base. Core ChartStead
                work stays available when Airtable is offline.
              </p>
            </div>
            {sync ? (
              <span className={healthTone(sync.health)}>{healthLabel(sync.health)}</span>
            ) : null}
          </div>

          {syncQuery.isPending ? (
            <p className="empty-state padded">Loading sync status…</p>
          ) : syncQuery.error instanceof ApiError ? (
            <p className="form-message error" role="alert">
              {syncQuery.error.message}
            </p>
          ) : (
            <>
              <div className="settings-demo-callout">
                <strong>No Airtable account?</strong>
                <p>
                  Use the built-in sandbox. It fakes a connected base and pulls a visible title
                  change onto a few submissions so you can verify the flow end-to-end.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={onDemoSandbox}
                >
                  {connectMutation.isPending
                    ? "Connecting demo…"
                    : "Connect demo Airtable sandbox"}
                </button>
              </div>

              <form className="settings-form" onSubmit={onConnect}>
                <p className="settings-form-legend">Or connect a real Airtable base</p>
                <label className="settings-label" htmlFor="airtable-base-id">
                  Base ID
                </label>
                <input
                  id="airtable-base-id"
                  className="settings-input"
                  name="baseId"
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  placeholder="appXXXXXXXXXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                />

                <label className="settings-label" htmlFor="airtable-access-token">
                  Personal access token
                  {sync?.hasAccessToken ? " (leave blank to keep current)" : ""}
                </label>
                <input
                  id="airtable-access-token"
                  className="settings-input"
                  name="accessToken"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={
                    sync?.hasAccessToken ? "•••••••• (saved)" : "patXXXXXXXX…."
                  }
                  autoComplete="off"
                  spellCheck={false}
                />

                <div className="settings-actions">
                  <button
                    type="submit"
                    className="btn btn-secondary"
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
                    className="btn btn-ghost"
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
      </div>
    </div>
  );
}
