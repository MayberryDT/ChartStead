import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  addQuestion,
  describeCondition,
  getSpeakerSettings,
  getWelcomeContent,
  hasQuestion,
  listEditableQuestions,
  moveQuestion,
  parseVisibleIf,
  removeQuestion,
  setQuestionCondition,
  setSupportingOptions,
  updateQuestion,
  updateSpeakerSettings,
  updateWelcome,
  validateCfpDefinition,
  type CfpCondition,
  type CfpDefinitionV1,
  type RestrictedQuestion,
  type SurveyChoice,
} from "../shared/cfp-definition";
import {
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../shared/cfp-timezone";
import type { OrganizerCfpForm, PublishedCfpForm } from "../shared/events";
import {
  closeOrganizerForm,
  fetchOrganizerForm,
  publishOrganizerForm,
  reopenOrganizerForm,
  saveOrganizerFormDraft,
} from "./api";
import { CfpRuntime } from "./CfpRuntime";

type BuilderStep = "basics" | "proposal" | "speakers" | "preview";

type DraftSaveState =
  | { status: "saved"; revision: number }
  | { status: "unsaved"; revision: number }
  | { status: "saving"; revision: number }
  | { status: "failed"; revision: number; message: string };

export type CfpBuilderChrome = {
  title: string;
  meta: string;
  actions: ReactNode;
};

type SaveVars = {
  revision: number;
  name: string;
  definition: CfpDefinitionV1;
};

const steps: Array<{ id: BuilderStep; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "proposal", label: "Proposal" },
  { id: "speakers", label: "Speakers" },
  { id: "preview", label: "Preview & publish" },
];

const ADD_FIELD_OPTIONS: Array<{
  id: string;
  label: string;
  build: (name: string) => RestrictedQuestion;
}> = [
  {
    id: "short-text",
    label: "Add short text",
    build: (name) => ({
      type: "text",
      name,
      title: "Short text question",
      maxLength: 200,
    }),
  },
  {
    id: "long-text",
    label: "Add long text",
    build: (name) => ({
      type: "comment",
      name,
      title: "Long text question",
      maxLength: 2_000,
      rows: 4,
    }),
  },
  {
    id: "single-choice",
    label: "Add single choice",
    build: (name) => ({
      type: "dropdown",
      name,
      title: "Single choice question",
      choices: [
        { value: "option1", text: "Option 1" },
        { value: "option2", text: "Option 2" },
      ],
    }),
  },
  {
    id: "email",
    label: "Add email",
    build: (name) => ({
      type: "text",
      name,
      title: "Email question",
      inputType: "email",
      maxLength: 320,
      validators: [{ type: "email", text: "Enter a valid email address." }],
    }),
  },
  {
    id: "url",
    label: "Add URL",
    build: (name) => ({
      type: "text",
      name,
      title: "URL question",
      inputType: "url",
      maxLength: 2_048,
    }),
  },
  {
    id: "file",
    label: "Add file",
    build: (name) => ({
      type: "chartstead-file",
      name,
      title: "File question",
      maxFileBytes: 5 * 1024 * 1024,
      acceptMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
    }),
  },
];

function questionTypeLabel(question: RestrictedQuestion): string {
  switch (question.type) {
    case "text":
      if (question.inputType === "email") return "email";
      if (question.inputType === "url") return "url";
      return "short text";
    case "comment":
      return "long text";
    case "dropdown":
      return "single choice";
    case "paneldynamic":
      return "speakers";
    case "chartstead-file":
      return "file";
    default:
      return "field";
  }
}

function nextCustomQuestionName(definition: CfpDefinitionV1): string {
  let index = 1;
  while (hasQuestion(definition, `customQuestion${index}`)) {
    index += 1;
  }
  return `customQuestion${index}`;
}

function saveStatusLabel(state: DraftSaveState): string {
  switch (state.status) {
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving";
    case "failed":
      return "Save failed";
  }
}

function earlierSingleChoiceSources(
  definition: CfpDefinitionV1,
  questionName: string,
): Array<Extract<RestrictedQuestion, { type: "dropdown" }>> {
  const questions = listEditableQuestions(definition);
  const index = questions.findIndex((question) => question.name === questionName);
  if (index <= 0) return [];
  return questions
    .slice(0, index)
    .filter(
      (question): question is Extract<RestrictedQuestion, { type: "dropdown" }> =>
        question.type === "dropdown",
    );
}

