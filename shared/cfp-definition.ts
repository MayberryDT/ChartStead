export type CfpLifecycleStatus = "draft" | "published" | "closed";

export interface CfpCondition {
  fieldName: string;
  equals: string;
}

export interface SurveyChoice {
  value: string;
  text: string;
}

export interface RestrictedHtmlElement {
  type: "html";
  name: string;
  html: string;
}

export interface RestrictedTextElement {
  type: "text";
  name: string;
  title: string;
  isRequired?: boolean;
  description?: string;
  maxLength?: number;
  inputType?: "email" | "url" | "text";
  validators?: Array<{ type: "email"; text: string }>;
  requiredErrorText?: string;
  visibleIf?: string;
}

export interface RestrictedCommentElement {
  type: "comment";
  name: string;
  title: string;
  isRequired?: boolean;
  description?: string;
  maxLength?: number;
  rows?: number;
  requiredErrorText?: string;
  visibleIf?: string;
}

export interface RestrictedDropdownElement {
  type: "dropdown";
  name: string;
  title: string;
  isRequired?: boolean;
  description?: string;
  choices: SurveyChoice[];
  requiredErrorText?: string;
  visibleIf?: string;
}

export interface RestrictedFileElement {
  type: "chartstead-file";
  name: string;
  title: string;
  isRequired?: boolean;
  description?: string;
  maxFileBytes?: number;
  acceptMimeTypes?: string[];
  visibleIf?: string;
}

export type RestrictedTemplateElement =
  | RestrictedTextElement
  | RestrictedCommentElement
  | RestrictedDropdownElement
  | RestrictedFileElement;

export interface RestrictedPanelDynamicElement {
  type: "paneldynamic";
  name: string;
  title: string;
  isRequired?: boolean;
  description?: string;
  templateTitle?: string;
  panelCount?: number;
  minPanelCount: number;
  maxPanelCount: number;
  confirmDelete?: boolean;
  confirmDeleteText?: string;
  panelAddText?: string;
  panelRemoveText?: string;
  templateElements: RestrictedTemplateElement[];
  visibleIf?: string;
}

export type RestrictedSurveyElement =
  | RestrictedHtmlElement
  | RestrictedTextElement
  | RestrictedCommentElement
  | RestrictedDropdownElement
  | RestrictedPanelDynamicElement
  | RestrictedFileElement;

export type RestrictedQuestion = Exclude<RestrictedSurveyElement, RestrictedHtmlElement>;

export interface CfpDefinitionV1 {
  schemaVersion: 1;
  definitionId: string;
  definitionVersion: number;
  eventId: string;
  status: "draft" | "published" | "closed";
  opensAt: string | null;
  closesAt: string | null;
  runtime: {
    engine: "surveyjs";
    engineMajor: 2;
    survey: {
      showTitle: false;
      showQuestionNumbers: "off";
      checkErrorsMode: "onComplete";
      textUpdateMode: "onTyping";
      questionErrorLocation: "bottom";
      completeText: string;
      requiredMark: "*";
      elements: RestrictedSurveyElement[];
    };
  };
  chartstead: {
    template: "standard-cfp";
    protectedNames: string[];
    proposalTitleName: "title";
    trackQuestionName: "trackId";
    speakerPanelName: "speakers";
    uploadQuestionNames: string[];
  };
}

const FIELD_NAME_RE = /^[a-z][a-zA-Z0-9_]{0,63}$/;
const MAX_FIELDS = 40;
const MAX_SPEAKERS = 8;
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "html",
  "text",
  "comment",
  "dropdown",
  "paneldynamic",
  "chartstead-file",
]);
const REQUIRED_PROTECTED = ["title", "abstract", "trackId", "speakers"] as const;

