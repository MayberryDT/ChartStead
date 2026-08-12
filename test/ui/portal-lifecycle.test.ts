import { describe, expect, it } from "vitest";

import {
  auditEventLabel,
  toPortalFacingDeliveryStatus,
} from "../../shared/portal-lifecycle";

describe("portal lifecycle projections", () => {
  it("maps effect ledger statuses to independent facing vocabulary", () => {
    expect(toPortalFacingDeliveryStatus(null)).toBe("draft");
    expect(toPortalFacingDeliveryStatus(undefined)).toBe("draft");
    expect(toPortalFacingDeliveryStatus("queued")).toBe("queued");
    expect(toPortalFacingDeliveryStatus("retry_scheduled")).toBe("queued");
    expect(toPortalFacingDeliveryStatus("sending")).toBe("sent");
    expect(toPortalFacingDeliveryStatus("succeeded")).toBe("delivered");
    expect(toPortalFacingDeliveryStatus("permanent_failure")).toBe("failed");
    expect(toPortalFacingDeliveryStatus("exhausted")).toBe("failed");
    expect(toPortalFacingDeliveryStatus("unknown")).toBe("failed");
  });

  it("labels organizer audit types for decision vs communication stages", () => {
    expect(auditEventLabel("proposal.review.changed", "approve")).toContain(
      "internal review",
    );
    expect(
      auditEventLabel("course_check.decision.applied", "accepted"),
    ).toContain("final outcome");
    expect(
      auditEventLabel("course_check.communication.drafts_created", "2 drafts frozen"),
    ).toContain("froze communication drafts");
    expect(
      auditEventLabel("course_check.communication.send_started", "3 effects"),
    ).toContain("started message delivery");
  });
});
