import type { CourseCheckActor, CourseCheckPlan } from "../../shared/course-check";
import type { AirtableEffect } from "../../shared/airtable";
import { CHARTSTEAD_AIRTABLE_TEMPLATE, getTableMap } from "../../shared/airtable-field-map";
import type { EventStore } from "../event-store";
import { AirtableClientError, type AirtableClient } from "./client";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

function retryAt(attemptCount: number, now: Date): string {
  const index = Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1);
  return new Date(now.getTime() + RETRY_DELAYS_MS[index]).toISOString();
}

function outcomeFor(error: unknown, effect: AirtableEffect, now: Date) {
  if (error instanceof AirtableClientError) {
    if (error.code === "rate_limited" || error.code === "unavailable") {
      return {
        state: "retryable_failure" as const,
        error: error.message,
        nextAttemptAt: retryAt(effect.attemptCount, now),
      };
    }
    if (error.code === "auth" || error.code === "invalid" || error.code === "unconfigured") {
      return {
        state: "permanent_failure" as const,
        error: error.message,
        nextAttemptAt: null,
      };
    }
    return {
      state: "unknown" as const,
      error: error.message,
      nextAttemptAt: null,
    };
  }
  return {
    state: "unknown" as const,
    error: "Airtable delivery ended without a confirmed provider outcome.",
    nextAttemptAt: null,
  };
}

export async function executeAirtableEffects(input: {
  store: DurableObjectStub<EventStore>;
  client: AirtableClient;
  planId: string;
  actor: CourseCheckActor;
  now?: Date;
}): Promise<{ plan: CourseCheckPlan; effects: AirtableEffect[] }> {
  const store = input.store as unknown as {
    beginAirtableEffectAttempts(args: Record<string, unknown>): Promise<AirtableEffect[]>;
    recordAirtableEffectResult(args: Record<string, unknown>): Promise<AirtableEffect | null>;
    getCourseCheckPlan(planId: string): Promise<CourseCheckPlan | null>;
  };
  const now = input.now ?? new Date();
  const attempts = await store.beginAirtableEffectAttempts({
    planId: input.planId,
    actor: input.actor,
    now: now.toISOString(),
  });
  for (const effect of attempts) {
    try {
      const result = await input.client.upsertRecord({
        kind: effect.kind,
        chartsteadId: effect.chartsteadId,
        fields: effect.fields,
        providerRecordId: effect.providerRecordId,
      });
      await store.recordAirtableEffectResult({
        effectId: effect.id,
        state: "succeeded",
        providerRecordId: result.recordId,
        actor: input.actor,
        now: new Date().toISOString(),
      });
    } catch (error) {
      const outcome = outcomeFor(error, effect, now);
      await store.recordAirtableEffectResult({
        effectId: effect.id,
        ...outcome,
        actor: input.actor,
        now: new Date().toISOString(),
      });
    }
  }
  const plan = await store.getCourseCheckPlan(input.planId);
  if (!plan) throw new Error("Course Check disappeared during Airtable execution.");
  return { plan, effects: plan.body.airtable.effects };
}

export async function reconcileUnknownAirtableEffects(input: {
  store: DurableObjectStub<EventStore>;
  client: AirtableClient;
  planId: string;
  actor: CourseCheckActor;
}): Promise<{ plan: CourseCheckPlan; effects: AirtableEffect[] }> {
  const store = input.store as unknown as {
    listAirtableEffects(planId: string): Promise<AirtableEffect[]>;
    recordAirtableEffectResult(args: Record<string, unknown>): Promise<AirtableEffect | null>;
    getCourseCheckPlan(planId: string): Promise<CourseCheckPlan | null>;
  };
  const effects = (await store.listAirtableEffects(input.planId)).filter(
    (effect) => effect.state === "unknown",
  );
  const tables = new Map<AirtableEffect["kind"], Awaited<ReturnType<AirtableClient["listTable"]>>>();
  for (const effect of effects) {
    let records = tables.get(effect.kind);
    if (!records) {
      records = await input.client.listTable(effect.kind);
      tables.set(effect.kind, records);
    }
    const map = getTableMap(effect.kind, CHARTSTEAD_AIRTABLE_TEMPLATE);
    const matches = records.filter(
      (record) => record.fields[map.chartsteadIdField] === effect.chartsteadId,
    );
    if (matches.length === 1) {
      await store.recordAirtableEffectResult({
        effectId: effect.id,
        state: "succeeded",
        providerRecordId: matches[0].id,
        actor: input.actor,
      });
    } else if (matches.length === 0) {
      await store.recordAirtableEffectResult({
        effectId: effect.id,
        state: "retryable_failure",
        error: "Reconciliation found no matching Airtable record; retry is safe.",
        nextAttemptAt: new Date().toISOString(),
        actor: input.actor,
      });
    } else {
      await store.recordAirtableEffectResult({
        effectId: effect.id,
        state: "unknown",
        error: "Reconciliation found multiple matching Airtable records; manual review is required.",
        actor: input.actor,
      });
    }
  }
  const plan = await store.getCourseCheckPlan(input.planId);
  if (!plan) throw new Error("Course Check disappeared during Airtable reconciliation.");
  return { plan, effects: plan.body.airtable.effects };
}
