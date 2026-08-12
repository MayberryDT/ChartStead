import { useEffect, useRef } from "react";

export interface CourseCheckReturnContext {
  returnPath: string;
  selectedItemIds: string[];
  issueFilter: string;
  expandedIssueIds: string[];
  subject: string;
  bodyText: string;
  selectedRecipientIds: string[];
  overrideReasons: Record<string, string>;
  acknowledgedIssueIds: string[];
  scrollY: number;
  focusActionId: string;
}

const storageKey = (planId: string) => `chartstead:course-check-return:${planId}`;

export function saveCourseCheckReturnContext(
  planId: string,
  context: CourseCheckReturnContext,
): void {
  sessionStorage.setItem(storageKey(planId), JSON.stringify(context));
}

export function readCourseCheckReturnContext(
  planId: string,
): CourseCheckReturnContext | null {
  const raw = sessionStorage.getItem(storageKey(planId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CourseCheckReturnContext;
  } catch {
    sessionStorage.removeItem(storageKey(planId));
    return null;
  }
}

export function repairHref(href: string, returnPath: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnPath)}`;
}

export function useCourseCheckReturnContext(
  planId: string,
  ready: boolean,
  restore: (context: CourseCheckReturnContext) => void,
): void {
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const context = readCourseCheckReturnContext(planId);
    if (!context) return;
    restore(context);
    let attempts = 0;
    let frame = 0;
    const restoreViewportAndFocus = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-issue-action-id="${CSS.escape(context.focusActionId)}"]`,
      );
      if (target) {
        window.scrollTo({ top: context.scrollY });
        target.focus();
        sessionStorage.removeItem(storageKey(planId));
        return;
      }
      attempts += 1;
      if (attempts < 60) frame = window.requestAnimationFrame(restoreViewportAndFocus);
    };
    frame = window.requestAnimationFrame(restoreViewportAndFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [planId, ready, restore]);
}
