import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import type {
  EvaluationPlan,
  EvaluationScorecardCriterion,
  ReviewerAssignment,
} from "../shared/events";
import {
  fetchEvaluationPlan,
  fetchReviewerAssignments,
  saveEvaluationPlan,
  setEvaluationPlanEnabled,
  type EvaluationPlanRoundInput,
} from "./api";
import { SettingsCheckbox, SettingsSelectField, SettingsTextField } from "./SettingsFields";

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

function blankRound(position: number): EvaluationPlanRoundInput {
  const scorecardRef = position === 0 ? "initial-scorecard" : `round-${position + 1}-scorecard`;
  return {
    id: undefined,
    name: position === 0 ? "Initial review" : position === 1 ? "Final review" : `Round ${position + 1}`,
    state: "draft",
    startsOn: today(),
    endsOn: today(),
    scorecardRef,
    reviewerPool: [],
    anonymization: "none",
    scorecard: defaultScorecard(scorecardRef),
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

function criterionTypeLabel(type: EvaluationScorecardCriterion["type"]) {
  switch (type) {
    case "numeric":
      return "Numeric";
    case "dropdown":
      return "Dropdown";
    case "text":
      return "Text";
  }
}

export function ReviewSetupDialog({
  eventId,
  open,
  onClose,
}: {
  eventId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [draft, setDraft] = useState<EvaluationPlanDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [selectedCriterionId, setSelectedCriterionId] = useState<string | null>(null);

  const planQuery = useQuery({
    queryKey: ["evaluation-plan", eventId],
    queryFn: () => fetchEvaluationPlan(eventId),
    enabled: open,
  });
  const reviewersQuery = useQuery({
    queryKey: ["reviewers", eventId],
    queryFn: () => fetchReviewerAssignments(eventId),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setDraft(evaluationPlanDraft(planQuery.data?.plan ?? null));
    setMessage(null);
    setActiveRoundIndex(0);
    setSelectedCriterionId(null);
  }, [open, planQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveEvaluationPlan(eventId, {
        rounds: draft?.rounds ?? [blankRound(0), blankRound(1)],
        expectedVersion: draft?.version,
        enabled: draft?.enabled ?? true,
      }),
    onSuccess: ({ plan }) => {
      setDraft(evaluationPlanDraft(plan));
      setMessage("Review setup saved.");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plan", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["review-results", eventId] });
      onClose();
    },
  });

  const enabledMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setEvaluationPlanEnabled(eventId, {
        enabled,
        expectedVersion: draft?.version,
      }),
    onSuccess: ({ plan }) => {
      const next = evaluationPlanDraft(plan);
      setDraft(next);
      setMessage(plan?.enabled ? "Advanced review enabled." : "Advanced review disabled.");
      setActiveRoundIndex(0);
      setSelectedCriterionId(null);
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plan", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["review-results", eventId] });
    },
  });

  const rounds = draft?.rounds ?? [blankRound(0), blankRound(1)];
  const safeRoundIndex = Math.min(activeRoundIndex, Math.max(0, rounds.length - 1));
  const round = rounds[safeRoundIndex]!;
  const reviewers = reviewersQuery.data?.reviewers ?? [];
  const criteria = round.scorecard?.criteria ?? [];
  const advancedEnabled = draft?.enabled ?? false;

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
    criterionIndex: number,
    patch: Partial<EvaluationScorecardCriterion>,
  ) {
    const scorecard = round.scorecard ?? defaultScorecard(round.scorecardRef);
    updateRound(safeRoundIndex, {
      scorecard: {
        ...scorecard,
        criteria: scorecard.criteria.map((criterion, index) =>
          index === criterionIndex ? { ...criterion, ...patch } : criterion,
        ),
      },
    });
  }

  function addCriterion(type: EvaluationScorecardCriterion["type"]) {
    const scorecard = round.scorecard ?? defaultScorecard(round.scorecardRef);
    const id = `${round.scorecardRef}-${type}-${scorecard.criteria.length + 1}`;
    updateRound(safeRoundIndex, {
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
    setSelectedCriterionId(id);
  }

  function moveRound(direction: -1 | 1) {
    const nextIndex = safeRoundIndex + direction;
    if (nextIndex < 0 || nextIndex >= rounds.length) return;
    setDraft((current) => {
      const next = [...(current?.rounds ?? rounds)];
      [next[safeRoundIndex], next[nextIndex]] = [next[nextIndex]!, next[safeRoundIndex]!];
      return {
        enabled: current?.enabled ?? true,
        version: current?.version ?? 0,
        rounds: next,
      };
    });
    setActiveRoundIndex(nextIndex);
    setSelectedCriterionId(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="review-setup-backdrop" />
        <Dialog.Popup
          className="review-setup-dialog"
          aria-labelledby={titleId}
        >
          <div className="review-setup-header">
            <div>
              <p className="eyebrow">Submissions · Review</p>
              <Dialog.Title id={titleId} className="review-setup-title">
                Review Setup
              </Dialog.Title>
            </div>
            <Dialog.Close className="btn btn-ghost" aria-label="Close review setup">
              Close
            </Dialog.Close>
          </div>

          {planQuery.isPending || reviewersQuery.isPending ? (
            <p className="empty-state padded">Loading review setup…</p>
          ) : planQuery.isError || reviewersQuery.isError ? (
            <p className="form-message error" role="alert">
              Unable to load review setup.
            </p>
          ) : (
            <form
              className="review-setup-form"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                saveMutation.mutate();
              }}
            >
              <div className="review-setup-enable-row">
                <div>
                  <strong>{advancedEnabled ? "Advanced review on" : "Shared track queue"}</strong>
                  <p className="muted">
                    {advancedEnabled
                      ? "Reviewers only see proposals assigned to an open round."
                      : "Default: every reviewer uses the shared track queue."}
                  </p>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={enabledMutation.isPending || (!draft && advancedEnabled)}
                  onClick={() => {
                    if (!draft) {
                      setDraft({
                        enabled: true,
                        version: 0,
                        rounds: [blankRound(0), blankRound(1)],
                      });
                      setMessage(null);
                      return;
                    }
                    enabledMutation.mutate(!draft.enabled);
                  }}
                >
                  {advancedEnabled ? "Disable advanced review" : "Enable advanced review"}
                </button>
              </div>

              {advancedEnabled ? (
                <>
                  <div className="review-setup-round-switch" role="tablist" aria-label="Evaluation rounds">
                    {rounds.map((candidate, index) => (
                      <button
                        key={candidate.id ?? `new-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={index === safeRoundIndex}
                        className={index === safeRoundIndex ? "is-active" : undefined}
                        onClick={() => {
                          setActiveRoundIndex(index);
                          setSelectedCriterionId(null);
                        }}
                      >
                        {candidate.name || `Round ${index + 1}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="review-setup-add-round"
                      onClick={() => {
                        setDraft((current) => ({
                          enabled: current?.enabled ?? true,
                          version: current?.version ?? 0,
                          rounds: [...(current?.rounds ?? rounds), blankRound(rounds.length)],
                        }));
                        setActiveRoundIndex(rounds.length);
                        setSelectedCriterionId(null);
                      }}
                    >
                      Add round
                    </button>
                  </div>

                  <fieldset className="review-setup-round">
                    <legend>Round details</legend>
                    <div className="review-setup-round-fields">
                      <SettingsTextField
                        label="Name"
                        required
                        value={round.name}
                        onChange={(name) => updateRound(safeRoundIndex, { name })}
                      />
                      <SettingsTextField
                        label="Opens"
                        type="date"
                        required
                        value={round.startsOn}
                        onChange={(startsOn) => updateRound(safeRoundIndex, { startsOn })}
                      />
                      <SettingsTextField
                        label="Closes"
                        type="date"
                        required
                        value={round.endsOn}
                        onChange={(endsOn) => updateRound(safeRoundIndex, { endsOn })}
                      />
                      <SettingsSelectField
                        label="State"
                        value={round.state ?? "draft"}
                        onChange={(state) =>
                          updateRound(safeRoundIndex, {
                            state: state as "draft" | "open" | "closed",
                          })
                        }
                        options={[
                          { value: "draft", label: "Draft" },
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" },
                        ]}
                      />
                      <SettingsTextField
                        label="Scorecard reference"
                        required
                        value={round.scorecardRef}
                        onChange={(scorecardRef) => updateRound(safeRoundIndex, { scorecardRef })}
                      />
                      <SettingsCheckbox
                        label="Blind reviewer view"
                        checked={round.anonymization === "blind"}
                        onChange={(checked) =>
                          updateRound(safeRoundIndex, {
                            anonymization: checked ? "blind" : "none",
                          })
                        }
                      />
                    </div>

                    <section className="evaluation-reviewer-pool" aria-label="Reviewer pool">
                      <h3>Reviewer pool</h3>
                      <div className="evaluation-reviewer-list">
                        {reviewers.length === 0 ? (
                          <span className="muted">Add reviewers in Settings first.</span>
                        ) : null}
                        {reviewers.map((reviewer: ReviewerAssignment) => (
                          <SettingsCheckbox
                            key={reviewer.id}
                            label={reviewer.name}
                            checked={round.reviewerPool.includes(reviewer.id)}
                            onChange={(checked) =>
                              updateRound(safeRoundIndex, {
                                reviewerPool: checked
                                  ? [...round.reviewerPool, reviewer.id]
                                  : round.reviewerPool.filter((id) => id !== reviewer.id),
                              })
                            }
                          />
                        ))}
                      </div>
                    </section>

                    <section className="review-setup-criteria" aria-label="Scorecard criteria">
                      <div className="review-setup-criteria-header">
                        <h3>Criteria</h3>
                      </div>
                      <ul className="review-setup-criterion-list">
                        {criteria.map((criterion, criterionIndex) => {
                          const selected = selectedCriterionId === criterion.id;
                          return (
                            <li
                              key={criterion.id}
                              className={`review-setup-criterion${selected ? " is-selected" : ""}`}
                            >
                              <button
                                type="button"
                                className="review-setup-criterion-summary"
                                aria-expanded={selected}
                                onClick={() =>
                                  setSelectedCriterionId(selected ? null : criterion.id)
                                }
                              >
                                <span className="review-setup-criterion-label">
                                  {criterion.label || "Untitled criterion"}
                                </span>
                                <span className="review-setup-criterion-meta">
                                  {criterionTypeLabel(criterion.type)}
                                  {criterion.required ? " · Required" : ""}
                                </span>
                              </button>
                              {selected ? (
                                <div className="review-setup-criterion-editor">
                                  <div className="evaluation-criterion-primary">
                                    <SettingsTextField
                                      label="Label"
                                      required
                                      value={criterion.label}
                                      onChange={(label) => updateCriterion(criterionIndex, { label })}
                                    />
                                    <SettingsTextField
                                      label="Guidance"
                                      value={criterion.guidance}
                                      onChange={(guidance) =>
                                        updateCriterion(criterionIndex, { guidance })
                                      }
                                    />
                                  </div>
                                  <div className="evaluation-criterion-metadata">
                                    <SettingsSelectField
                                      label="Type"
                                      value={criterion.type}
                                      onChange={(nextTypeRaw) => {
                                        const nextType =
                                          nextTypeRaw as EvaluationScorecardCriterion["type"];
                                        const options =
                                          nextType === "dropdown" && criterion.options.length === 0
                                            ? defaultDropdownOptions(criterion.id)
                                            : nextType === "dropdown"
                                              ? criterion.options
                                              : [];
                                        updateCriterion(criterionIndex, {
                                          type: nextType,
                                          weight: nextType === "text" ? null : (criterion.weight ?? 1),
                                          maxScore:
                                            nextType === "text" ? null : (criterion.maxScore ?? 5),
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
                                            updateCriterion(criterionIndex, {
                                              weight: Number(value),
                                            })
                                          }
                                        />
                                        <SettingsTextField
                                          label="Max score"
                                          type="number"
                                          value={String(criterion.maxScore ?? 5)}
                                          onChange={(value) =>
                                            updateCriterion(criterionIndex, {
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
                                              updateCriterion(criterionIndex, {
                                                options: criterion.options.map(
                                                  (candidate, candidateIndex) =>
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
                                              const nextScore =
                                                value === "" ? null : Number(value);
                                              updateCriterion(criterionIndex, {
                                                options: criterion.options.map(
                                                  (candidate, candidateIndex) =>
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
                                              updateCriterion(criterionIndex, {
                                                options: criterion.options.filter(
                                                  (_, candidateIndex) =>
                                                    candidateIndex !== optionIndex,
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
                                          updateCriterion(criterionIndex, {
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
                                        updateCriterion(criterionIndex, { required })
                                      }
                                    />
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      type="button"
                                      disabled={criteria.length <= 1}
                                      onClick={() => {
                                        const scorecard =
                                          round.scorecard ?? defaultScorecard(round.scorecardRef);
                                        updateRound(safeRoundIndex, {
                                          scorecard: {
                                            ...scorecard,
                                            criteria: scorecard.criteria.filter(
                                              (_, candidateIndex) =>
                                                candidateIndex !== criterionIndex,
                                            ),
                                          },
                                        });
                                        setSelectedCriterionId(null);
                                      }}
                                    >
                                      Remove criterion
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="evaluation-plan-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => addCriterion("numeric")}
                        >
                          Add numeric
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => addCriterion("dropdown")}
                        >
                          Add dropdown
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => addCriterion("text")}
                        >
                          Add free text
                        </button>
                      </div>
                    </section>

                    <div className="evaluation-round-order">
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        disabled={safeRoundIndex === 0}
                        onClick={() => moveRound(-1)}
                      >
                        Move up
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        disabled={safeRoundIndex === rounds.length - 1}
                        onClick={() => moveRound(1)}
                      >
                        Move down
                      </button>
                      {rounds.length > 2 ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => {
                            setDraft((current) => ({
                              enabled: current?.enabled ?? true,
                              version: current?.version ?? 0,
                              rounds: (current?.rounds ?? rounds).filter(
                                (_, candidateIndex) => candidateIndex !== safeRoundIndex,
                              ),
                            }));
                            setActiveRoundIndex((index) => Math.max(0, index - 1));
                            setSelectedCriterionId(null);
                          }}
                        >
                          Remove round
                        </button>
                      ) : null}
                    </div>
                  </fieldset>
                </>
              ) : null}

              <div className="review-setup-footer">
                <Dialog.Close className="btn btn-secondary btn-sm" type="button">
                  Cancel
                </Dialog.Close>
                <button
                  className="btn btn-primary btn-sm"
                  type="submit"
                  disabled={saveMutation.isPending || !advancedEnabled}
                >
                  {saveMutation.isPending ? "Saving…" : "Save setup"}
                </button>
              </div>
              {saveMutation.isError || enabledMutation.isError ? (
                <p className="form-message error" role="alert">
                  {(saveMutation.error ?? enabledMutation.error)?.message ??
                    "Unable to save review setup."}
                </p>
              ) : message ? (
                <p className="form-message success" role="status">
                  {message}
                </p>
              ) : null}
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
