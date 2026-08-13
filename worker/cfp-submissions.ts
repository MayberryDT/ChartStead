import {
  isUploadedAssetAnswer,
  parseVisibleIf,
  type CfpDefinitionV1,
  type RestrictedFileElement,
  type RestrictedQuestion,
  type RestrictedSurveyElement,
  type RestrictedTemplateElement,
} from "../shared/cfp-definition";
import type {
  CoSpeakerInput,
  EventRecord,
  ProposalInput,
  SubmissionAnswers,
  UploadedAssetAnswer,
} from "../shared/events";

export interface AssetClaimInput {
  path: string;
  questionName: string;
  answer: UploadedAssetAnswer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isQuestionVisible(
  element: RestrictedSurveyElement,
  answers: SubmissionAnswers,
): boolean {
  if (element.type === "html") return false;
  if (!("visibleIf" in element) || !element.visibleIf) return true;
  const condition = parseVisibleIf(element.visibleIf);
  if (!condition) return false;
  return readString(answers[condition.fieldName]) === condition.equals;
}

function requiredMessage(element: { requiredErrorText?: string; title: string }): string {
  return element.requiredErrorText?.trim() || `Enter ${element.title}.`;
}

function validateTextLike(
  element: RestrictedTemplateElement & {
    type: "text" | "comment";
    maxLength?: number;
    inputType?: "email" | "url" | "text";
  },
  value: unknown,
  path: string,
  errors: Record<string, string>,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (element.isRequired) {
      errors[path] = requiredMessage(element);
    }
    return "";
  }
  if (typeof value !== "string") {
    errors[path] = `Enter a valid value for ${element.title}.`;
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (element.isRequired) {
      errors[path] = requiredMessage(element);
    }
    return "";
  }
  if (element.maxLength !== undefined && trimmed.length > element.maxLength) {
    errors[path] = `Use ${element.maxLength} characters or fewer.`;
  }
  if (element.type === "text" && element.inputType === "email") {
    if (!EMAIL_RE.test(trimmed)) {
      errors[path] = "Enter a valid email address.";
    } else if (trimmed.length > 320) {
      errors[path] = "Use 320 characters or fewer.";
    }
  }
  if (element.type === "text" && element.inputType === "url") {
    if (trimmed.length > (element.maxLength ?? 2_048)) {
      errors[path] = `Use ${element.maxLength ?? 2_048} characters or fewer.`;
    } else {
      try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          errors[path] = "Use an http or https link.";
        }
      } catch {
        errors[path] = "Enter a valid URL.";
      }
    }
  }
  return trimmed;
}

function validateDropdown(
  element: RestrictedTemplateElement & { type: "dropdown"; choices: Array<{ value: string }> },
  value: unknown,
  path: string,
  errors: Record<string, string>,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (element.isRequired) {
      errors[path] = requiredMessage(element);
    }
    return "";
  }
  if (typeof value !== "string") {
    errors[path] = `Choose a valid option for ${element.title}.`;
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (element.isRequired) {
      errors[path] = requiredMessage(element);
    }
    return "";
  }
  if (!element.choices.some((choice) => choice.value === trimmed)) {
    errors[path] = `Choose a valid option for ${element.title}.`;
  }
  return trimmed;
}

function validateFile(
  element: RestrictedTemplateElement & { type: "chartstead-file" },
  value: unknown,
  path: string,
  errors: Record<string, string>,
): unknown {
  if (value === undefined || value === null || value === "") {
    if (element.isRequired) {
      errors[path] = requiredMessage(element);
    }
    return null;
  }
  if (!isUploadedAssetAnswer(value)) {
    errors[path] = `Upload a valid file for ${element.title}.`;
    return undefined;
  }
  return value;
}

function validateTemplateElement(
  element: RestrictedTemplateElement,
  value: unknown,
  path: string,
  errors: Record<string, string>,
): unknown {
  if (element.type === "text" || element.type === "comment") {
    return validateTextLike(element, value, path, errors);
  }
  if (element.type === "dropdown") {
    return validateDropdown(element, value, path, errors);
  }
  if (element.type === "chartstead-file") {
    return validateFile(element, value, path, errors);
  }
  return value;
}

