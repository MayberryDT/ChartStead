import type { CourseCheckActionType } from "./course-check";

export const COURSE_CHECK_UX_EVENT_TYPES = [
  "journey_started",
  "issues_shown",
  "issue_action",
  "route_changed",
  "journey_abandoned",
  "journey_resumed",
  "stale_recheck",
  "outbox_continuation",
  "message_correction",
  "compensation_started",
  "stage_outcome",
] as const;

export type CourseCheckUxEventType = (typeof COURSE_CHECK_UX_EVENT_TYPES)[number];
export type CourseCheckUxStage =
  | "decision"
  | "draft"
  | "send"
  | "delivery"
  | "publication"
  | "calendar"
  | "airtable"
  | "compensation";
export type CourseCheckUxIssueClass =
  | "needs_action"
  | "check"
  | "details"
  | "could_not_check";
export type CourseCheckUxIssueAction = "fix" | "exclude" | "acknowledge";
export type CourseCheckUxOutcome =
  | "started"
  | "shown"
  | "repair"
  | "excluded"
  | "acknowledged"
  | "abandoned"
  | "resumed"
  | "rechecked"
  | "continued"
  | "corrected"
  | "compensating"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "unknown";

export interface CourseCheckUxEventInput {
  id: string;
  journeyId: string;
  planId: string;
  eventType: CourseCheckUxEventType;
  actionType: CourseCheckActionType;
  stage: CourseCheckUxStage;
  issueClass: CourseCheckUxIssueClass | null;
  issueAction: CourseCheckUxIssueAction | null;
  issueCount: number;
  affectedCount: number;
  routeChanges: number;
  durationMs: number | null;
  outcome: CourseCheckUxOutcome | null;
}

export interface CourseCheckUxEventRecord extends CourseCheckUxEventInput {
  occurredAt: string;
}

export interface CourseCheckUxEvidenceExport {
  schemaVersion: 1;
  evidenceClass: "seeded_or_product_behavior_not_human_usability";
  generatedAt: string;
  eventCount: number;
  uniqueJourneyCount: number;
  byEventType: Record<string, number>;
  byIssueAction: Record<string, number>;
  durations: { actionToCommitMs: number[] };
  contextChanges: number;
  errors: number;
  abandonedJourneys: number;
  resumedJourneys: number;
  records: CourseCheckUxEventRecord[];
}

const ACTION_TYPES = new Set<CourseCheckActionType>([
  "decision",
  "guaranteed_speaker",
  "publication",
  "communication",
]);
const STAGES = new Set<CourseCheckUxStage>([
  "decision",
  "draft",
  "send",
  "delivery",
  "publication",
  "calendar",
  "airtable",
  "compensation",
]);
const ISSUE_CLASSES = new Set<CourseCheckUxIssueClass>([
  "needs_action",
  "check",
  "details",
  "could_not_check",
]);
const ISSUE_ACTIONS = new Set<CourseCheckUxIssueAction>([
  "fix",
  "exclude",
  "acknowledge",
]);
const OUTCOMES = new Set<CourseCheckUxOutcome>([
  "started",
  "shown",
  "repair",
  "excluded",
  "acknowledged",
  "abandoned",
  "resumed",
  "rechecked",
  "continued",
  "corrected",
  "compensating",
  "succeeded",
  "partially_succeeded",
  "failed",
  "unknown",
]);
const ALLOWED_KEYS = new Set<keyof CourseCheckUxEventInput>([
  "id",
  "journeyId",
  "planId",
  "eventType",
  "actionType",
  "stage",
  "issueClass",
  "issueAction",
  "issueCount",
  "affectedCount",
  "routeChanges",
  "durationMs",
  "outcome",
]);

function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9:_-]+$/.test(value)
  );
}

function boundedCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
}

export function parseCourseCheckUxEvent(
  value: unknown,
): { ok: true; event: CourseCheckUxEventInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A privacy-safe UX event object is required." };
  }
  const raw = value as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter(
    (key) => !ALLOWED_KEYS.has(key as keyof CourseCheckUxEventInput),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `UX events accept only stable classifications and counts; remove: ${unknownKeys.join(", ")}.`,
    };
  }
  if (!boundedId(raw.id) || !boundedId(raw.journeyId) || !boundedId(raw.planId)) {
    return { ok: false, error: "id, journeyId, and planId must be stable opaque identifiers." };
  }
  if (!COURSE_CHECK_UX_EVENT_TYPES.includes(raw.eventType as CourseCheckUxEventType)) {
    return { ok: false, error: "eventType is not an allowlisted Course Check UX event." };
  }
  if (!ACTION_TYPES.has(raw.actionType as CourseCheckActionType)) {
    return { ok: false, error: "actionType is invalid." };
  }
  if (!STAGES.has(raw.stage as CourseCheckUxStage)) {
    return { ok: false, error: "stage is invalid." };
  }
  if (raw.issueClass !== null && !ISSUE_CLASSES.has(raw.issueClass as CourseCheckUxIssueClass)) {
    return { ok: false, error: "issueClass is invalid." };
  }
  if (raw.issueAction !== null && !ISSUE_ACTIONS.has(raw.issueAction as CourseCheckUxIssueAction)) {
    return { ok: false, error: "issueAction is invalid." };
  }
  if (
    !boundedCount(raw.issueCount) ||
    !boundedCount(raw.affectedCount) ||
    !boundedCount(raw.routeChanges)
  ) {
    return { ok: false, error: "Event counts must be bounded non-negative integers." };
  }
  if (
    raw.durationMs !== null &&
    (!boundedCount(raw.durationMs) || Number(raw.durationMs) > 86_400_000)
  ) {
    return { ok: false, error: "durationMs must be null or a bounded millisecond count." };
  }
  if (raw.outcome !== null && !OUTCOMES.has(raw.outcome as CourseCheckUxOutcome)) {
    return { ok: false, error: "outcome is invalid." };
  }
  return { ok: true, event: raw as unknown as CourseCheckUxEventInput };
}