function cloneDefinition(definition: CfpDefinitionV1): CfpDefinitionV1 {
  return JSON.parse(JSON.stringify(definition)) as CfpDefinitionV1;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function conditionToVisibleIf(condition: CfpCondition): string {
  return `{${condition.fieldName}} = ${JSON.stringify(condition.equals)}`;
}

export function parseVisibleIf(visibleIf: string): CfpCondition | null {
  const match = /^\{([a-zA-Z][a-zA-Z0-9_]*)\} = (.*)$/.exec(visibleIf.trim());
  if (!match) return null;
  try {
    const equals = JSON.parse(match[2]!);
    if (typeof equals !== "string") return null;
    return { fieldName: match[1]!, equals };
  } catch {
    return null;
  }
}

function welcomeHtml(title: string, body: string): string {
  return `<div class="cfp-welcome"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>`;
}

export function getWelcomeContent(definition: CfpDefinitionV1): {
  title: string;
  body: string;
} {
  const welcome = definition.runtime.survey.elements.find(
    (element) => element.type === "html" && element.name === "welcome",
  );
  if (!welcome || welcome.type !== "html") {
    return { title: "", body: "" };
  }
  const titleMatch = /<h2>(.*?)<\/h2>/s.exec(welcome.html);
  const bodyMatch = /<p>(.*?)<\/p>/s.exec(welcome.html);
  return {
    title: decodeHtml(titleMatch?.[1] ?? ""),
    body: decodeHtml(bodyMatch?.[1] ?? ""),
  };
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function findElementIndex(
  elements: RestrictedSurveyElement[],
  name: string,
): number {
  return elements.findIndex((element) => element.name === name);
}

function collectUploadNames(elements: RestrictedSurveyElement[]): string[] {
  const names: string[] = [];
  for (const element of elements) {
    if (element.type === "chartstead-file") {
      names.push(element.name);
    }
    if (element.type === "paneldynamic") {
      for (const child of element.templateElements) {
        if (child.type === "chartstead-file") {
          names.push(`${element.name}.${child.name}`);
        }
      }
    }
  }
  return names;
}

function recomputeUploadNames(definition: CfpDefinitionV1): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  next.chartstead.uploadQuestionNames = collectUploadNames(
    next.runtime.survey.elements,
  );
  return next;
}

export function createDefaultCfpDefinition(input: {
  definitionId: string;
  eventId: string;
  trackChoices: Array<{ value: string; text: string }>;
}): CfpDefinitionV1 {
  const elements: RestrictedSurveyElement[] = [
    {
      type: "html",
      name: "welcome",
      html: welcomeHtml(
        "Submit a proposal",
        "Tell us about your talk. You can edit it later from the confirmation email.",
      ),
    },
    {
      type: "text",
      name: "title",
      title: "Talk title",
      isRequired: true,
      maxLength: 160,
      requiredErrorText: "Enter talk title.",
    },
    {
      type: "comment",
      name: "abstract",
      title: "Abstract",
      isRequired: true,
      maxLength: 5_000,
      rows: 5,
      requiredErrorText: "Enter abstract.",
    },
    {
      type: "dropdown",
      name: "trackId",
      title: "Track",
      isRequired: true,
      choices: input.trackChoices.map((choice) => ({
        value: choice.value,
        text: choice.text,
      })),
      requiredErrorText: "Choose track.",
    },
    {
      type: "dropdown",
      name: "sessionFormat",
      title: "Session format",
      isRequired: true,
      choices: [
        { value: "talk", text: "Talk" },
        { value: "workshop", text: "Workshop" },
        { value: "panel", text: "Panel" },
      ],
      requiredErrorText: "Choose session format.",
    },
    {
      type: "text",
      name: "workshopDuration",
      title: "Workshop duration",
      isRequired: true,
      description: "Shown when session format is Workshop.",
      maxLength: 80,
      visibleIf: conditionToVisibleIf({
        fieldName: "sessionFormat",
        equals: "workshop",
      }),
    },
    {
      type: "paneldynamic",
      name: "speakers",
      title: "Speakers",
      description: "Add co-speakers if this talk has more than one presenter.",
      templateTitle: "Speaker {panelIndex}",
      panelCount: 1,
      minPanelCount: 1,
      maxPanelCount: 4,
      confirmDelete: true,
      confirmDeleteText: "Remove this speaker?",
      panelAddText: "Add co-speaker",
      panelRemoveText: "Remove speaker",
      templateElements: [
        {
          type: "text",
          name: "name",
          title: "Speaker name",
          isRequired: true,
          maxLength: 120,
          requiredErrorText: "Enter the speaker name.",
        },
        {
          type: "text",
          name: "email",
          title: "Speaker email",
          inputType: "email",
          isRequired: true,
          maxLength: 320,
          validators: [{ type: "email", text: "Enter a valid email address." }],
          requiredErrorText: "Enter an email address.",
        },
        {
          type: "comment",
          name: "biography",
          title: "Biography",
          isRequired: true,
          maxLength: 2_000,
          rows: 4,
          requiredErrorText: "Enter a short biography.",
        },
      ],
    },
    {
      type: "text",
      name: "supportingLink",
      title: "Supporting link",
      description: "Optional. Use an http or https URL.",
      inputType: "url",
      maxLength: 2_048,
    },
    {
      type: "chartstead-file",
      name: "supportingFile",
      title: "Supporting file",
      description: "Optional. PDF or image up to 5 MB.",
      maxFileBytes: DEFAULT_MAX_FILE_BYTES,
      acceptMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
    },
  ];

  return {
    schemaVersion: 1,
    definitionId: input.definitionId,
    definitionVersion: 0,
    eventId: input.eventId,
    status: "draft",
    opensAt: null,
    closesAt: null,
    runtime: {
      engine: "surveyjs",
      engineMajor: 2,
      survey: {
        showTitle: false,
        showQuestionNumbers: "off",
        checkErrorsMode: "onComplete",
        textUpdateMode: "onTyping",
        questionErrorLocation: "bottom",
        completeText: "Submit proposal",
        requiredMark: "*",
        elements,
      },
    },
    chartstead: {
      template: "standard-cfp",
      protectedNames: ["title", "abstract", "trackId", "speakers"],
      proposalTitleName: "title",
      trackQuestionName: "trackId",
      speakerPanelName: "speakers",
      uploadQuestionNames: collectUploadNames(elements),
    },
  };
}

function validateElementName(
  name: string,
  errors: string[],
  names: Set<string>,
  context: string,
): void {
  if (!FIELD_NAME_RE.test(name)) {
    errors.push(`${context} name "${name}" is invalid.`);
  }
  if (names.has(name)) {
    errors.push(`Duplicate field name "${name}".`);
  }
  names.add(name);
}

function validateChoiceValues(
  elementName: string,
  choices: SurveyChoice[] | undefined,
  errors: string[],
): void {
  if (!choices?.length) {
    errors.push(`Field "${elementName}" needs choices.`);
    return;
  }
  const seen = new Set<string>();
  for (const choice of choices) {
    if (!choice.value.trim()) {
      errors.push(`Field "${elementName}" has an invalid choice value.`);
    }
    if (seen.has(choice.value)) {
      errors.push(`Field "${elementName}" has duplicate choice "${choice.value}".`);
    }
    seen.add(choice.value);
    if (!choice.text.trim()) {
      errors.push(`Field "${elementName}" has a choice without a label.`);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function canonicalizeChoices(value: unknown): SurveyChoice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const choices: SurveyChoice[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    if (typeof row.value !== "string" || typeof row.text !== "string") continue;
    choices.push({ value: row.value, text: row.text });
  }
  return choices;
}

function canonicalizeVisibleIf(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return parseVisibleIf(value) ? value.trim() : undefined;
}

function canonicalizeEmailValidators(
  value: unknown,
): Array<{ type: "email"; text: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const validators: Array<{ type: "email"; text: string }> = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row || row.type !== "email" || typeof row.text !== "string") continue;
    validators.push({ type: "email", text: row.text });
  }
  return validators.length > 0 ? validators : undefined;
}

function canonicalizeTemplateElement(
  value: unknown,
): RestrictedTemplateElement | null {
  const row = asRecord(value);
  if (!row || typeof row.type !== "string" || typeof row.name !== "string") {
    return null;
  }
  const title = typeof row.title === "string" ? row.title : "";
  const base = {
    name: row.name,
    title,
    ...(optionalBoolean(row.isRequired) !== undefined
      ? { isRequired: optionalBoolean(row.isRequired) }
      : {}),
    ...(optionalString(row.description) !== undefined
      ? { description: optionalString(row.description) }
      : {}),
    ...(canonicalizeVisibleIf(row.visibleIf)
      ? { visibleIf: canonicalizeVisibleIf(row.visibleIf) }
      : {}),
  };

  if (row.type === "text") {
    const inputType = row.inputType;
    return {
      type: "text",
      ...base,
      ...(optionalFiniteNumber(row.maxLength) !== undefined
        ? { maxLength: optionalFiniteNumber(row.maxLength) }
        : {}),
      ...(inputType === "email" || inputType === "url" || inputType === "text"
        ? { inputType }
        : {}),
      ...(canonicalizeEmailValidators(row.validators)
        ? { validators: canonicalizeEmailValidators(row.validators) }
        : {}),
      ...(optionalString(row.requiredErrorText) !== undefined
        ? { requiredErrorText: optionalString(row.requiredErrorText) }
        : {}),
    };
  }

  if (row.type === "comment") {
    return {
      type: "comment",
      ...base,
      ...(optionalFiniteNumber(row.maxLength) !== undefined
        ? { maxLength: optionalFiniteNumber(row.maxLength) }
        : {}),
      ...(optionalFiniteNumber(row.rows) !== undefined
        ? { rows: optionalFiniteNumber(row.rows) }
        : {}),
      ...(optionalString(row.requiredErrorText) !== undefined
        ? { requiredErrorText: optionalString(row.requiredErrorText) }
        : {}),
    };
  }

  if (row.type === "dropdown") {
    return {
      type: "dropdown",
      ...base,
      choices: canonicalizeChoices(row.choices) ?? [],
      ...(optionalString(row.requiredErrorText) !== undefined
        ? { requiredErrorText: optionalString(row.requiredErrorText) }
        : {}),
    };
  }

  if (row.type === "chartstead-file") {
    const accept = Array.isArray(row.acceptMimeTypes)
      ? row.acceptMimeTypes.filter((entry): entry is string => typeof entry === "string")
      : undefined;
    return {
      type: "chartstead-file",
      ...base,
      ...(optionalFiniteNumber(row.maxFileBytes) !== undefined
        ? { maxFileBytes: optionalFiniteNumber(row.maxFileBytes) }
        : {}),
      ...(accept !== undefined ? { acceptMimeTypes: accept } : {}),
    };
  }

  return null;
}

function canonicalizeSurveyElement(
  value: unknown,
): RestrictedSurveyElement | null {
  const row = asRecord(value);
  if (!row || typeof row.type !== "string" || typeof row.name !== "string") {
    return null;
  }

  if (row.type === "html") {
    if (row.name !== "welcome") return null;
    const html = typeof row.html === "string" ? row.html : "";
    const title = decodeHtml(/<h2>(.*?)<\/h2>/s.exec(html)?.[1] ?? "");
    const body = decodeHtml(/<p>(.*?)<\/p>/s.exec(html)?.[1] ?? "");
    return {
      type: "html",
      name: "welcome",
      html: welcomeHtml(title, body),
    };
  }

  if (row.type === "paneldynamic") {
    const templateElements = Array.isArray(row.templateElements)
      ? row.templateElements
          .map((child) => canonicalizeTemplateElement(child))
          .filter((child): child is RestrictedTemplateElement => child != null)
      : [];
    const minPanelCount =
      optionalFiniteNumber(row.minPanelCount) ?? 1;
    const maxPanelCount =
      optionalFiniteNumber(row.maxPanelCount) ?? minPanelCount;
    return {
      type: "paneldynamic",
      name: row.name,
      title: typeof row.title === "string" ? row.title : "",
      ...(optionalBoolean(row.isRequired) !== undefined
        ? { isRequired: optionalBoolean(row.isRequired) }
        : {}),
      ...(optionalString(row.description) !== undefined
        ? { description: optionalString(row.description) }
        : {}),
      ...(optionalString(row.templateTitle) !== undefined
        ? { templateTitle: optionalString(row.templateTitle) }
        : {}),
      ...(optionalFiniteNumber(row.panelCount) !== undefined
        ? { panelCount: optionalFiniteNumber(row.panelCount) }
        : {}),
      minPanelCount,
      maxPanelCount,
      ...(optionalBoolean(row.confirmDelete) !== undefined
        ? { confirmDelete: optionalBoolean(row.confirmDelete) }
        : {}),
      ...(optionalString(row.confirmDeleteText) !== undefined
        ? { confirmDeleteText: optionalString(row.confirmDeleteText) }
        : {}),
      ...(optionalString(row.panelAddText) !== undefined
        ? { panelAddText: optionalString(row.panelAddText) }
        : {}),
      ...(optionalString(row.panelRemoveText) !== undefined
        ? { panelRemoveText: optionalString(row.panelRemoveText) }
        : {}),
      templateElements,
      ...(canonicalizeVisibleIf(row.visibleIf)
        ? { visibleIf: canonicalizeVisibleIf(row.visibleIf) }
        : {}),
    };
  }

  return canonicalizeTemplateElement(value);
}

/**
 * Strip unknown SurveyJS / envelope keys so only the restricted whitelist is stored.
 * Returns canonical definition or structured errors (never passes through calculatedValues,
 * triggers, arbitrary validators, or non-whitelist visibleIf expressions).
 */
export function canonicalizeCfpDefinition(
  input: unknown,
): CfpDefinitionV1 | { errors: string[] } {
  const root = asRecord(input);
  if (!root) {
    return { errors: ["Draft definition must be an object."] };
  }

  const runtime = asRecord(root.runtime);
  const survey = asRecord(runtime?.survey);
  const chartstead = asRecord(root.chartstead);
  if (!runtime || !survey || !chartstead) {
    return { errors: ["Draft definition is missing required sections."] };
  }

  const rawElements = survey.elements;
  if (!Array.isArray(rawElements) || rawElements.length === 0) {
    return { errors: ["Add at least one proposal field."] };
  }

  const elements: RestrictedSurveyElement[] = [];
  for (const raw of rawElements) {
    const element = canonicalizeSurveyElement(raw);
    if (!element) {
      return { errors: ["Encountered an invalid survey element."] };
    }
    elements.push(element);
  }

  const status =
    root.status === "draft" || root.status === "published" || root.status === "closed"
      ? root.status
      : "draft";

  const protectedNames = Array.isArray(chartstead.protectedNames)
    ? chartstead.protectedNames.filter((name): name is string => typeof name === "string")
    : [...REQUIRED_PROTECTED];

  const definition: CfpDefinitionV1 = {
    schemaVersion: 1,
    definitionId: typeof root.definitionId === "string" ? root.definitionId : "",
    definitionVersion:
      typeof root.definitionVersion === "number" && Number.isFinite(root.definitionVersion)
        ? root.definitionVersion
        : 0,
    eventId: typeof root.eventId === "string" ? root.eventId : "",
    status,
    opensAt: typeof root.opensAt === "string" || root.opensAt === null ? root.opensAt : null,
    closesAt:
      typeof root.closesAt === "string" || root.closesAt === null ? root.closesAt : null,
    runtime: {
      engine: "surveyjs",
      engineMajor: 2,
      survey: {
        showTitle: false,
        showQuestionNumbers: "off",
        checkErrorsMode: "onComplete",
        textUpdateMode: "onTyping",
        questionErrorLocation: "bottom",
        completeText:
          typeof survey.completeText === "string" ? survey.completeText : "Submit proposal",
        requiredMark: "*",
        elements,
      },
    },
    chartstead: {
      template: "standard-cfp",
      protectedNames,
      proposalTitleName: "title",
      trackQuestionName: "trackId",
      speakerPanelName: "speakers",
      uploadQuestionNames: collectUploadNames(elements),
    },
  };

  // Reject non-whitelist visibleIf that canonicalize dropped while source still had a string.
  for (let i = 0; i < rawElements.length; i += 1) {
    const raw = asRecord(rawElements[i]);
    const element = elements[i];
    if (!raw || !element || element.type === "html") continue;
    if (typeof raw.visibleIf === "string" && raw.visibleIf.trim()) {
      if (!("visibleIf" in element) || !element.visibleIf) {
        return {
          errors: [
            `Field "${element.name}" has an unsupported condition expression.`,
          ],
        };
      }
    }
  }

  const errors = validateCfpDefinition(definition);
  if (errors.length > 0) return { errors };
  return definition;
}

export function validateCfpDefinition(definition: CfpDefinitionV1): string[] {
  const errors: string[] = [];
  if (definition.schemaVersion !== 1) {
    errors.push("Unsupported form schema version.");
  }
  if (!definition.definitionId.trim()) {
    errors.push("Definition id is required.");
  }
  if (!definition.eventId.trim()) {
    errors.push("Event id is required.");
  }
  if (
    definition.status !== "draft" &&
    definition.status !== "published" &&
    definition.status !== "closed"
  ) {
    errors.push("Invalid definition status.");
  }
  if (definition.runtime.engine !== "surveyjs" || definition.runtime.engineMajor !== 2) {
    errors.push("Unsupported runtime engine.");
  }
  if (definition.chartstead.template !== "standard-cfp") {
    errors.push("Unsupported ChartStead template.");
  }

  const elements = definition.runtime.survey.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push("Add at least one proposal field.");
    return errors;
  }

  const questionCount = elements.filter((element) => element.type !== "html").length;
  if (questionCount > MAX_FIELDS) {
    errors.push(`Use ${MAX_FIELDS} fields or fewer.`);
  }

  const names = new Set<string>();
  let fileCount = 0;

  for (const element of elements) {
    if (!element || typeof element !== "object" || !("type" in element)) {
      errors.push("Encountered an invalid survey element.");
      continue;
    }
    if (!ALLOWED_TYPES.has(element.type)) {
      errors.push(`Unknown element type "${String((element as { type: string }).type)}".`);
      continue;
    }
    validateElementName(element.name, errors, names, "Field");

    if (element.type === "html") {
      if (!element.html.trim()) {
        errors.push(`HTML element "${element.name}" needs content.`);
      }
      continue;
    }

    if (!element.title?.trim()) {
      errors.push(`Field "${element.name}" needs a label.`);
    }

    if (element.type === "dropdown") {
      validateChoiceValues(element.name, element.choices, errors);
    }

    if (element.type === "chartstead-file") {
      fileCount += 1;
      const maxBytes = element.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
      if (maxBytes < 1 || maxBytes > MAX_FILE_BYTES) {
        errors.push(`Field "${element.name}" has an invalid file size limit.`);
      }
    }

    if (element.type === "paneldynamic") {
      if (element.minPanelCount < 1) {
        errors.push("At least one speaker is required.");
      }
      if (element.maxPanelCount < element.minPanelCount) {
        errors.push("Maximum speakers must be at least the minimum.");
      }
      if (element.maxPanelCount > MAX_SPEAKERS) {
        errors.push(`Use ${MAX_SPEAKERS} speakers or fewer.`);
      }
      const childNames = new Set<string>();
      for (const child of element.templateElements ?? []) {
        const childType = (child as { type?: string }).type;
        if (
          childType !== "text" &&
          childType !== "comment" &&
          childType !== "dropdown" &&
          childType !== "chartstead-file"
        ) {
          errors.push(
            `Unknown nested element type "${String(childType)}" in "${element.name}".`,
          );
          continue;
        }
        validateElementName(child.name, errors, childNames, "Nested field");
        if (child.type === "dropdown") {
          validateChoiceValues(`${element.name}.${child.name}`, child.choices, errors);
        }
        if (child.type === "chartstead-file") {
          fileCount += 1;
          const maxBytes = child.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
          if (maxBytes < 1 || maxBytes > MAX_FILE_BYTES) {
            errors.push(
              `Field "${element.name}.${child.name}" has an invalid file size limit.`,
            );
          }
        }
        if ("visibleIf" in child && child.visibleIf) {
          errors.push(
            `Nested field "${element.name}.${child.name}" cannot use conditions.`,
          );
        }
      }
    }

    if ("visibleIf" in element && element.visibleIf) {
      const condition = parseVisibleIf(element.visibleIf);
      if (!condition) {
        errors.push(
          `Field "${element.name}" has an unsupported condition expression.`,
        );
      } else if (condition.fieldName === element.name) {
        errors.push(`Field "${element.name}" cannot depend on itself.`);
      } else if (!names.has(condition.fieldName)) {
        const prior = elements.some(
          (candidate) => candidate.name === condition.fieldName,
        );
        if (!prior) {
          errors.push(
            `Field "${element.name}" condition references unknown field "${condition.fieldName}".`,
          );
        }
      }
    }
  }

  if (fileCount > 8) {
    errors.push("Use 8 file uploads or fewer.");
  }

  for (const name of REQUIRED_PROTECTED) {
    const element = elements.find((candidate) => candidate.name === name);
    if (!element) {
      errors.push(`Protected field "${name}" is required.`);
      continue;
    }
    if (!definition.chartstead.protectedNames.includes(name)) {
      errors.push(`Protected field "${name}" must stay protected.`);
    }
  }

  if (definition.chartstead.proposalTitleName !== "title") {
    errors.push("Proposal title field must be named title.");
  }
  if (definition.chartstead.trackQuestionName !== "trackId") {
    errors.push("Track field must be named trackId.");
  }
  if (definition.chartstead.speakerPanelName !== "speakers") {
    errors.push("Speaker panel must be named speakers.");
  }

  return errors;
}

