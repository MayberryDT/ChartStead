import type { EventRecord, PublishedCfpForm } from "../shared/events";

export function createSeedCfp(event: EventRecord): PublishedCfpForm {
  return {
    id: "main-cfp",
    status: "published",
    definitionVersion: 1,
    publishedAt: "2026-08-09T00:00:00.000Z",
    definition: {
      showTitle: false,
      showQuestionNumbers: "off",
      checkErrorsMode: "onComplete",
      textUpdateMode: "onTyping",
      questionErrorLocation: "bottom",
      completeText: "Submit proposal",
      requiredMark: "*",
      elements: [
        {
          type: "text",
          name: "title",
          title: "Talk title",
          isRequired: true,
          requiredErrorText: "Enter a talk title.",
          maxLength: 160,
        },
        {
          type: "comment",
          name: "abstract",
          title: "Abstract",
          isRequired: true,
          requiredErrorText: "Enter an abstract.",
          maxLength: 5_000,
          rows: 6,
        },
        {
          type: "dropdown",
          name: "trackId",
          title: "Track",
          isRequired: true,
          requiredErrorText: "Choose a track.",
          choices: event.tracks.map((track) => ({
            value: track.id,
            text: track.name,
          })),
        },
        {
          type: "text",
          name: "speakerName",
          title: "Speaker name",
          isRequired: true,
          requiredErrorText: "Enter the speaker name.",
          maxLength: 120,
        },
        {
          type: "text",
          name: "speakerEmail",
          title: "Speaker email",
          inputType: "email",
          isRequired: true,
          requiredErrorText: "Enter an email address.",
          maxLength: 320,
          validators: [
            {
              type: "email",
              text: "Enter a valid email address.",
            },
          ],
        },
        {
          type: "comment",
          name: "biography",
          title: "Biography",
          isRequired: true,
          requiredErrorText: "Enter a short biography.",
          maxLength: 2_000,
          rows: 4,
        },
        {
          type: "text",
          name: "supportingLink",
          title: "Supporting link",
          description: "Optional. Use an http or https URL.",
          inputType: "url",
          maxLength: 2_048,
        },
      ],
    },
  };
}
