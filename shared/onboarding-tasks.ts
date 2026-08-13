import type { OnboardingFileConstraints } from "./events";

export const SPEAKER_TASK_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const SPEAKER_HEADSHOT_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const GENERIC_FILE_CONSTRAINTS: OnboardingFileConstraints = {
  maxBytes: SPEAKER_TASK_FILE_MAX_BYTES,
  acceptMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    ...IMAGE_MIME_TYPES,
  ],
  acceptExtensions: [
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".zip",
    ...IMAGE_EXTENSIONS,
  ],
};

const SLIDE_FILE_CONSTRAINTS: OnboardingFileConstraints = {
  maxBytes: SPEAKER_TASK_FILE_MAX_BYTES,
  acceptMimeTypes: [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  acceptExtensions: [".pdf", ".ppt", ".pptx"],
};

const EMPLOYER_APPROVAL_CONSTRAINTS: OnboardingFileConstraints = {
  maxBytes: SPEAKER_TASK_FILE_MAX_BYTES,
  acceptMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ...IMAGE_MIME_TYPES,
  ],
  acceptExtensions: [".pdf", ".doc", ".docx", ...IMAGE_EXTENSIONS],
};

const HEADSHOT_FILE_CONSTRAINTS: OnboardingFileConstraints = {
  maxBytes: SPEAKER_HEADSHOT_MAX_BYTES,
  acceptMimeTypes: [...IMAGE_MIME_TYPES],
  acceptExtensions: [...IMAGE_EXTENSIONS],
};

function cloneConstraints(
  constraints: OnboardingFileConstraints,
): OnboardingFileConstraints {
  return {
    maxBytes: constraints.maxBytes,
    acceptMimeTypes: [...constraints.acceptMimeTypes],
    acceptExtensions: [...constraints.acceptExtensions],
  };
}

/** The documented speaker-upload policy shared by the portal and worker. */
export function resolveOnboardingFileConstraints(
  kind: string,
): OnboardingFileConstraints {
  if (kind === "headshot") return cloneConstraints(HEADSHOT_FILE_CONSTRAINTS);
  if (kind === "slides") return cloneConstraints(SLIDE_FILE_CONSTRAINTS);
  if (kind === "employer_approval") {
    return cloneConstraints(EMPLOYER_APPROVAL_CONSTRAINTS);
  }
  return cloneConstraints(GENERIC_FILE_CONSTRAINTS);
}

export function fileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = baseName.lastIndexOf(".");
  return dot >= 0 ? baseName.slice(dot).toLowerCase() : "";
}

export function isPreviewableOnboardingMime(mime: string): boolean {
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/")
  );
}

export function fileMatchesOnboardingConstraints(
  file: Pick<File, "name" | "type" | "size">,
  constraints: OnboardingFileConstraints,
): string | null {
  if (file.size > constraints.maxBytes) {
    return `Files must be ${formatFileSize(constraints.maxBytes)} or smaller.`;
  }
  if (!constraints.acceptMimeTypes.includes(file.type)) {
    return `Use one of these file types: ${constraints.acceptMimeTypes.join(", ")}.`;
  }
  if (!constraints.acceptExtensions.includes(fileExtension(file.name))) {
    return `Use one of these file extensions: ${constraints.acceptExtensions.join(", ")}.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index]!;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}
