import { describe, expect, it } from "vitest";

import {
  addQuestion,
  canonicalizeCfpDefinition,
  createDefaultCfpDefinition,
  describeCondition,
  moveQuestion,
  parseVisibleIf,
  removeQuestion,
  setQuestionCondition,
  updateQuestion,
  validateCfpDefinition,
} from "../../shared/cfp-definition";

function sampleDefinition() {
  return createDefaultCfpDefinition({
    definitionId: "lightning-cfp",
    eventId: "pacific-open-data-summit-2026",
    trackChoices: [{ value: "platform", text: "Platform" }],
  });
}

describe("canonical CFP definition", () => {
  it("round-trips create and edit on one envelope without a second schema", () => {
    const definition = sampleDefinition();
    const updated = updateQuestion(definition, "title", { title: "Lightning title" });
    expect(updated.runtime.survey.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", title: "Lightning title" }),
      ]),
    );
    expect(validateCfpDefinition(updated)).toEqual([]);
    expect(updated.schemaVersion).toBe(1);
    expect(updated.runtime.engine).toBe("surveyjs");
    expect(updated.chartstead.template).toBe("standard-cfp");
  });

  it("describes conditions in plain language from the canonical envelope", () => {
    const definition = sampleDefinition();
    const workshop = definition.runtime.survey.elements.find(
      (element) => element.name === "workshopDuration",
    );
    expect(workshop && "visibleIf" in workshop ? workshop.visibleIf : null).toBe(
      '{sessionFormat} = "workshop"',
    );
    const condition = parseVisibleIf(
      workshop && "visibleIf" in workshop ? workshop.visibleIf! : "",
    );
    expect(condition).toEqual({ fieldName: "sessionFormat", equals: "workshop" });
    expect(describeCondition(condition!, definition)).toBe(
      "Show when Session format is Workshop",
    );
  });

  it("includes protected fields, co-speakers, conditions, links, and files", () => {
    const definition = sampleDefinition();
    const elements = definition.runtime.survey.elements;

    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", type: "text" }),
        expect.objectContaining({
          name: "workshopDuration",
          visibleIf: '{sessionFormat} = "workshop"',
        }),
        expect.objectContaining({
          name: "speakers",
          type: "paneldynamic",
          panelAddText: "Add co-speaker",
          minPanelCount: 1,
        }),
        expect.objectContaining({ name: "supportingLink", type: "text" }),
        expect.objectContaining({ name: "supportingFile", type: "chartstead-file" }),
      ]),
    );
    expect(definition.chartstead.uploadQuestionNames).toContain("supportingFile");
  });

  it("rejects invalid canonical definitions", () => {
    const definition = sampleDefinition();
    definition.runtime.survey.elements = definition.runtime.survey.elements.filter(
      (element) => element.name !== "title",
    );
    expect(validateCfpDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining("title")]),
    );
  });

  it("reconstructs organizer-supplied welcome HTML from escaped text", () => {
    const definition = sampleDefinition();
    const welcome = definition.runtime.survey.elements.find(
      (element) => element.type === "html" && element.name === "welcome",
    );
    if (!welcome || welcome.type !== "html") throw new Error("Missing welcome");
    welcome.html =
      '<div class="cfp-welcome"><h2><img src=x onerror=alert(1)></h2><p>Hello<script>alert(2)</script></p></div>';

    const canonical = canonicalizeCfpDefinition(definition);

    expect(canonical).not.toHaveProperty("errors");
    if ("errors" in canonical) return;
    const canonicalWelcome = canonical.runtime.survey.elements.find(
      (element) => element.type === "html" && element.name === "welcome",
    );
    expect(canonicalWelcome).toMatchObject({ type: "html", name: "welcome" });
    expect(canonicalWelcome && "html" in canonicalWelcome ? canonicalWelcome.html : "")
      .toBe(
        '<div class="cfp-welcome"><h2>&lt;img src=x onerror=alert(1)&gt;</h2><p>Hello&lt;script&gt;alert(2)&lt;/script&gt;</p></div>',
      );
  });

  it("adds moves and removes custom questions without touching protected names", () => {
    const definition = sampleDefinition();
    const withCustom = addQuestion(definition, {
      type: "text",
      name: "customQuestion1",
      title: "Extra detail",
      maxLength: 120,
    });
    expect(withCustom.runtime.survey.elements.at(-1)).toEqual(
      expect.objectContaining({ name: "customQuestion1", title: "Extra detail" }),
    );

    const movedUp = moveQuestion(withCustom, "customQuestion1", "up");
    const names = movedUp.runtime.survey.elements.map((element) => element.name);
    expect(names.indexOf("customQuestion1")).toBeLessThan(
      names.indexOf("supportingFile"),
    );

    expect(removeQuestion(withCustom, "title").runtime.survey.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "title" })]),
    );
    expect(
      removeQuestion(withCustom, "customQuestion1").runtime.survey.elements.find(
        (element) => element.name === "customQuestion1",
      ),
    ).toBeUndefined();
  });

  it("stores sentence conditions without exposing builder-facing SurveyJS vocabulary", () => {
    const definition = sampleDefinition();
    const conditioned = setQuestionCondition(definition, "supportingLink", {
      fieldName: "sessionFormat",
      equals: "workshop",
    });
    const link = conditioned.runtime.survey.elements.find(
      (element) => element.name === "supportingLink",
    );
    expect(link && "visibleIf" in link ? link.visibleIf : null).toBe(
      '{sessionFormat} = "workshop"',
    );
    expect(
      describeCondition({ fieldName: "sessionFormat", equals: "workshop" }, conditioned),
    ).toBe("Show when Session format is Workshop");
    const cleared = setQuestionCondition(conditioned, "supportingLink", null);
    const clearedLink = cleared.runtime.survey.elements.find(
      (element) => element.name === "supportingLink",
    );
    expect(
      clearedLink && "visibleIf" in clearedLink ? clearedLink.visibleIf : undefined,
    ).toBeUndefined();
  });
});
