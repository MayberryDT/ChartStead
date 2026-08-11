import type {
  AirtableBaseTemplate,
  AirtableFieldBinding,
  AirtablePullChange,
  AirtableRecord,
  AirtableResourceKind,
  AirtableTableMap,
} from "./airtable";

/**
 * Documented ChartStead Airtable base template field map.
 * Keep in sync with docs/airtable-base-template.md.
 */
export const CHARTSTEAD_AIRTABLE_TEMPLATE: AirtableBaseTemplate = {
  schemaVersion: 1,
  name: "ChartStead Program",
  description:
    "Optional Airtable mirror for organizer automations. ChartStead DO SQLite remains the operational primary.",
  tables: [
    {
      kind: "event",
      tableName: "Events",
      chartsteadIdField: "ChartStead Event ID",
      fields: [
        { chartsteadField: "name", airtableField: "Name", pullWins: true },
        { chartsteadField: "startsOn", airtableField: "Starts On", pullWins: true },
        { chartsteadField: "endsOn", airtableField: "Ends On", pullWins: true },
      ],
    },
    {
      kind: "submission",
      tableName: "Submissions",
      chartsteadIdField: "ChartStead Submission ID",
      fields: [
        { chartsteadField: "title", airtableField: "Title", pullWins: true },
        { chartsteadField: "abstract", airtableField: "Abstract", pullWins: true },
        { chartsteadField: "trackId", airtableField: "Track ID", pullWins: true },
        { chartsteadField: "speakerName", airtableField: "Speaker Name", pullWins: true },
        { chartsteadField: "speakerEmail", airtableField: "Speaker Email", pullWins: true },
        { chartsteadField: "biography", airtableField: "Biography", pullWins: true },
        { chartsteadField: "supportingLink", airtableField: "Supporting Link", pullWins: true },
      ],
    },
    {
      kind: "speaker",
      tableName: "Speakers",
      chartsteadIdField: "ChartStead Speaker ID",
      fields: [
        { chartsteadField: "name", airtableField: "Name", pullWins: true },
        { chartsteadField: "email", airtableField: "Email", pullWins: true },
        { chartsteadField: "biography", airtableField: "Biography", pullWins: true },
      ],
    },
    {
      kind: "session",
      tableName: "Sessions",
      chartsteadIdField: "ChartStead Session ID",
      fields: [
        { chartsteadField: "title", airtableField: "Title", pullWins: true },
        { chartsteadField: "format", airtableField: "Format", pullWins: true },
        { chartsteadField: "trackId", airtableField: "Track ID", pullWins: true },
        { chartsteadField: "roomId", airtableField: "Room ID", pullWins: true },
        { chartsteadField: "startsAt", airtableField: "Starts At", pullWins: true },
        { chartsteadField: "endsAt", airtableField: "Ends At", pullWins: true },
      ],
    },
    {
      kind: "task",
      tableName: "Tasks",
      chartsteadIdField: "ChartStead Task ID",
      fields: [
        { chartsteadField: "title", airtableField: "Title", pullWins: true },
        { chartsteadField: "instructions", airtableField: "Instructions", pullWins: true },
        { chartsteadField: "dueAt", airtableField: "Due At", pullWins: true },
        { chartsteadField: "status", airtableField: "Status", pullWins: true },
      ],
    },
  ],
  localOnlyFieldsByKind: {
    event: ["submissionCount", "unreviewedCount", "tracks", "rooms", "themeAccent"],
    submission: [
      "status",
      "programOutcome",
      "committeeNote",
      "privateNote",
      "reviewVersion",
      "confirmationEmailStatus",
      "formId",
      "formDefinitionVersion",
      "answers",
      "coSpeakers",
      "supportingFile",
      "submittedAt",
    ],
    speaker: ["createdAt", "id"],
    session: [
      "id",
      "proposalId",
      "courseCheckPlanId",
      "calendarUid",
      "calendarSequence",
      "createdAt",
      "speakers",
    ],
    task: [
      "id",
      "speakerId",
      "kind",
      "completionRequirement",
      "readinessFlag",
      "asset",
      "completedAt",
      "createdAt",
    ],
  },
};

export function getTableMap(
  kind: AirtableResourceKind,
  template: AirtableBaseTemplate = CHARTSTEAD_AIRTABLE_TEMPLATE,
): AirtableTableMap {
  const table = template.tables.find((entry) => entry.kind === kind);
  if (!table) {
    throw new Error(`No Airtable table map for kind ${kind}`);
  }
  return table;
}

export function pullWinsFields(table: AirtableTableMap): AirtableFieldBinding[] {
  return table.fields.filter((field) => field.pullWins);
}

/**
 * Build mapped ChartStead values from an Airtable record using pull-wins bindings only.
 * Unmapped / local-only fields are never included.
 */
export function mapAirtableRecordToChartstead(
  kind: AirtableResourceKind,
  record: AirtableRecord,
  template: AirtableBaseTemplate = CHARTSTEAD_AIRTABLE_TEMPLATE,
): AirtablePullChange | null {
  const table = getTableMap(kind, template);
  const chartsteadId = record.fields[table.chartsteadIdField];
  if (typeof chartsteadId !== "string" || chartsteadId.trim() === "") {
    return null;
  }

  const localOnly = new Set(template.localOnlyFieldsByKind[kind] ?? []);
  const mappedValues: Record<string, unknown> = {};

  for (const binding of pullWinsFields(table)) {
    if (localOnly.has(binding.chartsteadField)) continue;
    if (!(binding.airtableField in record.fields)) continue;
    const value = record.fields[binding.airtableField];
    if (value === undefined) continue;
    mappedValues[binding.chartsteadField] = normalizeAirtableValue(value);
  }

  return {
    kind,
    chartsteadId: chartsteadId.trim(),
    airtableRecordId: record.id,
    mappedValues,
  };
}

export function mapAirtableRecordsToChanges(
  kind: AirtableResourceKind,
  records: AirtableRecord[],
  template: AirtableBaseTemplate = CHARTSTEAD_AIRTABLE_TEMPLATE,
): AirtablePullChange[] {
  const changes: AirtablePullChange[] = [];
  for (const record of records) {
    const change = mapAirtableRecordToChartstead(kind, record, template);
    if (change) changes.push(change);
  }
  return changes;
}

/**
 * Merge pull-wins values onto a local record without touching local-only keys.
 */
export function applyPullWinsToLocalRecord<T extends Record<string, unknown>>(
  kind: AirtableResourceKind,
  local: T,
  mappedValues: Record<string, unknown>,
  template: AirtableBaseTemplate = CHARTSTEAD_AIRTABLE_TEMPLATE,
): T {
  const localOnly = new Set(template.localOnlyFieldsByKind[kind] ?? []);
  const next: Record<string, unknown> = { ...local };
  for (const [key, value] of Object.entries(mappedValues)) {
    if (localOnly.has(key)) continue;
    next[key] = value;
  }
  return next as T;
}

function normalizeAirtableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Airtable multi-select / collaborator arrays → first scalar when single expected.
    if (value.length === 1) return normalizeAirtableValue(value[0]);
    return value.map((entry) => normalizeAirtableValue(entry));
  }
  if (value && typeof value === "object" && "email" in value) {
    return String((value as { email: unknown }).email ?? "");
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}