function validatePanelDynamic(
  element: RestrictedQuestion & { type: "paneldynamic" },
  value: unknown,
  errors: Record<string, string>,
): unknown {
  if (value === undefined || value === null) {
    if (element.isRequired || element.minPanelCount > 0) {
      errors[element.name] =
        `Add at least ${element.minPanelCount} ${element.title.toLowerCase()}.`;
    }
    return [];
  }
  if (!Array.isArray(value)) {
    errors[element.name] = `Enter valid ${element.title.toLowerCase()}.`;
    return undefined;
  }
  if (value.length < element.minPanelCount) {
    errors[element.name] =
      `Add at least ${element.minPanelCount} ${element.title.toLowerCase()}.`;
  }
  if (value.length > element.maxPanelCount) {
    errors[element.name] =
      `Use ${element.maxPanelCount} ${element.title.toLowerCase()} or fewer.`;
  }

  const panels: Array<Record<string, unknown>> = [];
  for (const [index, entry] of value.entries()) {
    const source =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    const panel: Record<string, unknown> = {};
    const allowed = new Set(element.templateElements.map((child) => child.name));
    for (const key of Object.keys(source)) {
      if (!allowed.has(key)) {
        errors[`${element.name}.${index}.${key}`] = "Unknown field.";
      }
    }
    for (const child of element.templateElements) {
      const childPath = `${element.name}.${index}.${child.name}`;
      const cleaned = validateTemplateElement(
        child,
        source[child.name],
        childPath,
        errors,
      );
      if (cleaned !== undefined) {
        panel[child.name] = cleaned;
      }
    }
    panels.push(panel);
  }
  return panels;
}

function validateQuestion(
  element: RestrictedQuestion,
  value: unknown,
  errors: Record<string, string>,
): unknown {
  if (element.type === "paneldynamic") {
    return validatePanelDynamic(element, value, errors);
  }
  if (element.type === "text" || element.type === "comment") {
    return validateTextLike(element, value, element.name, errors);
  }
  if (element.type === "dropdown") {
    return validateDropdown(element, value, element.name, errors);
  }
  if (element.type === "chartstead-file") {
    return validateFile(element, value, element.name, errors);
  }
  return value;
}

function deriveNormalized(
  definition: CfpDefinitionV1,
  answers: SubmissionAnswers,
  event: EventRecord,
): ProposalInput | null {
  const title = readString(answers[definition.chartstead.proposalTitleName]).trim();
  const abstract = readString(answers.abstract).trim();
  const trackId = readString(answers[definition.chartstead.trackQuestionName]).trim();
  const track = event.tracks.find((candidate) => candidate.id === trackId);
  if (!title || !abstract || !track) {
    return null;
  }

  const speakersRaw = answers[definition.chartstead.speakerPanelName];
  let speakerName = "";
  let speakerEmail = "";
  let biography = "";
  let coSpeakers: CoSpeakerInput[] = [];

  if (Array.isArray(speakersRaw) && speakersRaw.length > 0) {
    const panels = speakersRaw.map((entry) => {
      const record =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      return {
        name: readString(record.name).trim(),
        email: readString(record.email).trim(),
        biography: readString(record.biography).trim(),
        role: readString(record.role).trim() || "co-speaker",
      };
    });
    const [primary, ...rest] = panels;
    speakerName = primary?.name ?? "";
    speakerEmail = primary?.email ?? "";
    biography = primary?.biography ?? "";
    coSpeakers = rest;
  } else {
    speakerName = readString(answers.speakerName).trim();
    speakerEmail = readString(answers.speakerEmail).trim();
    biography = readString(answers.biography).trim();
  }

  if (!speakerName || !speakerEmail) {
    return null;
  }

  const supportingFileRaw = answers.supportingFile;
  const supportingFile =
    supportingFileRaw === null || supportingFileRaw === undefined
      ? null
      : isUploadedAssetAnswer(supportingFileRaw)
        ? supportingFileRaw
        : null;

  return {
    title,
    abstract,
    trackId,
    speakerName,
    speakerEmail,
    biography,
    supportingLink: readString(answers.supportingLink).trim(),
    sessionFormat: readString(answers.sessionFormat).trim(),
    workshopDuration: readString(answers.workshopDuration).trim(),
    coSpeakers,
    supportingFile,
  };
}

