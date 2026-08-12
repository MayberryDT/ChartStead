import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";

const { emitCourseCheckUxEvent } = vi.hoisted(() => ({
  emitCourseCheckUxEvent: vi.fn(),
}));
vi.mock("../../src/api", () => ({ emitCourseCheckUxEvent }));

import { useCourseCheckUxInstrumentation } from "../../src/course-check/useCourseCheckUxInstrumentation";

const plan = {
  id: "plan-instrumentation",
  body: { actionType: "decision" },
  decisionReview: {
    issues: [{ classification: "needs_action" }],
  },
} as unknown as CourseCheckPlan;

function Harness() {
  const { track } = useCourseCheckUxInstrumentation("event-1", plan);
  return (
    <button
      type="button"
      data-issue-action-id="issue-1"
      onClick={() =>
        track({
          eventType: "issue_action",
          issueAction: "acknowledge",
          affectedCount: 1,
          outcome: "acknowledged",
        })
      }
    >
      Acknowledge issue
    </button>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  emitCourseCheckUxEvent.mockReset();
});

afterEach(() => cleanup());

describe("Course Check UX instrumentation hook", () => {
  it("never blocks operation when instrumentation fails and emits no personal payload", async () => {
    emitCourseCheckUxEvent.mockRejectedValue(new Error("telemetry unavailable"));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Acknowledge issue" }));
    expect(screen.getByRole("button", { name: "Acknowledge issue" })).toBeEnabled();
    await waitFor(() => expect(emitCourseCheckUxEvent).toHaveBeenCalled());

    for (const call of emitCourseCheckUxEvent.mock.calls) {
      const event = call[1] as Record<string, unknown>;
      expect(event).not.toHaveProperty("email");
      expect(event).not.toHaveProperty("speakerName");
      expect(event).not.toHaveProperty("messageBody");
      expect(event).not.toHaveProperty("credentials");
      expect(event).not.toHaveProperty("signedLink");
    }
  });

  it("records abandoned and resumed journeys using the same stable journey id", async () => {
    emitCourseCheckUxEvent.mockResolvedValue(undefined);
    const first = render(<Harness />);
    await waitFor(() =>
      expect(
        emitCourseCheckUxEvent.mock.calls.some(
          (call) => call[1].eventType === "journey_started",
        ),
      ).toBe(true),
    );
    const started = emitCourseCheckUxEvent.mock.calls.find(
      (call) => call[1].eventType === "journey_started",
    )![1];

    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() =>
      expect(
        emitCourseCheckUxEvent.mock.calls.some(
          (call) => call[1].eventType === "journey_abandoned",
        ),
      ).toBe(true),
    );
    first.unmount();
    render(<Harness />);
    await waitFor(() =>
      expect(
        emitCourseCheckUxEvent.mock.calls.some(
          (call) => call[1].eventType === "journey_resumed",
        ),
      ).toBe(true),
    );
    const resumed = emitCourseCheckUxEvent.mock.calls.find(
      (call) => call[1].eventType === "journey_resumed",
    )![1];
    expect(resumed.journeyId).toBe(started.journeyId);
  });
});
