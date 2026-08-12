/** Course Check agent API v1 — scopes, modes, and closed action contract. */

export const COURSE_CHECK_API_VERSION = "v1" as const;

/** Closed Course Check action discriminators — unknown values fail closed. */
export const COURSE_CHECK_ACTION_TYPES = [
  "decision",
  "guaranteed_speaker",
  "publication",
  "communication",
] as const;

export type CourseCheckActionTypeV1 = (typeof COURSE_CHECK_ACTION_TYPES)[number];

export function isKnownCourseCheckActionType(
  value: unknown,
): value is CourseCheckActionTypeV1 {
  return (
    typeof value === "string" &&
    (COURSE_CHECK_ACTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Per-event agent scopes. Granting `all` expands to every individual scope
 * and is stored expanded on the durable grant.
 */
export const COURSE_CHECK_SCOPES = [
  "decisions",
  "drafts",
  "sends",
  "calendars",
  "publication",
  "integrations",
  "retries",
  "reconciliation",
  "compensation",
] as const;

export type CourseCheckScope = (typeof COURSE_CHECK_SCOPES)[number];

export type CourseCheckScopeGrant = CourseCheckScope | "all";

/** Default when connecting an agent: no consequential authority. */
export const DEFAULT_AGENT_MODE = "propose_only" as const;

export const AGENT_OPERATING_MODES = [
  "propose_only",
  "delegated_execution",
  "autonomous_policy",
] as const;

export type AgentOperatingMode = (typeof AGENT_OPERATING_MODES)[number];

/** Fine-grained capabilities checked at plan create and stage execution. */
export type CourseCheckCapability =
  | "read"
  | "propose_decision"
  | "apply_decision"
  | "propose_communication"
  | "revise"
  | "defer"
  | "create_drafts"
  | "send"
  | "calendar"
  | "propose_publication"
  | "apply_publication"
  | "integration_plan"
  | "integration_execute"
  | "retry"
  | "reconcile"
  | "compensate";

const ALL_CAPABILITIES: CourseCheckCapability[] = [
  "read",
  "propose_decision",
  "apply_decision",
  "propose_communication",
  "revise",
  "defer",
  "create_drafts",
  "send",
  "calendar",
  "propose_publication",
  "apply_publication",
  "integration_plan",
  "integration_execute",
  "retry",
  "reconcile",
  "compensate",
];

const SCOPE_CAPABILITIES: Record<CourseCheckScope, CourseCheckCapability[]> = {
  decisions: [
    "read",
    "propose_decision",
    "apply_decision",
    "revise",
    "defer",
  ],
  drafts: [
    "read",
    "propose_communication",
    "create_drafts",
    "revise",
    "defer",
  ],
  sends: ["read", "send"],
  calendars: ["read", "calendar", "send"],
  publication: [
    "read",
    "propose_publication",
    "apply_publication",
    "revise",
    "defer",
  ],
  integrations: ["read", "integration_plan", "integration_execute"],
  retries: ["read", "retry"],
  reconciliation: ["read", "reconcile"],
  compensation: ["read", "compensate"],
};

/** Capabilities that mutate external or final state — blocked in propose_only. */
export const EXECUTION_CAPABILITIES = new Set<CourseCheckCapability>([
  "apply_decision",
  "create_drafts",
  "send",
  "calendar",
  "apply_publication",
  "integration_execute",
  "retry",
  "reconcile",
  "compensate",
]);

export function expandCourseCheckScopes(
  grants: readonly CourseCheckScopeGrant[] | undefined | null,
): CourseCheckScope[] {
  if (!grants || grants.length === 0) return [];
  if (grants.includes("all")) return [...COURSE_CHECK_SCOPES];
  const out: CourseCheckScope[] = [];
  for (const grant of grants) {
    if (grant === "all") continue;
    if ((COURSE_CHECK_SCOPES as readonly string[]).includes(grant) && !out.includes(grant)) {
      out.push(grant);
    }
  }
  return out;
}

export function capabilitiesForScopes(
  scopes: readonly CourseCheckScope[],
): Set<CourseCheckCapability> {
  const caps = new Set<CourseCheckCapability>();
  for (const scope of scopes) {
    for (const cap of SCOPE_CAPABILITIES[scope] ?? []) {
      caps.add(cap);
    }
  }
  return caps;
}

export function isAgentOperatingMode(value: unknown): value is AgentOperatingMode {
  return (
    typeof value === "string" &&
    (AGENT_OPERATING_MODES as readonly string[]).includes(value)
  );
}

export function isCourseCheckScopeGrant(value: unknown): value is CourseCheckScopeGrant {
  return (
    value === "all" ||
    (typeof value === "string" &&
      (COURSE_CHECK_SCOPES as readonly string[]).includes(value))
  );
}

export { ALL_CAPABILITIES };
