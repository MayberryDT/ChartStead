import type {
  AirtableEffect,
  AirtableResourceKind,
  CourseCheckAirtableEvidence,
} from "../../shared/airtable";
import { getTableMap } from "../../shared/airtable-field-map";
import type { CourseCheckDelta, CourseCheckStage } from "../../shared/course-check";

export interface AirtableEffectResource {
  kind: AirtableResourceKind;
  chartsteadId: string;
  values: Record<string, unknown>;
  beforeValues?: Record<string, unknown> | null;
  providerRecordId?: string | null;
}

function mappedFields(resource: AirtableEffectResource): Record<string, unknown> {
  const table = getTableMap(resource.kind);
  const fields: Record<string, unknown> = {
    [table.chartsteadIdField]: resource.chartsteadId,
  };
  for (const binding of table.fields) {
    if (!(binding.chartsteadField in resource.values)) continue;
    const value = resource.values[binding.chartsteadField];
    if (value !== undefined) fields[binding.airtableField] = value;
  }
  return fields;
}

function mappedBeforeFields(
  resource: AirtableEffectResource,
): Record<string, unknown> | null {
  if (!resource.beforeValues) return null;
  return mappedFields({ ...resource, values: resource.beforeValues });
}

function effectId(
  planId: string,
  planVersion: number,
  resource: AirtableEffectResource,
): string {
  return `air_${planId}_${planVersion}_${resource.kind}_${resource.chartsteadId}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
}

export function buildCourseCheckAirtableEvidence(input: {
  planId: string;
  planVersion?: number;
  resources: AirtableEffectResource[];
  configured?: boolean;
}): CourseCheckAirtableEvidence {
  const planVersion = input.planVersion ?? 1;
  const resourcesByIdentity = new Map<string, AirtableEffectResource>();
  for (const resource of input.resources) {
    resourcesByIdentity.set(`${resource.kind}:${resource.chartsteadId}`, resource);
  }
  const effects: AirtableEffect[] = [...resourcesByIdentity.values()].map((resource) => {
    const table = getTableMap(resource.kind);
    return {
      id: effectId(input.planId, planVersion, resource),
      planId: input.planId,
      planVersion,
      kind: resource.kind,
      chartsteadId: resource.chartsteadId,
      tableName: table.tableName,
      operation: resource.providerRecordId ? "update" : "create",
      fields: mappedFields(resource),
      beforeFields: mappedBeforeFields(resource),
      providerRecordId: resource.providerRecordId ?? null,
      state: "pending",
      attemptCount: 0,
      lastError: null,
      nextAttemptAt: null,
      compensatesEffectId: null,
    };
  });
  return {
    configured: input.configured ?? false,
    disposition: "active",
    summary:
      effects.length === 0
        ? "No mapped Airtable writes in this plan."
        : `${effects.length} mapped Airtable write${effects.length === 1 ? "" : "s"} require separate approval.`,
    effects,
  };
}

export function emptyCourseCheckAirtableEvidence(): CourseCheckAirtableEvidence {
  return buildCourseCheckAirtableEvidence({ planId: "none", resources: [] });
}

export function withAirtableStage(
  stages: CourseCheckStage[],
  evidence: CourseCheckAirtableEvidence,
): CourseCheckStage[] {
  const withoutAirtable = stages.filter((stage) => stage.id !== "write-airtable");
  if (evidence.effects.length === 0) return withoutAirtable;
  return [
    ...withoutAirtable,
    {
      id: "write-airtable",
      label: "Write to Airtable",
      status: "pending",
      verb: "Write to Airtable",
      external: true,
    },
  ];
}

export function airtableEffectDeltas(
  evidence: CourseCheckAirtableEvidence,
): CourseCheckDelta[] {
  return evidence.effects.map((effect) => ({
    entityType: "airtable_record",
    action: effect.operation,
    summary: `${effect.operation === "create" ? "Create" : "Update"} ${effect.tableName} record for ${effect.kind} ${effect.chartsteadId}.`,
    before: effect.beforeFields,
    after: effect.fields,
  }));
}
