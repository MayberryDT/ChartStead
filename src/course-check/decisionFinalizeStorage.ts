import type { ProgramOutcome } from "../../shared/events";

const RESUME_PREFIX = "chartstead:decision-finalize-resume:";
const RESULT_PREFIX = "chartstead:decision-finalize-result:";

export type DecisionFinalizeResume = {
  planId: string;
  outcome: ProgramOutcome;
  openedAt: string;
  acknowledgedActionIds?: string[];
};

export type DecisionFinalizeResultSnapshot = {
  planId: string;
  summary: string;
  draftsLabel: string;
  externalLabel: string;
  appliedAt: string;
  appliedBy: string;
  dismissed: boolean;
};

function resumeKey(eventId: string) {
  return `${RESUME_PREFIX}${eventId}`;
}

function resultKey(eventId: string) {
  return `${RESULT_PREFIX}${eventId}`;
}

export function readDecisionFinalizeResume(
  eventId: string,
): DecisionFinalizeResume | null {
  try {
    const raw = sessionStorage.getItem(resumeKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as DecisionFinalizeResume;
  } catch {
    return null;
  }
}

export function writeDecisionFinalizeResume(
  eventId: string,
  value: DecisionFinalizeResume | null,
) {
  try {
    if (!value) sessionStorage.removeItem(resumeKey(eventId));
    else sessionStorage.setItem(resumeKey(eventId), JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readDecisionFinalizeResult(
  eventId: string,
): DecisionFinalizeResultSnapshot | null {
  try {
    const raw = sessionStorage.getItem(resultKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as DecisionFinalizeResultSnapshot;
  } catch {
    return null;
  }
}

export function writeDecisionFinalizeResult(
  eventId: string,
  value: DecisionFinalizeResultSnapshot | null,
) {
  try {
    if (!value) sessionStorage.removeItem(resultKey(eventId));
    else sessionStorage.setItem(resultKey(eventId), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
