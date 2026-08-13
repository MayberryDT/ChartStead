import type { SpeakerSocialLinks } from "./events";

export const EMPTY_SPEAKER_SOCIAL_LINKS: SpeakerSocialLinks = {
  linkedin: "",
  x: "",
  github: "",
  website: "",
};

const SOCIAL_LINK_KEYS = ["linkedin", "x", "github", "website"] as const;
const SOCIAL_LINK_MAX_LENGTH = 500;

export function normalizeSpeakerSocialLinks(input: unknown):
  | { ok: true; value: SpeakerSocialLinks }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Social links must be an object." };
  }

  const record = input as Record<string, unknown>;
  const value = { ...EMPTY_SPEAKER_SOCIAL_LINKS };
  for (const key of SOCIAL_LINK_KEYS) {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string") {
      return { ok: false, error: "Social links must contain text URLs." };
    }
    const url = raw.trim();
    if (url.length > SOCIAL_LINK_MAX_LENGTH) {
      return { ok: false, error: "Social links must be 500 characters or fewer." };
    }
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Social links must be valid URLs." };
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return { ok: false, error: "Social links must use HTTPS without embedded credentials." };
    }
    value[key] = url;
  }

  return { ok: true, value };
}

export function parseStoredSpeakerSocialLinks(value: string | null | undefined): SpeakerSocialLinks {
  if (!value) return { ...EMPTY_SPEAKER_SOCIAL_LINKS };
  try {
    const parsed = normalizeSpeakerSocialLinks(JSON.parse(value));
    return parsed.ok ? parsed.value : { ...EMPTY_SPEAKER_SOCIAL_LINKS };
  } catch {
    return { ...EMPTY_SPEAKER_SOCIAL_LINKS };
  }
}

export function serializeSpeakerSocialLinks(value: SpeakerSocialLinks): string {
  return JSON.stringify(value);
}
