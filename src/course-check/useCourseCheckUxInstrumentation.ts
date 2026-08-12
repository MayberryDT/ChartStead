import { useCallback, useEffect, useMemo, useRef } from "react";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  CourseCheckUxEventInput,
  CourseCheckUxEventType,
  CourseCheckUxIssueAction,
  CourseCheckUxIssueClass,
  CourseCheckUxOutcome,
  CourseCheckUxStage,
} from "../../shared/course-check-ux";
import { emitCourseCheckUxEvent } from "../api";
import { createClientId } from "../id";

type JourneyState = {
  id: string;
  startedAt: number;
  completed: boolean;
};

function stageForPlan(plan: CourseCheckPlan): CourseCheckUxStage {
  if (plan.body.actionType === "publication") return "publication";
  if (plan.body.actionType === "communication") {
    if (plan.body.compensation) return "compensation";
    if (plan.body.effects.length > 0) return "delivery";
    if (plan.body.drafts.length > 0) return "send";
    return "draft";
  }
  return "decision";
}

function readJourney(key: string): JourneyState | null {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<JourneyState>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.completed !== "boolean"
    ) {
      return null;
    }
    return parsed as JourneyState;
  } catch {
    return null;
  }
}

function writeJourney(key: string, value: JourneyState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Instrumentation storage can never block Course Check operation.
  }
}

export type CourseCheckUxTrackInput = {
  eventType: CourseCheckUxEventType;
  stage?: CourseCheckUxStage;
  issueClass?: CourseCheckUxIssueClass | null;
  issueAction?: CourseCheckUxIssueAction | null;
  issueCount?: number;
  affectedCount?: number;
  routeChanges?: number;
  durationMs?: number | null;
  outcome?: CourseCheckUxOutcome | null;
};

export function useCourseCheckUxInstrumentation(
  eventId: string,
  plan: CourseCheckPlan | null,
) {
  const storageKey = plan ? `chartstead:course-check-ux:${plan.id}` : null;
  const journey = useMemo<JourneyState>(() => {
    if (!storageKey) {
      return { id: `ux-${createClientId()}`, startedAt: Date.now(), completed: false };
    }
    const prior = readJourney(storageKey);
    if (prior && !prior.completed) return prior;
    return { id: `ux-${createClientId()}`, startedAt: Date.now(), completed: false };
  }, [storageKey]);
  const sequence = useRef(0);
  const routeChanges = useRef(0);
  const completed = useRef(journey.completed);
  const stage = plan ? stageForPlan(plan) : "decision";

  const track = useCallback(
    (input: CourseCheckUxTrackInput, keepalive = false) => {
      if (!plan) return;
      sequence.current += 1;
      routeChanges.current += input.routeChanges ?? 0;
      const event: CourseCheckUxEventInput = {
        id: `${journey.id}:${input.eventType}:${sequence.current}`,
        journeyId: journey.id,
        planId: plan.id,
        eventType: input.eventType,
        actionType: plan.body.actionType,
        stage: input.stage ?? stage,
        issueClass: input.issueClass ?? null,
        issueAction: input.issueAction ?? null,
        issueCount: input.issueCount ?? 0,
        affectedCount: input.affectedCount ?? 0,
        routeChanges: input.routeChanges ?? 0,
        durationMs: input.durationMs ?? null,
        outcome: input.outcome ?? null,
      };
      void emitCourseCheckUxEvent(eventId, event, keepalive).catch(() => undefined);
    },
    [eventId, journey.id, plan, stage],
  );

  useEffect(() => {
    if (!plan || !storageKey) return;
    const prior = readJourney(storageKey);
    writeJourney(storageKey, journey);
    track({
      eventType: prior && !prior.completed ? "journey_resumed" : "journey_started",
      durationMs: prior ? Math.max(0, Date.now() - prior.startedAt) : 0,
      outcome: prior && !prior.completed ? "resumed" : "started",
    });
    const issues = plan.decisionReview?.issues ?? plan.externalReview?.issues ?? [];
    if (issues.length > 0) {
      track({
        eventType: "issues_shown",
        issueCount: issues.length,
        affectedCount: issues.length,
        outcome: "shown",
      });
    }
    const onPageHide = () => {
      if (completed.current) return;
      track(
        {
          eventType: "journey_abandoned",
          routeChanges: routeChanges.current,
          durationMs: Math.max(0, Date.now() - journey.startedAt),
          outcome: "abandoned",
        },
        true,
      );
    };
    const onIssueClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest<HTMLElement>("[data-issue-action-id]");
      if (!control) return;
      const label = control.textContent?.toLowerCase() ?? "";
      const issueAction: CourseCheckUxIssueAction =
        control.tagName === "A"
          ? "fix"
          : label.includes("skip") || label.includes("exclude")
            ? "exclude"
            : "acknowledge";
      track({
        eventType: "issue_action",
        issueAction,
        affectedCount: 1,
        outcome:
          issueAction === "fix"
            ? "repair"
            : issueAction === "exclude"
              ? "excluded"
              : "acknowledged",
      });
      if (control.tagName === "A") {
        track({
          eventType: "route_changed",
          affectedCount: 1,
          routeChanges: 1,
          outcome: "repair",
        });
      }
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onIssueClick);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onIssueClick);
    };
  }, [journey, plan, storageKey, track]);

  const trackStageOutcome = useCallback(
    (outcome: Extract<CourseCheckUxOutcome, "succeeded" | "partially_succeeded" | "failed" | "unknown">, affectedCount: number) => {
      const isTerminal = outcome === "succeeded" || outcome === "partially_succeeded";
      if (isTerminal && storageKey) {
        completed.current = true;
        writeJourney(storageKey, { ...journey, completed: true });
      }
      track({
        eventType: "stage_outcome",
        affectedCount,
        routeChanges: routeChanges.current,
        durationMs: Math.max(0, Date.now() - journey.startedAt),
        outcome,
      });
    },
    [journey, storageKey, track],
  );

  return { track, trackStageOutcome, journeyId: journey.id };
}
