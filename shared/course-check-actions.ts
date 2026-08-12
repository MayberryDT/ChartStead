/** Stable, viewer-safe actions attached to an authoritative Course Check issue. */
export type CourseCheckIssueActionKind =
  | "inline_repair"
  | "deep_repair"
  | "alternate_effect"
  | "acknowledge"
  | "exclude";

export type CourseCheckIssueActionTarget =
  | {
      type: "route";
      href: string;
      objectType: "proposal" | "speaker" | "session" | "communication" | "integration";
      objectId: string;
      field: string | null;
    }
  | {
      type: "command";
      command:
        | "acknowledge_warning"
        | "defer_items"
        | "select_template"
        | "include_recipients"
        | "exclude_recipients";
      itemIds: string[];
    };

export interface CourseCheckIssueAction {
  /** Deterministic within a plan version; contains no private value. */
  id: string;
  label: string;
  kind: CourseCheckIssueActionKind;
  target: CourseCheckIssueActionTarget;
  /** Stable business entity ids only; never email addresses or other personal fields. */
  affectedEntityIds: string[];
  resultingEffectSummary: string;
}

export interface CourseCheckChangedInput {
  label: string;
  affectedEntityIds: string[];
  target: Extract<CourseCheckIssueActionTarget, { type: "route" }> | null;
}

export interface CourseCheckRevalidationSummary {
  scope: "affected_dependencies";
  affectedItemIds: string[];
  changedInputs: CourseCheckChangedInput[];
  preservedStageIds: string[];
}
