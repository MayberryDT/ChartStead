/**
 * ChartStead ↔ Airtable mapping contract (Ticket 10).
 * Pull applies only mapped fields; local-only operational state is never overwritten.
 */

export type AirtableSyncHealth =
  | "unconfigured"
  | "healthy"
  | "pending"
  | "delayed"
  | "failed";

export type AirtableResourceKind =
  | "event"
  | "submission"
  | "speaker"
  | "session"
  | "task";

export interface AirtableFieldBinding {
  /** ChartStead property path, e.g. "title" or "speakerName". */
  chartsteadField: string;
  /** Airtable column name in the mapped table. */
  airtableField: string;
  /** When true, pull overwrites local with Airtable value. */
  pullWins: boolean;
}

export interface AirtableTableMap {
  kind: AirtableResourceKind;
  /** Airtable table name in the ChartStead base template. */
  tableName: string;
  /** Airtable field that stores the stable ChartStead id. */
  chartsteadIdField: string;
  fields: AirtableFieldBinding[];
}

export interface AirtableBaseTemplate {
  schemaVersion: 1;
  name: string;
  description: string;
  tables: AirtableTableMap[];
  /** Local-only fields that must never be overwritten by pull. */
  localOnlyFieldsByKind: Record<AirtableResourceKind, string[]>;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface AirtablePullChange {
  kind: AirtableResourceKind;
  chartsteadId: string;
  airtableRecordId: string;
  /** Mapped field values after Airtable-wins merge (ChartStead property names). */
  mappedValues: Record<string, unknown>;
}

export type AirtableEffectState =
  | "pending"
  | "attempting"
  | "succeeded"
  | "retryable_failure"
  | "permanent_failure"
  | "unknown"
  | "compensated";

export type AirtableStageDisposition = "active" | "deferred" | "removed";

/** Exact, immutable provider write preview frozen into a Course Check version. */
export interface AirtableEffect {
  id: string;
  planId: string;
  planVersion: number;
  kind: AirtableResourceKind;
  chartsteadId: string;
  tableName: string;
  operation: "create" | "update";
  fields: Record<string, unknown>;
  beforeFields: Record<string, unknown> | null;
  providerRecordId: string | null;
  state: AirtableEffectState;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  compensatesEffectId: string | null;
}

export interface CourseCheckAirtableEvidence {
  configured: boolean;
  disposition: AirtableStageDisposition;
  summary: string;
  effects: AirtableEffect[];
  redacted?: boolean;
}

export interface AirtablePullResult {
  ok: boolean;
  health: AirtableSyncHealth;
  pulledAt: string;
  changes: AirtablePullChange[];
  error: string | null;
  guidance: string | null;
}

export interface AirtableSyncState {
  health: AirtableSyncHealth;
  configured: boolean;
  /** True when a token is stored; the token itself is never returned to the client. */
  hasAccessToken: boolean;
  lastPullAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  guidance: string | null;
  pendingChangeCount: number;
  baseId: string | null;
}

export interface AirtableConnectRequest {
  baseId: string;
  accessToken: string;
}

export const AIRTABLE_HEALTH_GUIDANCE: Record<AirtableSyncHealth, string> = {
  unconfigured:
    "Airtable is optional. In Settings, paste your base id and personal access token, then connect. Create the base from the ChartStead Program template first.",
  healthy: "Airtable pull is up to date. Mapped fields reflect the latest Airtable values.",
  pending: "A pull is in progress or waiting to run. Core ChartStead work is unaffected.",
  delayed:
    "Airtable rate-limited or temporarily unavailable. ChartStead remains fully usable; retry pull after a short wait.",
  failed:
    "Last Airtable pull failed. Check the token permissions and base id in Settings, then retry pull. Local operational data was not overwritten.",
};
