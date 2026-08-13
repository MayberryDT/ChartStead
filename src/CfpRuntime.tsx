import { useEffect, useMemo, useState } from "react";
import { Model, type CompletingEvent } from "survey-core";
import "survey-core/survey-core.css";
import { Survey } from "survey-react-ui";

import type {
  ProposalValidationError,
  PublishedCfpForm,
  SubmissionAnswers,
  SubmitterProposalDraft,
} from "../shared/events";
import { ApiError } from "./api";
import { registerUppyAssetQuestion } from "./UppyAssetQuestion";

registerUppyAssetQuestion();

export type CfpRuntimeMode = "public" | "preview" | "edit" | "draft";

interface CfpRuntimeProps {
  eventId: string;
  form: PublishedCfpForm;
  mode: CfpRuntimeMode;
  themeAccent?: string;
  initialAnswers?: SubmissionAnswers;
  completeText?: string;
  onSubmit?: (
    answers: SubmissionAnswers,
    form: PublishedCfpForm,
  ) => Promise<{ id: string }>;
  onSubmitted?: (proposalId: string) => void;
  onSaveDraft?: (
    answers: SubmissionAnswers,
    form: PublishedCfpForm,
  ) => Promise<SubmitterProposalDraft>;
  onDraftSaved?: (draft: SubmitterProposalDraft) => void;
  draftUpdatedAt?: string | null;
  saveDraftText?: string;
}

function applyFieldError(
  sender: Model,
  path: string,
  message: string,
): string | null {
  const direct = sender.getQuestionByName(path);
  if (direct) {
    direct.addError(message);
    return path;
  }

  const segments = path.split(".");
  if (segments.length < 2) return null;

  const rootName = segments[0]!;
  const root = sender.getQuestionByName(rootName);
  if (!root) return null;

  const panelIndex = Number(segments[1]);
  const rootWithPanels = root as unknown as {
    panels?: Array<{
      getQuestionByName?: (
        n: string,
      ) => { addError: (m: string) => void } | null;
    }>;
  };
  if (
    Number.isInteger(panelIndex) &&
    segments.length >= 3 &&
    Array.isArray(rootWithPanels.panels)
  ) {
    const panel = rootWithPanels.panels[panelIndex];
    const childName = segments.slice(2).join(".");
    const child = panel?.getQuestionByName?.(childName);
    if (child) {
      child.addError(message);
      return rootName;
    }
  }

  root.addError(message);
  return rootName;
}

