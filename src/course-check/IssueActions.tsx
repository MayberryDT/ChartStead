import { useEffect, useRef } from "react";

import type { CourseCheckIssueAction } from "../../shared/course-check-actions";
import {
  repairHref,
  saveCourseCheckReturnContext,
  type CourseCheckReturnContext,
} from "./useCourseCheckReturnContext";

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
      {action.label}
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
}: {
  planId: string;
  actions: CourseCheckIssueAction[];
  context: Omit<CourseCheckReturnContext, "focusActionId">;
  acknowledgedActionIds: Set<string>;
  onAcknowledge: (action: CourseCheckIssueAction) => void;
  onExclude: (itemIds: string[]) => void;
}) {
  return (
    <div className="course-check-issue-actions" aria-label="Issue actions">
      {actions.map((action) => {
        if (action.target.type === "route") {
          return (
            <a
              key={action.id}
              className="btn btn-secondary btn-sm"
              href={repairHref(action.target.href, context.returnPath)}
              data-issue-action-id={action.id}
              onClick={() =>
                saveCourseCheckReturnContext(planId, {
                  ...context,
                  focusActionId: action.id,
                })
              }
            >
              {action.label}
            </a>
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
              {action.label}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}
