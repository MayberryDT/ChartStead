import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CfpDefinitionV1,
  PublishedCfpForm,
  SubmissionAnswers,
} from "../../shared/events";
import { CfpRuntime } from "../../src/CfpRuntime";

afterEach(() => {
  cleanup();
});

function conditionalForm(): PublishedCfpForm {
  const definition: CfpDefinitionV1 = {
    schemaVersion: 1,
    definitionId: "conditional-cfp",
    definitionVersion: 1,
    eventId: "pacific-open-data-summit-2026",
    status: "published",
    opensAt: null,
    closesAt: null,
    runtime: {
      engine: "surveyjs",
      engineMajor: 2,
      survey: {
        showTitle: false,
        showQuestionNumbers: "off",
        checkErrorsMode: "onComplete",
        textUpdateMode: "onTyping",
        questionErrorLocation: "bottom",
        completeText: "Submit proposal",
        requiredMark: "*",
        elements: [
          {
            type: "dropdown",
            name: "sessionFormat",
            title: "Session format",
            choices: [
              { value: "talk", text: "Talk" },
              { value: "workshop", text: "Workshop" },
            ],
          },
          {
            type: "text",
            name: "workshopDuration",
            title: "Workshop duration",
            isRequired: true,
            visibleIf: '{sessionFormat} = "workshop"',
          },
        ],
      },
    },
    chartstead: {
      template: "standard-cfp",
      protectedNames: [],
      proposalTitleName: "title",
      trackQuestionName: "trackId",
      speakerPanelName: "speakers",
      uploadQuestionNames: [],
    },
  };

  return {
    id: "conditional-cfp",
    name: "Conditional CFP",
    status: "published",
    definitionVersion: 1,
    definition,
    publishedAt: "2026-08-01T00:00:00.000Z",
  };
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  question: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: question }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("CFP conditional runtime", () => {
  it.each(["preview", "public"] as const)(
    "updates conditional visibility and clears stale answers in %s mode",
    async (mode) => {
      const user = userEvent.setup();
      const submitted: SubmissionAnswers[] = [];
      render(
        <CfpRuntime
          eventId="pacific-open-data-summit-2026"
          form={conditionalForm()}
          mode={mode}
          initialAnswers={{
            sessionFormat: "talk",
            workshopDuration: "stale value from a previous selection",
          }}
          onSubmit={
            mode === "public"
              ? async (answers) => {
                  submitted.push(answers);
                  return { id: "proposal-1" };
                }
              : undefined
          }
        />,
      );

      const format = screen.getByRole("combobox", { name: "Session format" });
      expect(
        screen.queryByRole("textbox", { name: "Workshop duration" }),
      ).not.toBeInTheDocument();

      await chooseOption(user, "Session format", "Workshop");
      const duration = await screen.findByRole("textbox", {
        name: "Workshop duration",
      });
      expect(duration).toHaveValue("");
      await user.type(duration, "90 minutes");

      await chooseOption(user, "Session format", "Talk");
      expect(
        screen.queryByRole("textbox", { name: "Workshop duration" }),
      ).not.toBeInTheDocument();

      await chooseOption(user, "Session format", "Workshop");
      expect(
        await screen.findByRole("textbox", { name: "Workshop duration" }),
      ).toHaveValue("");

      if (mode === "public") {
        await chooseOption(user, "Session format", "Talk");
        await user.click(screen.getByRole("button", { name: "Submit proposal" }));
        await waitFor(() => expect(submitted).toHaveLength(1));
        expect(submitted[0]).toEqual({ sessionFormat: "talk" });
      }
    },
  );

  it("does not block a public submission on a hidden required field", async () => {
    const user = userEvent.setup();
    const submitted: SubmissionAnswers[] = [];
    render(
      <CfpRuntime
        eventId="pacific-open-data-summit-2026"
        form={conditionalForm()}
        mode="public"
        onSubmit={async (answers) => {
          submitted.push(answers);
          return { id: "proposal-1" };
        }}
      />,
    );

    await chooseOption(user, "Session format", "Talk");
    await user.click(screen.getByRole("button", { name: "Submit proposal" }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toEqual({ sessionFormat: "talk" });
  });

  it("saves a draft without running final submission validation", async () => {
    const user = userEvent.setup();
    const saved = vi.fn(async (answers: SubmissionAnswers) => ({
      id: "DRF-UNIT",
      eventId: "pacific-open-data-summit-2026",
      title: "Draft",
      formId: "conditional-cfp",
      formName: "Conditional CFP",
      formDefinitionVersion: 1,
      latestFormDefinitionVersion: 1,
      formVersionStale: false,
      lifecycle: {
        state: "open" as const,
        reason: "open" as const,
        opensAt: null,
        closesAt: null,
        deadlineAt: null,
        timezone: "UTC",
        evaluatedAt: "2026-08-12T00:00:00.000Z",
      },
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      answers,
    }));
    const submitted = vi.fn(async () => ({ id: "proposal-unit" }));
    render(
      <CfpRuntime
        eventId="pacific-open-data-summit-2026"
        form={conditionalForm()}
        mode="public"
        onSaveDraft={saved}
        onSubmit={submitted}
      />,
    );

    await chooseOption(user, "Session format", "Workshop");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]?.[0]).toEqual({ sessionFormat: "workshop" });
    expect(submitted).not.toHaveBeenCalled();
    expect(await screen.findByText(/Draft saved/)).toBeVisible();
  });

});