export function updateQuestion(
  definition: CfpDefinitionV1,
  name: string,
  patch: {
    title?: string;
    isRequired?: boolean;
    description?: string;
    maxLength?: number;
    choices?: SurveyChoice[];
    maxFileBytes?: number;
    acceptMimeTypes?: string[];
  },
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  const index = findElementIndex(next.runtime.survey.elements, name);
  if (index < 0) return next;
  const element = next.runtime.survey.elements[index]!;
  if (element.type === "html") return next;
  if (patch.title !== undefined) element.title = patch.title;
  if (patch.isRequired !== undefined) element.isRequired = patch.isRequired;
  if (patch.description !== undefined) {
    if (patch.description === "") {
      delete element.description;
    } else {
      element.description = patch.description;
    }
  }
  if (
    patch.maxLength !== undefined &&
    (element.type === "text" || element.type === "comment")
  ) {
    element.maxLength = patch.maxLength;
  }
  if (patch.choices !== undefined && element.type === "dropdown") {
    element.choices = patch.choices.map((choice) => ({ ...choice }));
  }
  if (element.type === "chartstead-file") {
    if (patch.maxFileBytes !== undefined) {
      element.maxFileBytes = patch.maxFileBytes;
    }
    if (patch.acceptMimeTypes !== undefined) {
      element.acceptMimeTypes = [...patch.acceptMimeTypes];
    }
  }
  return next;
}

