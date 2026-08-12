export type CourseCheckValidationScenarioId =
  | "clean-20"
  | "missing-contact"
  | "recipient-ambiguity"
  | "mixed-eligible-skipped"
  | "stale-recheck"
  | "outcome-comprehension";

export interface CourseCheckValidationScenario {
  id: CourseCheckValidationScenarioId;
  label: string;
  taskPrompt: string;
  fixture: {
    selectedCount: number;
    issueClasses: Array<
      "needs_action" | "check" | "details" | "could_not_check"
    >;
    sharedAddressCount: number;
    priorMessageCount: number;
    staleInputCount: number;
  };
  expectedTruth: {
    decisionsChanged: number;
    recordsCreated: number | "assert_positive";
    draftsPresent: number | "assert_positive";
    itemsUnchanged: number;
    externalMessagesSent: number;
  };
  evidenceClass: "seeded_automated_behavior_not_human_usability";
}

export const COURSE_CHECK_VALIDATION_SCENARIOS: CourseCheckValidationScenario[] = [
  {
    id: "clean-20",
    label: "Clean 20-item batch",
    taskPrompt: "Accept 20 proposals with no issues and explain the result before confirming.",
    fixture: {
      selectedCount: 20,
      issueClasses: [],
      sharedAddressCount: 0,
      priorMessageCount: 0,
      staleInputCount: 0,
    },
    expectedTruth: {
      decisionsChanged: 20,
      recordsCreated: "assert_positive",
      draftsPresent: 0,
      itemsUnchanged: 0,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
  {
    id: "missing-contact",
    label: "One missing contact",
    taskPrompt: "Accept the valid proposals while handling one speaker with no email.",
    fixture: {
      selectedCount: 10,
      issueClasses: ["needs_action"],
      sharedAddressCount: 0,
      priorMessageCount: 0,
      staleInputCount: 0,
    },
    expectedTruth: {
      decisionsChanged: 9,
      recordsCreated: "assert_positive",
      draftsPresent: 0,
      itemsUnchanged: 1,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
  {
    id: "recipient-ambiguity",
    label: "Shared address and prior message",
    taskPrompt: "Prepare messages for co-speakers who share an address and already have one acceptance message.",
    fixture: {
      selectedCount: 2,
      issueClasses: ["check", "details"],
      sharedAddressCount: 1,
      priorMessageCount: 1,
      staleInputCount: 0,
    },
    expectedTruth: {
      decisionsChanged: 0,
      recordsCreated: 0,
      draftsPresent: "assert_positive",
      itemsUnchanged: 0,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
  {
    id: "mixed-eligible-skipped",
    label: "Mixed eligible and skipped outcomes",
    taskPrompt: "Apply the eligible decisions and leave two blocked submissions unchanged.",
    fixture: {
      selectedCount: 8,
      issueClasses: ["needs_action", "check"],
      sharedAddressCount: 0,
      priorMessageCount: 0,
      staleInputCount: 0,
    },
    expectedTruth: {
      decisionsChanged: 6,
      recordsCreated: "assert_positive",
      draftsPresent: 0,
      itemsUnchanged: 2,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
  {
    id: "stale-recheck",
    label: "Relevant data changed",
    taskPrompt: "Respond when a speaker record changes after the review was prepared.",
    fixture: {
      selectedCount: 1,
      issueClasses: ["could_not_check"],
      sharedAddressCount: 0,
      priorMessageCount: 0,
      staleInputCount: 1,
    },
    expectedTruth: {
      decisionsChanged: 0,
      recordsCreated: 0,
      draftsPresent: 0,
      itemsUnchanged: 1,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
  {
    id: "outcome-comprehension",
    label: "Post-completion outcome check",
    taskPrompt: "Explain what decisions changed, which records and drafts exist, and whether any message was sent.",
    fixture: {
      selectedCount: 4,
      issueClasses: [],
      sharedAddressCount: 0,
      priorMessageCount: 0,
      staleInputCount: 0,
    },
    expectedTruth: {
      decisionsChanged: 4,
      recordsCreated: "assert_positive",
      draftsPresent: "assert_positive",
      itemsUnchanged: 0,
      externalMessagesSent: 0,
    },
    evidenceClass: "seeded_automated_behavior_not_human_usability",
  },
];
