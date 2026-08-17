import { useEffect, useRef } from "react";

import type { CourseCheckIssueAction } from "../../shared/course-check-actions";
import { CourseCheckRepairLink } from "./CourseCheckRepairLink";
import {
  repairHref,
  saveCourseCheckReturnContext,
  type CourseCheckReturnContext,
} from "./useCourseCheckReturnContext";

/** Shorten verbose API/storage action labels for exception-review buttons. */
export function shortIssueActionLabel(label: string): string {
  const exact: Record<string, string> = {
    Fix: "Fix",
    Accept: "Accept",
    "Change session placement": "Fix",
    "Keep session unplaced": "Accept",
    "Keep session in place": "Accept",
    "Leave decision unchanged": "Accept",
    "Skip this submission": "Skip",
    "Accept without a draft": "Accept",
    "Deny without a draft": "Deny",
    "Acknowledge this note": "Accept",
    "Resolve speaker identity": "Fix",
    "Correct speaker details": "Fix",
    "Review current submission": "Fix",
    "Open affected submission": "Fix",
  };
  const mapped = exact[label];
  if (mapped) return mapped;

  if (/^Skip \d+ submissions$/i.test(label)) return "Skip";
  if (/^Accept without (?:a )?draft$/i.test(label)) return "Accept";
  if (/^Deny without (?:a )?draft$/i.test(label)) return "Deny";
  if (/^Keep session\b/i.test(label)) return "Accept";
  if (/^Change session placement$/i.test(label)) return "Fix";
  if (/^Leave decision unchanged$/i.test(label)) return "Accept";
  if (/^Resolve |^Correct |^Review |^Open /i.test(label)) return "Fix";

  return label;
}

function AcknowledgeAction({
  action,
  acknowledged,
  onAcknowledge,
}: {
  action: CourseCheckIssueAction;
  acknowledged: boolean;
  onAcknowledge: (action: CourseCheckIssueAction) => void;
}) {
  const resultRef = useRef<HTMLParagraphElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (acknowledged && restoreFocus.current) {
      resultRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [acknowledged]);

  return acknowledged ? (
    <p
      ref={resultRef}
      className="course-check-action-result"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      tabIndex={-1}
    >
      Acknowledged: {action.resultingEffectSummary}
    </p>
  ) : (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      data-issue-action-id={action.id}
      onClick={() => {
        restoreFocus.current = true;
        onAcknowledge(action);
      }}
    >
      {shortIssueActionLabel(action.label)}
    </button>
  );
}

export function IssueActions({
  planId,
  actions = [],
  context,
  acknowledgedActionIds,
  onAcknowledge,
  onExclude,
  primaryFirst = false,
}: {
  planId: string;
  actions: CourseCheckIssueAction[];
  context: Omit<CourseCheckReturnContext, "focusActionId">;
  acknowledgedActionIds: Set<string>;
  onAcknowledge: (action: CourseCheckIssueAction) => void;
  onExclude: (itemIds: string[]) => void;
  primaryFirst?: boolean;
}) {
  const ordered = primaryFirst
    ? [...actions].sort((left, right) => {
        const rank = (label: string) => {
          const short = shortIssueActionLabel(label).toLowerCase();
          if (short === "accept" || short === "deny") return 0;
          if (short === "keep" || short === "acknowledge") return 2;
          if (short === "skip") return 3;
          return 1;
        };
        return rank(left.label) - rank(right.label);
      })
    : actions;

  return (
    <div className="course-check-issue-actions" aria-label="Issue actions">
      {ordered.map((action) => {
        if (action.target.type === "route") {
          return (
            <CourseCheckRepairLink
              key={action.id}
              className="btn btn-secondary btn-sm"
              href={repairHref(action.target.href, context.returnPath)}
              data-issue-action-id={action.id}
              onNavigate={() =>
                saveCourseCheckReturnContext(planId, {
                  ...context,
                  focusActionId: action.id,
                })
              }
            >
              {shortIssueActionLabel(action.label)}
            </CourseCheckRepairLink>
          );
        }
        if (action.target.command === "acknowledge_warning") {
          const acknowledged = acknowledgedActionIds.has(action.id);
          return (
            <AcknowledgeAction
              key={action.id}
              action={action}
              acknowledged={acknowledged}
              onAcknowledge={onAcknowledge}
            />
          );
        }
        if (action.target.command === "defer_items") {
          const target = action.target;
          return (
            <button
              key={action.id}
              type="button"
              className="btn btn-secondary btn-sm"
              data-issue-action-id={action.id}
              onClick={() => onExclude(target.itemIds)}
            >
              {shortIssueActionLabel(action.label)}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}
