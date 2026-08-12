import {
  capabilitiesForScopes,
  EXECUTION_CAPABILITIES,
  type AgentOperatingMode,
  type CourseCheckCapability,
  type CourseCheckScope,
} from "../../shared/agent-api";
import type { CourseCheckActor } from "../../shared/course-check";
import type { OrganizerPrincipal } from "../../shared/events";
import { canAccessEvent, eventRole, isEventAdmin } from "../authz";

export function isAgentPrincipal(
  principal: OrganizerPrincipal | null | undefined,
): principal is OrganizerPrincipal & { principalKind: "agent" } {
  return principal?.principalKind === "agent";
}

export function agentModeOf(principal: OrganizerPrincipal): AgentOperatingMode {
  return principal.agentMode ?? "propose_only";
}

export function agentScopesForEvent(
  principal: OrganizerPrincipal,
  eventId: string,
): CourseCheckScope[] {
  return principal.courseCheckScopesByEvent?.[eventId] ?? [];
}

export function agentHasCapability(
  principal: OrganizerPrincipal,
  eventId: string,
  capability: CourseCheckCapability,
): boolean {
  if (!isAgentPrincipal(principal)) return false;
  if (!principal.eventIds.includes(eventId)) return false;
  const caps = capabilitiesForScopes(agentScopesForEvent(principal, eventId));
  if (!caps.has(capability)) return false;
  if (EXECUTION_CAPABILITIES.has(capability)) {
    const mode = agentModeOf(principal);
    if (mode === "propose_only") return false;
  }
  return true;
}

export type CourseCheckAuthDenial = {
  status: 401 | 403;
  body: {
    error: string;
    code: string;
    recoveryGuidance: string;
  };
};

/**
 * Authorize a Course Check capability.
 * Humans: existing admin/reviewer rules (read allows reviewer).
 * Agents: distinct principals with expanded per-event scopes + operating mode.
 * Scope is always re-checked at execution — prior approval does not freeze authority.
 */
export function authorizeCourseCheck(
  principal: OrganizerPrincipal | null,
  eventId: string,
  capability: CourseCheckCapability,
): CourseCheckAuthDenial | null {
  if (!canAccessEvent(principal, eventId)) {
    return {
      status: 401,
      body: {
        error: "Unauthorized",
        code: "unauthorized",
        recoveryGuidance: "Authenticate with a session or agent API key.",
      },
    };
  }

  if (isAgentPrincipal(principal)) {
    if (agentHasCapability(principal, eventId, capability)) {
      return null;
    }
    const mode = agentModeOf(principal);
    if (
      EXECUTION_CAPABILITIES.has(capability) &&
      mode === "propose_only" &&
      capabilitiesForScopes(agentScopesForEvent(principal, eventId)).has(capability)
    ) {
      return {
        status: 403,
        body: {
          error:
            "This agent is propose-only and cannot approve or execute consequential stages.",
          code: "propose_only",
          recoveryGuidance:
            "Grant delegated_execution or autonomous_policy mode, or have a human execute the stage.",
        },
      };
    }
    return {
      status: 403,
      body: {
        error: "Agent lacks the required Course Check scope for this action.",
        code: "missing_scope",
        recoveryGuidance:
          "Ask an event administrator to grant the needed stage scope (or all) on this agent key.",
      },
    };
  }

  // Human path
  if (capability === "read") {
    const role = eventRole(principal, eventId);
    if (role !== "admin" && role !== "reviewer") {
      return {
        status: 403,
        body: {
          error: "Administrator or reviewer access required",
          code: "missing_authority",
          recoveryGuidance: "Ask an event administrator for access.",
        },
      };
    }
    return null;
  }

  if (!isEventAdmin(principal, eventId)) {
    return {
      status: 403,
      body: {
        error: "Administrator access is required for this Course Check action.",
        code: "missing_authority",
        recoveryGuidance:
          "Ask an event administrator to perform this Course Check action.",
      },
    };
  }
  return null;
}

export function toCourseCheckActor(
  principal: OrganizerPrincipal,
  requestProvenance?: { id: string; displayName: string } | null,
): CourseCheckActor {
  if (isAgentPrincipal(principal)) {
    return {
      id: principal.id,
      displayName: principal.displayName,
      kind: "agent",
      agentId: principal.agentId ?? principal.id,
      agentMode: agentModeOf(principal),
      initiatingHuman:
        requestProvenance ??
        principal.initiatingHuman ??
        null,
    };
  }
  return {
    id: principal.id,
    displayName: principal.displayName,
    kind: "human",
  };
}

/** Map stage id → capability for execute-time checks. */
export function capabilityForStage(stageId: string): CourseCheckCapability {
  switch (stageId) {
    case "apply-decision":
    case "apply-guaranteed-speaker":
      return "apply_decision";
    case "create-drafts":
      return "create_drafts";
    case "send-messages":
      return "send";
    case "publish-program":
    case "unpublish-program":
    case "restore-program":
      return "apply_publication";
    case "write-airtable":
      return "integration_execute";
    default:
      // Unknown stage fails closed as execution
      return "apply_decision";
  }
}

export function parseInitiatingHumanHeader(
  request: Request,
): { id: string; displayName: string } | null {
  const raw = request.headers.get("x-chartstead-initiating-human");
  if (!raw?.trim()) return null;
  // format: id|Display Name
  const pipe = raw.indexOf("|");
  if (pipe <= 0) return null;
  const id = raw.slice(0, pipe).trim();
  const displayName = raw.slice(pipe + 1).trim();
  if (!id || !displayName) return null;
  return { id, displayName };
}