export function addQuestion(
  definition: CfpDefinitionV1,
  question: RestrictedQuestion,
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  next.runtime.survey.elements.push(
    JSON.parse(JSON.stringify(question)) as RestrictedQuestion,
  );
  return recomputeUploadNames(next);
}

export function removeQuestion(
  definition: CfpDefinitionV1,
  name: string,
): CfpDefinitionV1 {
  if (definition.chartstead.protectedNames.includes(name)) {
    return cloneDefinition(definition);
  }
  const next = cloneDefinition(definition);
  next.runtime.survey.elements = next.runtime.survey.elements.filter(
    (element) => element.name !== name,
  );
  return recomputeUploadNames(next);
}

export function moveQuestion(
  definition: CfpDefinitionV1,
  name: string,
  direction: "up" | "down",
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  const elements = next.runtime.survey.elements;
  const index = findElementIndex(elements, name);
  if (index < 0) return next;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= elements.length) return next;
  const current = elements[index]!;
  elements[index] = elements[target]!;
  elements[target] = current;
  return next;
}

export function setQuestionCondition(
  definition: CfpDefinitionV1,
  name: string,
  condition: CfpCondition | null,
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  const index = findElementIndex(next.runtime.survey.elements, name);
  if (index < 0) return next;
  const element = next.runtime.survey.elements[index]!;
  if (element.type === "html") return next;
  if (condition == null) {
    delete element.visibleIf;
  } else {
    element.visibleIf = conditionToVisibleIf(condition);
  }
  return next;
}

