export interface CommunicationTemplateValues {
  speakerName: string;
  proposalTitle: string;
  eventName: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCommunicationTemplate(
  template: string,
  values: CommunicationTemplateValues,
  options: { html?: boolean } = {},
): string {
  const safe = (value: string) => (options.html ? escapeHtml(value) : value);
  const substitutions: Record<string, string> = {
    speaker_name: safe(values.speakerName),
    proposal_title: safe(values.proposalTitle),
    event_name: safe(values.eventName),
  };
  return template.replace(
    /\{\{\s*(speaker_name|proposal_title|event_name)\s*\}\}/g,
    (_match, key: string) => substitutions[key] ?? "",
  );
}
