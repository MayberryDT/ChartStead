import { beforeEach, describe, expect, it } from "vitest";

import {
  readCourseCheckReturnContext,
  repairHref,
  saveCourseCheckReturnContext,
} from "../../src/course-check/useCourseCheckReturnContext";

describe("Course Check repair return context", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips batch, filter, expansion, draft, scroll, and focus state", () => {
    const context = {
      returnPath: "/e/event-1/course-checks/plan-1",
      selectedItemIds: ["item-1", "item-2"],
      issueFilter: "blocker",
      expandedIssueIds: ["finding-1"],
      subject: "Draft subject",
      bodyText: "Draft body",
      selectedRecipientIds: ["recipient-1"],
      overrideReasons: { "finding-1": "Reviewed" },
      acknowledgedIssueIds: ["finding-2:acknowledge"],
      scrollY: 731,
      focusActionId: "finding-1:deep-repair",
    };

    saveCourseCheckReturnContext("plan-1", context);

    expect(readCourseCheckReturnContext("plan-1")).toEqual(context);
    expect(repairHref("/e/event-1/submissions/SUB-1?field=speakerEmail", context.returnPath)).toBe(
      "/e/event-1/submissions/SUB-1?field=speakerEmail&returnTo=%2Fe%2Fevent-1%2Fcourse-checks%2Fplan-1",
    );
  });
});