export function describeCondition(
  condition: CfpCondition,
  definition: CfpDefinitionV1,
): string {
  const field = definition.runtime.survey.elements.find(
    (element) => element.name === condition.fieldName,
  );
  const fieldLabel =
    field && field.type !== "html" ? field.title : condition.fieldName;
  let valueLabel = condition.equals;
  if (field && field.type === "dropdown") {
    const choice = field.choices.find((item) => item.value === condition.equals);
    if (choice) valueLabel = choice.text;
  }
  return `Show when ${fieldLabel} is ${valueLabel}`;
}

export function updateWelcome(
  definition: CfpDefinitionV1,
  input: { title?: string; body?: string },
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  const current = getWelcomeContent(next);
  const title = input.title ?? current.title;
  const body = input.body ?? current.body;
  const index = findElementIndex(next.runtime.survey.elements, "welcome");
  const html = welcomeHtml(title, body);
  if (index >= 0) {
    next.runtime.survey.elements[index] = {
      type: "html",
      name: "welcome",
      html,
    };
  } else {
    next.runtime.survey.elements.unshift({
      type: "html",
      name: "welcome",
      html,
    });
  }
  return next;
}

export function updateSpeakerSettings(
  definition: CfpDefinitionV1,
  patch: {
    minCount?: number;
    maxCount?: number;
    collectBiography?: boolean;
    collectHeadshot?: boolean;
  },
): CfpDefinitionV1 {
  const next = cloneDefinition(definition);
  const speakers = next.runtime.survey.elements.find(
    (element) => element.type === "paneldynamic" && element.name === "speakers",
  );
  if (!speakers || speakers.type !== "paneldynamic") return next;

  if (patch.minCount !== undefined) {
    speakers.minPanelCount = patch.minCount;
    speakers.panelCount = patch.minCount;
  }
  if (patch.maxCount !== undefined) {
    speakers.maxPanelCount = patch.maxCount;
  }
  if (patch.collectBiography !== undefined) {
    const hasBio = speakers.templateElements.some(
      (element) => element.name === "biography",
    );
    if (patch.collectBiography && !hasBio) {
      speakers.templateElements.push({
        type: "comment",
        name: "biography",
        title: "Biography",
        isRequired: true,
        maxLength: 2_000,
        rows: 4,
        requiredErrorText: "Enter a short biography.",
      });
    }
    if (!patch.collectBiography && hasBio) {
      speakers.templateElements = speakers.templateElements.filter(
        (element) => element.name !== "biography",
      );
    }
  }
  if (patch.collectHeadshot !== undefined) {
    const hasHeadshot = speakers.templateElements.some(
      (element) => element.name === "headshot",
    );
    if (patch.collectHeadshot && !hasHeadshot) {
      speakers.templateElements.push({
        type: "chartstead-file",
        name: "headshot",
        title: "Headshot",
        description: "Optional. PNG or JPEG up to 5 MB.",
        maxFileBytes: DEFAULT_MAX_FILE_BYTES,
        acceptMimeTypes: ["image/png", "image/jpeg"],
      });
    }
    if (!patch.collectHeadshot && hasHeadshot) {
      speakers.templateElements = speakers.templateElements.filter(
        (element) => element.name !== "headshot",
      );
    }
  }
  return recomputeUploadNames(next);
}

