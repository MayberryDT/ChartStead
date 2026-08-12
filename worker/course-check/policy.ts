import type { AgentOperatingMode } from "../../shared/agent-api";
import {
  agentModeRank,
  type CourseCheckActor,
  type CourseCheckPlan,
  type CourseCheckStageEndorsement,
  type EventCourseCheckPolicy,
} from "../../shared/course-check";

export type StagePolicyDenial = {
  status: 400 | 403 | 409;
  code: string;
  error: string;
  recoveryGuidance: string;
};

export type StagePolicyResult =
  | { action: "execute" }
  | { action: "endorse"; endorsement: CourseCheckStageEndorsement }
  | { action: "deny"; denial: StagePolicyDenial };

/**
 * Evaluate optional stricter event policy at stage boundary.
 * Never weakens digest/version/authz/freshness checks (those stay in the kernel).
 */
export function evaluateStagePolicy(input: {
  policy: EventCourseCheckPolicy;
  plan: CourseCheckPlan;
  stageId: string;
  actor: CourseCheckActor;
  reason?: string | null;
  now?: string;
}): StagePolicyResult {
  const { policy, plan, stageId, actor } = input;
  const now = input.now ?? new Date().toISOString();
  const reason = input.reason?.trim() || null;

  if (policy.requireReasonOnApprove && !reason) {
    return {
      action: "deny",
      denial: {
        status: 400,
        code: "approval_reason_required",
        error: "Event policy requires a reason for every Course Check stage approval.",
        recoveryGuidance: "Provide a short reason with this stage action.",
      },
    };
  }

  if (policy.requireDistinctApprover && actor.id === plan.createdBy.id) {
    return {
      action: "deny",
      denial: {
        status: 403,
        code: "distinct_approver_required",
        error: "Event policy requires a different person to approve than the plan requester.",
        recoveryGuidance:
          "Ask another authorized administrator to approve and execute this stage.",
      },
    };
  }

  if (policy.requireTwoPersonApproval) {
    const endorsements = plan.stageEndorsements ?? [];
    const stageEndorsements = endorsements.filter(
      (row) =>
        row.stageId === stageId &&
        row.planVersion === plan.version &&
        row.digest === plan.digest,
    );
    const otherEndorser = stageEndorsements.find((row) => row.actor.id !== actor.id);
    if (!otherEndorser) {
      const alreadySelf = stageEndorsements.some((row) => row.actor.id === actor.id);
      if (alreadySelf) {
        return {
          action: "deny",
          denial: {
            status: 409,
            code: "awaiting_second_approver",
            error: "Two-person approval is waiting for a different authorized actor.",
            recoveryGuidance:
              "A second administrator must approve this exact plan version and digest.",
          },
        };
      }
      return {
        action: "endorse",
        endorsement: {
          stageId,
          planVersion: plan.version,
          digest: plan.digest,
          actor,
          endorsedAt: now,
          reason,
        },
      };
    }
  }

  return { action: "execute" };
}

export function agentModeAllowedByPolicy(
  mode: AgentOperatingMode,
  policy: EventCourseCheckPolicy,
): boolean {
  return agentModeRank(mode) <= agentModeRank(policy.maxAgentMode);
}

export function agentModePolicyDenial(
  mode: AgentOperatingMode,
  policy: EventCourseCheckPolicy,
): StagePolicyDenial {
  return {
    status: 403,
    code: "agent_mode_capped",
    error: `Event policy caps agent mode at ${policy.maxAgentMode}; this agent is ${mode}.`,
    recoveryGuidance:
      "Lower the agent mode or ask an administrator to raise the event policy ceiling.",
  };
}
