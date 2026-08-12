import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  DecisionItem,
  DecisionPlanBody,
} from "../../shared/course-check";
import { redactCommunicationBody } from "./communication-planner";

export type CourseCheckProjectionOptions = {
  role: "admin" | "reviewer" | "agent" | "none";
  /** Assigned track ids for reviewers. Empty = no decision evidence. */
  trackIds: string[];
  canViewCommunicationEvidence: boolean;
  canViewFullDecisionEvidence: boolean;
};

const REDACTED = "[redacted]";

function redactDecisionItem(item: DecisionItem): DecisionItem {
  return {
    ...item,
    speakers: item.speakers.map((speaker) => ({
      ...speaker,
      email: REDACTED,
      biography: REDACTED,
    })),
    portalAccess: item.portalAccess.map((access) => ({
      ...access,
      email: REDACTED,
    })),
    findings: item.findings.filter((finding) => finding.severity === "blocker"),
  };
}

function projectDecisionBody(
  body: DecisionPlanBody,
  options: CourseCheckProjectionOptions,
): DecisionPlanBody {
  if (options.canViewFullDecisionEvidence) return body;
  const allowed = new Set(options.trackIds);
  const items = body.items
    .filter((item) => {
      const trackId = item.session?.trackId;
      // Prefer session track; fall back to allowing if no track (declined)
      if (!trackId) return options.role === "reviewer" && allowed.size > 0;
      return allowed.has(trackId);
    })
    .map(redactDecisionItem);

  const activeIds = new Set(items.map((item) => item.itemId));
  return {
    ...body,
    items,
    proposalId: items[0]?.proposalId ?? body.proposalId,
    speakers: items.flatMap((item) => item.speakers),
    participations: items.flatMap((item) => item.participations),
    session: items.find((item) => item.session)?.session ?? null,
    tasks: items.flatMap((item) => item.tasks),
    portalAccess: items.flatMap((item) => item.portalAccess),
    deltas: body.deltas.filter(
      (delta) => !delta.proposalId || items.some((item) => item.proposalId === delta.proposalId),
    ),
    findings: body.findings.filter((finding) => {
      if (finding.severity === "blocker") return true;
      if (!finding.entityRef) return false;
      return items.some(
        (item) =>
          item.proposalId === finding.entityRef ||
          item.itemId === finding.entityRef,
      );
    }),
    followUpQueue: body.followUpQueue.filter((row) =>
      items.some((item) => item.proposalId === row.proposalId),
    ),
    aggregateProgress: {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      deferred: items.filter((item) => item.status === "deferred").length,
      applied: items.filter((item) => item.status === "applied").length,
    },
    // Keep linked ids so navigation works without leaking foreign tracks.
    linkedPlanIds: body.linkedPlanIds,
    // Drop item-private cascade details for out-of-track leftovers.
    softWarningOverrides: body.softWarningOverrides.filter((row) =>
      activeIds.size === 0 ? false : true,
    ),
  };
}

function redactDecisionEmails(body: DecisionPlanBody): DecisionPlanBody {
  return {
    ...body,
    speakers: body.speakers.map((speaker) => ({ ...speaker, email: REDACTED, biography: REDACTED })),
    portalAccess: body.portalAccess.map((access) => ({ ...access, email: REDACTED })),
    items: body.items.map(redactDecisionItem),
  };
}

/**
 * Role-aware Course Check projection.
 * Admins/agents with full authority see complete evidence.
 * Reviewers see assigned-track decision evidence only (emails redacted).
 * Communication private fields require communication authority.
 */
export function projectCourseCheckForViewer(
  plan: CourseCheckPlan,
  options: CourseCheckProjectionOptions,
): CourseCheckPlan | null {
  if (options.role === "none") return null;

  let projected: CourseCheckPlan = { ...plan, body: plan.body };

  if (plan.body.actionType === "decision") {
    if (options.role === "reviewer") {
      const body = projectDecisionBody(plan.body, options);
      // Reviewers with no matching tracks get an empty projected plan shell.
      projected = { ...projected, body };
    } else if (!options.canViewFullDecisionEvidence) {
      projected = { ...projected, body: redactDecisionEmails(plan.body) };
    }
  }

  if (
    projected.body.actionType === "communication" &&
    !options.canViewCommunicationEvidence
  ) {
    projected = {
      ...projected,
      body: redactCommunicationBody(projected.body as CommunicationPlanBody),
    };
  }

  if (!options.canViewCommunicationEvidence && projected.body.airtable.effects.length > 0) {
    projected = {
      ...projected,
      body: {
        ...projected.body,
        airtable: {
          ...projected.body.airtable,
          redacted: true,
          effects: projected.body.airtable.effects.map((effect) => ({
            ...effect,
            fields: { redacted: true },
            beforeFields: null,
            lastError: effect.lastError
              ? "Integration delivery requires administrator review."
              : null,
          })),
        },
      },
    };
  }

  // Never leak version body payloads that reviewers shouldn't see.
  if (projected.versions && options.role === "reviewer") {
    projected = {
      ...projected,
      versions: projected.versions.map((version) => ({
        ...version,
        body:
          version.body.actionType === "decision"
            ? projectDecisionBody(version.body, options)
            : version.body.actionType === "communication"
              ? redactCommunicationBody(version.body)
              : version.body,
      })),
    };
  }

  return projected;
}

/** Whether a reviewer should see this plan in list views at all. */
export function reviewerCanSeePlan(
  plan: CourseCheckPlan,
  trackIds: string[],
): boolean {
  if (plan.body.actionType !== "decision") {
    // Non-decision plans: reviewers may see state badges only when assigned any track.
    return trackIds.length > 0;
  }
  const allowed = new Set(trackIds);
  return plan.body.items.some((item) => {
    const trackId = item.session?.trackId;
    if (!trackId) return true;
    return allowed.has(trackId);
  });
}
