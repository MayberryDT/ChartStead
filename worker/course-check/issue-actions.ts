import type {
  CourseCheckFinding,
  DecisionItem,
  DecisionPlanBody,
} from "../../shared/course-check";
import type {
  CourseCheckChangedInput,
  CourseCheckIssueAction,
  CourseCheckIssueActionTarget,
  CourseCheckRevalidationSummary,
} from "../../shared/course-check-actions";

type IssueActionAuthority = {
  role: "admin" | "reviewer" | "agent" | "none";
  canViewFullDecisionEvidence: boolean;
  canDeferItems: boolean;
};

function itemsForFinding(body: DecisionPlanBody, finding: CourseCheckFinding): DecisionItem[] {
  const directlyAffected = body.items.filter(
    (item) =>
      item.findings.some((candidate) => candidate.id === finding.id) ||
      item.itemId === finding.entityRef ||
      item.proposalId === finding.entityRef,
  );
  if (finding.code === "identity_ambiguity" && finding.entityRef) {
    const identity = finding.entityRef.trim().toLowerCase();
    const shared = body.items.filter((item) =>
      item.speakers.some((speaker) => speaker.email.trim().toLowerCase() === identity),
    );
    return shared.length > 0 ? shared : directlyAffected;
  }
  return directlyAffected.length > 0
    ? directlyAffected
    : body.items.filter((item) => item.status === "active");
}

function proposalRoute(
  eventId: string,
  proposalId: string,
  field: string | null,
): Extract<CourseCheckIssueActionTarget, { type: "route" }> {
  const query = field ? `?field=${encodeURIComponent(field)}` : "";
  return {
    type: "route",
    href: `/e/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(proposalId)}${query}`,
    objectType: "proposal",
    objectId: proposalId,
    field,
  };
}