export function CfpBuilderPage() {
  const { eventId, formId } = useParams({ strict: false }) as {
    eventId?: string;
    formId?: string;
  };

  if (!eventId || !formId) {
    return (
      <section className="builder-work" aria-label="Guided CFP builder">
        <p className="form-message error" role="alert">
          CFP builder route is missing an event or form id.
        </p>
      </section>
    );
  }

  return <CfpBuilderWorkspace eventId={eventId} formId={formId} />;
}


export function CfpBuilderWorkspace({
  eventId,
  formId,
  onChromeChange,
}: {
  eventId: string;
  formId: string;
  onChromeChange?: (chrome: CfpBuilderChrome | null) => void;
}) {
  const queryClient = useQueryClient();
  const formQuery = useQuery({
    queryKey: ["form", eventId, formId],
    queryFn: () => fetchOrganizerForm(eventId, formId),
  });
  const form = formQuery.data?.form;
  const themeAccent = formQuery.data?.event.themeAccent;
  const timezone = formQuery.data?.event.timezone ?? "UTC";
  const liveLifecycle = formQuery.data?.lifecycle ?? null;
  const [step, setStep] = useState<BuilderStep>("basics");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<CfpDefinitionV1 | null>(null);
  const [saveState, setSaveState] = useState<DraftSaveState>({
    status: "saved",
    revision: 0,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const revisionRef = useRef(0);
  const hydratedKeyRef = useRef<string | null>(null);
  const serverDraftUpdatedAtRef = useRef<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const isDirty = saveState.status !== "saved";

  useEffect(() => {
    if (!form) return;
    const key = `${form.id}:${form.draftUpdatedAt}`;
    if (hydratedKeyRef.current === key) return;
    if (isDirty && hydratedKeyRef.current !== null) return;
    hydratedKeyRef.current = key;
    serverDraftUpdatedAtRef.current = form.draftUpdatedAt;
    setName(form.name);
    setDraft(form.draft);
    revisionRef.current = 0;
    setSaveState({ status: "saved", revision: 0 });
  }, [form, isDirty]);

  useBlocker({
    shouldBlockFn: () => {
      if (!isDirty) return false;
      return !window.confirm("Leave without saving your CFP changes?");
    },
    enableBeforeUnload: isDirty,
  });

  const markEdited = (nextName: string, nextDraft: CfpDefinitionV1) => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setName(nextName);
    setDraft(nextDraft);
    setSaveState((prev) =>
      prev.status === "failed"
        ? { status: "failed", revision, message: prev.message }
        : { status: "unsaved", revision },
    );
  };

  const updateDraft = (updater: (current: CfpDefinitionV1) => CfpDefinitionV1) => {
    if (!draft) return;
    markEdited(name, updater(draft));
  };

  const updateName = (value: string) => {
    if (!draft) return;
    markEdited(value, draft);
  };

  const save = useMutation({
    mutationFn: async (vars: SaveVars) => {
      const errors = validateCfpDefinition(vars.definition);
      if (errors.length > 0) {
        throw new Error(errors[0] ?? "Draft is invalid.");
      }
      const form = await saveOrganizerFormDraft(eventId, formId, {
        name: vars.name,
        draft: vars.definition,
        expectedDraftUpdatedAt: serverDraftUpdatedAtRef.current ?? undefined,
      });
      return { form, revision: vars.revision };
    },
    onMutate: (vars) => {
      setSaveState({ status: "saving", revision: vars.revision });
      setMessage(null);
    },
    onSuccess: async ({ form, revision }) => {
      serverDraftUpdatedAtRef.current = form.draftUpdatedAt;
      if (revision === revisionRef.current) {
        setDraft(form.draft);
        setName(form.name);
        setSaveState({ status: "saved", revision });
        hydratedKeyRef.current = `${form.id}:${form.draftUpdatedAt}`;
        setTone("success");
        setMessage("Draft saved. Published form is unchanged until you publish.");
        await queryClient.invalidateQueries({ queryKey: ["form", eventId, formId] });
        await queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
        return;
      }
      setSaveState((prev) => {
        if (prev.revision !== revisionRef.current) {
          return { status: "unsaved", revision: revisionRef.current };
        }
        if (prev.status === "saving" && prev.revision === revision) {
          return { status: "unsaved", revision: revisionRef.current };
        }
        return prev.status === "saved"
          ? prev
          : { status: "unsaved", revision: revisionRef.current };
      });
    },
    onError: (error: Error, vars) => {
      // Stale in-flight saves must not toast or flip UI over newer local state.
      if (vars.revision !== revisionRef.current) {
        return;
      }
      setSaveState({
        status: "failed",
        revision: revisionRef.current,
        message: error.message,
      });
      setTone("error");
      setMessage(error.message);
    },
  });

  const requestSave = () => {
    if (!draft) return;
    save.mutate({
      revision: revisionRef.current,
      name,
      definition: draft,
    });
  };

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Draft is not ready.");
      if (save.isPending || saveState.status === "saving") {
        throw new Error("Wait for the current save to finish before publishing.");
      }
      const errors = validateCfpDefinition(draft);
      if (errors.length > 0) {
        throw new Error(errors[0] ?? "Draft is invalid.");
      }
      const revisionAtStart = revisionRef.current;
      const form = await publishOrganizerForm(eventId, formId, {
        name,
        draft,
        expectedDraftUpdatedAt: serverDraftUpdatedAtRef.current ?? undefined,
      });
      return { form, revisionAtStart };
    },
    onSuccess: async ({ form, revisionAtStart }) => {
      serverDraftUpdatedAtRef.current = form.draftUpdatedAt;
      // Keep revisionRef monotonic for the page lifetime. Resetting to 0 lets a
      // stale in-flight draft save reuse a revision number and clobber newer edits.
      if (revisionRef.current === revisionAtStart) {
        setDraft(form.draft);
        setName(form.name);
        setSaveState({ status: "saved", revision: revisionRef.current });
        hydratedKeyRef.current = `${form.id}:${form.draftUpdatedAt}`;
      } else {
        setSaveState((prev) =>
          prev.status === "saved"
            ? prev
            : { status: "unsaved", revision: revisionRef.current },
        );
      }
      setTone("success");
      setMessage(`Published version ${form.publishedVersion}.`);
      await queryClient.invalidateQueries({ queryKey: ["form", eventId, formId] });
      await queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["cfp", eventId] });
    },
    onError: (error: Error) => {
      setTone("error");
      setMessage(error.message);
    },
  });

  const saveInFlight = save.isPending || saveState.status === "saving";

  const close = useMutation({
    mutationFn: () => closeOrganizerForm(eventId, formId),
    onSuccess: async () => {
      setTone("success");
      setMessage("Form closed to new submissions.");
      await queryClient.invalidateQueries({ queryKey: ["form", eventId, formId] });
    },
  });

  const reopen = useMutation({
    mutationFn: () => reopenOrganizerForm(eventId, formId),
    onSuccess: async () => {
      setTone("success");
      setMessage("Form reopened for submissions.");
      await queryClient.invalidateQueries({ queryKey: ["form", eventId, formId] });
    },
  });

  const previewForm = useMemo(() => {
    if (!draft || !form) return null;
    if (validateCfpDefinition(draft).length > 0) return null;
    const published: PublishedCfpForm = {
      id: form.id,
      name: name || form.name,
      status: "published",
      definitionVersion: form.publishedVersion ?? 0,
      definition: {
        ...draft,
        status: "published",
      },
      publishedAt: form.publishedAt ?? new Date().toISOString(),
    };
    return published;
  }, [draft, form, name]);

  const chromeTitle = form ? name || form.name : "Guided CFP builder";
  const chromeMeta = formQuery.isError
    ? "Builder could not open"
    : form
      ? `Status: ${form.lifecycleStatus}${
          form.publishedVersion ? ` · Live version ${form.publishedVersion}` : " · Not published"
        } · ${saveStatusLabel(saveState)}`
      : "Loading form…";

  useEffect(() => {
    if (!onChromeChange) return;
    onChromeChange({
      title: chromeTitle,
      meta: chromeMeta,
      actions: (
        <>
          <Link
            className="btn btn-ghost btn-sm"
            to="/e/$eventId/forms"
            params={{ eventId }}
          >
            All forms
          </Link>
          <a className="btn btn-secondary btn-sm" href={`/e/${eventId}/cfp?formId=${formId}`}>
            Open CFP
          </a>
          {form && saveState.status === "failed" ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={save.isPending}
              onClick={requestSave}
            >
              Retry save
            </button>
          ) : null}
          {form ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={save.isPending || saveState.status === "saved"}
                onClick={requestSave}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={publish.isPending || saveInFlight}
                onClick={() => publish.mutate()}
              >
                Publish
              </button>
            </>
          ) : null}
        </>
      ),
    });
    return () => onChromeChange(null);
  }, [
    chromeMeta,
    chromeTitle,
    eventId,
    form,
    formId,
    onChromeChange,
    publish.isPending,
    save.isPending,
    saveInFlight,
    saveState.status,
  ]);

  if (formQuery.isError) {
    return (
      <section className="builder-work" aria-label="Guided CFP builder">
        <p className="form-message error" role="alert">
          {formQuery.error.message}
        </p>
      </section>
    );
  }

  if (formQuery.isPending || !draft || !form) {
    return (
      <section className="builder-work" aria-label="Guided CFP builder" aria-busy="true">
        <p>Loading form builder…</p>
      </section>
    );
  }

  return (
    <section className="builder-work" aria-label="Guided CFP builder">

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {!onChromeChange ? (
        <div className="builder-standalone-chrome">
          <div>
            <p className="eyebrow">Guided CFP builder</p>
            <h1>{chromeTitle}</h1>
            <p className="builder-meta">
              Status: <strong>{form.lifecycleStatus}</strong>
              {form.publishedVersion
                ? ` · Live version ${form.publishedVersion}`
                : " · Not published"}
              {" · "}
              <span className="builder-save-status" role="status">
                {saveStatusLabel(saveState)}
              </span>
            </p>
          </div>
          <div className="builder-actions">
            <a className="btn btn-ghost" href={`/e/${eventId}/forms`}>
              All forms
            </a>
            <a className="btn btn-secondary" href={`/e/${eventId}/cfp?formId=${formId}`}>
              Open CFP
            </a>
            {saveState.status === "failed" ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={save.isPending}
                onClick={requestSave}
              >
                Retry save
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={save.isPending || saveState.status === "saved"}
              onClick={requestSave}
            >
              Save draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={publish.isPending || saveInFlight}
              onClick={() => publish.mutate()}
            >
              Publish
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`form-message ${tone}`} role="status">
          {message}
        </p>
      ) : null}

      <nav className="builder-steps" aria-label="Builder steps">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === step ? "active" : undefined}
            onClick={() => setStep(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="builder-layout">
        <section className="builder-editor">
          {step === "basics" ? (
            <BasicsStep
              name={name}
              draft={draft}
              timezone={timezone}
              onNameChange={updateName}
              onChange={updateDraft}
            />
          ) : null}
          {step === "proposal" ? (
            <ProposalStep
              draft={draft}
              onChange={updateDraft}
              onAnnounce={setLiveAnnouncement}
            />
          ) : null}
          {step === "speakers" ? (
            <SpeakersStep draft={draft} onChange={updateDraft} />
          ) : null}
          {step === "preview" ? (
            <PreviewStep
              form={form}
              lifecycleState={liveLifecycle?.state ?? form.lifecycleStatus}
              eventId={eventId}
              onClose={() => close.mutate()}
              onReopen={() => reopen.mutate()}
              closing={close.isPending}
              reopening={reopen.isPending}
            />
          ) : null}
        </section>

        <aside className="builder-preview" aria-label="Live preview">
          <div className="builder-preview-header">
            <h2>Preview</h2>
            <p>Same runtime as the public form.</p>
          </div>
          {previewForm ? (
            <CfpRuntime
              key={JSON.stringify(previewForm.definition.runtime.survey)}
              eventId={eventId}
              form={previewForm}
              mode="preview"
              themeAccent={themeAccent}
            />
          ) : (
            <p className="form-message error">Fix draft validation to preview.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function BasicsStep({
  name,
  draft,
  timezone,
  onNameChange,
  onChange,
}: {
  name: string;
  draft: CfpDefinitionV1;
  timezone: string;
  onNameChange: (value: string) => void;
  onChange: (updater: (current: CfpDefinitionV1) => CfpDefinitionV1) => void;
}) {
  const welcome = getWelcomeContent(draft);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const updateSchedule = (field: "opensAt" | "closesAt", local: string) => {
    try {
      const instant = local ? localDateTimeToInstant(local, timezone) : null;
      setScheduleError(null);
      onChange((current) => ({ ...current, [field]: instant }));
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Choose a valid time.");
    }
  };
  return (
    <div className="builder-stack">
      <label>
        Form name
        <input value={name} onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <label>
        Welcome title
        <input
          value={welcome.title}
          onChange={(event) =>
            onChange((current) =>
              updateWelcome(current, { title: event.target.value }),
            )
          }
        />
      </label>
      <label>
        Welcome body
        <textarea
          rows={4}
          value={welcome.body}
          onChange={(event) =>
            onChange((current) =>
              updateWelcome(current, { body: event.target.value }),
            )
          }
        />
      </label>
      <fieldset className="builder-schedule">
        <legend>Submission schedule</legend>
        <p>
          Enter local times in {timezone}. Schedule changes stay private until you
          publish.
        </p>
        <label>
          Opening time ({timezone})
          <input
            type="datetime-local"
            value={draft.opensAt ? instantToLocalDateTime(draft.opensAt, timezone) : ""}
            onChange={(event) => updateSchedule("opensAt", event.target.value)}
          />
        </label>
        <p className="muted-line">
          Opening instant: {draft.opensAt ?? "No scheduled opening"}
        </p>
        <label>
          Closing time ({timezone})
          <input
            type="datetime-local"
            value={draft.closesAt ? instantToLocalDateTime(draft.closesAt, timezone) : ""}
            onChange={(event) => updateSchedule("closesAt", event.target.value)}
          />
        </label>
        <p className="muted-line">
          Closing instant: {draft.closesAt ?? "No scheduled closing"}
        </p>
        {scheduleError ? <p className="form-message error" role="alert">{scheduleError}</p> : null}
      </fieldset>
    </div>
  );
}

function ProposalStep({
  draft,
  onChange,
  onAnnounce,
}: {
  draft: CfpDefinitionV1;
  onChange: (updater: (current: CfpDefinitionV1) => CfpDefinitionV1) => void;
  onAnnounce: (message: string) => void;
}) {
  const questions = listEditableQuestions(draft).filter(
    (question) => question.name !== "speakers",
  );

  return (
    <div className="builder-stack">
      <p>
        Required settings, ordinary validation, and sentence-readable conditions.
      </p>
      <div className="builder-add-field-row">
        {ADD_FIELD_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              let createdName = "";
              onChange((current) => {
                createdName = nextCustomQuestionName(current);
                return addQuestion(current, option.build(createdName));
              });
              if (createdName) {
                onAnnounce(`Added field ${option.label}.`);
                window.setTimeout(() => {
                  const card = document.querySelector(
                    `[data-testid="field-card-${createdName}"]`,
                  ) as HTMLElement | null;
                  if (card && typeof card.scrollIntoView === "function") {
                    card.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }
                  const firstSetting = card?.querySelector(
                    "input:not([type='checkbox']):not([type='hidden']), textarea, select",
                  ) as HTMLElement | null;
                  firstSetting?.focus();
                }, 50);
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {questions.map((question, index) => (
        <FieldCard
          key={question.name}
          draft={draft}
          question={question}
          index={index}
          total={questions.length}
          onChange={onChange}
          onAnnounce={onAnnounce}
        />
      ))}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={hasQuestion(draft, "supportingLink")}
          onChange={(event) =>
            onChange((current) =>
              setSupportingOptions(current, { link: event.target.checked }),
            )
          }
        />
        Include supporting link
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={hasQuestion(draft, "supportingFile")}
          onChange={(event) =>
            onChange((current) =>
              setSupportingOptions(current, { file: event.target.checked }),
            )
          }
        />
        Include supporting file upload
      </label>
    </div>
  );
}

function FieldCard({
  draft,
  question,
  index,
  total,
  onChange,
  onAnnounce,
}: {
  draft: CfpDefinitionV1;
  question: RestrictedQuestion;
  index: number;
  total: number;
  onChange: (updater: (current: CfpDefinitionV1) => CfpDefinitionV1) => void;
  onAnnounce: (message: string) => void;
}) {
  const protectedField = draft.chartstead.protectedNames.includes(question.name);
  const condition =
    "visibleIf" in question && question.visibleIf
      ? parseVisibleIf(question.visibleIf)
      : null;
  const sources = earlierSingleChoiceSources(draft, question.name);
  const selectedSource =
    sources.find((source) => source.name === condition?.fieldName) ?? null;

  return (
    <article
      className="field-card"
      data-testid={`field-card-${question.name}`}
    >
      <header>
        <strong>{question.title}</strong>
        <span>{questionTypeLabel(question)}</span>
      </header>
      <div className="field-card-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={index === 0}
          onClick={() => {
            onChange((current) => moveQuestion(current, question.name, "up"));
            onAnnounce(
              `Moved ${question.title || question.name} up to position ${index}.`,
            );
          }}
        >
          Move up
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={index >= total - 1}
          onClick={() => {
            onChange((current) => moveQuestion(current, question.name, "down"));
            onAnnounce(
              `Moved ${question.title || question.name} down to position ${index + 2}.`,
            );
          }}
        >
          Move down
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={protectedField}
          onClick={() =>
            onChange((current) => removeQuestion(current, question.name))
          }
        >
          Remove
        </button>
      </div>
      <label>
        Label
        <input
          value={question.title}
          onChange={(event) =>
            onChange((current) =>
              updateQuestion(current, question.name, {
                title: event.target.value,
              }),
            )
          }
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={Boolean(question.isRequired)}
          disabled={protectedField}
          onChange={(event) =>
            onChange((current) =>
              updateQuestion(current, question.name, {
                isRequired: event.target.checked,
              }),
            )
          }
        />
        Required
      </label>
      <label>
        Helper text
        <input
          value={question.description ?? ""}
          onChange={(event) =>
            onChange((current) =>
              updateQuestion(current, question.name, {
                description: event.target.value,
              }),
            )
          }
        />
      </label>
      {question.type === "text" || question.type === "comment" ? (
        <label>
          Character limit
          <input
            type="number"
            min={1}
            max={10_000}
            value={question.maxLength ?? ""}
            onChange={(event) =>
              onChange((current) =>
                updateQuestion(current, question.name, {
                  maxLength: Number(event.target.value) || undefined,
                }),
              )
            }
          />
        </label>
      ) : null}
      {question.type === "dropdown" ? (
        <label>
          Choices (one per line as value|label)
          <textarea
            rows={4}
            value={choicesToEditor(question.choices)}
            disabled={protectedField}
            onChange={(event) =>
              onChange((current) =>
                updateQuestion(current, question.name, {
                  choices: editorToChoices(event.target.value),
                }),
              )
            }
          />
        </label>
      ) : null}
      {question.type === "chartstead-file" ? (
        <>
          <label>
            Max file size (MB)
            <input
              type="number"
              min={1}
              max={20}
              value={Math.round((question.maxFileBytes ?? 5 * 1024 * 1024) / (1024 * 1024))}
              onChange={(event) =>
                onChange((current) =>
                  updateQuestion(current, question.name, {
                    maxFileBytes:
                      (Number(event.target.value) || 5) * 1024 * 1024,
                  }),
                )
              }
            />
          </label>
          <label>
            Allowed file types
            <input
              value={(question.acceptMimeTypes ?? []).join(", ")}
              onChange={(event) =>
                onChange((current) =>
                  updateQuestion(current, question.name, {
                    acceptMimeTypes: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }),
                )
              }
            />
          </label>
        </>
      ) : null}
      {sources.length > 0 && !protectedField ? (
        <div className="condition-editor">
          <div className="condition-editor-row">
            <label>
              Show this question when
              <select
                value={condition?.fieldName ?? ""}
                onChange={(event) => {
                  const fieldName = event.target.value;
                  if (!fieldName) {
                    onChange((current) =>
                      setQuestionCondition(current, question.name, null),
                    );
                    return;
                  }
                  const source = sources.find((item) => item.name === fieldName);
                  const equals = source?.choices[0]?.value ?? "";
                  onChange((current) =>
                    setQuestionCondition(current, question.name, {
                      fieldName,
                      equals,
                    }),
                  );
                }}
              >
                <option value="">Always show</option>
                {sources.map((source) => (
                  <option key={source.name} value={source.name}>
                    {source.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              is
              <select
                value={condition?.equals ?? ""}
                disabled={!selectedSource}
                onChange={(event) => {
                  if (!condition) return;
                  const next: CfpCondition = {
                    fieldName: condition.fieldName,
                    equals: event.target.value,
                  };
                  onChange((current) =>
                    setQuestionCondition(current, question.name, next),
                  );
                }}
              >
                {(selectedSource?.choices ?? []).map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.text}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {condition ? (
            <>
              <p className="condition-sentence">
                {describeCondition(condition, draft)}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  onChange((current) =>
                    setQuestionCondition(current, question.name, null),
                  )
                }
              >
                Remove condition
              </button>
            </>
          ) : null}
        </div>
      ) : condition ? (
        <p className="condition-sentence">
          {describeCondition(condition, draft)}
        </p>
      ) : null}
    </article>
  );
}

function choicesToEditor(choices: SurveyChoice[]): string {
  return choices.map((choice) => `${choice.value}|${choice.text}`).join("\n");
}

function editorToChoices(value: string): SurveyChoice[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawValue, ...rest] = line.split("|");
      const text = rest.length > 0 ? rest.join("|").trim() : rawValue!.trim();
      const choiceValue = (rawValue ?? `option${index + 1}`).trim() || `option${index + 1}`;
      return { value: choiceValue, text: text || choiceValue };
    });
}

function SpeakersStep({
  draft,
  onChange,
}: {
  draft: CfpDefinitionV1;
  onChange: (updater: (current: CfpDefinitionV1) => CfpDefinitionV1) => void;
}) {
  const speakers = getSpeakerSettings(draft);
  return (
    <div className="builder-stack">
      <p>Primary speaker plus repeatable co-speakers.</p>
      <label>
        Minimum speakers
        <input
          type="number"
          min={1}
          max={8}
          value={speakers.minCount}
          onChange={(event) =>
            onChange((current) =>
              updateSpeakerSettings(current, {
                minCount: Number(event.target.value) || 1,
              }),
            )
          }
        />
      </label>
      <label>
        Maximum speakers
        <input
          type="number"
          min={1}
          max={8}
          value={speakers.maxCount}
          onChange={(event) =>
            onChange((current) =>
              updateSpeakerSettings(current, {
                maxCount: Number(event.target.value) || 1,
              }),
            )
          }
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={speakers.collectBiography}
          onChange={(event) =>
            onChange((current) =>
              updateSpeakerSettings(current, {
                collectBiography: event.target.checked,
              }),
            )
          }
        />
        Collect biography
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={speakers.collectHeadshot}
          onChange={(event) =>
            onChange((current) =>
              updateSpeakerSettings(current, {
                collectHeadshot: event.target.checked,
              }),
            )
          }
        />
        Collect headshot
      </label>
    </div>
  );
}

function PreviewStep({
  form,
  lifecycleState,
  eventId,
  onClose,
  onReopen,
  closing,
  reopening,
}: {
  form: OrganizerCfpForm;
  lifecycleState: "draft" | "scheduled" | "open" | "closed" | "published";
  eventId: string;
  onClose: () => void;
  onReopen: () => void;
  closing: boolean;
  reopening: boolean;
}) {
  const publicHref = `/e/${eventId}/cfp?formId=${form.id}`;
  return (
    <div className="builder-stack">
      <p>
        Preview uses the same runtime and event theme as the public form. Draft
        edits stay private until you publish.
      </p>
      {form.publishedVersion ? (
        <a className="btn btn-secondary" href={publicHref}>
          Open public form
        </a>
      ) : (
        <p>Publish to get a public link.</p>
      )}
      {form.publishedVersion && lifecycleState !== "closed" ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={closing}
          onClick={onClose}
        >
          Close submissions
        </button>
      ) : null}
      {form.publishedVersion && lifecycleState === "closed" ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={reopening}
          onClick={onReopen}
        >
          Reopen submissions
        </button>
      ) : null}
    </div>
  );
}