export function CfpRuntime({
  eventId,
  form,
  mode,
  themeAccent = "#2f5d98",
  initialAnswers,
  completeText,
  onSubmit,
  onSubmitted,
  onSaveDraft,
  onDraftSaved,
  draftUpdatedAt,
  saveDraftText = "Save draft",
}: CfpRuntimeProps) {
  const surveyJson = form.definition?.runtime?.survey;
  const [survey] = useState(() => {
    if (!surveyJson) {
      throw new Error("Published form is missing a SurveyJS runtime definition.");
    }
    const model = new Model(surveyJson);
    // Conditional answers are ephemeral: once a question is hidden, its value
    // must not reappear when the condition becomes true again or reach storage.
    model.clearInvisibleValues = "onHidden";
    if (initialAnswers) {
      model.data = initialAnswers;
      for (const question of model.getAllQuestions()) {
        if (!question.isVisible) question.clearValue();
      }
    }
    if (completeText) {
      model.completeText = completeText;
    }
    if (mode === "edit") {
      model.completedHtml = "<p>Your proposal was updated.</p>";
    }
    if (mode === "draft") {
      model.showCompleteButton = false;
    }
    return model;
  });

  useEffect(() => {
    // Interactive chrome stays ChartStead steel blue. Event accent only hits --cfp-accent
    // (panel top bar) so public forms do not pick up off-palette event colors for CTAs/focus.
    survey.applyTheme({
      cssVariables: {
        "--sjs-primary-backcolor": "#2f5d98",
        "--sjs-primary-backcolor-dark": "#254c7e",
        "--sjs-primary-backcolor-light": "#eaf2fb",
        "--sjs-general-backcolor": "#ffffff",
        "--sjs-font-family": "Inter, system-ui, sans-serif",
      },
    } as never);
  }, [survey]);

  useEffect(() => {
    survey.setVariable("eventId", eventId);
    survey.setVariable("formId", form.id);
    survey.setVariable("definitionVersion", form.definitionVersion);
    survey.setVariable("mode", mode);
  }, [eventId, form.definitionVersion, form.id, mode, survey]);

  const [draftStatus, setDraftStatus] = useState<
    | { tone: "idle"; message: string | null }
    | { tone: "saving"; message: string }
    | { tone: "saved"; message: string }
    | { tone: "error"; message: string }
  >({ tone: "idle", message: null });

  async function saveDraft() {
    if (!onSaveDraft) return;
    setDraftStatus({ tone: "saving", message: "Saving draft…" });
    try {
      const draft = await onSaveDraft(survey.data as SubmissionAnswers, form);
      setDraftStatus({
        tone: "saved",
        message: `Draft saved ${new Date(draft.updatedAt).toLocaleTimeString()}.`,
      });
      onDraftSaved?.(draft);
    } catch (error) {
      setDraftStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save draft.",
      });
    }
  }

  useEffect(() => {
    if (mode === "draft") {
      survey.showCompleteButton = false;
    }
    if (mode === "preview" || mode === "draft" || !onSubmit) {
      survey.mode = mode === "preview" ? "display" : "edit";
      if (mode === "preview") {
        // Preview stays interactive for conditions/speakers, but does not complete.
        survey.mode = "edit";
        survey.showCompleteButton = true;
      }
      if (mode === "draft") {
        survey.mode = "edit";
        survey.showCompleteButton = false;
      }
    }

    let createdProposalId: string | null = null;

    const handleCompleting = async (sender: Model, options: CompletingEvent) => {
      if (mode === "preview" || !onSubmit) {
        options.allow = false;
        options.message = "Preview only - submissions are disabled.";
        return;
      }

      try {
        const proposal = await onSubmit(
          sender.data as SubmissionAnswers,
          form,
        );
        createdProposalId = proposal.id;
      } catch (error) {
        options.allow = false;
        if (error instanceof ApiError && error.status === 400) {
          const validation = error.body as ProposalValidationError;
          sender.data = validation.values;
          for (const question of sender.getAllQuestions()) {
            question.clearErrors();
          }
          let firstInvalidQuestion: string | null = null;
          for (const [name, message] of Object.entries(validation.errors)) {
            if (!message) continue;
            const focused = applyFieldError(sender, name, message);
            firstInvalidQuestion ??= focused;
          }
          if (firstInvalidQuestion) {
            sender.focusQuestion(firstInvalidQuestion);
          }
          return;
        }
        options.message =
          error instanceof Error
            ? error.message
            : mode === "edit"
              ? "Unable to update this proposal. Try again."
              : "Unable to submit this proposal. Try again.";
      }
    };

    const handleComplete = () => {
      if (!createdProposalId || !onSubmitted) return;
      onSubmitted(createdProposalId);
    };

    survey.onCompleting.add(handleCompleting);
    survey.onComplete.add(handleComplete);
    return () => {
      survey.onCompleting.remove(handleCompleting);
      survey.onComplete.remove(handleComplete);
    };
  }, [eventId, form, mode, onSubmit, onSubmitted, survey]);

  useEffect(() => {
    if (!draftUpdatedAt) return;
    setDraftStatus({
      tone: "saved",
      message: `Draft saved ${new Date(draftUpdatedAt).toLocaleTimeString()}.`,
    });
  }, [draftUpdatedAt]);

  const meta = useMemo(
    () => ({
      formId: form.id,
      definitionVersion: form.definitionVersion,
      mode,
    }),
    [form.definitionVersion, form.id, mode],
  );

  return (
    <div
      className="cfp-survey"
      data-form-id={meta.formId}
      data-definition-version={meta.definitionVersion}
      data-cfp-mode={meta.mode}
      style={{ ["--cfp-accent" as string]: themeAccent }}
    >
      {onSaveDraft ? (
        <div className="cfp-draft-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={draftStatus.tone === "saving"}
            onClick={() => void saveDraft()}
          >
            {draftStatus.tone === "saving" ? "Saving…" : saveDraftText}
          </button>
          {draftStatus.message ? (
            <p
              className="form-message"
              data-tone={draftStatus.tone === "error" ? "error" : "success"}
              role={draftStatus.tone === "error" ? "alert" : "status"}
            >
              {draftStatus.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <Survey model={survey} />
    </div>
  );
}