function stableActionId(finding: CourseCheckFinding, suffix: string): string {
  let hash = 2166136261;
  for (let index = 0; index < finding.id.length; index += 1) {
    hash ^= finding.id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `issue-${finding.code}-${(hash >>> 0).toString(36)}:${suffix}`.replace(
    /[^a-zA-Z0-9:_-]/g,
    "-",
  );
}

function fieldForFinding(finding: CourseCheckFinding): string {
  switch (finding.code) {
    case "session_unplaced":
    case "session_tbd":
      return "sessionPlacement";
    case "identity_ambiguity":
      return "speakerEmail";
    case "durable_integrity":
      return "speakers";
    case "relevant_input_changed":
      return "review";
    default:
      return "review";
  }
}

function deepRepairLabel(finding: CourseCheckFinding): string {
  switch (finding.code) {
    case "session_unplaced":
    case "session_tbd":
      return "Change session placement";
    case "identity_ambiguity":
      return "Resolve speaker identity";
    case "durable_integrity":
      return "Correct speaker details";
    case "relevant_input_changed":
      return "Review current submission";
    default:
      return "Open affected submission";
  }
}

export function declareDecisionIssueActions(input: {
  eventId: string;
  body: DecisionPlanBody;
  finding: CourseCheckFinding;
  authority: IssueActionAuthority;
}): CourseCheckIssueAction[] {
  const { eventId, body, finding, authority } = input;
  const items = itemsForFinding(body, finding);
  const proposals = [...new Set(items.map((item) => item.proposalId))];
  const itemIds = items.filter((item) => item.status === "active").map((item) => item.itemId);
  const affectedEntityIds = [
    ...new Set(
      items.flatMap((item) => [
        item.proposalId,
        ...(item.session ? [item.session.plannedId] : []),
      ]),
    ),
  ];
  const firstProposal = proposals[0];
  if (!firstProposal) return [];

  // Reviewers receive only a read-only proposal target. Source fields and
  // mutating commands remain absent, so redacted evidence cannot be inferred.
  if (authority.role === "reviewer" || !authority.canViewFullDecisionEvidence) {
    return [
      {
        id: stableActionId(finding, "view"),
        label: proposals.length === 1 ? "View affected submission" : "View first affected submission",
        kind: "deep_repair",
        target: proposalRoute(eventId, firstProposal, null),
        affectedEntityIds: proposals,
        resultingEffectSummary: "The current submission evidence will open without changing this review.",
      },
    ];
  }

  const actions: CourseCheckIssueAction[] = [];
  const informational =
    finding.severity === "info" ||
    finding.code === "readiness_tasks" ||
    finding.code === "session_unplaced" ||
    finding.code === "session_tbd";

  if (!informational || finding.code === "session_unplaced" || finding.code === "session_tbd") {
    actions.push({
      id: stableActionId(finding, "deep-repair"),
      label: deepRepairLabel(finding),
      kind: "deep_repair",
      target: proposalRoute(eventId, firstProposal, fieldForFinding(finding)),
      affectedEntityIds,
      resultingEffectSummary:
        items.length > 1
          ? `Course Check will recheck all ${items.length} submissions that share this dependency.`
          : "Course Check will recheck this submission and its dependent effects.",
    });
  }

  if (informational) {
    actions.push({
      id: stableActionId(finding, "acknowledge"),
      label:
        finding.code === "session_unplaced" || finding.code === "session_tbd"
          ? "Keep session unplaced"
          : "Acknowledge this note",
      kind: "acknowledge",
      target: { type: "command", command: "acknowledge_warning", itemIds },
      affectedEntityIds,
      resultingEffectSummary:
        finding.code === "session_unplaced" || finding.code === "session_tbd"
          ? "The decision can proceed with placement still pending."
          : "This note will remain visible and the planned effects will not change.",
    });
  }

  if (authority.canDeferItems && itemIds.length > 0) {
    actions.push({
      id: stableActionId(finding, "exclude"),
      label: itemIds.length === 1 ? "Skip this submission" : `Skip ${itemIds.length} submissions`,
      kind: "exclude",
      target: { type: "command", command: "defer_items", itemIds },
      affectedEntityIds,
      resultingEffectSummary:
        itemIds.length === 1
          ? "This submission will stay unchanged and move to follow-up."
          : `${itemIds.length} submissions will stay unchanged and move to follow-up.`,
    });
  }

  return actions;
}

function changedInputFromToken(
  eventId: string,
  token: string,
): CourseCheckChangedInput | null {
  const [proposalId, kind] = token.split(":");
  if (!proposalId) return null;
  const field = kind === "recipients" ? "speakers" : kind === "missing" ? null : "review";
  const subject = kind === "missing" ? "Submission" : kind === "recipients" ? "Speaker recipients" : "Review decision";
  return {
    label: `${subject} for ${proposalId} changed`,
    affectedEntityIds: [proposalId],
    target: proposalRoute(eventId, proposalId, field),
  };
}

export function decisionRevalidationSummary(input: {
  eventId: string;
  body: DecisionPlanBody;
  canViewTargets: boolean;
}): CourseCheckRevalidationSummary {
  const stale = input.body.findings.find((finding) => finding.code === "relevant_input_changed");
  const tokens = stale?.message.match(/inputs changed:\s*(.+)\.$/i)?.[1]?.split(/,\s*/) ?? [];
  const changedInputs = tokens
    .map((token) => changedInputFromToken(input.eventId, token))
    .filter((row): row is CourseCheckChangedInput => Boolean(row))
    .map((row) => (input.canViewTargets ? row : { ...row, target: null }));
  const affected = new Set(changedInputs.flatMap((row) => row.affectedEntityIds));
  const affectedItemIds = input.body.items
    .filter((item) => affected.size === 0 || affected.has(item.proposalId))
    .map((item) => item.itemId);
  return {
    scope: "affected_dependencies",
    affectedItemIds,
    changedInputs,
    preservedStageIds: input.body.stages
      .filter((stage) => stage.status === "complete")
      .map((stage) => stage.id),
  };
}
