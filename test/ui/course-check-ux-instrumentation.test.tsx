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
    issues: [{ classification: "needs_action", affectedItemCount: 2 }],
  },
} as unknown as CourseCheckPlan;

function Harness({ planOverride = plan }: { planOverride?: CourseCheckPlan }) {
  const { track } = useCourseCheckUxInstrumentation("event-1", planOverride);
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

    expect(
      emitCourseCheckUxEvent.mock.calls.find(
        (call) => call[1].eventType === "issues_shown",
      )?.[1],
    ).toMatchObject({ issueClass: "needs_action", issueCount: 1, affectedCount: 2 });

    for (const call of emitCourseCheckUxEvent.mock.calls) {
      const event = call[1] as Record<string, unknown>;
      expect(event).not.toHaveProperty("email");
      expect(event).not.toHaveProperty("speakerName");
      expect(event).not.toHaveProperty("messageBody");
      expect(event).not.toHaveProperty("credentials");
      expect(event).not.toHaveProperty("signedLink");
    }
  });

  it("does not misclassify a plan refresh as a resumed journey", async () => {
    emitCourseCheckUxEvent.mockResolvedValue(undefined);
    const view = render(<Harness />);
    await waitFor(() =>
      expect(
        emitCourseCheckUxEvent.mock.calls.some(
          (call) => call[1].eventType === "journey_started",
        ),
      ).toBe(true),
    );

    view.rerender(<Harness planOverride={{ ...plan }} />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      emitCourseCheckUxEvent.mock.calls.filter(
        (call) => call[1].eventType === "journey_resumed",
      ),
    ).toHaveLength(0);
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
