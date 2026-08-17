/**
 * Human-facing proposal decision language for Course Check 11.
 * Storage/API enums stay: approve | maybe | deny | unreviewed | accepted | declined.
 */

import type { ProgramOutcome, ProposalStatus } from "../shared/events";

/** Soft committee lean — immediate, not Course Check. */
export type SoftDecisionStatus = "unreviewed" | "approve" | "deny";

export const SOFT_DECISION_STATUSES: SoftDecisionStatus[] = [
  "unreviewed",
  "approve",
  "deny",
];

export function softDecisionLabel(status: ProposalStatus | string): string {
  switch (status) {
    case "approve":
      return "Recommend";
    case "deny":
      return "Not recommend";
    case "maybe":
      // Legacy storage — product language dropped Maybe.
      return "Unreviewed";
    case "unreviewed":
    default:
      return "Unreviewed";
  }
}

/** Normalize stored soft status for UI controls (maybe → unreviewed). */
export function softDecisionForControls(status: ProposalStatus): SoftDecisionStatus {
  if (status === "approve" || status === "deny") return status;
  return "unreviewed";
}

export function programOutcomeLabel(outcome: ProgramOutcome): string {
  switch (outcome) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Denied";
  }
}

export function programOutcomeVerb(outcome: ProgramOutcome): string {
  return outcome === "accepted" ? "Accept" : "Deny";
}

export function programOutcomeGerund(outcome: ProgramOutcome): string {
  return outcome === "accepted" ? "acceptance" : "denial";
}

/** Queue row / inspector badge when a final outcome exists or soft lean is shown. */
export function proposalDecisionLabel(input: {
  status: ProposalStatus;
  programOutcome: ProgramOutcome | null;
}): string {
  if (input.programOutcome) return programOutcomeLabel(input.programOutcome);
  return softDecisionLabel(input.status);
}

export function proposalDecisionFlagClass(input: {
  status: ProposalStatus;
  programOutcome: ProgramOutcome | null;
}): string {
  if (input.programOutcome === "accepted") return "flag flag-accepted";
  if (input.programOutcome === "declined") return "flag flag-denied";
  const soft = softDecisionForControls(input.status);
  return `flag flag-${soft}`;
}

export function auditSoftStatusLabel(toStatus: string): string {
  return softDecisionLabel(toStatus);
}

export function auditFinalOutcomeLabel(toStatus: string): string {
  if (toStatus === "accepted" || toStatus === "declined") {
    return programOutcomeLabel(toStatus);
  }
  return toStatus;
}