export function getSpeakerSettings(definition: CfpDefinitionV1): {
  minCount: number;
  maxCount: number;
  collectBiography: boolean;
  collectHeadshot: boolean;
} {
  const speakers = definition.runtime.survey.elements.find(
    (element) => element.type === "paneldynamic" && element.name === "speakers",
  );
  if (!speakers || speakers.type !== "paneldynamic") {
    return {
      minCount: 1,
      maxCount: 1,
      collectBiography: false,
      collectHeadshot: false,
    };
  }
  return {
    minCount: speakers.minPanelCount,
    maxCount: speakers.maxPanelCount,
    collectBiography: speakers.templateElements.some(
      (element) => element.name === "biography",
    ),
    collectHeadshot: speakers.templateElements.some(
      (element) => element.name === "headshot",
    ),
  };
}

export function listEditableQuestions(
  definition: CfpDefinitionV1,
): RestrictedQuestion[] {
  return definition.runtime.survey.elements.filter(
    (element): element is RestrictedQuestion => element.type !== "html",
  );
}

export function hasQuestion(definition: CfpDefinitionV1, name: string): boolean {
  return definition.runtime.survey.elements.some((element) => element.name === name);
}

export function setSupportingOptions(
  definition: CfpDefinitionV1,
  options: { link?: boolean; file?: boolean },
): CfpDefinitionV1 {
  let next = cloneDefinition(definition);
  if (options.link === true && !hasQuestion(next, "supportingLink")) {
    next = addQuestion(next, {
      type: "text",
      name: "supportingLink",
      title: "Supporting link",
      description: "Optional. Use an http or https URL.",
      inputType: "url",
      maxLength: 2_048,
    });
  }
  if (options.link === false) {
    next = removeQuestion(next, "supportingLink");
  }
  if (options.file === true && !hasQuestion(next, "supportingFile")) {
    next = addQuestion(next, {
      type: "chartstead-file",
      name: "supportingFile",
      title: "Supporting file",
      description: "Optional. PDF or image up to 5 MB.",
      maxFileBytes: DEFAULT_MAX_FILE_BYTES,
      acceptMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
    });
  }
  if (options.file === false) {
    next = removeQuestion(next, "supportingFile");
  }
  return recomputeUploadNames(next);
}

export interface UploadedAssetAnswer {
  assetId: string;
  objectKey: string;
  name: string;
  mime: string;
  size: number;
  status: "complete";
}

export function isUploadedAssetAnswer(value: unknown): value is UploadedAssetAnswer {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.status === "complete" &&
    typeof record.assetId === "string" &&
    typeof record.objectKey === "string" &&
    typeof record.name === "string" &&
    typeof record.mime === "string" &&
    typeof record.size === "number"
  );
}
