import type { CourseCheckIssueAction } from "../../shared/course-check-actions";
import {
  repairHref,
  saveCourseCheckReturnContext,
  type CourseCheckReturnContext,
} from "./useCourseCheckReturnContext";

export function IssueActions({
  planId,
  actions,
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
          return acknowledged ? (
            <p key={action.id} className="course-check-action-result" role="status">
              Acknowledged: {action.resultingEffectSummary}
            </p>
          ) : (
            <button
              key={action.id}
              type="button"
              className="btn btn-secondary btn-sm"
              data-issue-action-id={action.id}
              onClick={() => onAcknowledge(action)}
            >
              {action.label}
            </button>
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