export function resolveFileQuestion(
  definition: CfpDefinitionV1,
  questionName: string,
): RestrictedFileElement | null {
  const parts = questionName.split(".").filter(Boolean);
  if (parts.length === 1) {
    const element = definition.runtime.survey.elements.find(
      (candidate) => candidate.name === parts[0],
    );
    return element?.type === "chartstead-file" ? element : null;
  }
  if (parts.length === 2) {
    const panel = definition.runtime.survey.elements.find(
      (candidate) => candidate.name === parts[0],
    );
    if (panel?.type !== "paneldynamic") return null;
    const child = panel.templateElements.find(
      (candidate) => candidate.name === parts[1],
    );
    return child?.type === "chartstead-file" ? child : null;
  }
  return null;
}

export function collectAssetClaims(
  definition: CfpDefinitionV1,
  answers: SubmissionAnswers,
): AssetClaimInput[] {
  const claims: AssetClaimInput[] = [];
  const questions = definition.runtime.survey.elements.filter(
    (element): element is RestrictedQuestion => element.type !== "html",
  );

  for (const element of questions) {
    if (!isQuestionVisible(element, answers)) continue;

    if (element.type === "chartstead-file") {
      const value = answers[element.name];
      if (isUploadedAssetAnswer(value)) {
        claims.push({
          path: element.name,
          questionName: element.name,
          answer: value,
        });
      }
      continue;
    }

    if (element.type !== "paneldynamic") continue;
    const panels = answers[element.name];
    if (!Array.isArray(panels)) continue;
    for (const [index, entry] of panels.entries()) {
      const record =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      for (const child of element.templateElements) {
        if (child.type !== "chartstead-file") continue;
        const value = record[child.name];
        if (!isUploadedAssetAnswer(value)) continue;
        claims.push({
          path: `${element.name}.${index}.${child.name}`,
          questionName: `${element.name}.${child.name}`,
          answer: value as UploadedAssetAnswer,
        });
      }
    }
  }

  return claims;
}

export function validateAndNormalizeSubmission(
  definition: CfpDefinitionV1,
  answers: SubmissionAnswers,
  event: EventRecord,
): {
  errors: Record<string, string>;
  answers: SubmissionAnswers;
  normalized: ProposalInput | null;
  assetClaims: AssetClaimInput[];
} {
  const source: SubmissionAnswers =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? answers
      : {};
  const errors: Record<string, string> = {};
  const questions = definition.runtime.survey.elements.filter(
    (element): element is RestrictedQuestion => element.type !== "html",
  );
  const allowedNames = new Set(questions.map((question) => question.name));

  for (const key of Object.keys(source)) {
    if (!allowedNames.has(key)) {
      errors[key] = "Unknown field.";
    }
  }

  const cleaned: SubmissionAnswers = {};
  for (const element of questions) {
    // Conditions are authoritative at submission time: hidden answers are
    // ignored rather than validated or persisted, including stale client data.
    if (!isQuestionVisible(element, source)) {
      continue;
    }
    const value = validateQuestion(element, source[element.name], errors);
    if (value !== undefined) {
      cleaned[element.name] = value as SubmissionAnswers[string];
    }
  }

  // Preserve submitted values for client redisplay when validation fails.
  const valuesForClient: SubmissionAnswers = { ...source };
  for (const key of Object.keys(valuesForClient)) {
    if (!allowedNames.has(key)) {
      delete valuesForClient[key];
    }
  }
  for (const element of questions) {
    if (!isQuestionVisible(element, source) && element.name in valuesForClient) {
      delete valuesForClient[element.name];
    }
  }
  for (const [key, value] of Object.entries(cleaned)) {
    valuesForClient[key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      answers: valuesForClient,
      normalized: null,
      assetClaims: [],
    };
  }

  // Track must resolve on the event for list projections.
  const trackId = readString(cleaned[definition.chartstead.trackQuestionName]).trim();
  if (trackId && !event.tracks.some((track) => track.id === trackId)) {
    errors[definition.chartstead.trackQuestionName] = "Choose a track.";
    return {
      errors,
      answers: valuesForClient,
      normalized: null,
      assetClaims: [],
    };
  }

  const normalized = deriveNormalized(definition, cleaned, event);
  if (!normalized) {
    errors._form = "Proposal is missing required projection fields.";
    return {
      errors,
      answers: valuesForClient,
      normalized: null,
      assetClaims: [],
    };
  }

  return {
    errors: {},
    answers: cleaned,
    normalized,
    assetClaims: collectAssetClaims(definition, cleaned),
  };
}

export function isEmptyAnswerValue(value: unknown): boolean {
  return isEmptyValue(value);
}
